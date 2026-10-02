import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPage, inkOf, skewAngle, grain, toGray } from '../js/clean.js';

// A tiny drawing kit: a grey page, and dark boxes standing in for letters.
function page(w, h, paper = 230) {
  const px = new Uint8ClampedArray(w * h).fill(paper);
  const api = {
    px, w, h,
    box(x, y, bw, bh, v = 30) { for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h) px[yy * w + xx] = v; return api; },
    /** a "word": n letters, each 6 wide and 10 tall */
    word(x, y, n = 6, v = 30) { for (let k = 0; k < n; k++) api.box(x + k * 10, y, 6, 10, v); return api; },
    at(x, y) { return px[y * w + x]; },
  };
  return api;
}
const at = (res, w, x, y) => res.gray[y * w + x];

test('the ruled lines of a table are removed and the letters are kept', () => {
  const p = page(300, 200);
  for (const y of [40, 80, 120]) p.word(30, y, 10);
  for (const y of [25, 65, 105, 145]) p.box(10, y, 281, 2);          // across
  for (const x of [10, 150, 290]) p.box(x, 25, 2, 122);              // down
  const res = cleanPage(p.px, 300, 200);
  assert.equal(res.letter, 10);
  assert.ok(res.lines > 1500, 'lines removed: ' + res.lines);
  for (const [x, y] of [[100, 25], [200, 66], [10, 90], [151, 100], [290, 130], [280, 145]]) assert.equal(at(res, 300, x, y), 255, `line pixel ${x},${y} should be white`);
  for (const y of [45, 85, 125]) for (const x of [32, 62, 122]) assert.ok(at(res, 300, x, y) < 100, `letter pixel ${x},${y} should stay dark`);
});

test('a letter that touches a table line survives', () => {
  const p = page(300, 120);
  p.word(30, 40, 10).word(30, 80, 10);
  p.box(10, 50, 281, 2);                                              // a line right under the first row, touching it
  const res = cleanPage(p.px, 300, 120);
  assert.equal(at(res, 300, 100, 50), 255);
  assert.ok(at(res, 300, 32, 44) < 100 && at(res, 300, 122, 44) < 100);
});

test('a row of dots between a name and its marks is removed; the dot of an i is kept', () => {
  const p = page(320, 80);
  p.word(20, 30, 6);                                                  // the name
  p.box(84, 28, 2, 2).box(84, 32, 2, 8);                              // an "i": a dot with its stem under it
  for (let k = 0; k < 14; k++) p.box(100 + k * 6, 38, 2, 2);          // the leader, on the baseline
  p.word(200, 30, 5);                                                 // the marks
  p.box(252, 38, 2, 2);                                               // one full stop after the marks
  const res = cleanPage(p.px, 320, 80);
  assert.equal(res.dots, 14);
  for (let k = 0; k < 14; k++) assert.equal(at(res, 320, 100 + k * 6, 38), 255);
  assert.ok(at(res, 320, 84, 28) < 100, 'the dot of the i is still there');
  assert.ok(at(res, 320, 252, 38) < 100, 'a full stop is still there');
  assert.ok(at(res, 320, 22, 35) < 100);
});

test('three dots in a row are not a leader', () => {
  const p = page(200, 60);
  p.word(20, 20, 8);
  for (let k = 0; k < 3; k++) p.box(110 + k * 6, 28, 2, 2);
  assert.equal(cleanPage(p.px, 200, 60).dots, 0);
});

test('specks far from any letter are removed; paper comes out pure white', () => {
  const p = page(300, 120);
  p.word(20, 30, 8).box(102, 38, 2, 2);                               // a word and its full stop
  for (const [x, y] of [[200, 90], [250, 20], [40, 100], [280, 60]]) p.box(x, y, 2, 2);
  p.box(150, 100, 1, 1);
  const res = cleanPage(p.px, 300, 120);
  for (const [x, y] of [[200, 90], [250, 20], [40, 100], [280, 60], [150, 100]]) assert.equal(at(res, 300, x, y), 255, `speck at ${x},${y}`);
  assert.ok(at(res, 300, 102, 38) < 100, 'the full stop next to the word is kept');
  assert.equal(at(res, 300, 150, 60), 255);
});

test('a grainy photo: the grain is measured, and it does not turn into ink', () => {
  const w = 300, h = 160, p = page(w, h, 200);
  p.box(0, 100, w, 60, 70);                                           // a dark table top under the paper
  for (const y of [20, 50]) p.word(20, y, 12, 40);
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < w * h; i++) p.px[i] = p.px[i] + (rnd() + rnd() + rnd() + rnd() - 2) * 24;   // grain, about 14 either way
  const noisy = grain(p.px, w, h);
  assert.ok(noisy > 9 && noisy < 20, 'grain measured as ' + noisy);
  assert.ok(grain(page(w, h).word(20, 20, 12).px, w, h) < 1);
  const res = cleanPage(p.px, w, h);
  let dark = 0;
  for (let y = 112; y < 160; y++) for (let x = 0; x < w; x++) if (at(res, w, x, y) < 128) dark++;
  assert.ok(dark < 30, 'dark pixels left on the table top: ' + dark);
  for (const x of [22, 52, 132]) assert.ok(at(res, w, x, 25) < 128, 'the letters are still there');
});

test('light text on a dark page is flipped to dark on white', () => {
  const p = page(200, 100, 20);
  for (const y of [20, 50]) p.word(20, y, 8, 235);
  const res = cleanPage(p.px, 200, 100);
  assert.equal(res.inverted, true);
  assert.ok(at(res, 200, 22, 25) < 100, 'text is dark');
  assert.ok(at(res, 200, 150, 80) > 220, 'page is white');
  assert.equal(cleanPage(page(200, 100).word(20, 20, 8).px, 200, 100).inverted, false);
});

test('uneven light is evened out', () => {
  const w = 400, h = 120, p = page(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.px[y * w + x] = 110 + Math.round((130 * x) / w);   // shadow on the left
  for (let k = 0; k < 30; k++) { const x = 20 + k * 12; p.box(x, 50, 6, 10, Math.round(p.at(x, 50) * 0.25)); }
  const { flat, ink } = inkOf(p.px, w, h);
  for (const x of [5, 100, 200, 300, 395]) assert.ok(flat[20 * w + x] > 225, `paper at x=${x} is ${flat[20 * w + x]}`);
  for (const k of [0, 14, 29]) { const x = 22 + k * 12; assert.equal(ink[55 * w + x], 1); assert.ok(flat[55 * w + x] < 100); }
  assert.equal(ink[20 * w + 5], 0);
});

test('a page with almost nothing on it is returned as it is, evened out', () => {
  const res = cleanPage(page(100, 60).box(10, 10, 6, 10).px, 100, 60);
  assert.deepEqual([res.lines, res.dots, res.letter], [0, 0, 0]);
  assert.equal(res.gray.length, 6000);
  const empty = cleanPage(new Uint8ClampedArray(0), 0, 0);
  assert.equal(empty.gray.length, 0);
});

test('the tilt of a page is measured to within a third of a degree', () => {
  const tilted = (deg) => {
    const p = page(400, 300), t = Math.tan((deg * Math.PI) / 180);
    for (let row = 0; row < 7; row++) for (let k = 0; k < 30; k++) { const x = 30 + k * 11; p.box(x, Math.round(50 + row * 30 + x * t), 6, 10); }
    return p;
  };
  for (const deg of [3, -4.5, 1.2, 8]) {
    const got = skewAngle(tilted(deg).px, 400, 300);
    assert.ok(Math.abs(got - deg) <= 0.35, `tilt ${deg} measured as ${got}`);
  }
  assert.equal(skewAngle(tilted(0).px, 400, 300), 0);
  assert.equal(skewAngle(page(200, 100).px, 200, 100), 0);              // a blank page
});

test('colour is turned to grey by how bright it looks', () => {
  const g = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255]), 4, 1);
  assert.deepEqual([...g], [255, 0, 76, 150]);
});
