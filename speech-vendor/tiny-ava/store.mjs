/* Local IndexedDB storage for the shared tiny-ava TTS/G2P bundle. */
import { TINY_AVA_ASSETS, TINY_AVA_MODEL_ID, TINY_AVA_TOTAL_BYTES, TINY_AVA_VERSION } from './core.mjs';

const DB_NAME = 'shahr-advisor-local-tiny-ava';
const DB_VERSION = 1;
const MODEL_STORE = 'models';

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('ذخیره‌ساز محلی مرورگر در دسترس نیست.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MODEL_STORE)) {
        request.result.createObjectStore(MODEL_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('بازکردن ذخیره‌ساز مدل tiny-ava ممکن نشد.'));
    request.onblocked = () => reject(new Error('ذخیره‌ساز مدل tiny-ava در برگهٔ دیگری مشغول است؛ آن برگه را ببندید و دوباره امتحان کنید.'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('خواندن مدل tiny-ava از حافظهٔ محلی ممکن نشد.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('ذخیرهٔ مدل tiny-ava کامل نشد.'));
  });
}

function isCompleteRecord(record) {
  if (!record || record.id !== TINY_AVA_MODEL_ID || record.version !== TINY_AVA_VERSION ||
    typeof Blob === 'undefined' || !record.assetSha256 || Number(record.bytes) !== TINY_AVA_TOTAL_BYTES) return false;
  const fields = { tts: 'tts', g2pEncoder: 'g2pEncoder', g2pDecoder: 'g2pDecoder' };
  return TINY_AVA_ASSETS.every(asset => {
    const blob = record[fields[asset.id]];
    return blob instanceof Blob && blob.size === asset.bytes && record.assetSha256[asset.id] === asset.sha256;
  });
}

export async function getStoredTinyAvaModel() {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(MODEL_STORE, 'readonly');
    const record = await requestResult(transaction.objectStore(MODEL_STORE).get(TINY_AVA_MODEL_ID));
    return isCompleteRecord(record) ? record : null;
  } finally {
    db.close();
  }
}

export async function hasStoredTinyAvaModel() {
  return !!(await getStoredTinyAvaModel());
}

export async function saveStoredTinyAvaModel(record) {
  if (!isCompleteRecord(record)) throw new Error('فایل‌های مدل tiny-ava برای ذخیره کامل نیستند.');
  const db = await openDatabase();
  try {
    const transaction = db.transaction(MODEL_STORE, 'readwrite');
    transaction.objectStore(MODEL_STORE).put(record);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function removeStoredTinyAvaModel() {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(MODEL_STORE, 'readwrite');
    transaction.objectStore(MODEL_STORE).delete(TINY_AVA_MODEL_ID);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
