/* ── tests/journey-core.test.js ────────────────────────────────────────────
   Offline cover for journey-core.js — how the Journey book is made: the
   title, where a page may end (Thai included), the book's sides and views,
   which layout fits, the fold of a turning sheet, and the ink each stretch
   of a day is written in.

       node --test tests/journey-core.test.js

   Run once, not swept: journey-core.js holds no date code, and the last case
   proves it. Every text here is synthetic. Combining marks are built with
   String.fromCharCode so no escape sequence can be mistaken for the
   character it names.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'journey-core.js'), 'utf8'),
  { filename: 'journey-core.js' });
const J = globalThis.TrackJourney;

// A pretend page that holds `cap` characters, `head` fewer under a day's
// heading. Monotone, as real line breaking is.
const fitsBy = (cap, head = 0, probes = null) => (s, e, first) => {
  if (probes) probes.n++;
  return e - s <= cap - (first ? head : 0);
};

const SPACE = /[\t\n\v\f\r ]/;
const THAI_MARKS = [0x0e31, 0x0e33, 0x0e34, 0x0e35, 0x0e36, 0x0e37, 0x0e38, 0x0e39, 0x0e3a,
  0x0e47, 0x0e48, 0x0e49, 0x0e4a, 0x0e4b, 0x0e4c, 0x0e4d, 0x0e4e];
const startsWithMark = s => THAI_MARKS.includes(s.charCodeAt(0));

// cutText's whole contract, on any text: contiguous apart from the whitespace
// each page broke on, starting at the first visible character, ending at the
// last, no page empty or starting with whitespace — so nothing is lost or
// shown twice.
function assertContract(text, pages, label) {
  const first = text.search(/\S/), last = text.replace(/\s+$/, '').length;
  assert.ok(pages.length > 0, label + ': at least one page');
  assert.equal(pages[0].start, first, label + ': starts at the first visible character');
  assert.equal(pages[pages.length - 1].end, last, label + ': ends at the last');
  pages.forEach((p, i) => {
    assert.ok(p.end > p.start, label + ': page ' + i + ' is not empty');
    assert.equal(SPACE.test(text.charAt(p.start)), false, label + ': page ' + i + ' does not start with whitespace');
    assert.equal(p.first, i === 0, label + ': only the first page is under the heading');
    if (i) {
      const gap = text.slice(pages[i - 1].end, p.start);
      assert.ok(/^\s*$/.test(gap), label + ': only whitespace between pages ' + (i - 1) + ' and ' + i + ': ' + JSON.stringify(gap));
    }
  });
}

// ── the title ──────────────────────────────────────────────────────────────

test('the title is the user\'s words verbatim, capital I included, three lines broken after each comma', () => {
  assert.deepEqual(J.TITLE_LINES, ['To myself,', 'For myself,', 'The Finest of FIn']);
  assert.equal(J.TITLE_LINES.join(' '), 'To myself, For myself, The Finest of FIn');
  assert.ok(Object.isFrozen(J.TITLE_LINES), 'and nothing can rewrite it at run time');
});

// ── break points ───────────────────────────────────────────────────────────

test('a page may end where a run of whitespace starts, and at the last visible character', () => {
  assert.deepEqual(J.breakPoints('one two  three\nfour'), [3, 7, 14, 19]);
  assert.deepEqual(J.breakPoints('abc  \n'), [3], 'trailing whitespace is not a page');
  assert.deepEqual(J.breakPoints('  abc'), [5], 'leading whitespace is not a break either');
  const nbsp = String.fromCharCode(0xa0);
  assert.deepEqual(J.breakPoints('a' + nbsp + 'b c'), [3, 5], 'a no-break space holds its two words together');
  assert.deepEqual(J.breakPoints(''), []);
  assert.deepEqual(J.breakPoints(null), []);
});

test('Thai, written without spaces, breaks between WORDS — never inside one', () => {
  const s = 'ฉันรักภาษาไทย';
  assert.deepEqual(J.breakPoints(s).map(i => s.slice(0, i)), ['ฉัน', 'ฉันรัก', 'ฉันรักภาษา', 'ฉันรักภาษาไทย']);
  const para = 'ฉันรักภาษาไทยมากและอยากเขียนบันทึกทุกวัน';
  const words = new Set([...new Intl.Segmenter('th', { granularity: 'word' }).segment(para)].map(x => x.index));
  const bps = J.breakPoints(para);
  assert.ok(bps.length > 5, 'a space-less paragraph has many places to end a page');
  bps.slice(0, -1).forEach(j => {
    assert.ok(words.has(j), j + ' is a word boundary');
    assert.equal(startsWithMark(para.slice(j)), false, 'no break before a vowel or tone mark at ' + j);
  });
});

test('without Intl.Segmenter a Thai run has no inner break — it falls to the grapheme cut instead', () => {
  const para = 'ฉันรักภาษาไทย มากและอยาก';
  assert.deepEqual(J.breakPoints(para, { intl: null }), [13, para.length], 'only the space and the end');
  assert.deepEqual(J.breakPoints(para, { intl: {} }), [13, para.length], 'an Intl with no Segmenter is the same');
});

test('a grapheme cluster is never split, with or without the segmenter', () => {
  const kii = 'ก' + String.fromCharCode(0x0e35, 0x0e48); // ก + SARA II + MAI EK
  const e = 'e' + String.fromCharCode(0x0301);           // e + combining acute
  const smile = String.fromCodePoint(0x1f600);           // two code units
  const coder = String.fromCodePoint(0x1f469) + String.fromCharCode(0x200d) + String.fromCodePoint(0x1f4bb);
  for (const opts of [undefined, { intl: null }]) {
    const tag = opts ? ' (no segmenter)' : '';
    assert.deepEqual(J.clusterEnds(kii, 0, 3, opts), [3], 'กี่ is one cluster' + tag);
    assert.deepEqual(J.clusterEnds(e + 'x', 0, 3, opts), [2, 3], 'é then x' + tag);
    assert.deepEqual(J.clusterEnds(smile + 'a', 0, 3, opts), [2, 3], 'a surrogate pair stays whole' + tag);
    assert.deepEqual(J.clusterEnds(coder, 0, coder.length, opts), [coder.length], 'a ZWJ sequence stays whole' + tag);
  }
});

// ── cutting a day ──────────────────────────────────────────────────────────

const LOREM = Array.from({ length: 160 }, (_, i) => ['quill', 'ink', 'parchment', 'candle', 'road',
  'mountain', 'river', 'wander'][i % 8] + (i % 13 === 12 ? '.\n\n' : i % 5 === 4 ? ',  ' : ' ')).join('');

test('cutText keeps every character exactly once, breaking only at break points', () => {
  const text = '\n  ' + LOREM + '\n\n';
  const pages = J.cutText(text, fitsBy(120));
  assertContract(text, pages, 'lorem');
  const bps = new Set(J.breakPoints(text));
  pages.forEach((p, i) => {
    assert.ok(bps.has(p.end), 'page ' + i + ' ends at a break point');
    assert.ok(p.end - p.start <= 120, 'page ' + i + ' fits');
  });
  assert.ok(pages.length >= 8, 'a long day runs over several pages: ' + pages.length);
});

test('cutText is greedy: no page could have taken the next word', () => {
  const text = LOREM;
  const fits = fitsBy(97, 30);
  const pages = J.cutText(text, fits);
  const bps = J.breakPoints(text);
  pages.slice(0, -1).forEach((p, i) => {
    const next = bps.find(b => b > p.end);
    assert.equal(fits(p.start, next, p.first), false, 'page ' + i + ' was filled as far as it could be');
  });
});

test('the first page holds less: the day\'s heading sits above it', () => {
  const pages = J.cutText(LOREM, fitsBy(100, 40));
  assert.ok(pages[0].end - pages[0].start <= 60, 'the first page is cut under its heading');
  assert.ok(pages[1].end - pages[1].start > 60, 'and the second uses the whole page');
});

test('a word longer than a page is cut between clusters, and every page still fits', () => {
  const giant = 'start ' + 'x'.repeat(250) + ' end';
  const pages = J.cutText(giant, fitsBy(40));
  assertContract(giant, pages, 'giant');
  pages.forEach((p, i) => assert.ok(p.end - p.start <= 40, 'page ' + i + ' fits'));
});

test('cutting always finishes: nothing fitting still takes one cluster per page', () => {
  const text = 'ab ' + 'ก' + String.fromCharCode(0x0e35, 0x0e48) + 'c';
  const pages = J.cutText(text, () => false);
  assert.deepEqual(pages.map(p => text.slice(p.start, p.end)), ['a', 'b', 'กี่', 'c']);
});

test('Thai cuts at word boundaries and rejoins exactly; no page starts with a mark', () => {
  const para = 'ฉันรักภาษาไทยมากและอยากเขียนบันทึกทุกวัน'.repeat(6);
  const pages = J.cutText(para, fitsBy(23));
  assertContract(para, pages, 'thai');
  assert.equal(pages.map(p => para.slice(p.start, p.end)).join(''), para, 'no spaces, so the pages rejoin exactly');
  const words = new Set([...new Intl.Segmenter('th', { granularity: 'word' }).segment(para)].map(x => x.index));
  pages.slice(1).forEach((p, i) => {
    assert.ok(words.has(p.start), 'page ' + (i + 1) + ' starts on a word');
    assert.equal(startsWithMark(para.slice(p.start)), false, 'page ' + (i + 1) + ' starts on a consonant');
  });
});

test('Thai without the segmenter still never tears a mark from its consonant', () => {
  const para = 'ฉันรักภาษาไทยมากและอยากเขียนบันทึกทุกวัน'.repeat(4);
  const pages = J.cutText(para, fitsBy(11), { intl: null });
  assertContract(para, pages, 'thai, no segmenter');
  assert.equal(pages.map(p => para.slice(p.start, p.end)).join(''), para);
  pages.forEach((p, i) => assert.equal(startsWithMark(para.slice(p.start)), false, 'page ' + i));
});

test('blank text has no pages, and a missing measure cuts nothing', () => {
  for (const t of ['', '   \n\t ', null, undefined, 42]) assert.deepEqual(J.cutText(t, fitsBy(10)), []);
  assert.deepEqual(J.cutText('words here', null), []);
});

test('a seed from the last page changes the probes, never the cut', () => {
  const plain = { n: 0 }, seeded = { n: 0 };
  const a = J.cutText(LOREM, fitsBy(150, 20, plain));
  const b = J.cutText(LOREM, fitsBy(150, 20, seeded), { guess: 130 });
  assert.deepEqual(b, a);
  assert.ok(seeded.n <= plain.n, 'and a good seed costs no more measuring: ' + seeded.n + ' <= ' + plain.n);
});

// ── the book ───────────────────────────────────────────────────────────────

const DAYS = [
  { day: '2026-10-20', text: LOREM },
  { day: '2026-10-21', text: 'A short day.' },
  { day: '2026-10-22', text: 'Another, also short.' }
];
const cutBy = (cap, head) => d => J.cutText(d.text, fitsBy(cap, head));

test('buildPages: the title page, then every day starting a FRESH page, folios from 1', () => {
  const pages = J.buildPages(DAYS, cutBy(200, 40));
  assert.deepEqual(pages[0], { kind: 'title' });
  const dayPages = pages.slice(1);
  assert.ok(dayPages.every(p => p.kind === 'day'));
  assert.deepEqual(dayPages.map(p => p.folio), dayPages.map((_, i) => i + 1));
  DAYS.forEach(d => {
    const mine = dayPages.filter(p => p.day === d.day);
    assert.ok(mine.length >= 1, d.day + ' is bound');
    assert.equal(mine[0].first, true, d.day + ' begins on its own page, under its heading');
    assert.ok(mine.slice(1).every(p => !p.first), 'and only there');
    assert.equal(mine.map(p => p.text).join(' ').replace(/\s+/g, ' '), d.text.trim().replace(/\s+/g, ' '),
      d.day + '\'s pages hold its text, in order');
  });
  for (let i = 1; i < dayPages.length; i++) {
    if (dayPages[i].day !== dayPages[i - 1].day) assert.equal(dayPages[i].first, true, 'a new day never shares a page');
  }
  assert.ok(dayPages.filter(p => p.day === '2026-10-20').length >= 2, 'the long day runs over pages');
});

test('buildPages: nothing to bind is the title page and the page saying how', () => {
  assert.deepEqual(J.buildPages([], cutBy(100)), [{ kind: 'title' }, { kind: 'empty' }]);
  assert.deepEqual(J.buildPages(null, cutBy(100)), [{ kind: 'title' }, { kind: 'empty' }]);
  assert.deepEqual(J.buildPages([null, { day: 1 }, 'x'], cutBy(100)), [{ kind: 'title' }, { kind: 'empty' }]);
});

test('buildPages: a day whose cut comes back empty still gets its heading page', () => {
  const pages = J.buildPages([{ day: '2026-10-20', text: 'x' }], () => []);
  assert.equal(pages.length, 2);
  assert.deepEqual([pages[1].kind, pages[1].day, pages[1].first, pages[1].text], ['day', '2026-10-20', true, '']);
});

test('the spread opens like a book — inside cover, title page — and pairs every side', () => {
  const pages = J.buildPages(DAYS, cutBy(200, 40));
  const spread = J.sidesFor(pages, J.SPREAD);
  assert.deepEqual(spread.slice(0, 2).map(p => p.kind), ['endpaper', 'title']);
  assert.equal(spread.length % 2, 0, 'an even number of sides');
  if ((pages.length + 1) % 2) assert.equal(spread[spread.length - 1].kind, 'blank', 'an odd count ends on a blank page');
  assert.equal(J.viewCount(spread, J.SPREAD), spread.length / 2);
  const single = J.sidesFor(pages, J.SINGLE);
  assert.deepEqual(single, pages, 'one page at a time starts on the title page');
  assert.equal(J.viewCount(single, J.SINGLE), pages.length);
  assert.deepEqual(J.sidesOfView(3, J.SPREAD), [6, 7]);
  assert.deepEqual(J.sidesOfView(3, J.SINGLE), [3]);
  assert.equal(J.viewOfSide(7, J.SPREAD), 3);
  assert.equal(J.viewOfSide(7, J.SINGLE), 7);
});

test('the reader stays on the same passage across a re-cut and a change of layout', () => {
  const small = J.sidesFor(J.buildPages(DAYS, cutBy(90, 30)), J.SINGLE);
  const big = J.sidesFor(J.buildPages(DAYS, cutBy(260, 40)), J.SPREAD);
  small.forEach((p, view) => {
    if (p.kind !== 'day') return;
    const anchor = J.anchorOfView(small, view, J.SINGLE);
    assert.deepEqual(anchor, { day: p.day, offset: p.start });
    const there = J.sidesOfView(J.viewOfAnchor(big, anchor, J.SPREAD), J.SPREAD).map(i => big[i]);
    assert.ok(there.some(q => q && q.day === p.day && q.start <= p.start && (q.end >= p.start || q.part === q.parts - 1)),
      'the passage at ' + p.day + ':' + p.start + ' is on the spread it lands on');
  });
});

test('anchors: the title, a day removed since, and the empty book', () => {
  const sides = J.sidesFor(J.buildPages(DAYS, cutBy(200, 40)), J.SPREAD);
  assert.deepEqual(J.anchorOfView(sides, 0, J.SPREAD), { kind: 'title' });
  assert.equal(J.viewOfAnchor(sides, { kind: 'title' }, J.SPREAD), 0);
  const later = sides.findIndex(p => p.day === '2026-10-21');
  assert.equal(J.viewOfAnchor(sides, { day: '2026-10-20T', offset: 0 }, J.SPREAD), J.viewOfSide(later, J.SPREAD),
    'a day no longer bound lands on the next later day');
  const lastDay = sides.map((p, i) => [p, i]).filter(x => x[0].kind === 'day').pop()[1];
  assert.equal(J.viewOfAnchor(sides, { day: '2027-01-01', offset: 0 }, J.SPREAD), J.viewOfSide(lastDay, J.SPREAD),
    'past every day, the last one');
  const empty = J.sidesFor(J.buildPages([], cutBy(100)), J.SINGLE);
  assert.deepEqual(J.anchorOfView(empty, 1, J.SINGLE), { kind: 'empty' });
  assert.equal(J.viewOfAnchor(empty, { day: '2026-10-20', offset: 0 }, J.SINGLE), 0, 'nothing bound: the title page');
  const after = J.sidesFor(J.buildPages(DAYS, cutBy(200, 40)), J.SINGLE);
  assert.equal(J.viewOfAnchor(after, { kind: 'empty' }, J.SINGLE), 1, 'the how-to page gone: the first day');
  assert.equal(J.viewOfAnchor([], { kind: 'title' }, J.SINGLE), 0);
});

// ── which layout fits ──────────────────────────────────────────────────────

test('chooseLayout opens flat only where two pages fit and show as much paper as one', () => {
  const cases = [[1440, 900, 'spread'], [1280, 720, 'spread'], [1180, 820, 'spread'], [1000, 900, 'spread'],
    [390, 844, 'single'], [820, 1180, 'single'], [844, 390, 'single'], [600, 900, 'single']];
  for (const [w, h, mode] of cases) {
    const L = J.chooseLayout(w, h);
    const tag = w + 'x' + h;
    assert.equal(L.mode, mode, tag);
    assert.ok(Number.isInteger(L.pageW) && Number.isInteger(L.pageH), tag + ': whole pixels');
    const bookW = L.mode === J.SPREAD ? 2 * L.pageW : L.pageW;
    assert.ok(L.left >= 0 && L.top >= 0 && L.left + bookW <= w && L.top + L.pageH <= h, tag + ': the book is on screen');
    if (L.mode === J.SPREAD) assert.ok(L.pageW >= J.MIN_PAGE_W, tag + ': a readable page');
    else assert.ok(L.pageW <= L.pageH * 0.8 + 1, tag + ': a page alone never turns into a wide scroll');
  }
  const phone = J.chooseLayout(390, 844);
  assert.ok(phone.pageW >= 370 && phone.pageH >= 820, 'on a phone the page fills the screen: ' + phone.pageW + 'x' + phone.pageH);
  assert.equal(J.chooseLayout(0, 0).mode, J.SINGLE, 'total');
});

test('typeFor: a whole number of lines that fits the page, in a readable size', () => {
  for (const [w, h] of [[1440, 900], [390, 844], [820, 1180], [844, 390]]) {
    const L = J.chooseLayout(w, h), T = J.typeFor(L);
    assert.equal(T.textH, T.lines * T.lh, w + 'x' + h + ': whole lines');
    assert.ok(T.top + T.textH + T.bottom <= L.pageH, w + 'x' + h + ': inside the page');
    assert.ok(T.fs >= 16 && T.fs <= 23, w + 'x' + h + ': ' + T.fs + 'px');
    if (L.mode === J.SINGLE) assert.ok(T.top >= 58, 'a page alone keeps its head clear for the close button');
  }
});

// ── the fold ───────────────────────────────────────────────────────────────

const W = 400, H = 600;
const near = top => ({ x: 0, y: top ? 0 : H }), far = top => ({ x: 0, y: top ? H : 0 });
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, msg + ': ' + a + ' vs ' + b);
const det = m => m[0] * m[3] - m[1] * m[2];

// Deterministic spread of drag points across and beyond the book.
const POINTS = [];
for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) POINTS.push({ x: -1.3 * W + i * 0.33 * W, y: -0.4 * H + j * 0.3 * H });

test('at rest the sheet lies flat', () => {
  for (const top of [false, true]) {
    const f = J.fold(W, H, top, J.corner(W, H, top));
    assert.equal(f.flat, true);
    assert.equal(f.progress, 0);
    assert.equal(J.area(f.keep), W * H);
    assert.deepEqual(f.flap, []);
  }
});

test('the clamp keeps every corner where paper can be', () => {
  for (const top of [false, true]) for (const P of POINTS) {
    const p = J.clampCorner(P, W, H, top);
    assert.ok(d(p, near(top)) <= W + 1e-6, 'within W of its own hinge point');
    assert.ok(d(p, far(top)) <= Math.hypot(W, H) + 1e-6, 'within the diagonal of the other');
    assert.ok(top ? p.y >= -1e-9 : p.y <= H + 1e-9, 'never below the table');
  }
});

test('every fold: the crease reflects C onto P, nothing is gained or lost, and the back is never mirrored', () => {
  for (const top of [false, true]) for (const P of POINTS) {
    const f = J.fold(W, H, top, P);
    if (f.flat) continue;
    const C = J.corner(W, H, top);
    const rc = J.apply(f.reflect, [C.x, C.y]);
    close(rc[0], f.P.x, 'R(C).x'); close(rc[1], f.P.y, 'R(C).y');
    close(J.area(f.keep) + J.area(f.folded), W * H, 'keep + folded is the sheet');
    close(J.area(f.flap), J.area(f.folded), 'folding moves paper, it does not stretch it');
    close(det(f.reflect), -1, 'the see-through ink is mirrored');
    close(det(f.back), 1, 'the page on the back is a rotation — readable');
    f.backClip.forEach((q, i) => {
      const s = J.apply(f.back, q);
      close(s[0], f.flap[i][0], 'back maps its clip onto the flap (x)'); close(s[1], f.flap[i][1], '(y)');
    });
  }
});

test('fully turned, the next page lies exactly on the left, the right way round', () => {
  for (const top of [false, true]) {
    const f = J.fold(W, H, top, J.turnedCorner(W, H, top));
    close(f.progress, 1, 'progress');
    close(J.area(f.keep), 0, 'nothing of the front is left lying flat');
    assert.deepEqual(J.apply(f.back, [0, 0]).map(v => Math.round(v)), [-W, 0], 'its top-left at the far left');
    assert.deepEqual(J.apply(f.back, [W, H]).map(v => Math.round(v)), [0, H], 'its bottom-right at the spine');
  }
});

test('the unattended path runs from rest to fully turned, rising, always on paper', () => {
  for (const top of [false, true]) {
    assert.deepEqual(J.flipPath(0, W, H, top), J.corner(W, H, top));
    const end = J.flipPath(1, W, H, top);
    close(end.x, -W, 'ends turned (x)'); close(end.y, top ? 0 : H, 'ends turned (y)');
    let prev = Infinity;
    for (let e = 0; e <= 1.0001; e += 0.05) {
      const p = J.flipPath(e, W, H, top);
      assert.ok(p.x <= prev + 1e-9, 'the corner only travels toward the spine and past it');
      prev = p.x;
      assert.ok(d(p, near(top)) <= W + 1e-6 && d(p, far(top)) <= Math.hypot(W, H) + 1e-6);
    }
    const mid = J.flipPath(0.5, W, H, top);
    assert.ok(top ? mid.y > 0 : mid.y < H, 'it lifts on the way');
  }
});

test('settling and dragging: the corner goes where it is sent, and a single page\'s previous sheet travels double', () => {
  const from = { x: 120, y: 520 };
  assert.deepEqual(J.settlePath(1, from, W, H, false, true), J.turnedCorner(W, H, false));
  assert.deepEqual(J.settlePath(1, from, W, H, false, false), J.corner(W, H, false));
  assert.deepEqual(J.settlePath(0, from, W, H, false, true), J.clampCorner(from, W, H, false));
  assert.deepEqual(J.dragPoint(J.NEXT, J.SPREAD, W, H, false, 0, 0), J.corner(W, H, false), 'a forward drag starts at rest');
  assert.deepEqual(J.dragPoint(J.PREV, J.SPREAD, W, H, false, 0, 0), J.turnedCorner(W, H, false), 'a backward one fully turned');
  assert.equal(J.dragPoint(J.PREV, J.SPREAD, W, H, false, W / 2, 0).x, -W / 2, 'spread: the corner follows the pointer');
  assert.equal(J.dragPoint(J.PREV, J.SINGLE, W, H, false, W / 2, 0).x, 0, 'alone: twice as fast');
  assert.equal(J.dragPoint(J.NEXT, J.SINGLE, W, H, false, -W / 2, 0).x, W / 2, 'forward, alone: one for one');
  close(J.dragPoint(J.NEXT, J.SPREAD, W, H, false, -200, -100).y, H - 60,
    'up and down count for less, so a careless swipe curls rather than folding the sheet over');
  const peek = { x: W - 40, y: H - 30 };
  assert.deepEqual(J.dragPoint(J.NEXT, J.SPREAD, W, H, false, -10, 0, peek), J.clampCorner({ x: W - 50, y: H - 30 }, W, H, false),
    'a peeled corner is taken up from where it is');
});

test('a sheet let go finishes past a quarter turn or when flicked, and a flick back cancels it', () => {
  assert.equal(J.releaseCompletes(J.NEXT, 0.3, 0), true);
  assert.equal(J.releaseCompletes(J.NEXT, 0.2, 0), false);
  assert.equal(J.releaseCompletes(J.NEXT, 0.05, -0.5), true, 'a flick toward the spine');
  assert.equal(J.releaseCompletes(J.NEXT, 0.6, 0.5), false, 'a flick back');
  assert.equal(J.releaseCompletes(J.PREV, 0.7, 0), true);
  assert.equal(J.releaseCompletes(J.PREV, 0.8, 0), false);
  assert.equal(J.releaseCompletes(J.PREV, 0.95, 0.5), true);
  assert.equal(J.releaseCompletes(J.PREV, 0.4, -0.5), false);
});

test('a tap turns the way it points: halves of an open book, the left third of a page alone', () => {
  assert.equal(J.tapIntent(100, 1000, J.SPREAD), J.PREV);
  assert.equal(J.tapIntent(600, 1000, J.SPREAD), J.NEXT);
  assert.equal(J.tapIntent(100, 390, J.SINGLE), J.PREV);
  assert.equal(J.tapIntent(140, 390, J.SINGLE), J.NEXT);
  assert.equal(J.tapIntent(50, 0, J.SINGLE), null);
});

test('gradientFrame puts the crease where a stop at `at` will draw it', () => {
  const box = { x: -W, y: -H, w: 2 * W, h: 3 * H };
  const n = { x: 0.6, y: -0.8 }, M = { x: 150, y: 420 };
  const g = J.gradientFrame(box, n, M);
  close(g.len, 2 * W * 0.6 + 3 * H * 0.8, 'CSS gradient-line length');
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  close(g.at, ((M.x - c.x) * n.x + (M.y - c.y) * n.y) / g.len + 0.5, 'the projection of M');
  close(J.gradientFrame(box, { x: 0, y: -1 }, M).angle, 0, 'up is 0deg');
  close(J.gradientFrame(box, { x: 1, y: 0 }, M).angle, 90, 'right is 90deg');
});

// ── the ink ────────────────────────────────────────────────────────────────

// inkRuns' contract on any text: contiguous over the whole of it, in order,
// nothing empty, every stretch beginning at 0 or at a break point, every ink
// a whole step in [1 - INK_FADE, 1].
function assertInk(text, runs, label, opts) {
  const bps = new Set(J.breakPoints(text, opts));
  assert.ok(runs.length > 0, label + ': at least one stretch');
  assert.equal(runs[0].start, 0, label + ': from the first character');
  assert.equal(runs[runs.length - 1].end, text.length, label + ': to the last');
  runs.forEach((r, i) => {
    assert.ok(r.end > r.start, label + ': stretch ' + i + ' is not empty');
    if (i) assert.equal(r.start, runs[i - 1].end, label + ': stretch ' + i + ' follows on');
    if (i) assert.ok(bps.has(r.start), label + ': stretch ' + i + ' begins where a page may end, at ' + r.start);
    assert.ok(r.ink >= 1 - J.INK_FADE - 1e-9 && r.ink <= 1, label + ': ink ' + r.ink + ' in range');
    assert.ok(Math.abs(r.ink / J.INK_STEP - Math.round(r.ink / J.INK_STEP)) < 1e-9, label + ': ink ' + r.ink + ' is a whole step');
    if (i) assert.notEqual(r.ink, runs[i - 1].ink, label + ': neighbours in one ink are one stretch');
  });
}

test('the ink: every character in exactly one stretch, each beginning where a page may end', () => {
  const text = '\n  ' + LOREM + '\n\n';
  assertInk(text, J.inkRuns(text, '2026-10-20'), 'lorem');
  assert.deepEqual(J.inkRuns('one', 'k'), [{ start: 0, end: 3, ink: 1 }], 'one word is one stretch, fresh');
  assert.deepEqual(J.inkRuns('   ', 'k'), [{ start: 0, end: 3, ink: 1 }], 'whitespace alone is one stretch');
  for (const t of ['', null, undefined, 42]) assert.deepEqual(J.inkRuns(t, 'k'), [], 'nothing written, no ink: ' + t);
});

test('the quill runs dry and is dipped again: every day starts fresh, and a long one fades and darkens', () => {
  const runs = J.inkRuns(LOREM, '2026-10-20');
  assert.equal(runs[0].ink, 1, 'the first word of a day is fresh from the well');
  assert.ok(runs.some(r => r.ink < 0.6), 'somewhere the ink runs thin');
  const dips = runs.filter((r, i) => i && r.ink === 1 && runs[i - 1].ink < 1).length;
  assert.ok(dips >= LOREM.length / J.DIP_MAX - 1, 'and the quill goes back to the well, again and again: ' + dips + ' dips');
  // No dip outlasts DIP_MAX visible characters: between two fresh starts, the ink fades.
  let freshAt = 0;
  runs.forEach((r, i) => {
    if (i && r.ink === 1 && runs[i - 1].ink < 1) {
      assert.ok(r.start - freshAt >= J.DIP_MIN - 3, 'a dip lasts DIP_MIN characters, give or take its whitespace: ' + (r.start - freshAt));
      freshAt = r.start;
    }
  });
});

test('the ink is the day\'s own: the same day lays the same ink, another day another rhythm', () => {
  assert.deepEqual(J.inkRuns(LOREM, '2026-10-20'), J.inkRuns(LOREM, '2026-10-20'));
  assert.notDeepEqual(J.inkRuns(LOREM, '2026-10-20'), J.inkRuns(LOREM, '2026-10-21'));
});

test('the ink never splits a Thai word or a grapheme, with or without the segmenter', () => {
  const para = 'ฉันรักภาษาไทยมากและอยากเขียนบันทึกทุกวัน'.repeat(6);
  const runs = J.inkRuns(para, '2026-10-22');
  assertInk(para, runs, 'thai');
  assert.ok(runs.length > 3, 'a space-less paragraph still fades and darkens: ' + runs.length + ' stretches');
  const words = new Set([...new Intl.Segmenter('th', { granularity: 'word' }).segment(para)].map(x => x.index));
  runs.slice(1).forEach((r, i) => {
    assert.ok(words.has(r.start), 'stretch ' + (i + 1) + ' begins on a word');
    assert.equal(startsWithMark(para.slice(r.start)), false, 'stretch ' + (i + 1) + ' begins on a letter');
  });
  const spaced = 'ฉันรักภาษาไทย มากและอยาก ' + 'เขียนบันทึกทุกวัน '.repeat(8);
  assertInk(spaced, J.inkRuns(spaced, '2026-10-22', { intl: null }), 'thai, no segmenter', { intl: null });
});

test('inkSlice: a page carries exactly its own part of its day\'s ink', () => {
  const runs = J.inkRuns(LOREM, '2026-10-20');
  const pages = J.cutText(LOREM, fitsBy(120));
  pages.forEach((p, i) => {
    const part = J.inkSlice(runs, p.start, p.end);
    assert.equal(part[0].start, p.start, 'page ' + i + ' starts its ink where it starts');
    assert.equal(part[part.length - 1].end, p.end, 'and ends it where it ends');
    part.forEach((r, k) => {
      if (k) assert.equal(r.start, part[k - 1].end, 'page ' + i + ': no gap');
      const whole = runs.find(w => w.start <= r.start && r.end <= w.end);
      assert.ok(whole && whole.ink === r.ink, 'page ' + i + ': each piece in its day\'s ink at ' + r.start);
    });
  });
  assert.deepEqual(J.inkSlice(null, 0, 10), []);
  assert.deepEqual(J.inkSlice([{ start: 0, end: 5, ink: 1 }, null, 'x'], 2, 4), [{ start: 2, end: 4, ink: 1 }]);
});

test('each page wears its own marks, and keeps them', () => {
  const a = J.marks('2026-10-20:0', 6), b = J.marks('2026-10-20:0', 6), c = J.marks('2026-10-20:1', 6);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.every(v => v >= 0 && v < 1));
});

// ── structural ─────────────────────────────────────────────────────────────

test('journey-fonts.js, placeholder or generated, is the shape journey-book.js reads', () => {
  const file = path.join(__dirname, '..', 'scripts', 'journey-fonts.js');
  const src = fs.readFileSync(file, 'utf8');
  const box = { window: {} };
  vm.runInNewContext(src, box, { filename: 'journey-fonts.js' });
  const F = box.window.TrackJourneyFonts;
  assert.ok(F && Array.isArray(F.faces), 'window.TrackJourneyFonts.faces is a list');
  assert.equal(typeof F.generated, 'boolean');
  if (!F.generated) {
    // .length, not deepEqual: the list was made in another realm, whose Array
    // prototype strict equality would reject.
    assert.equal(F.faces.length, 0, 'the placeholder holds no fonts: the book draws in its fallback serif');
    return;
  }
  const names = ['Journey Hand', 'Journey Caps', 'Journey Title'];
  F.faces.forEach(f => {
    assert.ok(names.includes(f.family), f.family + ' is one of the book\'s three private names');
    assert.match(f.unicodeRange, /^U\+/, f.source + ' carries Google\'s unicode-range');
    assert.equal(Buffer.from(f.data, 'base64').subarray(0, 4).toString('latin1'), 'wOF2', f.source + ' is woff2');
  });
  names.forEach(n => assert.ok(F.faces.some(f => f.family === n), n + ' is embedded'));
  assert.ok(F.faces.some(f => f.family === 'Journey Hand' && /0E[0-9A-F]{2}/i.test(f.unicodeRange)),
    'Thai letters fall to the hand');
  assert.match(src.slice(0, src.indexOf('*/')), /SIL OPEN FONT LICENSE Version 1\.1/i, 'the licence travels with the fonts');
});

test('journey-core.js is pure: no clock, no DOM, no storage', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'journey-core.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"])\/\/[^\n]*/g, '$1 ');
  assert.equal(/\bDate\b/.test(src), false, 'constructs no Date — which is why this suite is not swept');
  assert.equal(/\b(document|localStorage|sessionStorage|TrackStorage)\b/.test(src), false, 'touches no DOM or storage');
});
