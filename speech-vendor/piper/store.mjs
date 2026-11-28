/* IndexedDB storage for user-requested neural voice downloads; nothing is uploaded. */
export const PIPER_DB_NAME = 'shahr-advisor-local-persian-tts';
const PIPER_DB_VERSION = 1;
const VOICE_STORE = 'voices';

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('ذخیره‌ساز محلی مرورگر در دسترس نیست.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PIPER_DB_NAME, PIPER_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VOICE_STORE)) db.createObjectStore(VOICE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('بازکردن ذخیره‌ساز صدای محلی ممکن نشد.'));
    request.onblocked = () => reject(new Error('ذخیره‌ساز صدای محلی در برگهٔ دیگری مشغول است؛ آن برگه را ببندید و دوباره امتحان کنید.'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('خواندن مدل صدای محلی ممکن نشد.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('ذخیرهٔ مدل صدای محلی کامل نشد.'));
  });
}

export async function getStoredVoice(id) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(VOICE_STORE, 'readonly');
    const result = await requestResult(transaction.objectStore(VOICE_STORE).get(id));
    return result || null;
  } finally {
    db.close();
  }
}

export async function listStoredVoices() {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(VOICE_STORE, 'readonly');
    return await requestResult(transaction.objectStore(VOICE_STORE).getAllKeys());
  } finally {
    db.close();
  }
}

export async function saveStoredVoice(record) {
  if (!record || typeof record.id !== 'string' || !(record.model instanceof Blob) || !record.config) {
    throw new Error('فایل‌های مدل صدای فارسی برای ذخیره کامل نیستند.');
  }
  const db = await openDatabase();
  try {
    const transaction = db.transaction(VOICE_STORE, 'readwrite');
    transaction.objectStore(VOICE_STORE).put(record);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function removeStoredVoice(id) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(VOICE_STORE, 'readwrite');
    transaction.objectStore(VOICE_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
