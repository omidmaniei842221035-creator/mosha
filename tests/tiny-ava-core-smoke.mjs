import assert from 'node:assert/strict';
import {
  TINY_AVA_ASSETS,
  TINY_AVA_MODEL_ID,
  TINY_AVA_TOTAL_BYTES,
  TINY_AVA_VERSION,
  TINY_AVA_VOICES,
  byteT5Encode,
  expandPersianNumbers,
  normalizeTinyAvaText,
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
assert.equal(expandPersianNumbers('۱۲٬۳۵۰٬۰۰۰'), 'دوازده میلیون و سیصد و پنجاه هزار');
assert.equal(expandPersianNumbers('1.05'), 'یک ممیز صفر پنج');
assert.equal(expandPersianNumbers('10:30'), 'ده و سی دقیقه');
assert.equal(expandPersianNumbers('85%'), 'هشتاد و پنج درصد');
assert.equal(expandPersianNumbers('۸۵٪'), 'هشتاد و پنج درصد');
assert.equal(expandPersianNumbers('3-5'), 'سه تا پنج');
assert.equal(expandPersianNumbers('2026-11-26'), 'دو هزار و بیست و شش، یازده، بیست و شش');
assert.equal(expandPersianNumbers('A12B'), 'A12B');

assert.deepEqual(
  splitTinyAvaSentences('سلام. آیا ساعت ۱۰:۳۰ آماده‌ای؟'),
  ['سلام.', 'آیا ساعت ده و سی دقیقه آماده‌ای?']
);
const timedSegments = segmentTinyAvaText('سلام، حال شما چطور است؟');
assert.deepEqual(timedSegments.map(segment => segment.text), ['سلام,', 'حال شما چطور است?']);
assert.equal(timedSegments[0].pauseAfterMs, 135);
assert.equal(timedSegments[1].pauseAfterMs, 390);
const lineSegments = segmentTinyAvaText('خط یک\nخط دو\n\nبند سه.');
assert.deepEqual(lineSegments.map(segment => segment.pauseAfterMs), [245, 610, 330]);
assert.equal(segmentTinyAvaText('[[مکث کوتاه]]سلام.')[0].pauseBeforeMs, 190);
const boundedSegments = segmentTinyAvaText('واژه '.repeat(200), 48);
const unspacedBoundedSegments = segmentTinyAvaText('x'.repeat(500), 48);
assert.ok([...boundedSegments, ...unspacedBoundedSegments].every(segment => segment.type !== 'speech' || segment.text.length <= 48));
const expressiveSegments = segmentTinyAvaText('این [[کشیده:واژه]] است [[آه]] [[نفس]] ادامه دارد.');
assert.ok(expressiveSegments.some(segment => segment.type === 'breath' && segment.durationMs === 230));
assert.ok(expressiveSegments.some(segment => segment.type === 'speech' && segment.text === 'واژه' && segment.speedScale === 0.76));
assert.ok(expressiveSegments.some(segment => segment.type === 'speech' && segment.text === 'آه'));
const pauseCueSegments = segmentTinyAvaText('پیش از مکث [[مکث بلند]] پس از مکث.');
assert.equal(pauseCueSegments[0].pauseAfterMs, 720);
assert.deepEqual([...byteT5Encode('ا')], [219n, 170n, 1n]);
const phoneResult = tinyAvaPhonemeIdsFromRepr1('salAm hAl-e');
assert.deepEqual(phoneResult.symbols, ['<bos>', 's', 'a', 'l', 'ɑ', 'm', '<sp>', 'h', 'ɑ', 'l', 'e', '<eos>']);
assert.equal(phoneResult.ids.length, phoneResult.stress.length);
assert.ok(phoneResult.ids.every(Number.isInteger));

console.log('tiny-ava core smoke test passed (pinned metadata, Persian normalization, bounded segments, pauses, cues and phoneme IDs).');
