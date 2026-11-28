/* Turn-taking debt-collection coaching. Speech recognition is forced on-device; audio levels are reduced to transient RMS numbers only. */
(function () {
  'use strict';

  const LANGUAGE = 'fa-IR';
  const MAX_TURNS = 8;
  const state = {
    core: null,
    recognition: null,
    recognitionCtor: null,
    recognitionStatus: 'checking',
    recognitionCheck: 0,
    viewToken: 0,
    starting: false,
    listening: false,
    stopping: false,
    captureToken: 0,
    meter: null,
    voiceSummary: null,
    turns: [],
    formSnapshot: null,
    analysis: null,
    draft: '',
    generating: false,
    lastRecognitionError: ''
  };
  const $ = id => document.getElementById(id);
  const isDebtCollectionViewActive = () => !!$('abTitle') && $('abTitle').textContent === 'پیگیری و وصول مطالبات';

  function setStatus(message, kind = 'idle') {
    const node = $('dcStatus');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = kind;
  }

  function setModelStatus(message, kind = 'idle') {
    const node = $('dcModelStatus');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = kind;
  }

  function updateSpeechControls() {
    const start = $('dcStartListening');
    const stop = $('dcStopListening');
    const install = $('dcInstallSpeech');
    const refresh = $('dcRefreshSpeech');
    const consent = !!($('dcConsent') && $('dcConsent').checked);
    if (start) start.disabled = !consent || state.listening || state.starting || !['available', 'forced-local'].includes(state.recognitionStatus);
    if (stop) stop.disabled = !(state.listening || state.starting);
    if (refresh) refresh.disabled = state.recognitionStatus === 'checking' || state.listening || state.starting;
    if (install) {
      const canInstall = state.recognitionStatus === 'downloadable' && state.recognitionCtor && typeof state.recognitionCtor.install === 'function';
      install.hidden = !canInstall;
      install.disabled = !canInstall || navigator.onLine === false || state.listening || state.starting;
    }
    updateInteractionControls();
  }

  function updateInteractionControls() {
      const busy = state.generating || state.listening || state.starting || state.stopping;
    const analyze = $('dcAnalyze');
    const clear = $('dcClearSession');
    const clearText = $('dcClearText');
    const tone = $('dcTone');
    const setup = $('dcModelSetup');
    const start = $('dcStartListening');
    const micConsent = !!($('dcConsent') && $('dcConsent').checked);
    if (analyze) analyze.disabled = busy;
    if (clear) clear.disabled = busy;
    if (clearText) clearText.disabled = busy;
    if (tone) tone.disabled = state.generating;
    if (setup) setup.disabled = state.generating;
    if (start) start.disabled = !micConsent || busy || !['available', 'forced-local'].includes(state.recognitionStatus);
    const transcript = $('dcTranscript');
    if (transcript) transcript.disabled = busy;
    const voiceSignal = $('dcVoiceSignalEnabled');
    if (voiceSignal) voiceSignal.disabled = busy;
    const actualReply = $('dcActualReply');
    if (actualReply) actualReply.disabled = busy;
    const record = $('dcRecordTurn');
    if (record) record.disabled = busy || !String((transcript || {}).value || '').trim() || !state.draft;
    const identity = $('dcIdentityVerified');
    const identityVerified = !!(identity && identity.checked);
    const facts = $('dcFactsVerified');
    const factsVerified = !!(facts && facts.checked);
    if (identity) identity.disabled = state.generating;
    if (facts) facts.disabled = state.generating || !identityVerified;
    const factsText = $('dcVerifiedFacts');
    if (factsText) factsText.disabled = state.generating || !identityVerified || !factsVerified;
    const actionsEnabled = $('dcApprovedActionsEnabled');
    const actionsChecked = !!(actionsEnabled && actionsEnabled.checked);
    if (actionsEnabled) actionsEnabled.disabled = state.generating || !identityVerified;
    const actionsText = $('dcApprovedActions');
    if (actionsText) actionsText.disabled = state.generating || !identityVerified || !actionsChecked;
  }

  async function refreshSpeechSupport() {
    const check = ++state.recognitionCheck;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    state.recognitionCtor = Ctor;
    state.recognitionStatus = 'checking';
    updateSpeechControls();
    if (window.isSecureContext === false && location.protocol !== 'file:') {
      state.recognitionStatus = 'unsupported';
      setStatus('برای میکروفون، برنامه را از localhost یا HTTPS باز کنید. متن را همچنان می‌توانید دستی وارد کنید.', 'error');
      updateSpeechControls();
      return;
    }
    if (!Ctor) {
      state.recognitionStatus = 'unsupported';
      setStatus('این مرورگر تشخیص گفتار محلی فارسی را در دسترس نمی‌گذارد؛ از ورود دستی متن استفاده کنید.', 'warn');
      updateSpeechControls();
      return;
    }
    let probe;
    try { probe = new Ctor(); }
    catch (_) {
      state.recognitionStatus = 'unsupported';
      setStatus('ساخت موتور دیکته در این مرورگر ممکن نشد؛ ورود دستی متن همچنان فعال است.', 'warn');
      updateSpeechControls();
      return;
    }
    if (!('processLocally' in probe)) {
      state.recognitionStatus = 'unsupported';
      setStatus('این مرورگر امکان اجبار پردازش روی دستگاه را ندارد؛ برای جلوگیری از ارسال صدا، دیکته غیرفعال است. متن را دستی وارد کنید.', 'warn');
      updateSpeechControls();
      return;
    }
    if (typeof Ctor.available !== 'function') {
      state.recognitionStatus = 'forced-local';
      setStatus('مرورگر اجازهٔ اجبار حالت محلی را می‌دهد؛ وضعیت بستهٔ fa-IR قابل استعلام نیست. شروع دیکته همچنان فقط با processLocally انجام می‌شود.', 'warn');
      updateSpeechControls();
      return;
    }
    setStatus('در حال بررسی بستهٔ گفتار فارسی روی دستگاه…', 'busy');
    try {
      const availability = await Ctor.available({ langs: [LANGUAGE], processLocally: true });
      if (check !== state.recognitionCheck || !$('dcStatus')) return;
      if (availability === 'available') {
        state.recognitionStatus = 'available';
        setStatus('موتور و بستهٔ فارسی آماده‌اند؛ گفتار فقط روی همین دستگاه تبدیل می‌شود.', 'ready');
      } else if (availability === 'downloadable') {
        state.recognitionStatus = 'downloadable';
        setStatus(typeof Ctor.install === 'function'
          ? 'بستهٔ fa-IR نصب نیست. می‌توانید با انتخاب خودتان یک‌بار آن را دریافت کنید؛ پس از نصب، دیکته محلی است.'
          : 'بستهٔ fa-IR نصب نیست؛ آن را از تنظیمات مرورگر نصب کنید. هیچ تشخیص ابری جایگزین نمی‌شود.', 'warn');
      } else if (availability === 'downloading') {
        state.recognitionStatus = 'downloading';
        setStatus('مرورگر در حال آماده‌سازی بستهٔ فارسی است؛ پس از اتمام «بررسی دوباره» را بزنید.', 'busy');
      } else {
        state.recognitionStatus = 'unavailable';
        setStatus('بسته یا موتور آفلاین fa-IR در این مرورگر موجود نیست. برای حفظ حریم خصوصی، دیکتهٔ ابری فعال نمی‌شود؛ متن را دستی وارد کنید.', 'warn');
      }
    } catch (error) {
      if (check !== state.recognitionCheck) return;
      state.recognitionStatus = 'error';
      setStatus('بررسی بستهٔ محلی ممکن نشد؛ وضعیت مرورگر و HTTPS/localhost را بررسی کنید. تشخیص ابری استفاده نمی‌شود.', 'warn');
      console.warn('Offline fa-IR recognition availability check failed:', error);
    }
    updateSpeechControls();
  }

  async function installSpeechPack() {
    const Ctor = state.recognitionCtor;
    if (!Ctor || typeof Ctor.install !== 'function' || state.recognitionStatus !== 'downloadable') return;
    if (navigator.onLine === false) {
      setStatus('برای دریافت اولیهٔ بستهٔ گفتار fa-IR اتصال لازم است؛ پس از نصب، دیکته آفلاین است.', 'warn');
      return;
    }
    updateSpeechControls();
    setStatus('درخواست نصب بستهٔ فارسی به مرورگر سپرده شد؛ دریافت فقط برای آماده‌سازی محلی است.', 'busy');
    try {
      const installed = await Ctor.install({ langs: [LANGUAGE] });
      if (installed) {
        setStatus('بسته نصب شد؛ در حال بررسی موتور محلی…', 'busy');
        await refreshSpeechSupport();
      } else {
        setStatus('مرورگر بستهٔ fa-IR را نصب نکرد. متن را دستی وارد کنید یا تنظیمات مرورگر را بررسی کنید.', 'warn');
      }
    } catch (error) {
      setStatus('نصب اولیهٔ بستهٔ فارسی ناموفق بود؛ هیچ سرویس آنلاین جایگزین نشد.', 'warn');
      console.warn('Could not install the local fa-IR recognition pack:', error);
    } finally {
      updateSpeechControls();
    }
  }

  async function startVoiceMeter(token) {
    if (!$('dcVoiceSignalEnabled') || !$('dcVoiceSignalEnabled').checked) return;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function' ||
        !(window.AudioContext || window.webkitAudioContext)) return;
    let stream = null;
    let context = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (token !== state.captureToken || !state.recognition) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      context = new AudioContextCtor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      state.meter = {
        stream,
        context,
        source,
        analyser,
        buffer,
        rmsFrames: [],
        startedAt: performance.now(),
        interval: window.setInterval(() => {
          if (!state.meter || token !== state.captureToken) return;
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (let index = 0; index < buffer.length; index++) sum += buffer[index] * buffer[index];
          state.meter.rmsFrames.push(Math.sqrt(sum / buffer.length));
        }, 100)
      };
    } catch (error) {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (context) { try { await context.close(); } catch (_) {} }
      if (token === state.captureToken) {
        const node = $('dcVoiceMetrics');
        if (node) node.textContent = 'شاخص صوتی در این مرورگر در دسترس نیست؛ متن‌نگاری محلی همچنان می‌تواند کار کند.';
      }
      console.info('Transient local voice-level analysis unavailable:', error && error.name);
    }
  }

  async function finishVoiceMeter() {
    const meter = state.meter;
    state.meter = null;
    if (!meter) return;
    window.clearInterval(meter.interval);
    const durationMs = Math.max(0, performance.now() - meter.startedAt);
    meter.stream.getTracks().forEach(track => track.stop());
    try { await meter.context.close(); } catch (_) {}
    const transcript = ($('dcTranscript') || {}).value || '';
    state.voiceSummary = state.core.analyzeDebtVoiceSignal({ rmsFrames: meter.rmsFrames, durationMs, transcript });
    renderVoiceMetrics();
  }

  function renderVoiceMetrics() {
    const node = $('dcVoiceMetrics');
    if (!node) return;
    const report = state.voiceSummary;
    node.replaceChildren();
    if (!report) {
      const enabled = !!($('dcVoiceSignalEnabled') && $('dcVoiceSignalEnabled').checked);
      node.textContent = enabled
        ? 'پس از پایان دیکته، در صورت دسترسی میکروفون، فقط شاخص‌های فنیِ تقریبی نمایش داده می‌شوند.'
        : 'شاخص صوتی اختیاری است؛ بدون انتخاب این گزینه، صدای جداگانه برای تحلیل فنی باز نمی‌شود.';
      return;
    }
    if (!report.frameCount) {
      node.textContent = 'شاخص‌های فنی این ضبط در دسترس نبودند؛ متن‌نگاری محلی همچنان می‌تواند کار کند.';
      return;
    }
    const metrics = document.createElement('div');
    metrics.className = 'dc-metric-row';
    const duration = document.createElement('span');
    duration.textContent = `مدت نمونه: ${(report.durationMs / 1000).toFixed(1)} ثانیه`;
    const pace = document.createElement('span');
    pace.textContent = report.wordsPerMinute === null ? 'سرعت متن: نمونه کوتاه' : `سرعت متنِ تقریبی: ${report.wordsPerMinute} واژه/دقیقه`;
    const signal = document.createElement('span');
    signal.textContent = `سطح سیگنال: ${report.relativeSignal || 'نامشخص'}`;
    const pauses = document.createElement('span');
    pauses.textContent = report.quietPercent === null ? 'وقفه‌ها: نامشخص' : `فریم‌های کم‌صدا: حدود ${report.quietPercent}٪`;
    metrics.append(duration, pace, signal, pauses);
    node.appendChild(metrics);
    const caveat = document.createElement('small');
    caveat.className = 'dc-muted';
    caveat.textContent = report.limitation;
    node.appendChild(caveat);
  }

  function recognitionErrorMessage(code) {
    const known = {
      'not-allowed': 'اجازهٔ میکروفون داده نشد؛ می‌توانید متن را دستی وارد کنید.',
      'service-not-allowed': 'سرویس تشخیص مجاز نشد؛ تشخیص ابری جایگزین نمی‌شود.',
      'language-not-supported': 'بستهٔ آفلاین fa-IR برای تشخیص در دسترس نیست.',
      'language-unavailable': 'بستهٔ آفلاین فارسی پیدا نشد؛ آن را در مرورگر بررسی کنید.',
      'audio-capture': 'میکروفون در دسترس نیست یا قبلاً استفاده می‌شود.',
      'no-speech': 'گفتاری تشخیص داده نشد؛ متن را دستی وارد کنید یا دوباره تلاش کنید.'
    };
    return known[code] || 'دیکته محلی متوقف شد؛ متن موجود را بازبینی کنید.';
  }

  function startListening() {
    if (state.generating || state.listening || state.starting) return;
    if (!$('dcConsent') || !$('dcConsent').checked) {
      setStatus('پیش از فعال‌کردن میکروفون، مشتری را از دیکتهٔ محلی آگاه کنید و مطابق ضوابط بانک اجازه بگیرید.', 'warn');
      updateSpeechControls();
      return;
    }
    const Ctor = state.recognitionCtor || window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor || !['available', 'forced-local'].includes(state.recognitionStatus)) {
      setStatus('دیکتهٔ محلی آماده نیست؛ از کادر متن‌نگاری برای ورود دستی استفاده کنید.', 'warn');
      return;
    }
    let recognizer;
    try { recognizer = new Ctor(); }
    catch (_) { setStatus('ساخت دیکته ممکن نشد؛ متن را دستی وارد کنید.', 'warn'); return; }
    if (!('processLocally' in recognizer)) {
      state.recognitionStatus = 'unsupported';
      setStatus('مرورگر پردازش محلی اجباری را نپذیرفت؛ دیکته لغو شد و سرویس ابری فعال نمی‌شود.', 'warn');
      updateSpeechControls();
      return;
    }
    const token = ++state.captureToken;
    const textarea = $('dcTranscript');
    const original = textarea ? textarea.value.trimEnd() : '';
    const parts = [];
    clearCurrentAnalysisAndDraft();
    state.starting = true;
    state.stopping = false;
    state.listening = false;
    state.lastRecognitionError = '';
    state.voiceSummary = null;
    renderVoiceMetrics();
    state.recognition = recognizer;
    try {
      recognizer.lang = LANGUAGE;
      recognizer.continuous = true;
      recognizer.interimResults = true;
      recognizer.maxAlternatives = 1;
      recognizer.processLocally = true;
    } catch (_) {
      state.recognition = null;
      state.starting = false;
      state.recognitionStatus = 'unsupported';
      setStatus('مرورگر پردازش محلی را نپذیرفت؛ هیچ ضبط/تشخیص ابری انجام نشد.', 'warn');
      updateSpeechControls();
      return;
    }
    recognizer.onstart = () => {
      if (token !== state.captureToken) return;
      state.starting = false;
      state.listening = true;
      setStatus('در حال شنیدن فارسی و تبدیل محلی به متن؛ برای پایان، «پایان شنیدن» را بزنید.', 'busy');
      updateSpeechControls();
    };
    recognizer.onresult = event => {
      if (token !== state.captureToken || !textarea) return;
      for (let index = event.resultIndex || 0; index < event.results.length; index++) {
        const result = event.results[index];
        const alternative = result && result[0];
        parts[index] = alternative ? String(alternative.transcript || '').trim() : '';
      }
      const addition = parts.filter(Boolean).join(' ').replace(/\s+([،؛؟.!])/gu, '$1').trim();
      textarea.value = [original, addition].filter(Boolean).join(original && addition ? ' ' : '');
      if (state.voiceSummary) {
        state.voiceSummary = null;
        renderVoiceMetrics();
      }
    };
    recognizer.onerror = event => {
      if (token !== state.captureToken) return;
      const message = recognitionErrorMessage(event && event.error);
      state.lastRecognitionError = message;
      setStatus(message, 'warn');
      if (event && ['language-not-supported', 'language-unavailable'].includes(event.error)) {
        state.recognitionStatus = 'unavailable';
        updateSpeechControls();
      }
    };
    recognizer.onend = async () => {
      if (token !== state.captureToken) return;
      state.recognition = null;
      state.starting = false;
      state.listening = false;
      state.stopping = false;
      state.captureToken++;
      await finishVoiceMeter();
      if (state.lastRecognitionError) setStatus(state.lastRecognitionError, 'warn');
      else setStatus(state.recognitionStatus === 'available' || state.recognitionStatus === 'forced-local'
        ? 'دیکته پایان یافت؛ متن را بازبینی و اصلاح کنید.'
        : 'دیکته پایان یافت؛ اگر متن خالی است، آن را دستی وارد کنید.', 'ready');
      updateSpeechControls();
    };
    try {
      recognizer.start();
      updateSpeechControls();
      startVoiceMeter(token);
    } catch (error) {
      state.recognition = null;
      state.starting = false;
      state.listening = false;
      state.captureToken++;
      finishVoiceMeter();
      setStatus(recognitionErrorMessage(error && error.name), 'warn');
      updateSpeechControls();
      console.warn('Could not start forced-local fa-IR dictation:', error);
    }
  }

  function stopListening() {
    const recognizer = state.recognition;
    if (!recognizer) return;
    state.stopping = true;
    setStatus('در حال پایان‌دادن به دیکتهٔ محلی…', 'busy');
    updateSpeechControls();
    try { recognizer.stop(); }
    catch (_) { recognizer.abort(); }
  }

  async function abortCapture() {
    const recognizer = state.recognition;
    state.captureToken++;
    state.recognition = null;
    state.starting = false;
    state.listening = false;
    state.stopping = false;
    if (recognizer) { try { recognizer.abort(); } catch (_) {} }
    await finishVoiceMeter();
    updateSpeechControls();
  }

  function selectedTone(analysis) {
    const selected = ($('dcTone') || {}).value || 'auto';
    if (selected !== 'auto') return selected;
    return analysis ? analysis.tone : 'حرفه‌ای و پرسش‌محور';
  }

  function toneLabel(tone) {
    const labels = {
      'آرام و همدلانه': 'آرام و همدلانه',
      'خنثی و واقعیت‌محور': 'خنثی و واقعیت‌محور',
      'قاطع و محترمانه': 'قاطع و محترمانه',
      'روشن و آموزشی': 'روشن و آموزشی',
      'عذرخواهانه و کوتاه': 'عذرخواهانه و کوتاه',
      'حرفه‌ای و پرسش‌محور': 'حرفه‌ای و پرسش‌محور',
      'آرام و بی‌طرف': 'آرام و بی‌طرف',
      'همکارانه و روشن': 'همکارانه و روشن',
      'آرام و کاهندهٔ تنش': 'آرام و کاهندهٔ تنش',
      'محترمانه و قاطع، بدون تهدید': 'محترمانه و قاطع، بدون تهدید',
      'خنثی و بررسی‌محور': 'خنثی و بررسی‌محور',
      'همدلانه و بدون فشار': 'همدلانه و بدون فشار',
      'شفاف و کوتاه': 'شفاف و کوتاه'
    };
    return labels[tone] || tone;
  }

  function renderAnalysis(analysis, voice) {
    const root = $('dcAnalysis');
    if (!root) return;
    root.replaceChildren();
    const card = document.createElement('div');
    card.className = `dc-analysis-card ${analysis.escalate ? 'priority' : ''}`;
    const heading = document.createElement('b');
    heading.textContent = `برداشت واژگانی: ${analysis.label}`;
    const basis = document.createElement('small');
    basis.textContent = `${analysis.basis} — ${analysis.certainty}`;
    const reaction = document.createElement('p');
    reaction.textContent = `واکنش پیشنهادی: ${analysis.action}`;
    const tone = document.createElement('span');
    tone.className = 'dc-tone-chip';
    tone.textContent = `لحن پیشنهادی: ${toneLabel(analysis.tone)}`;
    card.append(heading, basis, reaction, tone);
    if (voice && voice.cues && voice.cues.length) {
      const cueList = document.createElement('ul');
      cueList.className = 'dc-cue-list';
      voice.cues.forEach(cue => { const li = document.createElement('li'); li.textContent = cue; cueList.appendChild(li); });
      card.appendChild(cueList);
    }
    const notice = document.createElement('small');
    notice.className = 'dc-muted';
    notice.textContent = 'این دسته‌بندی فقط از واژه‌های متن‌نگاری‌شده است؛ تشخیص قطعی احساس، صداقت، وضعیت مالی یا قصد مشتری نیست.';
    card.appendChild(notice);
    root.appendChild(card);
  }

  function clearCurrentAnalysisAndDraft() {
    state.analysis = null;
    const analysis = $('dcAnalysis');
    if (analysis) analysis.replaceChildren();
    const actualReply = $('dcActualReply');
    if (actualReply) actualReply.value = '';
    renderDraft('', '');
  }

  function renderDraft(text, origin) {
    const output = $('dcDraftText');
    const badge = $('dcDraftOrigin');
    const container = $('dcDraft');
    if (output) output.textContent = text || '';
    if (badge) badge.textContent = origin || '';
    if (container) container.hidden = !text;
    state.draft = text || '';
    const button = $('dcRecordTurn');
    if (button) button.disabled = state.generating || state.listening || state.starting || !String(($('dcTranscript') || {}).value || '').trim() || !state.draft;
    updateInteractionControls();
  }

  function renderTurns() {
    const root = $('dcTurns');
    if (!root) return;
    root.replaceChildren();
    if (!state.turns.length) {
      const empty = document.createElement('small');
      empty.className = 'dc-muted';
      empty.textContent = 'نوبت‌های همین جلسه پس از ثبت در این بخش می‌مانند و با پایان/پاک‌سازی جلسه حذف می‌شوند؛ ذخیرهٔ دائمی نداریم.';
      root.appendChild(empty);
      return;
    }
    state.turns.forEach((turn, index) => {
      const card = document.createElement('div');
      card.className = 'dc-turn';
      const customer = document.createElement('p');
      const customerLabel = document.createElement('b');
      customerLabel.textContent = `مشتری · نوبت ${index + 1}`;
      const customerText = document.createElement('span');
      customerText.textContent = turn.customer;
      customer.append(customerLabel, customerText);
      card.appendChild(customer);
      if (turn.agentReplyConfirmed && turn.agent) {
        const agent = document.createElement('p');
        const agentLabel = document.createElement('b');
        agentLabel.textContent = 'پاسخ ثبت‌شدهٔ کارشناس';
        const agentText = document.createElement('span');
        agentText.textContent = turn.agent;
        agent.append(agentLabel, agentText);
        card.appendChild(agent);
      } else {
        const note = document.createElement('small');
        note.className = 'dc-muted';
        note.textContent = 'پاسخ پیشنهادی ساخته شد؛ مشخص نیست در تماس گفته شده باشد.';
        card.appendChild(note);
      }
      root.appendChild(card);
    });
  }

  async function analyzeAndDraft() {
    if (state.generating) return;
    const viewToken = state.viewToken;
    if (!state.core) state.core = await import('./debt-collection-core.mjs');
    if (viewToken !== state.viewToken || !isDebtCollectionViewActive()) return;
    const transcript = String(($('dcTranscript') || {}).value || '').trim();
    if (!transcript) { setStatus('گفتار را دیکته یا متن را دستی وارد کنید.', 'warn'); return; }
    if (state.recognition) { setStatus('ابتدا دیکته را متوقف کنید تا نوبت کامل تحلیل شود.', 'warn'); return; }
    clearCurrentAnalysisAndDraft();
    state.analysis = state.core.classifyDebtInteraction(transcript);
    renderAnalysis(state.analysis, state.voiceSummary);
    const identityVerified = !!($('dcIdentityVerified') && $('dcIdentityVerified').checked);
    const factsVerified = !!($('dcFactsVerified') && $('dcFactsVerified').checked);
    const verifiedFacts = ($('dcVerifiedFacts') || {}).value || '';
    const approvedActions = ($('dcApprovedActions') || {}).value || '';
    const tone = selectedTone(state.analysis);
    const fallback = state.core.buildDebtFallbackReply({ interaction: state.analysis.id, identityVerified });
    const model = typeof window.getLocalChatStatus === 'function' ? window.getLocalChatStatus() : { ready: false };
    if (!identityVerified) {
      renderDraft(fallback, 'قالب محافظِ احراز هویت · بدون جزئیات حساب');
      setStatus('برای حفظ محرمانگی، تا پیش از احراز هویت فقط متن عمومی نمایش داده شد.', 'ready');
      return;
    }
    if (state.generating) return;
    if (model.ready && typeof window.generateLocalChatDraft === 'function') {
      state.generating = true;
      updateInteractionControls();
      const generate = $('dcAnalyze');
      if (generate) generate.textContent = 'در حال ساخت پیش‌نویس روی دستگاه…';
      setStatus('در حال آماده‌سازی پاسخ با مدل زبانی همین دستگاه…', 'busy');
      setModelStatus(`مدل محلی آماده است (${model.modelId || 'Qwen'}); این ابزار از تاریخچهٔ گفت‌وگوی عمومی جدا می‌ماند.`, 'ready');
      try {
        const messages = state.core.buildDebtAssistantMessages({
          transcript,
          interaction: state.analysis.id,
          tone,
          identityVerified,
          factsVerified,
          verifiedFacts,
          approvedActions,
          voiceSummary: state.voiceSummary,
          turns: state.turns
        });
        const draft = await window.generateLocalChatDraft(messages);
        if (viewToken !== state.viewToken || !isDebtCollectionViewActive()) return;
        if (!draft || !String(draft).trim()) throw new Error('مدل پاسخ متنی نساخت.');
        renderDraft(String(draft).trim(), 'پیش‌نویس مدل محلی · بازبینی کارشناس الزامی است');
        setStatus('پیش‌نویس روی همین دستگاه ساخته شد؛ پیش از گفتن، اطلاعات و ضوابط را بررسی کنید.', 'ready');
      } catch (error) {
        if (viewToken !== state.viewToken || !isDebtCollectionViewActive()) return;
        renderDraft(fallback, 'قالب محافظ · مدل محلی در دسترس نبود');
        setStatus('مدل محلی پاسخ نداد؛ قالب امن نمایش داده شد. جزئیات را با رویهٔ رسمی تطبیق دهید.', 'warn');
        console.warn('Local debt-collection draft failed:', error);
      } finally {
        state.generating = false;
        const button = $('dcAnalyze');
        if (button) button.textContent = 'تحلیل و ساخت پیش‌نویس';
        updateInteractionControls();
      }
      return;
    }
    renderDraft(fallback, 'قالب حرفه‌ایِ محلی · برای پیش‌نویس پویا، مدل Qwen را بارگذاری کنید');
    setModelStatus(model.loading || model.generating ? 'مدل محلی در حال استفاده است؛ پس از پایان دوباره تلاش کنید.' : 'مدل Qwen هنوز بارگذاری نشده؛ قالب‌های محافظ بدون مدل هم فعال‌اند.', 'warn');
    setStatus('تحلیل واژگانی و پیشنهاد واکنش انجام شد؛ پیش‌نویس را با اطلاعات رسمی تطبیق دهید.', 'ready');
  }

  function recordTurn() {
    if (state.generating || state.listening || state.starting) return;
    const customer = String(($('dcTranscript') || {}).value || '').trim();
    if (!customer || !state.draft) return;
    const agent = String(($('dcActualReply') || {}).value || '').trim();
    state.turns.push({ customer: customer.slice(0, 1800), agent: agent.slice(0, 1200), agentReplyConfirmed: !!agent });
    if (state.turns.length > MAX_TURNS) state.turns = state.turns.slice(-MAX_TURNS);
    const transcript = $('dcTranscript');
    if (transcript) transcript.value = '';
    const actual = $('dcActualReply');
    if (actual) actual.value = '';
    const analysis = $('dcAnalysis');
    if (analysis) analysis.replaceChildren();
    state.analysis = null;
    state.voiceSummary = null;
    renderVoiceMetrics();
    renderDraft('', '');
    renderTurns();
    setStatus(agent ? 'نوبت و پاسخ واقعی کارشناس فقط در حافظهٔ همین جلسه ثبت شد.' : 'نوبت ثبت شد؛ پاسخ پیشنهادی به‌عنوان پاسخ گفته‌شده ذخیره نشد.', 'ready');
    transcript && transcript.focus();
  }

  async function clearSession() {
    if (state.generating) return;
    if (state.recognition) await abortCapture();
    state.turns = [];
    state.formSnapshot = null;
    state.analysis = null;
    state.draft = '';
    state.voiceSummary = null;
    if ($('dcTranscript')) $('dcTranscript').value = '';
    if ($('dcActualReply')) $('dcActualReply').value = '';
    if ($('dcVerifiedFacts')) $('dcVerifiedFacts').value = '';
    if ($('dcApprovedActions')) $('dcApprovedActions').value = '';
    if ($('dcIdentityVerified')) $('dcIdentityVerified').checked = false;
    if ($('dcFactsVerified')) $('dcFactsVerified').checked = false;
    if ($('dcApprovedActionsEnabled')) $('dcApprovedActionsEnabled').checked = false;
    if ($('dcConsent')) $('dcConsent').checked = false;
    if ($('dcVoiceSignalEnabled')) $('dcVoiceSignalEnabled').checked = false;
    if ($('dcAnalysis')) $('dcAnalysis').replaceChildren();
    renderVoiceMetrics();
    renderDraft('', '');
    renderTurns();
    setStatus('محتوای جلسه از حافظهٔ موقت پاک شد.', 'ready');
    updateSpeechControls();
  }

  function snapshotFormForModelSetup() {
    const fields = ['dcTranscript', 'dcIdentityVerified', 'dcFactsVerified', 'dcVerifiedFacts', 'dcApprovedActionsEnabled', 'dcApprovedActions', 'dcActualReply', 'dcTone', 'dcConsent', 'dcVoiceSignalEnabled'];
    const snapshot = {};
    fields.forEach(id => {
      const node = $(id);
      if (node) snapshot[id] = node.type === 'checkbox' ? node.checked : node.value;
    });
    snapshot.voiceSummary = state.voiceSummary;
    state.formSnapshot = snapshot;
  }

  function restoreFormSnapshot() {
    const snapshot = state.formSnapshot;
    if (!snapshot) return;
    state.formSnapshot = null;
    Object.entries(snapshot).forEach(([id, value]) => {
      if (id === 'voiceSummary') { state.voiceSummary = value; return; }
      const node = $(id);
      if (!node) return;
      if (node.type === 'checkbox') node.checked = !!value;
      else node.value = String(value == null ? '' : value);
    });
  }

  function bindEvents() {
    $('dcStartListening')?.addEventListener('click', startListening);
    $('dcStopListening')?.addEventListener('click', stopListening);
    $('dcInstallSpeech')?.addEventListener('click', installSpeechPack);
    $('dcRefreshSpeech')?.addEventListener('click', refreshSpeechSupport);
    $('dcConsent')?.addEventListener('change', updateSpeechControls);
    $('dcAnalyze')?.addEventListener('click', analyzeAndDraft);
    $('dcTone')?.addEventListener('change', clearCurrentAnalysisAndDraft);
    $('dcRecordTurn')?.addEventListener('click', recordTurn);
    $('dcClearSession')?.addEventListener('click', clearSession);
    $('dcClearText')?.addEventListener('click', () => {
      if ($('dcTranscript')) $('dcTranscript').value = '';
      state.voiceSummary = null;
      clearCurrentAnalysisAndDraft();
      renderVoiceMetrics();
      updateInteractionControls();
    });
    $('dcModelSetup')?.addEventListener('click', () => {
      if (typeof window.openLocalChat === 'function') {
        snapshotFormForModelSetup();
        window.openLocalChat({
          onReturn: () => openDebtCollectionAssist({ returningFromModelSetup: true })
        });
      } else setModelStatus('ابزار گفت‌وگوی محلی در این صفحه در دسترس نیست.', 'warn');
    });
    $('dcTranscript')?.addEventListener('input', () => {
      if (!state.listening && !state.starting && !state.stopping) {
        state.voiceSummary = null;
        clearCurrentAnalysisAndDraft();
        renderVoiceMetrics();
        updateInteractionControls();
      }
    });
    $('dcVerifiedFacts')?.addEventListener('input', clearCurrentAnalysisAndDraft);
    $('dcApprovedActions')?.addEventListener('input', clearCurrentAnalysisAndDraft);
    $('dcVoiceSignalEnabled')?.addEventListener('change', event => {
      if (!event.target.checked) {
        state.voiceSummary = null;
        renderVoiceMetrics();
      } else if (!state.listening && !state.starting && !state.voiceSummary) renderVoiceMetrics();
      clearCurrentAnalysisAndDraft();
      updateInteractionControls();
    });
    $('dcFactsVerified')?.addEventListener('change', event => {
      const field = $('dcVerifiedFacts');
      if (field) {
        field.disabled = !event.target.checked || !($('dcIdentityVerified') && $('dcIdentityVerified').checked);
        if (!event.target.checked) field.value = '';
      }
      if (event.target.checked && !$('dcIdentityVerified').checked) {
        event.target.checked = false;
        setStatus('ابتدا هویت را طبق رویهٔ رسمی احراز کنید؛ جزئیات مالی تا آن زمان وارد یا به مدل داده نمی‌شوند.', 'warn');
      }
      clearCurrentAnalysisAndDraft();
      updateInteractionControls();
    });
    $('dcIdentityVerified')?.addEventListener('change', event => {
      const facts = $('dcFactsVerified');
      const field = $('dcVerifiedFacts');
      const actions = $('dcApprovedActions');
      const actionsToggle = $('dcApprovedActionsEnabled');
      if (facts) facts.disabled = !event.target.checked;
      if (!event.target.checked) {
        if (facts) facts.checked = false;
        if (field) { field.value = ''; field.disabled = true; }
        if (actions) { actions.value = ''; actions.disabled = true; }
        if (actionsToggle) { actionsToggle.checked = false; actionsToggle.disabled = true; }
      } else {
        if (actionsToggle) actionsToggle.disabled = false;
        if (actions) actions.disabled = !(actionsToggle && actionsToggle.checked);
      }
      clearCurrentAnalysisAndDraft();
      updateInteractionControls();
    });
    $('dcApprovedActionsEnabled')?.addEventListener('change', event => {
      const actions = $('dcApprovedActions');
      const identityVerified = !!($('dcIdentityVerified') && $('dcIdentityVerified').checked);
      if (actions) {
        actions.disabled = !event.target.checked || !identityVerified;
        if (!event.target.checked) actions.value = '';
      }
      if (event.target.checked && !identityVerified) {
        event.target.checked = false;
        setStatus('گزینه‌های بانکی را فقط پس از احراز هویت و در حد موارد تأییدشده وارد کنید.', 'warn');
      }
      clearCurrentAnalysisAndDraft();
      updateInteractionControls();
    });
  }

  async function render() {
    const viewToken = ++state.viewToken;
    const body = $('toolBody');
    if (!body) return;
    state.core = await import('./debt-collection-core.mjs');
    if (viewToken !== state.viewToken || !isDebtCollectionViewActive()) return;
    body.innerHTML = `
      <div class="dc-root" dir="rtl">
        <section class="dc-hero">
          <span class="dc-kicker">راهنمای داخلیِ کارشناس · بدون تماس خودکار</span>
          <h2>دستیار گفت‌وگوی پیگیری مطالبات</h2>
          <p>متن‌نگاری و پیشنهاد پاسخ برای کارشناس در حین مکالمه؛ گفتار به‌صورت اجباری محلی پردازش می‌شود. ابزار تماس نمی‌گیرد، پیام نمی‌فرستد و نتیجهٔ وصول را ثبت/تضمین نمی‌کند.</p>
          <div class="dc-badges"><span>پردازش روی دستگاه</span><span>بدون ضبط و ذخیرهٔ صدا</span><span>پیشنهادها نیازمند بازبینی</span></div>
        </section>

        <div class="dc-privacy" role="note"><b>پیش از استفاده:</b> مطابق ضوابط بانک، مشتری را از دیکتهٔ محلی آگاه و اجازه بگیرید. شناسه ملی، شماره حساب/کارت، رمز، کد یک‌بارمصرف یا دادهٔ غیرضروری را وارد نکنید. پیش از احراز هویت، مبلغ یا جزئیات بدهی را مطرح نکنید. این ابزار مقررهٔ وصول مطالبات را جایگزین نمی‌کند؛ هیچ مهلت، هزینه، پیامد حقوقی، بخشودگی یا تقسیطِ تأییدنشده را وعده ندهید.</div>

        <div class="dc-grid">
          <section class="dc-card" aria-labelledby="dcVoiceTitle">
            <div class="dc-card-head"><div><h3 id="dcVoiceTitle">گفتار مشتری به متن</h3><small>دیکتهٔ fa-IR فقط در صورت پشتیبانی پردازش محلی مرورگر؛ راه ورود دستی همیشه فعال است.</small></div><span class="dc-icon">🎙</span></div>
            <label class="dc-consent"><input id="dcConsent" type="checkbox"><span>مشتری از تبدیل محلی گفتار به متن مطلع است و طبق ضوابط بانک اجازه گرفته‌ام.</span></label>
            <label class="dc-check dc-voice-opt"><input id="dcVoiceSignalEnabled" type="checkbox"><span>شاخص‌های فنی سطح سیگنال را هم فقط در صورت اطلاع مشتری و مجازبودن فعال می‌کنم؛ این تحلیل اختیاری است و احساس یا نیت را تشخیص نمی‌دهد.</span></label>
            <div class="dc-buttons">
              <button id="dcStartListening" class="btn pri" type="button" disabled>شروع دیکتهٔ محلی</button>
              <button id="dcStopListening" class="btn ghost" type="button" disabled>پایان شنیدن</button>
              <button id="dcInstallSpeech" class="btn ghost" type="button" hidden>دریافت بستهٔ fa-IR</button>
              <button id="dcRefreshSpeech" class="btn ghost" type="button">بررسی دیکته</button>
            </div>
            <div id="dcStatus" class="dc-status" data-state="busy" role="status" aria-live="polite">در حال بررسی پشتیبانی دیکتهٔ آفلاین…</div>
            <label for="dcTranscript" class="dc-label">متن گفته‌شده / متن‌نگاری‌شده</label>
            <textarea id="dcTranscript" dir="rtl" lang="fa" rows="5" maxlength="3000" placeholder="گفتار محلی اینجا نوشته می‌شود؛ یا متن را خودتان وارد/ویرایش کنید…"></textarea>
            <div class="dc-buttons"><button id="dcClearText" class="btn ghost sm" type="button">پاک‌کردن متن این نوبت</button></div>
            <div class="dc-metrics"><b>شاخص‌های فنی این نوبت</b><div id="dcVoiceMetrics" aria-live="polite">شاخص صوتی اختیاری است؛ بدون انتخاب این گزینه، صدای جداگانه برای تحلیل فنی باز نمی‌شود.</div></div>
          </section>

          <section class="dc-card" aria-labelledby="dcContextTitle">
            <div class="dc-card-head"><div><h3 id="dcContextTitle">زمینهٔ تأییدشده</h3><small>جزئیات اختیاری‌اند و فقط در حافظهٔ موقت همین نشست می‌مانند.</small></div><span class="dc-icon">✓</span></div>
            <label class="dc-check"><input id="dcIdentityVerified" type="checkbox"><span>هویت مشتری را طبق رویهٔ رسمی بانک احراز کرده‌ام.</span></label>
            <label class="dc-check"><input id="dcFactsVerified" type="checkbox" disabled><span>مانده/سررسید و نکات زیر را در سامانهٔ رسمی تأیید کرده‌ام.</span></label>
            <textarea id="dcVerifiedFacts" dir="rtl" rows="3" maxlength="1200" placeholder="فقط نکات لازم و تأییدشده؛ از شماره حساب، شناسه ملی، رمز و کدها پرهیز کنید." disabled></textarea>
            <label class="dc-check"><input id="dcApprovedActionsEnabled" type="checkbox" disabled><span>گزینه‌های بعدی زیر، از نظر بانک مجاز و تأییدشده‌اند.</span></label>
            <textarea id="dcApprovedActions" dir="rtl" rows="2" maxlength="600" placeholder="اختیاری؛ فقط گزینه‌هایی که بانک رسماً مجاز دانسته است." disabled></textarea>
            <div class="dc-privacy-mini">جزئیات مالی فقط وقتی به مدل داده می‌شود که هم هویت و هم تأیید سامانهٔ رسمی ثبت شده باشد؛ گزینه‌های مجاز هم به تأیید جداگانه نیاز دارند. خروجی مدل پیش‌نویس است و باید با رویهٔ جاری تطبیق داده شود.</div>
          </section>
        </div>

        <section class="dc-card dc-response-card">
          <div class="dc-card-head"><div><h3>تحلیل تعامل و واکنش مناسب</h3><small>نوع تعامل از واژه‌های متن حدس زده می‌شود؛ احساس یا نیت از زیر و بمی صدا تشخیص داده نمی‌شود.</small></div><span class="dc-icon">✦</span></div>
          <div class="dc-response-settings">
            <label for="dcTone">لحن پاسخ</label>
            <select id="dcTone" class="inp">
              <option value="auto">پیشنهاد خودکار بر اساس متن</option>
              <option value="آرام و همدلانه">آرام و همدلانه</option>
              <option value="خنثی و واقعیت‌محور">خنثی و واقعیت‌محور</option>
              <option value="قاطع و محترمانه">قاطع و محترمانه، بدون تهدید</option>
              <option value="روشن و آموزشی">روشن و توضیحی</option>
            </select>
          </div>
          <div id="dcAnalysis" class="dc-analysis" aria-live="polite"><div class="dc-empty">پس از ورود گفتار یا متن، «تحلیل و ساخت پیش‌نویس» را بزنید.</div></div>
          <div class="dc-buttons dc-main-actions">
            <button id="dcAnalyze" class="btn pri" type="button">تحلیل و ساخت پیش‌نویس</button>
            <button id="dcModelSetup" class="btn ghost" type="button">آماده‌سازی مدل زبانی محلی</button>
            <button id="dcClearSession" class="btn ghost" type="button">پایان و پاک‌سازی جلسه</button>
          </div>
          <div id="dcModelStatus" class="dc-status" data-state="idle">قالب‌های محافظ بدون مدل فعال‌اند؛ برای پیشنهاد پویا، مدل Qwen آفلاین را از ابزار گفت‌وگوی محلی بارگذاری کنید.</div>
          <div id="dcDraft" class="dc-draft" hidden>
            <div class="dc-draft-head"><b>پاسخ پیشنهادی · پیش‌نویس</b><small id="dcDraftOrigin"></small></div>
            <blockquote id="dcDraftText"></blockquote>
            <label for="dcActualReply" class="dc-label">پاسخی که کارشناس واقعاً گفت (اختیاری)</label>
            <textarea id="dcActualReply" dir="rtl" rows="2" maxlength="1200" placeholder="برای حفظ زمینهٔ مکالمه در نوبت بعد؛ اگر چیزی نگفتید، خالی بگذارید."></textarea>
            <button id="dcRecordTurn" class="btn ghost block" type="button" disabled>ثبت این نوبت و آماده‌سازی نوبت بعد</button>
          </div>
        </section>

        <section class="dc-card">
          <div class="dc-card-head"><div><h3>گفت‌وگوی همین جلسه</h3><small>فقط تا وقتی این ابزار باز است؛ ذخیرهٔ دائمی یا پروندهٔ تماس ساخته نمی‌شود.</small></div></div>
          <div id="dcTurns" class="dc-turns"></div>
        </section>
        <details class="dc-details"><summary>روش تحلیل و محدودیت‌ها</summary><p>برچسب تعامل از چند الگوی واژگانیِ قابل بازبینی (مانند «پرداخت کردم»، «اعتراض»، «توان پرداخت ندارم») ساخته می‌شود؛ اگر متن‌نگاری خطا داشته باشد، برچسب هم ممکن است اشتباه باشد. شاخص صوت فقط مدت، سرعت تقریبیِ متن، سطح نسبی سیگنال و وقفه‌های کم‌صدا را از قاب‌های کوتاهِ RMS محاسبه می‌کند؛ موج خام، ضبط، تاریخچهٔ دائمی یا الگوی هویتی نگه‌داری نمی‌شود. این شاخص‌ها به میکروفون و محیط وابسته‌اند و احساس، سلامت، صداقت، ریسک یا توان بازپرداخت مشتری را نشان نمی‌دهند. مدل Qwen هم روی GPU همین مرورگر اجرا می‌شود؛ دانلود نخست مدل اختیاری است و پس از ذخیره می‌توان پاسخ‌های پویا را آفلاین ساخت.</p></details>
      </div>`;
    restoreFormSnapshot();
    bindEvents();
    renderTurns();
    updateSpeechControls();
    const model = typeof window.getLocalChatStatus === 'function' ? window.getLocalChatStatus() : { ready: false };
    setModelStatus(model.ready ? `مدل محلی آماده است (${model.modelId || 'Qwen'}).` : 'قالب‌های محافظ بدون مدل فعال‌اند؛ برای پیشنهاد پویا، مدل Qwen آفلاین را از ابزار گفت‌وگوی محلی بارگذاری کنید.', model.ready ? 'ready' : 'idle');
    await refreshSpeechSupport();
    if (state.voiceSummary) renderVoiceMetrics();
  }

  async function openDebtCollectionAssist(options = {}) {
    if (state.recognition) await abortCapture();
    state.voiceSummary = null;
    state.analysis = null;
    state.draft = '';
    if (options.returningFromModelSetup && typeof window.show === 'function') {
      window.show('tool', false, 'دستیار مکالمه و پاسخ‌یارِ محلی برای کارشناس');
      if ($('abTitle')) $('abTitle').textContent = 'پیگیری و وصول مطالبات';
      document.querySelectorAll('.nav button').forEach(button => button.classList.remove('on'));
    } else if (typeof window.showT === 'function') window.showT('پیگیری و وصول مطالبات', 'دستیار مکالمه و پاسخ‌یارِ محلی برای کارشناس');
    else if (typeof window.show === 'function') window.show('tool', true, 'پیگیری و وصول مطالبات');
    try { await render(); }
    catch (error) {
      console.error('Could not open the local debt-collection assistant:', error);
      setStatus('بخش دستیار باز نشد؛ صفحه را تازه کنید و فایل‌های محلی را بررسی کنید.', 'warn');
    }
  }

  window.openDebtCollectionAssist = openDebtCollectionAssist;
  window.addEventListener('pagehide', () => { if (state.recognition) abortCapture(); });
})();
