// Setting up an exam: one question per screen.
//   1. What is the exam?   2. What is in it?   3. How well do you know each one?   4. When can you study?

import { h, field, copyText, plural, whole } from './dom.js';
import { parseSyllabus, AI_PROMPT } from '../parse.js';
import { KNOW_ORDER } from '../engine.js';
import {
  dayOf, atDay, toMinutes, toHHMM, fmtTime, fmtDur, fmtDay, windows, totalBlocks, bedtimeAfter,
  clampSleep, SLEEP_FLOOR, SLEEP_MAX,
} from '../time.js';
import { cleanExam } from '../store.js';
import { picture } from '../model.js';

const DAY = 24 * 60 * 60 * 1000;
const DRAFT_KEY = 'triage-draft';

// The four answers to "If a question from this chapter came right now?"
export const KNOW_LABEL = { blank: 'Blank', bits: 'Bits', most: 'Most', easy: 'Easy' };
export const KNOW_HINT = {
  blank: 'I would leave it empty',
  bits: 'I could write a little',
  most: 'I would get most of it',
  easy: 'Full marks, no stress',
};

export function newDraft() {
  const now = new Date();
  return {
    name: '', date: dayOf(new Date(now.getTime() + DAY)), time: '08:00', total: 100,
    chapters: [], text: '', wake: '06:00', sleepHours: 8, morningMin: 20, sessions: null, rate: 0,
  };
}

function keep(app) { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(app.draft)); } catch { /* fine */ } }
function recall(app) {
  if (app.draft) return app.draft;
  try { const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY)); if (d && typeof d === 'object' && Array.isArray(d.chapters)) app.draft = d; } catch { /* fine */ }
  return app.draft;
}
function forget(app) { app.draft = null; try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* fine */ } }

const chapterLine = (c) => c.name + (c.marks ? ` | ${Math.round(c.marks * 100) / 100}` : (c.size && c.size !== 'M' ? ' | ?' : '')) + (c.size && c.size !== 'M' ? ` | ${c.size}` : '');

function shell(step, title, body, { back, next, nextLabel = 'Next', nextDisabled = false, note } = {}) {
  const nextBtn = next ? h('button', { class: 'btn primary', onclick: next, disabled: nextDisabled, id: 'next' }, nextLabel) : null;
  return h('section', { class: 'screen setup' },
    h('ol', { class: 'dots', 'aria-label': `Step ${step} of 4` }, [1, 2, 3, 4].map((n) => h('li', { class: n === step ? 'on' : n < step ? 'done' : '' }))),
    h('h1', null, title),
    body,
    note ? h('p', { class: 'fine' }, note) : null,
    h('div', { class: 'actions' }, nextBtn, back ? h('button', { class: 'btn quiet', onclick: back }, 'Back') : null));
}

// ---------- Step 1: what is the exam? ----------
function step1(app, d) {
  const today = dayOf(new Date()), tomorrow = dayOf(new Date(Date.now() + DAY));
  const date = h('input', { type: 'date', value: d.date, min: today, oninput: (e) => { d.date = e.target.value; keep(app); paint(); } });
  const chips = h('div', { class: 'chips' });
  const warn = h('p', { class: 'fine warn', role: 'status' });
  function paint() {
    chips.replaceChildren(
      h('button', { class: 'chip' + (d.date === today ? ' on' : ''), type: 'button', 'aria-pressed': String(d.date === today), onclick: () => { d.date = today; date.value = today; keep(app); paint(); } }, 'Today'),
      h('button', { class: 'chip' + (d.date === tomorrow ? ' on' : ''), type: 'button', 'aria-pressed': String(d.date === tomorrow), onclick: () => { d.date = tomorrow; date.value = tomorrow; keep(app); paint(); } }, 'Tomorrow'));
    const at = new Date(`${d.date}T${d.time}`);
    warn.textContent = isNaN(at) ? 'Pick a date and a time.' : at < new Date() ? 'That time has already passed. Check the date.' : '';
  }
  paint();
  const body = h('div', { class: 'form' },
    field('Exam name', h('input', { type: 'text', value: d.name, maxlength: 60, placeholder: 'Biology test', autocomplete: 'off', oninput: (e) => { d.name = e.target.value; keep(app); } })),
    h('div', { class: 'field' }, h('span', { class: 'field-label', id: 'when-l' }, 'When is it?'), chips,
      h('div', { class: 'pair' },
        h('label', { class: 'sr', for: 'exam-date' }, 'Exam date'), Object.assign(date, { id: 'exam-date' }),
        h('label', { class: 'sr', for: 'exam-time' }, 'Exam time'),
        h('input', { type: 'time', id: 'exam-time', value: d.time, oninput: (e) => { d.time = e.target.value || '08:00'; keep(app); paint(); } })),
      warn),
    field('Total marks', h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 1000, value: d.total, oninput: (e) => { d.total = Math.min(1000, Math.max(1, +e.target.value || 100)); keep(app); } }),
      'If you do not know the marks per chapter, Triage splits this equally.'));
  return shell(1, 'What is the exam?', body, {
    next: () => { if (isNaN(new Date(`${d.date}T${d.time}`))) { warn.textContent = 'Pick a date and a time.'; return; } app.go('setup/2'); },
    back: () => { forget(app); app.go(''); },
  });
}

// ---------- Step 2: what is in it? ----------
function step2(app, d) {
  if (!d.text && d.chapters.length) d.text = d.chapters.map(chapterLine).join('\n');
  const preview = h('div', { class: 'preview', role: 'status' });
  const paint = () => {
    const found = parseSyllabus(d.text);
    const next = document.getElementById('next'); if (next) next.disabled = found.length === 0;
    preview.replaceChildren(found.length
      ? h('div', null, h('p', { class: 'found' }, h('b', null, plural(found.length, 'chapter')), ' found'),
        h('ol', { class: 'found-list' }, found.map((c) => h('li', null, c.name,
          c.marks ? h('span', { class: 'meta' }, ` ${c.marks} marks`) : null, c.size ? h('span', { class: 'meta' }, ` ${{ S: 'short', M: 'medium', L: 'long' }[c.size]}`) : null))))
      : h('p', { class: 'fine' }, 'One chapter per line. Numbers, bullets and marks in brackets are fine.'));
  };
  const ta = h('textarea', { rows: 9, placeholder: 'Cell structure\nCell division (6 marks)\nPhotosynthesis\n…', 'aria-label': 'Chapter list', spellcheck: 'false',
    oninput: (e) => { d.text = e.target.value; keep(app); paint(); } });
  ta.value = d.text;

  const copied = h('span', { class: 'fine', role: 'status' });
  const photo = h('details', { class: 'more' },
    h('summary', null, 'Got a photo or PDF of the syllabus?'),
    h('p', null, 'Triage has no AI inside it. But any AI chat you already use can read a photo. Send it the photo with this message, then paste its answer above.'),
    h('pre', { class: 'prompt' }, AI_PROMPT),
    h('button', { class: 'btn small', type: 'button', onclick: async () => { copied.textContent = (await copyText(AI_PROMPT)) ? ' Copied.' : ' Select the text and copy it.'; } }, 'Copy this message'), copied);

  const body = h('div', { class: 'form' }, ta, preview, photo);
  const el = shell(2, 'What is in it?', body, {
    nextDisabled: parseSyllabus(d.text).length === 0,
    next: () => {
      const found = parseSyllabus(d.text);
      if (!found.length) return;
      const old = new Map(d.chapters.map((c) => [c.name.toLowerCase(), c]));
      d.chapters = found.map((c) => { const o = old.get(c.name.toLowerCase()); return { ...c, size: c.size || o?.size || 'M', marks: c.marks ?? o?.marks, know: o?.know ?? null }; });
      d.rate = Math.max(0, d.chapters.findIndex((c) => !c.know)); keep(app); app.go('setup/3');
    },
    back: () => app.go('setup/1'),
  });
  queueMicrotask(paint);
  return el;
}

// ---------- Step 3: how well do you know each one? ----------
function step3(app, d) {
  if (!d.chapters.length) { app.go('setup/2'); return null; }
  const i = Math.min(Math.max(0, d.rate | 0), d.chapters.length - 1), c = d.chapters[i];
  const pick = (k) => {
    c.know = k;
    if (i + 1 < d.chapters.length) { d.rate = i + 1; keep(app); app.render(); }
    else { keep(app); app.go('setup/4'); }
  };
  const body = h('div', { class: 'rate' },
    h('p', { class: 'count' }, `Chapter ${i + 1} of ${d.chapters.length}`),
    h('p', { class: 'chapter-name' }, c.name),
    h('p', { class: 'question', id: 'q' }, 'If a question from this chapter came right now?'),
    h('div', { class: 'answers', role: 'group', 'aria-labelledby': 'q' }, KNOW_ORDER.map((k) =>
      h('button', { class: 'answer' + (c.know === k ? ' on' : ''), type: 'button', 'aria-pressed': String(c.know === k), onclick: () => pick(k) },
        h('b', null, KNOW_LABEL[k]), h('span', null, KNOW_HINT[k])))));
  return shell(3, 'How well do you know each one?', body, {
    back: () => { if (i > 0) { d.rate = i - 1; keep(app); app.render(); } else app.go('setup/2'); },
    next: c.know ? () => pick(c.know) : null,
    note: 'Not sure? Close your eyes and name three things from this chapter. If you cannot, it is Blank or Bits. One tap moves on.',
  });
}

// ---------- Step 4 and the Time screen: when can you study? ----------

/**
 * A form that edits { at, wake, sleepHours, sessions, morningMin } in place.
 * `forecast(t)` may return a one-line forecast for the current settings.
 */
function timeForm(t, now, forecast) {
  const today = dayOf(now);
  if (!t.sessions || !t.sessions.length) t.sessions = [{ day: today, start: toHHMM(now.getHours() * 60 + now.getMinutes()), end: null }];

  const summary = h('div', { class: 'summary', role: 'status' });
  const list = h('div', { class: 'sessions' });
  const sleepLine = h('div', { class: 'stepper' });

  const candidate = () => ({ at: t.at, wake: t.wake, sleepHours: t.sleepHours, sessions: t.sessions });

  function paintSummary() {
    const wins = windows(candidate(), now), blocks = totalBlocks(wins), minutes = wins.reduce((a, w) => a + w.minutes, 0);
    const first = t.sessions[0] ? atDay(t.sessions[0].day, toMinutes(t.sessions[0].start) ?? 0) : now;
    const wall = bedtimeAfter(first > now ? first : now, t.wake, t.sleepHours);
    const lines = [];
    if (blocks > 0) lines.push(h('p', { class: 'big' }, `You have ${fmtDur(minutes)}. `, h('b', null, `That is ${plural(blocks, 'block')}.`)));
    else lines.push(h('p', { class: 'big' }, 'No study time fits before bedtime.'), h('p', { class: 'fine' }, 'Start earlier, add a session, or move bedtime. Sleep never goes under 6 hours.'));
    lines.push(h('p', { class: 'fine' }, `Bedtime ${fmtTime(wall)} · ${fmtDur(t.sleepHours * 60)} of sleep · one block is 25 minutes, then a 5 minute break.`));
    const f = forecast ? forecast(t) : null;
    if (f) lines.push(h('p', { class: 'fine' }, f));
    summary.replaceChildren(...lines);
  }

  function paintSleep() {
    const set = (v) => { t.sleepHours = clampSleep(v); paintSleep(); paintSummary(); };
    const atFloor = t.sleepHours <= SLEEP_FLOOR, atMax = t.sleepHours >= SLEEP_MAX;
    sleepLine.replaceChildren(
      h('button', { class: 'btn small', type: 'button', disabled: atFloor, 'aria-label': 'Less sleep, 30 minutes', onclick: () => set(t.sleepHours - 0.5) }, '−'),
      h('output', { class: 'stepper-value' }, fmtDur(t.sleepHours * 60)),
      h('button', { class: 'btn small', type: 'button', disabled: atMax, 'aria-label': 'More sleep, 30 minutes', onclick: () => set(t.sleepHours + 0.5) }, '+'),
      h('span', { class: 'fine' }, atFloor ? '6 hours is the floor. Triage will not plan less.' : t.sleepHours < 8 ? 'Less than 8 hours. Your call, but tired brains recall less.' : ''));
  }

  function dayOptions() {
    const last = t.at ? new Date(t.at) : new Date(now.getTime() + 2 * DAY);
    const out = [];
    for (let k = 0; k < 14; k++) {
      const d = new Date(now.getTime() + k * DAY);
      if (dayOf(d) > dayOf(last) && k > 0) break;
      out.push({ value: dayOf(d), label: fmtDay(d, now) });
    }
    return out;
  }

  function paintList() {
    const opts = dayOptions();
    list.replaceChildren(...t.sessions.map((s, i) => {
      const untilBed = s.end == null;
      const endInput = h('input', { type: 'time', value: s.end || '', 'aria-label': `Session ${i + 1} end`, hidden: untilBed,
        oninput: (e) => { s.end = e.target.value || null; paintSummary(); } });
      return h('div', { class: 'session' },
        h('select', { 'aria-label': `Session ${i + 1} day`, onchange: (e) => { s.day = e.target.value; paintSummary(); } },
          opts.concat(opts.some((o) => o.value === s.day) ? [] : [{ value: s.day, label: s.day }])
            .map((o) => h('option', { value: o.value, selected: o.value === s.day }, o.label))),
        h('span', { class: 'fine' }, 'from'),
        h('input', { type: 'time', value: s.start, 'aria-label': `Session ${i + 1} start`, oninput: (e) => { if (e.target.value) { s.start = e.target.value; paintSummary(); } } }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: untilBed, onchange: (e) => {
          s.end = e.target.checked ? null : toHHMM((toMinutes(s.start) ?? 1080) + 120); paintList(); paintSummary(); } }), ' until bedtime'),
        untilBed ? null : h('span', { class: 'fine' }, 'to'), endInput,
        t.sessions.length > 1 ? h('button', { class: 'link', type: 'button', onclick: () => { t.sessions.splice(i, 1); paintList(); paintSummary(); } }, 'Remove') : null);
    }),
    h('button', { class: 'link', type: 'button', onclick: () => {
      const lastDay = t.sessions.at(-1)?.day || today, next = dayOf(new Date(atDay(lastDay, 0).getTime() + DAY));
      t.sessions.push({ day: opts.some((o) => o.value === next) ? next : lastDay, start: '16:00', end: null }); paintList(); paintSummary();
    } }, '+ Add another study session'));
  }

  paintList(); paintSleep(); paintSummary();

  return h('div', { class: 'form' },
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Study sessions'), list),
    field('Wake-up time on exam day', h('input', { type: 'time', value: t.wake, oninput: (e) => { if (e.target.value) { t.wake = e.target.value; paintSummary(); } } })),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Sleep'), sleepLine),
    field('Minutes to keep free just before the exam', h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 240, value: t.morningMin, oninput: (e) => { t.morningMin = Math.min(240, Math.max(0, +e.target.value || 0)); } }),
      'For recalling what you studied. Not for new chapters.'),
    summary);
}

function forecastLine(chapters, total) {
  return (t) => {
    if (!chapters.length) return null;
    const probe = cleanExam({ ...t, total, chapters });
    if (!probe) return null;
    const pic = picture(probe, new Date());
    return `Forecast with this much time: about ${whole(pic.p.after)} of ${whole(pic.p.total)}.`;
  };
}

function step4(app, d) {
  if (!d.chapters.length) { app.go('setup/2'); return null; }
  if (d.chapters.some((c) => !c.know)) { d.rate = d.chapters.findIndex((c) => !c.know); app.go('setup/3'); return null; }
  const now = new Date();
  d.at = `${d.date}T${d.time}`;
  const body = timeForm(d, now, forecastLine(d.chapters, d.total));
  return shell(4, 'When can you study?', body, {
    nextLabel: 'Show my plan',
    next: () => {
      const e = app.addExam({ name: d.name, at: d.at, total: d.total, chapters: d.chapters, wake: d.wake, sleepHours: d.sleepHours, sessions: d.sessions, morningMin: d.morningMin });
      if (!e) return;
      forget(app); app.go('plan');
    },
    back: () => { d.rate = d.chapters.length - 1; keep(app); app.go('setup/3'); },
  });
}

export function setup(app, arg) {
  const d = recall(app);
  if (!d) { app.draft = newDraft(); keep(app); }
  const step = Math.min(4, Math.max(1, parseInt(arg, 10) || 1));
  const view = [step1, step2, step3, step4][step - 1];
  const el = view(app, app.draft);
  keep(app);
  return el;
}

/** Change the study time of an exam that already exists. */
export function timeScreen(app) {
  const e = app.exam();
  if (!e) { app.go(''); return null; }
  const now = app.now();
  const t = { at: e.at, wake: e.wake, sleepHours: e.sleepHours, morningMin: e.morningMin,
    sessions: e.sessions.filter((s) => windows({ ...e, sessions: [s] }, now).length).map((s) => ({ ...s })) };
  const body = timeForm(t, now, (x) => {
    const pic = picture({ ...e, ...x, sleepHours: clampSleep(x.sleepHours) }, now);
    return `Forecast with this much time: about ${whole(pic.p.after)} of ${whole(pic.p.total)}.`;
  });
  return h('section', { class: 'screen setup' },
    h('h1', null, 'When can you study?'),
    body,
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: () => {
        app.update((x) => { x.wake = t.wake; x.sleepHours = clampSleep(t.sleepHours); x.morningMin = t.morningMin; x.sessions = t.sessions; x.keepGoing = false; x.lastPlan = null; x.notice = null; }, false);
        app.go('plan');
      } }, 'Save'),
      h('a', { class: 'btn quiet', href: '#/plan' }, 'Cancel')));
}
