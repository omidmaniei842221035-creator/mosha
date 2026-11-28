import assert from 'node:assert/strict';
import {
  createPiperWavBuffer,
  normalizePersianTtsText,
  piperInputIds,
  sha256Hex,
  validatePersianPiperConfig,
  validatePiperVoiceConfig
} from '../speech-vendor/piper/core.mjs';

const config = {
  audio: { sample_rate: 22050 },
  espeak: { voice: 'fa' },
  language: { code: 'fa_IR' },
  phoneme_type: 'espeak',
  phoneme_id_map: { ' ': [0], a: [1], b: [2] },
  inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
  num_speakers: 1
};
assert.equal(validatePiperVoiceConfig(config).sampleRate, 22050);
assert.equal(validatePersianPiperConfig(config).voice, 'fa');
assert.throws(() => validatePersianPiperConfig({ ...config, language: { code: 'en_US' } }), /فارسی Piper/);
assert.equal(normalizePersianTtsText(' كِتاب\u200f  '), 'کِتاب');
assert.equal(await sha256Hex(new TextEncoder().encode('test').buffer), '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
assert.equal(await sha256Hex(new Blob(['test'])), '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
assert.deepEqual([...piperInputIds({ phoneme_ids: [0, 2, 1] })], [0n, 2n, 1n]);
assert.throws(() => piperInputIds({ phoneme_ids: [] }), /مدل آوایی/);
assert.throws(() => validatePiperVoiceConfig({}), /نرخ نمونه‌برداری/);

const wav = createPiperWavBuffer([Float32Array.from([0, -1, 1]), Float32Array.from([0.5])], 22050, 10);
const bytes = new Uint8Array(wav);
const view = new DataView(wav);
assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF');
assert.equal(String.fromCharCode(...bytes.subarray(8, 12)), 'WAVE');
assert.equal(view.getUint32(24, true), 22050);
assert.equal(view.getUint32(40, true), (3 + Math.round(22050 * 10 / 1000) + 1) * 2);
assert.equal(wav.byteLength, 44 + view.getUint32(40, true));
assert.equal(view.getInt16(46, true), -32768);
assert.equal(view.getInt16(48, true), 32767);
const variablePauseWav = createPiperWavBuffer(
  [Float32Array.of(0), Float32Array.of(0), Float32Array.of(0)], 22050, [10, 20]
);
assert.equal(new DataView(variablePauseWav).getUint32(40, true), (3 + 221 + 441) * 2);
const scalarCapWav = createPiperWavBuffer([Float32Array.of(0), Float32Array.of(0)], 22050, 2000);
assert.equal(new DataView(scalarCapWav).getUint32(40, true), (2 + 22050) * 2);
console.log(`Piper WAV/core smoke test passed (${wav.byteLength} bytes, 22050 Hz WAV; variable pauses supported, scalar cap unchanged).`);
