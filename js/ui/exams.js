// All saved exams, plus the door for an exam that arrived by class link.

import { h, plural } from './dom.js';
import { fmtDay, fmtTime, fmtUntil } from '../time.js';
import { exportJson, importJson } from '../store.js';
import { biologySample, socialScienceSample } from '../samples.js';
import { newDraft } from './setup.js';

function sharedCard(app) {
  const s = app.shared;
  if (!s) {
    return h('div', { class: 'card empty' }, h('h2', null, 'That link could not be read.'),
      h('p', null, 'Ask for it again, or set up the exam yourself. It takes about a minute.'));
  }
  const use = () => {
    const d = { ...newDraft(), name: s.name, total: s.total, chapters: s.chapters.map((c) => ({ name: c.name, marks: c.marks, size: c.size, know: null })), rate: 0 };
    const future = s.at && new Date(s.at) > new Date();
    if (future) { d.date = s.at.slice(0, 10); d.time = s.at.slice(11, 16); }
    app.draft = d; app.shared = null;
    app.go(future ? 'setup/3' : 'setup/1');
  };
  return h('div', { class: 'card' },
    h('p', { class: 'kicker' }, 'Shared exam'),
    h('h2', null, s.name),
    h('p', null, plural(s.chapters.length, 'chapter'), s.at ? ` · ${fmtDay(new Date(s.at), new Date())}, ${fmtTime(new Date(s.at))}` : '', ` · ${Math.round(s.total)} marks`),
    h('p', { class: 'fine' }, 'The link carried only the chapter list. Your answers stay on this device.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: use }, 'Use it'),
      h('button', { class: 'btn quiet', onclick: () => { app.shared = null; app.go('exams'); } }, 'No thanks')));
}

export function exams(app, opts = {}) {
  const status = h('span', { class: 'fine', role: 'status' });

  const startNew = () => { app.draft = newDraft(); app.go('setup/1'); };
  const trySample = () => { app.state.exams = app.state.exams.filter((e) => !e.sample); app.addExam(biologySample(new Date())); app.go('plan'); };
  const realSyllabus = () => { app.draft = { ...newDraft(), ...socialScienceSample() }; app.go('setup/1'); };

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportJson(app.state)], { type: 'application/json' }));
    const a = h('a', { href: url, download: 'triage-backup.json' }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', 'aria-label': 'Choose a Triage backup file', onchange: async (ev) => {
    const f = ev.target.files?.[0]; if (!f) return;
    const got = importJson(await f.text());
    if (!got) { status.textContent = ' That file is not a Triage backup.'; return; }
    const have = new Set(app.state.exams.map((e) => e.id));
    for (const e of got.exams) if (!have.has(e.id)) app.state.exams.push(e);
    if (!app.state.active) app.state.active = app.state.exams[0]?.id ?? null;
    app.save(); app.render();
  } });

  const rows = app.state.exams.map((e) => {
    const at = e.at ? new Date(e.at) : null, t = new Date(Date.now() + (e.clockOffset || 0));
    const over = e.done || (at && t >= at);
    let armed = false;
    const del = h('button', { class: 'link danger', type: 'button', onclick: () => {
      if (!armed) { armed = true; del.textContent = 'Really delete?'; setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 4000); return; }
      app.state.exams = app.state.exams.filter((x) => x.id !== e.id);
      if (app.state.active === e.id) app.state.active = app.state.exams[0]?.id ?? null;
      app.save(); app.render();
    } }, 'Delete');
    return h('li', { class: 'row' },
      h('div', { class: 'row-main' },
        h('button', { class: 'link row-name', onclick: () => { app.state.active = e.id; app.save(); app.go('plan'); } }, e.name),
        h('span', { class: 'row-gain muted' }, e.sample ? 'sample' : over ? 'over' : at ? fmtUntil(at, t) : '')),
      h('p', { class: 'row-sub' }, plural(e.chapters.length, 'chapter'), at ? ` · ${fmtDay(at, t)}, ${fmtTime(at)}` : '',
        e.result ? ` · real marks ${e.result.marks}` : '', ' · ', del));
  });

  return h('section', { class: 'screen exams' },
    opts.shared ? sharedCard(app) : null,
    h('h1', null, 'My exams'),
    rows.length ? h('ul', { class: 'rows' }, rows) : h('p', null, 'No exams yet.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: startNew }, 'Plan a new exam'),
      h('button', { class: 'btn', onclick: trySample }, 'Try the sample')),
    h('p', { class: 'fine' }, h('button', { class: 'link', onclick: realSyllabus }, 'Start from a real syllabus (Class 10 Social Science)')),
    h('h2', null, 'Backup'),
    h('p', { class: 'fine' }, 'Everything is saved in this browser only. A backup file lets you move it to another device.'),
    h('p', null, h('button', { class: 'btn small', onclick: download, disabled: !app.state.exams.length }, 'Download a backup'), ' ',
      h('button', { class: 'btn small', onclick: () => file.click() }, 'Load a backup'), file, status));
}
