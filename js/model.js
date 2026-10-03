// Turns a saved exam plus the current time into everything a screen needs to show.
// Pure: same exam and same time in, same picture out.

import { plan, bookOrder, range, squares, fillMarks, masteryNow, tauNow, checkIn, score, BLOCK, BREAK, CEIL } from './engine.js';
import { windows, totalBlocks, timeline } from './time.js';

const MIN = 60 * 1000;

/** The block in progress, if any: when it ends and whether it is over. */
export function currentBlock(exam, now) {
  if (!exam.current) return null;
  const started = new Date(exam.current.startedAt);
  const ends = new Date(started.getTime() + exam.current.minutes * MIN);
  const chapter = exam.chapters.find((c) => c.id === exam.current.chapterId);
  if (!chapter) return null;
  return { chapter, started, ends, minutes: exam.current.minutes, over: now >= ends, left: Math.max(0, ends - now) };
}

export const WORDS = {
  tonight: { order: 'Tonight, in this order', not: 'Not tonight', tag: 'not tonight', legend: 'tonight', spoken: 'tonight' },
  today: { order: 'Today, in this order', not: 'Not today', tag: 'not today', legend: 'today', spoken: 'today' },
  plan: { order: 'Study, in this order', not: 'Not this time', tag: 'not this time', legend: 'this plan', spoken: 'in this plan' },
};

const shifted = (chapters, dm, k) => chapters.map((c) => ({ ...c, m: Math.min(CEIL, Math.max(0.02, masteryNow(c) + dm)), tau: tauNow(c) * k }));

export function picture(exam, now) {
  let chapters = fillMarks(exam.chapters, exam.total);
  const cur = currentBlock(exam, now);

  // While a block is running, plan the time AFTER it, assuming it goes as predicted.
  let from = now;
  if (cur) {
    chapters = chapters.map((c) => (c.id === cur.chapter.id ? { ...c, ...checkIn(c, cur.minutes, 'most') } : c));
    const after = new Date(cur.ends.getTime() + BREAK * MIN);
    if (after > from) from = after;
  }

  const wins = windows(exam, from);
  const blocks = totalBlocks(wins);
  const enoughPct = exam.keepGoing ? 0 : exam.enoughPct;
  const p = plan(chapters, blocks, { enoughPct });
  const tl = timeline(p.tonight, wins);
  const studyMinutes = blocks * BLOCK;

  // Three forecasts, each with a rough range.
  const none = {};
  const stopNow = { mid: p.before, ...range(chapters, none) };
  // Book order gets the same study time as the plan, so the two are compared like for like.
  // (When the plan stops early at the Enough line, book order stops at the same minute.)
  const bookMinutes = p.stop === 'enough' ? p.blocksUsed * BLOCK : studyMinutes;
  const book = {
    mid: bookOrder(chapters, bookMinutes),
    low: bookOrder(shifted(chapters, -0.15, 1.3), bookMinutes),
    high: bookOrder(shifted(chapters, 0.05, 0.85), bookMinutes),
  };
  const withPlan = { mid: p.after, ...range(chapters, p.split) };

  // Is this plan for tonight, for today, or spread over several days? The screens choose their words from this.
  const used = wins.filter((w) => w.blocks > 0);
  const days = new Set(used.map((w) => w.start.toDateString()));
  const hour = used.length ? used[0].start.getHours() : now.getHours();
  const when = days.size > 1 ? 'plan' : (hour >= 16 || hour < 4) ? 'tonight' : 'today';

  const examAt = exam.at ? new Date(exam.at) : null;
  const wall = wins.length ? wins[0].wall : null;
  const lastSlots = tl.length ? tl[tl.length - 1].slots : [];
  const lastSlot = lastSlots.length ? lastSlots[lastSlots.length - 1] : null;      // (not .at(-1): older iPhones lack it)

  return {
    exam, now, chapters, cur, wins, blocks, studyMinutes, p, tl, when, words: WORDS[when],
    forecasts: { stopNow, book, withPlan },
    sq: squares(chapters, p),
    examAt, wall,
    finishAt: lastSlot ? lastSlot.end : null,
    over: !!examAt && now >= examAt,
    unrated: exam.chapters.filter((c) => !c.know && typeof c.m !== 'number'),
  };
}

/** One sentence on how the plan changed, or null if it did not. */
export function planChange(before, afterRows, nameOf) {
  if (!before) return null;
  const was = new Map(before.map((r) => [r.id, r.minutes])), is = new Map(afterRows.map((r) => [r.id, r.minutes]));
  const parts = [];
  for (const [id, m] of was) if (!is.has(id) && m > 0) parts.push(`Dropped ${nameOf(id)}.`);
  for (const [id, m] of is) {
    const old = was.get(id) || 0;
    if (!was.has(id)) parts.push(`Added ${nameOf(id)}, ${m} min.`);
    else if (m > old) parts.push(`Added ${m - old} min to ${nameOf(id)}.`);
    else if (m < old) parts.push(`Took ${old - m} min from ${nameOf(id)}.`);
  }
  return parts.length ? parts.join(' ') : null;
}

/** What a pin on this chapter costs, in forecast marks. */
export function pinPrice(exam, now, chapterId) {
  const withPin = picture(exam, now).p.after;
  const freed = { ...exam, chapters: exam.chapters.map((c) => (c.id === chapterId ? { ...c, pin: 0 } : c)) };
  return Math.max(0, picture(freed, now).p.after - withPin);
}

/** What moving bedtime by `deltaHours` would change: blocks and forecast marks. */
export function sleepTrade(exam, now, sleepHours) {
  const a = picture(exam, now), b = picture({ ...exam, sleepHours }, now);
  return { blocks: b.blocks - a.blocks, marks: b.p.after - a.p.after, wall: b.wall };
}

export { score };
