/* Local Persian chat. Inference runs in the browser through WebGPU; no prompt is sent to a service. */
(function () {
  'use strict';

  const MODELS = {
    'Qwen3-4B-q4f16_1-MLC': { title: 'Qwen3 · ۴ میلیارد پارامتر · کیفیت بالاتر (پیشنهادی)', memory: 'حدود ۳٫۴ گیگابایت حافظهٔ گرافیکی' },
    'Qwen3-8B-q4f16_1-MLC': { title: 'Qwen3 · ۸ میلیارد پارامتر · بالاترین کیفیت این فهرست', memory: 'حدود ۵٫۷ گیگابایت حافظهٔ گرافیکی؛ GPU قوی لازم است' },
    'Qwen3-1.7B-q4f16_1-MLC': { title: 'Qwen3 · ۱٫۷ میلیارد پارامتر · مدل سبک‌تر', memory: 'حدود ۲ گیگابایت حافظهٔ گرافیکی' }
  };
  const MODEL_IDS = Object.keys(MODELS);
  const DOMAIN_QUERY = /بانک|تسهیلات|وام|مرابحه|قرض|ضمانت|وثیقه|ضوابط|بخشنامه|کارمزد|بازپرداخت|سرمایه\s*در\s*گردش|اعتبار\s*اسنادی|رتبه|اعتبار|مشتری|نرخ|سقف|طرح|شعبه|ضامن|فروش\s*اقساطی|اوراق\s*گام/;
  const SYSTEM_PROMPT = [
    'تو یک دستیار مکالمه‌ای فارسی‌زبان، دقیق، صمیمی و محترمانه هستی.',
    'به زبان فارسی معیار و طبیعی پاسخ بده؛ پاسخ را روشن و متناسب با پرسش، نه طولانی و کتابی، بنویس.',
    'از تکرار پرسش، عبارت‌های کلیشه‌ای و انگلیسی‌نوشتن بی‌دلیل پرهیز کن. زنجیرهٔ فکر یا استدلال پنهان را نمایش نده؛ فقط پاسخ نهایی را بده.',
    'اگر منظور کاربر مبهم است، یک سؤال کوتاه برای روشن‌شدن موضوع بپرس. اگر چیزی را نمی‌دانی، صریح بگو و حدس نزن.',
    'در موضوعات اعتباری، مقررات بانکی، نرخ و سقف: فقط به قطعه‌های منبع محلی که در همین پیام آمده است تکیه کن. این منابع ممکن است کامل نباشند؛ اگر پاسخ قطعی در آن‌ها نیست، صریحاً بگو «در اسناد محلی پیدا نکردم» و عدد، شرط یا ماده نساز.',
    'پاسخ عمومی را با ضابطهٔ رسمی بانک اشتباه نگیر. تشخیص نهایی پرونده را به کارشناس و آخرین بخشنامه واگذار کن.'
  ].join('\n');

  const state = {
    engine: null,
    worker: null,
    modelId: '',
    history: [],
    loading: false,
    generating: false,
    stopping: false,
    requestId: 0
  };
  const $ = id => document.getElementById(id);
  const icon = (name, size) => typeof window.ICON === 'function' ? window.ICON(name, size || 18) : '';

  function render() {
    const body = $('toolBody');
    if (!body) return;
    body.innerHTML = `
      <div class="local-chat" dir="rtl">
        <section class="lc-hero">
          <div class="lc-mark" aria-hidden="true">${icon('spark', 26)}</div>
          <div class="lc-hero-copy">
            <span class="lc-kicker">مدل زبانی روی دستگاه شما</span>
            <h2>مکالمهٔ فارسیِ محلی</h2>
            <p>Qwen3 روی GPU مرورگر اجرا می‌شود؛ پس از دریافت و ذخیرهٔ مدل، پاسخ‌گویی بدون اینترنت و بدون API انجام می‌شود.</p>
          </div>
          <div id="lcLocalBadge" class="lc-badge" data-state="idle" role="status" aria-live="polite"><i></i><span>هنوز مدل بارگذاری نشده</span></div>
        </section>

        <section class="lc-setup" aria-labelledby="lcSetupTitle">
          <div class="lc-setup-head">
            <div><h3 id="lcSetupTitle">انتخاب مدل محلی</h3><p>بارگیری اولیه فقط فایل‌های ثابت مدل است، نه سرویس گفت‌وگو. مدل در حافظهٔ خصوصی همین مرورگر نگه‌داری می‌شود.</p></div>
            <span class="lc-lock">${icon('shield', 15)} بدون ارسال متن</span>
          </div>
          <div class="lc-model-row">
            <label for="lcModel">اندازه و کیفیت مدل</label>
            <select id="lcModel" class="inp" aria-label="انتخاب مدل هوش مصنوعی محلی">
              ${MODEL_IDS.map(id => `<option value="${id}">${MODELS[id].title} — ${MODELS[id].memory}</option>`).join('')}
            </select>
          </div>
          <div class="lc-warning"><b>پیش‌نیاز واقعی:</b> دریافت اولیه به اینترنت و چند گیگابایت فضای ذخیره‌سازی نیاز دارد. برآورد حافظهٔ گرافیکی WebLLM برای ۴B حدود ۳٫۴GB و برای ۸B حدود ۵٫۷GB است؛ در عمل GPU با حافظهٔ بیشتر لازم می‌شود. پس از دریافت، مکالمه محلی است؛ اگر WebGPU دارید ولی حافظه کم است، مدل ۱٫۷B را انتخاب کنید. بدون WebGPU هیچ‌کدام از مدل‌ها اجرا نمی‌شود.</div>
          <div class="lc-setup-actions">
            <button id="lcLoad" class="btn pri" type="button">${icon('download', 16)} بارگذاری / دریافت مدل</button>
            <span id="lcStorageInfo" class="lc-storage">در حال بررسی فضای ذخیره‌سازی…</span>
          </div>
          <div id="lcProgressWrap" class="lc-progress-wrap" hidden>
            <div class="lc-progress-label"><span id="lcProgressText">آماده‌سازی موتور محلی…</span><b id="lcProgressPercent">۰٪</b></div>
            <div class="lc-progress"><i id="lcProgressBar"></i></div>
          </div>
          <div id="lcStatus" class="lc-status" data-state="idle" role="status" aria-live="polite">برای شروع، یک مدل را انتخاب و بارگذاری کنید.</div>
        </section>

        <section class="lc-chat-panel" aria-label="گفت‌وگوی محلی">
          <div class="lc-chat-head">
            <div><h3>گفت‌وگو</h3><small id="lcModelLabel">مدلی فعال نیست</small></div>
            <div class="lc-chat-head-actions">
              <button id="lcClear" class="btn ghost sm" type="button" disabled>${icon('trash', 15)} گفت‌وگوی تازه</button>
              <button id="lcUnload" class="btn ghost sm" type="button" disabled>${icon('x', 15)} آزادسازی حافظهٔ GPU</button>
            </div>
          </div>
          <div id="lcMessages" class="lc-messages" role="log" aria-live="polite" aria-relevant="additions text">
            <div class="lc-welcome"><span class="lc-welcome-icon">${icon('spark', 23)}</span><b>سلام! وقتی مدل آماده شد، همین‌جا فارسی گفت‌وگو می‌کنیم.</b><small>برای پرسش‌های بانکی، دستیار ابتدا اسناد محلی برنامه را جست‌وجو می‌کند و اگر سندی پیدا نشود، ضابطه‌ای را حدس نمی‌زند.</small></div>
          </div>
          <div id="lcSuggestions" class="lc-suggestions">
            <button type="button">سلام، چه کارهایی می‌توانی انجام بدهی؟</button>
            <button type="button">تفاوت وام و سرمایهٔ در گردش چیست؟</button>
            <button type="button">برای پرسش بانکی دقیق، چه اطلاعاتی از من لازم داری؟</button>
          </div>
          <label class="lc-input-label" for="lcInput">پیام شما <small>فقط همین دستگاه؛ متن گفت‌وگو ذخیره یا ارسال نمی‌شود.</small></label>
          <div class="lc-compose">
            <textarea id="lcInput" dir="rtl" lang="fa" rows="2" maxlength="2400" placeholder="پیامتان را بنویسید… (Enter برای ارسال، Shift+Enter برای خط جدید)" disabled></textarea>
            <button id="lcSend" class="btn pri lc-send" type="button" disabled>${icon('send', 17)} ارسال</button>
            <button id="lcStop" class="btn ghost lc-stop" type="button" hidden>${icon('x', 17)} توقف</button>
          </div>
        </section>
        <details class="lc-details"><summary>دربارهٔ حریم خصوصی و کیفیت</summary><p>متن پیام‌ها به سرور یا API فرستاده نمی‌شود؛ مدل Qwen3 در GPU مرورگر اجرا می‌شود. فایل‌های وزن مدل و WebAssembly فقط برای بارگیری اولیه از منابع ثابت مدل دریافت و در ذخیره‌ساز خصوصی همین origin مرورگر (OPFS یا Cache Storage) نگه‌داری می‌شوند. پاک‌کردن داده‌های سایت ممکن است مدل ذخیره‌شده را حذف کند. این مدل محلی از مدل‌های ابری بزرگ‌تر ضعیف‌تر است؛ برای تصمیم اعتباری، پاسخ مدل جایگزین متن بخشنامه و بررسی کارشناس نیست.</p></details>
      </div>`;

    const load = $('lcLoad');
    if (load) load.addEventListener('click', loadSelectedModel);
    const select = $('lcModel');
    if (select && state.modelId) select.value = state.modelId;
    if (select) {
      select.addEventListener('change', () => {
        if (state.engine && select.value !== state.modelId) setStatus('مدل انتخابی با مدل فعال تفاوت دارد؛ برای بارگذاری مدل جدید دوباره دکمه را بزنید.', 'idle');
        updateControls();
      });
    }
    const send = $('lcSend');
    if (send) send.addEventListener('click', sendMessage);
    const input = $('lcInput');
    if (input) input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
    });
    const stop = $('lcStop');
    if (stop) stop.addEventListener('click', stopGeneration);
    const clear = $('lcClear');
    if (clear) clear.addEventListener('click', resetConversation);
    const unload = $('lcUnload');
    if (unload) unload.addEventListener('click', unloadModel);
    const suggestions = $('lcSuggestions');
    if (suggestions) suggestions.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !input || !state.engine || state.generating) return;
      input.value = button.textContent;
      sendMessage();
    });
    renderMessages();
    updateControls();
    if (state.loading) setStatus('مدل در حال دریافت یا آماده‌سازی روی همین دستگاه است…', 'busy');
    else if (state.generating) setStatus(state.stopping ? 'در حال متوقف‌کردن پاسخ…' : 'در حال تولید پاسخ روی همین دستگاه…', 'busy');
    else if (state.engine) setStatus('مدل بارگذاری شده و آمادهٔ گفت‌وگوی محلی است.', 'ready');
    updateStorageInfo();
  }

  function setStatus(text, kind) {
    const node = $('lcStatus');
    if (!node) return;
    node.textContent = text;
    node.dataset.state = kind || 'idle';
    const badge = $('lcLocalBadge');
    if (badge) {
      const label = badge.querySelector('span');
      if (label) label.textContent = kind === 'ready' ? 'مدل روی همین دستگاه فعال است' : kind === 'error' ? 'نیاز به بررسی دستگاه' : kind === 'busy' ? (state.stopping ? 'در حال توقف پاسخ' : state.generating ? 'در حال تولید پاسخ محلی' : 'در حال آماده‌سازی مدل') : state.engine ? 'مدل در حافظهٔ همین مرورگر' : 'هنوز مدل بارگذاری نشده';
      badge.dataset.state = kind || 'idle';
    }
  }

  function updateControls() {
    const ready = !!state.engine;
    const input = $('lcInput');
    const send = $('lcSend');
    const stop = $('lcStop');
    const clear = $('lcClear');
    const load = $('lcLoad');
    const select = $('lcModel');
    if (input) input.disabled = !ready || state.loading || state.generating;
    if (send) send.disabled = !ready || state.loading || state.generating || !(input && input.value.trim());
    if (stop) { stop.hidden = !state.generating; stop.disabled = state.stopping; }
    if (clear) clear.disabled = !state.history.length || state.generating;
    const unload = $('lcUnload');
    if (unload) unload.disabled = !ready || state.loading || state.generating;
    if (load) load.disabled = state.loading || state.generating;
    if (select) select.disabled = state.loading || state.generating;
    const label = $('lcModelLabel');
    if (label) label.textContent = state.engine ? `مدل فعال: ${MODELS[state.modelId].title}` : 'مدلی فعال نیست';
    if (input && !input._lcInputBound) {
      input._lcInputBound = true;
      input.addEventListener('input', updateControls);
    }
  }

  async function updateStorageInfo() {
    const node = $('lcStorageInfo');
    if (!node) return;
    try {
      if (!navigator.storage || !navigator.storage.estimate) { node.textContent = 'برآورد فضای مرورگر در دسترس نیست.'; return; }
      const estimate = await navigator.storage.estimate();
      const free = Math.max(0, (estimate.quota || 0) - (estimate.usage || 0));
      const available = Math.round(free / 1024 / 1024);
      let persistent = '';
      if (navigator.storage.persisted && await navigator.storage.persisted()) persistent = '؛ فضای سایت پایدار است';
      node.textContent = `فضای آزاد تقریبی مرورگر: ${faNumber(available)} مگابایت${persistent}`;
    } catch (_) { node.textContent = 'فضای ذخیره‌سازی مرورگر قابل‌برآورد نیست.'; }
  }

  const faNumber = value => {
    try { return new Intl.NumberFormat('fa-IR').format(value); }
    catch (_) { return String(value); }
  };

  async function loadSelectedModel() {
    if (state.loading || state.generating) return;
    const select = $('lcModel');
    const modelId = select ? select.value : MODEL_IDS[0];
    if (!MODELS[modelId]) return;
    if (state.engine && state.modelId === modelId) {
      setStatus('مدل از قبل بارگذاری شده و آمادهٔ مکالمهٔ آفلاین است.', 'ready');
      updateControls();
      $('lcInput') && $('lcInput').focus();
      return;
    }

    state.loading = true;
    updateControls();
    setProgress(0, 'در حال بررسی WebGPU…');
    setStatus('در حال آماده‌سازی موتور محلی؛ برای دریافت نخستین مدل اتصال اینترنت لازم است.', 'busy');

    try {
      if (!window.Worker || !navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
        throw new Error('این مرورگر WebGPU ندارد. برای اجرای مدل محلی، نسخهٔ به‌روز Edge یا Chrome را از localhost باز کنید.');
      }
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) throw new Error('GPU سازگار با WebGPU پیدا نشد.');
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        try { await navigator.storage.persist(); } catch (_) { /* Cache remains usable even if persistence is denied. */ }
      }
      if (state.engine) {
        try { await state.engine.unload(); } catch (_) { /* discard stale engine below */ }
        if (state.worker) state.worker.terminate();
        state.engine = null;
        state.worker = null;
        state.modelId = '';
      }

      const webllm = await import('./local-llm/web-llm.mjs');
      const allowedModels = webllm.prebuiltAppConfig.model_list.filter(record => MODEL_IDS.includes(record.model_id));
      if (!allowedModels.some(record => record.model_id === modelId)) throw new Error('نسخهٔ انتخابی مدل در موتور محلی پیدا نشد.');
      const hasOpfs = !!(navigator.storage && typeof navigator.storage.getDirectory === 'function');
      const appConfig = {
        ...webllm.prebuiltAppConfig,
        model_list: allowedModels,
        cacheBackend: hasOpfs ? 'opfs' : 'cache'
      };
      const worker = new Worker(new URL('./local-llm/web-llm-worker.mjs', document.baseURI), {
        type: 'module',
        name: 'offline-persian-llm'
      });
      state.worker = worker;
      const engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
        appConfig,
        initProgressCallback: report => {
          const value = Number(report && report.progress);
          const percent = Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) : 0;
          const detail = report && report.text ? String(report.text) : 'دریافت و آماده‌سازی فایل‌های مدل…';
          setProgress(percent, detail);
          setStatus(detail, 'busy');
        }
      });
      state.engine = engine;
      state.modelId = modelId;
      setProgress(100, 'مدل آماده است.');
      setStatus('مدل بارگذاری شد؛ مکالمه از این لحظه روی همین دستگاه انجام می‌شود.', 'ready');
      updateControls();
      $('lcInput') && $('lcInput').focus();
    } catch (error) {
      if (state.worker) { try { state.worker.terminate(); } catch (_) {} }
      state.worker = null;
      state.engine = null;
      state.modelId = '';
      const message = error && error.message ? error.message : 'مدل محلی بارگذاری نشد.';
      setStatus(`${message} اگر فایل‌های مدل هنوز ذخیره نشده‌اند، یک‌بار به اینترنت وصل شوید؛ هیچ API گفت‌وگویی استفاده نمی‌شود.`, 'error');
      console.warn('Local Persian LLM initialization failed:', error);
    } finally {
      state.loading = false;
      updateControls();
      updateStorageInfo();
    }
  }

  function setProgress(value, label) {
    const wrap = $('lcProgressWrap');
    const bar = $('lcProgressBar');
    const text = $('lcProgressText');
    const percent = $('lcProgressPercent');
    if (wrap) wrap.hidden = false;
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    if (bar) bar.style.width = `${n}%`;
    if (percent) percent.textContent = `${faNumber(n)}٪`;
    if (text) text.textContent = label;
  }

  function isDomainQuestion(question) {
    if (DOMAIN_QUERY.test(question)) return true;
    return state.history.filter(item => item.role === 'user').slice(-4).some(item => DOMAIN_QUERY.test(item.content));
  }

  function relevantSources(question) {
    if (!isDomainQuestion(question) || typeof window.aiSearch !== 'function') return [];
    try {
      const previous = state.history.filter(item => item.role === 'user').slice(-3).map(item => item.content);
      const query = [...previous, question].join(' ');
      const result = window.aiSearch(query, 'all', 4);
      return (result.res || []).map(item => ({
        title: item.p && item.p.d ? item.p.d.title : 'سند محلی',
        number: item.p && item.p.d ? item.p.d.no : '',
        page: item.p ? item.p.pg : null,
        text: item.p && item.p.s ? String(item.p.s).slice(0, 430) : '',
        score: item.sc || 0
      })).filter(item => item.text);
    } catch (error) {
      console.warn('Local regulation search failed:', error);
      return [];
    }
  }

  function buildSystemMessage(question, sources) {
    if (!isDomainQuestion(question)) return SYSTEM_PROMPT;
    if (!sources.length) return `${SYSTEM_PROMPT}\n\nدر این پرسش بانکی جست‌وجوی محلی نتیجهٔ مرتبطی پیدا نکرد. به‌جای حدس‌زدن ضابطه، این محدودیت را شفاف بگو و در صورت نیاز برای جست‌وجوی دستی در «دستیار هوشمند بخشنامه‌ها» راهنمایی کن.`;
    const sourceText = sources.map((source, index) => {
      const page = source.page && source.page > 0 ? `، صفحهٔ ${source.page}` : '';
      const number = source.number ? `، شمارهٔ ${source.number}` : '';
      return `[${index + 1}] ${source.title}${number}${page}: ${source.text}`;
    }).join('\n');
    return `${SYSTEM_PROMPT}\n\nقطعه‌های زیر نتایج جست‌وجوی آفلاین در اسناد همین برنامه‌اند؛ فقط اگر واقعاً به پرسش مربوط‌اند از آن‌ها استفاده کن. اگر پاسخ در متن نیست، بگو در قطعه‌های پیدا‌شده نیامده است. در پایان پاسخ مرتبط می‌توانی به منبع با [شماره] اشاره کنی.\n${sourceText}`;
  }

  async function sendMessage() {
    const input = $('lcInput');
    if (!input || !state.engine || state.generating || state.loading) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    updateControls();
    const sources = relevantSources(text);
    const prior = state.history.slice(-8).map(item => ({ role: item.role, content: item.content }));
    state.history.push({ role: 'user', content: text });
    appendMessage('user', text, []);
    const assistantNode = appendMessage('assistant', '', sources);
    const requestId = ++state.requestId;
    state.generating = true;
    state.stopping = false;
    updateControls();
    setStatus('در حال تولید پاسخ روی GPU همین دستگاه…', 'busy');

    let response = '';
    try {
      const messages = [
        { role: 'system', content: buildSystemMessage(text, sources) },
        ...prior,
        { role: 'user', content: text }
      ];
      const stream = await state.engine.chat.completions.create({
        model: state.modelId,
        messages,
        stream: true,
        temperature: 0.65,
        top_p: 0.88,
        max_tokens: 360,
        extra_body: { enable_thinking: false }
      });
      for await (const chunk of stream) {
        if (requestId !== state.requestId) break;
        const delta = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
        if (delta && typeof delta.content === 'string') {
          response += delta.content;
          assistantNode.textContent = visibleAnswer(response);
          const messagesNode = $('lcMessages');
          if (messagesNode) messagesNode.scrollTop = messagesNode.scrollHeight;
        }
      }
      if (requestId !== state.requestId) {
        const partial = visibleAnswer(response).trim();
        assistantNode.textContent = partial ? `${partial}\n\n(پاسخ ناتمام؛ تولید را خودتان متوقف کردید.)` : 'تولید پاسخ متوقف شد.';
        if (partial) state.history.push({ role: 'assistant', content: partial });
        setStatus('تولید پاسخ متوقف شد.', 'idle');
        return;
      }
      const final = visibleAnswer(response).trim();
      if (final) {
        state.history.push({ role: 'assistant', content: final });
        if (state.history.length > 12) state.history = state.history.slice(-12);
        assistantNode.textContent = final;
        setStatus('پاسخ با مدل محلی تولید شد؛ متن شما به بیرون فرستاده نشد.', 'ready');
      } else {
        assistantNode.textContent = requestId === state.requestId ? 'مدل پاسخ متنی تولید نکرد؛ لطفاً پرسش را کوتاه‌تر یا روشن‌تر بنویسید.' : 'تولید پاسخ متوقف شد.';
        setStatus('تولید پاسخ پایان یافت.', 'idle');
      }
    } catch (error) {
      if (requestId !== state.requestId) {
        const partial = visibleAnswer(response).trim();
        assistantNode.textContent = partial ? `${partial}\n\n(پاسخ ناتمام؛ تولید را خودتان متوقف کردید.)` : 'تولید پاسخ متوقف شد.';
        if (partial) state.history.push({ role: 'assistant', content: partial });
        setStatus('تولید پاسخ متوقف شد.', 'idle');
        return;
      }
      const message = error && error.message ? error.message : 'خطای مدل محلی';
      assistantNode.textContent = response ? `${visibleAnswer(response)}\n\n(تولید زودتر متوقف شد: ${message})` : `مدل محلی نتوانست پاسخ بدهد: ${message}`;
      setStatus('استنتاج محلی با خطا روبه‌رو شد. در صورت کمبود حافظهٔ GPU، مدل کوچک‌تر را انتخاب کنید و برنامه‌های سنگین را ببندید.', 'error');
      console.warn('Local Persian chat generation failed:', error);
    } finally {
      if (requestId === state.requestId || state.stopping) {
        state.generating = false;
        state.stopping = false;
      }
      updateControls();
      if ($('lcInput')) $('lcInput').focus();
    }
  }

  function visibleAnswer(text) {
    let output = String(text || '');
    output = output.replace(/<think>[\s\S]*?<\/think>/gi, '');
    const open = output.lastIndexOf('<think>');
    if (open >= 0 && output.indexOf('</think>', open) < 0) output = output.slice(0, open);
    return output.replace(/<\|[^|]{1,40}\|>/g, '').trim();
  }

  function appendMessage(role, content, sources) {
    const list = $('lcMessages');
    if (!list) return document.createElement('div');
    const welcome = list.querySelector('.lc-welcome');
    if (welcome) welcome.remove();
    const item = document.createElement('article');
    item.className = `lc-message ${role === 'user' ? 'user' : 'assistant'}`;
    const label = document.createElement('small');
    label.className = 'lc-message-label';
    label.textContent = role === 'user' ? 'شما' : 'دستیار محلی';
    const text = document.createElement('div');
    text.className = 'lc-message-text';
    text.textContent = content;
    item.append(label, text);
    if (role === 'assistant' && sources && sources.length) {
      const refs = document.createElement('details');
      refs.className = 'lc-sources';
      const summary = document.createElement('summary');
      summary.textContent = `نتایج جست‌وجوی محلی (${faNumber(sources.length)})`;
      refs.appendChild(summary);
      sources.forEach((source, index) => {
        const card = document.createElement('div');
        card.className = 'lc-source';
        const title = document.createElement('b');
        title.textContent = `[${index + 1}] ${source.title}${source.number ? ` — ${faNumber(source.number)}` : ''}${source.page && source.page > 0 ? `، صفحهٔ ${faNumber(source.page)}` : ''}`;
        const snippet = document.createElement('small');
        snippet.textContent = source.text;
        card.append(title, snippet);
        refs.appendChild(card);
      });
      item.appendChild(refs);
    }
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    return text;
  }

  function renderMessages() {
    const list = $('lcMessages');
    if (!list || !state.history.length) return;
    list.innerHTML = '';
    state.history.forEach(item => appendMessage(item.role, item.content, []));
  }

  function stopGeneration() {
    if (!state.generating || state.stopping) return;
    state.requestId++;
    state.stopping = true;
    setStatus('درخواست توقف به مدل محلی فرستاده شد…', 'busy');
    updateControls();
    try { if (state.engine) state.engine.interruptGenerate(); } catch (_) { /* generation may have just ended */ }
    // Keep the input locked until the active stream closes in sendMessage's finally block.
  }

  function resetConversation() {
    if (state.generating) return;
    state.history = [];
    const list = $('lcMessages');
    if (list) list.innerHTML = `<div class="lc-welcome"><span class="lc-welcome-icon">${icon('spark', 23)}</span><b>گفت‌وگو پاک شد.</b><small>مدل فعال است؛ پیام بعدی را بنویسید.</small></div>`;
    try { state.engine && state.engine.resetChat(); } catch (_) { /* conversation history is also cleared locally */ }
    updateControls();
  }

  async function unloadModel() {
    if (!state.engine || state.loading || state.generating) return;
    setStatus('در حال آزادسازی حافظهٔ GPU… فایل‌های مدل در ذخیره‌ساز مرورگر باقی می‌مانند.', 'busy');
    try { await state.engine.unload(); } catch (_) { /* the worker is terminated below */ }
    if (state.worker) { try { state.worker.terminate(); } catch (_) {} }
    state.worker = null;
    state.engine = null;
    state.modelId = '';
    setStatus('حافظهٔ GPU آزاد شد. فایل‌های مدل در ذخیره‌ساز مرورگر باقی می‌مانند و بعداً می‌توان آن‌ها را دوباره بارگذاری کرد.', 'idle');
    updateControls();
  }

  function openLocalChat() {
    if (typeof window.showT === 'function') window.showT('مکالمهٔ فارسی آفلاین', 'مدل زبانی محلی؛ بدون API گفت‌وگو');
    else if (typeof window.show === 'function') window.show('tool', true, 'مدل زبانی محلی');
    render();
    const input = $('lcInput');
    if (state.engine && input) input.focus();
  }

  window.openLocalChat = openLocalChat;
})();
