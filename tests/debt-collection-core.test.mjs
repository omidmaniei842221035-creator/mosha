import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDebtVoiceSignal,
  buildDebtAssistantMessages,
  buildDebtFallbackReply,
  classifyDebtInteraction,
  extractDebtCustomerReply,
  selectDebtSpeechProfile
} from '../debt-collection-core.mjs';

test('classifies common Persian collection turns with reviewable lexical cues', () => {
  const cases = [
    ['شماره اشتباه است', 'wrong_person'],
    ['پرداخت کردم، رسید دارم', 'payment_reported'],
    ['مبلغ اشتباه است', 'dispute'],
    ['توان پرداخت ندارم', 'hardship'],
    ['از شما شکایت می‌کنم', 'complaint'],
    ['فردا پرداخت می‌کنم', 'promise'],
    ['مبلغ بدهی چقدر است؟', 'information'],
    ['پرداخت نمی‌کنم', 'refusal'],
    ['سلام، وقت بخیر', 'general']
  ];
  for (const [utterance, expected] of cases) {
    const result = classifyDebtInteraction(utterance);
    assert.equal(result.id, expected, utterance);
    assert.match(result.certainty, /واژگانی|کارشناس/u);
  }
});

test('maps transcript interaction categories to restrained local delivery profiles', () => {
  const hardship = classifyDebtInteraction('توان پرداخت ندارم');
  const empathetic = selectDebtSpeechProfile(hardship.id, hardship.tone);
  assert.equal(empathetic.style, 'supportive');
  assert.match(empathetic.label, /همدلانه/u);
  assert.ok(empathetic.automaticCues.some(cue => /مکث/u.test(cue)));
  assert.ok(empathetic.automaticCues.some(cue => /تأکید/u.test(cue)));
  assert.equal(selectDebtSpeechProfile('refusal', 'قاطع و محترمانه').style, 'formal');
  assert.equal(selectDebtSpeechProfile('promise', 'همکارانه و روشن').style, 'conversational');
  assert.equal(selectDebtSpeechProfile('unrecognized').style, 'conversational');
  assert.match(empathetic.basis, /نه ویژگی‌های صوتی/u);
});

test('extracts only the customer-facing paragraph for local speech preview', () => {
  assert.equal(
    extractDebtCustomerReply('پاسخ پیشنهادی به مشتری: متوجه شدم. اجازه بدهید بررسی کنم.\nگام بعدی کارشناس: مورد را در سامانهٔ رسمی پیگیری کنید.'),
    'متوجه شدم. اجازه بدهید بررسی کنم.'
  );
  assert.equal(extractDebtCustomerReply('**پاسخ به مشتری:** سلام.\n**گام بعدی کارشناس:** ارجاع به سرپرست.'), 'سلام.');
  assert.equal(extractDebtCustomerReply('پاسخ پیشنهادی به مشتری: سلام.\n**گام بعدی کارشناس:** ارجاع به سرپرست.'), 'سلام.');
  assert.equal(extractDebtCustomerReply('### پاسخ پیشنهادی به مشتری\nسلام.\n### گام بعدی کارشناس\nارجاع به سرپرست.'), 'سلام.');
});

test('normalizes Arabic/Persian letter variants and conservatively prioritizes a reported payment', () => {
  assert.equal(classifyDebtInteraction('پرداخت مي كنم').id, 'promise');
  assert.equal(classifyDebtInteraction('پرداخت کردم، ولی مبلغ بدهی اشتباه است').id, 'payment_reported');
});

test('summarizes optional audio levels without returning audio or inferring emotion', () => {
  const report = analyzeDebtVoiceSignal({
    rmsFrames: [...Array(30).fill(0.001), ...Array(20).fill(0.25)],
    durationMs: 4000,
    transcript: 'این یک متن کوتاه است برای بررسی سرعت گفتار مشتری در هنگام مکالمه امروز'
  });
  assert.equal(report.frameCount, 50);
  assert.equal(report.relativeSignal, 'سیگنال بلندتر در این ضبط');
  assert.ok(report.wordsPerMinute > 190);
  assert.ok(report.cues.some(cue => /خشم|حالت روانی|میکروفون/u.test(cue)));
  assert.match(report.limitation, /احساس، سلامت/u);
  assert.equal('rmsFrames' in report, false);
  assert.equal('transcript' in report, false);
});

test('ignores invalid RMS values and avoids dividing by a zero/unknown duration', () => {
  const report = analyzeDebtVoiceSignal({ rmsFrames: [-1, Number.NaN, Number.POSITIVE_INFINITY, 0.25], durationMs: Number.POSITIVE_INFINITY });
  assert.equal(report.frameCount, 1);
  assert.equal(report.durationMs, 0);
  assert.equal(report.wordsPerMinute, null);
  assert.equal(report.relativeSignal, 'سیگنال بلندتر در این ضبط');
});

test('uses only a generic identity-check fallback until identity is verified', () => {
  const reply = buildDebtFallbackReply({ interaction: 'payment_reported', identityVerified: false });
  assert.match(reply, /هویت/u);
  assert.doesNotMatch(reply, /مبلغ|مانده|رسید|بدهی/u);
  assert.match(buildDebtFallbackReply({ interaction: 'payment_reported', identityVerified: true }), /سامانهٔ رسمی/u);
});

test('prompt builder gates verified financial context and sanitizes technical voice metrics', () => {
  const unverified = buildDebtAssistantMessages({
    transcript: 'شماره حساب ۱۲۳۴۵۶۷۸۹ را فرستادم؛ پرداخت نمی‌کنم',
    interaction: 'hardship',
    tone: 'همدلانه و بدون فشار',
    identityVerified: false,
    factsVerified: true,
    verifiedFacts: 'مانده محرمانه ۹۹۹۹',
    approvedActions: 'گزینه محرمانه',
    voiceSummary: { wordsPerMinute: Infinity, quietPercent: 'bad', relativeSignal: 'x'.repeat(100) },
    turns: Array.from({ length: 9 }, (_, index) => ({ customer: `نوبت ${index}`, agent: index === 8 ? 'پاسخ پیشنهادی ثبت‌نشده' : 'پاسخ', agentReplyConfirmed: index !== 8 }))
  });
  const payload = JSON.parse(unverified[1].content);
  assert.equal(payload.speechDeliveryProfile.style, 'supportive');
  assert.equal(payload.speechDeliveryProfile.expressiveness, 0.98);
  assert.equal(payload.speechDeliveryProfile.automaticCues.length, 2);
  assert.match(unverified[0].content, /نشانه‌های فنیِ اجرا/u);
  assert.equal(payload.verifiedBankFacts, null);
  assert.equal(payload.approvedActionsOnly, null);
  assert.equal(payload.factsVerifiedInOfficialSystem, false);
  assert.equal(payload.technicalVoiceCues.wordsPerMinute, null);
  assert.equal(payload.technicalVoiceCues.quietPercent, null);
  assert.equal(payload.technicalVoiceCues.relativeSignal.length, 60);
  assert.equal(payload.recentSessionTurns.length, 6);
  assert.equal(payload.recentSessionTurns[5].agent, '');
  assert.equal(payload.recentSessionTurns[5].agentReplyConfirmed, false);
  assert.match(unverified[0].content, /دادهٔ نقل‌شده و غیرقابل‌اعتماد/u);
  assert.match(unverified[0].content, /احساس، سلامت، صداقت/u);
  assert.doesNotMatch(unverified[1].content, /مانده محرمانه|گزینه محرمانه/u);

  const verified = buildDebtAssistantMessages({
    identityVerified: true,
    factsVerified: true,
    verifiedFacts: 'ماندهٔ تأییدشده: ۲ میلیون ریال',
    approvedActions: 'ارجاع به واحد مجاز'
  });
  const verifiedPayload = JSON.parse(verified[1].content);
  assert.equal(verifiedPayload.verifiedBankFacts, 'ماندهٔ تأییدشده: ۲ میلیون ریال');
  assert.equal(verifiedPayload.approvedActionsOnly, 'ارجاع به واحد مجاز');
});
