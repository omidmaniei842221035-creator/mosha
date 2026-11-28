/* Local neural Persian TTS worker. Model bytes are read only from this origin's IndexedDB. */
import * as ort from './ort.min.mjs';
import { createPiperPhonemize } from './piper-phonemize.mjs';
import { getStoredVoice } from './store.mjs';
import { createPiperWavBuffer, normalizePersianTtsText, pauseAfterPiperChunk, piperInputIds, validatePersianPiperConfig } from './core.mjs';

const VOICE_IDS = new Set(['fa_IR-amir-medium', 'fa_IR-gyro-medium']);
let phonemizerPromise = null;
let phonemizer = null;
let activeVoiceId = '';
let voiceConfig = null;
let inferenceSession = null;
let inferencePromise = null;

ort.env.wasm.wasmPaths = new URL('./', import.meta.url).href;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = 'error';

function postProgress(requestId, phase, done, total, message) {
  self.postMessage({ type: 'progress', requestId, phase, done, total, message });
}

async function loadPhonemizer() {
  if (phonemizer) return phonemizer;
  if (!phonemizerPromise) {
    phonemizerPromise = createPiperPhonemize({
      locateFile: name => {
        if (name.endsWith('.data')) return new URL('./piper_phonemize.data', import.meta.url).href;
        if (name.endsWith('.wasm')) return new URL('./piper_phonemize.wasm', import.meta.url).href;
        return new URL(name, import.meta.url).href;
      },
      print: line => {
        if (!activePhonemeRequest) return;
        let result;
        try { result = JSON.parse(String(line)); }
        catch (_) { return; }
        if (!result || !Array.isArray(result.phoneme_ids)) return;
        const current = activePhonemeRequest;
        activePhonemeRequest = null;
        current.resolve(result);
      },
      printErr: line => {
        const text = String(line || '').trim();
        if (text) lastPhonemeError = text.slice(0, 500);
      }
    }).then(module => {
      phonemizer = module;
      return module;
    }).catch(error => {
      phonemizerPromise = null;
      throw error;
    });
  }
  return phonemizerPromise;
}

let activePhonemeRequest = null;
let lastPhonemeError = '';

async function phonemizeText(text, config) {
  const module = await loadPhonemizer();
  if (activePhonemeRequest) throw new Error('موتور واج‌شناسی مشغول است.');
  lastPhonemeError = '';
  const result = new Promise((resolve, reject) => {
    activePhonemeRequest = { resolve, reject };
    try {
      module.callMain([
        '-l', config.espeak.voice,
        '--input', JSON.stringify([{ text }]),
        '--espeak_data', '/espeak-ng-data'
      ]);
    } catch (error) {
      activePhonemeRequest = null;
      reject(error);
    }
    if (activePhonemeRequest) {
      const pending = activePhonemeRequest;
      setTimeout(() => {
        if (activePhonemeRequest !== pending) return;
        activePhonemeRequest = null;
        pending.reject(new Error(lastPhonemeError || 'مدل آوایی نتوانست متن فارسی را پردازش کند.'));
      }, 12000);
    }
  });
  return result;
}

async function loadVoice(voiceId, requestId) {
  if (!VOICE_IDS.has(voiceId)) throw new Error('شناسهٔ صدای فارسی انتخاب‌شده پشتیبانی نمی‌شود.');
  if (activeVoiceId === voiceId && inferenceSession && voiceConfig) return;
  postProgress(requestId, 'model', 0, 1, 'در حال بازکردن مدل گفتار عصبی از حافظهٔ محلی…');
  const stored = await getStoredVoice(voiceId);
  if (!stored || !(stored.model instanceof Blob) || !stored.config) {
    throw new Error('مدل این صدا در دستگاه پیدا نشد؛ پیش از خواندن، آن را از داخل برنامه دریافت کنید.');
  }
  const normalized = validatePersianPiperConfig(stored.config);
  const modelBytes = new Uint8Array(await stored.model.arrayBuffer());
  if (!modelBytes.length) throw new Error('فایل مدل صدای محلی خالی است.');
  voiceConfig = { ...stored.config, audio: { ...stored.config.audio, sample_rate: normalized.sampleRate } };
  activeVoiceId = voiceId;
  postProgress(requestId, 'model', 0, 1, 'در حال آماده‌سازی مدل عصبی فارسی روی پردازندهٔ همین دستگاه…');
  inferencePromise = ort.InferenceSession.create(modelBytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
    intraOpNumThreads: 1,
    interOpNumThreads: 1
  });
  try {
    inferenceSession = await inferencePromise;
  } catch (error) {
    activeVoiceId = '';
    voiceConfig = null;
    inferencePromise = null;
    throw error;
  }
  inferencePromise = null;
}

async function inferChunk(text, rate) {
  const phonemes = await phonemizeText(text, voiceConfig);
  const ids = piperInputIds(phonemes);
  const map = voiceConfig.phoneme_id_map || {};
  const feeds = {
    input: new ort.Tensor('int64', ids, [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)])),
    scales: new ort.Tensor('float32', Float32Array.from([
      Number(voiceConfig.inference.noise_scale),
      Number(voiceConfig.inference.length_scale) / Math.max(0.75, Math.min(1.25, Number(rate) || 1)),
      Number(voiceConfig.inference.noise_w)
    ]))
  };
  if (Object.keys(voiceConfig.speaker_id_map || {}).length) {
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]));
  }
  const output = await inferenceSession.run(feeds);
  const audio = output && output.output && output.output.data;
  if (!audio || !audio.length) throw new Error('مدل فارسی برای این بخش صدای قابل پخش نساخت.');
  return { samples: audio, sampleRate: Number(voiceConfig.audio.sample_rate), phonemeCount: ids.length, mapSize: Object.keys(map).length };
}

async function synthesize(message) {
  const { requestId, voiceId, chunks, rate, pauseScale } = message;
  if (!Number.isSafeInteger(requestId) || !VOICE_IDS.has(voiceId) || !Array.isArray(chunks) || !chunks.length) {
    throw new Error('درخواست ساخت گفتار فارسی معتبر نیست.');
  }
  const cleanChunks = chunks.map(normalizePersianTtsText).filter(Boolean);
  if (!cleanChunks.length) throw new Error('متنی برای خواندن باقی نماند.');
  await loadVoice(voiceId, requestId);
  await loadPhonemizer();
  const audioChunks = [];
  let sampleRate = Number(voiceConfig.audio.sample_rate);
  for (let index = 0; index < cleanChunks.length; index++) {
    postProgress(requestId, 'reading', index, cleanChunks.length, `در حال ساخت بخش ${index + 1} از ${cleanChunks.length} با صدای عصبی محلی…`);
    const result = await inferChunk(cleanChunks[index], rate);
    sampleRate = result.sampleRate;
    audioChunks.push(result.samples);
  }
  const safePauseScale = Number.isFinite(Number(pauseScale)) ? Math.max(0.6, Math.min(1.8, Number(pauseScale))) : 1;
  const pausesMs = cleanChunks.slice(0, -1).map(chunk => Math.min(2600, Math.round(pauseAfterPiperChunk(chunk) * safePauseScale)));
  const wav = createPiperWavBuffer(audioChunks, sampleRate, pausesMs);
  postProgress(requestId, 'complete', cleanChunks.length, cleanChunks.length, 'ساخت صدای عصبی فارسی کامل شد.');
  self.postMessage({ type: 'complete', requestId, wav }, [wav]);
}

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type !== 'synthesize') return;
  synthesize(message).catch(error => {
    const requestId = message.requestId;
    self.postMessage({
      type: 'error',
      requestId,
      message: String(error && error.message ? error.message : 'ساخت صدای عصبی محلی ناموفق بود.').slice(0, 700)
    });
  });
});
