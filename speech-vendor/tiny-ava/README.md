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

The local, deterministic analyzer reads each sentence's punctuation and a conservative set of explicit Persian phrases (for example, sympathy, reassurance, polite/formal wording, suggestions, and congratulations). It changes only delivery parameters—not the words—and smooths profile changes across sentence boundaries. Small adjustments can affect speed, pitch shift/range, generated intensity, and pause timing. Longer sentences are paced more carefully; short sentences remain brisk. No emotion is inferred from audio, and ambiguous text defaults toward neutral. This is heuristic direction, **not true semantic understanding, trained emotion labels, a new accent, or a guarantee of human-like affect**. Automatic prosody remains active alongside a selected style preset unless explicitly disabled by a caller.

The optional pronunciation lexicon stores up to 64 user-supplied `word = preferred reading` entries in this browser's local storage and applies whole-word/phrase substitutions before synthesis. Diacritics in the preferred reading can guide the Persian G2P frontend. This adapts spelling/pronunciation, **not the neural model weights or voice**; entries do not leave the device.

The staff response preview maps a reviewable, transcript-only interaction category to one restrained local tiny-ava profile (automatic, supportive, formal, or conversational). Punctuation pauses and light stress on expanded numbers/key terms are added by the local frontend; the visible customer draft stays free of technical tags. This borrows the high-level idea of context guidance plus sparse delivery cues from [ElevenLabs' prompting guide](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices) and [Expressive mode guide](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode), but does **not** use ElevenLabs models, API, or proprietary tags and does not imply equivalent expressive capability. The local preview never analyzes acoustic emotion or contacts a customer.

The model's phoneme-stress input is used for gentle emphasis on expanded numbers, selected key words, and words following common honorifics. A separate, small per-sentence gain adjustment shapes output intensity without relying on stress to create loudness. Users can mark a specific phrase with `[[تأکید:عبارت]]` or the selection button; the cue is removed before G2P and the sentence remains a single inference. Stress/emphasis is model-dependent and cannot reliably identify every proper name or important fact; neither control guarantees studio-style delivery.

Sentence-ending punctuation and blank paragraphs create bounded local silence gaps; commas and other intra-sentence punctuation stay in the same model input so the frontend can preserve phrase continuity. A single line break is treated as spacing, while a blank line creates a longer paragraph pause. Tiny-ava users may also put these optional cues directly in the text:

- `[[مکث کوتاه]]`, `[[مکث]]`, and `[[مکث بلند]]` add progressively longer silence.
- `[[کشیده:عبارت]]` sends the phrase at a slower model speed and a slightly wider pitch range. This is an approximation, not true phoneme-level vowel stretching.
- `[[تأکید:عبارت]]` marks the phrase's words for a modest stress cue without splitting the surrounding sentence into separate model calls.
- `[[آه]]`, `[[اوه]]`, `[[هوم]]` (or `[[sigh]]`) synthesize the indicated spoken word; these are not dedicated non-speech vocalizations.
- `[[نفس]]` inserts a short, low-level, synthetic filtered-noise breath-like effect plus a pause. It is **not recorded human breathing** or a sound generated by the TTS model.

These cues are explicit and optional; ordinary text does not get extra sighs, breaths, or emotion. Piper, eSpeak, and the browser voice do not support tiny-ava's custom emphasis/breath cues, so the cues are stripped or handled only through each engine's actual rate, pitch, volume, and pause controls. Unsupported or unknown bracket/SSML tags are discarded rather than spoken aloud.

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
