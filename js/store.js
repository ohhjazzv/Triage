// Saving, loading, and the class link. Everything stays in this browser.
// Nothing in this file talks to a network.

import { KNOW, TAU, CEIL, ENOUGH_PCT } from './engine.js';
import { clampSleep, toMinutes } from './time.js';

export const KEY = 'triage-v1';
const VERSION = 1;

export const blank = () => ({ v: VERSION, exams: [], active: null, settings: {} });

export function newId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

const str = (x, max) => String(x ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const num = (x, lo, hi, dflt) => (typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt);
const hhmm = (x, dflt) => (toMinutes(x) != null ? String(x) : dflt);
const isDay = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''));

function cleanChapter(c) {
  if (!c || typeof c !== 'object') return null;
  const name = str(c.name, 80);
  if (!name) return null;
  const out = {
    id: str(c.id, 16) || newId(),
    name,
    size: TAU[c.size] ? c.size : 'M',
    know: KNOW[c.know] != null ? c.know : null,     // null = not answered yet
    pin: num(c.pin, 0, 40, 0) | 0,
    drop: !!c.drop,
    minutes: num(c.minutes, 0, 100000, 0),          // minutes studied so far
  };
  if (typeof c.marks === 'number' && isFinite(c.marks) && c.marks > 0) out.marks = Math.min(500, c.marks);
  if (typeof c.m === 'number' && isFinite(c.m)) out.m = Math.min(CEIL, Math.max(0, c.m));
  if (typeof c.tau === 'number' && isFinite(c.tau) && c.tau > 0) out.tau = Math.min(600, Math.max(5, c.tau));
  return out;
}

function cleanSession(s) {
  if (!s || !isDay(s.day) || toMinutes(s.start) == null) return null;
  return { day: s.day, start: s.start, end: toMinutes(s.end) != null ? s.end : null };
}

/** Make any exam-shaped object safe to use. Returns null if it cannot be saved. */
export function cleanExam(e) {
  if (!e || typeof e !== 'object') return null;
  const chapters = (Array.isArray(e.chapters) ? e.chapters : []).map(cleanChapter).filter(Boolean).slice(0, 60);
  if (!chapters.length) return null;
  const ids = new Set();
  for (const c of chapters) { while (ids.has(c.id)) c.id = newId(); ids.add(c.id); }
  const when = typeof e.at === 'string' ? e.at.slice(0, 16) : '';
  const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when) && !isNaN(new Date(when)) ? when : null;
  return {
    id: str(e.id, 16) || newId(),
    name: str(e.name, 60) || 'My exam',
    at,
    total: num(e.total, 1, 1000, 100),
    chapters,
    wake: hhmm(e.wake, '06:00'),
    sleepHours: clampSleep(e.sleepHours),
    sessions: (Array.isArray(e.sessions) ? e.sessions : []).map(cleanSession).filter(Boolean).slice(0, 30),
    morningMin: num(e.morningMin, 0, 240, 20),
    enoughPct: num(e.enoughPct, 0, 5, ENOUGH_PCT),
    keepGoing: !!e.keepGoing,                        // the student chose to pass the Enough line
    current: e.current && typeof e.current === 'object' && e.current.chapterId && !isNaN(new Date(e.current.startedAt))
      ? { chapterId: String(e.current.chapterId), startedAt: String(e.current.startedAt), minutes: num(e.current.minutes, 1, 120, 25) }
      : null,
    log: (Array.isArray(e.log) ? e.log : []).filter((l) => l && l.chapterId).slice(-500)
      .map((l) => ({ chapterId: String(l.chapterId), minutes: num(l.minutes, 0, 600, 25), recalled: str(l.recalled, 10), at: str(l.at, 30) })),
    lastPlan: Array.isArray(e.lastPlan) ? e.lastPlan.slice(0, 60).map((r) => ({ id: String(r.id), minutes: num(r.minutes, 0, 6000, 0) })) : null,
    notice: str(e.notice, 300) || null,
    done: !!e.done,
    forecast: typeof e.forecast === 'number' && isFinite(e.forecast) ? e.forecast : null,   // forecast when the exam was marked done
    result: e.result && typeof e.result.marks === 'number' && isFinite(e.result.marks) ? { marks: Math.max(0, e.result.marks) } : null,
    sample: !!e.sample,
    clockOffset: num(e.clockOffset, -4e10, 4e10, 0),   // the sample exam runs on its own clock ("it is 5:50 PM")
    createdAt: str(e.createdAt, 30) || new Date().toISOString(),
  };
}

export function cleanState(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.exams)) return blank();
  const exams = s.exams.map(cleanExam).filter(Boolean).slice(0, 40);
  const active = exams.some((e) => e.id === s.active) ? s.active : (exams[0]?.id ?? null);
  const settings = {};
  if (s.settings && ['light', 'dark'].includes(s.settings.theme)) settings.theme = s.settings.theme;
  return { v: VERSION, exams, active, settings };
}

/** Load saved state. Broken data never crashes the app: it is set aside and a clean state returned. */
export function load(storage) {
  let raw = null;
  try { raw = storage.getItem(KEY); } catch { return blank(); }
  if (!raw) return blank();
  try { return cleanState(JSON.parse(raw)); }
  catch {
    try { storage.setItem(KEY + '-broken', raw.slice(0, 200000)); } catch { /* storage full or blocked */ }
    return blank();
  }
}

export function save(storage, state) {
  try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export const exportJson = (state) => JSON.stringify({ app: 'triage', ...state }, null, 2);

export function importJson(text) {
  try {
    const s = JSON.parse(text);
    const out = cleanState(s);
    return out.exams.length ? out : null;
  } catch { return null; }
}

// ---------- The class link ----------
// Carries only what is the same for the whole class: exam name, date, total marks,
// and the chapter list (name, marks, size). Never ratings, progress, sleep or anything personal.

const b64url = {
  enc(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(s) {
    const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  },
};

export function encodeShare(exam) {
  const payload = {
    v: 1,
    n: exam.name,
    a: exam.at || null,
    t: exam.total,
    c: exam.chapters.map((c) => [c.name, typeof c.marks === 'number' ? Math.round(c.marks * 100) / 100 : null, c.size || 'M']),
  };
  return b64url.enc(JSON.stringify(payload));
}

/** Returns a fresh exam (no ratings) or null if the link is not valid. */
export function decodeShare(code) {
  try {
    const p = JSON.parse(b64url.dec(code));
    if (!p || p.v !== 1 || !Array.isArray(p.c)) return null;
    const chapters = p.c.slice(0, 60).map((row) => {
      if (!Array.isArray(row)) return null;
      const c = { name: row[0], size: row[2] };
      if (typeof row[1] === 'number') c.marks = row[1];
      return c;
    }).filter(Boolean);
    return cleanExam({ name: p.n, at: p.a, total: p.t, chapters });
  } catch { return null; }
}
