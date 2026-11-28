import assert from 'node:assert/strict';
import { synthesizePersianSegmentsWav, synthesizePersianWav } from '../speech-vendor/espeak-core.mjs';

function waveformsDiffer(left, right) {
  if (left.length !== right.length) return true;
  for (let index = 44; index < left.length; index++) if (left[index] !== right[index]) return true;
  return false;
}

const wav = new Uint8Array(await synthesizePersianWav('درود. این یک آزمون صدای فارسی آفلاین است.', 1, 1));
assert.equal(String.fromCharCode(...wav.subarray(0, 4)), 'RIFF');
assert.equal(String.fromCharCode(...wav.subarray(8, 12)), 'WAVE');
assert.equal(new DataView(wav.buffer, wav.byteOffset, wav.byteLength).getUint32(24, true), 22050);
assert.ok(wav.length > 10000, `expected non-empty speech WAV, got ${wav.length} bytes`);
assert.ok(wav.subarray(44).some(sample => sample !== 0), 'synthesized audio should not be silent');
const adjustedWav = new Uint8Array(await synthesizePersianWav('درود. این یک آزمون صدای فارسی آفلاین است.', 0.92, 1.08, () => {}, 1.04));
assert.ok(waveformsDiffer(wav, adjustedWav), 'sentence controls should alter the synthesized waveform, not just metadata');
const contextualText = 'متأسفم که چنین شد. نگران نباشید، پیگیری می‌کنم.';
const uniformContextWav = new Uint8Array(await synthesizePersianWav(contextualText, 1, 1));
const contextualWav = new Uint8Array(await synthesizePersianSegmentsWav([
  { text: 'متأسفم که چنین شد.', prosody: { speedScale: 0.96, pitchShiftOffset: -0.01, intensityScale: 0.97, pauseScale: 1.1 } },
  { text: 'نگران نباشید، پیگیری می‌کنم.', prosody: { speedScale: 0.98, pitchShiftOffset: 0, intensityScale: 1, pauseScale: 1.08 } }
], 1, 1, 1));
assert.equal(String.fromCharCode(...contextualWav.subarray(0, 4)), 'RIFF');
assert.ok(contextualWav.length > wav.length * 0.8, 'sentence-level WAV segments should be joined into usable speech');
assert.ok(contextualWav.subarray(44).some(sample => sample !== 0));
assert.ok(waveformsDiffer(contextualWav, uniformContextWav), 'sentence-level delivery changes the output waveform compared with flat whole-text synthesis');
console.log(`Persian eSpeak NG smoke test passed (${wav.length} bytes single-sentence, ${contextualWav.length} contextual WAV bytes; 22050 Hz).`);
