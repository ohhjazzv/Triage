import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plan, bookOrder, score, verify, whatIfWrong, checkIn, range, squares, apportion, fillMarks,
  masteryAfter, masteryNow, tauNow, CEIL, BLOCK, KNOW, TAU,
} from '../js/engine.js';

// A small repeatable random number generator, so failures can be reproduced.
function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
const SIZES = ['S', 'M', 'L'], LEVELS = ['blank', 'bits', 'most', 'easy'];
function randomExam(rnd, min, max, extras = false) {
  const n = min + Math.floor(rnd() * (max - min + 1));
  return Array.from({ length: n }, (_, i) => ({
    id: 'c' + i, name: 'Chapter ' + (i + 1), marks: 2 + Math.floor(rnd() * 14),
    size: SIZES[Math.floor(rnd() * 3)], know: LEVELS[Math.floor(rnd() * 4)],
    pin: extras && rnd() < 0.15 ? 1 : 0, drop: extras && rnd() < 0.1,
  }));
}

// Every possible split of the blocks, respecting pins and drops.
function bruteBest(chapters, blocks) {
  let best = -1;
  const rec = (i, left, acc) => {
    if (i === chapters.length) { if (acc > best) best = acc; return; }
    const c = chapters[i], pin = c.pin || 0;
    if (left < pin) return;
    const hi = c.drop ? pin : left;
    for (let k = pin; k <= hi; k++) rec(i + 1, left - k, acc + c.marks * masteryAfter(KNOW[c.know], TAU[c.size], k * BLOCK));
  };
  rec(0, blocks, 0);
  return best;
}

const bio = [
  { id: 'cs', name: 'Cell structure', marks: 8, size: 'M', know: 'easy' },
  { id: 'cd', name: 'Cell division', marks: 6, size: 'M', know: 'most' },
  { id: 'ph', name: 'Photosynthesis', marks: 8, size: 'L', know: 'bits' },
  { id: 're', name: 'Respiration', marks: 7, size: 'L', know: 'blank' },
  { id: 'ge', name: 'Genetics', marks: 9, size: 'L', know: 'bits' },
  { id: 'ev', name: 'Evolution', marks: 4, size: 'M', know: 'blank' },
  { id: 'ec', name: 'Ecology', marks: 5, size: 'S', know: 'most' },
  { id: 'hb', name: 'Human body systems', marks: 3, size: 'L', know: 'blank' },
];

test('the sample Biology plan matches the README', () => {
  const p = plan(bio, 8);
  assert.equal(Math.round(p.before), 19);
  assert.equal(Math.round(p.after), 29);
  assert.equal(Math.round(bookOrder(bio, 8 * BLOCK)), 21);
  assert.deepEqual(p.split, { cs: 0, cd: 0, ph: 2, re: 2, ge: 2, ev: 1, ec: 1, hb: 0 });
  assert.deepEqual(p.skip.map((s) => s.id), ['cs', 'cd', 'hb']);
  assert.equal(p.stop, 'time');
});

test('the plan equals the best of every possible plan (500+ random exams, with pins and drops)', () => {
  const rnd = rng(7); let checked = 0, worst = 0;
  for (let t = 0; t < 700; t++) {
    const chs = randomExam(rnd, 3, 6, true), blocks = 1 + Math.floor(rnd() * 9);
    if (chs.reduce((a, c) => a + c.pin, 0) > blocks) continue;
    const p = plan(chs, blocks, { enoughPct: 0 });
    worst = Math.max(worst, Math.abs(bruteBest(chs, blocks) - p.after)); checked++;
  }
  assert.ok(checked >= 500, `only ${checked} exams checked`);
  assert.ok(worst < 1e-9, `gap of ${worst} marks`);
});

test('no random hand-made plan scores higher', () => {
  const rnd = rng(21); let beaten = 0, tries = 0;
  for (let t = 0; t < 200; t++) {
    const chs = randomExam(rnd, 5, 12), blocks = 4 + Math.floor(rnd() * 10);
    const best = plan(chs, blocks, { enoughPct: 0 }).after;
    for (let k = 0; k < 100; k++) {
      const split = {}; for (let b = 0; b < blocks; b++) { const id = chs[Math.floor(rnd() * chs.length)].id; split[id] = (split[id] || 0) + 1; }
      tries++; if (score(chs, split) > best + 1e-9) beaten++;
    }
  }
  assert.equal(beaten, 0, `${beaten} of ${tries} plans beat Triage`);
});

test('verify() finds nothing better, by brute force on small exams and by sampling on big ones', () => {
  const small = plan(bio, 8, { enoughPct: 0 });
  const v1 = verify(bio, small.split);
  assert.equal(v1.exhaustive, true); assert.equal(v1.better, 0); assert.ok(v1.tried > 1000);

  const rnd = rng(3), big = randomExam(rnd, 20, 20), p = plan(big, 20, { enoughPct: 0 });
  const v2 = verify(big, p.split, { rnd });
  assert.equal(v2.exhaustive, false); assert.equal(v2.better, 0); assert.equal(v2.tried, 20000);
});

test('verify() does notice a worse plan', () => {
  const bad = { cs: 8 };                                    // all night on the chapter already known
  const v = verify(bio, bad);
  assert.ok(v.better > 0);
});

test('more time never lowers the forecast', () => {
  const rnd = rng(5);
  for (let t = 0; t < 100; t++) {
    const chs = randomExam(rnd, 3, 10); let prev = -1;
    for (let b = 0; b <= 14; b++) { const a = plan(chs, b, { enoughPct: 0 }).after; assert.ok(a >= prev - 1e-12); prev = a; }
  }
});

test('the Enough line stops the plan and says why', () => {
  const all = plan(bio, 24, { enoughPct: 0 });
  assert.equal(all.blocksUsed, 24); assert.equal(all.stop, 'time');
  const p = plan(bio, 24);                                  // default: 1% of 50 marks = 0.5
  assert.equal(p.stop, 'enough');
  assert.equal(p.blocksUsed, 19);
  assert.equal(p.blocksSpare, 5);
  assert.ok(p.next.gain < 0.5 && p.next.gain > 0);
  assert.ok(p.steps.every((s) => s.gain >= 0.5));
});

test('pins are respected and their price is visible', () => {
  const pinned = bio.map((c) => (c.id === 'hb' ? { ...c, pin: 2 } : c));
  const p = plan(pinned, 8), free = plan(bio, 8);
  assert.equal(p.split.hb, 2);
  assert.ok(p.tonight.find((r) => r.id === 'hb').pinned);
  assert.ok(free.after - p.after > 0.5 && free.after - p.after < 1.2);
});

test('pins that do not fit are reported, in order, without crashing', () => {
  const chs = bio.map((c, i) => ({ ...c, pin: i < 3 ? 2 : 0 }));
  const p = plan(chs, 3);
  assert.equal(p.blocksUsed, 3);
  assert.deepEqual([p.split.cs, p.split.cd, p.split.ph], [2, 1, 0]);
  assert.deepEqual(p.unmetPins, ['cd', 'ph']);
});

test('dropped chapters never get time', () => {
  const chs = bio.map((c) => (c.id === 're' ? { ...c, drop: true } : c));
  const p = plan(chs, 12, { enoughPct: 0 });
  assert.equal(p.split.re, 0);
  assert.ok(p.skip.find((s) => s.id === 're').dropped);
});

test('edge cases', () => {
  // zero time
  let p = plan(bio, 0);
  assert.equal(p.tonight.length, 0); assert.equal(p.after, p.before); assert.equal(p.stop, 'time');
  // negative or silly time
  assert.equal(plan(bio, -3).blocksUsed, 0);
  assert.equal(plan(bio, NaN).blocksUsed, 0);
  // one chapter
  p = plan([bio[3]], 4, { enoughPct: 0 });
  assert.equal(p.tonight.length, 1); assert.equal(p.tonight[0].blocks, 4);
  // every chapter already Easy: the Enough line should cut in early
  p = plan(bio.map((c) => ({ ...c, know: 'easy' })), 20);
  assert.equal(p.stop, 'enough'); assert.ok(p.blocksUsed < 20);
  // every chapter dropped
  p = plan(bio.map((c) => ({ ...c, drop: true })), 6);
  assert.equal(p.blocksUsed, 0); assert.equal(p.stop, 'nothing');
  // no chapters
  p = plan([], 6);
  assert.equal(p.total, 0); assert.equal(p.tonight.length, 0);
  // already at the ceiling
  p = plan([{ id: 'a', name: 'A', marks: 10, size: 'M', m: CEIL }], 3);
  assert.equal(p.blocksUsed, 0); assert.equal(p.stop, 'nothing');
});

test('study order is best marks-per-minute first', () => {
  const p = plan(bio, 8);
  for (let i = 1; i < p.tonight.length; i++) assert.ok(p.tonight[i - 1].perHour >= p.tonight[i].perHour - 1e-12);
});

test('every skipped chapter is worth less than the weakest block in the plan', () => {
  const rnd = rng(9);
  for (let t = 0; t < 200; t++) {
    const chs = randomExam(rnd, 4, 10), p = plan(chs, 1 + Math.floor(rnd() * 8), { enoughPct: 0 });
    for (const s of p.skip) if (s.trade) assert.ok(s.firstBlock <= s.trade.gain + 1e-9);
  }
});

test('fillMarks: equal split when nothing is given, average when some are given', () => {
  const none = fillMarks([{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }], 80);
  assert.deepEqual(none.map((c) => c.marks), [20, 20, 20, 20]);
  const some = fillMarks([{ name: 'a', marks: 10 }, { name: 'b' }, { name: 'c', marks: 6 }], 80);
  assert.deepEqual(some.map((c) => c.marks), [10, 8, 6]);
  assert.equal(fillMarks([], 80).length, 0);
});

test('closed-book check: the four answers', () => {
  const ch = { marks: 10, size: 'M', know: 'blank' };
  const predicted = masteryAfter(0.05, 60, 25);
  const got = (a) => checkIn(ch, 25, a);
  assert.ok(Math.abs(got('most').m - predicted) < 1e-12); assert.equal(got('most').tau, 60);
  assert.ok(Math.abs(got('nothing').m - (0.05 + (predicted - 0.05) * 0.2)) < 1e-12); assert.equal(got('nothing').tau, 90);
  assert.ok(Math.abs(got('some').m - (0.05 + (predicted - 0.05) * 0.6)) < 1e-12); assert.equal(got('some').tau, 72);
  assert.ok(got('all').m > predicted); assert.equal(got('all').tau, 51);
  // never above the ceiling, and a live mastery value is used when present
  assert.ok(checkIn({ marks: 5, size: 'S', m: 0.94 }, 100, 'all').m <= CEIL);
  assert.ok(got('nothing').m < got('some').m && got('some').m < got('most').m && got('most').m < got('all').m);
});

test('forecast range: low is below the forecast, high is above', () => {
  const rnd = rng(13);
  for (let t = 0; t < 100; t++) {
    const chs = randomExam(rnd, 3, 10), p = plan(chs, 1 + Math.floor(rnd() * 10));
    const r = range(chs, p.split);
    assert.ok(r.low <= p.after + 1e-9 && r.high >= p.after - 1e-9);
    assert.ok(r.high <= p.total + 1e-9 && r.low >= 0);
  }
});

test('"what if I am fooling myself": most of the plan stays put', () => {
  const w = whatIfWrong(bio, 8);
  assert.ok(w.same >= 0 && w.same <= 1);
  assert.ok(w.same >= 0.6, `only ${(w.same * 100).toFixed(0)}% of the plan held`);
  assert.equal(whatIfWrong(bio, 0).same, 1);
});

test('Marks Map: squares add up and never overlap', () => {
  const p = plan(bio, 8), sq = squares(bio, p);
  assert.equal(sq.unit, 1);
  assert.equal(sq.rows.reduce((a, r) => a + r.n, 0), 50);
  assert.equal(sq.rows.reduce((a, r) => a + r.have, 0), 19);
  assert.equal(sq.rows.reduce((a, r) => a + r.win, 0), 10);
  for (const r of sq.rows) { assert.equal(r.have + r.win + r.later, r.n); assert.ok(r.have >= 0 && r.win >= 0 && r.later >= 0); }
  // a chapter with no time gets no "tonight" squares
  assert.equal(sq.rows.find((r) => r.id === 'cs').win, 0);
});

test('Marks Map: a big paper scales, fractional marks still add up', () => {
  const big = bio.map((c) => ({ ...c, marks: c.marks * 5 }));        // 250 marks
  const sq = squares(big, plan(big, 8));
  assert.equal(sq.unit, 3);
  assert.ok(sq.rows.reduce((a, r) => a + r.n, 0) <= 100);
  const thirds = fillMarks([{ id: 'a', name: 'a', know: 'bits' }, { id: 'b', name: 'b', know: 'bits' }, { id: 'c', name: 'c', know: 'bits' }], 20);
  const s2 = squares(thirds, plan(thirds, 2));
  assert.equal(s2.rows.reduce((a, r) => a + r.n, 0), 20);
  const rnd = rng(17);
  for (let t = 0; t < 200; t++) {
    const chs = randomExam(rnd, 1, 14), s = squares(chs, plan(chs, Math.floor(rnd() * 12)));
    for (const r of s.rows) assert.equal(r.have + r.win + r.later, r.n);
  }
});

test('apportion: whole numbers that add up to the target', () => {
  assert.deepEqual(apportion([6.67, 6.67, 6.66], 20), [7, 7, 6]);
  assert.deepEqual(apportion([1.2, 1.2, 1.2], 4, [1, 2, 2]), [1, 2, 1]);
  assert.deepEqual(apportion([], 0), []);
});

test('helpers fall back to safe values', () => {
  assert.equal(masteryNow({}), KNOW.bits);
  assert.equal(masteryNow({ m: 7 }), 1);
  assert.equal(tauNow({}), TAU.M);
  assert.equal(tauNow({ tau: -4, size: 'L' }), TAU.L);
  assert.equal(masteryAfter(0.99, 60, 100), 0.99);
});
