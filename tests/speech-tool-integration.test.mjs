import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tool = await readFile(new URL('../speech-tool.js', import.meta.url), 'utf8');
const core = await readFile(new URL('../speech-vendor/tiny-ava/core.mjs', import.meta.url), 'utf8');
const worker = await readFile(new URL('../speech-vendor/tiny-ava/tiny-ava-worker.mjs', import.meta.url), 'utf8');
const piperWorker = await readFile(new URL('../speech-vendor/piper/piper-worker.mjs', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const deliveryCore = await import('../speech-vendor/tiny-ava/core.mjs');

test('maps delivery profiles to distinct local speed, pitch, and pause controls', () => {
  const options = { rate: 1, pitch: 1, expressiveness: 1.12, pauseScale: 1 };
  const formal = deliveryCore.resolveLocalSpeechDelivery('formal', options);
  const supportive = deliveryCore.resolveLocalSpeechDelivery('supportive', options);
  const conversational = deliveryCore.resolveLocalSpeechDelivery('conversational', options);
  assert.ok(formal.speed < supportive.speed && supportive.speed < conversational.speed);
  assert.ok(formal.pitch < supportive.pitch && supportive.pitch < conversational.pitch);
  assert.ok(formal.pitchRange < supportive.pitchRange && supportive.pitchRange < conversational.pitchRange);
  assert.ok(formal.pauseScale > supportive.pauseScale && supportive.pauseScale > conversational.pauseScale);
  assert.ok(conversational.speed - formal.speed >= 0.15);
  assert.ok(conversational.pitch - formal.pitch >= 0.08);
  assert.ok(conversational.pitchRange - formal.pitchRange >= 0.45);
  assert.equal(deliveryCore.resolveLocalSpeechDelivery('unknown', options).style, 'auto');
  assert.equal(deliveryCore.resolveLocalSpeechDelivery('auto', options).autoTextProsody, true);
  assert.equal(formal.autoTextProsody, true, 'text-aware delivery remains active over an explicit style preset');
  assert.match(tool, /speechDeliverySettings\(speechCore\)/u);
  assert.match(worker, /settings\.autoTextProsody !== false/u);
  assert.doesNotMatch(worker, /settings\.style\s*===\s*'auto'/u, 'manual style presets do not disable sentence-aware output');
  assert.match(tool, /startTinyAvaSpeech\(text, session, selected, delivery\)/u);
  assert.match(tool, /startPiperSpeech\(text, session, selected, delivery, speechCore\)/u);
  assert.match(tool, /startBundledSpeech\(text, session, delivery, speechCore\)/u);
  assert.match(tool, /utterance\.rate = Math\.max\([\s\S]*?prosody\.speedScale/u);
  assert.match(tool, /utterance\.pitch = Math\.max\([\s\S]*?prosody\.pitchShiftOffset/u);
  assert.match(tool, /utterance\.volume = Math\.max\([\s\S]*?prosody\.intensityScale/u);
  assert.match(tool, /segmentPersianDeliveryText\(text, limit\)/u);
  assert.match(tool, /analyzePersianDeliverySequence\(chunks\)/u);
  assert.match(tool, /stripSpeechMarkupTags\(withoutCues\)/u);
  assert.match(core, /export function stripSpeechMarkupTags/u);
  assert.match(piperWorker, /chunk\.speedScale/u);
  assert.match(piperWorker, /chunk\.intensityScale/u);
  assert.match(piperWorker, /chunk\.pauseScale/u);
});

test('keeps intra-sentence punctuation inside a single tiny-ava model segment', () => {
  assert.match(core, /TINY_AVA_PAUSE_AFTER_SENTENCE/u);
  assert.doesNotMatch(core, /TINY_AVA_PAUSE_AFTER_PUNCTUATION/u);
  assert.match(core, /paragraphs\.slice\(index \+ 1\)/u);
  assert.match(worker, /pitchShiftOffset/u);
  assert.match(worker, /segment\.pitchShiftOffset/u);
  assert.match(worker, /emphasisWordIndexes:\s*segment\.emphasisWordIndexes/u);
  assert.match(core, /emphasisWordIndexes/u);
});

test('offers sentence-aware prosody and a locally saved pronunciation lexicon', () => {
  assert.match(tool, /value="auto">خوانش خودکار و جمله‌محور/u);
  assert.match(tool, /id="speechTtsLexicon"/u);
  assert.match(tool, /id="speechTinyAvaEmphasis"/u);
  assert.match(tool, /value="supportive"/u);
  assert.match(tool, /id="speechDeliveryStyleControls"/u);
  assert.match(tool, /deliveryStyleControls\.hidden = !selected/u);
  assert.match(tool, /tinyAvaCueBar\.hidden = !usesTinyAva/u);
  assert.match(tool, /id="speechDebtHandoff"/u);
  assert.match(tool, /applyPendingSpeechLaunch\(\)/u);
  assert.match(tool, /returnToDebtCollection/u);
  assert.match(tool, /wrapTinyAvaEmphasisCue/u);
  assert.match(tool, /\[\[تأکید:\$\{selectedText\}\]\]/u);
  assert.match(tool, /localStorage\.setItem\(LEXICON_KEY, raw\)/u);
  assert.match(tool, /speechCore\.applyPersianPronunciationLexicon\(rawText, entries\)/u);
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

test('uses contextual, punctuation-sensitive pauses on Piper and sentence-level controls on eSpeak', async () => {
  const espeakWorker = await readFile(new URL('../speech-vendor/espeak-worker.mjs', import.meta.url), 'utf8');
  const espeakCore = await readFile(new URL('../speech-vendor/espeak-core.mjs', import.meta.url), 'utf8');
  assert.match(piperWorker, /pauseAfterPiperChunk\(chunk\.text\)/u);
  assert.match(piperWorker, /chunk\.pauseAfterMs > 0/u);
  assert.match(espeakWorker, /synthesizePersianSegmentsWav/u);
  assert.match(espeakCore, /segment\.speedScale/u);
  assert.match(espeakCore, /segment\.pitchShiftOffset/u);
  assert.match(espeakCore, /segment\.intensityScale/u);
  assert.match(espeakCore, /pauseAfterPiperChunk\(segment\.text\)/u);
  assert.match(serviceWorker, /shahr-advisor-pc-v46/u);
  for (const path of ['speech-tool.js', 'speech-vendor/tiny-ava/core.mjs', 'speech-vendor/piper/piper-worker.mjs', 'speech-vendor/piper/core.mjs']) {
    assert.ok(serviceWorker.includes(`'./${path}'`), `missing ${path} from the offline shell`);
  }
});
