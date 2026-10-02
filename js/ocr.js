// Reading a photo of a syllabus, on this device.
//
// This is the one place Triage uses machine learning: Tesseract, an open-source text reader,
// turns a picture into text. It runs in the browser from files stored with the app.
// The photo is never uploaded, and nothing here touches the plan. The student checks the text
// before it is used.
//
// The text reader (about 7 MB) is only fetched the first time someone adds a photo.

import { toGray, skewAngle, cleanPage } from './clean.js';

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;   // works wherever the app is hosted
const MAX_SIDE = 2000;      // big phone photos are shrunk to this: faster, and no worse for printed text
const MIN_WIDTH = 1000;     // small screenshots are enlarged: the reader does badly on small letters
const WORD_FLOOR = 25;      // a word the reader is less than 25% sure of is left out
const LINE_FLOOR = 35;      // so is a whole line it is less than 35% sure of: usually the edge of the paper, not text
export const MAX_BYTES = 25 * 1024 * 1024;

let loading = null;
function loadLibrary() {
  if (window.Tesseract) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = BASE + 'tesseract.min.js';
      s.onload = () => resolve();
      s.onerror = () => { loading = null; s.remove(); reject(new Error('The text reader could not be loaded.')); };
      document.head.append(s);
    });
  }
  return loading;
}

function draw(bitmap, width, height, degrees = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';                      // a see-through PNG would otherwise read as black
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  if (degrees) { ctx.translate(width / 2, height / 2); ctx.rotate((degrees * Math.PI) / 180); ctx.translate(-width / 2, -height / 2); }
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { canvas, ctx };
}

/**
 * Get the picture ready: a sensible size, turned straight, light evened out,
 * table lines and rows of dots removed. Returns a canvas.
 */
export async function prepare(file) {
  const bitmap = await createImageBitmap(file);
  let scale = 1;
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest > MAX_SIDE) scale = MAX_SIDE / longest;
  else if (bitmap.width < MIN_WIDTH) scale = Math.min(2.5, MIN_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));

  // Measure the tilt on a small copy, then draw the full picture turned straight.
  const k = Math.min(1, 700 / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * k)), sh = Math.max(1, Math.round(height * k));
  const small = draw(bitmap, sw, sh);
  const tilt = skewAngle(toGray(small.ctx.getImageData(0, 0, sw, sh).data, sw, sh), sw, sh);

  const { canvas, ctx } = draw(bitmap, width, height, -tilt);
  bitmap.close?.();
  const image = ctx.getImageData(0, 0, width, height);
  const page = cleanPage(toGray(image.data, width, height), width, height);
  for (let i = 0, p = 0; i < page.gray.length; i++, p += 4) {
    image.data[p] = image.data[p + 1] = image.data[p + 2] = page.gray[i]; image.data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Put the reader's answer back together line by line, leaving out what it was only guessing at.
 * Returns { text, sure }: sure is how confident the reader was in the lines that were kept, 0 to 100.
 */
export function sureText(data) {
  const lines = [], scores = [];
  for (const block of data.blocks || []) for (const para of block.paragraphs || []) for (const line of para.lines || []) {
    if (line.confidence < LINE_FLOOR) continue;
    let text = line.text || '';
    for (const word of line.words || []) {
      if (word.confidence < WORD_FLOOR && word.text) text = text.replace(word.text, ' '.repeat(word.text.length));
    }
    text = text.replace(/\s+$/, '');
    if (!text.trim()) continue;
    lines.push(text);
    if (text.trim().length >= 6) scores.push(line.confidence);
  }
  if (!lines.length) return { text: data.blocks ? '' : (data.text || ''), sure: Math.round(data.confidence || 0) };
  scores.sort((a, b) => a - b);
  return { text: lines.join('\n'), sure: Math.round(scores.length ? scores[scores.length >> 1] : 0) };
}

/** The reader's full answer for a picture: text, plus how sure it is of every line and word. */
export async function readData(file, onProgress = () => {}) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('not-an-image');
  if (file.size > MAX_BYTES) throw new Error('too-big');
  onProgress('looking', 0);
  await new Promise((done) => setTimeout(done, 30));          // let the screen show the message before the heavy work
  const canvas = await prepare(file);
  onProgress('loading', 0);
  await loadLibrary();
  const worker = await window.Tesseract.createWorker('eng', 1, {
    workerPath: BASE + 'worker.min.js',
    corePath: BASE + 'core',
    langPath: BASE + 'lang',
    workerBlobURL: false,                      // load the worker straight from our own files
    gzip: true,
    logger: (m) => { if (m.status === 'recognizing text') onProgress('reading', m.progress || 0); else onProgress('loading', 0); },
  });
  try {
    // A syllabus is a list: read it row by row, and keep wide gaps so "name      7" stays a table row.
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    return data;
  } finally {
    await worker.terminate();
  }
}

/**
 * Returns { text, sure }: the text found in the picture, and how confident the reader was (0 to 100).
 * onProgress(stage, share): stage is 'looking', 'loading' or 'reading'; share is 0 to 1 while reading.
 */
export async function readPhoto(file, onProgress = () => {}) {
  return sureText(await readData(file, onProgress));
}
