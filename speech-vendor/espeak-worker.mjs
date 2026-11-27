/* A small local-only worker bridge. No network host other than this app is contacted. */
import { synthesizePersianWav } from './espeak-core.mjs';

self.onmessage = async event => {
  const message = event.data || {};
  const requestId = message.requestId;
  try {
    const wav = await synthesizePersianWav(
      message.text,
      message.rate,
      message.pitch,
      phase => self.postMessage({ type: 'progress', requestId, phase })
    );
    self.postMessage({ type: 'complete', requestId, wav }, [wav]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId,
      message: error && error.message ? error.message : 'تولید صدای فارسی ناموفق بود.'
    });
  }
};
