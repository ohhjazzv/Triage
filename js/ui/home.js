// The start page. Names the moment, shows one picture, says how it works, offers two buttons.
// It is always at the logo. If an exam is already saved, it leads with a way back into that plan.

import { h, plural } from './dom.js';
import { marksMap } from './map.js';
import { picture } from '../model.js';
import { cleanExam } from '../store.js';
import { fmtDay, fmtTime } from '../time.js';
import { biologySample, socialScienceSample } from '../samples.js';
import { newDraft } from './setup.js';

/** "Pick up where you left off", for someone who already has an exam saved. */
function resume(app, exam) {
  const now = app.now(exam), at = exam.at ? new Date(exam.at) : null;
  const studying = !!exam.current;
  return h('section', { class: 'card resume', 'aria-label': 'Your saved exam' },
    h('p', { class: 'kicker' }, exam.sample ? 'The sample exam is open' : 'Pick up where you left off'),
    h('p', { class: 'resume-name' }, exam.name),
    h('p', { class: 'row-sub' }, plural(exam.chapters.length, 'chapter'), at ? ` · ${fmtDay(at, now)}, ${fmtTime(at)}` : ''),
    h('div', { class: 'actions' },
      h('a', { class: 'btn primary', href: studying ? '#/study' : '#/plan' }, studying ? 'Back to my block' : 'Open my plan'),
      h('a', { class: 'btn quiet', href: '#/exams' }, 'All my exams')));
}

export function home(app) {
  const exam = app.exam();

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
    exam ? resume(app, exam) : null,

    h('div', { class: 'hero' },
      h('div', { class: 'hero-text' },
        h('p', { class: 'moment' }, 'Exam tomorrow. 12 chapters. 4 hours.'),
        h('h1', null, 'Know what to study, what to skip, and when to stop.'),
        h('p', { class: 'lead' }, 'Triage puts every 25 minutes where it earns the most marks, and tells you when you are done.'),
        h('div', { class: 'actions' },
          h('button', { class: exam ? 'btn' : 'btn primary', onclick: planMine }, exam ? 'Plan another exam' : 'Plan my exam'),
          h('button', { class: 'btn', onclick: trySample }, 'Try a sample')),
        h('p', { class: 'fine' }, 'Free. No account. Nothing leaves this device. Works offline.')),
      h('figure', { class: 'card sample' },
        h('figcaption', null, h('b', null, 'Every square is one mark.'), ' A sample: Biology test, 50 marks, 3 h 20 min of study.'),
        marksMap(pic))),

    h('section', { class: 'block' },
      h('h2', null, 'How it works'),
      h('ol', { class: 'how' },
        h('li', null, h('b', null, 'Add your chapters.'), 'Type them, paste them, or add a photo of the syllabus.'),
        h('li', null, h('b', null, 'Answer one question for each.'), '"If a question from this chapter came right now?" Blank, Bits, Most or Easy.'),
        h('li', null, h('b', null, 'Get your plan.'), 'What to study and in what order, what to skip, and when to stop.'))),

    h('section', { class: 'block' },
      h('h2', null, 'Three rules it follows'),
      h('ol', { class: 'rules' },
        h('li', null, h('b', null, 'Marks per minute decides the order.'), ' Each block goes to the chapter where it adds the most marks right now.'),
        h('li', null, h('b', null, 'Skipping is a decision with a price.'), ' You see what to leave tonight and what that costs. It goes on a catch-up list.'),
        h('li', null, h('b', null, 'There is a point where you are done.'), ' The plan never runs past bedtime, and it stops when more study adds almost nothing.'))),

    h('section', { class: 'block' },
      h('h2', null, 'While you study, and after'),
      h('ul', { class: 'extras' },
        h('li', null, h('b', null, 'Close the book.'), 'After each block, say how much came back. The plan corrects itself.'),
        h('li', null, h('b', null, 'Beat the plan.'), 'Move the blocks yourself and watch the forecast change.'),
        h('li', null, h('b', null, 'Class link.'), 'One person sets up the exam and the class opens it. Nobody\'s answers are shared.'),
        h('li', null, h('b', null, 'After the exam.'), 'A catch-up list for what you skipped, and your forecast next to your real marks.'))),

    h('section', { class: 'block trust' },
      h('h2', null, 'Can you trust it?'),
      h('p', null, 'The order is plain arithmetic, not AI. On your own device, Triage checks every other way to split your time and shows that none scores higher. It also says what is not proven: nobody has shown that it raises real marks.'),
      h('p', null, h('a', { href: '#/sure' }, 'How sure is this?'))),

    h('section', { class: 'block last' },
      h('h2', null, exam ? 'Another exam coming?' : 'Ready?'),
      h('div', { class: 'actions' },
        h('button', { class: exam ? 'btn' : 'btn primary', onclick: planMine }, 'Start with my exam'),
        h('button', { class: 'btn', onclick: trySample }, 'See the sample plan')),
      h('p', { class: 'fine' }, h('button', { class: 'link', onclick: realSyllabus }, 'Or start from a real syllabus: Class 10 Social Science'))));
}
