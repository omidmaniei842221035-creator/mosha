import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tool = await readFile(new URL('../speech-tool.js', import.meta.url), 'utf8');
const core = await readFile(new URL('../speech-vendor/tiny-ava/core.mjs', import.meta.url), 'utf8');
const worker = await readFile(new URL('../speech-vendor/tiny-ava/tiny-ava-worker.mjs', import.meta.url), 'utf8');
const piperWorker = await readFile(new URL('../speech-vendor/piper/piper-worker.mjs', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('keeps intra-sentence punctuation inside a single tiny-ava model segment', () => {
  assert.match(core, /TINY_AVA_PAUSE_AFTER_SENTENCE/u);
  assert.doesNotMatch(core, /TINY_AVA_PAUSE_AFTER_PUNCTUATION/u);
  assert.match(core, /paragraphs\.slice\(index \+ 1\)/u);
  assert.match(worker, /pitchShiftOffset/u);
  assert.match(worker, /segment\.pitchShiftOffset/u);
});

test('offers sentence-aware prosody and a locally saved pronunciation lexicon', () => {
  assert.match(tool, /value="auto">خوانش خودکار و جمله‌محور/u);
  assert.match(tool, /id="speechTtsLexicon"/u);
  assert.match(tool, /localStorage\.setItem\(LEXICON_KEY, raw\)/u);
  assert.match(tool, /core\.applyPersianPronunciationLexicon\(rawText, entries\)/u);
  assert.match(core, /not model fine-tuning/u);
});

test('prefers the local neural Persian voice unless an explicit voice choice was saved', () => {
  assert.match(tool, /voiceChoiceExplicit === true/u);
  assert.match(tool, /state\.voiceChoiceExplicit = prefs\.voiceChoiceExplicit === true/u);
  assert.match(tool, /state\.voiceChoiceExplicit = true/u);
  assert.match(tool, /voiceChoiceExplicit: state\.voiceChoiceExplicit === true/u);
  assert.match(tool, /: canUseNeuralVoice\s*\n\s*\? `\$\{TINY_AVA_VOICE_PREFIX\}/u);
  assert.match(tool, /دریافت کنید/u);
});

test('uses punctuation-sensitive pauses for Piper and advances the offline shell cache', () => {
  assert.match(piperWorker, /pauseAfterPiperChunk/u);
  assert.match(piperWorker, /cleanChunks\.slice\(0, -1\)\.map\(pauseAfterPiperChunk\)/u);
  assert.match(serviceWorker, /shahr-advisor-pc-v42/u);
  for (const path of ['speech-tool.js', 'speech-vendor/tiny-ava/core.mjs', 'speech-vendor/piper/piper-worker.mjs', 'speech-vendor/piper/core.mjs']) {
    assert.ok(serviceWorker.includes(`'./${path}'`), `missing ${path} from the offline shell`);
  }
});
