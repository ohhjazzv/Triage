// Smart paste: turn a messy syllabus into a clean chapter list. Rules only, no AI.
//
// Understands, for example:
//   1. Chemical Reactions and Equations
//   Ch 3 - Metals and Non-metals (5 marks)
//   • Life Processes [6]
//   Light: Reflection and Refraction - 7m
//   Electricity | 8 | L
//   Genetics<TAB>9
//
// Returns [{ name, marks?, size? }]. Lines it cannot read as a chapter are left out.

const MAX_CHAPTERS = 60;
const MAX_NAME = 80;

const SIZE_WORDS = { s: 'S', small: 'S', short: 'S', m: 'M', medium: 'M', mid: 'M', l: 'L', large: 'L', long: 'L', big: 'L' };

function readSize(text) {
  const k = String(text || '').trim().toLowerCase();
  return SIZE_WORDS[k] || null;
}

function readMarks(text) {
  const m = /^\s*(\d{1,3}(?:\.\d+)?)\s*(?:marks?|m|pts?|points?)?\s*$/i.exec(String(text || ''));
  if (!m) return null;
  const v = parseFloat(m[1]);
  return v > 0 && v <= 500 ? v : null;
}

// "1.", "1)", "(1)", "-", "*", "•", "Ch 3 -", "Chapter 12:", "Unit 2 -", "Lesson 4."
const LEAD = /^\s*(?:[-*•–—·▪◦>]+|\(?\d{1,3}\)|\d{1,3}[.:]|(?:ch(?:apter|ap)?|unit|lesson|topic|module)\.?\s*\d{1,3}\s*[:.\-–—)]?|\d{1,3}\s*[-–—])\s*/i;

function stripLead(line) {
  let s = line, guard = 0;
  while (guard++ < 3) {
    const t = s.replace(LEAD, '');
    if (t === s || !t.trim()) break;
    s = t;
  }
  return s.trim();
}

function parseLine(raw) {
  let line = raw.replace(/\u00a0/g, ' ').trim();
  if (!line) return null;

  // Table-like lines: "name | marks | size" or "name<TAB>marks<TAB>size"
  if (/[|\t]/.test(line)) {
    const parts = line.split(/\s*[|\t]\s*/).map((p) => p.trim()).filter((p) => p !== '');
    if (parts.length >= 2) {
      // drop a leading serial number column: "3 | Metals | 5"
      if (parts.length >= 3 && /^\d{1,3}[.)]?$/.test(parts[0]) && !/^\d/.test(parts[1])) parts.shift();
      const name = stripLead(parts[0]);
      const out = { name };
      for (const p of parts.slice(1)) {
        const mk = readMarks(p), sz = readSize(p);
        if (mk != null && out.marks == null) out.marks = mk;
        else if (sz && !out.size) out.size = sz;
      }
      return finish(out);
    }
    line = parts[0] || '';
  }

  const out = {};

  // size in brackets at the end: "(long)", "[S]"
  let m = /\s*[\[(]\s*(small|short|medium|mid|large|long|big|s|m|l)\s*[\])]\s*$/i.exec(line);
  if (m) { out.size = readSize(m[1]); line = line.slice(0, m.index); }

  // marks at the end: "(5 marks)", "[6]", "(8)", "- 6m", ": 7 marks", "... 10 marks"
  m = /\s*[\[(]\s*(\d{1,3}(?:\.\d+)?)\s*(?:marks?|m|pts?|points?)?\s*[\])]\s*$/i.exec(line)
    || /\s*[-–—:,.]+\s*(\d{1,3}(?:\.\d+)?)\s*(?:marks?|m|pts?|points?)\s*$/i.exec(line)
    || /\s+(\d{1,3}(?:\.\d+)?)\s*(?:marks?|pts?|points?)\s*$/i.exec(line);
  if (m) {
    const v = parseFloat(m[1]);
    if (v > 0 && v <= 500) { out.marks = v; line = line.slice(0, m.index); }
  }

  out.name = stripLead(line);
  return finish(out);
}

function finish(out) {
  let name = String(out.name || '').replace(/\s+/g, ' ').replace(/^[\s:.\-–—]+|[\s:\-–—]+$/g, '').trim();
  if (!name) return null;
  if (!/[\p{L}]/u.test(name)) return null;                 // must contain a letter
  if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME - 1).trimEnd() + '…';
  const res = { name };
  if (out.marks != null) res.marks = out.marks;
  if (out.size) res.size = out.size;
  return res;
}

// Lines that are headings or chatter, not chapters.
function isNoise(line) {
  const s = line.trim();
  if (!s) return true;
  if (/^(?:syllabus|chapters?|topics?|portion|name|chapter name|s\.?\s*no\.?|sr\.?\s*no\.?)\s*[:|\t-]*\s*(?:marks?|size|length)?\s*[:|\t-]*\s*(?:marks?|size|length)?$/i.test(s)) return true;
  if (/^[-=_*#|\s]+$/.test(s)) return true;                // table rules and dividers
  if (/^(here (is|are)|sure|certainly|okay|ok)[\s,!.:]/i.test(s)) return true;   // an AI chat's opening line
  return false;
}

export function parseSyllabus(text) {
  let lines = String(text || '').replace(/\r/g, '').split(/\n|;(?=\s*\S)/);
  // Everything on one line, separated by commas: "Real Numbers, Polynomials, Triangles"
  const filled = lines.filter((l) => l.trim());
  if (filled.length === 1 && !/[|\t]/.test(filled[0]) && (filled[0].match(/,/g) || []).length >= 2) lines = filled[0].split(',');
  const seen = new Set(), out = [];
  for (const raw of lines) {
    if (isNoise(raw)) continue;
    // A bare heading such as "History:" groups what follows; it is not a chapter itself.
    if (/^[^|\t\d]{2,40}:\s*$/.test(raw.trim())) continue;
    const ch = parseLine(raw);
    if (!ch) continue;
    const key = ch.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(ch);
    if (out.length >= MAX_CHAPTERS) break;
  }
  return out;
}

/** The prompt a student can paste into any AI chat along with a photo of their syllabus. */
export const AI_PROMPT =
  'List every chapter in this syllabus, one per line, as:\n' +
  'chapter name | marks or ? | S, M or L for length\n' +
  'Nothing else. No heading, no numbering.';
