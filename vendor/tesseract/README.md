# The text reader (third-party code)

Everything in this folder is other people's work, copied here unchanged so that Triage never has to load anything from another site.

| File | What it is | Version | Licence |
|---|---|---|---|
| `tesseract.min.js`, `worker.min.js` | [Tesseract.js](https://github.com/naptha/tesseract.js): runs the reader in the browser | 7.0.0 | Apache-2.0 (`LICENSE-tesseract.js.md`) |
| `core/*.wasm.js` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core): the [Tesseract](https://github.com/tesseract-ocr/tesseract) engine compiled for browsers. Three builds; the browser picks the fastest one it supports | 7.0.0 | Apache-2.0 (`LICENSE-tesseract.js-core.txt`) |
| `lang/eng.traineddata.gz` | The trained model for English text, from [tessdata_best](https://github.com/tesseract-ocr/tessdata_best) (integer version), packaged as [`@tesseract.js-data/eng`](https://github.com/naptha/tessdata) | 4.0.0_best_int | Apache-2.0 (model), MIT (package) |

Triage uses it for one thing: turning a photo of a syllabus into text (`js/ocr.js`). It is fetched only when a student adds a photo, it runs on the student's device, and the photo is never uploaded.

To update: download the same three packages from npm and copy the same files over these.
