/*
 * Persian offline speech workspace.
 * Recognition is fail-closed: it is only started with processLocally=true.
 * No remote recognition fallback, audio upload, or transcript persistence is used.
 */
(function () {
  'use strict';

  const LANGUAGE = 'fa-IR';
  const PREF_KEY = 'sca_speech_preferences';
  const LEXICON_KEY = 'sca_speech_pronunciation_lexicon_v1';
  const BUNDLED_VOICE_ID = 'bundled-persian-espeak';
  const PIPER_VOICE_PREFIX = 'piper:';
  const PIPER_MODEL_BASE = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/50f6de3c5afb40402551adb29d9e08dff2ec4624/';
  const PIPER_VOICES = {
    'fa_IR-amir-medium': {
      title: 'صدای عصبی فارسی · Amir',
      modelPath: 'fa/fa_IR/amir/medium/fa_IR-amir-medium',
      bytes: 63531379,
      sha256: 'fb815380d969ea372b0b21b0de14421f58fe481047e153e69685d079b6e1a9d1'
    },
    'fa_IR-gyro-medium': {
      title: 'صدای عصبی فارسی · Gyro',
      modelPath: 'fa/fa_IR/gyro/medium/fa_IR-gyro-medium',
      bytes: 63122309,
      sha256: '37dfae43c82ee38ca9e6aac4ffef76a74d6b282ccbc397b27761f35d355c99ba'
    }
  };
  const TINY_AVA_VOICE_PREFIX = 'tinyava:';
  const TINY_AVA_MODEL_BYTES = 44799403;
  const TINY_AVA_VOICES = {
    parisa: { title: 'پریسا · صدای زنانه', modelIndex: 0 },
    mana: { title: 'مانا · صدای مردانهٔ استودیویی', modelIndex: 2 }
  };
  const DEFAULT_TINY_AVA_VOICE = 'parisa';
  const state = {
    recognitionCtor: null,
    recognitionStatus: 'checking',
    recognitionCheck: 0,
    recognition: null,
    recognitionSession: 0,
    listening: false,
    starting: false,
    stopping: false,
    lastRecognitionError: '',
    voices: [],
    localPersianVoices: [],
    voiceChoiceExplicit: false,
    ttsSession: 0,
    ttsRunning: false,
    ttsSessionUsed: false,
    ttsPreparing: false,
    ttsWorker: null,
    piperWorker: null,
    tinyAvaWorker: null,
    piperVoiceIds: new Set(),
    piperAvailabilityChecked: false,
    piperDownloading: false,
    piperDownloadCancelable: false,
    piperDownloadAbort: null,
    piperDownloadVoiceId: '',
    piperAvailabilityRequest: 0,
    tinyAvaInstalled: false,
    tinyAvaAvailabilityChecked: false,
    tinyAvaAvailabilityRequest: 0,
    tinyAvaDownloading: false,
    tinyAvaDownloadCancelable: false,
    tinyAvaDownloadAbort: null,
    ttsAudioUrl: '',
    ttsSynthesisRate: 1,
    ttsChunks: [],
    ttsChunkIndex: 0,
    pendingSpeechLaunch: null,
    speechReturnToDebt: false,
    voiceEventsBound: false
  };

  const byId = id => document.getElementById(id);
  const icon = (name, size) => typeof window.ICON === 'function' ? window.ICON(name, size || 20) : '';
  const faNumber = value => {
    try { return new Intl.NumberFormat('fa-IR').format(value); }
    catch (_) { return String(value); }
  };

  function renderWorkspace() {
    const body = byId('toolBody');
    if (!body) return;

    body.innerHTML = `
      <div class="speech-page" dir="rtl">
        <section class="speech-hero" aria-labelledby="speechTitle">
          <div class="speech-hero-main">
            <div class="speech-hero-mark" aria-hidden="true">${icon('mic', 30)}</div>
            <div class="speech-hero-copy">
              <div class="speech-kicker">پردازش روی دستگاه، بدون سرویس ابری</div>
              <h2 id="speechTitle">استودیوی گفتار فارسی</h2>
              <p>خواندن متن با صدای عصبی فارسی پس از دریافت یک‌بارهٔ مدل؛ دیکته نیز در مرورگر سازگار و فقط روی همین دستگاه اجرا می‌شود.</p>
            </div>
          </div>
          <div id="speechOverall" class="speech-hero-badge" role="status" aria-live="polite"><i></i><span>در حال بررسی قابلیت‌های دستگاه…</span></div>
          <div id="speechDebtHandoff" class="speech-debt-handoff" hidden>
            <span id="speechDebtHandoffText">پیش‌نویس مشتری با لحن پیشنهادی آمادهٔ پیش‌نمایش محلی است؛ برای شروع پخش، «خواندن متن» را بزنید.</span>
            <button id="speechReturnToDebt" class="btn ghost sm" type="button">بازگشت به پاسخ‌یار</button>
          </div>
        </section>

        <div class="speech-columns">
          <section class="speech-panel" aria-labelledby="speechSttTitle">
            <div class="speech-panel-head">
              <div class="speech-panel-icon" aria-hidden="true">${icon('mic', 20)}</div>
              <div>
                <h3 id="speechSttTitle">گفتار به نوشتار</h3>
                <p>دیکتهٔ زندهٔ فارسی با موتور محلی مرورگر</p>
              </div>
            </div>
            <div id="speechSttStatus" class="speech-status" data-state="busy" role="status" aria-live="polite">در حال بررسی پشتیبانی گفتار آفلاین…</div>
            <div id="speechSttGuidance" class="speech-note warn">برای حفظ حریم خصوصی، فقط حالت پردازش محلی فعال می‌شود؛ در صورت نبود موتور یا بستهٔ فارسی، ابزار به حالت آنلاین تغییر مسیر نمی‌دهد.</div>

            <div class="speech-language">
              <div class="speech-language-copy"><small>زبان تشخیص</small><b>فارسی معیار ایران <span dir="ltr">(fa-IR)</span></b></div>
              <div class="speech-language-actions">
                <button id="speechRefresh" class="btn ghost sm" type="button">${icon('check', 15)} بررسی دوباره</button>
                <button id="speechInstall" class="btn ghost sm" type="button" hidden>${icon('download', 15)} دریافت بستهٔ فارسی</button>
              </div>
            </div>

            <div class="speech-controls">
              <button id="speechStart" class="btn pri" type="button" disabled>${icon('mic', 17)} شروع دیکته</button>
              <button id="speechStop" class="btn ghost" type="button" disabled>${icon('x', 16)} پایان دیکته</button>
            </div>
            <div id="speechLive" class="speech-live" data-live="false" aria-live="polite">
              <span class="speech-live-dot"></span><span id="speechLiveText">برای شروع، دکمهٔ دیکته را بزنید.</span>
              <span class="speech-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
            </div>

            <label class="speech-live-label" for="speechTranscript">متن پیاده‌سازی‌شده <small>قابل ویرایش پس از پایان دیکته</small></label>
            <textarea id="speechTranscript" class="speech-textarea" dir="rtl" lang="fa" maxlength="20000" placeholder="پس از آماده‌شدن موتور محلی، دیکته را شروع کنید…" aria-describedby="speechTranscriptMeta"></textarea>
            <div id="speechTranscriptMeta" class="speech-meta"><span id="speechTranscriptChars">۰ نویسه</span><span id="speechTranscriptWords">۰ واژه</span></div>

            <div class="speech-actions">
              <button id="speechCopy" class="btn ghost" type="button">${icon('copy', 15)} کپی متن</button>
              <button id="speechInsert" class="btn ghost" type="button">${icon('bolt', 15)} انتقال به مشاورهٔ سریع</button>
              <button id="speechToTts" class="btn ghost" type="button">${icon('spark', 15)} فرستادن برای خواندن</button>
              <button id="speechClean" class="btn ghost" type="button">${icon('check', 15)} پاک‌سازی نگارشی</button>
              <button id="speechClear" class="btn ghost" type="button">${icon('trash', 15)} پاک‌کردن متن</button>
            </div>

            <details class="speech-details">
              <summary>دربارهٔ دیکتهٔ کاملاً آفلاین</summary>
              <p>این نسخه مدل مستقل گفتاربه‌نوشتار را در خود بسته ندارد؛ تشخیص به موتور محلی مرورگر و بستهٔ <span dir="ltr">fa-IR</span> وابسته است. اگر مرورگر امکان نصب بسته را نشان دهد، دریافت اولیه با انتخاب خودتان انجام می‌شود؛ پس از نصب، تشخیص با اجبار روی دستگاه اجرا خواهد شد. در مرورگر ناسازگار، دیکته غیرفعال می‌ماند و هیچ سرویس آنلاین جایگزین نمی‌شود.</p>
            </details>
          </section>

          <section class="speech-panel" aria-labelledby="speechTtsTitle">
            <div class="speech-panel-head">
              <div class="speech-panel-icon tts" aria-hidden="true">${icon('school', 20)}</div>
              <div>
                <h3 id="speechTtsTitle">نوشتار به گفتار</h3>
                <p>خوانش آفلاین با صدای عصبی فارسی، پس از دریافت اولیهٔ مدل روی همین دستگاه</p>
              </div>
            </div>
            <div id="speechTtsStatus" class="speech-status" data-state="busy" role="status" aria-live="polite">در حال بررسی مدل‌های صدای عصبیِ ذخیره‌شده…</div>
            <div id="speechTtsGuidance" class="speech-note">صدای عصبی فارسی یک‌بار دریافت می‌شود و بعد، ساخت و پخش گفتار روی همین PC و بدون اینترنت انجام می‌شود. خود متن از دستگاه خارج نمی‌شود. eSpeak NG هم به‌عنوان جایگزین کم‌حجم اما مصنوعی باقی است.</div>

            <label class="speech-live-label" for="speechTtsInput">متن برای خواندن <small>متن در حافظهٔ مرورگر ذخیره نمی‌شود</small></label>
            <textarea id="speechTtsInput" class="speech-textarea tts" dir="rtl" lang="fa" maxlength="8000" placeholder="متن فارسی را اینجا بنویسید یا از دیکته منتقل کنید…">درود. این نمونه با صدای عصبی فارسی ساخته می‌شود؛ مدل را یک‌بار دریافت کنید و بعد آفلاین بخوانید.</textarea>
            <div id="speechTinyAvaCueBar" class="speech-tiny-ava-cues" hidden aria-label="نشانه‌های اجرای tiny-ava">
              <div class="speech-cue-head"><b>نشانه‌های اجرا</b><small>برای tiny-ava؛ هر نشانه را می‌توانید در متن قرار دهید.</small></div>
              <div class="speech-cue-buttons">
                <button type="button" data-tinyava-cue="آه، ">+ آه</button>
                <button type="button" data-tinyava-cue="اوه، ">+ اوه</button>
                <button type="button" data-tinyava-cue="هوم، ">+ هوم</button>
                <button type="button" data-tinyava-cue="[[مکث کوتاه]]">+ مکث کوتاه</button>
                <button type="button" data-tinyava-cue="[[مکث بلند]]">+ مکث بلند</button>
                <button type="button" data-tinyava-cue="[[نفس]]">+ نفس‌نمای نرم</button>
                <button id="speechTinyAvaStretch" type="button">کشیده‌خوانیِ انتخاب‌شده</button>
                <button id="speechTinyAvaEmphasis" type="button">تأکیدِ عبارتِ انتخاب‌شده</button>
              </div>
              <small class="speech-cue-note">عددها و چند واژهٔ مهم به‌طور ملایم تأکید می‌شوند؛ برای نام یا عبارت خاص آن را انتخاب کنید و «تأکید» را بزنید. «آه/اوه/هوم» واژه‌اند؛ [[نفس]] فقط نویز نرم و مکث کوتاه است، نه صدای ضبط‌شده. [[کشیده:واژه]] عبارت را کندتر می‌خواند.</small>
            </div>
            <div class="speech-meta"><span id="speechTtsChars">۰ نویسه</span><span id="speechTtsWords">۰ واژه</span></div>

            <div class="speech-settings">
              <div class="speech-setting voice-select">
                <label for="speechVoice">صدای فارسی محلی</label>
                <select id="speechVoice" class="inp" disabled aria-label="انتخاب صدای فارسی محلی"><option value="">در حال آماده‌سازی صداهای محلی…</option></select>
              </div>
              <div class="speech-neural-download">
                <div class="speech-neural-copy"><b>مدل گفتار عصبی</b><small id="speechNeuralInfo">برای پریسا و مانا یک مدل مشترک حدود ۴۳ MiB؛ پس از دریافت یک‌باره، خوانش کاملاً آفلاین است.</small></div>
                <button id="speechTinyAvaInstall" class="btn ghost" type="button" hidden>${icon('download', 15)} دریافت مدل tiny-ava</button>
                <div id="speechTinyAvaDownloadWrap" class="speech-piper-progress" hidden>
                  <div><span id="speechTinyAvaDownloadText">در حال دریافت مدل tiny-ava…</span><b id="speechTinyAvaDownloadPercent">۰٪</b></div>
                  <i><span id="speechTinyAvaDownloadBar"></span></i>
                </div>
                <button id="speechPiperInstall" class="btn ghost" type="button" hidden>${icon('download', 15)} دریافت مدل صدا</button>
                <div id="speechPiperDownloadWrap" class="speech-piper-progress" hidden>
                  <div><span id="speechPiperDownloadText">در حال دریافت مدل…</span><b id="speechPiperDownloadPercent">۰٪</b></div>
                  <i><span id="speechPiperDownloadBar"></span></i>
                </div>
              </div>
              <div class="speech-setting">
                <label for="speechRate">سرعت خوانش <b id="speechRateValue">۱٫۰۰×</b></label>
                <input id="speechRate" type="range" min="0.75" max="1.25" step="0.05" value="1" aria-label="سرعت خوانش" disabled>
              </div>
              <div class="speech-setting">
                <label for="speechPitch">زیر و بمی صدا <b id="speechPitchValue">۱٫۰۰</b></label>
                <input id="speechPitch" type="range" min="0.8" max="1.2" step="0.05" value="1" aria-label="زیر و بمی صدا" disabled>
              </div>
              <div id="speechDeliveryStyleControls" class="speech-delivery-controls" hidden>
                <div class="speech-setting">
                  <label for="speechTtsStyle">حالت لحن <small>پیش‌فرض: نشانه‌گذاریِ جمله‌محور</small></label>
                  <select id="speechTtsStyle" class="inp" disabled aria-label="حالت لحن تقریبی صدای محلی">
                    <option value="auto">خوانش خودکار و جمله‌محور · پیش‌فرض</option>
                    <option value="conversational">مکالمه‌ای و طبیعی</option>
                    <option value="formal">رسمی و شمرده</option>
                    <option value="calm">آرام و ملایم</option>
                    <option value="supportive">همدلانه و حرفه‌ای · ملایم</option>
                    <option value="happy">شاد و صمیمی</option>
                    <option value="sad">غمگین و آرام</option>
                    <option value="angry">عصبانی و قاطع</option>
                    <option value="excited">هیجان‌زده</option>
                    <option value="storytelling">روایت‌گر</option>
                    <option value="lively">پرانرژی</option>
                  </select>
                </div>
                <div class="speech-setting">
                  <label for="speechTtsExpressiveness">شدت آهنگ <b id="speechTtsExpressivenessValue">۱٫۰۵</b></label>
                  <input id="speechTtsExpressiveness" type="range" min="0.7" max="1.4" step="0.05" value="1.05" aria-label="شدت تقریبی آهنگ صدای محلی" disabled>
                </div>
                <div class="speech-setting">
                  <label for="speechTtsPauseScale">میزان مکث‌ها <b id="speechTtsPauseScaleValue">۱٫۰۰×</b></label>
                  <input id="speechTtsPauseScale" type="range" min="0.6" max="1.8" step="0.1" value="1" aria-label="میزان مکث‌ها در خوانش tiny-ava" disabled>
                </div>
                <div class="speech-style-caveat">پروفایل انتخابی در همهٔ صداهای محلی سرعت و زیر‌وبمیِ پشتیبانی‌شده را تغییر می‌دهد؛ میزان مکث و دامنهٔ آهنگ به موتور بستگی دارد. tiny-ava علاوه بر این، مکث دقیق و تأکید واژگانی دارد؛ Piper/eSpeak امکانات محدودتری دارند. حالت خودکار و الگوهای متنی قاعده‌محور و تقریبی‌اند، نه تشخیص قطعی احساس یا نیت؛ مدل احساس مشتری را تشخیص نمی‌دهد.</div>
              </div>
            </div>

            <div class="speech-controls">
              <button id="speechSpeak" class="btn pri" type="button" disabled>${icon('bolt', 17)} خواندن متن</button>
              <button id="speechPause" class="btn ghost" type="button" disabled>${icon('x', 16)} مکث</button>
              <button id="speechResume" class="btn ghost" type="button" disabled>${icon('chart', 16)} ادامه</button>
              <button id="speechTtsStop" class="btn ghost" type="button" disabled>${icon('x', 16)} توقف</button>
            </div>
            <div class="speech-progress-wrap">
              <div class="speech-progress-head"><span id="speechTtsProgressText">آمادهٔ خواندن</span><span id="speechTtsSegment">۰ از ۰</span></div>
              <div class="speech-progress" role="progressbar" aria-label="پیشرفت خواندن متن" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="speechTtsProgress"></i></div>
            </div>
            <audio id="speechTtsAudio" class="speech-audio" controls preload="metadata" hidden aria-label="پخش صدای فارسی تولیدشده"></audio>
            <a id="speechTtsDownload" class="btn ghost speech-audio-download" download="گفتار-فارسی.wav" hidden>${icon('download', 15)} دریافت فایل WAV</a>
            <div id="speechTtsHint" class="speech-note warn">صدای عصبی tiny-ava هنوز در این دستگاه نصب نشده است؛ برای پریسا و مانا یک‌بار حدود ۴۳ MiB دریافت کنید. سپس گفتار روی همین دستگاه و بدون اینترنت ساخته می‌شود.</div>
            <details class="speech-details">
              <summary>شخصی‌سازی آفلاینِ تلفظ واژه‌ها · واژه‌نامهٔ شخصی</summary>
              <p>برای نام‌ها و واژه‌های خاص، هر خط را به‌شکل «واژه = خوانش دلخواه» بنویسید؛ مثلاً «کاظمی = کاظِمی». این واژه‌نامه فقط روی همین دستگاه ذخیره و پیش از گفتار اعمال می‌شود؛ وزن مدل را دوباره آموزش نمی‌دهد. اعراب‌گذاری در ستون خوانش به واج‌شناس فارسی کمک می‌کند.</p>
              <label class="speech-live-label" for="speechTtsLexicon">واژه‌نامهٔ محلی <small>حداکثر ۶۴ مدخل · هر خط یک مدخل</small></label>
              <textarea id="speechTtsLexicon" class="speech-textarea" dir="rtl" lang="fa" rows="4" maxlength="4000" placeholder="# نمونه\nکاظمی = کاظِمی\nمی‌خواهم = می‌خْواهم"></textarea>
              <div class="speech-actions">
                <button id="speechTtsLexiconSave" class="btn pri" type="button">${icon('check', 15)} ذخیرهٔ واژه‌نامه</button>
                <button id="speechTtsLexiconClear" class="btn ghost" type="button">${icon('trash', 15)} پاک‌کردن</button>
                <small id="speechTtsLexiconStatus" role="status" aria-live="polite">واژه‌نامهٔ شخصی فقط در حافظهٔ همین مرورگر می‌ماند.</small>
              </div>
            </details>
            <details class="speech-details">
              <summary>تلفظ، لحن و مجوز صداها</summary>
              <p>برای کمک به تلفظ واژه‌های هم‌نگاره، می‌توانید در متن از حرکت‌گذاری فارسی یا واژه‌نامهٔ محلی استفاده کنید؛ عدد، ساعت و درصد پیش از واج‌شناسی به واژه تبدیل و عددها، مبالغ، چند کلیدواژه و نام پس از عنوان‌هایی مثل «آقای» یا «دکتر» با تأکید ملایم مشخص می‌شوند. برای هر عبارت دلخواه، آن را انتخاب و دکمهٔ «تأکید» را بزنید یا از [[تأکید:عبارت]] استفاده کنید. ویرگول و مکث‌های درون جمله داخل همان نوبت مدل خوانده می‌شوند تا پیوند واژه‌ها قطع نشود؛ پایان جمله، پرسش، تعجب و بند خالی مکث می‌سازد و حالت خودکار با نشانه‌گذاری و چند الگوی روشن برای لحن رسمی، سپاس/تبریک، همدلی یا تأکید، تغییرات کوچکی می‌دهد؛ این تحلیل آفلاین و قاعده‌محور است، نه درک قطعی احساس یا نیت. در متن tiny-ava می‌توانید از [[مکث کوتاه]]، [[مکث]]، [[مکث بلند]]، [[کشیده:واژه]]، [[تأکید:عبارت]]، [[آه]]، [[اوه]]، [[هوم]] و [[نفس]] استفاده کنید؛ کشیده‌خوانی فقط کندترخواندن عبارت است، آواهای آه/اوه/هوم با همان واژه ساخته می‌شوند و نفس یک نویز مصنوعیِ نرم است، نه تنفس انسانیِ ضبط‌شده. حالت‌های رسمی، آرام، همدلانهٔ حرفه‌ای، شاد، غمگین، عصبانی، هیجان‌زده و روایت‌گر نیز فقط نگاشت تقریبی سرعت، زیر و بمی و مکث‌اند؛ مدل برچسب احساس آموزش‌دیده ندارد و برنامه چیزی را خودکار به متن اضافه نمی‌کند. طبق <a href="https://github.com/mallahyari/tiny-ava/tree/v2.0.0" target="_blank" rel="noopener noreferrer">مستندات tiny-ava v2</a>، پریسا صدای زنانهٔ فارسی و مانا صدای مردانهٔ برگرفته از ضبط استودیوییِ انسانیِ مجموعهٔ <a href="https://huggingface.co/datasets/MahtaFetrat/Mana-TTS" target="_blank" rel="noopener noreferrer">Mana-TTS HIGH (CC0-1.0)</a> است؛ مانا صدای کاملاً مصنوعی نیست و در این برنامه به شخص نام‌دار یا مشهور نسبت داده نمی‌شود. مجوزهای اعلام‌شده: وزن مدل CC BY 4.0، مجموعهٔ Mana-TTS HIGH برابر CC0-1.0، و G2P برابر MIT؛ برای وزن‌ها انتساب <a href="https://huggingface.co/mehdi-hf/tiny-ava" target="_blank" rel="noopener noreferrer">«Powered by tiny-ava (Mehdi Allahyari / OncillaAI)»</a> لازم است. هویت و رضایت گوینده فراتر از اطلاعات مجوز بالادستی مستقلاً تأیید نشده است.</p>
            </details>
          </section>
        </div>

        <div class="speech-tips" aria-label="نکته‌های حریم خصوصی و آفلاین">
          <div class="speech-tip"><span class="speech-tip-icon" aria-hidden="true">${icon('shield', 15)}</span><div><b>بدون ارسال صدا یا متن</b><small>فایل صوتی یا متنِ ورودی از این ابزار به شبکه فرستاده نمی‌شود.</small></div></div>
          <div class="speech-tip"><span class="speech-tip-icon" aria-hidden="true">${icon('tools', 15)}</span><div><b>گفتار عصبی و محلی</b><small>مدل فارسی فقط یک‌بار دریافت و در ذخیره‌ساز خصوصی همین مرورگر نگه‌داری می‌شود؛ متن جایی ارسال نمی‌شود.</small></div></div>
          <div class="speech-tip"><span class="speech-tip-icon" aria-hidden="true">${icon('info', 15)}</span><div><b>دیکته وابسته به مرورگر</b><small>گفتار به نوشتار به پشتیبانی on-device و بستهٔ fa-IR مرورگر وابسته است؛ مدل STT جداگانه همراه برنامه نیست.</small></div></div>
        </div>
      </div>`;

    const handoff = byId('speechDebtHandoff');
    if (handoff) handoff.hidden = !state.speechReturnToDebt;
    bindWorkspaceEvents();
    if (typeof window.showT === 'function') window.showT('استودیوی گفتار فارسی', 'دیکته و خوانش با پردازش محلی روی همین دستگاه');
    else if (typeof window.show === 'function') window.show('tool', true, 'دیکته و خوانش با پردازش محلی روی همین دستگاه');
    document.querySelectorAll('.nav [data-speech-nav]').forEach(button => button.classList.add('on'));
    loadSpeechPreferences();
    applyPendingSpeechLaunch();
    loadPronunciationLexicon();
    updateTranscriptCounters();
    updateTtsCounters();
    updateVoiceList();
    refreshStoredPiperVoices();
    refreshStoredTinyAvaModel();
    refreshRecognitionSupport();
    [250, 900, 2200].forEach(delay => window.setTimeout(() => {
      if (!state.localPersianVoices.length) updateVoiceList();
    }, delay));
  }

  function bindWorkspaceEvents() {
    const start = byId('speechStart');
    const stop = byId('speechStop');
    const install = byId('speechInstall');
    const refresh = byId('speechRefresh');
    const transcript = byId('speechTranscript');
    const ttsInput = byId('speechTtsInput');
    if (start) start.addEventListener('click', startDictation);
    if (stop) stop.addEventListener('click', stopDictation);
    if (install) install.addEventListener('click', installPersianPack);
    if (refresh) refresh.addEventListener('click', refreshRecognitionSupport);
    if (transcript) transcript.addEventListener('input', updateTranscriptCounters);
    if (ttsInput) ttsInput.addEventListener('input', () => {
      if (state.ttsPreparing || state.ttsRunning || state.ttsAudioUrl) stopSpeech(false);
      updateTtsCounters();
      updateTtsControls();
    });

    const byButton = (id, action) => { const button = byId(id); if (button) button.addEventListener('click', action); };
    byButton('speechCopy', copyTranscript);
    byButton('speechInsert', insertIntoQuickConsult);
    byButton('speechToTts', moveTranscriptToTts);
    byButton('speechClean', cleanTranscript);
    byButton('speechClear', clearTranscript);
    byButton('speechSpeak', speakText);
    byButton('speechTtsLexiconSave', savePronunciationLexicon);
    byButton('speechTtsLexiconClear', clearPronunciationLexicon);
    byButton('speechPause', pauseSpeech);
    byButton('speechResume', resumeSpeech);
    byButton('speechTtsStop', () => stopSpeech(true));
    byButton('speechReturnToDebt', returnToDebtCollection);
    byButton('speechPiperInstall', installOrRemovePiperVoice);
    byButton('speechTinyAvaInstall', installOrRemoveTinyAvaModel);

    const voice = byId('speechVoice');
    if (voice) voice.addEventListener('change', () => {
      state.voiceChoiceExplicit = true;
      if (state.piperWorker && !state.ttsPreparing && !state.ttsRunning) {
        try { state.piperWorker.terminate(); } catch (_) { /* no-op */ }
        state.piperWorker = null;
      }
      if (state.tinyAvaWorker && !state.ttsPreparing && !state.ttsRunning) {
        try { state.tinyAvaWorker.terminate(); } catch (_) { /* no-op */ }
        state.tinyAvaWorker = null;
      }
      saveSpeechPreferences();
      updateVoiceGuidance();
      updateTtsControls();
    });
    const rate = byId('speechRate');
    if (rate) rate.addEventListener('input', () => {
      updateRangeLabels();
      const audio = byId('speechTtsAudio');
      if (audio && audio.currentSrc) {
        const baseRate = Math.max(0.75, Number(state.ttsSynthesisRate) || 1);
        audio.playbackRate = Number(rate.value || 1) / baseRate;
      }
      saveSpeechPreferences();
    });
    const pitch = byId('speechPitch');
    if (pitch) pitch.addEventListener('input', () => { updateRangeLabels(); saveSpeechPreferences(); });
    const style = byId('speechTtsStyle');
    if (style) style.addEventListener('change', () => { saveSpeechPreferences(); updateTtsControls(); });
    const expressiveness = byId('speechTtsExpressiveness');
    if (expressiveness) expressiveness.addEventListener('input', () => { updateRangeLabels(); saveSpeechPreferences(); });
    const pauseScale = byId('speechTtsPauseScale');
    if (pauseScale) pauseScale.addEventListener('input', () => { updateRangeLabels(); saveSpeechPreferences(); });
    const cueBar = byId('speechTinyAvaCueBar');
    if (cueBar) cueBar.querySelectorAll('[data-tinyava-cue]').forEach(button => {
      button.addEventListener('click', () => insertTinyAvaCue(button.getAttribute('data-tinyava-cue') || ''));
    });
    byButton('speechTinyAvaStretch', wrapTinyAvaStretchCue);
    byButton('speechTinyAvaEmphasis', wrapTinyAvaEmphasisCue);

    if (!state.voiceEventsBound && window.speechSynthesis) {
      const synth = window.speechSynthesis;
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', updateVoiceList);
      else synth.onvoiceschanged = updateVoiceList;
      state.voiceEventsBound = true;
    }
    updateRangeLabels();
    updateRecognitionButtons();
    updateTtsControls();
  }

  function setStatus(id, text, kind) {
    const node = byId(id);
    if (!node) return;
    node.textContent = text;
    node.dataset.state = kind || 'busy';
  }

  function setOverall(text, kind) {
    const node = byId('speechOverall');
    if (!node) return;
    const label = node.querySelector('span');
    if (label) label.textContent = text;
    node.dataset.state = kind || 'busy';
  }

  function recognitionConstructor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  async function refreshRecognitionSupport() {
    const check = ++state.recognitionCheck;
    const Ctor = recognitionConstructor();
    state.recognitionCtor = Ctor;
    if (!byId('speechSttStatus')) return;
    state.recognitionStatus = 'checking';
    updateRecognitionButtons();

    if (window.isSecureContext === false && location.protocol !== 'file:') {
      state.recognitionStatus = 'insecure';
      setStatus('speechSttStatus', 'برای دسترسی امن به میکروفون، برنامه را از نشانی محلی HTTPS یا localhost اجرا کنید.', 'error');
      setOverall('نیازمند اجرای امن', 'error');
      updateRecognitionButtons();
      return;
    }
    if (!Ctor) {
      state.recognitionStatus = 'unsupported';
      setStatus('speechSttStatus', 'این مرورگر موتور تشخیص گفتارِ روی دستگاه را در اختیار نمی‌گذارد.', 'error');
      setOverall('موتور دیکته در دسترس نیست', 'error');
      updateRecognitionButtons();
      return;
    }

    let probe;
    try { probe = new Ctor(); }
    catch (_) {
      state.recognitionStatus = 'unsupported';
      setStatus('speechSttStatus', 'ساخت موتور تشخیص گفتار در این مرورگر ممکن نیست.', 'error');
      setOverall('موتور دیکته در دسترس نیست', 'error');
      updateRecognitionButtons();
      return;
    }
    if (!('processLocally' in probe)) {
      state.recognitionStatus = 'unsupported';
      setStatus('speechSttStatus', 'این مرورگر اجبار پردازش محلی را پشتیبانی نمی‌کند؛ برای جلوگیری از ارسال صدا، دیکته فعال نشده است.', 'error');
      setOverall('دیکتهٔ آفلاین پشتیبانی نمی‌شود', 'error');
      updateRecognitionButtons();
      return;
    }

    if (typeof Ctor.available !== 'function') {
      state.recognitionStatus = 'forced-local';
      setStatus('speechSttStatus', 'مرورگر امکان اجبار پردازش روی دستگاه را دارد؛ وضعیت بستهٔ فارسی قابل استعلام نیست. شروع دیکته همچنان فقط به‌صورت محلی انجام می‌شود.', 'busy');
      setOverall('حالت محلی اجباری', 'busy');
      updateRecognitionButtons();
      return;
    }

    setStatus('speechSttStatus', 'در حال بررسی بستهٔ فارسی روی دستگاه…', 'busy');
    setOverall('در حال بررسی دیکتهٔ آفلاین…', 'busy');
    updateRecognitionButtons();
    try {
      const availability = await Ctor.available({ langs: [LANGUAGE], processLocally: true });
      if (check !== state.recognitionCheck || !byId('speechSttStatus')) return;
      if (availability === 'available') {
        state.recognitionStatus = 'available';
        setStatus('speechSttStatus', 'موتور و بستهٔ فارسی آماده‌اند؛ دیکته فقط روی همین دستگاه اجرا می‌شود.', 'ready');
        setOverall('دیکتهٔ فارسی آماده است', 'ready');
      } else if (availability === 'downloadable') {
        state.recognitionStatus = 'downloadable';
        const canInstallHere = typeof Ctor.install === 'function';
        setStatus('speechSttStatus', navigator.onLine === false
          ? 'بستهٔ فارسی هنوز نصب نیست. برای دریافت اولیهٔ بسته، یک‌بار به اینترنت وصل شوید؛ پس از نصب، دیکته آفلاین می‌شود.'
          : canInstallHere
            ? 'بستهٔ گفتار فارسی آمادهٔ دریافت است. نصب را فقط با انتخاب خودتان شروع کنید؛ پس از آن دیکته محلی خواهد بود.'
            : 'بستهٔ فارسی نصب نیست و این مرورگر نصب برنامه‌ای آن را پشتیبانی نمی‌کند؛ بسته را از تنظیمات خود مرورگر نصب کنید و سپس «بررسی دوباره» را بزنید.', 'busy');
        if (!canInstallHere) setStatus('speechSttGuidance', 'اگر مرورگر نصب بسته از داخل برنامه را ارائه نمی‌کند، قابلیت on-device recognition و بستهٔ fa-IR را از تنظیمات مرورگر بررسی کنید.', 'warn');
        setOverall('بستهٔ فارسی نصب نشده', 'busy');
      } else if (availability === 'downloading') {
        state.recognitionStatus = 'downloading';
        setStatus('speechSttStatus', 'مرورگر در حال دریافت بستهٔ گفتار فارسی است؛ پس از پایان، وضعیت دوباره بررسی می‌شود.', 'busy');
        setOverall('دریافت بستهٔ فارسی در جریان است', 'busy');
      } else if (availability === 'unavailable') {
        state.recognitionStatus = 'unavailable';
        setStatus('speechSttStatus', 'این مرورگر برای زبان فارسیِ ایران موتور آفلاین یا بستهٔ قابل نصب ندارد. هیچ تشخیص آنلاینی جایگزین نمی‌شود.', 'error');
        setOverall('دیکتهٔ آفلاین برای fa-IR موجود نیست', 'error');
      } else {
        state.recognitionStatus = 'error';
        setStatus('speechSttStatus', 'مرورگر وضعیت بستهٔ فارسی را نشناخت؛ برای جلوگیری از استفادهٔ ناخواسته از سرویس ابری، دیکته غیرفعال ماند.', 'error');
        setOverall('وضعیت دیکته نامشخص است', 'error');
      }
    } catch (error) {
      if (check !== state.recognitionCheck) return;
      state.recognitionStatus = 'error';
      setStatus('speechSttStatus', 'بررسی بستهٔ آفلاین ممکن نشد. از اجرای امن برنامه و پشتیبانی مرورگر از بستهٔ fa-IR مطمئن شوید.', 'error');
      setOverall('بررسی دیکتهٔ آفلاین ناموفق بود', 'error');
      console.warn('Offline Persian speech availability check failed:', error);
    }
    updateRecognitionButtons();
  }

  function updateRecognitionButtons() {
    const start = byId('speechStart');
    const stop = byId('speechStop');
    const install = byId('speechInstall');
    const refresh = byId('speechRefresh');
    if (start) start.disabled = state.listening || state.starting || !['available', 'forced-local'].includes(state.recognitionStatus);
    if (stop) stop.disabled = !(state.listening || state.starting);
    if (refresh) refresh.disabled = state.recognitionStatus === 'checking';
    if (install) {
      const canInstall = state.recognitionStatus === 'downloadable' && state.recognitionCtor && typeof state.recognitionCtor.install === 'function';
      install.hidden = !canInstall;
      install.disabled = canInstall && navigator.onLine === false;
      install.title = install.disabled ? 'برای دریافت اولیهٔ بستهٔ فارسی، اتصال اینترنت لازم است.' : '';
    }
  }

  async function installPersianPack() {
    const Ctor = state.recognitionCtor;
    if (!Ctor || typeof Ctor.install !== 'function' || state.recognitionStatus !== 'downloadable') return;
    if (navigator.onLine === false) {
      setStatus('speechSttStatus', 'برای دریافت اولیهٔ بستهٔ فارسی، اتصال اینترنت لازم است. پس از نصب، استفاده از دیکته آفلاین خواهد بود.', 'error');
      return;
    }
    const button = byId('speechInstall');
    if (button) button.disabled = true;
    setStatus('speechSttStatus', 'درخواست نصب بستهٔ فارسی به مرورگر سپرده شد؛ تا پایان دریافت، این پنجره را نبندید.', 'busy');
    setOverall('در حال نصب بستهٔ فارسی', 'busy');
    try {
      const installed = await Ctor.install({ langs: [LANGUAGE] });
      if (!byId('speechSttStatus')) return;
      if (installed) {
        setStatus('speechSttStatus', 'نصب بسته کامل شد؛ در حال تأیید آمادگی موتور محلی…', 'busy');
        await refreshRecognitionSupport();
      } else {
        setStatus('speechSttStatus', 'مرورگر بستهٔ فارسی را نصب نکرد. اتصال، فضای ذخیره‌سازی و پشتیبانی fa-IR را بررسی کنید.', 'error');
        setOverall('نصب بستهٔ فارسی کامل نشد', 'error');
      }
    } catch (error) {
      setStatus('speechSttStatus', 'دریافت بسته انجام نشد. اگر اینترنت قطع است، بعداً فقط برای نصب اولیه دوباره تلاش کنید.', 'error');
      setOverall('نصب اولیهٔ بسته ناموفق بود', 'error');
      console.warn('Offline Persian speech package installation failed:', error);
    } finally {
      updateRecognitionButtons();
    }
  }

  async function startDictation() {
    if (state.listening || state.starting) return;
    if (!['available', 'forced-local'].includes(state.recognitionStatus)) {
      await refreshRecognitionSupport();
      if (!['available', 'forced-local'].includes(state.recognitionStatus)) return;
    }
    const Ctor = state.recognitionCtor || recognitionConstructor();
    const textarea = byId('speechTranscript');
    if (!Ctor || !textarea) return;

    let recognizer;
    try { recognizer = new Ctor(); }
    catch (_) {
      setStatus('speechSttStatus', 'ساخت موتور دیکته ممکن نشد؛ مرورگر را به‌روز کنید یا از مرورگر سازگار استفاده کنید.', 'error');
      return;
    }
    if (!('processLocally' in recognizer)) {
      state.recognitionStatus = 'unsupported';
      setStatus('speechSttStatus', 'پردازش محلی در دسترس نیست؛ برای جلوگیری از ارسال صدا، دیکته متوقف شد.', 'error');
      updateRecognitionButtons();
      return;
    }

    const session = ++state.recognitionSession;
    const original = textarea.value.trimEnd();
    const segments = [];
    state.lastRecognitionError = '';
    state.recognition = recognizer;
    state.starting = true;
    state.listening = false;
    state.stopping = false;
    textarea.readOnly = true;
    setStatus('speechSttStatus', 'در حال آماده‌سازی میکروفون و موتور آفلاین…', 'busy');
    setOverall('دیکتهٔ محلی در حال آماده‌سازی', 'busy');
    setLiveState(false, 'در انتظار اجازهٔ میکروفون…');
    updateRecognitionButtons();

    recognizer.lang = LANGUAGE;
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    try { recognizer.processLocally = true; }
    catch (_) {
      state.recognitionStatus = 'unsupported';
      state.recognition = null;
      state.starting = false;
      textarea.readOnly = false;
      setStatus('speechSttStatus', 'مرورگر درخواست پردازش محلی را نپذیرفت؛ دیکته اجرا نشد.', 'error');
      updateRecognitionButtons();
      return;
    }

    recognizer.onstart = () => {
      if (session !== state.recognitionSession) return;
      state.starting = false;
      state.listening = true;
      setStatus('speechSttStatus', 'در حال شنیدن فارسی؛ پردازش روی دستگاه فعال است.', 'listening');
      setOverall('میکروفون فعال است', 'listening');
      setLiveState(true, 'در حال شنیدن…');
      updateRecognitionButtons();
    };
    recognizer.onspeechstart = () => {
      if (session === state.recognitionSession) setLiveState(true, 'گفتار دریافت شد؛ در حال تبدیل به متن…');
    };
    recognizer.onresult = event => {
      if (session !== state.recognitionSession) return;
      for (let index = event.resultIndex || 0; index < event.results.length; index++) {
        const result = event.results[index];
        const alternative = result && result[0];
        segments[index] = alternative ? String(alternative.transcript || '').trim() : '';
      }
      const addition = segments.filter(Boolean).join(' ').replace(/\s+([،؛؟.!])/g, '$1').trim();
      textarea.value = [original, addition].filter(Boolean).join(original && addition ? ' ' : '');
      updateTranscriptCounters();
      setLiveState(true, addition ? 'متن زنده به‌روزرسانی شد.' : 'در حال شنیدن…');
    };
    recognizer.onnomatch = () => {
      if (session === state.recognitionSession) setLiveState(true, 'گفتار واضحی تشخیص داده نشد؛ کمی آهسته‌تر و نزدیک‌تر صحبت کنید.');
    };
    recognizer.onerror = event => {
      if (session !== state.recognitionSession) return;
      const error = event && event.error ? event.error : 'unknown';
      state.lastRecognitionError = recognitionErrorText(error);
      setStatus('speechSttStatus', state.lastRecognitionError, 'error');
      setOverall('دیکته با خطا متوقف شد', 'error');
      setLiveState(false, 'میکروفون یا بستهٔ گفتار را بررسی کنید.');
      if (error === 'language-not-supported' || error === 'language-unavailable') refreshRecognitionSupport();
    };
    recognizer.onend = () => {
      if (session !== state.recognitionSession) return;
      state.recognition = null;
      state.starting = false;
      state.listening = false;
      state.stopping = false;
      textarea.readOnly = false;
      if (!state.lastRecognitionError) {
        setStatus('speechSttStatus', 'دیکته پایان یافت؛ متن را بازبینی و ویرایش کنید.', 'ready');
        setOverall('دیکتهٔ محلی آماده است', 'ready');
        setLiveState(false, 'دیکته متوقف شد.');
      }
      updateTranscriptCounters();
      updateRecognitionButtons();
    };

    try {
      recognizer.start();
    } catch (error) {
      state.recognition = null;
      state.starting = false;
      state.listening = false;
      textarea.readOnly = false;
      const message = error && error.name === 'NotAllowedError'
        ? 'اجازهٔ میکروفون داده نشد؛ دسترسی میکروفون را برای این برنامه فعال کنید.'
        : 'شروع موتور دیکته ممکن نشد؛ دسترسی میکروفون، اجرای امن و نصب بستهٔ fa-IR را بررسی کنید.';
      setStatus('speechSttStatus', message, 'error');
      setOverall('دیکته شروع نشد', 'error');
      setLiveState(false, 'برای تلاش دوباره، دسترسی میکروفون را بررسی کنید.');
      updateRecognitionButtons();
      console.warn('Local Persian speech recognition could not start:', error);
    }
  }

  function recognitionErrorText(code) {
    const messages = {
      'not-allowed': 'اجازهٔ میکروفون داده نشد. دسترسی میکروفون را در تنظیمات مرورگر فعال کنید.',
      'service-not-allowed': 'مرورگر موتور گفتار محلی را اجازه نداد؛ از مرورگر و بستهٔ فارسیِ پشتیبانی‌شده استفاده کنید.',
      'audio-capture': 'میکروفون پیدا نشد یا در اختیار برنامهٔ دیگری است.',
      'no-speech': 'گفتاری دریافت نشد. میکروفون را بررسی کنید و واضح‌تر صحبت کنید.',
      'language-not-supported': 'بستهٔ محلی fa-IR در دسترس نیست یا نصب آن کامل نشده است.',
      'language-unavailable': 'زبان فارسی برای موتور محلی این مرورگر موجود نیست.',
      'network': 'موتور محلی خطا داد. این ابزار به سرویس آنلاین تغییر مسیر نمی‌دهد.',
      'aborted': 'دیکته متوقف شد.',
      'bad-grammar': 'موتور محلی در پردازش گفتار خطا داد.'
    };
    return messages[code] || 'موتور گفتار محلی خطای نامشخصی داد؛ دسترسی میکروفون و بستهٔ فارسی را بررسی کنید.';
  }

  function stopDictation() {
    const recognizer = state.recognition;
    if (!recognizer) return;
    state.stopping = true;
    setStatus('speechSttStatus', 'در حال پایان‌دادن به دیکته و تکمیل متن…', 'busy');
    setLiveState(true, 'در حال بستن میکروفون…');
    updateRecognitionButtons();
    try { recognizer.stop(); }
    catch (_) {
      try { recognizer.abort(); } catch (_) { /* no-op */ }
      state.recognition = null;
      state.starting = false;
      state.listening = false;
      state.stopping = false;
      const textarea = byId('speechTranscript');
      if (textarea) textarea.readOnly = false;
      setLiveState(false, 'دیکته متوقف شد.');
      updateRecognitionButtons();
    }
  }

  function setLiveState(live, text) {
    const node = byId('speechLive');
    if (!node) return;
    node.dataset.live = live ? 'true' : 'false';
    const label = byId('speechLiveText');
    if (label) label.textContent = text;
  }

  function updateTranscriptCounters() {
    const textarea = byId('speechTranscript');
    if (!textarea) return;
    const text = textarea.value.trim();
    const chars = byId('speechTranscriptChars');
    const words = byId('speechTranscriptWords');
    if (chars) chars.textContent = `${faNumber(textarea.value.length)} نویسه`;
    if (words) words.textContent = `${faNumber(text ? text.split(/\s+/u).filter(Boolean).length : 0)} واژه`;
  }

  function normalizePersianText(value) {
    return String(value || '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
      .split(/\n+/u).map(line => line.trim().replace(/[\t ]+/g, ' ')
        .replace(/[\t ]*([،؛؟.!])/g, '$1').replace(/([،؛؟.!])(?=\S)/g, '$1 '))
      .filter(Boolean).join('\n');
  }

  function cleanTranscript() {
    const textarea = byId('speechTranscript');
    if (!textarea || !textarea.value.trim()) return notify('متنی برای پاک‌سازی وجود ندارد.');
    textarea.value = normalizePersianText(textarea.value);
    updateTranscriptCounters();
    notify('یکنواخت‌سازی حروف و فاصله‌گذاری انجام شد.');
  }

  function clearTranscript() {
    const textarea = byId('speechTranscript');
    if (!textarea) return;
    if (state.listening || state.starting) stopDictation();
    textarea.value = '';
    updateTranscriptCounters();
    setLiveState(false, 'متن پاک شد.');
    textarea.focus();
  }

  function copyTranscript() {
    const text = (byId('speechTranscript') || {}).value || '';
    if (!text.trim()) return notify('متنی برای کپی وجود ندارد.');
    if (typeof window.copyText === 'function') window.copyText(text);
    else copyFallback(text);
  }

  function copyFallback(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); notify('متن کپی شد.'); }
    catch (_) { notify('کپی خودکار ممکن نشد؛ متن را انتخاب و کپی کنید.'); }
    area.remove();
  }

  function insertIntoQuickConsult() {
    const text = (byId('speechTranscript') || {}).value || '';
    const target = byId('freeText');
    if (!text.trim()) return notify('متنی برای انتقال وجود ندارد.');
    if (!target) return notify('کادر مشاورهٔ سریع پیدا نشد.');
    target.value = target.value.trim() ? `${target.value.trim()}\n${text.trim()}` : text.trim();
    if (typeof window.show === 'function') window.show('home', true);
    window.setTimeout(() => {
      target.focus();
      if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    notify('متن به مشاورهٔ سریع منتقل شد.');
  }

  function moveTranscriptToTts() {
    const text = (byId('speechTranscript') || {}).value || '';
    const target = byId('speechTtsInput');
    if (!text.trim()) return notify('متنی برای خواندن وجود ندارد.');
    if (!target) return;
    if (state.ttsPreparing || state.ttsRunning || state.ttsAudioUrl) stopSpeech(false);
    target.value = text.trim();
    updateTtsCounters();
    updateTtsControls();
    target.focus();
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    notify('متن برای خواندن آماده شد.');
  }

  function updateTtsCounters() {
    const area = byId('speechTtsInput');
    if (!area) return;
    const text = area.value.trim();
    const chars = byId('speechTtsChars');
    const words = byId('speechTtsWords');
    if (chars) chars.textContent = `${faNumber(area.value.length)} نویسه`;
    if (words) words.textContent = `${faNumber(text ? text.split(/\s+/u).filter(Boolean).length : 0)} واژه`;
  }

  function isPersianVoice(voice) {
    return !!voice && /^fa(?:[-_]|$)/i.test(String(voice.lang || ''));
  }

  function updateVoiceList() {
    const select = byId('speechVoice');
    if (!select) return;
    const synth = window.speechSynthesis;
    const canUseBundledVoice = typeof window.Worker === 'function' &&
      typeof window.Audio === 'function' && typeof window.URL.createObjectURL === 'function';
    const canUseNeuralVoice = canUseBundledVoice && typeof window.indexedDB !== 'undefined' &&
      typeof window.WebAssembly !== 'undefined' && !!(window.crypto && window.crypto.subtle);

    state.voices = synth && typeof synth.getVoices === 'function' ? (synth.getVoices() || []) : [];
    const persianVoices = state.voices.filter(isPersianVoice);
    state.localPersianVoices = persianVoices.filter(voice => voice.localService === true);
    select.replaceChildren();

    const tinyAvaGroup = document.createElement('optgroup');
    tinyAvaGroup.label = 'پیشنهاد خوانش عصبی و پیوسته · tiny-ava v2، مدل مشترک و آفلاین';
    Object.entries(TINY_AVA_VOICES).forEach(([id, voice]) => {
      const option = document.createElement('option');
      option.value = `${TINY_AVA_VOICE_PREFIX}${id}`;
      option.textContent = `${voice.title} — دریافت اولیهٔ مشترک حدود ۴۳ MiB`;
      option.disabled = !canUseNeuralVoice;
      tinyAvaGroup.appendChild(option);
    });
    select.appendChild(tinyAvaGroup);

    const piperGroup = document.createElement('optgroup');
    piperGroup.label = 'صدای عصبی Piper · هر مدل جداگانه دریافت می‌شود';
    Object.entries(PIPER_VOICES).forEach(([id, model]) => {
      const option = document.createElement('option');
      option.value = `${PIPER_VOICE_PREFIX}${id}`;
      option.textContent = `${model.title} — حدود ۶۱ MiB`;
      option.disabled = !canUseNeuralVoice;
      piperGroup.appendChild(option);
    });
    select.appendChild(piperGroup);

    const bundledGroup = document.createElement('optgroup');
    bundledGroup.label = 'صدای جایگزینِ همراه برنامه';
    const bundledOption = document.createElement('option');
    bundledOption.value = BUNDLED_VOICE_ID;
    bundledOption.textContent = 'فارسی eSpeak NG — سریع و همراه برنامه، اما مصنوعی‌تر';
    bundledOption.disabled = !canUseBundledVoice;
    bundledGroup.appendChild(bundledOption);
    select.appendChild(bundledGroup);

    if (state.localPersianVoices.length) {
      const systemGroup = document.createElement('optgroup');
      systemGroup.label = 'صداهای فارسیِ محلیِ سیستم';
      state.localPersianVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.voiceURI;
        option.textContent = `${voice.name || 'صدای فارسی'} — ${voice.lang || LANGUAGE}${voice.default ? ' (پیش‌فرض)' : ''}`;
        systemGroup.appendChild(option);
      });
      select.appendChild(systemGroup);
    }

    select.disabled = !canUseNeuralVoice && !canUseBundledVoice && !state.localPersianVoices.length;
    const prefs = readSpeechPreferences();
    const savedNativeVoice = state.localPersianVoices.find(voice => voice.voiceURI === prefs.voiceURI);
    const savedBundledVoice = canUseBundledVoice && prefs.voiceURI === BUNDLED_VOICE_ID;
    const savedTinyAvaId = String(prefs.voiceURI || '').startsWith(TINY_AVA_VOICE_PREFIX)
      ? String(prefs.voiceURI).slice(TINY_AVA_VOICE_PREFIX.length)
      : '';
    const savedTinyAvaExists = canUseNeuralVoice && Object.prototype.hasOwnProperty.call(TINY_AVA_VOICES, savedTinyAvaId);
    const savedPiperId = String(prefs.voiceURI || '').startsWith(PIPER_VOICE_PREFIX)
      ? String(prefs.voiceURI).slice(PIPER_VOICE_PREFIX.length)
      : '';
    const savedPiperExists = canUseNeuralVoice && Object.prototype.hasOwnProperty.call(PIPER_VOICES, savedPiperId);
    const explicitVoiceChoice = prefs.voiceChoiceExplicit === true;
    const defaultValue = savedTinyAvaExists
      ? `${TINY_AVA_VOICE_PREFIX}${savedTinyAvaId}`
      : savedPiperExists
        ? `${PIPER_VOICE_PREFIX}${savedPiperId}`
        : explicitVoiceChoice && savedNativeVoice
          ? savedNativeVoice.voiceURI
          : explicitVoiceChoice && savedBundledVoice
            ? BUNDLED_VOICE_ID
            : canUseNeuralVoice
              ? `${TINY_AVA_VOICE_PREFIX}${DEFAULT_TINY_AVA_VOICE}`
              : savedNativeVoice
                ? savedNativeVoice.voiceURI
                : savedBundledVoice
                  ? BUNDLED_VOICE_ID
                  : canUseBundledVoice
                    ? BUNDLED_VOICE_ID
                    : state.localPersianVoices.length
                      ? (state.localPersianVoices.find(voice => voice.default) || state.localPersianVoices[0]).voiceURI
                      : '';
    select.value = defaultValue;

    updateVoiceGuidance();
    updatePiperDownloadControls();
    updateTinyAvaDownloadControls();
    updateTtsControls();
  }

  function refreshStoredPiperVoices() {
    const request = ++state.piperAvailabilityRequest;
    import('./speech-vendor/piper/store.mjs').then(store => store.listStoredVoices()).then(ids => {
      if (request !== state.piperAvailabilityRequest) return;
      state.piperVoiceIds = new Set(ids.map(String).filter(id => Object.prototype.hasOwnProperty.call(PIPER_VOICES, id)));
      state.piperAvailabilityChecked = true;
      updateVoiceGuidance();
      updatePiperDownloadControls();
      updateTtsControls();
    }).catch(error => {
      if (request !== state.piperAvailabilityRequest) return;
      state.piperAvailabilityChecked = false;
      updateVoiceGuidance(error);
      updatePiperDownloadControls();
      updateTtsControls();
      console.warn('Could not inspect the local Persian neural voice store:', error);
    });
  }

  function refreshStoredTinyAvaModel() {
    const request = ++state.tinyAvaAvailabilityRequest;
    import('./speech-vendor/tiny-ava/store.mjs').then(store => store.hasStoredTinyAvaModel()).then(installed => {
      if (request !== state.tinyAvaAvailabilityRequest) return;
      state.tinyAvaInstalled = !!installed;
      state.tinyAvaAvailabilityChecked = true;
      updateVoiceGuidance();
      updateTinyAvaDownloadControls();
      updateTtsControls();
    }).catch(error => {
      if (request !== state.tinyAvaAvailabilityRequest) return;
      state.tinyAvaInstalled = false;
      state.tinyAvaAvailabilityChecked = false;
      updateVoiceGuidance(error);
      updateTinyAvaDownloadControls();
      updateTtsControls();
      console.warn('Could not inspect the local tiny-ava model store:', error);
    });
  }

  function updateTinyAvaDownloadControls() {
    const button = byId('speechTinyAvaInstall');
    const progress = byId('speechTinyAvaDownloadWrap');
    const selected = getSelectedVoice();
    const isTinyAva = !!(selected && selected.type === 'tiny-ava');
    if (button) {
      button.hidden = !isTinyAva;
      button.disabled = !isTinyAva || (state.ttsPreparing || state.ttsRunning) ||
        (state.tinyAvaDownloading && !state.tinyAvaDownloadCancelable) ||
        (!state.tinyAvaDownloading && !state.tinyAvaInstalled && !state.tinyAvaAvailabilityChecked);
      button.innerHTML = state.tinyAvaDownloading
        ? state.tinyAvaDownloadCancelable
          ? `${icon('x', 15)} لغو دریافت`
          : 'در حال بررسی و ذخیرهٔ مدل…'
        : state.tinyAvaInstalled
          ? `${icon('trash', 15)} حذف مدل tiny-ava`
          : `${icon('download', 15)} دریافت مدل tiny-ava (حدود ۴۳ MiB)`;
    }
    if (progress) progress.hidden = !state.tinyAvaDownloading;
  }

  function updateTinyAvaDownloadProgress(received, total, label) {
    const wrap = byId('speechTinyAvaDownloadWrap');
    const text = byId('speechTinyAvaDownloadText');
    const percentText = byId('speechTinyAvaDownloadPercent');
    const bar = byId('speechTinyAvaDownloadBar');
    const totalBytes = Number(total) || TINY_AVA_MODEL_BYTES;
    const value = totalBytes > 0 ? Math.max(0, Math.min(100, Math.round(Number(received) / totalBytes * 100))) : 0;
    if (wrap) wrap.hidden = !state.tinyAvaDownloading;
    if (text) text.textContent = label || `دریافت مدل tiny-ava: ${faNumber((Number(received) / 1048576).toFixed(1))} از ${faNumber((totalBytes / 1048576).toFixed(1))} MiB`;
    if (percentText) percentText.textContent = `${faNumber(value)}٪`;
    if (bar) bar.style.width = `${value}%`;
  }

  async function installOrRemoveTinyAvaModel() {
    if (state.tinyAvaDownloading) {
      if (state.tinyAvaDownloadCancelable && state.tinyAvaDownloadAbort) state.tinyAvaDownloadAbort.abort();
      return;
    }
    const selected = getSelectedVoice();
    if (!selected || selected.type !== 'tiny-ava') return;
    if (state.tinyAvaInstalled) {
      if (!window.confirm('مدل مشترک پریسا و مانا از حافظهٔ محلی همین مرورگر حذف شود؟')) return;
      stopSpeech(false);
      try {
        const store = await import('./speech-vendor/tiny-ava/store.mjs');
        await store.removeStoredTinyAvaModel();
        state.tinyAvaInstalled = false;
        state.tinyAvaAvailabilityChecked = true;
        setStatus('speechTtsStatus', 'مدل tiny-ava از حافظهٔ محلی حذف شد.', 'idle');
      } catch (error) {
        setStatus('speechTtsStatus', `حذف مدل محلی انجام نشد: ${error.message || 'خطای ذخیره‌ساز'}`, 'error');
      }
      updateVoiceGuidance();
      updateTinyAvaDownloadControls();
      updateTtsControls();
      return;
    }
    await downloadTinyAvaModel();
  }

  async function downloadTinyAvaModel() {
    if (state.tinyAvaDownloading) return;
    if (navigator.onLine === false) {
      setStatus('speechTtsStatus', 'برای دریافت نخستین مدل tiny-ava اتصال اینترنت لازم است؛ پس از ذخیره، گفتار کاملاً آفلاین است.', 'error');
      return;
    }

    const controller = new AbortController();
    state.tinyAvaDownloading = true;
    state.tinyAvaDownloadCancelable = true;
    state.tinyAvaDownloadAbort = controller;
    updateTinyAvaDownloadControls();
    updateTtsControls();
    setStatus('speechTtsStatus', 'در حال دریافت مدل گفتار و واج‌شناس فارسی؛ هیچ متن گفتاری ارسال نمی‌شود…', 'busy');
    updateTinyAvaDownloadProgress(0, TINY_AVA_MODEL_BYTES, 'در حال آماده‌سازی دریافت حدود ۴۳ MiB…');
    let receivedTotal = 0;
    let lastProgressAt = 0;

    try {
      if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        const estimate = await navigator.storage.estimate();
        const free = Number(estimate.quota) - Number(estimate.usage || 0);
        if (Number.isFinite(free) && free > 0 && free < TINY_AVA_MODEL_BYTES * 1.12) {
          throw new Error('فضای آزاد ذخیره‌ساز مرورگر برای مدل مشترک پریسا و مانا (حدود ۴۳ MiB) کافی نیست؛ فضای سایت را آزاد کنید.');
        }
        if (typeof navigator.storage.persist === 'function') {
          try { await navigator.storage.persist(); } catch (_) { /* persistence is optional */ }
        }
      }

      const tinyAva = await import('./speech-vendor/tiny-ava/core.mjs');
      const integrity = await import('./speech-vendor/piper/core.mjs');
      const assets = {};
      for (const asset of tinyAva.TINY_AVA_ASSETS) {
        if (controller.signal.aborted) {
          const abortError = new Error('دریافت مدل با انتخاب شما متوقف شد.');
          abortError.name = 'AbortError';
          throw abortError;
        }
        setStatus('speechTtsStatus', `در حال دریافت ${asset.label}…`, 'busy');
        const response = await fetch(asset.url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`دریافت ${asset.label} ناموفق بود (HTTP ${response.status}).`);
        const total = Number(response.headers.get('content-length')) || asset.bytes;
        let received = 0;
        const chunks = [];
        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader();
          while (true) {
            const item = await reader.read();
            if (item.done) break;
            if (!item.value) continue;
            received += item.value.byteLength;
            if (received > asset.bytes) {
              controller.abort();
              throw new Error(`${asset.label} از اندازهٔ نسخهٔ معتبر بزرگ‌تر شد؛ دریافت متوقف شد.`);
            }
            chunks.push(item.value);
            const now = Date.now();
            if (now - lastProgressAt > 120 || received >= total) {
              updateTinyAvaDownloadProgress(receivedTotal + received, TINY_AVA_MODEL_BYTES,
                `${asset.label}: ${faNumber(((receivedTotal + received) / 1048576).toFixed(1))} از ${faNumber((TINY_AVA_MODEL_BYTES / 1048576).toFixed(1))} MiB`);
              lastProgressAt = now;
            }
          }
        } else {
          const blob = await response.blob();
          received = blob.size;
          chunks.push(blob);
        }
        if (controller.signal.aborted) {
          const abortError = new Error('دریافت مدل با انتخاب شما متوقف شد.');
          abortError.name = 'AbortError';
          throw abortError;
        }
        if (received !== asset.bytes) {
          throw new Error(`اندازهٔ ${asset.label} با نسخهٔ معتبر هم‌خوان نیست (${faNumber(received)} بایت)؛ دانلود ناقص ذخیره نشد.`);
        }
        state.tinyAvaDownloadCancelable = false;
        updateTinyAvaDownloadControls();
        const blob = new Blob(chunks, { type: 'application/octet-stream' });
        updateTinyAvaDownloadProgress(receivedTotal + received, TINY_AVA_MODEL_BYTES, `بررسی SHA-256: ${asset.label}…`);
        const actualSha256 = await integrity.sha256Hex(blob);
        if (actualSha256 !== asset.sha256) {
          throw new Error(`SHA-256 ${asset.label} با نسخهٔ منتشرشده هم‌خوان نیست؛ فایل ذخیره نشد.`);
        }
        assets[asset.id] = blob;
        receivedTotal += received;
        state.tinyAvaDownloadCancelable = true;
        updateTinyAvaDownloadControls();
      }

      state.tinyAvaDownloadCancelable = false;
      updateTinyAvaDownloadControls();
      const record = {
        id: tinyAva.TINY_AVA_MODEL_ID,
        version: tinyAva.TINY_AVA_VERSION,
        tts: assets.tts,
        g2pEncoder: assets.g2pEncoder,
        g2pDecoder: assets.g2pDecoder,
        bytes: receivedTotal,
        assetSha256: Object.fromEntries(tinyAva.TINY_AVA_ASSETS.map(asset => [asset.id, asset.sha256])),
        savedAt: Date.now()
      };
      const store = await import('./speech-vendor/tiny-ava/store.mjs');
      await store.saveStoredTinyAvaModel(record);
      state.tinyAvaInstalled = true;
      state.tinyAvaAvailabilityChecked = true;
      updateTinyAvaDownloadProgress(TINY_AVA_MODEL_BYTES, TINY_AVA_MODEL_BYTES, 'مدل مشترک پریسا و مانا بررسی و در حافظهٔ محلی ذخیره شد.');
      setStatus('speechTtsStatus', 'مدل tiny-ava نصب شد؛ پریسا و مانا از این پس بدون اینترنت روی همین دستگاه کار می‌کنند.', 'ready');
      notify('مدل مشترک پریسا و مانا ذخیره شد؛ استفادهٔ بعدی آفلاین است.');
    } catch (error) {
      if (error && error.name === 'AbortError') {
        setStatus('speechTtsStatus', 'دریافت tiny-ava متوقف شد؛ فایل ناقص ذخیره نشد.', 'idle');
        updateTinyAvaDownloadProgress(0, TINY_AVA_MODEL_BYTES, 'دریافت مدل متوقف شد.');
      } else {
        const message = error && error.name === 'TypeError'
          ? 'اتصال به میزبان مدل برقرار نشد؛ اینترنت و اجازهٔ CORS میزبان را بررسی کنید.'
          : error && error.message ? error.message : 'خطای شبکه یا ذخیره‌ساز';
        setStatus('speechTtsStatus', `دریافت مدل tiny-ava ناموفق بود: ${message}`, 'error');
        updateTinyAvaDownloadProgress(0, TINY_AVA_MODEL_BYTES, 'دریافت مدل ناموفق بود.');
        console.warn('tiny-ava Persian voice download failed:', error);
      }
    } finally {
      state.tinyAvaDownloading = false;
      state.tinyAvaDownloadCancelable = false;
      state.tinyAvaDownloadAbort = null;
      updateVoiceGuidance();
      updateTinyAvaDownloadControls();
      updateTtsControls();
    }
  }

  function updateVoiceGuidance(storageError) {
    if (state.ttsPreparing || state.ttsRunning || state.piperDownloading || state.tinyAvaDownloading) return;
    const selected = getSelectedVoice();
    const hint = byId('speechTtsHint');
    const modelInfo = byId('speechNeuralInfo');
    if (selected && selected.type === 'tiny-ava') {
      const title = TINY_AVA_VOICES[selected.id].title;
      if (modelInfo) modelInfo.textContent = 'مدل مشترک حدود ۴۳ MiB؛ منبع مانا ضبط استودیوییِ انسانی (Mana-TTS HIGH، CC0) است؛ سپس کاملاً آفلاین.';
      if (storageError) {
        setStatus('speechTtsStatus', 'ذخیره‌ساز پایدار مدل tiny-ava در این مرورگر در دسترس نیست.', 'error');
        setStatus('speechTtsGuidance', 'برای نگه‌داری محلیِ مدل ۴۳ MiB به IndexedDB، Worker و WebAssembly نیاز است؛ از localhost یا HTTPS و مرورگر به‌روز استفاده کنید.', 'error');
      } else if (!state.tinyAvaAvailabilityChecked) {
        setStatus('speechTtsStatus', 'در حال بررسی مدل tiny-ava روی همین دستگاه…', 'busy');
        setStatus('speechTtsGuidance', 'مدل گفتار و واج‌شناس فقط با انتخاب شما یک‌بار دریافت می‌شوند؛ بعد از ذخیره، ساخت صدا روی همین دستگاه و بدون اینترنت است.', 'warn');
      } else if (state.tinyAvaInstalled) {
        setStatus('speechTtsStatus', `${title} آمادهٔ گفتار آفلاین است.`, 'ready');
        setStatus('speechTtsGuidance', 'مدل مشترک از حافظهٔ محلی بارگذاری می‌شود و متن از دستگاه خارج نمی‌شود. حالت‌های شاد، غمگین و عصبانی فقط نگاشت تقریبیِ سرعت/زیر‌وبمی‌اند؛ مکث‌ها و نشانه‌های اجرایی نیز محلی ساخته می‌شوند.', 'ok');
      } else {
        setStatus('speechTtsStatus', `${title} هنوز دریافت نشده است؛ دکمهٔ دریافت مدل را بزنید.`, 'idle');
        setStatus('speechTtsGuidance', 'برای هر دو صدا یک دریافت اولیهٔ حدود ۴۳ MiB لازم است. پس از ذخیره در همین مرورگر، پریسا و مانا بدون اتصال شبکه کار می‌کنند.', 'warn');
      }
      if (hint) {
        hint.dataset.state = state.tinyAvaInstalled ? 'ok' : 'warn';
        hint.textContent = state.tinyAvaInstalled
          ? 'tiny-ava روی همین دستگاه آماده است. اعداد و زمان‌ها پیش از واج‌شناسی به واژه تبدیل می‌شوند. حالت‌های احساسی تقریبی‌اند؛ با نشانه‌های مکث، آه/اوه/هوم و کشیده‌خوانی می‌توانید اجرای متن را دقیق‌تر هدایت کنید. نفس‌نما مصنوعی است.'
          : 'برای پریسا و مانا یک مدل مشترک حدود ۴۳ MiB دریافت کنید. پس از آن گفتار بدون اینترنت ساخته می‌شود؛ Piper و eSpeak NG هم به‌عنوان گزینه‌های محلی باقی هستند.';
      }
      return;
    }
    if (selected && selected.type === 'piper') {
      if (modelInfo) modelInfo.textContent = 'برای هر صدای Piper یک مدل جداگانه حدود ۶۱ MiB دریافت می‌شود؛ پس از آن همان صدا کاملاً آفلاین است.';
      const title = PIPER_VOICES[selected.id].title;
      const installed = state.piperVoiceIds.has(selected.id);
      if (storageError) {
        setStatus('speechTtsStatus', 'ذخیره‌ساز پایدار مدل عصبی در این مرورگر در دسترس نیست.', 'error');
        setStatus('speechTtsGuidance', 'صدای عصبی به IndexedDB و اجرای Worker/WASM نیاز دارد؛ از اجرای برنامه با localhost و مرورگر به‌روز Edge یا Chrome مطمئن شوید.', 'error');
      } else if (!state.piperAvailabilityChecked) {
        setStatus('speechTtsStatus', 'در حال بررسی مدل صدای عصبی روی همین دستگاه…', 'busy');
        setStatus('speechTtsGuidance', 'دریافت اولیه فقط وزن مدل گفتار است؛ بعد از ذخیره، پردازش و پخش گفتار کاملاً آفلاین انجام می‌شود و متن از دستگاه خارج نمی‌شود.', 'warn');
      } else if (installed) {
        setStatus('speechTtsStatus', `${title} روی همین دستگاه نصب و آمادهٔ گفتار آفلاین است.`, 'ready');
        setStatus('speechTtsGuidance', 'مدل ذخیره‌شده از اینترنت استفاده نمی‌کند؛ برای این صدا فقط سرعت قابل تنظیم است. طبیعی‌بودن به کیفیت مدل و تلفظ متن وابسته است و صدای انسانیِ بی‌نقص تضمین نمی‌شود.', 'ok');
      } else {
        setStatus('speechTtsStatus', `${title} هنوز دریافت نشده است؛ برای ادامه، دکمهٔ دریافت مدل را بزنید.`, 'idle');
        setStatus('speechTtsGuidance', 'برای این صدا یک دریافت اولیهٔ حدود ۶۱ MiB لازم است. فایل فقط در حافظهٔ محلی همین مرورگر ذخیره می‌شود؛ پس از آن اینترنت لازم نیست و متن ارسالی وجود ندارد.', 'warn');
      }
      if (hint) {
        hint.dataset.state = installed ? 'ok' : 'warn';
        hint.textContent = installed
          ? 'صدای عصبی Piper روی همین دستگاه آماده است. خوانش محلی است؛ اگر آهنگ یا تلفظ خروجی دلخواه نبود، متن و سرعت را بازبینی یا صدای جایگزین را امتحان کنید.'
          : 'صدای عصبیِ انتخاب‌شده هنوز نصب نیست. پس از دریافت یک‌بارهٔ حدود ۶۱ MiB، ساخت گفتار به‌صورت محلی و آفلاین انجام می‌شود؛ eSpeak NG نیز به‌عنوان جایگزینِ مصنوعی‌تر در دسترس است.';
      }
      return;
    }

    if (selected && selected.type === 'bundled') {
      if (modelInfo) modelInfo.textContent = 'eSpeak NG کم‌حجم و همراه برنامه است؛ مدل عصبیِ جداگانه‌ای دریافت نمی‌شود.';
      setStatus('speechTtsStatus', 'صدای جایگزین فارسیِ eSpeak NG همراه برنامه آماده است.', 'ready');
      setStatus('speechTtsGuidance', 'این صدا کاملاً آفلاین و کم‌حجم است، اما مصنوعی‌تر از صدای عصبی شنیده می‌شود. برای گفتار طبیعی‌تر، یکی از صداهای عصبی را دریافت کنید.', 'warn');
      if (hint) {
        hint.dataset.state = 'warn';
        hint.textContent = 'eSpeak NG بدون دانلود مدل و کاملاً آفلاین کار می‌کند؛ کیفیت آن ماشینی است. برای صدای فارسی عصبی‌تر، مدل Piper را انتخاب و یک‌بار دریافت کنید.';
      }
      return;
    }

    if (selected && selected.type === 'native') {
      if (modelInfo) modelInfo.textContent = 'این صدا بخشی از بستهٔ سیستم شماست؛ کیفیت و امکانات آن به ویندوز و مرورگر بستگی دارد.';
      setStatus('speechTtsStatus', 'صدای فارسی محلی سیستم انتخاب شده است.', 'ready');
      setStatus('speechTtsGuidance', 'کیفیت و طبیعی‌بودن به بستهٔ صدای نصب‌شده روی Windows و مرورگر بستگی دارد؛ این برنامه صدای ابری را فراخوانی نمی‌کند.', 'ok');
      if (hint) {
        hint.dataset.state = 'ok';
        hint.textContent = 'صدای انتخاب‌شده متعلق به سیستم‌عامل است؛ کیفیت آن را با دکمهٔ خواندن امتحان کنید. هیچ صدای ابری استفاده نمی‌شود.';
      }
      return;
    }

    setStatus('speechTtsStatus', 'این مرورگر صدای فارسی محلیِ قابل استفاده پیدا نکرد.', 'error');
    setStatus('speechTtsGuidance', 'برای اجرای مدل عصبی، برنامه را از localhost در مرورگر به‌روز Edge یا Chrome باز کنید. صدای ابری به‌عنوان جایگزین استفاده نمی‌شود.', 'error');
    if (hint) {
      hint.dataset.state = 'error';
      hint.textContent = 'مرورگر یا Worker لازم برای صدای محلی در دسترس نیست؛ هیچ سرویس آنلاین فعال نمی‌شود.';
    }
  }

  function updatePiperDownloadControls() {
    const button = byId('speechPiperInstall');
    const progress = byId('speechPiperDownloadWrap');
    const selected = getSelectedVoice();
    const isPiper = !!(selected && selected.type === 'piper');
    const installed = isPiper && state.piperVoiceIds.has(selected.id);
    if (button) {
      button.hidden = !isPiper;
      button.disabled = !isPiper || (state.ttsPreparing || state.ttsRunning) ||
        (state.piperDownloading && !state.piperDownloadCancelable) ||
        (!state.piperDownloading && !installed && !state.piperAvailabilityChecked);
      button.innerHTML = state.piperDownloading
        ? state.piperDownloadCancelable
          ? `${icon('x', 15)} لغو دریافت`
          : 'در حال بررسی و ذخیرهٔ مدل…'
        : installed
          ? `${icon('trash', 15)} حذف مدل از این دستگاه`
          : `${icon('download', 15)} دریافت مدل (حدود ۶۱ MiB)`;
    }
    if (progress) progress.hidden = !state.piperDownloading;
  }

  function updatePiperDownloadProgress(received, total, label) {
    const wrap = byId('speechPiperDownloadWrap');
    const text = byId('speechPiperDownloadText');
    const percentText = byId('speechPiperDownloadPercent');
    const bar = byId('speechPiperDownloadBar');
    const totalBytes = Number(total) || 0;
    const value = totalBytes > 0 ? Math.max(0, Math.min(100, Math.round(Number(received) / totalBytes * 100))) : 0;
    if (wrap) wrap.hidden = !state.piperDownloading;
    if (text) text.textContent = label || `دریافت مدل: ${faNumber(Math.round(Number(received) / 1048576))} از ${faNumber(Math.round(totalBytes / 1048576))} MiB`;
    if (percentText) percentText.textContent = `${faNumber(value)}٪`;
    if (bar) bar.style.width = `${value}%`;
  }

  async function installOrRemovePiperVoice() {
    if (state.piperDownloading) {
      if (state.piperDownloadCancelable && state.piperDownloadAbort) state.piperDownloadAbort.abort();
      return;
    }
    const selected = getSelectedVoice();
    if (!selected || selected.type !== 'piper') return;
    if (state.piperVoiceIds.has(selected.id)) {
      if (!window.confirm('فایل مدل این صدای عصبی از حافظهٔ محلی همین مرورگر حذف شود؟')) return;
      stopSpeech(false);
      try {
        const store = await import('./speech-vendor/piper/store.mjs');
        await store.removeStoredVoice(selected.id);
        state.piperVoiceIds.delete(selected.id);
        state.piperAvailabilityChecked = true;
        setStatus('speechTtsStatus', 'مدل صدای انتخاب‌شده از حافظهٔ محلی حذف شد.', 'idle');
      } catch (error) {
        setStatus('speechTtsStatus', `حذف مدل محلی انجام نشد: ${error.message || 'خطای ذخیره‌ساز'}`, 'error');
      }
      updateVoiceGuidance();
      updatePiperDownloadControls();
      updateTtsControls();
      return;
    }
    await downloadPiperVoice(selected.id);
  }

  async function downloadPiperVoice(id) {
    const model = PIPER_VOICES[id];
    if (!model || state.piperDownloading) return;
    if (navigator.onLine === false) {
      setStatus('speechTtsStatus', 'برای دریافت نخستین مدل صدای عصبی، اتصال اینترنت لازم است؛ پس از دریافت، استفاده آفلاین خواهد بود.', 'error');
      return;
    }

    const controller = new AbortController();
    state.piperDownloading = true;
    state.piperDownloadCancelable = true;
    state.piperDownloadAbort = controller;
    state.piperDownloadVoiceId = id;
    updatePiperDownloadControls();
    updateTtsControls();
    setStatus('speechTtsStatus', 'در حال دریافت فایل مدل صدا؛ هیچ متن گفتاری ارسال نمی‌شود…', 'busy');
    updatePiperDownloadProgress(0, model.bytes, 'در حال آماده‌سازی دریافت مدل فارسی…');
    let lastProgressAt = 0;

    try {
      if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        const estimate = await navigator.storage.estimate();
        const free = Number(estimate.quota) - Number(estimate.usage || 0);
        if (Number.isFinite(free) && free > 0 && free < model.bytes * 1.08) {
          throw new Error('فضای آزاد ذخیره‌ساز مرورگر برای نگه‌داری مدل (حدود ۶۱ MiB) کافی نیست؛ فضای سایت را آزاد کنید.');
        }
        if (typeof navigator.storage.persist === 'function') {
          try { await navigator.storage.persist(); } catch (_) { /* persistence is optional */ }
        }
      }

      const core = await import('./speech-vendor/piper/core.mjs');
      const configResponse = await fetch(`${PIPER_MODEL_BASE}${model.modelPath}.onnx.json`, { signal: controller.signal, cache: 'no-store' });
      if (!configResponse.ok) throw new Error(`دریافت پیکربندی صدا ناموفق بود (HTTP ${configResponse.status}).`);
      const config = await configResponse.json();
      core.validatePersianPiperConfig(config);

      const response = await fetch(`${PIPER_MODEL_BASE}${model.modelPath}.onnx`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`دریافت وزن مدل صدا ناموفق بود (HTTP ${response.status}).`);
      const total = Number(response.headers.get('content-length')) || model.bytes;
      let received = 0;
      const chunks = [];
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          if (!item.value) continue;
          received += item.value.byteLength;
          if (received > model.bytes) {
            controller.abort();
            throw new Error('فایل دریافتی از اندازهٔ مدل معتبر بزرگ‌تر شد؛ برای جلوگیری از مصرف فضای اضافی متوقف شد.');
          }
          chunks.push(item.value);
          const now = Date.now();
          if (now - lastProgressAt > 120 || received >= total) {
            updatePiperDownloadProgress(received, total, `دریافت مدل: ${faNumber((received / 1048576).toFixed(1))} از حدود ${faNumber((model.bytes / 1048576).toFixed(0))} MiB`);
            lastProgressAt = now;
          }
        }
      } else {
        const blob = await response.blob();
        received = blob.size;
        chunks.push(blob);
      }
      if (controller.signal.aborted) {
        const abortError = new Error('دریافت مدل با انتخاب شما متوقف شد.');
        abortError.name = 'AbortError';
        throw abortError;
      }
      if (received !== model.bytes) {
        throw new Error(`اندازهٔ فایل مدل با نسخهٔ معتبر هم‌خوان نیست (${faNumber(received)} بایت). دانلود ناقص ذخیره نشد؛ دوباره تلاش کنید.`);
      }
      state.piperDownloadCancelable = false;
      updatePiperDownloadControls();
      const modelBlob = new Blob(chunks, { type: 'application/octet-stream' });
      updatePiperDownloadProgress(model.bytes, model.bytes, 'دریافت کامل شد؛ در حال بررسی SHA-256 مدل…');
      const actualSha256 = await core.sha256Hex(modelBlob);
      if (actualSha256 !== model.sha256) {
        throw new Error('SHA-256 فایل با اثرانگشت مدل منتشرشده هم‌خوان نیست؛ فایل ذخیره نشد. دوباره تلاش کنید و در صورت تکرار، منبع را بررسی کنید.');
      }

      const record = {
        id,
        model: modelBlob,
        config,
        bytes: received,
        modelUrl: `${PIPER_MODEL_BASE}${model.modelPath}.onnx`,
        savedAt: Date.now()
      };
      const store = await import('./speech-vendor/piper/store.mjs');
      await store.saveStoredVoice(record);
      state.piperVoiceIds.add(id);
      state.piperAvailabilityChecked = true;
      updatePiperDownloadProgress(model.bytes, model.bytes, 'مدل دریافت و در حافظهٔ محلی ذخیره شد.');
      setStatus('speechTtsStatus', 'مدل گفتار عصبی ذخیره شد؛ از این پس ساخت گفتار با همین صدا بدون اینترنت انجام می‌شود.', 'ready');
      notify('مدل صدای فارسی ذخیره شد؛ استفادهٔ بعدی آفلاین است.');
    } catch (error) {
      if (error && error.name === 'AbortError') {
        setStatus('speechTtsStatus', 'دریافت مدل متوقف شد؛ فایل ناقص در حافظه ذخیره نشد.', 'idle');
        updatePiperDownloadProgress(0, model.bytes, 'دریافت متوقف شد.');
      } else {
        const message = error && error.name === 'TypeError'
          ? 'اتصال به میزبان مدل برقرار نشد؛ اینترنت و اجازهٔ CORS مرورگر/میزبان را بررسی کنید.'
          : error && error.message ? error.message : 'خطای شبکه یا ذخیره‌ساز';
        setStatus('speechTtsStatus', `دریافت مدل صدای عصبی ناموفق بود: ${message}`, 'error');
        updatePiperDownloadProgress(0, model.bytes, 'دریافت مدل ناموفق بود.');
        console.warn('Persian neural voice download failed:', error);
      }
    } finally {
      state.piperDownloading = false;
      state.piperDownloadCancelable = false;
      state.piperDownloadAbort = null;
      state.piperDownloadVoiceId = '';
      updateVoiceGuidance();
      updatePiperDownloadControls();
      updateTtsControls();
    }
  }

  function getSelectedVoice() {
    const select = byId('speechVoice');
    if (!select || !select.value) return null;
    if (select.value === BUNDLED_VOICE_ID) return { type: 'bundled' };
    if (select.value.startsWith(TINY_AVA_VOICE_PREFIX)) {
      const id = select.value.slice(TINY_AVA_VOICE_PREFIX.length);
      return Object.prototype.hasOwnProperty.call(TINY_AVA_VOICES, id)
        ? { type: 'tiny-ava', id, installed: state.tinyAvaInstalled }
        : null;
    }
    if (select.value.startsWith(PIPER_VOICE_PREFIX)) {
      const id = select.value.slice(PIPER_VOICE_PREFIX.length);
      return Object.prototype.hasOwnProperty.call(PIPER_VOICES, id)
        ? { type: 'piper', id, installed: state.piperVoiceIds.has(id) }
        : null;
    }
    const voice = state.localPersianVoices.find(item => item.voiceURI === select.value && item.localService === true);
    return voice ? { type: 'native', voice } : null;
  }

  function updateTtsControls() {
    const selected = getSelectedVoice();
    const input = byId('speechTtsInput');
    const hasText = !!(input && input.value.trim());
    const speak = byId('speechSpeak');
    const pause = byId('speechPause');
    const resume = byId('speechResume');
    const stop = byId('speechTtsStop');
    const synth = window.speechSynthesis;
    const nativeSpeaking = !!(synth && synth.speaking);
    const nativePaused = !!(synth && synth.paused);
    const audio = byId('speechTtsAudio');
    const audioPlaying = !!(audio && !audio.paused && !audio.ended);
    const audioPaused = !!(audio && audio.paused && !audio.ended && !!audio.currentSrc);
    const audioReady = !!(audio && !!audio.currentSrc);
    const rate = byId('speechRate');
    const pitch = byId('speechPitch');
    const voiceSelect = byId('speechVoice');
    const deliveryStyleControls = byId('speechDeliveryStyleControls');
    const tinyAvaCueBar = byId('speechTinyAvaCueBar');
    const deliveryStyle = byId('speechTtsStyle');
    const deliveryExpressiveness = byId('speechTtsExpressiveness');
    const deliveryPauseScale = byId('speechTtsPauseScale');
    const piperReady = !selected || selected.type !== 'piper' || state.piperVoiceIds.has(selected.id);
    const tinyAvaReady = !selected || selected.type !== 'tiny-ava' || state.tinyAvaInstalled;
    const usesTinyAva = !!(selected && selected.type === 'tiny-ava');

    if (rate) rate.disabled = !selected || state.ttsPreparing || state.ttsRunning;
    if (pitch) pitch.disabled = !selected || state.ttsPreparing || state.ttsRunning || selected.type === 'piper';
    if (deliveryStyleControls) deliveryStyleControls.hidden = !selected;
    if (tinyAvaCueBar) {
      tinyAvaCueBar.hidden = !usesTinyAva;
      tinyAvaCueBar.querySelectorAll('button').forEach(button => {
        button.disabled = state.ttsPreparing || state.ttsRunning;
      });
    }
    if (deliveryStyle) deliveryStyle.disabled = !selected || state.ttsPreparing || state.ttsRunning;
    if (deliveryExpressiveness) deliveryExpressiveness.disabled = !selected || state.ttsPreparing || state.ttsRunning;
    if (deliveryPauseScale) deliveryPauseScale.disabled = !selected || state.ttsPreparing || state.ttsRunning;
    if (speak) speak.disabled = !selected || !hasText || !piperReady || !tinyAvaReady || state.ttsPreparing || state.ttsRunning;
    if (pause) pause.disabled = !audioPlaying && !(nativeSpeaking && !nativePaused);
    if (resume) resume.disabled = !audioPaused && !nativePaused;
    if (stop) stop.disabled = !state.ttsPreparing && !state.ttsRunning && !nativeSpeaking && !audioReady;
    if (voiceSelect) {
      const hasSelectableOption = Array.from(voiceSelect.options).some(option => !option.disabled);
      voiceSelect.disabled = state.piperDownloading || state.tinyAvaDownloading || state.ttsPreparing || state.ttsRunning || !hasSelectableOption;
    }
    updatePiperDownloadControls();
    updateTinyAvaDownloadControls();
  }

  function updateRangeLabels() {
    const rate = byId('speechRate');
    const pitch = byId('speechPitch');
    const expressiveness = byId('speechTtsExpressiveness');
    const pauseScale = byId('speechTtsPauseScale');
    const rateText = byId('speechRateValue');
    const pitchText = byId('speechPitchValue');
    const expressivenessText = byId('speechTtsExpressivenessValue');
    const pauseScaleText = byId('speechTtsPauseScaleValue');
    if (rateText && rate) rateText.textContent = `${Number(rate.value).toFixed(2).replace('.', '٫')}×`;
    if (pitchText && pitch) pitchText.textContent = Number(pitch.value).toFixed(2).replace('.', '٫');
    if (expressivenessText && expressiveness) expressivenessText.textContent = Number(expressiveness.value).toFixed(2).replace('.', '٫');
    if (pauseScaleText && pauseScale) pauseScaleText.textContent = `${Number(pauseScale.value).toFixed(2).replace('.', '٫')}×`;
  }

  function setPronunciationLexiconStatus(message, kind = 'idle') {
    const node = byId('speechTtsLexiconStatus');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = kind;
  }

  function loadPronunciationLexicon() {
    const area = byId('speechTtsLexicon');
    if (!area) return;
    try { area.value = localStorage.getItem(LEXICON_KEY) || ''; }
    catch (_) { area.value = ''; }
    const count = area.value.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith('#')).length;
    setPronunciationLexiconStatus(count
      ? `در این مرورگر ${faNumber(count)} خطِ واژه‌نامه ذخیره شده است؛ برای ویرایش، تغییرات را دوباره ذخیره کنید.`
      : 'واژه‌نامهٔ شخصی فقط در حافظهٔ همین مرورگر می‌ماند.');
  }

  async function savePronunciationLexicon() {
    const area = byId('speechTtsLexicon');
    if (!area) return;
    const raw = area.value;
    const lines = raw.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    if (lines.length > 64) {
      setPronunciationLexiconStatus('حداکثر ۶۴ مدخل ذخیره می‌شود؛ واژه‌های اضافی را حذف کنید.', 'error');
      return;
    }
    try {
      const core = await import('./speech-vendor/tiny-ava/core.mjs');
      const invalid = lines.findIndex(line => core.parsePersianPronunciationLexicon(line, 1).length !== 1);
      if (invalid >= 0) {
        setPronunciationLexiconStatus(`قالب خط ${faNumber(invalid + 1)} معتبر نیست؛ «واژه = خوانش دلخواه» بنویسید.`, 'error');
        return;
      }
      const entries = core.parsePersianPronunciationLexicon(raw, 64);
      try {
        if (raw.trim()) localStorage.setItem(LEXICON_KEY, raw);
        else localStorage.removeItem(LEXICON_KEY);
      } catch (_) {
        setPronunciationLexiconStatus('ذخیره‌سازی محلی در این مرورگر در دسترس نیست؛ مدخل‌ها ذخیره نشدند.', 'error');
        return;
      }
      setPronunciationLexiconStatus(entries.length
        ? `${faNumber(entries.length)} مدخل روی همین دستگاه ذخیره شد؛ در خوانش بعدی اعمال می‌شود.`
        : 'واژه‌نامهٔ خالی شد و مدخل‌های قبلی حذف شدند.', 'ready');
    } catch (error) {
      setPronunciationLexiconStatus('موتور محلی تلفظ برای بررسی مدخل‌ها در دسترس نیست؛ صفحه را تازه کنید.', 'error');
      console.warn('Could not validate the local pronunciation lexicon:', error);
    }
  }

  function clearPronunciationLexicon() {
    const area = byId('speechTtsLexicon');
    if (area) area.value = '';
    try { localStorage.removeItem(LEXICON_KEY); }
    catch (_) { /* The textarea is still cleared in this session. */ }
    setPronunciationLexiconStatus('واژه‌نامهٔ محلی پاک شد.', 'ready');
  }

  function readSpeechPreferences() {
    try {
      const value = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) { return {}; }
  }

  function loadSpeechPreferences() {
    const prefs = readSpeechPreferences();
    state.voiceChoiceExplicit = prefs.voiceChoiceExplicit === true;
    const rate = byId('speechRate');
    const pitch = byId('speechPitch');
    const style = byId('speechTtsStyle');
    const expressiveness = byId('speechTtsExpressiveness');
    const pauseScale = byId('speechTtsPauseScale');
    const availableStyles = ['auto', 'formal', 'conversational', 'calm', 'supportive', 'happy', 'sad', 'angry', 'excited', 'storytelling', 'lively'];
    if (rate && Number.isFinite(Number(prefs.rate))) rate.value = String(Math.max(.75, Math.min(1.25, Number(prefs.rate))));
    if (pitch && Number.isFinite(Number(prefs.pitch))) pitch.value = String(Math.max(.8, Math.min(1.2, Number(prefs.pitch))));
    if (style) style.value = availableStyles.includes(prefs.style) ? prefs.style : 'auto';
    if (expressiveness && Number.isFinite(Number(prefs.expressiveness))) expressiveness.value = String(Math.max(.7, Math.min(1.4, Number(prefs.expressiveness))));
    if (pauseScale && Number.isFinite(Number(prefs.pauseScale))) pauseScale.value = String(Math.max(.6, Math.min(1.8, Number(prefs.pauseScale))));
    updateRangeLabels();
  }

  function saveSpeechPreferences() {
    const voice = byId('speechVoice');
    const rate = byId('speechRate');
    const pitch = byId('speechPitch');
    const style = byId('speechTtsStyle');
    const expressiveness = byId('speechTtsExpressiveness');
    const pauseScale = byId('speechTtsPauseScale');
    const prefs = {
      voiceURI: voice ? voice.value : '',
      voiceChoiceExplicit: state.voiceChoiceExplicit === true,
      rate: rate ? Number(rate.value) : 1,
      pitch: pitch ? Number(pitch.value) : 1,
      style: style ? style.value : 'auto',
      expressiveness: expressiveness ? Number(expressiveness.value) : 1.05,
      pauseScale: pauseScale ? Number(pauseScale.value) : 1
    };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }
    catch (_) { /* Preferences are optional; never block speech for storage errors. */ }
  }

  function speechDeliverySettings(core) {
    const style = (byId('speechTtsStyle') || {}).value || 'auto';
    const options = {
      rate: Number((byId('speechRate') || {}).value || 1),
      pitch: Number((byId('speechPitch') || {}).value || 1),
      expressiveness: Number((byId('speechTtsExpressiveness') || {}).value || 1.05),
      pauseScale: Number((byId('speechTtsPauseScale') || {}).value || 1)
    };
    if (core && typeof core.resolveLocalSpeechDelivery === 'function') {
      return core.resolveLocalSpeechDelivery(style, options);
    }
    return {
      style,
      speed: options.rate,
      pitchShift: Math.log(Math.max(0.5, options.pitch)),
      pitch: options.pitch,
      pitchRange: 1,
      pauseScale: options.pauseScale,
      autoTextProsody: style === 'auto'
    };
  }

  function applyPendingSpeechLaunch() {
    const launch = state.pendingSpeechLaunch;
    if (!launch) return;
    state.pendingSpeechLaunch = null;
    const input = byId('speechTtsInput');
    if (!input) return;
    input.value = String(launch.text || '').slice(0, Number(input.maxLength) || 8000);
    const style = byId('speechTtsStyle');
    const validStyles = new Set(['auto', 'formal', 'conversational', 'calm', 'supportive', 'happy', 'sad', 'angry', 'excited', 'storytelling', 'lively']);
    if (style && validStyles.has(launch.style)) style.value = launch.style;
    const expressiveness = byId('speechTtsExpressiveness');
    const pauseScale = byId('speechTtsPauseScale');
    if (expressiveness && Number.isFinite(Number(launch.expressiveness))) expressiveness.value = String(Math.max(0.7, Math.min(1.4, Number(launch.expressiveness))));
    if (pauseScale && Number.isFinite(Number(launch.pauseScale))) pauseScale.value = String(Math.max(0.6, Math.min(1.8, Number(launch.pauseScale))));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    updateRangeLabels();
    updateTtsCounters();
    updateTtsControls();
    const handoffText = byId('speechDebtHandoffText');
    if (handoffText) handoffText.textContent = `پروفایل «${String(launch.deliveryLabel || 'پیشنهادی').slice(0, 80)}» تنظیم شد؛ دامنهٔ اثر preset و تأکید واژگانی به موتور انتخابی بستگی دارد (tiny-ava پشتیبانی کامل‌تری دارد). برای شروع پخش، «خواندن متن» را جداگانه بزنید.`;
  }

  function returnToDebtCollection() {
    if (!state.speechReturnToDebt || typeof window.openDebtCollectionAssist !== 'function') return;
    stopSpeech(false);
    state.speechReturnToDebt = false;
    state.pendingSpeechLaunch = null;
    window.openDebtCollectionAssist({ returningFromSpeech: true });
  }

  function speechChunks(text, limit) {
    const max = limit || 260;
    const sentences = String(text).match(/[^.!?؟؛…\n]+[.!?؟؛…]?/gu) || [String(text)];
    const chunks = [];
    let current = '';
    const pushCurrent = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };
    sentences.forEach(sentence => {
      const part = sentence.trim();
      if (!part) return;
      if (part.length > max) {
        pushCurrent();
        let fragment = '';
        part.split(/\s+/u).forEach(word => {
          if (!word) return;
          if (fragment && `${fragment} ${word}`.length > max) {
            chunks.push(fragment);
            fragment = word;
          } else fragment = fragment ? `${fragment} ${word}` : word;
        });
        if (fragment) chunks.push(fragment);
        return;
      }
      if (current && `${current} ${part}`.length > max) pushCurrent();
      current = current ? `${current} ${part}` : part;
    });
    pushCurrent();
    return chunks;
  }

  function insertTinyAvaCue(cue) {
    const input = byId('speechTtsInput');
    if (!input || typeof cue !== 'string' || !cue) return;
    const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const leadingSpace = before && !/\s$/u.test(before) ? ' ' : '';
    const trailingSpace = after && !/^[\s,،.;:!?؟؛)\]]/u.test(after) ? ' ' : '';
    const insertion = `${leadingSpace}${cue.trim()}${trailingSpace}`;
    input.setRangeText(insertion, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function wrapTinyAvaStretchCue() {
    const input = byId('speechTtsInput');
    if (!input) return;
    const start = Number.isInteger(input.selectionStart) ? input.selectionStart : 0;
    const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
    const selectedText = input.value.slice(start, end).trim();
    if (!selectedText) {
      notify('برای کشیده‌خوانی، ابتدا یک واژه یا عبارت کوتاه را در متن انتخاب کنید.');
      return;
    }
    const tagged = `[[کشیده:${selectedText}]]`;
    if (input.value.length - (end - start) + tagged.length > (Number(input.maxLength) || 8000)) {
      notify('متن برای افزودن نشانهٔ کشیده‌خوانی به سقف طول رسیده است.');
      return;
    }
    input.setRangeText(tagged, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function wrapTinyAvaEmphasisCue() {
    const input = byId('speechTtsInput');
    if (!input) return;
    const start = Number.isInteger(input.selectionStart) ? input.selectionStart : 0;
    const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
    const selected = input.value.slice(start, end);
    const selectedText = selected.trim();
    if (!selectedText) {
      notify('برای تأکید، ابتدا واژه یا عبارت موردنظر را در متن انتخاب کنید.');
      return;
    }
    const leading = selected.match(/^\s*/u)?.[0] || '';
    const trailing = selected.match(/\s*$/u)?.[0] || '';
    const tagged = `${leading}[[تأکید:${selectedText}]]${trailing}`;
    if (input.value.length - (end - start) + tagged.length > (Number(input.maxLength) || 8000)) {
      notify('متن برای افزودن نشانهٔ تأکید به سقف طول رسیده است.');
      return;
    }
    input.setRangeText(tagged, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function stripTinyAvaCues(text) {
    return String(text || '')
      .replace(/\[\[(?:مکث کوتاه|مکث بلند|مکث|نفس|مکث تنفسی|pause(?::(?:short|long))?|breath)\]\]/giu, ', ')
      .replace(/\[\[(?:تأکید|emphasis)\s*:\s*([\s\S]*?)\]\]/giu, '$1')
      .replace(/\[\[(?:کشیده|stretch)\s*:\s*([\s\S]*?)\]\]/giu, '$1')
      .replace(/\[\[(آه|اوه|هوم)\]\]/gu, '$1')
      .replace(/\[\[sigh\]\]/giu, 'آه')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  async function speakText() {
    const input = byId('speechTtsInput');
    const selected = getSelectedVoice();
    if (!input || !selected) return;
    const rawText = input.value.trim();
    if (!rawText) return notify('متنی برای خواندن وارد کنید.');

    stopSpeech(false);
    const session = ++state.ttsSession;
    state.ttsSessionUsed = true;
    state.ttsPreparing = true;
    setStatus('speechTtsStatus', 'در حال آماده‌سازی واژه‌نامهٔ محلی تلفظ…', 'busy');
    updateTtsProgress(0, 1, 'در حال تطبیق تلفظ‌های شخصی روی همین دستگاه…');
    updateTtsControls();

    let text = rawText;
    let speechCore = null;
    try {
      speechCore = await import('./speech-vendor/tiny-ava/core.mjs');
      let lexiconText = '';
      try { lexiconText = localStorage.getItem(LEXICON_KEY) || ''; }
      catch (_) { /* No saved pronunciation mapping is also a valid state. */ }
      const entries = speechCore.parsePersianPronunciationLexicon(lexiconText, 64);
      text = speechCore.applyPersianPronunciationLexicon(rawText, entries);
    } catch (error) {
      console.warn('Local pronunciation dictionary could not be applied; reading the original text:', error);
    }
    if (session !== state.ttsSession) return;
    const delivery = speechDeliverySettings(speechCore);
    state.ttsPreparing = false;
    text = selected.type === 'tiny-ava' ? text : stripTinyAvaCues(text);
    if (!text) {
      setStatus('speechTtsStatus', 'پس از حذف نشانه‌های ویژه، متنی برای خواندن باقی نماند.', 'warn');
      updateTtsControls();
      return;
    }

    if (selected.type === 'tiny-ava') {
      if (!state.tinyAvaInstalled) {
        setStatus('speechTtsStatus', 'برای خواندن روان‌تر با پریسا یا مانا، ابتدا مدل عصبی tiny-ava را دریافت کنید.', 'idle');
        updateTinyAvaDownloadControls();
        updateTtsControls();
        return;
      }
      startTinyAvaSpeech(text, session, selected, delivery);
      return;
    }

    if (selected.type === 'piper') {
      if (!state.piperVoiceIds.has(selected.id)) {
        setStatus('speechTtsStatus', 'برای خواندن با صدای عصبی، ابتدا مدل انتخاب‌شده را دریافت کنید.', 'idle');
        updatePiperDownloadControls();
        updateTtsControls();
        return;
      }
      startPiperSpeech(text, session, selected, delivery);
      return;
    }

    if (selected.type === 'native') {
      const synth = window.speechSynthesis;
      if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
        setStatus('speechTtsStatus', 'خوانش مرورگر در دسترس نیست؛ صدای همراه برنامه را انتخاب کنید.', 'error');
        updateTtsControls();
        return;
      }
      state.ttsChunks = speechChunks(text, 260);
      state.ttsChunkIndex = 0;
      state.ttsSynthesisRate = delivery.speed;
      state.ttsRunning = true;
      setStatus('speechTtsStatus', 'خوانش با صدای فارسیِ محلیِ سیستم آغاز شد.', 'ready');
      speakNextChunk(session, selected.voice, delivery);
      updateTtsControls();
      return;
    }

    startBundledSpeech(text, session, delivery);
  }

  function startBundledSpeech(text, session, delivery) {
    state.ttsPreparing = true;
    state.ttsRunning = false;
    const synthesisRate = delivery.speed;
    state.ttsSynthesisRate = synthesisRate;
    setStatus('speechTtsStatus', 'در حال ساخت صدای فارسی در همین دستگاه؛ ممکن است بار نخست کمی زمان ببرد…', 'busy');
    updateTtsProgress(0, 1, 'در حال آماده‌سازی صدای آفلاین…');

    let worker;
    try {
      worker = new Worker(new URL('./speech-vendor/espeak-worker.mjs', document.baseURI), {
        type: 'module',
        name: 'persian-espeak-offline'
      });
    } catch (error) {
      state.ttsPreparing = false;
      setStatus('speechTtsStatus', 'ساخت Worker محلی ممکن نشد؛ برنامه را از localhost یا یک نشانی امن اجرا کنید.', 'error');
      updateTtsControls();
      console.warn('Could not create the offline Persian speech worker:', error);
      return;
    }

    state.ttsWorker = worker;
    worker.onmessage = event => {
      if (session !== state.ttsSession) return;
      const message = event.data || {};
      if (message.requestId !== session) return;

      if (message.type === 'progress') {
        const label = message.phase === 'reading'
          ? 'صدای فارسی ساخته شد؛ فایل WAV محلی آماده می‌شود…'
          : 'موتور eSpeak NG در حال خواندن متن فارسی روی همین دستگاه است…';
        setStatus('speechTtsStatus', label, 'busy');
        return;
      }

      if (message.type === 'error') {
        worker.terminate();
        if (state.ttsWorker === worker) state.ttsWorker = null;
        state.ttsPreparing = false;
        state.ttsRunning = false;
        setStatus('speechTtsStatus', `ساخت صدای فارسی انجام نشد: ${message.message || 'خطای موتور محلی'}`, 'error');
        updateTtsProgress(0, 1, 'تولید صدا ناموفق بود.');
        updateTtsControls();
        return;
      }

      if (message.type !== 'complete' || !(message.wav instanceof ArrayBuffer)) return;
      worker.terminate();
      if (state.ttsWorker === worker) state.ttsWorker = null;
      state.ttsPreparing = false;
      playWavBuffer(message.wav, session, 'صدای فارسیِ آفلاین eSpeak NG');
    };
    worker.onerror = event => {
      if (session !== state.ttsSession) return;
      worker.terminate();
      if (state.ttsWorker === worker) state.ttsWorker = null;
      state.ttsPreparing = false;
      state.ttsRunning = false;
      setStatus('speechTtsStatus', 'بارگذاری موتور فارسیِ همراه برنامه ناموفق بود. پوشهٔ برنامه را کامل نگه دارید و یک‌بار صفحه را تازه کنید.', 'error');
      updateTtsControls();
      console.warn('Offline Persian speech worker failed:', event && event.message);
    };

    worker.postMessage({
      requestId: session,
      text,
      rate: delivery.speed,
      pitch: delivery.pitch
    });
    updateTtsControls();
  }

  function startTinyAvaSpeech(text, session, selected, settings) {
    state.ttsPreparing = true;
    state.ttsRunning = false;
    state.ttsSynthesisRate = settings.speed;
    state.ttsChunks = [];
    state.ttsChunkIndex = 0;
    setStatus('speechTtsStatus', `در حال آماده‌سازی مدل ${TINY_AVA_VOICES[selected.id].title} روی همین دستگاه…`, 'busy');
    updateTtsProgress(0, 1, 'در حال بازکردن مدل مشترک tiny-ava و آماده‌سازی مکث‌ها…');

    let worker;
    try {
      worker = new Worker(new URL('./speech-vendor/tiny-ava/tiny-ava-worker.mjs', document.baseURI), {
        type: 'module',
        name: 'tiny-ava-persian-tts-offline'
      });
    } catch (error) {
      state.ttsPreparing = false;
      setStatus('speechTtsStatus', 'ساخت Worker محلی tiny-ava ممکن نشد؛ برنامه را از localhost یا HTTPS در مرورگر به‌روز اجرا کنید.', 'error');
      updateTtsControls();
      console.warn('Could not create the local tiny-ava worker:', error);
      return;
    }

    state.tinyAvaWorker = worker;
    worker.onmessage = event => {
      if (session !== state.ttsSession) return;
      const message = event.data || {};
      if (message.requestId !== session) return;
      if (message.type === 'progress') {
        const total = Math.max(1, Number(message.total) || 1);
        const done = Math.max(0, Math.min(total, Number(message.done) || 0));
        updateTtsProgress(done, total, message.message || 'در حال ساخت گفتار محلی tiny-ava…');
        setStatus('speechTtsStatus', message.message || 'در حال ساخت گفتار محلی tiny-ava…', 'busy');
        return;
      }
      if (message.type === 'error') {
        worker.terminate();
        if (state.tinyAvaWorker === worker) state.tinyAvaWorker = null;
        state.ttsPreparing = false;
        state.ttsRunning = false;
        state.ttsChunks = [];
        setStatus('speechTtsStatus', `ساخت صدای tiny-ava ناموفق بود: ${message.message || 'خطای مدل محلی'}`, 'error');
        updateTtsProgress(0, 1, 'تولید صدای tiny-ava ناموفق بود.');
        updateTtsControls();
        console.warn('Offline tiny-ava speech synthesis failed:', message.message);
        return;
      }
      if (message.type !== 'complete' || !(message.wav instanceof ArrayBuffer)) return;
      worker.terminate();
      if (state.tinyAvaWorker === worker) state.tinyAvaWorker = null;
      state.ttsPreparing = false;
      state.ttsChunks = [];
      state.ttsChunkIndex = 0;
      playWavBuffer(message.wav, session, `صدای tiny-ava · ${TINY_AVA_VOICES[selected.id].title}`);
    };
    worker.onerror = event => {
      if (session !== state.ttsSession) return;
      worker.terminate();
      if (state.tinyAvaWorker === worker) state.tinyAvaWorker = null;
      state.ttsPreparing = false;
      state.ttsRunning = false;
      state.ttsChunks = [];
      setStatus('speechTtsStatus', 'بارگذاری مدل یا موتور WASM محلی tiny-ava ناموفق بود؛ فایل‌های برنامه را کامل نگه دارید و صفحه را تازه کنید.', 'error');
      updateTtsControls();
      console.warn('Offline tiny-ava worker failed:', event && event.message);
    };

    worker.postMessage({
      type: 'synthesize',
      requestId: session,
      voiceId: selected.id,
      text,
      settings
    });
    updateTtsControls();
  }

  function startPiperSpeech(text, session, selected, delivery) {
    state.ttsPreparing = true;
    state.ttsRunning = false;
    state.ttsSynthesisRate = delivery.speed;
    const chunks = speechChunks(text, 240);
    state.ttsChunks = chunks;
    state.ttsChunkIndex = 0;
    setStatus('speechTtsStatus', 'در حال آماده‌سازی مدل صدای عصبی روی همین دستگاه؛ بار اول ممکن است کمی طول بکشد…', 'busy');
    updateTtsProgress(0, chunks.length, 'در حال بارگذاری مدل محلی Piper…');

    let worker;
    try {
      worker = new Worker(new URL('./speech-vendor/piper/piper-worker.mjs', document.baseURI), {
        type: 'module',
        name: 'persian-neural-tts-offline'
      });
    } catch (error) {
      state.ttsPreparing = false;
      setStatus('speechTtsStatus', 'ساخت Worker صدای عصبی ممکن نشد؛ برنامه را از localhost در مرورگر به‌روز اجرا کنید.', 'error');
      updateTtsControls();
      console.warn('Could not create the offline Piper speech worker:', error);
      return;
    }

    state.piperWorker = worker;
    worker.onmessage = event => {
      if (session !== state.ttsSession) return;
      const message = event.data || {};
      if (message.requestId !== session) return;
      if (message.type === 'progress') {
        const total = Math.max(1, Number(message.total) || chunks.length);
        const done = Math.max(0, Math.min(total, Number(message.done) || 0));
        updateTtsProgress(done, total, message.message || 'در حال ساخت گفتار عصبی روی همین دستگاه…');
        setStatus('speechTtsStatus', message.message || 'در حال ساخت گفتار عصبی روی همین دستگاه…', 'busy');
        return;
      }
      if (message.type === 'error') {
        worker.terminate();
        if (state.piperWorker === worker) state.piperWorker = null;
        state.ttsPreparing = false;
        state.ttsRunning = false;
        setStatus('speechTtsStatus', `ساخت صدای عصبی ناموفق بود: ${message.message || 'خطای مدل محلی'}`, 'error');
        updateTtsProgress(0, chunks.length, 'تولید صدای عصبی ناموفق بود.');
        updateTtsControls();
        console.warn('Offline Persian neural speech synthesis failed:', message.message);
        return;
      }
      if (message.type !== 'complete' || !(message.wav instanceof ArrayBuffer)) return;
      worker.terminate();
      if (state.piperWorker === worker) state.piperWorker = null;
      state.ttsPreparing = false;
      state.ttsChunks = [];
      state.ttsChunkIndex = 0;
      playWavBuffer(message.wav, session, 'صدای عصبی فارسی Piper');
    };
    worker.onerror = event => {
      if (session !== state.ttsSession) return;
      worker.terminate();
      if (state.piperWorker === worker) state.piperWorker = null;
      state.ttsPreparing = false;
      state.ttsRunning = false;
      setStatus('speechTtsStatus', 'موتور WASM یا مدل صدای عصبی بارگذاری نشد؛ فایل‌های برنامه را کامل نگه دارید و صفحه را تازه کنید.', 'error');
      updateTtsControls();
      console.warn('Offline Persian neural speech worker failed:', event && event.message);
    };

    worker.postMessage({
      type: 'synthesize',
      requestId: session,
      voiceId: selected.id,
      chunks,
      rate: state.ttsSynthesisRate,
      pauseScale: delivery.pauseScale
    });
    updateTtsControls();
  }

  function playWavBuffer(wav, session, voiceLabel) {
    const audio = byId('speechTtsAudio');
    if (!audio) {
      state.ttsRunning = false;
      setStatus('speechTtsStatus', 'پخش‌کنندهٔ صدای فارسی در صفحه پیدا نشد.', 'error');
      updateTtsControls();
      return;
    }

    if (state.ttsAudioUrl) URL.revokeObjectURL(state.ttsAudioUrl);
    state.ttsAudioUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    audio.onplay = () => {
      if (session !== state.ttsSession) return;
      state.ttsRunning = true;
      setStatus('speechTtsStatus', `در حال پخش ${voiceLabel}…`, 'listening');
      updateTtsControls();
    };
    audio.onpause = () => {
      if (session !== state.ttsSession || audio.ended) return;
      state.ttsRunning = false;
      setStatus('speechTtsStatus', 'خوانش مکث شده است؛ برای ادامه از کنترل پخش استفاده کنید.', 'busy');
      updateTtsControls();
    };
    audio.ontimeupdate = () => {
      if (session !== state.ttsSession || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      updateTtsProgressPercent(audio.currentTime / audio.duration * 100, `در حال پخش ${voiceLabel}…`);
    };
    audio.onended = () => {
      if (session !== state.ttsSession) return;
      state.ttsRunning = false;
      updateTtsProgressPercent(100, 'خواندن متن به پایان رسید.');
      setStatus('speechTtsStatus', 'خواندن کامل شد؛ فایل WAV محلی برای پخش دوباره یا دریافت آماده است.', 'ready');
      updateTtsControls();
    };
    audio.onerror = () => {
      if (session !== state.ttsSession) return;
      state.ttsRunning = false;
      setStatus('speechTtsStatus', 'فایل WAV ساخته شد، اما مرورگر نتوانست آن را پخش کند؛ از کنترل فایل یا دریافت استفاده کنید.', 'error');
      updateTtsControls();
    };
    audio.src = state.ttsAudioUrl;
    audio.playbackRate = 1;
    if ('preservesPitch' in audio) audio.preservesPitch = true;
    else if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;
    audio.hidden = false;
    const download = byId('speechTtsDownload');
    if (download) {
      download.href = state.ttsAudioUrl;
      download.hidden = false;
    }
    state.ttsRunning = false;
    updateTtsProgressPercent(0, 'صدای فارسی آمادهٔ پخش است.');
    setStatus('speechTtsStatus', `${voiceLabel} ساخته شد؛ در حال پخش…`, 'ready');
    updateTtsControls();
    try {
      const playback = audio.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {
        if (session !== state.ttsSession) return;
        state.ttsRunning = false;
        setStatus('speechTtsStatus', 'صدا آماده شد؛ اگر پخش خودکار انجام نشد، دکمهٔ پخش فایل را بزنید.', 'ready');
        updateTtsControls();
      });
    } catch (_) {
      setStatus('speechTtsStatus', 'صدا آماده شد؛ برای پخش، کنترل فایل صوتی را بزنید.', 'ready');
    }
  }

  function speakNextChunk(session, voice, delivery) {
    if (session !== state.ttsSession || !state.ttsRunning) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (state.ttsChunkIndex >= state.ttsChunks.length) {
      state.ttsRunning = false;
      updateTtsProgress(state.ttsChunks.length, state.ttsChunks.length, 'خواندن متن به پایان رسید.');
      setStatus('speechTtsStatus', 'خواندن متن کامل شد.', 'ready');
      updateTtsControls();
      return;
    }

    const index = state.ttsChunkIndex++;
    const utterance = new window.SpeechSynthesisUtterance(state.ttsChunks[index]);
    utterance.voice = voice;
    utterance.lang = isPersianVoice(voice) ? voice.lang : LANGUAGE;
    utterance.rate = delivery.speed;
    utterance.pitch = delivery.pitch;
    utterance.volume = 1;
    updateTtsProgress(index, state.ttsChunks.length, `در حال خواندن، بخش ${faNumber(index + 1)} از ${faNumber(state.ttsChunks.length)}…`);
    utterance.onstart = () => {
      if (session !== state.ttsSession) return;
      setStatus('speechTtsStatus', 'در حال خواندن با صدای فارسیِ محلیِ سیستم؛ صدا به سرویس ابری فرستاده نمی‌شود.', 'listening');
      updateTtsControls();
    };
    utterance.onend = () => {
      if (session !== state.ttsSession) return;
      updateTtsProgress(index + 1, state.ttsChunks.length, `در حال خواندن، بخش ${faNumber(index + 1)} از ${faNumber(state.ttsChunks.length)}…`);
      window.setTimeout(() => speakNextChunk(session, voice, delivery), Math.round(45 * delivery.pauseScale));
    };
    utterance.onerror = event => {
      if (session !== state.ttsSession) return;
      if (event && event.error === 'canceled') return;
      state.ttsRunning = false;
      setStatus('speechTtsStatus', 'صدای محلی سیستم هنگام خواندن خطا داد؛ صدای همراه برنامه را انتخاب کنید.', 'error');
      updateTtsControls();
    };
    try { synth.speak(utterance); }
    catch (error) {
      state.ttsRunning = false;
      setStatus('speechTtsStatus', 'شروع خوانش ممکن نشد؛ صدای فارسی محلی دیگری را انتخاب کنید.', 'error');
      updateTtsControls();
      console.warn('Local Persian speech synthesis could not start:', error);
    }
  }

  function pauseSpeech() {
    const audio = byId('speechTtsAudio');
    if (audio && !audio.paused && !audio.ended) {
      audio.pause();
      return;
    }
    if (!window.speechSynthesis || !window.speechSynthesis.speaking) return;
    window.speechSynthesis.pause();
    setStatus('speechTtsStatus', 'خوانش مکث شده است؛ برای ادامه دکمهٔ «ادامه» را بزنید.', 'busy');
    updateTtsControls();
  }

  function resumeSpeech() {
    const audio = byId('speechTtsAudio');
    if (audio && audio.paused && !audio.ended && audio.currentSrc) {
      const playback = audio.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => notify('برای پخش دوباره، کنترل صوتی مرورگر را بزنید.'));
      return;
    }
    if (!window.speechSynthesis || !window.speechSynthesis.paused) return;
    window.speechSynthesis.resume();
    setStatus('speechTtsStatus', 'خوانش محلی ادامه یافت.', 'listening');
    updateTtsControls();
  }

  function stopSpeech(showMessage) {
    state.ttsSession++;
    state.ttsRunning = false;
    state.ttsPreparing = false;
    state.ttsChunks = [];
    state.ttsChunkIndex = 0;
    state.ttsSynthesisRate = 1;
    if (state.ttsWorker) {
      try { state.ttsWorker.terminate(); } catch (_) { /* no-op */ }
      state.ttsWorker = null;
    }
    if (state.piperWorker) {
      try { state.piperWorker.terminate(); } catch (_) { /* no-op */ }
      state.piperWorker = null;
    }
    if (state.tinyAvaWorker) {
      try { state.tinyAvaWorker.terminate(); } catch (_) { /* no-op */ }
      state.tinyAvaWorker = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_) { /* no-op */ }
    }
    const audio = byId('speechTtsAudio');
    if (audio) {
      audio.pause();
      audio.onplay = audio.onpause = audio.ontimeupdate = audio.onended = audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      audio.hidden = true;
    }
    const download = byId('speechTtsDownload');
    if (download) {
      download.removeAttribute('href');
      download.hidden = true;
    }
    if (state.ttsAudioUrl) {
      URL.revokeObjectURL(state.ttsAudioUrl);
      state.ttsAudioUrl = '';
    }
    if (showMessage && byId('speechTtsStatus')) {
      setStatus('speechTtsStatus', 'خوانش متوقف شد.', 'busy');
      updateTtsProgress(0, 0, 'خوانش متوقف شد.');
    }
    updateTtsControls();
  }

  function updateTtsProgress(done, total, text) {
    const bar = byId('speechTtsProgress');
    const wrapper = bar && bar.parentElement;
    const progressText = byId('speechTtsProgressText');
    const segment = byId('speechTtsSegment');
    const percent = total ? Math.max(0, Math.min(100, Math.round(done / total * 100))) : 0;
    if (bar) bar.style.width = `${percent}%`;
    if (wrapper) wrapper.setAttribute('aria-valuenow', String(percent));
    if (progressText) progressText.textContent = text;
    if (segment) segment.textContent = `${faNumber(done)} از ${faNumber(total)}`;
  }

  function updateTtsProgressPercent(percent, text) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const bar = byId('speechTtsProgress');
    const wrapper = bar && bar.parentElement;
    const progressText = byId('speechTtsProgressText');
    const segment = byId('speechTtsSegment');
    if (bar) bar.style.width = `${value}%`;
    if (wrapper) wrapper.setAttribute('aria-valuenow', String(value));
    if (progressText) progressText.textContent = text;
    if (segment) segment.textContent = `${faNumber(value)}٪`;
  }

  function notify(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else console.info(message);
  }

  function openSpeechTool(options = {}) {
    const launch = options && typeof options === 'object' && typeof options.text === 'string' ? options : null;
    state.pendingSpeechLaunch = launch ? {
      text: launch.text,
      style: String(launch.style || ''),
      expressiveness: launch.expressiveness,
      pauseScale: launch.pauseScale,
      deliveryLabel: String(launch.deliveryLabel || '')
    } : null;
    state.speechReturnToDebt = !!(launch && launch.returnToDebt === true);
    state.ttsSessionUsed = false;
    if (state.recognition) {
      state.recognitionSession++;
      try { state.recognition.abort(); } catch (_) { /* no-op */ }
      state.recognition = null;
      state.listening = false;
      state.starting = false;
      state.stopping = false;
    }
    stopSpeech(false);
    renderWorkspace();
  }

  window.openSpeechTool = openSpeechTool;
  window.addEventListener('online', () => {
    if (byId('speechSttStatus')) refreshRecognitionSupport();
  });
  window.addEventListener('offline', () => {
    if (byId('speechSttStatus') && state.recognitionStatus === 'downloadable') updateRecognitionButtons();
  });
})();
