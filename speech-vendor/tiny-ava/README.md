# tiny-ava v2 — local Persian TTS

The speech workspace offers two Persian voices from one shared tiny-ava v2 model:

- **Parisa (پریسا)** — Persian female preset; upstream describes its source as generated speech from “Chatterbox Run C”.
- **Mana (مانا)** — Persian male voice; upstream explicitly describes it as a **real studio human voice**, sourced from **Mana-TTS HIGH**. It is therefore not described here as fully synthetic or as a voice with no human source. The upstream project labels the source dataset CC0-1.0, but this repository has not independently verified the speaker's identity or consent beyond those published license/provenance statements. No celebrity or named-person imitation is intended.

The **model weights** are listed as CC BY 4.0 and require attribution. Personal, non-commercial use is supported by the user's chosen use case; follow the published license regardless of use. If a deployment requires confirmation of speaker consent/identity beyond the upstream dataset license, do not enable Mana until that has been obtained.

The two voices use the same **36,034,045-byte TTS model plus two G2P files** (44,799,403 bytes total, about 42.7 MiB). The ONNX weights are deliberately **not bundled in the offline ZIP**: the user explicitly downloads them once from the app, after which model bytes and inference stay in this browser/device. The text to synthesize is never sent to the model hosts.

## Local inference

- `tiny-ava-worker.mjs` loads all three ONNX sessions through the already-bundled ONNX Runtime Web and WebAssembly runtime. Model bytes are read only from this origin's IndexedDB; there is no CDN/runtime/API fallback.
- `core.mjs` contains the pinned asset metadata, Persian normalization, Persian-number expansion, ByT5 G2P decoder, phoneme mapping, sentence-level `segmentTinyAvaText`, and an optional same-device pronunciation lexicon. Commas and internal punctuation stay inside one model inference so words do not get split into separately synthesized fragments; sentence endings and blank paragraphs create bounded pauses.
- `store.mjs` keeps the model bundle in its own IndexedDB database (`shahr-advisor-local-tiny-ava`), separate from Piper voices.
- The three model files are downloaded from immutable Hugging Face revisions, size-checked and SHA-256-checked before the complete bundle is stored.
- TTS output is 24 kHz mono WAV. The worker limits CPU inference to one WASM thread to avoid blocking the app.

## Pronunciation and prosody limits

Persian G2P is the primary path. The input keeps Persian vowel marks so users may disambiguate words with diacritics; numeric sequences, common clock times, percentages and numeric ranges are expanded into Persian words before G2P because the model's text frontend does not speak raw digits reliably. This is a practical aid, not a guarantee of perfect pronunciation. Words with ambiguous spelling, rare names and mixed English/Persian may still need user-supplied diacritics or a written-out form.

The default **automatic, sentence-aware** style applies restrained pitch/speed changes for question, exclamation, and trailing-ellipsis endings, plus a small, deterministic set of text cues for formal phrasing, gratitude, sympathy, surprise, and clear emphasis. This is local rule-based text styling—not understanding of a speaker's real emotional state. Commas stay inside the same model inference. Formal, calm, happy, sad, angry, excited, storytelling, and lively presets map to the model's available speed, pitch shift/range, and pause timing. These are approximate performance effects, **not trained emotion labels, context-aware emotion detection, new accents, or a guarantee of human-like affect**. Nothing is added to the user's words automatically.

The optional pronunciation lexicon stores up to 64 user-supplied `word = preferred reading` entries in this browser's local storage and applies whole-word/phrase substitutions before synthesis. Diacritics in the preferred reading can guide the Persian G2P frontend. This adapts spelling/pronunciation, **not the neural model weights or voice**; entries do not leave the device.

The existing phoneme-stress input is used for gentle emphasis on expanded numbers, selected key words, and words following common honorifics. Users can mark a specific phrase with `[[تأکید:عبارت]]` or the selection button; the cue is removed before G2P and the sentence remains a single inference. Stress/emphasis is model-dependent and cannot reliably identify every proper name or important fact; it is not a loudness control or a guarantee of studio-style delivery.

Sentence-ending punctuation and blank paragraphs create bounded local silence gaps; commas and other intra-sentence punctuation stay in the same model input so the frontend can preserve phrase continuity. A single line break is treated as spacing, while a blank line creates a longer paragraph pause. Tiny-ava users may also put these optional cues directly in the text:

- `[[مکث کوتاه]]`, `[[مکث]]`, and `[[مکث بلند]]` add progressively longer silence.
- `[[کشیده:عبارت]]` sends the phrase at a slower model speed and a slightly wider pitch range. This is an approximation, not true phoneme-level vowel stretching.
- `[[تأکید:عبارت]]` marks the phrase's words for a modest stress cue without splitting the surrounding sentence into separate model calls.
- `[[آه]]`, `[[اوه]]`, `[[هوم]]` (or `[[sigh]]`) synthesize the indicated spoken word; these are not dedicated non-speech vocalizations.
- `[[نفس]]` inserts a short, low-level, synthetic filtered-noise breath-like effect plus a pause. It is **not recorded human breathing** or a sound generated by the TTS model.

These effects are explicit and optional; ordinary text does not get extra sighs, breaths, or emotion. The same style controls/cues are not model features for Piper or eSpeak. In those modes, recognized cue markup is stripped from the spoken text rather than read aloud.

## Pinned assets

| Asset | Immutable source revision | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| tiny-ava v2 ONNX | `mehdi-hf/tiny-ava@d1064f5a0b57a04b6d540588e0824e6ce259a7ab` | 36,034,045 | `ee49d4f51882cd7acbcd28ce7ace570e47897018d03db410b6b883bcc818bed2` |
| Persian G2P encoder | `mehdi-hf/tiny-ava-demo@27c0e1c7bef79ead8761dad4caaa9313371adde6` | 3,459,754 | `aa22db88525e657f1c1d44ba55ebb1e7e08d8693dcc6a5a22a5c053b518a600f` |
| Persian G2P decoder | `mehdi-hf/tiny-ava-demo@27c0e1c7bef79ead8761dad4caaa9313371adde6` | 5,305,604 | `8d6635098a78d9c3c6af4fb0d01f7b6a5f3d4396fc10b0e61959b384c237a4bc` |

## Attribution, data provenance, and licenses

- tiny-ava v2 model weights: **CC BY 4.0**. Required attribution: **“Powered by tiny-ava (Mehdi Allahyari / OncillaAI)”**, with a link to <https://huggingface.co/mehdi-hf/tiny-ava>.
- Mana training data: upstream credits <https://huggingface.co/datasets/MahtaFetrat/Mana-TTS> (`Mana-TTS HIGH`) as **CC0-1.0** and describes the speaker as a real studio human male. This disclosure is retained; no claim is made that the voice has no human source or that consent has been independently reviewed.
- Parisa training source: upstream identifies “Chatterbox Run C”; no separate license for that source is asserted here beyond the tiny-ava weight license.
- Persian G2P model: **MIT**, from <https://huggingface.co/mehdi-hf/persian-g2p-tiny>.
- tiny-ava reference code: **Apache-2.0**; the applicable license text is in `LICENSE-APACHE-2.0.txt`.
- ONNX Runtime Web is reused from `../piper/`; see `../piper/THIRD-PARTY-NOTICES.txt` for its MIT notice.

See `THIRD-PARTY-NOTICES.txt` for bundled attributions and asset provenance.
