// Triage engine. Plain arithmetic: no screen, no storage, no clock, no AI.
//
// The idea in one sentence:
//   every 25 minutes goes to whichever chapter gives the most marks right now.
//
// The model behind it:
//   Each chapter has a weight in marks, a size, and a "mastery" between 0 and 1
//   (the share of that chapter's marks you would get if the exam were now).
//   Studying moves mastery toward a ceiling, quickly at first and slowly later:
//
//       mastery after t minutes = CEIL - (CEIL - mastery now) * e^(-t / tau)
//
//   tau is roughly "the time it takes to learn two-thirds of what you are missing".
//   Expected marks = sum over chapters of (marks * mastery).

export const CEIL = 0.95;      // nobody gets 100% of a chapter from one night of study
export const BLOCK = 25;       // minutes in one study block
export const BREAK = 5;        // minutes after each block (the closed-book check happens here)
export const ENOUGH_PCT = 1;   // stop when the next block adds less than this % of the paper

// "If a question from this chapter came right now?"
export const KNOW = { blank: 0.05, bits: 0.30, most: 0.60, easy: 0.85 };
export const KNOW_ORDER = ['blank', 'bits', 'most', 'easy'];

// How long the chapter is: Small, Medium, Large.
export const TAU = { S: 30, M: 60, L: 90 };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sum = (list, f) => list.reduce((a, x, i) => a + f(x, i), 0);

/** Mastery after studying `minutes` more, starting from mastery `m`. */
export function masteryAfter(m, tau, minutes) {
  if (m >= CEIL) return m;
  return CEIL - (CEIL - m) * Math.exp(-minutes / tau);
}

/** A chapter's mastery right now: its live value if it has one, else from the student's answer. */
export function masteryNow(ch) {
  const m = typeof ch.m === 'number' && isFinite(ch.m) ? ch.m : (KNOW[ch.know] ?? KNOW.bits);
  return clamp(m, 0, 1);
}

/** A chapter's time constant right now. */
export function tauNow(ch) {
  const t = typeof ch.tau === 'number' && isFinite(ch.tau) && ch.tau > 0 ? ch.tau : (TAU[ch.size] ?? TAU.M);
  return clamp(t, 5, 600);
}

/**
 * Give every chapter a marks value.
 * If none have marks, the paper's total is split equally.
 * If only some have marks, the others get the average of those that do.
 */
export function fillMarks(chapters, total = 100) {
  const ok = (c) => typeof c.marks === 'number' && isFinite(c.marks) && c.marks > 0;
  const known = chapters.filter(ok);
  let fallback;
  if (known.length === 0) fallback = chapters.length ? (total > 0 ? total : 100) / chapters.length : 0;
  else fallback = sum(known, (c) => c.marks) / known.length;
  return chapters.map((c) => ({ ...c, marks: ok(c) ? c.marks : fallback }));
}

// Internal working copy of the chapters.
function work(chapters) {
  return chapters.map((c, i) => {
    const m0 = masteryNow(c);
    return {
      i, id: c.id ?? String(i), name: c.name ?? `Chapter ${i + 1}`,
      w: typeof c.marks === 'number' && c.marks > 0 ? c.marks : 0,
      tau: tauNow(c), m0, m: m0, blocks: 0,
      pin: Math.max(0, Math.floor(c.pin || 0)),   // blocks the student insists on
      drop: !!c.drop,                             // "not in my exam"
    };
  });
}

const gainOf = (r, minutes) => r.w * (masteryAfter(r.m, r.tau, minutes) - r.m);

/**
 * The plan.
 *
 * chapters: [{ id, name, marks, size, know, m?, tau?, pin?, drop? }]
 * blocks:   how many 25-minute blocks the student has
 * opts:     { enoughPct } - pass 0 to switch the Enough line off
 */
export function plan(chapters, blocks, opts = {}) {
  const block = opts.block ?? BLOCK;
  const rows = work(chapters);
  const total = sum(rows, (r) => r.w);
  const before = sum(rows, (r) => r.w * r.m0);
  const enough = total * (opts.enoughPct ?? ENOUGH_PCT) / 100;
  const given = Math.max(0, Math.floor(blocks || 0));

  let left = given;
  const steps = [];        // every block handed out, in order: { id, gain, pinned }
  const unmetPins = [];    // pins that did not fit in the time

  // 1. Pinned blocks first, in the order the chapters are listed.
  for (const r of rows) {
    for (let k = 0; k < r.pin; k++) {
      if (left <= 0) { if (!unmetPins.includes(r.id)) unmetPins.push(r.id); break; }
      steps.push({ id: r.id, gain: gainOf(r, block), pinned: true });
      r.m = masteryAfter(r.m, r.tau, block); r.blocks++; left--;
    }
  }

  // 2. Every other block goes to the chapter where it earns the most marks right now.
  let stop = 'time';       // why we stopped: 'time' | 'enough' | 'nothing'
  let next = null;         // the best block we did NOT take: { id, name, gain }
  while (true) {
    let best = null, bestGain = 0;
    for (const r of rows) {
      if (r.drop) continue;
      const g = gainOf(r, block);
      if (g > bestGain + 1e-12) { bestGain = g; best = r; }
    }
    if (!best) { stop = 'nothing'; break; }                    // nothing left to gain anywhere
    next = { id: best.id, name: best.name, gain: bestGain };
    if (left <= 0) { stop = 'time'; break; }
    if (bestGain < enough) { stop = 'enough'; break; }         // 3. the Enough line
    steps.push({ id: best.id, gain: bestGain, pinned: false });
    best.m = masteryAfter(best.m, best.tau, block); best.blocks++; left--;
    next = null;
  }

  // The lowest-value block we did take (pins aside). Used to show the price of a skip.
  let weakest = null;
  for (const s of steps) if (!s.pinned && (!weakest || s.gain < weakest.gain)) weakest = s;
  const nameOf = (id) => rows.find((r) => r.id === id)?.name ?? '';

  // 4. Study order: best marks per minute first, each chapter's blocks kept together.
  const tonight = rows.filter((r) => r.blocks > 0).map((r) => {
    const minutes = r.blocks * block, marks = r.w * (r.m - r.m0);
    return { id: r.id, name: r.name, w: r.w, blocks: r.blocks, minutes, from: r.m0, to: r.m, marks,
      perHour: marks / minutes * 60, pinned: r.pin > 0, i: r.i };
  }).sort((a, b) => (b.perHour - a.perHour) || (a.i - b.i));

  const skip = rows.filter((r) => r.blocks === 0).map((r) => {
    const first = r.w * (masteryAfter(r.m0, r.tau, block) - r.m0);
    return { id: r.id, name: r.name, w: r.w, m: r.m0, tau: r.tau, dropped: r.drop,
      firstBlock: r.drop ? 0 : first,                 // what 25 minutes here would add
      left: r.w * Math.max(0, CEIL - r.m0),           // marks still on the table in this chapter
      trade: !r.drop && weakest ? { id: weakest.id, name: nameOf(weakest.id), gain: weakest.gain } : null };
  });

  const split = {};
  for (const r of rows) split[r.id] = r.blocks;
  const used = given - left;

  return { total, before, after: sum(rows, (r) => r.w * r.m), block, enough,
    blocksGiven: given, blocksUsed: used, blocksSpare: left,
    stop, next, tonight, skip, steps, split, unmetPins };
}

/**
 * What most students do: start at chapter 1, do each chapter "properly"
 * (twice its tau), move to the next, until the time runs out.
 */
export function bookOrder(chapters, minutes) {
  const rows = work(chapters);
  let left = Math.max(0, minutes);
  for (const r of rows) {
    if (left <= 0) break;
    if (r.drop) continue;
    const t = Math.min(left, 2 * r.tau);
    r.m = masteryAfter(r.m, r.tau, t); left -= t;
  }
  return sum(rows, (r) => r.w * r.m);
}

/** Forecast for any hand-made split: { chapterId: blocks }. Used by "Beat the plan". */
export function score(chapters, split, block = BLOCK) {
  return sum(work(chapters), (r) => r.w * masteryAfter(r.m0, r.tau, (split[r.id] || 0) * block));
}

// n choose k, without overflow for the sizes we care about.
function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 1; i <= k; i++) { c = c * (n - k + i) / i; if (c > 1e15) return Infinity; }
  return Math.round(c);
}

/**
 * "Is there a better way to split the same time?"
 * Tries every split when the exam is small enough, otherwise many random ones.
 * Pins and drops are respected. Returns how many splits scored higher (should be 0).
 */
export function verify(chapters, split, opts = {}) {
  const block = opts.block ?? BLOCK, cap = opts.cap ?? 200000, tries = opts.tries ?? 20000;
  const rnd = opts.rnd ?? Math.random;
  const rows = work(chapters);
  const used = sum(rows, (r) => split[r.id] || 0);
  const target = score(chapters, split, block);
  const pins = rows.map((r) => Math.min(r.pin, split[r.id] || 0));
  const free = used - sum(pins, (p) => p);                 // blocks we are allowed to move
  const open = rows.map((r, i) => (r.drop ? -1 : i)).filter((i) => i >= 0);
  const at = (i, k) => rows[i].w * masteryAfter(rows[i].m0, rows[i].tau, k * block);
  const fixed = sum(rows.filter((r) => r.drop), (r) => at(r.i, pins[r.i]));
  const eps = 1e-9;
  let tried = 0, better = 0, best = target;

  if (open.length === 0 || free <= 0) return { tried: 1, better: 0, exhaustive: true, best: target, target };

  const combos = choose(free + open.length - 1, open.length - 1);
  if (combos <= cap) {
    const rec = (j, left, acc) => {
      const i = open[j];
      if (j === open.length - 1) {
        const s = acc + at(i, pins[i] + left);
        tried++; if (s > target + eps) better++; if (s > best) best = s;
        return;
      }
      for (let k = 0; k <= left; k++) rec(j + 1, left - k, acc + at(i, pins[i] + k));
    };
    rec(0, free, fixed);
    return { tried, better, exhaustive: true, best, target };
  }

  for (let t = 0; t < tries; t++) {
    const extra = new Array(rows.length).fill(0);
    for (let b = 0; b < free; b++) extra[open[Math.floor(rnd() * open.length)]]++;
    let s = fixed;
    for (const i of open) s += at(i, pins[i] + extra[i]);
    tried++; if (s > target + eps) better++; if (s > best) best = s;
  }
  return { tried, better, exhaustive: false, best, target };
}

/**
 * "What if I am fooling myself?"
 * Re-plans as if every chapter were known one level worse, and reports how much of the plan stays put.
 */
export function whatIfWrong(chapters, blocks, opts = {}) {
  const base = plan(chapters, blocks, opts);
  const harsher = chapters.map((c) => ({ ...c, m: Math.max(0.02, masteryNow(c) - 0.25) }));
  const other = plan(harsher, blocks, opts);
  const baseMin = sum(base.tonight, (r) => r.minutes);
  let shared = 0;
  for (const r of base.tonight) shared += Math.min(r.blocks, other.split[r.id] || 0) * base.block;
  const moved = [];
  for (const c of work(chapters)) {
    const a = base.split[c.id] || 0, b = other.split[c.id] || 0;
    if (a !== b) moved.push({ id: c.id, name: c.name, from: a * base.block, to: b * base.block });
  }
  return { same: baseMin > 0 ? shared / baseMin : 1, moved, base, other };
}

/**
 * After a block the student closes the book and recalls. Their answer corrects the model.
 * recalled: 'nothing' | 'some' | 'most' | 'all'
 */
export const RECALL = {
  nothing: { counts: 0.2, tau: 1.5 },    // little went in, and this chapter is slower than we thought
  some:    { counts: 0.6, tau: 1.2 },
  most:    { counts: 1.0, tau: 1.0 },    // as predicted
  all:     { counts: 1.15, tau: 0.85 },  // better than predicted, and faster
};
export function checkIn(ch, minutes, recalled) {
  const r = RECALL[recalled] ?? RECALL.most;
  const m = masteryNow(ch), tau = tauNow(ch);
  const predicted = masteryAfter(m, tau, minutes);
  return { m: clamp(m + (predicted - m) * r.counts, 0, CEIL), tau: clamp(tau * r.tau, 5, 600) };
}

/**
 * A rough range around a forecast, because the inputs are the student's own answers.
 * Low:  every chapter starts 0.15 lower and learns 30% slower.
 * High: every chapter starts 0.05 higher and learns 15% faster.
 */
export function range(chapters, split, block = BLOCK) {
  const shifted = (dm, k) => chapters.map((c) => ({ ...c, m: clamp(masteryNow(c) + dm, 0.02, CEIL), tau: tauNow(c) * k }));
  return { low: score(shifted(-0.15, 1.3), split, block), high: score(shifted(0.05, 0.85), split, block) };
}

/**
 * Share whole squares out so they add up to a target (largest remainder method).
 * values: exact amounts, caps: the most each may get.
 */
export function apportion(values, target, caps) {
  const out = values.map((v, i) => Math.min(Math.floor(v + 1e-9), caps ? caps[i] : Infinity));
  let need = Math.round(target) - sum(out, (x) => x);
  const order = values.map((v, i) => ({ i, frac: v - Math.floor(v + 1e-9) })).sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for (let pass = 0; pass < 3 && need > 0; pass++) {
    for (const o of order) {
      if (need <= 0) break;
      if (!caps || out[o.i] < caps[o.i]) { out[o.i]++; need--; }
    }
  }
  return out;
}

/**
 * The Marks Map: every square is one mark (or a few, on a big paper).
 * Returns, per chapter, how many squares it has, how many are already won,
 * and how many tonight's plan wins.
 */
export function squares(chapters, result) {
  const rows = work(chapters);
  const total = sum(rows, (r) => r.w);
  const unit = total <= 100 ? 1 : Math.ceil(total / 100);
  const n = apportion(rows.map((r) => r.w / unit), total / unit).map((x, i) => (rows[i].w > 0 ? Math.max(1, x) : 0));
  const after = rows.map((r) => masteryAfter(r.m0, r.tau, (result?.split?.[r.id] || 0) * (result?.block ?? BLOCK)));
  const have = apportion(rows.map((r) => r.w * r.m0 / unit), sum(rows, (r) => r.w * r.m0) / unit, n);
  const end = apportion(rows.map((r, i) => r.w * after[i] / unit), sum(rows, (r, i) => r.w * after[i]) / unit, n);
  return {
    unit,
    rows: rows.map((r, i) => {
      const win = Math.max(0, end[i] - have[i]);
      return { id: r.id, name: r.name, marks: r.w, n: n[i], have: have[i], win, later: Math.max(0, n[i] - have[i] - win) };
    }),
  };
}
