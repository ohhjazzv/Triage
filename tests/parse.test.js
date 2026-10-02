import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSyllabus, AI_PROMPT } from '../js/parse.js';

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
