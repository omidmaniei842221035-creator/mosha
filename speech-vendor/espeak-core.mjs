/*
 * Offline Persian WAV synthesis adapter for the separately packaged eSpeak NG worker.
 * The eSpeak NG runtime and bundled speech data are GPL-3.0-or-later; see LICENSE-GPL-3.0.txt.
 */
import ESpeakNG from './espeak-ng.mjs';
import { createPiperWavBuffer, pauseAfterPiperChunk } from './piper/core.mjs';

const MAX_TEXT_LENGTH = 8000;
const clamp = (value, min, max, fallback = min) => {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
};

export async function synthesizePersianWav(text, rate = 1, pitch = 1, onProgress = () => {}, intensityScale = 1) {
  const phrase = String(text || '').trim();
  if (!phrase) throw new Error('متنی برای خواندن وارد نشده است.');
  if (phrase.length > MAX_TEXT_LENGTH) throw new Error(`متن باید حداکثر ${MAX_TEXT_LENGTH} نویسه باشد.`);

  const safeRate = clamp(rate, 0.75, 1.25, 1);
  const speedWordsPerMinute = Math.round(155 * safeRate);
  const pitchValue = clamp(Math.round(50 * clamp(pitch, 0.8, 1.2, 1)), 0, 99);
  const amplitude = Math.round(clamp(170 * clamp(intensityScale, 0.92, 1.08, 1), 145, 185, 170));
  onProgress('starting');

  const module = await ESpeakNG({
    arguments: [
      '-v', 'fa',
      '-s', String(speedWordsPerMinute),
      '-p', String(pitchValue),
      '-a', String(amplitude),
      '-w', '/speech-output.wav',
      phrase
    ],
    locateFile: path => new URL(path, import.meta.url).href,
    printErr: () => {}
  });

  onProgress('reading');
  if (!module.FS || !module.FS.analyzePath('/speech-output.wav').exists) {
    throw new Error('موتور فارسی فایل صوتی تولید نکرد.');
  }

  const file = module.FS.readFile('/speech-output.wav');
  if (file.length < 46) throw new Error('فایل صوتی تولیدشده ناقص است.');
  if (String.fromCharCode(...file.subarray(0, 4)) !== 'RIFF' ||
      String.fromCharCode(...file.subarray(8, 12)) !== 'WAVE') {
    throw new Error('قالب صدای تولیدشده معتبر نیست.');
  }

  const sampleRate = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(24, true);
  if (sampleRate < 8000 || sampleRate > 96000) throw new Error('نرخ نمونه‌برداری صدای تولیدشده معتبر نیست.');

  const output = file.slice();
  try { module.FS.unlink('/speech-output.wav'); } catch (_) { /* the worker is discarded after this synthesis */ }
  onProgress('complete');
  return output.buffer;
}

function decodeMonoPcm16Wav(wav) {
  const bytes = wav instanceof ArrayBuffer ? new Uint8Array(wav) : new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength);
  if (bytes.length < 46 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
      String.fromCharCode(...bytes.subarray(8, 12)) !== 'WAVE') {
    throw new Error('یکی از بخش‌های صوتی eSpeak قالب WAV معتبر ندارد.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkName = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const chunkLength = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + chunkLength > bytes.length) break;
    if (chunkName === 'fmt ' && chunkLength >= 16) {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (chunkName === 'data') {
      dataOffset = body;
      dataLength = chunkLength;
    }
    offset = body + chunkLength + (chunkLength & 1);
  }
  if (format !== 1 || channels !== 1 || bitsPerSample !== 16 || dataOffset < 0 || dataLength % 2) {
    throw new Error('قالب صوت eSpeak باید PCM تک‌کانالهٔ ۱۶بیتی باشد.');
  }
  const samples = new Float32Array(dataLength / 2);
  for (let index = 0; index < samples.length; index++) {
    samples[index] = view.getInt16(dataOffset + index * 2, true) / 32768;
  }
  return { samples, sampleRate };
}

/** Synthesize sentence-level eSpeak prosody with explicit engine controls, without exposing markup to speech. */
export async function synthesizePersianSegmentsWav(chunks, rate = 1, pitch = 1, pauseScale = 1, onProgress = () => {}) {
  const segments = Array.from(chunks || [], raw => {
    const chunk = typeof raw === 'string' ? { text: raw } : (raw && typeof raw === 'object' ? raw : {});
    const prosody = chunk.prosody && typeof chunk.prosody === 'object' ? chunk.prosody : chunk;
    return {
      text: String(chunk.text || '').trim(),
      pauseAfterMs: clamp(chunk.pauseAfterMs, 0, 2600, 0),
      speedScale: clamp(prosody.speedScale, 0.88, 1.12, 1),
      pitchShiftOffset: clamp(prosody.pitchShiftOffset, -0.1, 0.1, 0),
      intensityScale: clamp(prosody.intensityScale, 0.92, 1.08, 1),
      pauseScale: clamp(prosody.pauseScale, 0.75, 1.35, 1)
    };
  }).filter(segment => segment.text);
  if (!segments.length) throw new Error('متنی برای خواندن وارد نشده است.');
  const totalTextLength = segments.reduce((sum, segment) => sum + segment.text.length, 0);
  if (totalTextLength > MAX_TEXT_LENGTH) throw new Error(`متن باید حداکثر ${MAX_TEXT_LENGTH} نویسه باشد.`);

  const safePauseScale = clamp(pauseScale, 0.6, 1.8, 1);
  const audio = [];
  const pauses = [];
  let sampleRate = 0;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const adjustedRate = clamp(Number(rate) * segment.speedScale, 0.75, 1.25, 1);
    const adjustedPitch = clamp(Number(pitch) * Math.exp(segment.pitchShiftOffset), 0.8, 1.2, 1);
    const wav = await synthesizePersianWav(segment.text, adjustedRate, adjustedPitch, () => {}, segment.intensityScale);
    const decoded = decodeMonoPcm16Wav(wav);
    if (sampleRate && sampleRate !== decoded.sampleRate) throw new Error('نرخ نمونه‌برداری بخش‌های گفتار eSpeak یکسان نیست.');
    sampleRate = decoded.sampleRate;
    audio.push(decoded.samples);
    if (index < segments.length - 1) {
      const basePause = segment.pauseAfterMs > 0 ? segment.pauseAfterMs : pauseAfterPiperChunk(segment.text);
      pauses.push(Math.min(2600, Math.round(basePause * safePauseScale * segment.pauseScale)));
    }
    onProgress({ phase: 'reading', done: index + 1, total: segments.length });
  }
  const wav = createPiperWavBuffer(audio, sampleRate, pauses);
  onProgress({ phase: 'complete', done: segments.length, total: segments.length });
  return wav;
}
