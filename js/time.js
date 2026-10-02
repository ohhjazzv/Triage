// Time rules: study sessions, the sleep wall, and the clock times of each block.
// Pure functions. "now" is always passed in, never read from the system clock here.

import { BLOCK, BREAK } from './engine.js';

export const SLEEP_FLOOR = 6;     // hours. The app never plans less sleep than this.
export const SLEEP_DEFAULT = 8;
export const SLEEP_MAX = 10;
const MIN = 60 * 1000;

export const clampSleep = (h) => Math.min(SLEEP_MAX, Math.max(SLEEP_FLOOR, Number.isFinite(+h) ? +h : SLEEP_DEFAULT));

/** "06:30" -> 390 */
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

/** 390 -> "06:30" */
export function toHHMM(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

/** Date -> "2026-10-04" in local time */
export function dayOf(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

/** "2026-10-04" + minutes after midnight -> Date in local time */
export function atDay(day, minutes) {
  const [y, mo, d] = String(day).split('-').map(Number);
  return new Date(y, mo - 1, d, 0, minutes, 0, 0);
}

/** The first wake-up at or after `from`. */
export function nextWake(from, wake) {
  const w = toMinutes(wake) ?? 360;
  let t = atDay(dayOf(from), w);
  if (t < from) t = atDay(dayOf(new Date(from.getTime() + 24 * 60 * MIN)), w);
  return t;
}

/**
 * The sleep wall for a study session that starts at `from`:
 * the next wake-up, minus the hours of sleep. Never less than SLEEP_FLOOR hours.
 */
export function bedtimeAfter(from, wake, sleepHours) {
  return new Date(nextWake(from, wake).getTime() - clampSleep(sleepHours) * 60 * MIN);
}

/** How many 25-minute blocks fit in a stretch of minutes. The last block needs no break after it. */
export function blocksIn(minutes) {
  return Math.max(0, Math.floor((minutes + BREAK) / (BLOCK + BREAK)));
}

/**
 * The student's real study windows from `now` on.
 * Each session is { day: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM" or null }.
 * A session with no end runs until bedtime. No session runs past bedtime or past the exam.
 */
export function windows(exam, now) {
  const examAt = exam.at ? new Date(exam.at) : null;
  const out = [];
  for (const s of exam.sessions || []) {
    const startMin = toMinutes(s.start);
    if (startMin == null || !s.day) continue;
    const start = atDay(s.day, startMin);
    const wall = bedtimeAfter(start, exam.wake, exam.sleepHours);
    let end = wall;
    const endMin = toMinutes(s.end);
    if (endMin != null) {
      let e = atDay(s.day, endMin);
      if (e <= start) e = new Date(e.getTime() + 24 * 60 * MIN);     // "22:00 to 00:30" crosses midnight
      end = e;
    }
    let hitWall = false;
    if (end > wall) { end = wall; hitWall = true; }
    if (endMin == null) hitWall = true;
    // The last minutes before the exam are kept for recall, not for new chapters.
    const cut = examAt ? new Date(examAt.getTime() - (exam.morningMin || 0) * MIN) : null;
    if (cut && end > cut) { end = cut; hitWall = false; }
    const from = start > now ? start : now;
    const minutes = Math.max(0, Math.floor((end - from) / MIN));
    out.push({ start: from, end, wall, hitWall, minutes, blocks: blocksIn(minutes), session: s });
  }
  return out.filter((w) => w.end > now).sort((a, b) => a.start - b.start);
}

export const totalBlocks = (wins) => wins.reduce((a, w) => a + w.blocks, 0);

/**
 * Put the plan on the clock. rows: the ordered "tonight" list from the engine.
 * Returns, per chapter, the stretches of time it occupies.
 */
export function timeline(rows, wins) {
  const slots = [];
  for (const w of wins) {
    for (let k = 0; k < w.blocks; k++) {
      const start = new Date(w.start.getTime() + k * (BLOCK + BREAK) * MIN);
      slots.push({ start, end: new Date(start.getTime() + BLOCK * MIN) });
    }
  }
  let p = 0;
  return rows.map((r) => {
    const mine = slots.slice(p, p + r.blocks); p += r.blocks;
    const stretches = [];
    for (const s of mine) {
      const last = stretches[stretches.length - 1];
      if (last && s.start - last.end <= BREAK * MIN) last.end = s.end;
      else stretches.push({ start: s.start, end: s.end });
    }
    return { id: r.id, slots: mine, stretches };
  });
}

/** 9:05 PM */
export function fmtTime(date) {
  let h = date.getHours(); const m = date.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
}

/** 200 -> "3 h 20 min" */
export function fmtDur(minutes) {
  const m = Math.max(0, Math.round(minutes)), h = Math.floor(m / 60), r = m % 60;
  if (h && r) return `${h} h ${r} min`;
  if (h) return `${h} h`;
  return `${r} min`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Tomorrow", or "Mon 5 Oct" */
export function fmtDay(date, now) {
  const d = dayOf(date);
  if (now) {
    if (d === dayOf(now)) return 'Today';
    if (d === dayOf(new Date(now.getTime() + 24 * 60 * MIN))) return 'Tomorrow';
  }
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "in 14 h", "in 2 days", "started" */
export function fmtUntil(date, now) {
  const mins = Math.round((date - now) / MIN);
  if (mins <= 0) return 'now';
  if (mins < 90) return `in ${mins} min`;
  if (mins < 48 * 60) return `in ${Math.round(mins / 60)} h`;
  return `in ${Math.round(mins / 1440)} days`;
}
