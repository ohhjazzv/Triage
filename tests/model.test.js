import { test } from 'node:test';
import assert from 'node:assert/strict';
import { picture, planChange, pinPrice, sleepTrade, currentBlock } from '../js/model.js';
import { cleanExam } from '../js/store.js';
import { biologySample } from '../js/samples.js';
import { atDay, toMinutes } from '../js/time.js';

// The sample exam, seen from its own clock: 5:50 PM on the evening before.
function sample() {
  const real = new Date(2026, 9, 4, 11, 23, 0);
  const exam = cleanExam(biologySample(real));
  return { exam, now: new Date(real.getTime() + exam.clockOffset) };
}

test('the sample exam always opens on the same plan, whatever the real time is', () => {
  for (const [h, m] of [[0, 5], [7, 30], [11, 23], [17, 49], [18, 0], [23, 59]]) {
    const real = new Date(2026, 9, 4, h, m, 0), exam = cleanExam(biologySample(real));
    const pic = picture(exam, new Date(real.getTime() + exam.clockOffset));
    assert.equal(pic.blocks, 8, `opened at ${h}:${m}`);
    assert.deepEqual(pic.p.tonight.map((r) => r.name), ['Respiration', 'Genetics', 'Evolution', 'Photosynthesis', 'Ecology']);
    assert.deepEqual([pic.forecasts.stopNow, pic.forecasts.book, pic.forecasts.withPlan].map((f) => Math.round(f.mid)), [19, 21, 29]);
  }
});

test('the sample keeps its 8 blocks for a quarter of an hour after opening', () => {
  const { exam, now } = sample();
  assert.equal(picture(exam, new Date(now.getTime() + 14 * 60000)).blocks, 8);
  assert.equal(picture(exam, new Date(now.getTime() + 16 * 60000)).blocks, 7);
});

test('forecast ranges bracket their middle, and the plan beats book order', () => {
  const { exam, now } = sample(), f = picture(exam, now).forecasts;
  for (const x of [f.stopNow, f.book, f.withPlan]) assert.ok(x.low <= x.mid && x.mid <= x.high);
  assert.ok(f.withPlan.mid > f.book.mid && f.book.mid > f.stopNow.mid);
});

test('the timeline never passes bedtime and never overlaps', () => {
  const { exam, now } = sample(), pic = picture(exam, now);
  const slots = pic.tl.flatMap((t) => t.slots);
  assert.equal(slots.length, 8);
  for (let i = 0; i < slots.length; i++) {
    assert.ok(slots[i].end <= pic.wall, 'a block ends after bedtime');
    if (i) assert.ok(slots[i].start >= slots[i - 1].end);
  }
  assert.equal(pic.wall.getHours(), 22);
});

test('while a block is running, the plan covers the time after it', () => {
  const { exam, now } = sample();
  const re = exam.chapters.find((c) => c.name === 'Respiration');
  exam.current = { chapterId: re.id, startedAt: now.toISOString(), minutes: 25 };
  const mid = new Date(now.getTime() + 10 * 60000);
  const cur = currentBlock(exam, mid);
  assert.equal(cur.over, false); assert.equal(Math.round(cur.left / 60000), 15);
  const pic = picture(exam, mid);
  assert.equal(pic.blocks, 7);                                    // one of the 8 is in progress
  assert.equal(pic.p.split[re.id], 1);                            // Respiration needs only one more
  assert.equal(currentBlock(exam, new Date(now.getTime() + 26 * 60000)).over, true);
  exam.current.chapterId = 'gone';
  assert.equal(currentBlock(exam, mid), null);
});

test('no study time left: an empty plan, not a crash', () => {
  const { exam, now } = sample();
  const late = new Date(now.getTime() + 5 * 3600000);              // 10:50 PM, after bedtime
  const pic = picture(exam, late);
  assert.equal(pic.blocks, 0); assert.equal(pic.p.tonight.length, 0); assert.equal(pic.finishAt, null); assert.equal(pic.over, false);
  assert.equal(picture(exam, new Date(now.getTime() + 15 * 3600000)).over, true);    // after the exam
});

test('planChange describes what moved, in plain words', () => {
  const name = (id) => ({ a: 'Light', b: 'Sound', c: 'Heat' })[id];
  assert.equal(planChange([{ id: 'a', minutes: 50 }], [{ id: 'a', minutes: 50 }], name), null);
  assert.equal(planChange(null, [{ id: 'a', minutes: 50 }], name), null);
  assert.equal(planChange([{ id: 'a', minutes: 50 }, { id: 'b', minutes: 25 }], [{ id: 'a', minutes: 75 }], name), 'Dropped Sound. Added 25 min to Light.');
  assert.equal(planChange([{ id: 'a', minutes: 50 }], [{ id: 'a', minutes: 25 }, { id: 'c', minutes: 25 }], name), 'Took 25 min from Light. Added Heat, 25 min.');
});

test('a pin has a price, and removing it costs nothing', () => {
  const { exam, now } = sample();
  const hb = exam.chapters.find((c) => c.name === 'Human body systems');
  assert.equal(pinPrice(exam, now, hb.id), 0);
  hb.pin = 2;
  const price = pinPrice(exam, now, hb.id);
  assert.ok(price > 0.7 && price < 0.9, 'price ' + price);
});

test('moving bedtime trades sleep for blocks, and the floor holds', () => {
  const { exam, now } = sample();
  const six = sleepTrade(exam, now, 6);
  assert.equal(six.blocks, 4); assert.ok(six.marks > 0); assert.equal(six.wall.getHours(), 0);
  const two = sleepTrade(exam, now, 2);                             // asking for 2 hours still gives 6
  assert.equal(two.blocks, 4); assert.equal(two.wall.getHours(), 0);
});

test('the words follow the clock: tonight, today, or a plan over several days', () => {
  const base = { name: 'x', total: 30, wake: '06:00', sleepHours: 8, chapters: [{ name: 'A', know: 'bits' }, { name: 'B', know: 'blank' }] };
  const evening = cleanExam({ ...base, at: '2026-10-05T08:00', sessions: [{ day: '2026-10-04', start: '18:00', end: null }] });
  assert.equal(picture(evening, atDay('2026-10-04', toMinutes('18:00'))).when, 'tonight');
  const morning = cleanExam({ ...base, at: '2026-10-04T14:00', sessions: [{ day: '2026-10-04', start: '08:00', end: null }] });
  const pm = picture(morning, atDay('2026-10-04', toMinutes('08:00')));
  assert.equal(pm.when, 'today'); assert.equal(pm.words.not, 'Not today');
  const twoDays = cleanExam({ ...base, at: '2026-10-06T08:00', sessions: [{ day: '2026-10-04', start: '18:00', end: null }, { day: '2026-10-05', start: '16:00', end: null }] });
  const p2 = picture(twoDays, atDay('2026-10-04', toMinutes('18:00')));
  assert.equal(p2.when, 'plan'); assert.equal(p2.words.order, 'Study, in this order');
});

test('chapters without marks share the paper equally', () => {
  const exam = cleanExam({ name: 'x', at: '2026-10-05T08:00', total: 60, wake: '06:00', sleepHours: 8,
    sessions: [{ day: '2026-10-04', start: '18:00', end: null }],
    chapters: [{ name: 'A', know: 'bits' }, { name: 'B', know: 'blank' }, { name: 'C', know: 'easy' }] });
  const pic = picture(exam, atDay('2026-10-04', toMinutes('18:00')));
  assert.equal(pic.p.total, 60);
  assert.deepEqual(pic.chapters.map((c) => c.marks), [20, 20, 20]);
  assert.equal(pic.unrated.length, 0);
});

test('book order is never shown above the plan: both get the same study time', () => {
  // Bug found on 4 Oct: when the plan stopped early, book order was still given the whole evening.
  const levels = ['blank', 'bits', 'most', 'easy'], sizes = ['S', 'M', 'L'];
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(rnd() * 40);
    const exam = cleanExam({
      name: 'x', at: '2026-10-05T08:00', total: 20 + Math.floor(rnd() * 180), wake: '06:00', sleepHours: 8,
      sessions: [{ day: '2026-10-04', start: `${String(8 + Math.floor(rnd() * 12)).padStart(2, '0')}:00`, end: null }],
      chapters: Array.from({ length: n }, (_, i) => ({ name: 'C' + i, know: levels[Math.floor(rnd() * 4)], size: sizes[Math.floor(rnd() * 3)], ...(rnd() < 0.5 ? { marks: 1 + Math.floor(rnd() * 12) } : {}) })),
    });
    const pic = picture(exam, atDay('2026-10-04', toMinutes('08:00')));
    const f = pic.forecasts;
    assert.ok(f.book.mid <= f.withPlan.mid + 1e-9, `run ${t}: book ${f.book.mid} above plan ${f.withPlan.mid}`);
    assert.ok(f.stopNow.mid <= f.book.mid + 1e-9 && f.withPlan.mid <= pic.p.total + 1e-9);
    for (const x of [f.stopNow, f.book, f.withPlan]) assert.ok(Number.isFinite(x.mid) && Number.isFinite(x.low) && Number.isFinite(x.high) && x.low <= x.mid + 1e-9 && x.mid <= x.high + 1e-9);
    for (const r of pic.sq.rows) assert.ok(r.have >= 0 && r.win >= 0 && r.later >= 0 && r.have + r.win + r.later === r.n, `run ${t}: the squares of ${r.name} add up`);
    if (pic.blocks > 0 && pic.p.after < pic.p.total * 0.94) assert.ok(pic.p.blocksUsed > 0, `run ${t}: time available but nothing planned`);
  }
});

