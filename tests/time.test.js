import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toMinutes, toHHMM, dayOf, atDay, nextWake, bedtimeAfter, blocksIn, windows, totalBlocks, timeline,
  clampSleep, fmtTime, fmtDur, fmtDay, fmtUntil, SLEEP_FLOOR,
} from '../js/time.js';

const at = (day, hhmm) => atDay(day, toMinutes(hhmm));
const exam = (over = {}) => ({
  at: '2026-10-05T08:00', wake: '06:00', sleepHours: 8,
  sessions: [{ day: '2026-10-04', start: '18:00', end: null }], ...over,
});

test('clock helpers', () => {
  assert.equal(toMinutes('06:30'), 390); assert.equal(toMinutes('24:00'), null); assert.equal(toMinutes('x'), null);
  assert.equal(toHHMM(390), '06:30'); assert.equal(toHHMM(-60), '23:00'); assert.equal(toHHMM(1500), '01:00');
  assert.equal(dayOf(at('2026-10-04', '23:59')), '2026-10-04');
  assert.equal(fmtTime(at('2026-10-04', '21:05')), '9:05 PM'); assert.equal(fmtTime(at('2026-10-04', '00:10')), '12:10 AM');
  assert.equal(fmtDur(200), '3 h 20 min'); assert.equal(fmtDur(120), '2 h'); assert.equal(fmtDur(25), '25 min'); assert.equal(fmtDur(-5), '0 min');
  const now = at('2026-10-04', '18:00');
  assert.equal(fmtDay(now, now), 'Today'); assert.equal(fmtDay(at('2026-10-05', '08:00'), now), 'Tomorrow');
  assert.equal(fmtDay(at('2026-10-09', '08:00'), now), 'Fri 9 Oct');
  assert.equal(fmtUntil(at('2026-10-05', '08:00'), now), 'in 14 h'); assert.equal(fmtUntil(at('2026-10-04', '17:00'), now), 'now');
});

test('blocks in a stretch of time: 25 on, 5 off, no break needed after the last one', () => {
  assert.equal(blocksIn(0), 0); assert.equal(blocksIn(24), 0); assert.equal(blocksIn(25), 1);
  assert.equal(blocksIn(54), 1); assert.equal(blocksIn(55), 2); assert.equal(blocksIn(240), 8); assert.equal(blocksIn(-10), 0);
});

test('bedtime is the next wake-up minus the hours of sleep', () => {
  assert.deepEqual(nextWake(at('2026-10-04', '18:00'), '06:00'), at('2026-10-05', '06:00'));
  assert.deepEqual(nextWake(at('2026-10-05', '01:00'), '06:00'), at('2026-10-05', '06:00'));
  assert.deepEqual(bedtimeAfter(at('2026-10-04', '18:00'), '06:00', 8), at('2026-10-04', '22:00'));
  assert.deepEqual(bedtimeAfter(at('2026-10-04', '18:00'), '04:30', 8), at('2026-10-04', '20:30'));
  assert.deepEqual(bedtimeAfter(at('2026-10-04', '18:00'), '10:00', 8), at('2026-10-05', '02:00'));
});

test('sleep can never be set under 6 hours', () => {
  assert.equal(SLEEP_FLOOR, 6);
  for (const h of [0, 1, 3, 5.9, -2, NaN, undefined, '4']) assert.ok(clampSleep(h) >= 6, `clampSleep(${h})`);
  assert.equal(clampSleep(7.5), 7.5); assert.equal(clampSleep(14), 10);
  // even if a saved exam says 2 hours, the wall still leaves 6
  const wall = bedtimeAfter(at('2026-10-04', '18:00'), '06:00', 2);
  assert.deepEqual(wall, at('2026-10-05', '00:00'));
  const w = windows(exam({ sleepHours: 2 }), at('2026-10-04', '18:00'));
  assert.deepEqual(w[0].end, at('2026-10-05', '00:00'));
});

test('a session with no end runs until bedtime', () => {
  const w = windows(exam(), at('2026-10-04', '18:00'));
  assert.equal(w.length, 1); assert.equal(w[0].minutes, 240); assert.equal(w[0].blocks, 8); assert.equal(w[0].hitWall, true);
});

test('no session runs past bedtime, whatever end the student typed', () => {
  const w = windows(exam({ sessions: [{ day: '2026-10-04', start: '18:00', end: '23:45' }] }), at('2026-10-04', '18:00'));
  assert.deepEqual(w[0].end, at('2026-10-04', '22:00')); assert.equal(w[0].hitWall, true);
  // every block in the timeline ends at or before the wall
  const rows = [{ id: 'a', blocks: w[0].blocks }];
  for (const s of timeline(rows, w)[0].slots) assert.ok(s.end <= w[0].wall);
});

test('starting after bedtime gives no blocks', () => {
  const w = windows(exam({ sessions: [{ day: '2026-10-04', start: '23:00', end: null }] }), at('2026-10-04', '23:00'));
  assert.equal(totalBlocks(w), 0);
  const late = windows(exam({ sessions: [{ day: '2026-10-05', start: '00:30', end: null }] }), at('2026-10-05', '00:30'));
  assert.equal(totalBlocks(late), 0);
});

test('time already gone is not counted', () => {
  const w = windows(exam(), at('2026-10-04', '20:00'));
  assert.equal(w[0].minutes, 120); assert.equal(w[0].blocks, 4);
  assert.equal(windows(exam(), at('2026-10-04', '22:30')).length, 0);
});

test('no session runs past the exam', () => {
  const e = exam({ at: '2026-10-04T20:00' });
  const w = windows(e, at('2026-10-04', '18:00'));
  assert.equal(w[0].minutes, 120); assert.equal(w[0].hitWall, false);
  assert.equal(windows(exam({ at: '2026-10-04T12:00' }), at('2026-10-04', '18:00')).length, 0);   // exam already over
});

test('the last minutes before the exam are kept free for recall', () => {
  const e = exam({ at: '2026-10-04T14:00', morningMin: 20, sessions: [{ day: '2026-10-04', start: '08:00', end: null }] });
  const w = windows(e, at('2026-10-04', '08:00'));
  assert.deepEqual(w[0].end, at('2026-10-04', '13:40')); assert.equal(w[0].minutes, 340); assert.equal(w[0].blocks, 11); assert.equal(w[0].hitWall, false);
  for (const s of timeline([{ id: 'a', blocks: w[0].blocks }], w)[0].slots) assert.ok(s.end <= at('2026-10-04', '13:40'));
  // the evening before, bedtime comes first, so nothing changes
  const eve = windows(exam({ morningMin: 20 }), at('2026-10-04', '18:00'));
  assert.equal(eve[0].blocks, 8); assert.equal(eve[0].hitWall, true);
});

test('several sessions over several days, in time order', () => {
  const e = exam({ sessions: [
    { day: '2026-10-04', start: '15:00', end: '17:00' },
    { day: '2026-10-03', start: '16:00', end: '18:30' },
    { day: '2026-10-04', start: '19:00', end: null },
  ] });
  const w = windows(e, at('2026-10-03', '12:00'));
  assert.deepEqual(w.map((x) => x.blocks), [5, 4, 6]);
  assert.equal(totalBlocks(w), 15);
  assert.ok(w[0].start < w[1].start && w[1].start < w[2].start);
});

test('a session that crosses midnight', () => {
  const e = exam({ wake: '10:00', sessions: [{ day: '2026-10-04', start: '22:00', end: '00:30' }] });
  const w = windows(e, at('2026-10-04', '22:00'));
  assert.equal(w[0].minutes, 150); assert.equal(w[0].blocks, 5);
});

test('bad sessions are ignored', () => {
  const e = exam({ sessions: [{ day: '', start: '18:00' }, { day: '2026-10-04', start: 'soon' }, null].filter(Boolean) });
  assert.equal(windows(e, at('2026-10-04', '18:00')).length, 0);
  assert.equal(windows({ at: null, wake: '06:00', sleepHours: 8 }, at('2026-10-04', '18:00')).length, 0);
});

test('timeline puts chapters on the clock, back to back, across sessions', () => {
  const e = exam({ sessions: [{ day: '2026-10-04', start: '18:00', end: '19:00' }, { day: '2026-10-04', start: '20:00', end: null }] });
  const w = windows(e, at('2026-10-04', '18:00'));                    // 2 blocks, then 4 blocks
  const tl = timeline([{ id: 'a', blocks: 3 }, { id: 'b', blocks: 2 }], w);
  assert.equal(tl[0].slots.length, 3); assert.equal(tl[1].slots.length, 2);
  assert.deepEqual(tl[0].stretches.map((s) => [fmtTime(s.start), fmtTime(s.end)]), [['6:00 PM', '6:55 PM'], ['8:00 PM', '8:25 PM']]);
  assert.deepEqual(tl[1].stretches.map((s) => [fmtTime(s.start), fmtTime(s.end)]), [['8:30 PM', '9:25 PM']]);
});
