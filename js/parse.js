// Smart paste: turn a messy syllabus into a clean chapter list. Rules only, no AI.
// (Text read from a photo comes through tidyOcr() below first.)
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
      const out = { name, full: parts[0] };
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
  out.full = line;
  return finish(out);
}

const tidy = (text) => String(text || '').replace(/\s+/g, ' ').replace(/^[\s:.\-–—*•·>]+|[\s:\-–—]+$/g, '').trim();
const clip = (name) => (name.length > MAX_NAME ? name.slice(0, MAX_NAME - 1).trimEnd() + '…' : name);

function finish(out) {
  const name = tidy(out.name);
  if (!name) return null;
  if (!/[\p{L}]/u.test(name)) return null;                 // must contain a letter
  const res = { name: clip(name) };
  const full = clip(tidy(out.full));
  if (full && full !== res.name) res.full = full;          // the line with its numbering kept, in case two names clash
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
  const seen = new Set(), out = [], firstWith = new Map();
  for (const raw of lines) {
    if (isNoise(raw)) continue;
    // A bare heading such as "History:" groups what follows; it is not a chapter itself.
    if (/^[^|\t\d]{2,40}:\s*$/.test(raw.trim())) continue;
    const ch = parseLine(raw);
    if (!ch) continue;
    const full = ch.full; delete ch.full;
    let key = ch.name.toLowerCase();
    // "Chapter 1: Revision" and "Chapter 2: Revision" must stay two chapters: keep the numbering when names clash.
    if (seen.has(key) && full && !seen.has(full.toLowerCase())) {
      const first = firstWith.get(key);
      if (first && first.full && !seen.has(first.full.toLowerCase())) { out[first.i].name = first.full; seen.add(first.full.toLowerCase()); firstWith.delete(key); }
      ch.name = full; key = full.toLowerCase();
    }
    if (seen.has(key)) continue;
    if (full) firstWith.set(key, { i: out.length, full });
    seen.add(key); out.push(ch);
    if (out.length >= MAX_CHAPTERS) break;
  }
  return out;
}

/**
 * Clean up text that came from reading a photo (OCR), before smart paste looks at it.
 * Photo readers turn bullets into stray letters, split table columns with runs of spaces,
 * and pick up specks as punctuation. Returns tidy lines, one possible chapter per line.
 */
const PAGE_HEADING = /\b(?:syllabus|portions?|date\s*sheet|time\s*table|half[\s-]*yearly|mid[\s-]*term|periodic\s+test|unit\s+test|examination|max(?:imum)?\.?\s*marks|time\s+allowed|(?:class|grade|std\.?)\s*[-:]?\s*(?:\d{1,2}|[ivx]{1,4})\b)/i;
const NUMBERED = /^\s*(?:\(?\d{1,3}[.):]|(?:ch(?:apter)?|unit|lesson)\.?\s*\d)/i;
// the top row of a table: nothing but column names
const TABLE_HEAD = /^(?:(?:s\.?\s*no\.?|sr\.?\s*no\.?|sl\.?\s*no\.?|no\.?|chapters?|lessons?|topics?|units?|names?|of|the|marks?|weightage|periods?|pages?)[\s|:.]*)+$/i;

export function tidyOcr(text) {
  const out = [];
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    let line = raw.replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[|¦]/g, ' | ').trim();
    if (!line) continue;
    // what is left of a table's lines and the edge of the paper: stray brackets, and odd short
    // "words" standing well apart from the text at either end of the line
    const open = (line.match(/[\[{]/g) || []).length, shut = (line.match(/[\]}]/g) || []).length;
    if (open !== shut) line = line.replace(/[\[\]{}]/g, ' | ');
    for (let guard = 0, before = null; before !== line && guard < 6; guard++) {
      before = line;
      line = line.replace(/[\s|]+$/, '').replace(/\s{2,}[^\s\d]{1,3}$/, '');                       // "...  8      |     EF"
      line = line.replace(/^[\s|]+/, '').replace(/^(?:[^\s\d]\S{0,2}\s+){1,3}\s{2,}(?=\S)/, '');   // "l {       3. Metals"
      line = line.replace(/^\d{1,3}\s{3,}(?=\d{1,3}[.)]\s)/, '');                                  // "3       7. How do"
    }
    line = line.replace(/(\s{2,}|\|\s*)[iIl!](?=\s{2,}|\s*\||\s*$)/g, '$1').trim();
    if (!line) continue;
    // a bullet read as a symbol or a lone letter: "e Light", "o Sound", "« Heat", "¢ Motion", "+ Force"
    line = line.replace(/^(?:[•●■□▪◦○*+«»¢©®°>~=_—–-]+|[eo0])\s+(?=[A-Z0-9(])/, '');
    // a table row: "Light     7" or "Light ..... 7" -> "Light | 7"
    line = line.replace(/\s*(?:\.{3,}|\s{2,}|\t+)\s*(\d{1,3}(?:\.\d+)?)\s*(marks?|m)?[\s|]*$/i, ' | $1');
    // a serial-number column: "3      Power Sharing" -> "3. Power Sharing"
    line = line.replace(/^(\d{1,3})(?:\s{2,}|\s*\|\s*)(?=\p{L})/u, '$1. ');
    line = line.replace(/\s*\|\s*(?:\|\s*)+/g, ' | ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').replace(/[ \t]{2,}/g, ' ').trim();
    // specks at the edges of the page read as quote marks
    line = line.replace(/(^|\s)["']+(?=\p{L})/gu, '$1').replace(/^[\s"',.;:_~^]+/, '').trim();
    const letters = (line.match(/\p{L}/gu) || []).length;
    if (letters < 3) continue;                                  // specks, page numbers, rules
    if (letters / line.replace(/\s/g, '').length < 0.5) continue;   // mostly symbols: not a chapter
    if (TABLE_HEAD.test(line.replace(/[\s|]*\d{0,3}$/, ''))) continue;
    if (PAGE_HEADING.test(line) && !NUMBERED.test(line)) continue;   // the title of the sheet, not a chapter
    out.push(line);
  }
  // When nearly every line carries marks, it is a table: lines above and below it are the school's
  // name and a note at the bottom, not chapters. (Lines inside the table are always kept.)
  const marked = out.map((l) => /\|\s*\d{1,3}(?:\.\d+)?$|\d\s*(?:marks?|m)?\s*[\])]\s*$|\d\s*marks?\s*$/i.test(l));
  const hits = marked.filter(Boolean).length;
  if (hits >= 4 && hits >= out.length * 0.6) {
    const row = out.map((l, k) => marked[k] || NUMBERED.test(l));      // a numbered line is a row even if its marks were not read
    out.splice(row.lastIndexOf(true) + 1); out.splice(0, row.indexOf(true));
  }

  // Serial numbers the reader kept with a single space: "1 Light", "2 Sound", "3 Heat" -> drop the numbers
  const serial = out.map((l) => /^(\d{1,3})[.)]?\s+(?=\p{L})/u.exec(l)).map((m) => (m ? +m[1] : null));
  const counted = serial.filter((v) => v != null);
  let inOrder = 0;
  for (let i = 1; i < counted.length; i++) if (counted[i] === counted[i - 1] + 1) inOrder++;
  if (counted.length >= 3 && inOrder >= (counted.length - 1) * 0.6) {
    for (let i = 0; i < out.length; i++) if (serial[i] != null) out[i] = out[i].replace(/^\d{1,3}[.)]?\s+/, '');
  }
  return out.join('\n');
}

/** The prompt a student can paste into any AI chat along with a photo of their syllabus. */
export const AI_PROMPT =
  'List every chapter in this syllabus, one per line, as:\n' +
  'chapter name | marks or ? | S, M or L for length\n' +
  'Nothing else. No heading, no numbering.';
