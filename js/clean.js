// Cleaning a photo of a page before the text reader looks at it. Plain arithmetic on pixels.
// (The text reader itself, in ocr.js, is the one part of Triage that uses machine learning.)
//
// A text reader does well on a flat scan and badly on a real photo. cleanPage() deals with what hurts most:
//   1. light text on a dark screen, and grain from a dim room
//   2. uneven light and shadows
//   3. the ruled lines of a table
//   4. rows of dots between a chapter name and its marks ("Light ........ 7")
//   5. specks
// and skewAngle() measures how far the page is tilted, so it can be turned straight first.
// The letters themselves are left alone.
//
// Everything works on a grey picture: one number per pixel, 0 (black) to 255 (white), row by row.

const INK = 0.85;          // a pixel is ink if it is darker than 85% of the light around it

/** Sum of every pixel above and to the left, so the average of any box costs four look-ups. */
function sums(gray, w, h) {
  const W = w + 1, s = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; s[(y + 1) * W + x + 1] = s[y * W + x + 1] + row; }
  }
  return s;
}

/** Find every connected blob of ink. Returns a label per pixel (0 = paper) and a box for each blob. */
function blobs(ink, w, h) {
  const label = new Int32Array(w * h), boxes = [null], stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!ink[start] || label[start]) continue;
    const id = boxes.length;
    let x0 = w, x1 = 0, y0 = h, y1 = 0, area = 0, top = 0;
    stack[top++] = start; label[start] = id;
    while (top) {
      const p = stack[--top], x = p % w, y = (p - x) / w;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (ink[q] && !label[q]) { label[q] = id; stack[top++] = q; }
        }
      }
    }
    boxes.push({ x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  return { label, boxes };
}

function median(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** Swap rows and columns, so the code that finds lines across can also find lines down. */
function flip(a, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + y] = a[y * w + x];
  return out;
}

/**
 * Find ruled lines that run across the page, even if they slope a little.
 *
 * Walk across the page along a gently sloping path. A stretch of ink at least `long` pixels long,
 * with clear paper just above and just below it for most of its length, is a ruled line.
 * (A line of text never passes: the letters sit right above or below any path through it.)
 *
 * Returns { on, rub }: `on` marks the ink a ruled line passes through, `rub` marks the ink to remove.
 */
function rules(ink, w, h, long, clear, need, degrees) {
  const n = w * h, on = new Uint8Array(n), rub = new Uint8Array(n);
  const inkAt = (x, y) => (y >= 0 && y < h ? ink[y * w + x] : 0);
  // "near": ink here, or one pixel above or below. A path may wobble by a pixel and stay on its line.
  const near = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (ink[i] || (i >= w && ink[i - w]) || (i < n - w && ink[i + w])) near[i] = 1;
  for (const deg of degrees) {
    const slope = Math.tan((deg * Math.PI) / 180), drift = slope * (w - 1);
    const from = Math.floor(Math.min(0, -drift)), to = Math.ceil(h - 1 + Math.max(0, -drift));
    for (let y0 = from; y0 <= to; y0++) {
      let run = 0;
      for (let x = 0; x <= w; x++) {
        if (x < w) {
          const y = Math.round(y0 + slope * x);
          if (y >= 0 && y < h && near[y * w + x]) { run++; continue; }
        }
        if (run >= long) {
          let free = 0;
          for (let k = x - run; k < x; k++) { const yy = Math.round(y0 + slope * k); if (!inkAt(k, yy - clear) && !inkAt(k, yy + clear)) free++; }
          if (free >= run * need) {
            for (let k = x - run; k < x; k++) {
              const yy = Math.round(y0 + slope * k);
              let a = yy - 1, b = yy + 1;
              while (a <= b && !inkAt(k, a)) a++;
              while (b >= a && !inkAt(k, b)) b--;
              if (a > b) continue;
              while (inkAt(k, a - 1) && b - a < clear) a--;
              while (inkAt(k, b + 1) && b - a < clear) b++;
              const thin = b - a < clear && !inkAt(k, a - 1) && !inkAt(k, b + 1);   // a thin stroke; otherwise the line is crossing or touching something
              for (let q = a; q <= b; q++) { on[q * w + k] = 1; if (thin) rub[q * w + k] = 1; }
            }
          }
        }
        run = 0;
      }
    }
  }
  return { on, rub };
}

/**
 * How grainy the picture is: the usual jump between two pixels a few steps apart, as a standard deviation.
 * About 0 for a screenshot, 2 to 4 for a good photo, 10 or more for a photo taken in a dim room.
 */
export function grain(gray, w, h) {
  const jumps = [];
  const step = Math.max(1, Math.floor((w * h) / 20000));
  for (let i = 0; i + 3 < w * h; i += step) if ((i % w) + 3 < w) jumps.push(Math.abs(gray[i] - gray[i + 3]));
  return median(jumps) / 0.954;
}

/** Average each pixel with the eight around it. Halves the grain of a noisy photo. */
function soften(gray, w, h) {
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0, count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; sum += gray[yy * w + xx]; count++; }
    }
    out[y * w + x] = sum / count;
  }
  return out;
}

/**
 * Steps 1 and 2: flip a dark page, then even out the light.
 * Returns { flat, ink, inverted, noise }: the evened-out picture, a 1 for every ink pixel,
 * whether it was flipped, and how grainy it was.
 */
export function inkOf(input, w, h) {
  const n = w * h;
  let gray = new Uint8ClampedArray(input);

  // 1. Light text on a dark page (a dark-mode screenshot): flip it.
  let total = 0;
  for (let i = 0; i < n; i++) total += gray[i];
  const inverted = total / n < 110;
  if (inverted) for (let i = 0; i < n; i++) gray[i] = 255 - gray[i];

  //    A grainy photo (taken indoors at night) is softened first, or every grain looks like ink.
  let noise = grain(gray, w, h);
  if (noise > 4) { gray = soften(gray, w, h); noise = grain(gray, w, h); }

  // 2. Even out the light: compare each pixel with the average of a big box around it.
  //    Ink is clearly darker than its surroundings: by 15%, and by more than the grain can explain.
  //    It must also be darker than a small box around it. A table top next to the paper is darker
  //    than the paper, but it is the same shade as itself, so it is not ink.
  const r = Math.max(8, Math.round(Math.max(w, h) / 16)), near = Math.max(6, Math.round(Math.max(w, h) / 60));
  const s = sums(gray, w, h), W = w + 1;
  const box = (x, y, d) => {
    const xa = Math.max(0, x - d), xb = Math.min(w, x + d + 1), ya = Math.max(0, y - d), yb = Math.min(h, y + d + 1);
    return (s[yb * W + xb] - s[ya * W + xb] - s[yb * W + xa] + s[ya * W + xa]) / ((yb - ya) * (xb - xa));
  };
  const flat = new Uint8ClampedArray(n), ink = new Uint8Array(n);
  const margin = noise * 3.5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, v = gray[i], mean = box(x, y, r);
      if (v < mean * INK && mean - v > margin) {
        const close = box(x, y, near);
        if (v < close * 0.93 && close - v > margin) ink[i] = 1;
      }
      flat[i] = mean > 0 ? Math.min(255, (v * 255) / (mean * 0.96)) : 255;
    }
  }
  return { flat, ink, inverted, noise };
}

/**
 * How far the page is tilted, in degrees. Positive means the lines of text run downhill to the right.
 *
 * Idea: slide the foot of every letter along a slanted line onto the left edge and count how many land on each row.
 * At the true tilt, the letters of one line of text all land on the same row: sharp peaks with empty gaps between.
 * The sharpest pile-up wins. Returns 0 when no tilt is clearly better than none.
 */
export function skewAngle(input, w, h, limit = 12) {
  const { ink } = inkOf(input, w, h);
  // Use the foot of every letter-sized blob. Most letters stand on their line of text,
  // so their feet line up. Big shapes (table lines, the edge of the paper) are left out.
  const xs = [], ys = [];
  const { boxes } = blobs(ink, w, h);
  for (let id = 1; id < boxes.length; id++) {
    const b = boxes[id];
    if (b.h >= 3 && b.h <= h / 12 && b.w <= w / 5 && b.area >= 4) { xs.push((b.x0 + b.x1) / 2); ys.push(b.y1); }
  }
  if (xs.length < 15) return 0;
  const rows = new Float64Array(h + 2 * w + 4);
  const sharp = (deg) => {
    const t = Math.tan((deg * Math.PI) / 180);
    rows.fill(0);
    for (let k = 0; k < xs.length; k++) rows[Math.round(ys[k] - xs[k] * t) + w + 1]++;
    let sum = 0;
    for (let k = 0; k < rows.length; k++) sum += rows[k] * rows[k];
    return sum;
  };
  const flatScore = sharp(0);
  let best = 0, bestScore = flatScore;
  for (let a = -limit; a <= limit; a += 0.5) { const v = sharp(a); if (v > bestScore) { bestScore = v; best = a; } }
  const centre = best;
  for (let a = centre - 0.4; a <= centre + 0.41; a += 0.1) { const v = sharp(a); if (v > bestScore) { bestScore = v; best = a; } }
  if (Math.abs(best) < 0.3 || bestScore < flatScore * 1.03) return 0;
  return Math.round(best * 10) / 10;
}

/**
 * gray: Uint8ClampedArray or Uint8Array of w*h values.
 * Returns { gray, inverted, lines, dots, letter }:
 *   gray      the cleaned picture, dark text on white
 *   inverted  true if the picture was light text on a dark page
 *   lines     pixels removed as ruled lines
 *   dots      dots and dashes removed as leaders or broken lines
 *   letter    the usual height of a small letter, in pixels (0 if no text was found)
 */
export function cleanPage(input, w, h) {
  const n = w * h;
  const { flat, ink, inverted } = inkOf(input, w, h);

  // 3. Blobs of ink, and the usual height of a small letter.
  const { label, boxes } = blobs(ink, w, h);
  const heights = [];
  for (let id = 1; id < boxes.length; id++) {
    const b = boxes[id];
    if (b.h >= 6 && b.h <= h / 6 && b.w <= w / 3 && b.area >= 8) heights.push(b.h);
  }
  if (heights.length < 5) return { gray: flat, inverted, lines: 0, dots: 0, letter: 0 };
  const letter = median(heights);

  const gone = new Uint8Array(n);
  let lines = 0, dots = 0;

  // 4. Ruled lines of a table, across and down, even when the photo makes them slope.
  const long = Math.max(12, Math.round(letter * 3)), clear = Math.max(3, Math.round(letter * 0.35));
  //    Lines across have been turned level already; lines down can lean more, because a photo taken
  //    at an angle squeezes the far end of the page.
  const across = rules(ink, w, h, long, clear, 0.8, [-4, -2, 0, 2, 4]);
  const side = rules(flip(ink, w, h), h, w, long, clear, 0.4, [-8, -6, -4, -2, 0, 2, 4, 6, 8]);
  const down = { on: flip(side.on, h, w), rub: flip(side.rub, h, w) };
  for (let i = 0; i < n; i++) {
    if (across.rub[i] || down.rub[i] || (across.on[i] && down.on[i])) { gone[i] = 1; lines++; }   // the last case: where two lines cross
  }

  //    Thick lines and borders: a table's grid is one huge blob, and a letter is never long and straight.
  //    Inside huge blobs only, rub out every straight run longer than three letters.
  const huge = new Uint8Array(boxes.length);
  let anyHuge = false;
  for (let id = 1; id < boxes.length; id++) {
    const b = boxes[id];
    if (b.w > letter * 8 || b.h > letter * 4) { huge[id] = 1; anyHuge = true; }
  }
  if (anyHuge) {
    for (let y = 0; y < h; y++) {                               // runs along a row
      let run = 0;
      for (let x = 0; x <= w; x++) {
        if (x < w && huge[label[y * w + x]]) { run++; continue; }
        if (run >= long) for (let k = x - run; k < x; k++) { if (!gone[y * w + k]) lines++; gone[y * w + k] = 1; }
        run = 0;
      }
    }
    for (let x = 0; x < w; x++) {                               // runs down a column
      let run = 0;
      for (let y = 0; y <= h; y++) {
        if (y < h && huge[label[y * w + x]]) { run++; continue; }
        if (run >= long) for (let k = y - run; k < y; k++) { if (!gone[k * w + x]) lines++; gone[k * w + x] = 1; }
        run = 0;
      }
    }
  }

  // 5. Dot leaders and broken lines: four or more small dots or dashes in a row.
  //    (The dot of an "i" has its stem under it, so words keep their dots. One hyphen is never four in a row.)
  const small = letter * 0.5, low = Math.max(2, letter * 0.3), reach = Math.max(2, Math.round(letter * 0.8));
  const cand = [];
  for (let id = 1; id < boxes.length && cand.length < 20000; id++) {
    const b = boxes[id];
    if (b.area < 2) continue;
    const dot = b.w <= small && b.h <= small, dash = b.h <= low && b.w > b.h && b.w <= letter * 4;
    if (!dot && !dash) continue;
    let under = false;
    if (dot && !dash) {
      for (let y = b.y1 + 1; y <= Math.min(h - 1, b.y1 + reach) && !under; y++) {
        for (let x = b.x0; x <= b.x1; x++) if (ink[y * w + x]) { under = true; break; }
      }
    }
    if (!under) cand.push({ id, x0: b.x0, x1: b.x1, cy: (b.y0 + b.y1) / 2, next: -1, first: true });
  }
  cand.sort((a, b) => a.x0 - b.x0);
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length && cand[j].x0 - cand[i].x1 <= letter * 2.5; j++) {
      if (cand[j].first && cand[j].x0 > cand[i].x1 && Math.abs(cand[j].cy - cand[i].cy) <= letter * 0.35) { cand[i].next = j; cand[j].first = false; break; }
    }
  }
  const leader = new Uint8Array(boxes.length);
  for (let i = 0; i < cand.length; i++) {
    if (!cand[i].first) continue;
    const chain = [];
    for (let j = i; j !== -1; j = cand[j].next) chain.push(j);
    if (chain.length >= 4) for (const j of chain) { leader[cand[j].id] = 1; dots++; }
  }
  if (dots) for (let i = 0; i < n; i++) if (leader[label[i]]) gone[i] = 1;

  // 6. Specks. A blob of one or two pixels is grain. So is a small dot with no letter near it:
  //    a full stop, a comma or the dot of an "i" always has a letter beside it.
  const cell = Math.max(4, Math.round(letter)), cw = Math.ceil(w / cell), chh = Math.ceil(h / cell);
  const lettered = new Uint8Array(cw * chh);
  for (let id = 1; id < boxes.length; id++) {
    const b = boxes[id];
    if (b.h < letter * 0.6 || huge[id]) continue;
    for (let cy = Math.floor(b.y0 / cell); cy <= Math.floor(b.y1 / cell); cy++) {
      for (let cx = Math.floor(b.x0 / cell); cx <= Math.floor(b.x1 / cell); cx++) lettered[cy * cw + cx] = 1;
    }
  }
  const speck = new Uint8Array(boxes.length);
  for (let id = 1; id < boxes.length; id++) {
    const b = boxes[id];
    if (b.area <= 2) { speck[id] = 1; continue; }
    if (b.w > small || b.h > small) continue;
    const cx = Math.floor((b.x0 + b.x1) / 2 / cell), cy = Math.floor((b.y0 + b.y1) / 2 / cell);
    let friend = false;
    for (let dy = -1; dy <= 1 && !friend; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = cy + dy, xx = cx + dx;
      if (yy >= 0 && yy < chh && xx >= 0 && xx < cw && lettered[yy * cw + xx]) { friend = true; break; }
    }
    if (!friend) speck[id] = 1;
  }
  for (let i = 0; i < n; i++) if (speck[label[i]]) gone[i] = 1;

  // 7. The clean page: white paper, and only the ink that is left, with its soft edge.
  const out = new Uint8ClampedArray(n).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!ink[i] || gone[i]) continue;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= w) continue;
        const q = yy * w + xx;
        if (!gone[q]) out[q] = flat[q];
      }
    }
  }
  return { gray: out, inverted, lines, dots, letter };
}

/** Red, green, blue, alpha in; one grey value per pixel out. */
export function toGray(rgba, w, h) {
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return g;
}
