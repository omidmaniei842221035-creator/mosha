/* Pinned tiny-ava v2 assets plus Persian text/phoneme helpers. No runtime downloads happen here. */
export const TINY_AVA_MODEL_ID = 'tiny-ava-v2';
export const TINY_AVA_VERSION = 'v2.0.0';
export const TINY_AVA_TOTAL_BYTES = 44799403;

export const TINY_AVA_ASSETS = Object.freeze([
  Object.freeze({
    id: 'tts',
    label: 'مدل گفتار tiny-ava',
    url: 'https://huggingface.co/mehdi-hf/tiny-ava/resolve/d1064f5a0b57a04b6d540588e0824e6ce259a7ab/onnx/tiny-ava-v2.onnx',
    bytes: 36034045,
    sha256: 'ee49d4f51882cd7acbcd28ce7ace570e47897018d03db410b6b883bcc818bed2'
  }),
  Object.freeze({
    id: 'g2pEncoder',
    label: 'واج‌شناس فارسی · بخش یک',
    url: 'https://huggingface.co/spaces/mehdi-hf/tiny-ava-demo/resolve/27c0e1c7bef79ead8761dad4caaa9313371adde6/assets/g2p/g2p_encoder.onnx',
    bytes: 3459754,
    sha256: 'aa22db88525e657f1c1d44ba55ebb1e7e08d8693dcc6a5a22a5c053b518a600f'
  }),
  Object.freeze({
    id: 'g2pDecoder',
    label: 'واج‌شناس فارسی · بخش دو',
    url: 'https://huggingface.co/spaces/mehdi-hf/tiny-ava-demo/resolve/27c0e1c7bef79ead8761dad4caaa9313371adde6/assets/g2p/g2p_decoder.onnx',
    bytes: 5305604,
    sha256: '8d6635098a78d9c3c6af4fb0d01f7b6a5f3d4396fc10b0e61959b384c237a4bc'
  })
]);

export const TINY_AVA_VOICES = Object.freeze({
  parisa: Object.freeze({ title: 'پریسا · صدای زنانه', modelIndex: 0 }),
  mana: Object.freeze({ title: 'مانا · صدای مردانهٔ استودیویی', modelIndex: 2 })
});

const SYMBOLS = Object.freeze([
  '<pad>', '<bos>', '<eos>', '<sp>', '<unk>',
  ',', '.', '?', '!', ';', ':', '"', "'", '(', ')', '—', '…',
  'p', 'b', 't', 'd', 'k', 'ɡ', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'h',
  'm', 'n', 'ŋ', 'l', 'ɹ', 'j', 'w', 'tʃ', 'dʒ', 'ɾ', 'ʔ', 'q', 'x', 'r',
  'ə', 'ɐ', 'ɚ', 'ᵻ', 'ɪ', 'i', 'iː', 'ɛ', 'æ', 'ʌ', 'ɑː', 'ɔ', 'ɔː', 'ʊ', 'uː', 'ɜː',
  'eɪ', 'aɪ', 'ɔɪ', 'oʊ', 'aʊ', 'iə', 'oː',
  'ɑːɹ', 'ɔːɹ', 'oːɹ', 'ɪɹ', 'ɛɹ', 'ʊɹ', 'aɪɚ', 'aɪə', 'əl', 'n̩',
  'a', 'e', 'o', 'u', 'ɑ'
]);

const SYMBOL_TO_ID = Object.freeze(Object.fromEntries(SYMBOLS.map((symbol, index) => [symbol, index])));
const PHONE_SET = new Set(SYMBOLS.slice(17));
const VOWELS = new Set(SYMBOLS.slice(46));
const PUNCTUATION = new Set([',', '.', '?', '!', ';', ':', '"', "'", '(', ')', '—', '…']);
const REPR1_TO_IPA = Object.freeze({
  a: 'a', A: 'ɑ', e: 'e', o: 'o', i: 'i', u: 'u',
  p: 'p', b: 'b', t: 't', d: 'd', k: 'k', g: 'ɡ', q: 'q', '?': 'ʔ',
  f: 'f', v: 'v', s: 's', z: 'z', S: 'ʃ', Z: 'ʒ', ';': 'ʒ', x: 'x', h: 'h',
  C: 'tʃ', j: 'dʒ', m: 'm', n: 'n', l: 'l', r: 'r', y: 'j'
});
const CHAR_MAP = Object.freeze({
  '\u064a': '\u06cc', '\u0649': '\u06cc', '\u0643': '\u06a9', '\u0629': '\u0647',
  '\u06c0': '\u0647', '\u0623': '\u0627', '\u0625': '\u0627', '\u0671': '\u0627',
  '\u0640': '', '\u200b': '', '\u200d': '', '\ufeff': '', '\u00a0': ' ',
  '،': ',', '؟': '?', '؛': ';', '«': '"', '»': '"',
  '‘': "'", '’': "'", '“': '"', '”': '"', '–': '—', '―': '—',
  '٪': '%', '٫': '.', '٬': ','
});

const ONES = Object.freeze(['صفر', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']);
const TEENS = Object.freeze(['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']);
const TENS = Object.freeze(['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']);
const HUNDREDS = Object.freeze(['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']);
const SCALES = Object.freeze(['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون', 'کوادریلیون']);

function normalizeDigits(value) {
  return String(value).replace(/[۰-۹٠-٩]/gu, digit => {
    const code = digit.codePointAt(0);
    const zero = code >= 0x06f0 && code <= 0x06f9 ? 0x06f0 : 0x0660;
    return String(code - zero);
  });
}

function underThousand(number) {
  const value = Math.trunc(number);
  if (value <= 0 || value >= 1000) return value === 0 ? '' : String(value);
  const parts = [];
  let remainder = value;
  if (remainder >= 100) {
    parts.push(HUNDREDS[Math.floor(remainder / 100)]);
    remainder %= 100;
  }
  if (remainder >= 20) {
    parts.push(TENS[Math.floor(remainder / 10)]);
    remainder %= 10;
  } else if (remainder >= 10) {
    parts.push(TEENS[remainder - 10]);
    remainder = 0;
  }
  if (remainder > 0) parts.push(ONES[remainder]);
  return parts.join(' و ');
}

function integerToPersianWords(value) {
  let number;
  try { number = BigInt(value); }
  catch (_) { return String(value); }
  if (number === 0n) return ONES[0];
  if (number < 0n) return `منفی ${integerToPersianWords(-number)}`;

  const groups = [];
  let scale = 0;
  while (number > 0n && scale < SCALES.length) {
    const group = Number(number % 1000n);
    if (group) {
      const groupWords = underThousand(group);
      const scaleName = SCALES[scale];
      const valueWords = scale === 1 && group === 1 ? '' : groupWords;
      groups.unshift([valueWords, scaleName].filter(Boolean).join(' '));
    }
    number /= 1000n;
    scale++;
  }
  if (number > 0n) return String(value);
  return groups.join(' و ');
}

function numberToPersianWords(rawValue) {
  const raw = String(rawValue).trim();
  const negative = raw.startsWith('-');
  const unsigned = raw.replace(/^[+-]/u, '');
  let decimalAt = Math.max(unsigned.lastIndexOf('.'), unsigned.lastIndexOf(','));
  const hasDecimal = decimalAt >= 0 && (
    unsigned[decimalAt] === '.' || !/^\d{1,3}(?:,\d{3})+$/u.test(unsigned)
  );
  let integerPart = hasDecimal ? unsigned.slice(0, decimalAt) : unsigned;
  let fractionPart = hasDecimal ? unsigned.slice(decimalAt + 1) : '';
  integerPart = integerPart.replace(/[,.]/gu, '');
  fractionPart = fractionPart.replace(/[,.]/gu, '');
  const integerWords = integerToPersianWords(integerPart || '0');
  if (!hasDecimal || !fractionPart) return `${negative ? 'منفی ' : ''}${integerWords}`;
  const decimalWords = Array.from(fractionPart, digit => ONES[Number(digit)]).join(' ');
  return `${negative ? 'منفی ' : ''}${integerWords} ممیز ${decimalWords}`;
}

const NUMBER_PATTERN = String.raw`(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d+,\d+|\d+)`;

export function expandPersianNumbers(value) {
  let text = normalizeDigits(String(value || '')).replace(/٬/gu, ',').replace(/٫/gu, '.').replace(/٪/gu, '%');
  const replaceNumber = raw => numberToPersianWords(raw);
  const boundaryStart = String.raw`(?<![\p{L}\p{N}])`;
  const boundaryEnd = String.raw`(?![\p{L}\p{N}])`;

  text = text.replace(new RegExp(String.raw`${boundaryStart}(\d{3,4})[-/](\d{1,2})[-/](\d{1,2})${boundaryEnd}`, 'gu'), (_match, year, month, day) =>
    `${integerToPersianWords(year)}، ${integerToPersianWords(month)}، ${integerToPersianWords(day)}`);
  text = text.replace(new RegExp(String.raw`${boundaryStart}(${NUMBER_PATTERN}):(\d{2})${boundaryEnd}`, 'gu'), (_match, hour, minute) => {
    const minuteValue = Number(minute);
    const minuteWords = minuteValue === 0 ? '' : ` و ${integerToPersianWords(String(minuteValue))} دقیقه`;
    return `${replaceNumber(hour)}${minuteWords}`;
  });
  text = text.replace(new RegExp(String.raw`${boundaryStart}(\d+)[-–](\d+)${boundaryEnd}`, 'gu'), (_match, first, last) =>
    `${integerToPersianWords(first)} تا ${integerToPersianWords(last)}`);
  text = text.replace(/(\d)\/(?=\d)/gu, '$1، ');
  text = text.replace(new RegExp(String.raw`${boundaryStart}([+-]?${NUMBER_PATTERN})[\t ]*%(?![\p{L}\p{N}])`, 'gu'), (_match, raw) => `${replaceNumber(raw)} درصد`);
  text = text.replace(new RegExp(String.raw`${boundaryStart}([+-]?${NUMBER_PATTERN})${boundaryEnd}`, 'gu'), (_match, raw) => replaceNumber(raw));
  return text;
}

export function normalizeTinyAvaText(value) {
  let text = String(value || '').normalize('NFC');
  let mapped = '';
  for (const character of text) mapped += Object.prototype.hasOwnProperty.call(CHAR_MAP, character) ? CHAR_MAP[character] : character;
  // Keep ZWNJ and Arabic vowel marks: both can help the Persian G2P model disambiguate pronunciation.
  mapped = mapped
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/[\t\f\v]+/gu, ' ')
    .replace(/\r\n?/gu, '\n')
    .replace(/\.{3,}/gu, '…')
    .replace(/-{2,}|\s-\s/gu, '—')
    .replace(/\u200c+/gu, '\u200c')
    .replace(/\s+\u200c|\u200c\s+/gu, ' ');
  return expandPersianNumbers(mapped).replace(/\s+/gu, ' ').trim();
}

const TINY_AVA_PAUSE_AFTER_PUNCTUATION = Object.freeze({
  ',': 135, '،': 135, ':': 185, ';': 235, '؛': 235, '—': 245,
  '.': 330, '!': 365, '?': 390, '؟': 390, '…': 540
});
const TINY_AVA_CLOSING_PUNCTUATION = new Set(['"', "'", ')', ']', '}', '»', '”', '’']);

function tinyAvaSegment(text, pauseAfterMs, options) {
  return {
    type: 'speech',
    text,
    pauseAfterMs: Math.max(0, Math.round(Number(pauseAfterMs) || 0)),
    pauseBeforeMs: 0,
    speedScale: Number(options.speedScale) || 1,
    pitchRangeScale: Number(options.pitchRangeScale) || 1
  };
}

function appendBoundedTinyAvaSegment(output, rawText, pauseAfterMs, options, maxChars) {
  const text = String(rawText || '').trim();
  if (!text) return;
  if (text.length <= maxChars) {
    output.push(tinyAvaSegment(text, pauseAfterMs, options));
    return;
  }
  const words = text.match(/\S+/gu) || [];
  let fragment = '';
  const flush = pause => {
    const part = fragment.trim();
    if (!part) return;
    output.push(tinyAvaSegment(part, pause, options));
    fragment = '';
  };
  for (const word of words) {
    if (fragment && `${fragment} ${word}`.length > maxChars) flush(85);
    if (!fragment && word.length > maxChars) {
      // Extremely long unspaced text is split to keep G2P/ONNX input bounded.
      const characters = Array.from(word);
      for (let offset = 0; offset < characters.length; offset += maxChars) {
        const part = characters.slice(offset, offset + maxChars).join('');
        const finalPart = offset + maxChars >= characters.length;
        output.push(tinyAvaSegment(part, finalPart ? pauseAfterMs : 85, options));
      }
      continue;
    }
    fragment = fragment ? `${fragment} ${word}` : word;
  }
  if (fragment) output.push(tinyAvaSegment(fragment, pauseAfterMs, options));
}

function splitTinyAvaLine(value, options, maxChars) {
  const line = normalizeTinyAvaText(value);
  if (!line) return [];
  const output = [];
  let buffer = '';
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    buffer += character;
    if (!Object.prototype.hasOwnProperty.call(TINY_AVA_PAUSE_AFTER_PUNCTUATION, character)) continue;
    let pause = TINY_AVA_PAUSE_AFTER_PUNCTUATION[character];
    let next = index + 1;
    while (next < line.length && Object.prototype.hasOwnProperty.call(TINY_AVA_PAUSE_AFTER_PUNCTUATION, line[next])) {
      buffer += line[next];
      pause = Math.max(pause, TINY_AVA_PAUSE_AFTER_PUNCTUATION[line[next]]);
      next++;
    }
    while (next < line.length && TINY_AVA_CLOSING_PUNCTUATION.has(line[next])) {
      buffer += line[next];
      next++;
    }
    appendBoundedTinyAvaSegment(output, buffer, pause, options, maxChars);
    buffer = '';
    index = next - 1;
  }
  if (buffer.trim()) appendBoundedTinyAvaSegment(output, buffer, 0, options, maxChars);
  return output;
}

function splitTinyAvaPlainText(value, options, maxChars) {
  const lines = String(value || '').replace(/\r\n?/gu, '\n').split('\n');
  const output = [];
  for (let index = 0; index < lines.length; index++) {
    const lineSegments = splitTinyAvaLine(lines[index], options, maxChars);
    if (!lineSegments.length) continue;
    let nextNonEmpty = index + 1;
    while (nextNonEmpty < lines.length && !lines[nextNonEmpty].trim()) nextNonEmpty++;
    if (nextNonEmpty < lines.length) {
      const blankLines = nextNonEmpty - index - 1;
      const lineBreakPause = blankLines ? 610 + Math.min(2, blankLines - 1) * 120 : 245;
      const last = lineSegments[lineSegments.length - 1];
      last.pauseAfterMs = Math.max(last.pauseAfterMs, lineBreakPause);
    }
    output.push(...lineSegments);
  }
  return output;
}

/** Parse punctuation timing and optional inline performance cues for local tiny-ava output. */
export function segmentTinyAvaText(value, maxChars = 180) {
  const limit = Math.max(48, Math.min(360, Math.trunc(Number(maxChars) || 180)));
  const output = [];
  let pendingLeadingPause = 0;
  let cursor = 0;
  const appendSpeech = (text, options = {}) => {
    const segments = splitTinyAvaPlainText(text, options, limit);
    if (!segments.length) return;
    const previous = output[output.length - 1];
    if (previous && previous.pauseAfterMs === 0) previous.pauseAfterMs = 55;
    if (pendingLeadingPause) {
      segments[0].pauseBeforeMs = pendingLeadingPause;
      pendingLeadingPause = 0;
    }
    output.push(...segments);
  };
  const addPause = milliseconds => {
    const previous = output[output.length - 1];
    const duration = Math.max(0, Math.min(2200, Math.round(Number(milliseconds) || 0)));
    if (previous) previous.pauseAfterMs = Math.min(2600, previous.pauseAfterMs + duration);
    else pendingLeadingPause = Math.min(2600, pendingLeadingPause + duration);
  };

  const markers = /\[\[([\s\S]*?)\]\]/gu;
  let match;
  while ((match = markers.exec(String(value || '')))) {
    appendSpeech(String(value || '').slice(cursor, match.index));
    const cue = String(match[1] || '').trim();
    const normalizedCue = cue.toLowerCase();
    const pauseCues = {
      'مکث کوتاه': 190, 'pause:short': 190, 'مکث': 340, pause: 340,
      'مکث بلند': 720, 'pause:long': 720
    };
    if (Object.prototype.hasOwnProperty.call(pauseCues, normalizedCue)) {
      addPause(pauseCues[normalizedCue]);
    } else if (['نفس', 'مکث تنفسی', 'breath'].includes(normalizedCue)) {
      const previous = output[output.length - 1];
      if (previous && previous.pauseAfterMs < 110) previous.pauseAfterMs = 110;
      output.push({ type: 'breath', durationMs: 230, pauseAfterMs: 155, pauseBeforeMs: pendingLeadingPause });
      pendingLeadingPause = 0;
    } else if (/^(?:کشیده|stretch)\s*:/iu.test(cue)) {
      const phrase = cue.replace(/^(?:کشیده|stretch)\s*:/iu, '').trim();
      appendSpeech(phrase, { speedScale: 0.76, pitchRangeScale: 1.12 });
    } else if (['آه', 'اوه', 'هوم', 'sigh'].includes(normalizedCue)) {
      const interjection = normalizedCue === 'sigh' ? 'آه' : cue;
      appendSpeech(interjection, { speedScale: 0.94, pitchRangeScale: 1.08 });
    } else {
      appendSpeech(match[0]);
    }
    cursor = markers.lastIndex;
  }
  appendSpeech(String(value || '').slice(cursor));
  if (pendingLeadingPause && output.length) output[0].pauseBeforeMs = pendingLeadingPause;
  return output;
}

export function splitTinyAvaSentences(value) {
  const cleaned = normalizeTinyAvaText(value);
  if (!cleaned) return [];
  return cleaned.split(/(?<=[.!؟?…]["')\]»]?)\s+/u).map(sentence => sentence.trim()).filter(sentence => /[\p{L}\p{N}]/u.test(sentence));
}

function ensureSentenceMark(value, fallback = '.') {
  const text = String(value || '').trim();
  if (!text) return text;
  const closers = text.match(/["')\]}»”’]*$/u)?.[0] || '';
  const body = closers ? text.slice(0, -closers.length) : text;
  return '.!؟?…،,;؛:—'.includes(body.slice(-1)) ? text : `${body}${fallback}${closers}`;
}

function splitPunctuation(text) {
  const pieces = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (!PUNCTUATION.has(character)) continue;
    const previous = index > 0 ? text[index - 1] : '';
    const next = index + 1 < text.length ? text[index + 1] : '';
    if (character === "'" && /[A-Za-z0-9]/u.test(previous) && /[A-Za-z0-9]/u.test(next)) continue;
    if ('.:,'.includes(character) && /\d/u.test(previous) && /\d/u.test(next)) continue;
    const segment = text.slice(start, index).trim();
    if (segment) pieces.push([false, segment]);
    pieces.push([true, character]);
    start = index + 1;
  }
  const tail = text.slice(start).trim();
  if (tail) pieces.push([false, tail]);
  return pieces;
}

function splitLanguageSpans(text) {
  const hasPersian = /[\u0600-\u06ff]/u.test(text);
  const hasLatin = /[A-Za-z]/u.test(text);
  if (hasPersian && !hasLatin) return [['fa', text]];
  if (hasLatin && !hasPersian) return [['en', text]];
  if (!hasPersian && !hasLatin) return [['fa', text]];
  const spans = [];
  let current = null;
  let buffer = [];
  for (const token of text.split(/\s+/u)) {
    const language = /[\u0600-\u06ff]/u.test(token) ? 'fa' : (/[A-Za-z]/u.test(token) ? 'en' : (current || 'fa'));
    if (current && language !== current) {
      spans.push([current, buffer.join(' ')]);
      buffer = [];
    }
    current = language;
    buffer.push(token);
  }
  if (buffer.length && current) spans.push([current, buffer.join(' ')]);
  return spans;
}

function fallbackEnglishWords(text) {
  const result = [];
  const letterPhones = { a: 'æ', b: 'b', c: 'k', d: 'd', e: 'ɛ', f: 'f', g: 'ɡ', h: 'h', i: 'ɪ', j: 'dʒ', k: 'k', l: 'l', m: 'm', n: 'n', o: 'ɑː', p: 'p', q: 'k', r: 'ɹ', s: 's', t: 't', u: 'ʌ', v: 'v', w: 'w', x: 'k s', y: 'j', z: 'z' };
  const digraphs = [['tion', ['ʃ', 'ə', 'n']], ['ch', ['tʃ']], ['sh', ['ʃ']], ['th', ['θ']], ['ph', ['f']], ['ng', ['ŋ']], ['ee', ['iː']], ['ea', ['iː']], ['oo', ['uː']]];
  for (const wordMatch of String(text).matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/gu)) {
    const word = wordMatch[0].toLowerCase();
    const phones = [];
    for (let index = 0; index < word.length;) {
      const rest = word.slice(index);
      const match = digraphs.find(([spelling]) => rest.startsWith(spelling));
      if (match) {
        phones.push(...match[1].map(phone => [phone, 0]));
        index += match[0].length;
        continue;
      }
      const mapped = letterPhones[word[index]];
      if (mapped) phones.push(...mapped.split(' ').map(phone => [phone, 0]));
      index++;
    }
    if (phones.length) {
      for (let index = phones.length - 1; index >= 0; index--) {
        if (VOWELS.has(phones[index][0])) { phones[index][1] = 1; break; }
      }
      result.push(phones);
    }
  }
  return result;
}

function repr1ToWords(value) {
  const words = [];
  for (const rawWord of String(value || '').trim().split(/\s+/u)) {
    if (!rawWord) continue;
    const match = rawWord.match(/^(.*?)-(ye|e)$/u);
    let stem = match && match[1] ? match[1].replace(/-/gu, '') : rawWord.replace(/-/gu, '');
    const ezafe = match && match[1] ? match[2] : '';
    if (stem.length >= 2 && stem[0] === '?' && 'aAeoiu'.includes(stem[1])) stem = stem.slice(1);
    const phones = [];
    for (let index = 0; index < stem.length; index++) {
      if (index + 1 < stem.length && stem[index] === 'z' && stem[index + 1] === 'h') {
        phones.push(['ʒ', 0]);
        index++;
        continue;
      }
      const ipa = REPR1_TO_IPA[stem[index]];
      if (ipa) phones.push([ipa, 0]);
    }
    for (let index = phones.length - 1; index >= 0; index--) {
      if (VOWELS.has(phones[index][0])) { phones[index][1] = 1; break; }
    }
    if (ezafe) {
      for (const character of ezafe) {
        const ipa = REPR1_TO_IPA[character];
        if (ipa) phones.push([ipa, VOWELS.has(ipa) ? 2 : 0]);
      }
    }
    if (phones.length) words.push(phones);
  }
  return words;
}

function ensurePhoneWordsSeparate(symbols, stress, words) {
  for (const word of words) {
    const previous = symbols[symbols.length - 1];
    if (PHONE_SET.has(previous) || previous === '<unk>') {
      symbols.push('<sp>');
      stress.push(0);
    }
    for (const [phone, level] of word) {
      symbols.push(PHONE_SET.has(phone) ? phone : '<unk>');
      stress.push(PHONE_SET.has(phone) ? level : 0);
    }
  }
}


export function byteT5Encode(value) {
  const bytes = new TextEncoder().encode(String(value));
  const output = new BigInt64Array(bytes.length + 1);
  for (let index = 0; index < bytes.length; index++) output[index] = BigInt(bytes[index] + 3);
  output[bytes.length] = 1n;
  return output;
}

async function runPersianG2P(text, encoderSession, decoderSession, ort) {
  const inputIds = byteT5Encode(text);
  const sourceLength = inputIds.length;
  const attention = new BigInt64Array(sourceLength).fill(1n);
  const encoderOutput = await encoderSession.run({
    input_ids: new ort.Tensor('int64', inputIds, [1, sourceLength]),
    attention_mask: new ort.Tensor('int64', attention, [1, sourceLength])
  });
  const decoderIds = [0];
  let ended = false;
  for (let step = 0; step < 256; step++) {
    const decoderOutput = await decoderSession.run({
      decoder_input_ids: new ort.Tensor('int64', BigInt64Array.from(decoderIds.map(BigInt)), [1, decoderIds.length]),
      encoder_hidden_states: encoderOutput.encoder_hidden_states,
      encoder_attention_mask: new ort.Tensor('int64', attention, [1, sourceLength])
    });
    const logits = decoderOutput.logits.data;
    const vocabularySize = decoderOutput.logits.dims[2];
    const offset = (decoderIds.length - 1) * vocabularySize;
    let bestId = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < vocabularySize; index++) {
      if (logits[offset + index] > bestValue) {
        bestValue = logits[offset + index];
        bestId = index;
      }
    }
    if (bestId === 1) { ended = true; break; }
    decoderIds.push(bestId);
  }
  if (!ended) throw new Error('واج‌شناس فارسی به پایان نرسید؛ متن را به جمله‌های کوتاه‌تر تقسیم کنید.');
  const bytes = [];
  for (const id of decoderIds.slice(1)) if (id >= 3 && id <= 258) bytes.push(id - 3);
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)).trim();
}

export async function phonemizeTinyAvaSentence(sentence, encoderSession, decoderSession, ort, options = {}) {
  const normalized = ensureSentenceMark(normalizeTinyAvaText(sentence), options.continuation ? ',' : '.');
  const symbols = ['<bos>'];
  const stress = [0];
  const punctuationParts = splitPunctuation(normalized);
  for (const [isPunctuation, value] of punctuationParts) {
    if (isPunctuation) {
      if (symbols[symbols.length - 1] !== value && Object.prototype.hasOwnProperty.call(SYMBOL_TO_ID, value)) {
        symbols.push(value);
        stress.push(0);
      }
      continue;
    }
    for (const [language, span] of splitLanguageSpans(value)) {
      const words = language === 'fa'
        ? repr1ToWords(await runPersianG2P(span, encoderSession, decoderSession, ort))
        : fallbackEnglishWords(span);
      ensurePhoneWordsSeparate(symbols, stress, words);
    }
  }
  symbols.push('<eos>');
  stress.push(0);
  if (!symbols.some(symbol => PHONE_SET.has(symbol))) return null;
  if (symbols.length > 512) throw new Error('این جمله برای مدل طولانی است؛ آن را به چند جملهٔ کوتاه‌تر تقسیم کنید.');
  return { symbols, ids: symbols.map(symbol => SYMBOL_TO_ID[symbol]), stress };
}

export function tinyAvaPhonemeIdsFromRepr1(value) {
  const words = repr1ToWords(value);
  const symbols = ['<bos>'];
  const stress = [0];
  ensurePhoneWordsSeparate(symbols, stress, words);
  symbols.push('<eos>');
  stress.push(0);
  return { symbols, ids: symbols.map(symbol => SYMBOL_TO_ID[symbol]), stress };
}
