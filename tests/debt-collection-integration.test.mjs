import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const helper = await readFile(new URL('../debt-collection.js', import.meta.url), 'utf8');
const localChat = await readFile(new URL('../local-chat.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('registers the collection helper in the app tool list, UI route, styles and script order', () => {
  assert.ok(html.includes('href="debt-collection.css"'));
  assert.ok(html.includes("id:'debtcollect',t:'پیگیری و وصول مطالبات'"));
  assert.ok(html.includes("if(id==='debtcollect'){openDebtCollectionAssist();return}"));
  assert.ok(html.includes('<script src="local-chat.js"></script>\n<script src="debt-collection.js"></script>'));
  assert.ok(html.includes("پیگیری مطالبات',()=>{HIST.length=0;CUR='tools';openTool('debtcollect')"));
  assert.match(helper, /onReturn:\s*\(\)\s*=>\s*openDebtCollectionAssist\(\{\s*returningFromModelSetup:\s*true\s*\}\)/u);
  assert.match(localChat, /id="lcReturnToCaller"/u);
  assert.match(localChat, /window\.appBack\(\);\s*onReturn\(\)/u);
  assert.ok(!helper.includes('class="sm-root'), 'the collection page must not trip the smart-tools back-stack hook');
});

test('fails closed unless on-device speech processing is supported and explicitly enabled', () => {
  assert.match(helper, /dcConsent/u);
  assert.match(helper, /processLocally\s*=\s*true/u);
  assert.match(helper, /if\s*\(!\('processLocally'\s+in\s+probe\)\)/u);
  assert.match(helper, /دیکتهٔ ابری فعال نمی‌شود/u);
  assert.match(helper, /dcVoiceSignalEnabled/u);
});

test('uses an opt-in local model API that stays separate from the public chat history', () => {
  assert.match(localChat, /window\.getLocalChatStatus\s*=\s*getLocalChatStatus/u);
  assert.match(localChat, /window\.generateLocalChatDraft\s*=\s*generateLocalChatDraft/u);
  assert.match(localChat, /messages,\s*stream:\s*true/u);
  assert.match(helper, /window\.generateLocalChatDraft\(messages\)/u);
  assert.match(helper, /id="dcSpeakDraft"/u);
  assert.match(helper, /selectDebtSpeechProfile\(analysis\.id, selectedTone\(analysis\)\)/u);
  assert.match(helper, /window\.openSpeechTool\(\{/u);
  assert.match(helper, /returnToDebt:\s*true/u);
  assert.match(helper, /returningFromSpeech/u);
  assert.match(helper, /extractDebtCustomerReply/u);
  assert.match(helper, /تاریخچهٔ گفت‌وگوی عمومی جدا/u);
});

test('precaches the new app assets and advances the service-worker cache key', () => {
  assert.match(serviceWorker, /shahr-advisor-pc-v46/u);
  for (const path of ['debt-collection.css', 'debt-collection.js', 'debt-collection-core.mjs']) {
    assert.ok(serviceWorker.includes(`'./${path}'`), `missing ${path} from the offline app shell`);
  }
});
