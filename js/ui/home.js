// The first screen. Names the moment, shows one picture, offers two buttons.

import { h } from './dom.js';
import { marksMap } from './map.js';
import { planScreen } from './plan.js';
import { picture } from '../model.js';
import { cleanExam } from '../store.js';
import { biologySample, socialScienceSample } from '../samples.js';
import { newDraft } from './setup.js';

export function home(app) {
  if (app.exam()) return planScreen(app);          // with a saved exam, go straight to its plan

  // A live sample, drawn by the same engine as every real plan.
  const real = new Date();
  const sample = cleanExam(biologySample(real));
  const pic = picture(sample, new Date(real.getTime() + sample.clockOffset));

  const trySample = () => {
    app.state.exams = app.state.exams.filter((e) => !e.sample);
    app.addExam(biologySample(new Date()));
    app.go('plan');
  };
  const planMine = () => { app.draft = newDraft(app); app.go('setup/1'); };
  const realSyllabus = () => { app.draft = { ...newDraft(app), ...socialScienceSample(), prefilled: true }; app.go('setup/1'); };

  return h('section', { class: 'screen home' },
    h('p', { class: 'moment' }, 'Exam tomorrow. 12 chapters. 4 hours.'),
    h('h1', null, 'Know what to study, what to skip, and when to stop.'),
    h('p', { class: 'lead' }, 'Triage puts every 25 minutes where it earns the most marks, and tells you when you are done.'),

    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: planMine }, 'Plan my exam'),
      h('button', { class: 'btn', onclick: trySample }, 'Try a sample')),

    h('figure', { class: 'card sample' },
      h('figcaption', null, h('b', null, 'Every square is one mark.'), ' A sample: Biology test, 50 marks, 3 h 20 min of study.'),
      marksMap(pic)),

    h('ol', { class: 'rules' },
      h('li', null, h('b', null, 'Marks per minute decides the order.'), ' Each block goes to the chapter where it adds the most marks right now.'),
      h('li', null, h('b', null, 'Skipping is a decision with a price.'), ' You see what to leave tonight and what that costs. It goes on a catch-up list.'),
      h('li', null, h('b', null, 'There is a point where you are done.'), ' The plan never runs past bedtime, and it stops when more study adds almost nothing.')),

    h('p', { class: 'fine' }, 'No account. Nothing leaves this device. Works offline.'),
    h('p', { class: 'fine' }, h('button', { class: 'link', onclick: realSyllabus }, 'Or start from a real syllabus: Class 10 Social Science')));
}
