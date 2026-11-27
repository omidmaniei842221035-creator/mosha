import assert from 'node:assert/strict';
import { synthesizePersianWav } from '../speech-vendor/espeak-core.mjs';

const wav = new Uint8Array(await synthesizePersianWav('درود. این یک آزمون صدای فارسی آفلاین است.', 1, 1));
assert.equal(String.fromCharCode(...wav.subarray(0, 4)), 'RIFF');
assert.equal(String.fromCharCode(...wav.subarray(8, 12)), 'WAVE');
assert.equal(new DataView(wav.buffer, wav.byteOffset, wav.byteLength).getUint32(24, true), 22050);
assert.ok(wav.length > 10000, `expected non-empty speech WAV, got ${wav.length} bytes`);
assert.ok(wav.subarray(44).some(sample => sample !== 0), 'synthesized audio should not be silent');
console.log(`Persian eSpeak NG smoke test passed (${wav.length} bytes, 22050 Hz WAV).`);
