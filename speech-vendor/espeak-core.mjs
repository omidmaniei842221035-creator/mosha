/*
 * Offline Persian WAV synthesis adapter for the separately packaged eSpeak NG worker.
 * The eSpeak NG runtime and bundled speech data are GPL-3.0-or-later; see LICENSE-GPL-3.0.txt.
 */
import ESpeakNG from './espeak-ng.mjs';

const MAX_TEXT_LENGTH = 8000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export async function synthesizePersianWav(text, rate = 1, pitch = 1, onProgress = () => {}) {
  const phrase = String(text || '').trim();
  if (!phrase) throw new Error('متنی برای خواندن وارد نشده است.');
  if (phrase.length > MAX_TEXT_LENGTH) throw new Error(`متن باید حداکثر ${MAX_TEXT_LENGTH} نویسه باشد.`);

  const safeRate = clamp(Number(rate) || 1, 0.75, 1.25);
  const speedWordsPerMinute = Math.round(155 * safeRate);
  const pitchValue = clamp(Math.round(50 * (Number(pitch) || 1)), 0, 99);
  onProgress('starting');

  const module = await ESpeakNG({
    arguments: [
      '-v', 'fa',
      '-s', String(speedWordsPerMinute),
      '-p', String(pitchValue),
      '-a', '170',
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
  try { module.FS.unlink('/speech-output.wav'); } catch (_) { /* the worker will be discarded after this synthesis */ }
  onProgress('complete');
  return output.buffer;
}
