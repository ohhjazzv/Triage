// Share with class: a link that carries the chapter list and nothing personal.

import { h, plural, copyText } from './dom.js';
import { encodeShare } from '../store.js';
import { fmtDay, fmtTime } from '../time.js';

export function share(app) {
  const exam = app.exam();
  if (!exam) { app.go(''); return null; }
  const link = location.origin + location.pathname + '#x=' + encodeShare(exam);
  const status = h('span', { class: 'fine', role: 'status' });
  const box = h('textarea', { class: 'link-box', readonly: true, rows: 4, 'aria-label': 'Class link', onfocus: (e) => e.target.select() });
  box.value = link;

  const canShare = typeof navigator.share === 'function';
  return h('section', { class: 'screen share' },
    h('h1', null, 'Share with class'),
    h('p', { class: 'lead' }, 'One person sets up the exam. Everyone else opens the link and only answers how well they know each chapter.'),
    h('div', { class: 'card' },
      h('p', null, h('b', null, exam.name), ` · ${plural(exam.chapters.length, 'chapter')}`, exam.at ? ` · ${fmtDay(new Date(exam.at), app.now())}, ${fmtTime(new Date(exam.at))}` : ''),
      box,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: async () => { status.textContent = (await copyText(link)) ? ' Copied.' : ' Select the link and copy it.'; } }, 'Copy the link'),
        canShare ? h('button', { class: 'btn', onclick: () => navigator.share({ title: `Triage: ${exam.name}`, url: link }).catch(() => {}) }, 'Share…') : null,
        status)),
    h('h2', null, 'What is in the link'),
    h('ul', { class: 'plain' },
      h('li', null, 'The exam name, date and total marks.'),
      h('li', null, 'The chapter names, their marks and their length.')),
    h('h2', null, 'What is not in it'),
    h('ul', { class: 'plain' },
      h('li', null, 'Your answers, your progress, your sleep or study times.'),
      h('li', null, 'Your name, or anything else about you.')),
    h('p', { class: 'fine' }, 'The link is the data. Nothing is uploaded anywhere.'),
    h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/plan' }, 'Back to the plan')));
}
