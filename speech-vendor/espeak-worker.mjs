/* A small local-only worker bridge. No network host other than this app is contacted. */
import { synthesizePersianSegmentsWav } from './espeak-core.mjs';

self.onmessage = async event => {
  const message = event.data || {};
  const requestId = message.requestId;
  try {
    const chunks = Array.isArray(message.chunks) ? message.chunks : [{ text: message.text }];
    const wav = await synthesizePersianSegmentsWav(
      chunks,
      message.rate,
      message.pitch,
      message.pauseScale,
      progress => self.postMessage({ type: 'progress', requestId, ...progress })
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
