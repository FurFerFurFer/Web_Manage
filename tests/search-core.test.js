/* ── tests/search-core.test.js ─────────────────────────────────────────────
   Offline cover for search-core.js — Universal Search's index: what it lists,
   where each thing sits, and what a query finds.

       node --test tests/search-core.test.js

   Run once by tests/run.js rather than once per timezone: nothing in
   search-core.js constructs a Date (a month folder is cut from the stored day
   string), and the structural case below is what says so if one ever appears.

   What is being pinned, in order of how much it would cost to get wrong:

   1. "The bigger parents always come first on top" (the user, 2026-11-26):
      a hit's place in the list is its depth first — measured along where it
      LIVES, never a tab that also lists it — then whether its title holds
      every word, then its place in the directory.
   2. A search inside a folder finds only what is under that folder.
   3. The directory "looks real" (the user's follow-ups the same day, and the
      draft they approved): the five pages in the site's order, each with the
      tabs its own bar draws — checked against the pages' own tab tables, so
      a renamed or added tab fails here rather than drifting — and a sub-tab
      is a HEADING inside its tab, never a level to click into.
   4. Every walk ends: a mind-map loop with nothing above it, a source-dump
      loop, a goal-tree link back up, and hostile stored shapes.
   5. Each thing sits under the parent its page shows it under, and opens on
      the link the other surfaces already use.
   6. Text is compared through FILES' normaliser, so accents and Thai marks
      written two ways still match.

   The REAL modules are loaded — mm-tree-core, files-core, source-dump-core,
   kolb-core, notes-core, note-to-self-core, project-core — because
   search-core.js is handed them, and a stand-in would test a different tree.
   Fixtures are synthetic, always (AGENTS.md, "Preserve old data").
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Browser IIFEs. runInThisContext, not a new realm: the modules are built on
// Array.isArray, and arrays made here must pass it.
globalThis.window = globalThis;
for (const f of ['mm-tree-core', 'files-core', 'source-dump-core', 'milestone-core', 'kolb-core',
  'notes-core', 'note-to-self-core', 'project-core', 'search-core']) {
  vm.runInThisContext(read('scripts/' + f + '.js'), { filename: f + '.js' });
}
const S = globalThis.TrackSearch;
const DEPS = {
  tree: globalThis.TrackMMTree, files: globalThis.TrackFiles, dumps: globalThis.TrackSourceDump,
  project: globalThis.TrackProject, kolb: globalThis.TrackKolb, notes: globalThis.TrackNotes,
  kindLabel: globalThis.TrackNoteToSelf.mmKindLabel
};
const build = slot => S.build(slot, DEPS);

const CODE = () => read('scripts/search-core.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── fixtures ───────────────────────────────────────────────────────────────

const mm = (id, name, over = {}) => Object.assign({ id, name, type: '1', parentIds: [] }, over);

/* Chem ─┬─ Organic ─┬─ Alkanes
         │           └─ Shared ◄── also under Physics (two parents)
         └─ Inorganic
   Physics ── Shared
   Numeric ids, as nid() mints them, in a stored order that is NOT the tree
   order. */
const MMS = () => [
  mm(1, 'Chem', { type: 'anchor', explanation: 'All of chemistry' }),
  mm(5, 'Alkanes', { parentIds: [2], explanation: 'single bonds only' }),
  mm(2, 'Organic', { parentIds: [1] }),
  mm(9, 'Physics'),
  mm(4, 'Shared', { parentIds: [2, 9], type: '2', currentMG: 'breathe before the bond' }),
  mm(3, 'Inorganic', { parentIds: [1] })
];

const titlesOf = list => list.map(n => n.title);
const pathTitles = (ix, key, scope = null) => titlesOf(S.pathOf(ix, key, scope));
const FRAME = new Set(['page', 'tab', 'subtab', 'section', 'widget']);

const PAGE_TITLES = ['Home', 'Schedule', 'Knowledge Record', 'Documentations', 'Storages'];
const TAB_TITLES = {
  'page:home': ['Workspaces', 'Universal calendar', 'Quest', '✎ Notes'],
  'page:schedule': ['SCHEDULE', '★ CALENDAR', '● LEARN', '▲ PROJECT', '■ ACTIONS'],
  'page:ks': ['CAL', 'KS02', 'MG', 'KS03', 'KOLB', 'SRCH'],
  'page:docs': ['Events', 'Projects'],
  'page:storage': ['SOURCE DUMP', 'FILES']
};

// ── the module ─────────────────────────────────────────────────────────────

test('the module constructs no Date, mints no id and reads no storage — why its suite is not swept', () => {
  const code = CODE();
  assert.equal(/new Date|Date\.now|getDay\(|toISOString|getTimezoneOffset/.test(code), false, 'no date code');
  assert.equal(/newId|Math\.random|crypto/.test(code), false, 'no id minting');
  assert.equal(/localStorage|sessionStorage|indexedDB|loadDB|saveDB/.test(code), false, 'no storage');
});

// ── the five pages, as the site draws them ─────────────────────────────────

test('the top is the five pages in the site\'s order, each with its own tabs — even for an empty or malformed slot', () => {
  for (const slot of [{}, null, 42, { mms: null, goals: 'x', files: [null, 3], dateNotes: [] }]) {
    const ix = build(slot);
    assert.deepEqual(titlesOf(S.children(ix, null)), PAGE_TITLES);
    for (const [pageKey, want] of Object.entries(TAB_TITLES)) {
      assert.deepEqual(titlesOf(S.children(ix, pageKey)), want, pageKey);
    }
    const data = ix.order.filter(k => !FRAME.has(S.node(ix, k).kind));
    assert.deepEqual(data, [], 'nothing but the site\'s own frame for a slot with nothing in it');
  }
  const ix = build({});
  assert.equal(S.node(ix, 'page:schedule').href, 'progress.html');
  assert.equal(S.node(ix, 'tab:schedule:actions').href, 'progress.html#actions');
  assert.equal(S.node(ix, 'tab:ks:cal').href, 'sir-ks02.html#calendar');
  assert.equal(S.node(ix, 'tab:storage:files').href, 'true-storage.html#files');
  assert.equal(S.node(ix, 'tab:home:notes').href, null, 'the notes widget has no page');
  assert.equal(S.node(ix, 'tab:home:notes').kind, 'widget');
});

/* The guard against drift: every tab and sub-tab title, and every address a
   Go → opens, is read back out of the page that draws it. If a page renames,
   adds or removes a tab, this fails and says which table to change. */
test('every tab and sub-tab matches the page\'s own tab table — rename one there and this says so', () => {
  const ix = build({});
  const fix = ' — change PAGES in scripts/search-core.js to match the page';
  const tabsOf = key => S.children(ix, key).filter(n => n.kind !== 'subtab');
  const subsOf = key => S.children(ix, key).filter(n => n.kind === 'subtab');
  const hashOf = n => (n.href || '').split('#')[1] || null;

  // progress.html: TABS = [[key, label, short, accent, [[subKey, subLabel, accent]] | null]]
  // Evaluated in a bare realm (it is plain literals), then copied into this one: strict
  // deepEqual compares prototypes, and another realm's Array is not this one's.
  const progTabs = JSON.parse(JSON.stringify(vm.runInNewContext('(' + read('progress.html').match(/const TABS = (\[[\s\S]*?\n {4}\]);/)[1] + ')')));
  assert.deepEqual(tabsOf('page:schedule').map(n => [hashOf(n), n.title]), progTabs.map(t => [t[0], t[1]]), 'Schedule tabs' + fix);
  progTabs.forEach(t => {
    const tab = S.children(ix, 'page:schedule').find(n => hashOf(n) === t[0]);
    assert.deepEqual(subsOf(tab.key).map(n => [hashOf(n), n.title]), (t[4] || []).map(s => [s[0], s[1]]), t[1] + ' sub-tabs' + fix);
  });

  // sir-ks02.html: VIEWS, and each view's sub-tab bar, drawn from an inline [[key, label]] table.
  const ksViews = JSON.parse(read('sir-ks02.html').match(/const VIEWS = (\[\[.*?\]\]);/)[1]);
  assert.deepEqual(tabsOf('page:ks').map(n => [hashOf(n), n.title]), ksViews, 'Knowledge Record tabs' + fix);
  const inline = [...read('sir-ks02.html').matchAll(/\{(\[\["[^"]+","[^"]+"\](?:,\["[^"]+","[^"]+"\])+\])\.map/g)]
    .map(m => JSON.parse(m[1]).map(p => p[1]));
  const subBars = { 'tab:ks:ks02': ['WHEEL', '+LIN LOG'], 'tab:ks:mg': ['TIMELINE', 'LEVELS'],
    'tab:ks:ks03': ['MULTIVERSE', 'SOURCE DUMP'] };
  for (const [key, want] of Object.entries(subBars)) {
    assert.deepEqual(titlesOf(subsOf(key)), want, key + ' sub-tabs');
    assert.ok(inline.some(bar => JSON.stringify(bar) === JSON.stringify(want)), key + ': the page no longer draws ' + want.join(' / ') + fix);
  }
  // KOLB and SRCH show the same things under both their sub-tabs, so each is one list.
  for (const [key, bar] of [['tab:ks:kolb', ['ALL', 'UNLINKED']], ['tab:ks:srch', ['LIST', 'DIRECTORY']]]) {
    assert.deepEqual(subsOf(key), [], key + ' is one plain list');
    assert.ok(inline.some(b => JSON.stringify(b) === JSON.stringify(bar)),
      key + ': its sub-tabs are no longer exactly ' + bar.join(' / ') + ' — decide again whether they are one list' + fix);
  }
  // Not counted: the page has other two-label tables that are no tab bar (SOURCE / BLOCKS
  // inside a dump, THEORY / SCHEDULE FOCUS inside LEVELS, a mind map's kind). So a bar
  // added to a tab that has none (CAL, say) is not caught here — only a known bar changing.

  // true-storage.html: VIEWS minus HIDDEN_VIEWS.
  const tsSrc = read('true-storage.html');
  const tsViews = JSON.parse(tsSrc.match(/const VIEWS = (\[\[.*?\]\]);/)[1]);
  const tsHidden = JSON.parse(tsSrc.match(/const HIDDEN_VIEWS = (\[.*?\]);/)[1]);
  assert.deepEqual(tabsOf('page:storage').map(n => [hashOf(n), n.title]),
    tsViews.filter(v => !tsHidden.includes(v[0])), 'Storages tabs' + fix);

  // documentations.html: its two tabs, drawn from an inline table.
  const docTabs = JSON.parse(read('documentations.html').match(/\{(\[\['events', 'Events'\][^\n]*?\])\.map/)[1].replace(/'/g, '"'));
  assert.deepEqual(titlesOf(tabsOf('page:docs')), docTabs.map(t => t[1]), 'Documentations tabs' + fix);

  // index.html: its three panels; the notes widget's tabs.
  const home = read('index.html');
  ['Workspaces', 'Universal calendar', 'Quest'].forEach(t =>
    assert.ok(home.indexOf('class="slot-panel-label">' + t + '<') >= 0, 'Home has no "' + t + '" panel' + fix));
  const widget = read('scripts/notes-widget.js');
  const wTabs = [...widget.matchAll(/\[(?:SORTED|DATE|KOLB), '([^']+)'\]/g)].map(m => m[1]);
  assert.deepEqual(titlesOf(subsOf('tab:home:notes')), wTabs, 'the notes widget\'s tabs' + fix);
});

test('a sub-tab is a HEADING in its tab\'s list, not a level: what it shows is listed under it, in the tab', () => {
  const ix = build({ sourceDumps: [{ id: 'd1', title: 'Lectures', mmLinks: [] }],
    mms: [mm(1, 'Swim')], mgChanges: [{ id: 20, mmId: 1, date: '2026-03-04', newMG: 'kick' }] });
  assert.deepEqual(titlesOf(S.children(ix, 'tab:ks:ks03')), ['MULTIVERSE', 'SOURCE DUMP', 'Lectures'],
    'each heading, then what it shows, in the bar\'s order');
  assert.equal(S.sectionOf(ix, 'tab:ks:ks03', 'dump:d1').title, 'SOURCE DUMP');
  assert.equal(S.sectionOf(ix, 'tab:ks:ks03', 'tab:ks:ks03:multiverse'), null, 'a heading is not under a heading');
  assert.equal(S.count(ix, 'tab:ks:ks03:sourcedump'), 0, 'nothing is inside a sub-tab — it is in the tab');
  assert.equal(S.node(ix, 'tab:ks:ks03').size, 1, 'size counts what is inside, not the headings');
  assert.deepEqual(pathTitles(ix, 'dump:d1'), ['Knowledge Record', 'KS03'], 'no sub-tab on a path');
  assert.equal(S.node(ix, 'dump:d1').depth, 2, 'as deep as the headings beside it');
  assert.deepEqual(titlesOf(S.children(ix, 'tab:ks:mg')), ['TIMELINE', 'MG · kick', 'LEVELS']);
  assert.equal(S.sectionOf(ix, 'tab:ks:mg', 'mg:20').title, 'TIMELINE');
  assert.equal(S.sectionOf(ix, 'mm:1', 'mg:20'), null, 'under its mind map it is under no heading');
  // A heading's own Go →: a sub-tab with no address of its own opens its tab, and says what to press.
  const levels = S.node(ix, 'tab:ks:mg:levels');
  assert.equal(levels.href, 'sir-ks02.html#mg');
  assert.equal(levels.hint, 'Go → opens MG — then press LEVELS.');
  assert.equal(S.node(ix, 'tab:ks:mg:timeline').hint, '', 'the sub-tab a tab opens on needs no hint');
  assert.equal(S.node(ix, 'tab:schedule:project:quest').href, 'progress.html#quest', 'one with its own address uses it');
  assert.deepEqual(titlesOf(S.find(ix, 'levels', null)), ['LEVELS'], 'search still finds a sub-tab by name');
});

// ── where things live ──────────────────────────────────────────────────────

test('mind maps live in SRCH, each under each of its parents; depth and shown path are its shallowest place', () => {
  const ix = build({ mms: MMS() });
  assert.deepEqual(titlesOf(S.children(ix, 'tab:ks:srch')), ['Chem', 'Physics'], 'roots, in stored order');
  assert.deepEqual(titlesOf(S.children(ix, 'mm:1')), ['Organic', 'Inorganic']);
  assert.deepEqual(titlesOf(S.children(ix, 'mm:2')), ['Alkanes', 'Shared']);
  assert.deepEqual(titlesOf(S.children(ix, 'mm:9')), ['Shared'], 'the second parent lists it too');
  const shared = S.node(ix, 'mm:4');
  assert.equal(shared.depth, 3, 'Physics › Shared is shallower than Chem › Organic › Shared');
  assert.deepEqual(pathTitles(ix, 'mm:4'), ['Knowledge Record', 'SRCH', 'Physics']);
  assert.equal(shared.href, 'sir-ks02.html?mm=4');
  assert.equal(shared.meta, 'Procedural', 'the kind, through TrackNoteToSelf.mmKindLabel');
});

test('a mind-map loop with nothing above it is listed once, and every walk over it ends', () => {
  const ix = build({ mms: [mm(1, 'Loop A', { parentIds: [2] }), mm(2, 'Loop B', { parentIds: [1] }), mm(3, 'Self', { parentIds: [3] })] });
  assert.deepEqual(titlesOf(S.children(ix, 'tab:ks:srch')), ['Loop A', 'Self'], 'one entry for the loop, its earliest member');
  assert.deepEqual(titlesOf(S.children(ix, 'mm:1')), ['Loop B']);
  assert.deepEqual(titlesOf(S.children(ix, 'mm:2')), ['Loop A'], 'the loop is drawn as stored; the view guards per path');
  assert.deepEqual(titlesOf(S.find(ix, 'loop', null)), ['Loop A', 'Loop B']);
  assert.deepEqual(S.inside(ix, 'mm:1'), ['mm:2'], 'inside() visits each entry once');
  assert.deepEqual(pathTitles(ix, 'mm:2'), ['Knowledge Record', 'SRCH', 'Loop A']);
});

test('Kolbs and MG changes live under their mind map; KOLB, MG → TIMELINE and the notes widget list them too', () => {
  const ix = build({
    mms: [mm(1, 'Swim'), mm(2, 'Breath', { parentIds: [1] })],
    kolbs: [{ id: 10, mmId: 1, date: '2026-03-01', experience: 'first lap', feelings: 'tired' },
      { id: 11, mmId: 1, date: '2026-03-04', experience: 'second lap', level: '4' },
      { id: 12, mmId: null, date: '2026-03-05', experience: 'loose one' }],
    mgChanges: [{ id: 20, mmId: 1, date: '2026-03-04', oldMG: 'kick', newMG: 'kick from the hip' }]
  });
  assert.deepEqual(titlesOf(S.children(ix, 'mm:1')),
    ['Breath', 'Kolb · 2026-03-04', 'Kolb · 2026-03-01', 'MG · kick from the hip'], 'after its child mind maps, newest first');
  assert.deepEqual(titlesOf(S.children(ix, 'tab:ks:kolb')), ['Kolb · 2026-03-05', 'Kolb · 2026-03-04', 'Kolb · 2026-03-01'],
    'KOLB is every Kolb — its ALL and UNLINKED in one list');
  assert.deepEqual(pathTitles(ix, 'kolb:10'), ['Knowledge Record', 'SRCH', 'Swim'], 'shown where it lives');
  assert.deepEqual(pathTitles(ix, 'kolb:12'), ['Knowledge Record', 'KOLB'], 'one with no mind map lives in KOLB');
  assert.deepEqual(titlesOf(S.children(ix, 'tab:home:notes')).slice(-4), ['Kolbs', 'Kolb · 2026-03-05', 'Kolb · 2026-03-04', 'Kolb · 2026-03-01']);
  const kolb = S.node(ix, 'kolb:10');
  assert.deepEqual(kolb.fields.map(f => f.label), ['Experience', 'Feelings'], 'TrackKolb.TEXT_FIELDS, blanks dropped');
  assert.equal(S.node(ix, 'kolb:11').fields[0].label, 'Level');
  assert.equal(kolb.href, 'sir-ks02.html?mm=1');
  assert.equal(S.node(ix, 'kolb:12').href, 'sir-ks02.html#kolb');
});

test('BIGGER PARENTS FIRST is measured where a thing lives — a tab that also lists it never lifts it', () => {
  const ix = build({
    mms: [mm(1, 'Chem'), mm(2, 'Organic', { parentIds: [1] }), mm(3, 'Alkanes', { parentIds: [2] })],
    kolbs: [{ id: 7, mmId: 3, date: '2026-01-02', experience: 'alkanes lab went wrong' }]
  });
  assert.equal(S.node(ix, 'kolb:7').depth, S.node(ix, 'mm:3').depth + 1,
    'one below its mind map, not at KOLB\'s level, where it is also listed');
  assert.deepEqual(titlesOf(S.find(ix, 'alkanes', null)), ['Alkanes', 'Kolb · 2026-01-02']);
});

// ── finding ────────────────────────────────────────────────────────────────

test('BIGGER PARENTS FIRST: depth decides, then a title hit, then directory order', () => {
  const ix = build({
    mms: [mm(1, 'Bond theory'), mm(2, 'Covalent', { parentIds: [1], explanation: 'shared bond pairs' }),
      mm(3, 'Sigma bond', { parentIds: [2] }), mm(4, 'Ionic', { parentIds: [1] })],
    kolbs: [{ id: 7, mmId: 3, date: '2026-01-02', experience: 'drew the bond wrong' }]
  });
  assert.deepEqual(titlesOf(S.find(ix, 'bond', null)),
    ['Bond theory', 'Covalent', 'Sigma bond', 'Kolb · 2026-01-02'],
    'one level down, then two (a body hit), then three (a title hit), then the Kolb under it');
  const flat = build({ mms: [mm(1, 'Notes on bonds', { explanation: 'x' }), mm(2, 'Other', { explanation: 'about bonds' }),
    mm(3, 'Bonds', {})] });
  assert.deepEqual(titlesOf(S.find(flat, 'bonds', null)), ['Notes on bonds', 'Bonds', 'Other'],
    'at one depth a title hit comes before a body-only hit; ties keep directory order');
});

test('every word must be present, in any order and either case', () => {
  const ix = build({ mms: [mm(1, 'Organic chemistry', { explanation: 'Reaction mechanisms' }), mm(2, 'Organic farming')] });
  assert.deepEqual(titlesOf(S.find(ix, 'MECHANISMS organic', null)), ['Organic chemistry']);
  assert.deepEqual(titlesOf(S.find(ix, 'organic', null)), ['Organic chemistry', 'Organic farming']);
  assert.deepEqual(S.find(ix, '   ', null), [], 'a blank query finds nothing');
  assert.deepEqual(S.find(ix, 'organic zebra', null), []);
});

test('a search inside a folder finds only what is under it — the user\'s search, click in, search again', () => {
  const ix = build({ mms: MMS() });
  assert.deepEqual(titlesOf(S.find(ix, 'a', 'mm:2')), ['Alkanes', 'Shared'],
    'inside Organic only, and both one level down as the folder shows them — Shared is not ranked by its Physics place');
  assert.deepEqual(pathTitles(ix, 'mm:5', 'mm:1'), ['Organic'], 'a hit\'s path is counted from the folder searched in');
  assert.deepEqual(pathTitles(ix, 'mm:4', 'mm:1'), ['Organic'], 'not "SRCH › Physics" while inside Chem');
  assert.deepEqual(pathTitles(ix, 'mm:2', 'mm:1'), [], 'a direct child has no path between');
  assert.deepEqual(titlesOf(S.find(ix, 'shared', 'mm:9')), ['Shared'], 'reachable through its second parent too');
  assert.deepEqual(S.find(ix, 'chem', 'mm:2'), [], 'never the folder itself or anything above it');
  assert.deepEqual(titlesOf(S.find(ix, 'chem', 'tab:ks:srch')), ['Chem']);
  assert.deepEqual(titlesOf(S.find(ix, 'chem', 'page:docs')), [], 'another page holds none of it');
  assert.deepEqual(titlesOf(S.find(ix, 'chem', null)).slice(0, 1), ['Chem']);
});

test('accents and Thai marks written two ways still match (FILES\' searchNorm)', () => {
  // Built from code points (docs/TESTING-LESSONS.md: never \\u escapes through the tools).
  const cafe = 'caf' + String.fromCharCode(0xe9);                       // é, composed
  const cafeDecomposed = 'cafe' + String.fromCharCode(0x301);            // e + combining acute
  const thaiAm = String.fromCharCode(0x0e19, 0x0e49, 0x0e33);            // น้ำ, with SARA AM
  const thaiSplit = String.fromCharCode(0x0e19, 0x0e49, 0x0e4d, 0x0e32); // the same word, AM decomposed
  const ix = build({ mms: [mm(1, 'Le ' + cafe), mm(2, thaiAm + ' water')] });
  assert.deepEqual(titlesOf(S.find(ix, 'cafe', null)), ['Le ' + cafe], 'a plain e finds é');
  assert.deepEqual(titlesOf(S.find(ix, cafeDecomposed, null)), ['Le ' + cafe]);
  assert.deepEqual(titlesOf(S.find(ix, thaiSplit, null)), [thaiAm + ' water']);
  assert.deepEqual(titlesOf(S.find(ix, thaiAm, null)), [thaiAm + ' water']);
});

test('snippet: an excerpt of the stored text where the query lands; null for a title-only hit', () => {
  const long = 'x'.repeat(200) + ' the hidden needle sits here ' + 'y'.repeat(200);
  const ix = build({ mms: [mm(1, 'Haystack', { explanation: long })] });
  const n = S.node(ix, 'mm:1');
  const sn = S.snippet(ix, n, 'needle');
  assert.equal(sn.label, 'Explanation');
  assert.ok(sn.text.indexOf('hidden needle sits here') >= 0 && sn.text.startsWith('…') && sn.text.endsWith('…'));
  assert.equal(S.snippet(ix, n, 'haystack'), null);
});

// ── each page's things ─────────────────────────────────────────────────────

test('source dumps: KS03 → SOURCE DUMP, a tree by parentId (a loop listed once), each holding its text blocks; Storages lists them too', () => {
  const ix = build({
    mms: [mm(7, 'Optics')],
    sourceDumps: [
      { id: 'd1', title: 'Lectures', parentId: null, mmLinks: [] },
      { id: 'd2', title: 'Week 1', parentId: 'd1', createdAt: '2026-02-01',
        mmLinks: [{ id: 's1', mmId: 7, textBlocks: [{ id: 'b1', title: 'Snell', explanation: 'n1 sin a = n2 sin b' }] },
          { id: 's2', mmId: 99, text: 'legacy prose only' }] },
      { id: 'd3', title: 'Loop X', parentId: 'd4', mmLinks: [] },
      { id: 'd4', title: 'Loop Y', parentId: 'd3', mmLinks: [] }
    ]
  });
  assert.deepEqual(titlesOf(S.children(ix, 'tab:ks:ks03')), ['MULTIVERSE', 'SOURCE DUMP', 'Lectures', 'Loop X']);
  assert.deepEqual(titlesOf(S.children(ix, 'tab:storage:sourcedump')), ['Lectures', 'Loop X'], 'its twin on Storages');
  assert.deepEqual(titlesOf(S.children(ix, 'dump:d2')), ['Snell', 'legacy prose only'],
    'blocks through TrackSourceDump.textBlocksOf, which also reads the legacy `text`');
  const snell = S.node(ix, 'blk:d2:b1');
  assert.equal(snell.href, 'sir-ks02.html?dump=d2&mm=7');
  assert.equal(snell.meta, 'Text block · Optics');
  assert.deepEqual(titlesOf(S.find(ix, 'sin', null)), ['Snell']);
  assert.deepEqual(pathTitles(ix, 'blk:d2:b1'), ['Knowledge Record', 'KS03', 'Lectures', 'Week 1'], 'where it lives: KS03');
});

test('goals: Documentations → Projects as stored, milestones and pages under their goal, links not followed; PROGRESSION and MILESTONES list them too', () => {
  const goals = [{
    id: 'g1', title: 'Pass finals', children: [
      { id: 'sg', title: 'Maths', isSubGoal: true, children: [{ id: 't1', title: 'Past papers', children: [] }],
        milestones: [{ id: 'm1', title: 'Mocks done', startDate: '2026-04-01', endDate: '2026-04-20' }] },
      { id: 'lnk', title: 'Past papers', isLink: true, linkedTaskId: 't1', children: [] },
      { id: 't2', title: 'Sleep plan', completed: true, children: [] }
    ]
  }];
  const ix = build({ goals, docPages: [{ id: 'p1', title: 'Revision plan', goalId: 'g1', blocks: [] }] });
  assert.deepEqual(titlesOf(S.children(ix, 'tab:docs:projects')), ['Pass finals']);
  assert.deepEqual(titlesOf(S.children(ix, 'goal:g1')), ['Maths', 'Sleep plan', 'Revision plan'], 'the link is skipped; its page last');
  assert.deepEqual(titlesOf(S.children(ix, 'goal:sg')), ['Past papers', 'Mocks done']);
  assert.deepEqual(titlesOf(S.children(ix, 'tab:schedule:project')),
    ['PROGRESSION', 'Pass finals', 'MILESTONES', 'Mocks done', 'QUEST']);
  assert.deepEqual(pathTitles(ix, 'ms:sg:m1'), ['Documentations', 'Projects', 'Pass finals', 'Maths'], 'where it lives');
  assert.equal(S.node(ix, 'task:t1').href, 'documentations.html?goal=sg', 'a task opens its own goal\'s page');
  assert.equal(S.node(ix, 'goal:g1').href, 'documentations.html?goal=g1');
  assert.equal(S.node(ix, 'ms:sg:m1').href, 'documentations.html?goal=sg', 'Note to self\'s milestone link');
  assert.equal(S.node(ix, 'task:t2').meta, 'Task · done');
  assert.deepEqual(titlesOf(S.find(ix, 'past papers', null)), ['Past papers'], 'listed once, where it lives');
  // Projects has no address of its own; the first goal's ?goal= link opens it.
  assert.equal(S.node(ix, 'tab:docs:projects').href, 'documentations.html?goal=g1');
  assert.equal(S.node(ix, 'tab:docs:projects').hint, '');
  const none = build({});
  assert.equal(none.nodes.get('tab:docs:projects').href, 'documentations.html');
  assert.equal(none.nodes.get('tab:docs:projects').hint, 'Go → opens Documentations — then press Projects.');
});

test('a goal subtree that repeats itself in memory ends (a per-path guard)', () => {
  const g = { id: 'g', title: 'Loop goal', children: [] };
  g.children.push(g);
  const ix = build({ goals: [g] });
  assert.deepEqual(titlesOf(S.children(ix, 'tab:docs:projects')), ['Loop goal']);
});

test('documentation pages: Events holds the pages with no goal, a tree by parentId; table cells and link blocks are searchable', () => {
  const ix = build({ docPages: [
    { id: 'p1', title: 'Course', parentId: null, blocks: [{ id: 'x', type: 'p', text: 'Overview of the term' }] },
    { id: 'p2', title: 'Timetable', parentId: 'p1', goalId: 'g1', blocks: [
      { id: 't', type: 'table', rows: [['Mon', 'Thermo'], ['Tue', 'Quantum']] },
      { id: 'l', type: 'link', title: 'Syllabus', url: 'https://example.invalid/s' }] },
    { id: 'p3', title: 'Orphan', goalId: 'gone', blocks: [] }
  ] });
  assert.deepEqual(titlesOf(S.children(ix, 'tab:docs:events')), ['Course']);
  assert.deepEqual(titlesOf(S.children(ix, 'doc:p1')), ['Timetable']);
  assert.deepEqual(titlesOf(S.find(ix, 'quantum', null)), ['Timetable']);
  assert.deepEqual(titlesOf(S.find(ix, 'syllabus', null)), ['Timetable']);
  assert.equal(S.node(ix, 'doc:p2').href, 'documentations.html?page=p2');
  assert.equal(S.node(ix, 'doc:p2').meta, 'Project page');
  assert.deepEqual(pathTitles(ix, 'doc:p3'), ['Documentations'], 'a page whose goal is gone is still listed, straight under its page');
});

test('the Schedule: day notes, deadlines and classes in month folders under SCHEDULE, newest first; ★ CALENDAR and ■ ACTIONS', () => {
  const ix = build({
    calendarNotes: [{ id: 'n1', date: '2026-03-02', title: 'Call advisor', detail: 'about the thesis' },
      { id: 'n2', date: '2026-04-09', title: 'Gym', parts: [{ id: 'p', notes: [{ id: 'q', text: 'leg day' }] }] }],
    deadlines: [{ id: 'dl1', date: '2026-03-20', title: 'Essay', time: '17:00', done: true }],
    refSchedules: [{ id: 'c1', date: '2026-03-03', title: 'Thermo', time: '09:00', detail: 'Room 4' },
      { id: 'c2', dow: 1, title: 'Seminar', time: '13:00' }],
    saActions: [{ id: 'a1', title: 'Read', emoji: '📖' }]
  });
  assert.deepEqual(titlesOf(S.children(ix, 'tab:schedule:schedule')), ['Day notes', 'Deadlines', 'Timetable classes']);
  assert.deepEqual(titlesOf(S.children(ix, 'tab:schedule:calendar')), ['Day notes', 'Deadlines'], '★ Forced: no classes');
  assert.deepEqual(titlesOf(S.children(ix, 'tab:schedule:actions')), ['📖 Read']);
  assert.deepEqual(titlesOf(S.children(ix, 'grp:sched:notes')), ['April 2026', 'March 2026']);
  assert.deepEqual(titlesOf(S.children(ix, 'grp:sched:cls')), ['March 2026', 'Weekly']);
  assert.equal(S.node(ix, 'dl:dl1').href, 'progress.html?date=2026-03-20&dl=dl1#schedule');
  assert.equal(S.node(ix, 'note:n1').href, 'progress.html?date=2026-03-02#schedule');
  assert.equal(S.node(ix, 'cls:c2').meta, 'Class · every Monday 13:00');
  assert.equal(S.node(ix, 'sa:a1').href, 'progress.html#actions');
  assert.deepEqual(titlesOf(S.find(ix, 'leg day', null)), ['Gym'], 'a block\'s ✎ notes are searchable');
  assert.deepEqual(titlesOf(S.find(ix, 'thesis', null)), ['Call advisor']);
  assert.deepEqual(pathTitles(ix, 'note:n1'), ['Schedule', 'SCHEDULE', 'Day notes', 'March 2026']);
});

test('the notes widget, under Home: Sorted notes and the Journal by month, each under its tab\'s heading, with no page to open', () => {
  const ix = build({
    notes: [{ id: 'sn1', topic: 'Ideas', content: 'a spaced deck' }],
    dateNotes: { '2026-03-05': { content: 'felt slow today', tag: 'eternal' }, '2026-02-01': 'bare string day',
      '2026-02-02': { content: '   ' }, 'not-a-day': { content: 'skipped' } }
  });
  assert.deepEqual(titlesOf(S.children(ix, 'tab:home:notes')),
    ['Sorted', 'Ideas', 'Journal', 'March 2026', 'February 2026', 'Kolbs']);
  assert.equal(S.sectionOf(ix, 'tab:home:notes', 'tab:home:notes:journal:2026-03').title, 'Journal');
  assert.deepEqual(titlesOf(S.children(ix, 'tab:home:notes:journal:2026-02')), ['2026-02-01'], 'a blank day is not listed');
  assert.equal(S.node(ix, 'jn:2026-03-05').meta, 'eternal · felt slow today');
  assert.equal(S.node(ix, 'sn:sn1').href, null);
  assert.equal(S.node(ix, 'jn:2026-02-01').href, null);
  assert.deepEqual(titlesOf(S.find(ix, 'spaced', null)), ['Ideas']);
});

test('Storages: storage tags in a folder on SOURCE DUMP, FILES as its tree; a file opens on True Storage\'s ?file= link', () => {
  const ix = build({
    trueStorages: [{ id: 's1', name: 'Exam box', parentIds: [] }, { id: 's2', name: 'Week box', parentIds: ['s1'], explanation: 'only week 2' }],
    files: [{ id: 'f1', kind: 'folder', name: 'Year 2' }, { id: 'f2', kind: 'note', name: 'plan.md', text: 'revise optics', parentIds: ['f1'] },
      { id: 'f3', kind: 'file', name: 'slides.pdf', mime: 'application/pdf', parentIds: ['f1'] }]
  });
  assert.deepEqual(titlesOf(S.children(ix, 'tab:storage:sourcedump')), ['Storage tags']);
  assert.deepEqual(titlesOf(S.children(ix, 'grp:storage:tags')), ['Exam box']);
  assert.deepEqual(titlesOf(S.children(ix, 'st:s1')), ['Week box']);
  assert.equal(S.node(ix, 'st:s2').href, 'true-storage.html?storage=s2');
  assert.deepEqual(titlesOf(S.children(ix, 'tab:storage:files')), ['Year 2']);
  assert.deepEqual(titlesOf(S.children(ix, 'file:f1')), ['plan.md', 'slides.pdf']);
  assert.equal(S.node(ix, 'file:f1').kind, 'filefolder', 'a FILES folder is something the user made, not a folder search made');
  assert.equal(S.node(ix, 'file:f2').href, 'true-storage.html?file=f2#files');
  assert.equal(S.node(ix, 'file:f1').href, 'true-storage.html#files');
  assert.deepEqual(titlesOf(S.find(ix, 'optics', null)), ['plan.md']);
});

test('hostile data: nulls, missing and repeated ids never throw, and every key is unique', () => {
  const ix = build({
    mms: [null, 3, mm(1, 'One'), mm(1, 'One again'), { name: 'no id' }],
    kolbs: [null, { date: '2026-01-01' }, { id: 5 }, { id: 5 }],
    sourceDumps: [{ id: 'd', title: 'D', mmLinks: [null, { id: 's', textBlocks: [null, { title: 'T' }, { title: 'T' }] }] }],
    goals: [null, { title: 'no id', children: [null, { title: 'child' }] }],
    calendarNotes: [{ id: 'n', date: 'garbage', title: 'Undated' }],
    dateNotes: null,
    files: [{ id: 'f', kind: 'mystery', name: 'odd' }]
  });
  assert.equal(new Set(ix.order).size, ix.order.length, 'keys are unique');
  assert.deepEqual(titlesOf(S.children(ix, 'tab:ks:srch')).slice(0, 1), ['One'], 'the first of two same-id mind maps');
  assert.ok(S.children(ix, 'grp:sched:notes:none').length === 1, 'an undated day note sits in "No date"');
  assert.equal(S.node(ix, 'file:f').meta, 'File', 'an unknown kind reads as a file (TrackFiles.kindOf)');
  assert.ok(Array.isArray(S.find(ix, 't', null)));
  ix.order.forEach(k => assert.ok(S.node(ix, k).depth >= 0, k + ' is reachable'));
});

test('a large workspace builds and searches in a time that leaves typing smooth', () => {
  const mms = [], kolbs = [], notes = [];
  for (let i = 1; i <= 3000; i++) {
    mms.push(mm(i, 'Mind map ' + i, { parentIds: i > 30 ? [1 + (i % 30)] : [], explanation: 'words '.repeat(20) + i }));
    kolbs.push({ id: 100000 + i, mmId: i, date: '2026-01-01', experience: 'reflection number ' + i });
    notes.push({ id: 'n' + i, date: '2026-0' + (1 + (i % 9)) + '-01', title: 'Note ' + i, detail: 'detail text ' + i });
  }
  let t0 = process.hrtime.bigint();
  const ix = build({ mms, kolbs, calendarNotes: notes });
  const buildMs = Number(process.hrtime.bigint() - t0) / 1e6;
  t0 = process.hrtime.bigint();
  const hits = S.find(ix, 'number 2999', null);
  const findMs = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('# 9,000+ entries: build ' + buildMs.toFixed(1) + ' ms, one search ' + findMs.toFixed(1) + ' ms');
  assert.deepEqual(titlesOf(hits), ['Kolb · 2026-01-01']);
  // Loose bounds: a guard against an accidental quadratic, not a benchmark.
  assert.ok(buildMs < 4000, 'build took ' + buildMs + ' ms');
  assert.ok(findMs < 400, 'a search took ' + findMs + ' ms');
});
