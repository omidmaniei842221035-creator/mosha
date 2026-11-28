/* Local tiny-ava v2 inference. ONNX Runtime and every model byte are same-origin/local after installation. */
import * as ort from '../piper/ort.min.mjs';
import { createPiperWavBuffer } from '../piper/core.mjs';
import {
  TINY_AVA_ASSETS,
  TINY_AVA_MODEL_ID,
  TINY_AVA_VERSION,
  TINY_AVA_VOICES,
  phonemizeTinyAvaSentence,
  segmentTinyAvaText
} from './core.mjs';
import { getStoredTinyAvaModel } from './store.mjs';

const SAMPLE_RATE = 24000;
const MAX_TOKENS = 512;
let encoderSession = null;
let decoderSession = null;
let ttsSession = null;
let loadPromise = null;

ort.env.wasm.wasmPaths = new URL('../piper/', import.meta.url).href;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = 'error';

function sendProgress(requestId, phase, done, total, message) {
  self.postMessage({ type: 'progress', requestId, phase, done, total, message });
}

async function createSession(blob, name) {
  if (!(blob instanceof Blob) || !blob.size) throw new Error(`فایل ${name} در حافظهٔ محلی خالی است.`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
    intraOpNumThreads: 1,
    interOpNumThreads: 1
  });
}

async function loadModel(requestId) {
  if (ttsSession && encoderSession && decoderSession) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    sendProgress(requestId, 'model', 0, 1, 'در حال بازکردن مدل tiny-ava از حافظهٔ محلی…');
    const stored = await getStoredTinyAvaModel();
    if (!stored || stored.version !== TINY_AVA_VERSION || Number(stored.bytes) !== TINY_AVA_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0)) {
      throw new Error('بستهٔ مدل tiny-ava در این مرورگر پیدا نشد یا ناقص است؛ یک‌بار دریافت مدل را انجام دهید.');
    }
    const expectedHashes = Object.fromEntries(TINY_AVA_ASSETS.map(asset => [asset.id, asset.sha256]));
    if (!stored.assetSha256 || TINY_AVA_ASSETS.some(asset => stored.assetSha256[asset.id] !== expectedHashes[asset.id])) {
      throw new Error('نسخهٔ ذخیره‌شدهٔ tiny-ava با این برنامه هم‌خوان نیست؛ مدل را حذف و دوباره دریافت کنید.');
    }
    sendProgress(requestId, 'model', 0, 1, 'در حال آماده‌سازی مدل گفتار و واج‌شناس فارسی روی CPU همین دستگاه…');
    const [nextTts, nextEncoder, nextDecoder] = await Promise.all([
      createSession(stored.tts, 'گفتار'),
      createSession(stored.g2pEncoder, 'واج‌شناس، بخش یک'),
      createSession(stored.g2pDecoder, 'واج‌شناس، بخش دو')
    ]);
    ttsSession = nextTts;
    encoderSession = nextEncoder;
    decoderSession = nextDecoder;
  })();
  try {
    await loadPromise;
  } catch (error) {
    encoderSession = null;
    decoderSession = null;
    ttsSession = null;
    throw error;
  } finally {
    loadPromise = null;
  }
}

function limitPeak(wave) {
  let peak = 0;
  for (let index = 0; index < wave.length; index++) peak = Math.max(peak, Math.abs(wave[index]));
  if (!Number.isFinite(peak) || peak <= 0.99) return wave;
  const scale = 0.99 / peak;
  const output = new Float32Array(wave.length);
  for (let index = 0; index < wave.length; index++) output[index] = wave[index] * scale;
  return output;
}

function clamp(value, minimum, maximum, fallback = 0) {
  const numeric = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(numeric) ? numeric : fallback));
}

function createBreathWave(durationMs, seed) {
  const sampleCount = Math.max(1, Math.round(SAMPLE_RATE * clamp(durationMs, 120, 550, 230) / 1000));
  const wave = new Float32Array(sampleCount);
  let randomState = (Number(seed) >>> 0) || 0x6d2b79f5;
  let lowPass = 0;
  let smoothed = 0;
  for (let index = 0; index < sampleCount; index++) {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    const noise = (randomState >>> 0) / 0xffffffff * 2 - 1;
    lowPass += 0.035 * (noise - lowPass);
    const highPassed = noise - lowPass;
    smoothed += 0.42 * (highPassed - smoothed);
    const position = sampleCount < 2 ? 0.5 : index / (sampleCount - 1);
    const attack = Math.min(1, position / 0.13);
    const release = Math.min(1, (1 - position) / 0.28);
    const envelope = Math.max(0, Math.min(attack, release)) * (0.62 + 0.38 * Math.sin(Math.PI * position));
    const softModulation = 0.88 + 0.12 * Math.sin(position * Math.PI * 3);
    wave[index] = smoothed * envelope * softModulation * 0.035;
  }
  return wave;
}

async function synthesize(message) {
  const { requestId, voiceId, settings } = message;
  const selectedVoice = TINY_AVA_VOICES[voiceId];
  const text = typeof message.text === 'string'
    ? message.text
    : Array.isArray(message.chunks) ? message.chunks.join('\n') : '';
  if (!Number.isSafeInteger(requestId) || !selectedVoice || !text.trim()) {
    throw new Error('درخواست گفتار tiny-ava معتبر نیست.');
  }
  await loadModel(requestId);
  const segments = segmentTinyAvaText(text, 180);
  if (!segments.length) throw new Error('متنی برای خواندن باقی نماند.');
  const speed = clamp(settings && settings.speed, 0.7, 1.4, 1);
  const pitchShift = clamp(settings && settings.pitchShift, -0.25, 0.25, 0);
  const pitchRange = clamp(settings && settings.pitchRange, 0.7, 1.4, 1.05);
  const pauseScale = clamp(settings && settings.pauseScale, 0.6, 1.8, 1);
  const rendered = [];

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    sendProgress(requestId, 'reading', index, segments.length,
      segment.type === 'breath'
        ? `در حال افزودن مکث تنفسی نرم، بخش ${index + 1} از ${segments.length}…`
        : `در حال ساخت بخش ${index + 1} از ${segments.length} با صدای ${selectedVoice.title}…`);
    if (segment.type === 'breath') {
      rendered.push({ wave: createBreathWave(segment.durationMs, requestId + index), pauseAfterMs: segment.pauseAfterMs });
      continue;
    }
    const hasFollowing = segments.slice(index + 1).some(item => item.type === 'speech');
    const hasHardEnding = /[.!?؟…]["')\]»”’}]*$/u.test(segment.text);
    const phonemes = await phonemizeTinyAvaSentence(segment.text, encoderSession, decoderSession, ort, {
      continuation: hasFollowing && !hasHardEnding
    });
    if (!phonemes) continue;
    if (phonemes.ids.length > MAX_TOKENS) throw new Error('یک جمله از حد پشتیبانی مدل طولانی‌تر است؛ آن را کوتاه‌تر کنید.');
    const tokenCount = phonemes.ids.length;
    const output = await ttsSession.run({
      tokens: new ort.Tensor('int64', BigInt64Array.from(phonemes.ids.map(BigInt)), [1, tokenCount]),
      stress: new ort.Tensor('int64', BigInt64Array.from(phonemes.stress.map(BigInt)), [1, tokenCount]),
      voice: new ort.Tensor('int64', BigInt64Array.from([BigInt(selectedVoice.modelIndex)]), [1]),
      speed: new ort.Tensor('float32', Float32Array.from([clamp(speed * (Number(segment.speedScale) || 1), 0.7, 1.4, speed)]), [1]),
      pitch_shift: new ort.Tensor('float32', Float32Array.from([clamp(pitchShift + (Number(segment.pitchShiftOffset) || 0), -0.25, 0.25, pitchShift)]), [1]),
      pitch_range: new ort.Tensor('float32', Float32Array.from([clamp(pitchRange * (Number(segment.pitchRangeScale) || 1), 0.7, 1.4, pitchRange)]), [1])
    });
    const audio = output && output.audio && output.audio.data;
    if (!audio || !audio.length) throw new Error('مدل tiny-ava برای این بخش صدای قابل پخش نساخت.');
    rendered.push({ wave: limitPeak(audio), pauseAfterMs: segment.pauseAfterMs });
  }

  if (!rendered.length) throw new Error('واج‌شناس برای این متن گفتاری تولید نکرد؛ متن فارسی یا حرکت‌گذاری را بررسی کنید.');
  const waves = [];
  const pausesMs = [];
  const leadingPauseMs = Number(segments[0].pauseBeforeMs) || 0;
  if (leadingPauseMs > 0) {
    waves.push(new Float32Array(Math.round(SAMPLE_RATE * clamp(leadingPauseMs * pauseScale, 0, 2600, 0) / 1000)));
    pausesMs.push(0);
  }
  rendered.forEach((item, index) => {
    waves.push(item.wave);
    if (index < rendered.length - 1) {
      pausesMs.push(clamp(item.pauseAfterMs * pauseScale, 0, 2600, 0));
    }
  });
  const wav = createPiperWavBuffer(waves, SAMPLE_RATE, pausesMs);
  self.postMessage({
    type: 'complete',
    requestId,
    wav,
    voiceId,
    sampleRate: SAMPLE_RATE,
    version: TINY_AVA_MODEL_ID
  }, [wav]);
}

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type !== 'synthesize') return;
  synthesize(message).catch(error => {
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      message: String(error && error.message ? error.message : 'ساخت گفتار محلی tiny-ava ناموفق بود.').slice(0, 700)
    });
  });
});
