import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSyllabus, tidyOcr, AI_PROMPT } from '../js/parse.js';

const names = (t) => parseSyllabus(t).map((c) => c.name);
const one = (t) => parseSyllabus(t)[0];

// Each case: [what the student pasted, what we expect back]
const CASES = [
  ['Photosynthesis', { name: 'Photosynthesis' }],
  ['1. Chemical Reactions and Equations', { name: 'Chemical Reactions and Equations' }],
  ['2) Acids, Bases and Salts', { name: 'Acids, Bases and Salts' }],
  ['(3) Metals and Non-metals', { name: 'Metals and Non-metals' }],
  ['- Life Processes', { name: 'Life Processes' }],
  ['• Control and Coordination', { name: 'Control and Coordination' }],
  ['* Heredity', { name: 'Heredity' }],
  ['Ch 3 - Metals and Non-metals (5 marks)', { name: 'Metals and Non-metals', marks: 5 }],
  ['Chapter 12: Electricity', { name: 'Electricity' }],
  ['Chapter 4 – Carbon and its Compounds [6]', { name: 'Carbon and its Compounds', marks: 6 }],
  ['Unit 2: Algebra (20)', { name: 'Algebra', marks: 20 }],
  ['Lesson 5. The Human Eye', { name: 'The Human Eye' }],
  ['Light: Reflection and Refraction - 7m', { name: 'Light: Reflection and Refraction', marks: 7 }],
  ['Genetics: 9 marks', { name: 'Genetics', marks: 9 }],
  ['Ecology 5 marks', { name: 'Ecology', marks: 5 }],
  ['Statistics (11 pts)', { name: 'Statistics', marks: 11 }],
  ['Electricity | 8 | L', { name: 'Electricity', marks: 8, size: 'L' }],
  ['Evolution | ? | M', { name: 'Evolution', size: 'M' }],
  ['Cell division | 6', { name: 'Cell division', marks: 6 }],
  ['Respiration\t7\tL', { name: 'Respiration', marks: 7, size: 'L' }],
  ['3 | Metals and Non-metals | 5 | S', { name: 'Metals and Non-metals', marks: 5, size: 'S' }],
  ['Water Resources (short)', { name: 'Water Resources', size: 'S' }],
  ['Agriculture (5 marks) (long)', { name: 'Agriculture', marks: 5, size: 'L' }],
  ['   7.   Coordinate Geometry   ', { name: 'Coordinate Geometry' }],
  ['12 - Magnetic Effects of Electric Current', { name: 'Magnetic Effects of Electric Current' }],
  ['3D Shapes', { name: '3D Shapes' }],
  ['1984: Themes', { name: '1984: Themes' }],
  ['Nationalism in India – 10 marks', { name: 'Nationalism in India', marks: 10 }],
  ['Gender, Religion and Caste (6.67)', { name: 'Gender, Religion and Caste', marks: 6.67 }],
  ['द्वितीयः पाठः - बुद्धिर्बलवती सदा', { name: 'द्वितीयः पाठः - बुद्धिर्बलवती सदा' }],
];

for (const [input, want] of CASES) {
  test(`reads: ${JSON.stringify(input)}`, () => assert.deepEqual(one(input), want));
}

test('a whole messy syllabus', () => {
  const text = `
SYLLABUS

History:
1. The Rise of Nationalism in Europe
2. Nationalism in India

Geography:
  - Resources and Development (5 marks)
  - Water Resources [5]
-----
Economics:
Ch 1 - Development
Ch 3 - Money and Credit
`;
  assert.deepEqual(names(text), ['The Rise of Nationalism in Europe', 'Nationalism in India', 'Resources and Development',
    'Water Resources', 'Development', 'Money and Credit']);
  assert.equal(parseSyllabus(text)[2].marks, 5);
});

test('the answer an AI chat gives to our prompt', () => {
  const text = `Here are the chapters:

Chapter name | marks | size
Cell structure | 8 | M
Cell division | 6 | M
Photosynthesis | ? | L
`;
  assert.deepEqual(parseSyllabus(text), [
    { name: 'Cell structure', marks: 8, size: 'M' }, { name: 'Cell division', marks: 6, size: 'M' }, { name: 'Photosynthesis', size: 'L' },
  ]);
  assert.ok(AI_PROMPT.includes('chapter name | marks or ? | S, M or L'));
});

test('one line, separated by commas or semicolons', () => {
  assert.deepEqual(names('Real Numbers, Polynomials, Triangles, Circles'), ['Real Numbers', 'Polynomials', 'Triangles', 'Circles']);
  assert.deepEqual(names('Real Numbers; Polynomials; Triangles'), ['Real Numbers', 'Polynomials', 'Triangles']);
  // a comma inside a single chapter name is left alone when there are several lines
  assert.deepEqual(names('Gender, Religion and Caste\nFederalism'), ['Gender, Religion and Caste', 'Federalism']);
});

test('duplicates, blanks, dividers and junk are dropped', () => {
  assert.deepEqual(names('Light\nlight\n\n   \n----\n12345\n???\nSound'), ['Light', 'Sound']);
  assert.deepEqual(parseSyllabus(''), []); assert.deepEqual(parseSyllabus(null), []); assert.deepEqual(parseSyllabus('   \n\n'), []);
});

test('lines that differ only in their numbering stay separate chapters', () => {
  assert.deepEqual(names('Chapter 1: Revision\nChapter 2: Revision\nChapter 3: Revision'), ['Chapter 1: Revision', 'Chapter 2: Revision', 'Chapter 3: Revision']);
  assert.deepEqual(names('1. Poem\n2. Poem\n3. Story'), ['1. Poem', '2. Poem', 'Story']);
  assert.deepEqual(names('Unit 1 | 5 | S\nUnit 2 | 6 | L').length, 2);
  const long = Array.from({ length: 30 }, (_, i) => `Chapter ${i + 1}: A very long chapter title about the causes and consequences of something (${(i % 9) + 3} marks)`).join('\n');
  const got = parseSyllabus(long);
  assert.equal(got.length, 30); assert.equal(got[7].marks, 10); assert.ok(got.every((c) => c.name.length <= 80));
  assert.equal(new Set(got.map((c) => c.name)).size, 30);
  // true duplicates are still dropped
  assert.deepEqual(names('Light\nLight\n1. Light'), ['Light', '1. Light']);
});

test('very long input is capped, very long names are trimmed', () => {
  const many = Array.from({ length: 200 }, (_, i) => `Topic number ${i + 1}`).join('\n');
  assert.equal(parseSyllabus(many).length, 60);
  const long = one('A'.repeat(300));
  assert.ok(long.name.length <= 80);
});

test('silly marks are ignored, not trusted', () => {
  assert.deepEqual(one('Trigonometry (0 marks)'), { name: 'Trigonometry (0 marks)' });
  assert.deepEqual(one('Probability | 9999'), { name: 'Probability' });
});

test('Windows line endings', () => {
  assert.deepEqual(names('Light\r\nSound\r\nHeat'), ['Light', 'Sound', 'Heat']);
});

test('text read from a photo is cleaned before it is parsed', () => {
  const ocr = [
    'Class 10 Science',
    '',
    'e Chemical Reactions and Equations (7 marks)',
    '« Acids, Bases and Salts [6]',
    'o Metals and Non-metals     5',
    '3. Life Processes ........ 8 marks',
    '| Control and Coordination | 6 |',
    '— —',
    '12',
    '~~ ;: ..',
    'Light: Reflection and Refraction\t9',
  ].join('\n');
  const chapters = parseSyllabus(tidyOcr(ocr));
  assert.deepEqual(chapters.map((c) => [c.name, c.marks]), [
    ['Chemical Reactions and Equations', 7], ['Acids, Bases and Salts', 6], ['Metals and Non-metals', 5],
    ['Life Processes', 8], ['Control and Coordination', 6], ['Light: Reflection and Refraction', 9],
  ]);
  assert.equal(tidyOcr(''), ''); assert.equal(tidyOcr(null), ''); assert.equal(tidyOcr('.. -- 12\n ~'), '');
  // an ordinary word starting with e or o is left alone
  assert.equal(tidyOcr('electricity and magnetism\nOur Environment'), 'electricity and magnetism\nOur Environment');
});

test('a table read from a photo: the header row and the serial numbers go, the marks stay', () => {
  const ocr = [
    'CLASS X SOCIAL SCIENCE',
    'Periodic Test 2 Maximum Marks: 40',
    '"S.No.   ‘Chapter                                           Marks |',
    '1      Nationalism in India                                     8',
    '2       Resources and Development                              5',
    '3        Power Sharing                                                    6',
    '4 Federalism  5',
    '5 | Development | 6 |',
  ].join('\n');
  assert.deepEqual(parseSyllabus(tidyOcr(ocr)).map((c) => [c.name, c.marks]), [
    ['Nationalism in India', 8], ['Resources and Development', 5], ['Power Sharing', 6], ['Federalism', 5], ['Development', 6],
  ]);
  // serial numbers kept with a single space are dropped only when they count up
  assert.equal(tidyOcr('1 Light\n2 Sound\n3 Heat\n4 Motion'), 'Light\nSound\nHeat\nMotion');
  assert.equal(tidyOcr('3 Idiots review\n1857 Revolt\n12 Angry Men'), '3 Idiots review\n1857 Revolt\n12 Angry Men');
});

test('the title of the sheet is not a chapter, but a chapter that sounds like one is kept', () => {
  const titles = ['Class 10 Science — Half-yearly syllabus', 'Science portion for tomorrow', 'GRADE 9 Mathematics', 'Half Yearly Examination 2026', 'Time allowed: 3 hours', 'Std. X Unit Test 2'];
  for (const t of titles) assert.equal(tidyOcr(t), '', t);
  const real = ['Periodic Classification of Elements', '4. Class 10 revision of the mid-term paper', 'The Rise of Nationalism in Europe', 'Portrait of a Lady', 'Marks of a Good Citizen'];
  for (const t of real) assert.equal(parseSyllabus(tidyOcr(t)).length, 1, t);
  assert.equal(tidyOcr('+ Acids, Bases and Salts'), 'Acids, Bases and Salts');
});

test('a photo of a school circular: the name of the school and the note at the bottom are left out', () => {
  const ocr = [
    'GREENFIELD PUBLIC SCHOOL',
    'Half Yearly Examination 2026-27',
    'Class X Subject: Science       80',
    '| S.No | Name of the Chapter                                          Marks |',
    '    1.   | Chemical Reactions and Equations                              8      |',
    '     2.    | Acids, Bases and Salts                               i                7   |',
    '[ 3.    | Metals and Non-metals                                           7',
    '       | Carbon and its Compounds                                               6       [',
    '|   5.  [Life Processes                                           9     |',
    '|    8.   [Light - Reflection and Refraction                                  10      i',
    'Electricity',
    '|   11.   | Magnetic Effects of Electric Current      6      |',
    'Note: Students must bring their own geometry box. Paper will be of 3 hours.',
  ].join('\n');
  assert.deepEqual(parseSyllabus(tidyOcr(ocr)).map((c) => [c.name, c.marks]), [
    ['Chemical Reactions and Equations', 8], ['Acids, Bases and Salts', 7], ['Metals and Non-metals', 7], ['Carbon and its Compounds', 6],
    ['Life Processes', 9], ['Light - Reflection and Refraction', 10], ['Electricity', undefined], ['Magnetic Effects of Electric Current', 6],
  ]);
  // marks in square brackets are not table lines
  assert.deepEqual(parseSyllabus(tidyOcr('Light [7]\nSound [5]')).map((c) => [c.name, c.marks]), [['Light', 7], ['Sound', 5]]);
  // a short list with no marks keeps every line
  assert.equal(tidyOcr('History\nPower Sharing\nFederalism').split('\n').length, 3);
});

