# موتور گفتار عصبی فارسی Piper

این پوشه موتور مرورگری را همراه برنامه نگه می‌دارد؛ وزن‌های صدای فارسی داخل ZIP نیستند و فقط پس از انتخاب کاربر دریافت می‌شوند.

## فایل‌های runtime

- `ort.min.mjs`، `ort-wasm-simd-threaded.mjs` و `ort-wasm-simd-threaded.wasm`: ONNX Runtime Web نسخهٔ 1.20.1؛ glue جاوااسکریپت و WASM لازم‌اند و باید هر سه در بسته بمانند.
- `piper-phonemize.mjs`، `piper_phonemize.wasm` و `piper_phonemize.data`: رابط واج‌شناسی Piper و دادهٔ eSpeak NG فارسی.
- `piper-worker.mjs`, `store.mjs`, `core.mjs`: Worker، ذخیره‌ساز IndexedDB و توابع اعتبارسنجی/ساخت WAV مخصوص برنامه.

## مدل‌های فارسی

مدل‌ها از snapshot ثابت [diffusionstudio/piper-voices@50f6de3](https://huggingface.co/diffusionstudio/piper-voices/tree/50f6de3c5afb40402551adb29d9e08dff2ec4624) دریافت می‌شوند تا تغییرات آیندهٔ شاخهٔ اصلی، اثرانگشت مدل‌ها را بی‌اعتبار نکند. برنامه پیش از ذخیره، اندازه و SHA-256 وزن ONNX را با اثرانگشت ثبت‌شده تطبیق می‌دهد:

| شناسه | اندازهٔ وزن | SHA-256 |
| --- | ---: | --- |
| `fa_IR-amir-medium` | 63,531,379 bytes | `fb815380d969ea372b0b21b0de14421f58fe481047e153e69685d079b6e1a9d1` |
| `fa_IR-gyro-medium` | 63,122,309 bytes | `37dfae43c82ee38ca9e6aac4ffef76a74d6b282ccbc397b27761f35d355c99ba` |

برای هر صدا دریافت اولیه حدود ۶۱ MiB است. فایل و پیکربندی در IndexedDB همان origin ذخیره می‌شوند؛ پس از آن، گفتار روی CPU دستگاه و بدون ارسال متن ساخته می‌شود. مدل‌ها در cache عمومی یا ZIP قرار نمی‌گیرند.

مخزن بالادستی `license: mit` را در metadata خود اعلام می‌کند، اما شرایط هر داده/صدا را باید با MODEL_CARD همان صدا هم سنجید: کارت Amir مجوز CC0 را برای مجموعهٔ داده ذکر می‌کند؛ کارت Gyro به «See URL» ارجاع می‌دهد. مجوز استفادهٔ صدای تولیدشده، بازتوزیع وزن‌ها و استفادهٔ تجاری را بدون بررسی همان منابع قطعی فرض نکنید. جزئیات runtime در `THIRD-PARTY-NOTICES.txt` آمده است.
