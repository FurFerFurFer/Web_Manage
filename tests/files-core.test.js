/* ── tests/files-core.test.js ──────────────────────────────────────────────
   The FILES tab's records and writers (scripts/files-core.js), on top of the
   tree module it reuses (scripts/mm-tree-core.js). What this suite pins:

   1. Pure: no Date, no id minting, no storage — `now` and ids are passed in,
      which is why the suite runs once rather than swept across timezones.
   2. Every writer spreads, never mutates, keeps keys it has not heard of, and
      returns the ORIGINAL list when nothing changed.
   3. A file keeps its extension through a rename; a blank name is refused.
   4. Deleting a folder moves what was inside it up, never deletes it.
   5. Only a folder can hold anything, and nothing moves into its own branch.

   Fixtures are synthetic, always (AGENTS.md, "Preserve old data"). Ids are
   strings, as TrackStorage.newId() mints them.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

globalThis.window = globalThis;
for (const f of ['mm-tree-core.js', 'files-core.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', f), 'utf8'), { filename: f });
}
const TF = globalThis.TrackFiles;

const NOW = 1790000000000;
const LATER = NOW + 5000;

const folder = (id, name, parent, over = {}) =>
  Object.assign({ id, kind: 'folder', name, createdAt: NOW, updatedAt: NOW }, parent ? { parentIds: [parent] } : {}, over);
const note = (id, name, parent, over = {}) =>
  Object.assign({ id, kind: 'note', name, text: '# ' + name, createdAt: NOW, updatedAt: NOW }, parent ? { parentIds: [parent] } : {}, over);
const file = (id, name, parent, over = {}) =>
  Object.assign({ id, kind: 'file', name, mime: 'application/pdf', size: 1000, createdAt: NOW, updatedAt: NOW },
    parent ? { parentIds: [parent] } : {}, over);

/* Top level: Year 1 ─┬─ Anatomy ─┬─ limbs.pdf
                      │           └─ plan.md
                      └─ photo.png
              Loose.md
              Year 2 (empty)
   Stored in an order that is NOT the tree order. */
const LIB = () => [
  file('f-limbs', 'limbs.pdf', 'd-anat'),
  folder('d-y1', 'Year 1'),
  note('n-plan', 'plan.md', 'd-anat'),
  folder('d-anat', 'Anatomy', 'd-y1'),
  file('f-photo', 'photo.png', 'd-y1', { mime: 'image/png' }),
  note('n-loose', 'Loose.md'),
  folder('d-y2', 'Year 2')
];

const ids = list => list.map(r => r.id);
const byId = (list, id) => list.find(r => r && r.id === id);
function deepFreeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); }
  return v;
}

test('module surface', () => {
  for (const k of ['records', 'kindOf', 'typeOf', 'typeOfRecord', 'cleanName', 'renamedName', 'uniqueName',
    'isNoteUpload', 'textBytes', 'textFits', 'formatSize', 'folderOf', 'childrenOf', 'pathTo',
    'newFolder', 'newNote', 'newFile', 'withAdded', 'withRenamed', 'withText', 'withDriveId',
    'withRemoved', 'moveRefusal', 'withMoved', 'withArranged']) {
    assert.equal(typeof TF[k], 'function', k);
  }
  assert.equal(TF.NOTE_MAX_BYTES, 256 * 1024);
});

test('STRUCTURAL: no Date, no id minting, no storage', () => {
  // comments stripped first: the header talks about all three
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'files-core.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const banned of ['Date', 'Math.random', 'newId', 'localStorage', 'indexedDB', 'fetch(']) {
    assert.equal(src.indexOf(banned), -1, banned + ' appears in files-core.js');
  }
});

test('typeOf: the name decides first, then the MIME type', () => {
  assert.equal(TF.typeOf('a.png', ''), 'png');
  assert.equal(TF.typeOf('a.JPG', ''), 'jpeg');
  assert.equal(TF.typeOf('a.jpeg', 'application/octet-stream'), 'jpeg');
  assert.equal(TF.typeOf('Lecture 3.PDF', ''), 'pdf');
  assert.equal(TF.typeOf('notes.md', ''), 'md');
  assert.equal(TF.typeOf('notes.markdown', ''), 'md');
  assert.equal(TF.typeOf('scan', 'application/pdf'), 'pdf', 'no extension: the MIME type');
  assert.equal(TF.typeOf('IMG_0001', 'image/jpeg'), 'jpeg');
  assert.equal(TF.typeOf('clip.heic', ''), 'image');
  assert.equal(TF.typeOf('data.csv', ''), 'text');
  assert.equal(TF.typeOf('archive.zip', 'application/zip'), 'other');
  assert.equal(TF.typeOf('.env', ''), 'other', 'a leading dot alone is a name, not an extension');
  assert.equal(TF.typeOf(undefined, undefined), 'other', 'total');
  assert.equal(TF.typeOfRecord(note('n', 'x.md')), 'md');
  assert.equal(TF.typeOfRecord(folder('d', 'x.pdf')), 'folder', 'a folder named like a file is still a folder');
  assert.equal(TF.typeOfRecord({ id: 'z', kind: 'from-the-future', name: 'x.pdf' }), 'pdf',
    'an unknown kind is drawn as a file');
});

test('cleanName and renamedName: a file keeps its extension; blank is refused', () => {
  const bell = String.fromCharCode(7), del = String.fromCharCode(127);
  assert.equal(TF.cleanName('  Week' + bell + '  1' + del + '\n notes  '), 'Week 1 notes');
  assert.equal(TF.cleanName('x'.repeat(300)).length, TF.NAME_MAX);
  assert.equal(TF.cleanName('   '), '');
  assert.equal(TF.cleanName(42), '', 'total');

  const pdf = file('f', 'limbs.pdf');
  assert.equal(TF.renamedName(pdf, 'Upper limb'), 'Upper limb.pdf');
  assert.equal(TF.renamedName(pdf, 'Upper limb.pdf'), 'Upper limb.pdf', 'typing the extension again does not double it');
  assert.equal(TF.renamedName(pdf, 'Upper limb.PDF'), 'Upper limb.pdf');
  assert.equal(TF.renamedName(pdf, '   '), null);
  assert.equal(TF.renamedName(pdf, '.pdf'), null, 'nothing before the extension is blank');
  assert.equal(TF.renamedName(note('n', 'plan.md'), 'Plan v2'), 'Plan v2.md');
  assert.equal(TF.renamedName(folder('d', 'Year 1'), 'Year 1.backup'), 'Year 1.backup', 'a folder has no extension');
  assert.equal(TF.renamedName(file('f2', 'README'), 'Read me'), 'Read me', 'no extension, none added');
});

test('uniqueName counts only the siblings it will join', () => {
  const lib = [folder('a', 'New folder'), folder('b', 'New folder 2'), note('c', 'Untitled.md', 'a')];
  assert.equal(TF.uniqueName(lib, null, 'New folder'), 'New folder 3');
  assert.equal(TF.uniqueName(lib, 'a', 'New folder'), 'New folder', 'a different folder');
  assert.equal(TF.uniqueName(lib, 'a', 'Untitled.md'), 'Untitled 2.md', 'the extension stays last');
  assert.equal(TF.uniqueName(lib, null, 'untitled.md'), 'untitled.md');
});

test('isNoteUpload and textBytes: Markdown up to 256 KB is a note', () => {
  assert.equal(TF.isNoteUpload('a.md', 'text/markdown', 1000), true);
  assert.equal(TF.isNoteUpload('a.md', '', TF.NOTE_MAX_BYTES), true);
  assert.equal(TF.isNoteUpload('a.md', '', TF.NOTE_MAX_BYTES + 1), false, 'bigger is a file');
  assert.equal(TF.isNoteUpload('a.pdf', 'application/pdf', 10), false);
  assert.equal(TF.isNoteUpload('a.md', '', undefined), false, 'total');

  assert.equal(TF.textBytes('abc'), 3);
  const thai = String.fromCharCode(0x0E01, 0x0E32);
  assert.equal(TF.textBytes(thai), 6, 'Thai is three bytes a character');
  const emoji = String.fromCharCode(0xD83D, 0xDCDA);
  assert.equal(TF.textBytes(emoji), 4, 'a surrogate pair is four');
  assert.equal(TF.textFits('x'.repeat(TF.NOTE_MAX_BYTES)), true);
  assert.equal(TF.textFits('x'.repeat(TF.NOTE_MAX_BYTES + 1)), false);
});

test('constructors take id and now from the caller; top level has no parentIds key', () => {
  const f = TF.newFolder({ id: 'd1', name: '  Year 3 ', now: NOW });
  assert.deepEqual(f, { id: 'd1', kind: 'folder', name: 'Year 3', createdAt: NOW, updatedAt: NOW });
  assert.equal('parentIds' in f, false, 'absence is the top level');
  assert.deepEqual(TF.newFolder({ id: 'd2', name: 'In', parentId: 'd1', now: NOW }).parentIds, ['d1']);
  const n = TF.newNote({ id: 'n1', name: 'Untitled', now: NOW });
  assert.equal(n.name, 'Untitled.md', 'a note is a .md');
  assert.equal(n.text, '');
  assert.equal(TF.newNote({ id: 'n2', name: 'x.md', text: '# hi', now: NOW }).text, '# hi');
  const p = TF.newFile({ id: 'f1', name: 'scan.pdf', mime: 'application/pdf', size: 5, parentId: 'd1', now: NOW });
  assert.deepEqual(p, { id: 'f1', kind: 'file', name: 'scan.pdf', size: 5, createdAt: NOW, updatedAt: NOW,
    mime: 'application/pdf', parentIds: ['d1'] });
  assert.equal('mime' in TF.newFile({ id: 'f2', name: 'x', size: 1, now: NOW }), false, 'no MIME, no key');
});

test('withAdded appends, skips an id already stored, and returns the input when nothing is new', () => {
  const lib = deepFreeze(LIB());
  const next = TF.withAdded(lib, [note('n-new', 'New.md'), note('n-plan', 'dup.md')]);
  assert.deepEqual(ids(next), ids(lib).concat('n-new'));
  assert.equal(TF.withAdded(lib, [note('n-plan', 'again')]), lib);
  assert.equal(TF.withAdded(lib, []), lib);
  assert.deepEqual(ids(TF.withAdded(undefined, [folder('a', 'A')])), ['a'], 'a missing field starts a list');
});

test('withRenamed spreads, stamps updatedAt, keeps unknown keys; same list when unchanged or refused', () => {
  const lib = deepFreeze(LIB().map(r => r.id === 'f-limbs' ? Object.assign({}, r, { futureKey: { a: 1 } }) : r));
  const next = TF.withRenamed(lib, 'f-limbs', 'Upper limb', LATER);
  const r = byId(next, 'f-limbs');
  assert.equal(r.name, 'Upper limb.pdf');
  assert.equal(r.updatedAt, LATER);
  assert.equal(r.createdAt, NOW);
  assert.deepEqual(r.futureKey, { a: 1 }, 'a key this version has not heard of survives');
  assert.equal(byId(next, 'd-y1'), byId(lib, 'd-y1'), 'every other record is the same object');
  assert.equal(TF.withRenamed(lib, 'f-limbs', 'limbs', LATER), lib, 'the same name writes nothing');
  assert.equal(TF.withRenamed(lib, 'f-limbs', '  ', LATER), lib, 'blank is refused');
  assert.equal(TF.withRenamed(lib, 'nope', 'X', LATER), lib, 'missing');
});

test('withText writes a note only, refuses text over the cap, and skips an unchanged save', () => {
  const lib = deepFreeze(LIB());
  const next = TF.withText(lib, 'n-plan', '# new', LATER);
  assert.equal(byId(next, 'n-plan').text, '# new');
  assert.equal(byId(next, 'n-plan').updatedAt, LATER);
  assert.equal(TF.withText(lib, 'n-plan', '# plan.md', LATER), lib, 'unchanged');
  assert.equal(TF.withText(lib, 'f-limbs', 'x', LATER), lib, 'a file has no text here');
  assert.equal(TF.withText(lib, 'n-plan', 'x'.repeat(TF.NOTE_MAX_BYTES + 1), LATER), lib, 'over the cap');
});

test('withDriveId lands on a file without touching updatedAt', () => {
  const lib = deepFreeze(LIB());
  const next = TF.withDriveId(lib, 'f-limbs', 'drive-123');
  assert.equal(byId(next, 'f-limbs').driveId, 'drive-123');
  assert.equal(byId(next, 'f-limbs').updatedAt, NOW, 'not an edit');
  assert.equal(TF.withDriveId(next, 'f-limbs', 'drive-123'), next, 'already so');
  assert.equal(TF.withDriveId(lib, 'n-plan', 'x'), lib, 'a note never has one');
  assert.equal(TF.withDriveId(lib, 'd-y1', 'x'), lib, 'nor a folder');
  assert.equal(TF.withDriveId(lib, 'f-limbs', ''), lib);
});

test('withRemoved: a deleted folder\'s contents move up, keeping their stored place', () => {
  const lib = deepFreeze(LIB());
  const one = TF.withRemoved(lib, ['d-anat']);
  assert.deepEqual(ids(one), ['f-limbs', 'd-y1', 'n-plan', 'f-photo', 'n-loose', 'd-y2'], 'only the folder goes');
  assert.deepEqual(byId(one, 'f-limbs').parentIds, ['d-y1'], 'up one level');
  assert.deepEqual(byId(one, 'n-plan').parentIds, ['d-y1']);

  const both = TF.withRemoved(lib, ['d-y1', 'd-anat']);
  assert.equal('parentIds' in byId(both, 'f-limbs'), false, 'past two deleted folders to the top: the key goes');
  assert.equal('parentIds' in byId(both, 'f-photo'), false);

  const top = TF.withRemoved(lib, ['d-y1']);
  assert.deepEqual(byId(top, 'd-anat').parentIds === undefined, true, 'to the top level');
  assert.deepEqual(byId(top, 'f-limbs').parentIds, ['d-anat'], 'grandchildren keep their own folder');

  assert.deepEqual(ids(TF.withRemoved(lib, ['f-limbs'])), ids(lib).filter(i => i !== 'f-limbs'));
  assert.equal(TF.withRemoved(lib, ['nope']), lib, 'nothing to delete');

  const looped = deepFreeze([folder('a', 'A', 'b'), folder('b', 'B', 'a'), note('c', 'c.md', 'a')]);
  const out = TF.withRemoved(looped, ['a', 'b']);
  assert.deepEqual(ids(out), ['c'], 'a parent loop terminates');
  assert.equal('parentIds' in out[0], false);

  const junk = [null, 'stray', folder('d', 'D'), note('e', 'e.md', 'd')];
  assert.deepEqual(TF.withRemoved(junk, ['d']).slice(0, 2), [null, 'stray'], 'non-records are kept, never dropped');
});

test('moveRefusal: only a folder holds anything, and never its own branch', () => {
  const lib = LIB();
  assert.equal(TF.moveRefusal(lib, ['n-loose'], null, 'f-limbs'), 'not-folder');
  assert.equal(TF.moveRefusal(lib, ['d-y1'], null, 'd-y1'), 'self');
  assert.equal(TF.moveRefusal(lib, ['d-y1'], null, 'd-anat'), 'inside');
  assert.equal(TF.moveRefusal(lib, ['f-limbs'], 'd-anat', 'd-anat'), 'same');
  assert.equal(TF.moveRefusal(lib, ['nope'], null, 'd-y2'), 'missing');
  assert.equal(TF.moveRefusal(lib, ['f-limbs'], 'd-anat', 'd-gone'), 'missing', 'deleted in another tab mid-drag');
  assert.equal(TF.moveRefusal(lib, ['f-limbs', 'n-plan'], 'd-anat', 'd-y2'), null);
  assert.equal(TF.moveRefusal(lib, ['f-limbs'], 'd-anat', null), null, 'the top level');
});

test('withMoved replaces the one parent, deletes the key at the top, never reorders', () => {
  const lib = deepFreeze(LIB());
  const into = TF.withMoved(lib, ['f-limbs', 'n-plan'], 'd-anat', 'd-y2');
  assert.deepEqual(byId(into, 'f-limbs').parentIds, ['d-y2']);
  assert.deepEqual(byId(into, 'n-plan').parentIds, ['d-y2']);
  assert.deepEqual(ids(into), ids(lib), 'stored order untouched');
  assert.equal(byId(into, 'f-limbs').updatedAt, NOW, 'a move is not an edit');

  const out = TF.withMoved(lib, ['f-photo'], 'd-y1', null);
  assert.equal('parentIds' in byId(out, 'f-photo'), false, 'clearing deletes the key');

  assert.equal(TF.withMoved(lib, ['d-y1'], null, 'd-anat'), lib, 'refused: inside its own branch');
  assert.equal(TF.withMoved(lib, ['n-loose'], null, 'f-limbs'), lib, 'refused: onto a file');
  assert.equal(TF.withMoved(lib, ['n-loose'], null, null), lib, 'already at the top');
  assert.equal(TF.withMoved([note('x', 'x.md', null, { parentIds: [] })], ['x'], null, null).length, 1);
  const empty = deepFreeze([note('x', 'x.md', null, { parentIds: [] })]);
  assert.equal(TF.withMoved(empty, ['x'], null, null), empty, 'an empty list is the top level too');
});

test('withArranged reorders by the folder\'s drawn list; a drawn no-op writes nothing', () => {
  const lib = deepFreeze(LIB());
  const next = TF.withArranged(lib, ['n-plan'], 'f-limbs', true, 'd-anat');
  assert.deepEqual(TF.childrenOf(next, 'd-anat').map(r => r.id), ['n-plan', 'f-limbs']);
  assert.equal(TF.withArranged(lib, ['f-limbs'], 'n-plan', true, 'd-anat'), lib, 'already before it');
  assert.equal(TF.withArranged(lib, ['f-limbs'], 'd-y2', true, 'd-anat'), lib, 'not a sibling in that list');
  const top = TF.withArranged(lib, ['d-y2'], 'd-y1', true, null);
  assert.deepEqual(TF.childrenOf(top, null).map(r => r.id), ['d-y2', 'd-y1', 'n-loose']);
});

test('childrenOf, folderOf and pathTo read the tree TrackMMTree draws', () => {
  const lib = LIB();
  assert.deepEqual(TF.childrenOf(lib, null).map(r => r.id), ['d-y1', 'n-loose', 'd-y2']);
  assert.deepEqual(TF.childrenOf(lib, 'd-y1').map(r => r.id), ['d-anat', 'f-photo']);
  assert.deepEqual(TF.pathTo(lib, 'f-limbs'), ['d-y1', 'd-anat', 'f-limbs']);
  assert.equal(TF.folderOf(lib, 'f-limbs'), 'd-anat');
  assert.equal(TF.folderOf(lib, 'n-loose'), null);
  const orphan = [note('o', 'o.md', 'gone')];
  assert.deepEqual(TF.childrenOf(orphan, null).map(r => r.id), ['o'], 'a missing folder leaves it at the top');
  assert.equal(TF.folderOf(orphan, 'o'), null);
  assert.deepEqual(TF.records([null, 3, 'x', { name: 'no id' }, folder('a', 'A')]).map(r => r.id), ['a']);
});

test('formatSize', () => {
  assert.equal(TF.formatSize(0), '0 B');
  assert.equal(TF.formatSize(900), '900 B');
  assert.equal(TF.formatSize(1536), '1.5 KB');
  assert.equal(TF.formatSize(100 * 1024 * 1024), '100 MB');
  assert.equal(TF.formatSize(1.25 * 1024 * 1024 * 1024), '1.3 GB');
  assert.equal(TF.formatSize(-1), '0 B', 'total');
});

/* ── highlights and pins: the viewer's marks (2026-11-13) ───────────────────
   Optional keys on a FILE record, drawn only by the viewer. What is pinned:
   every writer spreads and keeps unknown keys, returns the very list for a
   no-op or a refusal, never stamps the file's updatedAt (the file did not
   change), and deletes the key when the last mark goes. */
const stroke = (id, page = 1, over = {}) =>
  Object.assign({ id, page, color: 'yellow', w: 0.02, pts: [0.1, 0.2, 0.3, 0.2], createdAt: NOW }, over);
const pin = (id, page, name, over = {}) => Object.assign({ id, page, name, createdAt: NOW, updatedAt: NOW }, over);
const MARKED = () => [file('f', 'slides.pdf', null, { laterKey: 'kept' }), note('n', 'n.md'), folder('d', 'D')];

test('marks: the module surface', () => {
  for (const k of ['highlightsOf', 'pinsOf', 'marksBytes', 'marksFit', 'withHighlight', 'highlightEntries',
    'withoutHighlights', 'withHighlightsRestored', 'withPin', 'withPinRenamed', 'withoutPin', 'simplifyStroke', 'hitStroke']) {
    assert.equal(typeof TF[k], 'function', k);
  }
  assert.deepEqual(TF.COLORS, ['yellow', 'green', 'blue', 'pink']);
  assert.equal(TF.MARKS_MAX_BYTES, 256 * 1024);
  assert.equal(TF.STROKE_MAX_POINTS, 200);
});

test('withHighlight appends a spread copy to a file only, never touching updatedAt', () => {
  const lib = deepFreeze(MARKED());
  const one = TF.withHighlight(lib, 'f', stroke('h1', 2, { laterKey: 'x' }));
  const rec = byId(one, 'f');
  assert.deepEqual(rec.highlights, [stroke('h1', 2, { laterKey: 'x' })], 'stored whole, an unknown key kept');
  assert.equal(rec.updatedAt, NOW, 'the file did not change');
  assert.equal(rec.laterKey, 'kept');
  assert.equal(byId(one, 'n'), lib[1], 'other records untouched (same object)');
  const two = TF.withHighlight(one, 'f', stroke('h2'));
  assert.deepEqual(byId(two, 'f').highlights.map(h => h.id), ['h1', 'h2'], 'appended, so later strokes draw on top');
  assert.equal(TF.withHighlight(two, 'f', stroke('h2')), two, 'a repeated id is refused');
  assert.equal(TF.withHighlight(lib, 'n', stroke('h')), lib, 'not on a note');
  assert.equal(TF.withHighlight(lib, 'd', stroke('h')), lib, 'not on a folder');
  assert.equal(TF.withHighlight(lib, 'missing', stroke('h')), lib);
});

test('withHighlight refuses a malformed stroke', () => {
  const lib = deepFreeze(MARKED());
  for (const [why, bad] of [
    ['page 0', stroke('h', 0)], ['page 1.5', stroke('h', 1.5)], ['page as text', stroke('h', '1')],
    ['odd pts', stroke('h', 1, { pts: [0.1, 0.2, 0.3] })], ['one point', stroke('h', 1, { pts: [0.1, 0.2] })],
    ['out of range', stroke('h', 1, { pts: [0.1, 0.2, 1.2, 0.2] })], ['negative', stroke('h', 1, { pts: [-0.1, 0.2, 0.3, 0.2] })],
    ['NaN', stroke('h', 1, { pts: [0.1, NaN, 0.3, 0.2] })], ['unknown colour', stroke('h', 1, { color: 'red' })],
    ['no width', stroke('h', 1, { w: 0 })], ['no id', stroke('', 1)],
    ['too many points', stroke('h', 1, { pts: new Array(402).fill(0.5) })]
  ]) assert.equal(TF.withHighlight(lib, 'f', bad), lib, why);
  assert.notEqual(TF.withHighlight(lib, 'f', stroke('h', 1, { pts: new Array(400).fill(0.5) })), lib, '200 points is the cap, not past it');
});

test('the budget: 256 KB of marks per file, then refused', () => {
  const big = { id: 'h-big', page: 1, color: 'blue', w: 0.02, pts: new Array(400).fill(0.1234), createdAt: NOW };
  let lib = MARKED();
  let n = 0;
  while (TF.marksFit(byId(lib, 'f'), big)) {
    lib = TF.withHighlight(lib, 'f', Object.assign({}, big, { id: 'h' + n++ }));
  }
  assert.ok(n > 50, 'room for plenty of strokes (' + n + ')');
  assert.ok(TF.marksBytes(byId(lib, 'f')) <= TF.MARKS_MAX_BYTES);
  assert.equal(TF.withHighlight(lib, 'f', Object.assign({}, big, { id: 'h-over' })), lib, 'past the budget: refused');
  assert.equal(TF.withPin(lib, 'f', pin('p-over', 1, 'x'.repeat(100))), lib, 'a pin counts against it too');
  assert.equal(TF.marksBytes(null), 0, 'total');
});

test('highlightsOf and pinsOf are total and skip what they cannot draw', () => {
  const rec = file('f', 'a.pdf', null, {
    highlights: [stroke('a', 1), null, 'junk', stroke('b', 2), { id: 'c', page: 1 }, stroke('d', 1)],
    pins: [pin('p3', 3, 'Third'), pin('p1', 1, 'First'), null, { id: 'x', page: 2 }, pin('p1b', 1, 'Also one')]
  });
  assert.deepEqual(TF.highlightsOf(rec).map(h => h.id), ['a', 'b', 'd']);
  assert.deepEqual(TF.highlightsOf(rec, 1).map(h => h.id), ['a', 'd'], 'one page');
  assert.deepEqual(TF.pinsOf(rec).map(p => p.id), ['p1', 'p1b', 'p3'], 'by page, then as made');
  for (const junk of [null, 3, {}, file('g', 'g.pdf', null, { highlights: 'no', pins: {} })]) {
    assert.deepEqual(TF.highlightsOf(junk), []);
    assert.deepEqual(TF.pinsOf(junk), []);
  }
});

test('erasing removes by id, deletes the key with the last one, and Undo puts each back in its place', () => {
  const lib = deepFreeze(TF.withHighlight(TF.withHighlight(TF.withHighlight(MARKED(), 'f', stroke('a')), 'f', stroke('b')), 'f', stroke('c')));
  const entries = TF.highlightEntries(byId(lib, 'f'), ['c', 'a']);
  assert.deepEqual(entries.map(e => [e.index, e.item.id]), [[0, 'a'], [2, 'c']], 'stored places, in stored order');
  const erased = TF.withoutHighlights(lib, 'f', ['a', 'c']);
  assert.deepEqual(byId(erased, 'f').highlights.map(h => h.id), ['b']);
  assert.equal(byId(erased, 'f').updatedAt, NOW);
  const back = TF.withHighlightsRestored(erased, 'f', entries);
  assert.deepEqual(back, lib, 'Undo restores the list exactly');
  assert.equal(TF.withHighlightsRestored(back, 'f', entries), back, 'already back: nothing to do');

  const none = TF.withoutHighlights(lib, 'f', ['a', 'b', 'c']);
  assert.equal('highlights' in byId(none, 'f'), false, 'the last one gone deletes the key');
  assert.deepEqual(TF.withHighlightsRestored(none, 'f', TF.highlightEntries(byId(lib, 'f'), ['a', 'b', 'c'])), lib);
  assert.equal(TF.withoutHighlights(lib, 'f', ['nope']), lib, 'nothing to erase');
  assert.equal(TF.withoutHighlights(lib, 'n', ['a']), lib);

  const junky = [file('f', 'a.pdf', null, { highlights: [null, stroke('a')] })];
  assert.deepEqual(byId(TF.withoutHighlights(junky, 'f', ['a']), 'f').highlights, [null], 'junk is kept, never dropped');
});

test('pins: made with a cleaned name, renamed, deleted; the last one deletes the key', () => {
  const lib = deepFreeze(MARKED());
  const one = TF.withPin(lib, 'f', pin('p1', 2, '  Results\n', { laterKey: 'x' }));
  assert.deepEqual(byId(one, 'f').pins, [pin('p1', 2, 'Results', { laterKey: 'x' })]);
  assert.equal(byId(one, 'f').updatedAt, NOW, 'the file did not change');
  for (const [why, bad] of [['blank', pin('p2', 1, '   ')], ['page 0', pin('p2', 0, 'x')], ['no id', pin('', 1, 'x')],
    ['repeated id', pin('p1', 1, 'x')]]) assert.equal(TF.withPin(one, 'f', bad), one, why);
  assert.equal(TF.withPin(lib, 'n', pin('p', 1, 'x')), lib, 'not on a note');

  const renamed = TF.withPinRenamed(one, 'f', 'p1', 'Final results', LATER);
  assert.deepEqual(byId(renamed, 'f').pins, [pin('p1', 2, 'Final results', { laterKey: 'x', updatedAt: LATER })], 'spread, its own updatedAt');
  assert.equal(byId(renamed, 'f').updatedAt, NOW, 'not the file\'s');
  assert.equal(TF.withPinRenamed(one, 'f', 'p1', 'Results', LATER), one, 'unchanged');
  assert.equal(TF.withPinRenamed(one, 'f', 'p1', '  ', LATER), one, 'blank refused');
  assert.equal(TF.withPinRenamed(one, 'f', 'nope', 'x', LATER), one);

  const two = TF.withPin(one, 'f', pin('p2', 1, 'Intro'));
  assert.deepEqual(byId(TF.withoutPin(two, 'f', 'p1'), 'f').pins.map(p => p.id), ['p2']);
  assert.equal('pins' in byId(TF.withoutPin(one, 'f', 'p1'), 'f'), false, 'the last one gone deletes the key');
  assert.equal(TF.withoutPin(one, 'f', 'nope'), one);
});

test('marks travel with the record: renamed, moved, and gone with it when deleted', () => {
  const lib = deepFreeze(TF.withPin(TF.withHighlight([folder('d', 'D'), file('f', 'a.pdf')], 'f', stroke('h')), 'f', pin('p', 1, 'P')));
  const moved = TF.withMoved(TF.withRenamed(lib, 'f', 'b', LATER), ['f'], null, 'd');
  assert.deepEqual(byId(moved, 'f').highlights, [stroke('h')]);
  assert.deepEqual(byId(moved, 'f').pins, [pin('p', 1, 'P')]);
  assert.deepEqual(ids(TF.withRemoved(lib, ['f'])), ['d']);
});

test('simplifyStroke keeps both ends, drops what lies on the line, rounds, clamps and caps', () => {
  const line = [];
  for (let i = 0; i <= 50; i++) line.push(0.1 + i * 0.01, 0.5);
  assert.deepEqual(TF.simplifyStroke(line, 0.001, 1.3), [0.1, 0.5, 0.6, 0.5], 'a straight line is its two ends');

  const bend = [0.1, 0.1, 0.2, 0.1, 0.3, 0.1, 0.3, 0.2, 0.3, 0.3];
  assert.deepEqual(TF.simplifyStroke(bend, 0.001, 1), [0.1, 0.1, 0.3, 0.1, 0.3, 0.3], 'the corner kept');

  assert.deepEqual(TF.simplifyStroke([0.123456, -0.2, 1.4, 0.98765], 0.001, 1), [0.1235, 0, 1, 0.9877], 'rounded to 4, clamped to the page');

  const zig = [];
  for (let i = 0; i < 1000; i++) zig.push(i / 1000, i % 2 ? 0.2 : 0.8);
  const capped = TF.simplifyStroke(zig, 0.0001, 1);
  assert.equal(capped.length, 2 * TF.STROKE_MAX_POINTS, 'thinned to the cap');
  assert.deepEqual(capped.slice(0, 2), [0, 0.8], 'first point kept');
  assert.deepEqual(capped.slice(-2), [0.999, 0.2], 'last point kept');

  // a page's height counts: the same y wobble matters more on a tall page
  const wobble = [0.1, 0.5, 0.5, 0.503, 0.9, 0.5];
  assert.equal(TF.simplifyStroke(wobble, 0.002, 0.5).length, 4, 'flat on a wide page');
  assert.equal(TF.simplifyStroke(wobble, 0.002, 1.5).length, 6, 'kept on a tall one');

  for (const junk of [null, [], [0.1, 0.2], [0.1, 0.2, 0.3], [0.1, 'x', 0.3, 0.4], [0.1, Infinity, 0.3, 0.4]]) {
    assert.deepEqual(TF.simplifyStroke(junk, 0.001, 1), [], 'total');
  }
});

test('hitStroke: within half the width plus the tolerance, in page widths', () => {
  const h = stroke('h', 1, { w: 0.02, pts: [0.1, 0.5, 0.5, 0.5] });
  assert.equal(TF.hitStroke(h, 0.3, 0.5, 0, 1), true, 'on the line');
  assert.equal(TF.hitStroke(h, 0.3, 0.509, 0, 1), true, 'inside half the width');
  assert.equal(TF.hitStroke(h, 0.3, 0.52, 0, 1), false, 'outside it');
  assert.equal(TF.hitStroke(h, 0.3, 0.52, 0.015, 1), true, 'the finger\'s tolerance');
  assert.equal(TF.hitStroke(h, 0.3, 0.509, 0, 2), false, 'y counts double on a page twice as tall as wide');
  assert.equal(TF.hitStroke(h, 0.55, 0.5, 0, 1), false, 'past the end');
  assert.equal(TF.hitStroke(null, 0.3, 0.5, 0, 1), false, 'total');
  assert.equal(TF.hitStroke(h, 'x', 0.5, 0, 1), false);
});

// ── what a Source Dump text block may link to ───────────────────────────────

test('recordOf finds a record by its stored id, and nothing else', () => {
  const L = deepFreeze(LIB());
  assert.equal(TF.recordOf(L, 'f-limbs'), L[0]);
  assert.equal(TF.recordOf(L, 'nope'), null);
  assert.equal(TF.recordOf(L, null), null);
  assert.equal(TF.recordOf('junk', 'f-limbs'), null);
  assert.equal(TF.recordOf([file(5, 'n.pdf')], '5'), null, '=== on stored ids');
});

test('linkables: every file and note, never a folder, in stored order, with the folders above it', () => {
  const got = TF.linkables(deepFreeze(LIB()));
  assert.deepEqual(got.map(o => o.rec.id), ['f-limbs', 'n-plan', 'f-photo', 'n-loose']);
  assert.deepEqual(got.map(o => o.folders), [['Year 1', 'Anatomy'], ['Year 1', 'Anatomy'], ['Year 1'], []]);
  assert.deepEqual(TF.linkables('junk'), []);
});

test('linkables ends on a folder cycle rather than the stack', () => {
  const L = deepFreeze([folder('a', 'A', 'b'), folder('b', 'B', 'a'), file('f', 'x.pdf', 'a')]);
  const got = TF.linkables(L);
  assert.equal(got.length, 1);
  assert.ok(got[0].folders.length <= 2, 'each folder at most once: ' + JSON.stringify(got[0].folders));
});
