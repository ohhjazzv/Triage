// Triage engine, prototype v2. Pure functions, no DOM.
//
// Model: each chapter has marks weight w, a time constant tau (minutes), and mastery m in [0,1].
// Studying t minutes moves mastery toward a ceiling:  m(t) = CEIL - (CEIL - m0) * exp(-t / tau)
// tau is roughly "the time it takes to learn two-thirds of what you are missing".
// Expected marks = sum(w * m). Time is handed out in equal blocks to whichever chapter gains most.

const CEIL = 0.95;                                    // nobody gets 100% of a chapter from one night
const KNOW = { blank: 0.05, bits: 0.30, most: 0.60, easy: 0.85 };   // "if a question came right now?"
const TAU = { S: 30, M: 60, L: 90 };                  // minutes
const BLOCK = 25;

const gain = (c, min) => c.w * (CEIL - c.m) * (1 - Math.exp(-min / c.tau));
const after = (c, min) => CEIL - (CEIL - c.m) * Math.exp(-min / c.tau);
const expected = (chs) => chs.reduce((a, c) => a + c.w * c.m, 0);

function prep(chapters, pace = 1) {
  return chapters.map((c) => {
    const m0 = typeof c.m === 'number' ? c.m : KNOW[c.know];
    return { name: c.name, w: c.w, tau: (c.tau || TAU[c.size || 'M']) * pace, m: m0, m0, blocks: 0,
      pin: c.pin || 0,          // blocks the student insists on ("teacher said this is coming")
      drop: !!c.drop };         // student says this chapter is not in the exam for them
  });
}

// opts.enough: stop when the best next block adds fewer marks than this (the "enough line"). 0 = use all time.
function triage(chapters, studyMinutes, opts = {}) {
  const block = opts.block || BLOCK, enough = opts.enough || 0;
  const chs = prep(chapters, opts.pace || 1);
  let n = Math.floor(studyMinutes / block);
  const curve = [];                                   // marks added by each block, in the order they were handed out
  for (const c of chs) {                              // pinned blocks first
    for (let k = 0; k < c.pin && n > 0; k++, n--) { curve.push(gain(c, block)); c.m = after(c, block); c.blocks++; }
  }
  let stoppedEarly = false;
  for (; n > 0; n--) {
    let best = null, bg = 0;
    for (const c of chs) { if (c.drop) continue; const g = gain(c, block); if (g > bg + 1e-12) { bg = g; best = c; } }
    if (!best) break;
    if (bg < enough) { stoppedEarly = true; break; }
    curve.push(bg); best.m = after(best, block); best.blocks++;
  }
  const total = chs.reduce((a, c) => a + c.w, 0);
  const before = chs.reduce((a, c) => a + c.w * c.m0, 0);
  const plan = chs.filter((c) => c.blocks > 0)
    .map((c) => ({ name: c.name, minutes: c.blocks * block, from: c.m0, to: c.m, marks: c.w * (c.m - c.m0), pinned: c.pin > 0 }))
    .sort((a, b) => b.marks / b.minutes - a.marks / a.minutes);      // best marks-per-minute first
  const skip = chs.filter((c) => c.blocks === 0)
    .map((c) => ({ name: c.name, dropped: c.drop, left: c.w * (CEIL - c.m0), firstBlock: c.w * (CEIL - c.m0) * (1 - Math.exp(-block / c.tau)) }));
  const used = plan.reduce((a, p) => a + p.minutes, 0);
  return { before, after: expected(chs), total, plan, skip, used, spare: Math.floor(studyMinutes / block) * block - used, stoppedEarly, curve };
}

// What most students do: start at chapter 1, do each chapter "properly" (2 x tau), move on until time runs out.
function bookOrder(chapters, studyMinutes, pace = 1) {
  const chs = prep(chapters, pace); let left = studyMinutes;
  for (const c of chs) { if (left <= 0) break; if (c.drop) continue; const t = Math.min(left, 2 * c.tau); c.m = after(c, t); left -= t; }
  return expected(chs);
}

// Any hand-made split of blocks -> forecast. Used by "Beat the plan".
function score(chapters, blocksPerChapter, block = BLOCK) {
  const chs = prep(chapters);
  return chs.reduce((a, c, i) => a + c.w * after(c, (blocksPerChapter[i] || 0) * block), 0);
}

// Every possible split (respecting pins and drops), to check the block-by-block method is the best one.
function brute(chapters, studyMinutes, block = BLOCK) {
  const base = prep(chapters); const n = Math.floor(studyMinutes / block); let best = -1;
  const rec = (i, left, acc) => {
    if (i === base.length) { if (acc > best) best = acc; return; }
    const c = base[i];
    if (left < c.pin) return;                         // this split breaks a pin, so it does not count
    const lo = c.pin, hi = c.drop ? lo : left;
    for (let k = lo; k <= hi; k++) rec(i + 1, left - k, acc + c.w * after(c, k * block));
  };
  rec(0, n, 0); return best;
}

// After a block the student closes the book and recalls. That answer corrects the model.
// recalled: 'nothing' | 'some' | 'most' | 'all'
function checkIn(ch, minutes, recalled) {
  const f = { nothing: 0.2, some: 0.6, most: 1.0, all: 1.15 }[recalled];
  const paceFix = { nothing: 1.5, some: 1.2, most: 1.0, all: 0.85 }[recalled];
  const predicted = after(ch, minutes);
  return { m: Math.min(CEIL, ch.m + (predicted - ch.m) * f), tau: ch.tau * paceFix };
}

// Sleep wall. Bedtime can move, but sleep before wake-up never drops below FLOOR hours.
function latestBedtime(wakeMinutes, floorHours = 6) { return ((wakeMinutes - floorHours * 60) % 1440 + 1440) % 1440; }

module.exports = { triage, bookOrder, brute, score, checkIn, latestBedtime, prep, KNOW, TAU, CEIL, BLOCK };
