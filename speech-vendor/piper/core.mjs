/* Small, testable helpers for the local Persian Piper worker. */
export function normalizePersianTtsText(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\u064A\u0649]/g, 'ی')
    .replace(/\u0643/g, 'ک')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function boundedNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? number : fallback));
}

/** Accept legacy string chunks and the local sentence-prosody records sent by the UI. */
export function normalizePiperSpeechChunks(chunks) {
  return Array.from(chunks || [], raw => {
    const item = typeof raw === 'string' ? { text: raw } : (raw && typeof raw === 'object' ? raw : {});
    const prosody = item.prosody && typeof item.prosody === 'object' ? item.prosody : item;
    const text = normalizePersianTtsText(item.text);
    if (!text) return null;
    return {
      text,
      pauseAfterMs: boundedNumber(item.pauseAfterMs, 0, 2600, 0),
      speedScale: boundedNumber(prosody.speedScale, 0.88, 1.12, 1),
      pauseScale: boundedNumber(prosody.pauseScale, 0.75, 1.35, 1),
      intensityScale: boundedNumber(prosody.intensityScale, 0.92, 1.08, 1),
      tone: typeof prosody.tone === 'string' ? prosody.tone.slice(0, 32) : 'neutral'
    };
  }).filter(Boolean);
}

/** Apply restrained sentence-level intensity without clipping the float waveform. */
export function applySpeechIntensity(samples, intensityScale = 1) {
  if (!samples || typeof samples.length !== 'number') return samples;
  const gain = boundedNumber(intensityScale, 0.9, 1.1, 1);
  let peak = 0;
  for (let index = 0; index < samples.length; index++) {
    const sample = Number(samples[index]);
    if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
  }
  const headroomGain = peak > 0.95 ? 0.95 / peak : 1;
  const safeGain = peak > 0 ? Math.min(gain * headroomGain, 0.99 / peak) : gain;
  if (Math.abs(safeGain - 1) < 1e-6) return samples;
  const output = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index++) {
    const sample = Number(samples[index]);
    output[index] = Number.isFinite(sample) ? Math.max(-0.99, Math.min(0.99, sample * safeGain)) : 0;
  }
  return output;
}

export function validatePiperVoiceConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('پیکربندی صدای فارسی معتبر نیست.');
  const sampleRate = Number(config.audio && config.audio.sample_rate);
  const voice = config.espeak && config.espeak.voice;
  const phonemeMap = config.phoneme_id_map;
  const inference = config.inference;
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error('نرخ نمونه‌برداری مدل صدا معتبر نیست.');
  }
  if (typeof voice !== 'string' || !voice.trim()) throw new Error('شناسهٔ زبان مدل صدا پیدا نشد.');
  if (!phonemeMap || typeof phonemeMap !== 'object' || !Object.keys(phonemeMap).length) {
    throw new Error('جدول واج‌های مدل صدا پیدا نشد.');
  }
  if (!inference || !Number.isFinite(Number(inference.noise_scale)) ||
      !Number.isFinite(Number(inference.length_scale)) || !Number.isFinite(Number(inference.noise_w))) {
    throw new Error('تنظیمات استنتاج مدل صدا ناقص است.');
  }
  return { sampleRate, voice, phonemeMap, inference };
}

export function validatePersianPiperConfig(config) {
  const normalized = validatePiperVoiceConfig(config);
  if (normalized.sampleRate !== 22050 || normalized.voice !== 'fa' ||
      !config.language || config.language.code !== 'fa_IR' || config.phoneme_type !== 'espeak' ||
      Number(config.num_speakers) !== 1) {
    throw new Error('پیکربندیِ فایل با مدل تک‌گویندهٔ فارسی Piper هم‌خوان نیست.');
  }
  return normalized;
}

export function piperInputIds(phonemeResult) {
  const ids = phonemeResult && phonemeResult.phoneme_ids;
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !Number.isInteger(Number(id)) || Number(id) < 0)) {
    throw new Error('مدل آوایی برای این متن خروجی قابل استفاده نساخت.');
  }
  return BigInt64Array.from(ids, id => BigInt(id));
}

export function pauseAfterPiperChunk(text) {
  const value = String(text || '').trimEnd().replace(/["')\]»”’}]+$/u, '').trimEnd();
  const ending = value.slice(-1);
  if (ending === '?' || ending === '؟') return 250;
  if (ending === '!') return 210;
  if (ending === '…') return 360;
  if (ending === '.' || ending === '؛' || ending === ';') return 180;
  if (ending === ':' || ending === '،' || ending === ',') return 110;
  return 28;
}

export async function sha256Hex(value) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('بررسی امن SHA-256 در این مرورگر در دسترس نیست؛ برنامه را از localhost یا HTTPS باز کنید.');
  }
  const bytes = typeof Blob !== 'undefined' && value instanceof Blob ? await value.arrayBuffer() : value;
  if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
    throw new Error('دادهٔ مدل برای بررسی هش معتبر نیست.');
  }
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createPiperWavBuffer(sampleChunks, sampleRate, silenceMs = 90) {
  const rate = Number(sampleRate);
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000) throw new Error('نرخ نمونه‌برداری WAV معتبر نیست.');
  const chunks = (sampleChunks || []).filter(chunk => chunk && chunk.length);
  if (!chunks.length) throw new Error('مدل گفتار صوتی تولید نکرد.');

  const perGapPauses = Array.isArray(silenceMs);
  const gapSamples = chunks.slice(0, -1).map((_chunk, index) => {
    const requestedMs = perGapPauses ? silenceMs[index] : silenceMs;
    // Preserve Piper's original one-second cap for scalar callers; tiny-ava passes explicit per-gap pauses.
    const durationMs = Math.max(0, Math.min(perGapPauses ? 2600 : 1000, Number(requestedMs) || 0));
    return Math.round(rate * durationMs / 1000);
  });
  const totalSamples = chunks.reduce((sum, chunk) => sum + chunk.length, 0) + gapSamples.reduce((sum, samples) => sum + samples, 0);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46464952, true); // RIFF
  view.setUint32(4, buffer.byteLength - 8, true);
  view.setUint32(8, 0x45564157, true); // WAVE
  view.setUint32(12, 0x20746d66, true); // fmt chunk
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x61746164, true); // data
  view.setUint32(40, totalSamples * 2, true);

  let offset = 44;
  chunks.forEach((chunk, index) => {
    for (let i = 0; i < chunk.length; i++) {
      const value = Number(chunk[i]);
      const sample = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
      view.setInt16(offset, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true);
      offset += 2;
    }
    if (index < chunks.length - 1) offset += gapSamples[index] * 2;
  });
  return buffer;
}
