// Two ready-made exams, so nobody has to type to see how Triage works.

import { dayOf, atDay } from './time.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * A Biology test with the ratings already filled in.
 * The sample runs on its own clock: whenever you open it, it is 5:50 PM on the evening
 * before the exam, so everyone sees the same plan. From there its clock runs normally.
 */
export function biologySample(realNow) {
  const today = dayOf(realNow);
  const sampleNow = atDay(today, 17 * 60 + 50);
  const tomorrow = dayOf(new Date(sampleNow.getTime() + DAY));
  return {
    name: 'Biology test',
    at: `${tomorrow}T08:00`,
    total: 50,
    wake: '06:00',
    sleepHours: 8,
    morningMin: 20,
    sessions: [{ day: today, start: '17:50', end: null }],
    sample: true,
    clockOffset: sampleNow.getTime() - realNow.getTime(),
    chapters: [
      { name: 'Cell structure', marks: 8, size: 'M', know: 'easy' },
      { name: 'Cell division', marks: 6, size: 'M', know: 'most' },
      { name: 'Photosynthesis', marks: 8, size: 'L', know: 'bits' },
      { name: 'Respiration', marks: 7, size: 'L', know: 'blank' },
      { name: 'Genetics', marks: 9, size: 'L', know: 'bits' },
      { name: 'Evolution', marks: 4, size: 'M', know: 'blank' },
      { name: 'Ecology', marks: 5, size: 'S', know: 'most' },
      { name: 'Human body systems', marks: 3, size: 'L', know: 'blank' },
    ],
  };
}

/**
 * A real syllabus: a Class 10 Social Science mid-term (CBSE, India).
 * 80 marks, 20 per subject, split equally inside each subject.
 * No ratings: the student answers for themselves.
 */
export function socialScienceSample() {
  const ch = (name, marks, size) => ({ name, marks, size });
  return {
    name: 'Social Science mid-term',
    total: 80,
    chapters: [
      ch('History: The Rise of Nationalism in Europe', 10, 'L'),
      ch('History: Nationalism in India', 10, 'L'),
      ch('Geography: Resources and Development', 5, 'M'),
      ch('Geography: Forest and Wildlife Resources', 5, 'S'),
      ch('Geography: Water Resources', 5, 'S'),
      ch('Geography: Agriculture', 5, 'L'),
      ch('Politics: Power-sharing', 6.67, 'S'),
      ch('Politics: Federalism', 6.67, 'M'),
      ch('Politics: Gender, Religion and Caste', 6.66, 'M'),
      ch('Economics: Development', 6.67, 'S'),
      ch('Economics: Sectors of the Indian Economy', 6.67, 'M'),
      ch('Economics: Money and Credit', 6.66, 'M'),
    ],
  };
}
