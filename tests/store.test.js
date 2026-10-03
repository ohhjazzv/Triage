import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blank, load, save, cleanExam, cleanState, encodeShare, decodeShare, exportJson, importJson, KEY } from '../js/store.js';

// A stand-in for the browser's localStorage.
function fakeStorage(init = {}) {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

const exam = () => cleanExam({
  name: 'Biology test', at: '2026-10-05T08:00', total: 50, wake: '06:00', sleepHours: 8,
  sessions: [{ day: '2026-10-04', start: '18:00', end: null }],
  chapters: [
    { id: 'cs', name: 'Cell structure', marks: 8, size: 'M', know: 'easy', m: 0.9, tau: 55, pin: 1, minutes: 50 },
    { id: 'ge', name: 'Genetics', marks: 9, size: 'L', know: 'bits', drop: true },
    { id: 'ev', name: 'Evolution', size: 'M', know: 'blank' },
  ],
  log: [{ chapterId: 'cs', minutes: 25, recalled: 'most', at: '2026-10-04T18:30' }],
  result: { marks: 31 },
});

test('save then load gives the same state back', () => {
  const st = fakeStorage(), s = blank();
  s.exams.push(exam()); s.active = s.exams[0].id;
  assert.equal(save(st, s), true);
  assert.deepEqual(load(st), s);
});

test('nothing saved yet: a clean state', () => {
  assert.deepEqual(load(fakeStorage()), blank());
});

test('broken saved data never crashes: it is set aside and a clean state comes back', () => {
  for (const bad of ['{not json', '[]', '"hello"', '{"exams": 5}', 'null', '{"exams":[{"chapters":"x"}]}']) {
    const st = fakeStorage({ [KEY]: bad });
    const s = load(st);
    assert.deepEqual(s.exams, []); assert.equal(s.active, null);
  }
  const st = fakeStorage({ [KEY]: '{oops' }); load(st);
  assert.equal(st.data[KEY + '-broken'], '{oops');
});

test('storage that throws (private mode, full disk) is survived', () => {
  const angry = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(load(angry), blank());
  assert.equal(save(angry, blank()), false);
});

test('cleanExam clamps everything it is given', () => {
  const e = cleanExam({
    name: 'x'.repeat(500), total: 1e9, sleepHours: 2, wake: 'late', morningMin: -5, enoughPct: 99,
    chapters: [{ name: '  Light  ', marks: -4, size: 'XL', know: 'genius', m: 9, tau: -1, pin: 500 }, { name: '' }, null, 'junk'],
    sessions: [{ day: 'tomorrow', start: '18:00' }, { day: '2026-10-04', start: '18:00', end: '99:99' }],
  });
  assert.equal(e.name.length, 60); assert.equal(e.total, 1000); assert.equal(e.wake, '06:00'); assert.equal(e.morningMin, 0);
  assert.equal(e.sleepHours, 6, 'sleep is never under 6 hours');
  assert.equal(e.enoughPct, 5);
  assert.equal(e.chapters.length, 1);
  const c = e.chapters[0];
  assert.equal(c.name, 'Light'); assert.equal(c.marks, undefined); assert.equal(c.size, 'M'); assert.equal(c.know, null);
  assert.equal(c.m, 0.95); assert.equal(c.tau, undefined); assert.equal(c.pin, 40);
  assert.deepEqual(e.sessions, [{ day: '2026-10-04', start: '18:00', end: null }]);
  assert.equal(cleanExam({ chapters: [] }), null); assert.equal(cleanExam(null), null);
});

test('duplicate chapter ids are made unique', () => {
  const e = cleanExam({ chapters: [{ id: 'a', name: 'One' }, { id: 'a', name: 'Two' }] });
  assert.notEqual(e.chapters[0].id, e.chapters[1].id);
});

test('cleanState keeps a valid active exam and repairs an invalid one', () => {
  const e = exam();
  assert.equal(cleanState({ exams: [e], active: 'nope' }).active, e.id);
  assert.equal(cleanState({ exams: [e], active: e.id, settings: { theme: 'neon' } }).settings.theme, undefined);
  assert.equal(cleanState({ exams: [e], active: e.id, settings: { theme: 'dark' } }).settings.theme, 'dark');
});

test('class link: round trip keeps the exam and its chapters', () => {
  const e = exam(), back = decodeShare(encodeShare(e));
  assert.equal(back.name, 'Biology test'); assert.equal(back.at, '2026-10-05T08:00'); assert.equal(back.total, 50);
  assert.deepEqual(back.chapters.map((c) => [c.name, c.marks, c.size]), [['Cell structure', 8, 'M'], ['Genetics', 9, 'L'], ['Evolution', undefined, 'M']]);
});

test('class link carries nothing personal', () => {
  const e = exam(), code = encodeShare(e);
  const json = JSON.parse(Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  assert.deepEqual(Object.keys(json).sort(), ['a', 'c', 'n', 't', 'v']);
  for (const row of json.c) assert.equal(row.length, 3);            // name, marks, size and nothing else
  const back = decodeShare(code);
  for (const c of back.chapters) {
    assert.equal(c.know, null); assert.equal(c.m, undefined); assert.equal(c.tau, undefined);
    assert.equal(c.pin, 0); assert.equal(c.drop, false); assert.equal(c.minutes, 0);
  }
  assert.deepEqual(back.log, []); assert.equal(back.result, null); assert.deepEqual(back.sessions, []);
  assert.notEqual(back.id, e.id);
  const text = JSON.stringify(json);
  for (const secret of ['easy', 'bits', 'wake', 'sleep', '06:00', 'recalled', '"m"', 'tau']) assert.ok(!text.includes(secret), secret);
});

test('class link: names in any language, and URL-safe characters only', () => {
  const e = cleanExam({ name: 'संस्कृत परीक्षा', chapters: [{ name: 'बुद्धिर्बलवती सदा' }, { name: 'Ünïcödé & "quotes" <tags>' }] });
  const code = encodeShare(e);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShare(code).chapters.map((c) => c.name), ['बुद्धिर्बलवती सदा', 'Ünïcödé & "quotes" <tags>']);
});

test('class link: rubbish is refused, not trusted', () => {
  for (const bad of ['', 'abc', '!!!!', 'e30', encodeShare({ name: 'x', chapters: [] }).slice(0, 10)]) assert.equal(decodeShare(bad), null, bad);
  const evil = Buffer.from(JSON.stringify({ v: 1, n: 'x', c: [['A', 'lots', 'XL'], 'junk', [null]] })).toString('base64url');
  const got = decodeShare(evil);
  assert.equal(got.chapters.length, 1); assert.equal(got.chapters[0].marks, undefined); assert.equal(got.chapters[0].size, 'M');
});

test('export and import', () => {
  const s = blank(); s.exams.push(exam()); s.active = s.exams[0].id;
  assert.deepEqual(importJson(exportJson(s)), s);
  assert.equal(importJson('nope'), null); assert.equal(importJson('{"exams":[]}'), null);
});

test('a date that is not a date, and answers that are not answers, are thrown away', () => {
  const base = { name: 'x', total: 50, chapters: [{ name: 'A', know: 'constructor', size: 'toString' }, { name: 'B', know: '__proto__', size: 'L' }] };
  for (const at of [1e12, {}, [], 'soon', '2026-13-45T99:99', '2026-10-05', true]) assert.equal(cleanExam({ ...base, at }).at, null, String(at));
  assert.equal(cleanExam({ ...base, at: '2026-10-05T08:00:00.000Z' }).at, '2026-10-05T08:00');
  const e = cleanExam(base);
  assert.deepEqual(e.chapters.map((c) => [c.know, c.size]), [[null, 'M'], [null, 'L']]);
  assert.equal(e.enoughPct, 0.5);
});

