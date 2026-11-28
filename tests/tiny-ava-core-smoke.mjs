import assert from 'node:assert/strict';
import {
  TINY_AVA_ASSETS,
  TINY_AVA_MODEL_ID,
  TINY_AVA_TOTAL_BYTES,
  TINY_AVA_VERSION,
  TINY_AVA_VOICES,
  analyzePersianDeliveryProsody,
  analyzePersianDeliverySequence,
  applyPersianPronunciationLexicon,
  byteT5Encode,
  expandPersianNumbers,
  parsePersianPronunciationLexicon,
  normalizeTinyAvaText,
  phonemizeTinyAvaSentence,
  segmentPersianDeliveryText,
  stripSpeechMarkupTags,
  splitTinyAvaSentences,
  segmentTinyAvaText,
  tinyAvaPhonemeIdsFromRepr1
} from '../speech-vendor/tiny-ava/core.mjs';

assert.equal(TINY_AVA_MODEL_ID, 'tiny-ava-v2');
assert.equal(TINY_AVA_VERSION, 'v2.0.0');
assert.equal(TINY_AVA_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0), TINY_AVA_TOTAL_BYTES);
assert.equal(TINY_AVA_TOTAL_BYTES, 44_799_403);
assert.deepEqual(Object.keys(TINY_AVA_VOICES), ['parisa', 'mana']);
assert.equal(TINY_AVA_VOICES.parisa.modelIndex, 0);
assert.equal(TINY_AVA_VOICES.mana.modelIndex, 2);

assert.equal(
  normalizeTinyAvaText('كِتابِ ۱۲٬۳۵۰٬۰۰۰ تومان، ساعت ۱۰:۳۰ و ۸۵٪'),
  'کِتابِ دوازده میلیون و سیصد و پنجاه هزار تومان, ساعت ده و سی دقیقه و هشتاد و پنج درصد'
);
assert.equal(normalizeTinyAvaText('بارانِ ریزی'), 'بارانِ ریزی'); // Preserve user-supplied diacritics.
assert.equal(
  stripSpeechMarkupTags('x < y > z؛ <prosody rate="slow">آرام</prosody>').replace(/\s+/gu, ' ').trim(),
  'x < y > z؛ آرام',
  'SSML is removed while ordinary less-than comparisons are preserved'
);
assert.equal(stripSpeechMarkupTags('متن <unfinished').trim(), 'متن');
assert.equal(expandPersianNumbers('۱۲٬۳۵۰٬۰۰۰'), 'دوازده میلیون و سیصد و پنجاه هزار');
assert.equal(expandPersianNumbers('1.05'), 'یک ممیز صفر پنج');
assert.equal(expandPersianNumbers('10:30'), 'ده و سی دقیقه');
assert.equal(expandPersianNumbers('85%'), 'هشتاد و پنج درصد');
assert.equal(expandPersianNumbers('۸۵٪'), 'هشتاد و پنج درصد');
assert.equal(expandPersianNumbers('3-5'), 'سه تا پنج');
assert.equal(expandPersianNumbers('2026-11-26'), 'دو هزار و بیست و شش، یازده، بیست و شش');
assert.equal(expandPersianNumbers('A12B'), 'A12B');
const lexicon = parsePersianPronunciationLexicon('# واژه‌های محلی\nكاظمی = کاظِمی\nبانک شهر → بانْکِ شهر\nبانک شهر => بانکِ شهر');
assert.equal(lexicon.length, 2, 'duplicate entries use the last saved pronunciation');
assert.equal(lexicon[0].source, 'بانک شهر', 'longer phrases are tried before single words');
assert.equal(lexicon[0].spoken, 'بانکِ شهر');
assert.equal(applyPersianPronunciationLexicon('بانک شهر، آقای كاظمی و بانک‌شهر [[آه]]', lexicon), 'بانکِ شهر، آقای کاظِمی و بانک‌شهر [[آه]]');
assert.equal(applyPersianPronunciationLexicon('کاظمی [[آه]] کاظمی', lexicon), 'کاظِمی [[آه]] کاظِمی', 'lexicon never rewrites cue markup and resumes after it');
assert.equal(applyPersianPronunciationLexicon('[[تأکید:کاظمی]]', lexicon), '[[تأکید:کاظِمی]]', 'lexicon pronunciation is applied within a marked emphasis phrase');
assert.equal(applyPersianPronunciationLexicon('سطر یک\n\nکاظمی', lexicon), 'سطر یک\n\nکاظِمی', 'paragraph breaks remain available to the prosody segmenter');
assert.equal(applyPersianPronunciationLexicon('بانک شهری', lexicon), 'بانک شهری', 'lexicon matches whole words/phrases only');

assert.deepEqual(
  splitTinyAvaSentences('سلام. آیا ساعت ۱۰:۳۰ آماده‌ای؟'),
  ['سلام.', 'آیا ساعت ده و سی دقیقه آماده‌ای?']
);
const deliveryChunks = segmentPersianDeliveryText('سلام. نام کاظمی، مبلغ ۱۲٬۳۵۰٬۰۰۰ تومان ثبت شد؟\n\nجزئیات بعدی.', 180);
assert.deepEqual(deliveryChunks.map(chunk => chunk.text), [
  'سلام.', 'نام کاظمی، مبلغ ۱۲٬۳۵۰٬۰۰۰ تومان ثبت شد؟', 'جزئیات بعدی.'
], 'sentence chunking keeps names, numbers, punctuation, and wording unchanged');
assert.equal(deliveryChunks[1].pauseAfterMs, 610, 'blank paragraphs create a longer boundary pause');
assert.equal(deliveryChunks[2].paragraphBreakBefore, true, 'prosody smoothing resets at a new paragraph');
assert.ok(segmentPersianDeliveryText('واژه '.repeat(100), 48).every(chunk => chunk.text.length <= 48));
const timedSegments = segmentTinyAvaText('سلام، حال شما چطور است؟');
assert.deepEqual(timedSegments.map(segment => segment.text), ['سلام, حال شما چطور است?']);
assert.equal(timedSegments[0].pauseAfterMs, 390);
assert.ok(timedSegments[0].pitchShiftOffset > 0, 'questions receive a restrained, sentence-level intonation cue');
const excitedSegments = segmentTinyAvaText('چه خبر خوبی!');
assert.ok(excitedSegments[0].pitchRangeScale > 1 && excitedSegments[0].speedScale > 1);
const ellipsisSegments = segmentTinyAvaText('شاید…');
assert.ok(ellipsisSegments[0].speedScale < 1 && ellipsisSegments[0].pitchShiftOffset < 0);
const warmSegments = segmentTinyAvaText('از شما ممنونم.');
assert.ok(warmSegments[0].pitchRangeScale > 1 && warmSegments[0].pitchShiftOffset > 0);
const gentleSegments = segmentTinyAvaText('متأسفم که چنین شد.');
assert.ok(gentleSegments[0].speedScale < 1 && gentleSegments[0].pitchShiftOffset < 0);
const formalSegments = segmentTinyAvaText('با احترام، لطفاً نامه را بررسی کنید.');
assert.ok(formalSegments[0].speedScale < 1 && formalSegments[0].pitchRangeScale < 1);
const fixedStyleSegments = segmentTinyAvaText('از شما ممنونم.', 180, { autoTextProsody: false });
assert.equal(fixedStyleSegments[0].pitchShiftOffset, 0, 'callers can explicitly disable lexical tone when they need a fixed reading');
assert.equal(fixedStyleSegments[0].tone, 'neutral');
const reassurance = analyzePersianDeliveryProsody('نگران نباشید؛ پیگیری می‌کنم.');
const empathy = analyzePersianDeliveryProsody('متأسفم که چنین دشواری‌ای پیش آمده است.');
const neutralDelivery = analyzePersianDeliveryProsody('پرونده در ساعت ده ثبت شد.');
assert.equal(reassurance.tone, 'reassuring');
assert.equal(empathy.tone, 'empathetic');
assert.equal(neutralDelivery.tone, 'neutral', 'emotion is not inferred without a clear textual cue');
assert.ok(reassurance.pauseScale > neutralDelivery.pauseScale && reassurance.intensityScale === 1);
assert.ok(empathy.speedScale < neutralDelivery.speedScale && empathy.intensityScale < 1);
const deliverySequence = analyzePersianDeliverySequence(['از شما ممنونم.', 'پرونده در ساعت ده ثبت شد.']);
assert.deepEqual(deliverySequence.map(profile => profile.tone), ['warm', 'neutral']);
assert.ok(deliverySequence[1].pitchShiftOffset > 0 && deliverySequence[1].pitchShiftOffset < deliverySequence[0].pitchShiftOffset,
  'tone changes release gradually rather than switching abruptly');
const emphasizedAmount = segmentTinyAvaText('مبلغ ۱۲٬۳۵۰٬۰۰۰ تومان برای آقای امیری.')[0];
const amountWords = emphasizedAmount.text.split(/\s+/u).map(word => word.replace(/^[^\p{L}\p{N}\u200c]+|[^\p{L}\p{N}\u200c]+$/gu, '')).filter(Boolean);
const highlightedWords = new Set(emphasizedAmount.emphasisWordIndexes.map(index => amountWords[index]));
for (const word of ['مبلغ', 'دوازده', 'میلیون', 'تومان', 'امیری']) assert.ok(highlightedWords.has(word), `expected mild emphasis for ${word}`);
const markedEmphasis = segmentTinyAvaText('این [[تأکید:نام خاص]] را بخوانید.');
assert.equal(markedEmphasis.length, 1, 'inline emphasis stays inside one sentence inference');
assert.equal(markedEmphasis[0].text, 'این نام خاص را بخوانید.');
assert.ok(markedEmphasis[0].emphasisWordIndexes.includes(1) && markedEmphasis[0].emphasisWordIndexes.includes(2));
const lineSegments = segmentTinyAvaText('خط یک\nخط دو\n\nبند سه.');
assert.deepEqual(lineSegments.map(segment => segment.text), ['خط یک خط دو', 'بند سه.']);
assert.deepEqual(lineSegments.map(segment => segment.pauseAfterMs), [610, 330]);
assert.equal(segmentTinyAvaText('[[مکث کوتاه]]سلام.')[0].pauseBeforeMs, 190);
const boundedSegments = segmentTinyAvaText('واژه '.repeat(200), 48);
const unspacedBoundedSegments = segmentTinyAvaText('x'.repeat(500), 48);
assert.ok([...boundedSegments, ...unspacedBoundedSegments].every(segment => segment.type !== 'speech' || segment.text.length <= 48));
const expressiveSegments = segmentTinyAvaText('این [[کشیده:واژه]] است [[آه]] [[نفس]] ادامه دارد.');
assert.ok(expressiveSegments.some(segment => segment.type === 'breath' && segment.durationMs === 230));
assert.ok(expressiveSegments.some(segment => segment.type === 'speech' && segment.text === 'واژه' && segment.speedScale < 0.8));
assert.ok(expressiveSegments.some(segment => segment.type === 'speech' && segment.text === 'آه'));
const strippedUnsupportedMarkup = segmentTinyAvaText('متن <prosody rate="slow">فارسی</prosody> [[mood:angry]] نهایی است.');
assert.deepEqual(strippedUnsupportedMarkup.map(segment => segment.text), ['متن فارسی نهایی است.']);
assert.ok(strippedUnsupportedMarkup.every(segment => !/prosody|mood|angry/u.test(segment.text)), 'unsupported tags/cues are never sent to the phonemizer');
assert.equal(segmentTinyAvaText('متن [[mood:angry')[0].text, 'متن', 'an unfinished cue is not read as literal markup');
const pauseCueSegments = segmentTinyAvaText('پیش از مکث [[مکث بلند]] پس از مکث.');
assert.equal(pauseCueSegments[0].pauseAfterMs, 720);
assert.deepEqual([...byteT5Encode('ا')], [219n, 170n, 1n]);
const phoneResult = tinyAvaPhonemeIdsFromRepr1('salAm hAl-e');
assert.deepEqual(phoneResult.symbols, ['<bos>', 's', 'a', 'l', 'ɑ', 'm', '<sp>', 'h', 'ɑ', 'l', 'e', '<eos>']);
const emphasizedPhoneResult = tinyAvaPhonemeIdsFromRepr1('salAm', { emphasisWordIndexes: [0] });
assert.equal(phoneResult.ids.length, phoneResult.stress.length);
assert.equal(emphasizedPhoneResult.stress[4], 2, 'manual emphasis uses the model stress input instead of splitting audio');
assert.ok(phoneResult.ids.every(Number.isInteger));
const fakeReprTokens = byteT5Encode('mohem');
const fakeOrt = { Tensor: class { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } } };
const fakeEncoder = { run: async () => ({ encoder_hidden_states: new Float32Array([0]) }) };
const fakeDecoder = { run: async ({ decoder_input_ids }) => {
  const step = decoder_input_ids.data.length - 1;
  const vocabularySize = 300;
  const logits = new Float32Array(decoder_input_ids.data.length * vocabularySize);
  logits[step * vocabularySize + Number(fakeReprTokens[step])] = 1;
  return { logits: { data: logits, dims: [1, decoder_input_ids.data.length, vocabularySize] } };
} };
const emphasizedPersianPhones = await phonemizeTinyAvaSentence('مهم.', fakeEncoder, fakeDecoder, fakeOrt, { emphasisWordIndexes: [0] });
assert.equal(emphasizedPersianPhones.stress[emphasizedPersianPhones.symbols.indexOf('e')], 2, 'word emphasis reaches the Persian G2P-to-phoneme stress path');

console.log('tiny-ava core smoke test passed (pinned metadata, Persian normalization, bounded segments, pauses, emphasis, cues and phoneme IDs).');
