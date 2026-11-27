/* ── search-core.js ────────────────────────────────────────────────────────
   window.TrackSearch: Universal Search's index — the user's 2026-11-26
   request: "UNIVERSAL SEARCH — make sure it doesn't make the website even
   slower and make me able to search in directory type way", then "make it its
   own interface of choosing (like directory folder) and also with a search
   bar", "I can choose the specifics before it transfers me to the page",
   "the bigger parents always come first on top", and "search and click to go
   in that directory and search again … until I hit the button".

   This file decides WHAT is listed, WHERE each thing sits, and WHAT a query
   finds. scripts/search-view.js draws it; scripts/search.js loads both only
   when search is first opened.

   Rules — the first three are the load-bearing ones:

   - It is a READER's core. It reads only the slot it is handed and writes
     nothing. No date code (a month folder is cut from the stored day string),
     no ids minted, no storage read: so its suite runs once, not swept.
   - ONE DEFINITION PER RULE. The mind-map tree, the storages tree and the
     FILES tree are TrackMMTree's (`roots`, `childIndex`) — files and storages
     share the mind maps' `parentIds` shape on purpose. A source dump's or a
     documentation page's single `parentId` is walked through the SAME
     functions, as `parentIds: [parentId]`, so a loop with nothing above it
     still gets one entry. Text is compared through TrackFiles.searchNorm (the
     FILES Find's normaliser: NFKD, lower case, one space), a source dump's
     blocks come from TrackSourceDump.textBlocksOf (which also reads the
     legacy `text`), a Kolb's questions from TrackKolb.TEXT_FIELDS, a journal
     day's text from TrackNotes.dateNoteText and a mind map's kind from
     TrackNoteToSelf.mmKindLabel. All arrive in `deps`, so the offline suite
     hands in the real modules.
   - Every walk carries a cycle guard. A mind map under two parents is listed
     under both (a folder is what is inside it, however you got there); depth
     and the one path a hit shows are where it LIVES — its shallowest place
     along the links marked as its own, before any tab that only also shows
     it (`walk`) — found by one breadcrumb-free walk that visits each entry
     once. A goal subtree is walked with a per-path guard and a depth cap, and
     a goal-tree LINK is not followed at all: its original is listed where it
     lives.

   - "Bigger parents first": `find` sorts by that depth, then by whether the
     TITLE holds every word, then by place in the directory.
   - A query is words; an entry matches when its text holds EVERY word. A
     query searches inside one folder (`scope`) and everything under it, or
     everywhere when the scope is null.
   - `href` is the page an entry opens on — the links the other surfaces
     already use (Note to self's deadline and milestone links, True Storage's
     `?file=…#files`). An entry with no page (a note in the notes widget) has
     no href, and the view says where it lives instead.
*/
(function (global) {
  'use strict';

  function isMap(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function records(v) { return Array.isArray(v) ? v.filter(isMap) : []; }
  function str(v) { return typeof v === 'string' ? v : (typeof v === 'number' && isFinite(v) ? String(v) : ''); }
  function isId(v) { return (typeof v === 'number' && isFinite(v)) || (typeof v === 'string' && v !== ''); }
  function isDay(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function enc(v) { return encodeURIComponent(str(v)); }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function monthTitle(ym) {
    var m = Number(ym.slice(5, 7));
    return (MONTHS[m - 1] || ym.slice(5, 7)) + ' ' + ym.slice(0, 4);
  }

  // The first non-blank line, cut to `max` characters.
  function firstLine(s, max) {
    var lines = str(s).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (l) return l.length > (max || 90) ? l.slice(0, (max || 90) - 1) + '…' : l;
    }
    return '';
  }

  // The text of a list of block or class notes, whatever shape a note took.
  function notesText(list) {
    return records(list).map(function (n) {
      return [n.title, n.text, n.content].map(str).filter(Boolean).join(' — ');
    }).filter(Boolean).join('\n');
  }

  function partsNotes(item) {
    return records(item && item.parts).map(function (p) {
      return [str(p.title), notesText(p.notes)].filter(Boolean).join('\n');
    }).filter(Boolean).join('\n');
  }

  // A documentation page's words: headings and paragraphs, every table cell,
  // and a link block's label and address. Other blocks hold no words.
  function blocksText(blocks) {
    var out = [];
    records(blocks).forEach(function (b) {
      if (typeof b.text === 'string' && b.text.trim()) out.push(b.text);
      if (b.type === 'table' && Array.isArray(b.rows)) {
        b.rows.forEach(function (row) {
          if (Array.isArray(row)) out.push(row.map(str).filter(Boolean).join(' | '));
        });
      }
      if (b.type === 'link') out.push([b.title, b.label, b.url, b.href].map(str).filter(Boolean).join(' '));
    });
    return out.filter(Boolean).join('\n');
  }

  /* The five pages, in the site's order, each with its tabs and sub-tabs as
     the page itself draws them (the user, 2026-11-26: "I want the search
     directory to look real so also put the tabs and subtabs into the search
     too", "divided to 5 parts"; the draft they approved the same evening).
     Labels are the pages' own, and tests/search-core.test.js reads each
     page's own tab table to keep them so. `href` is an address the page
     already reads (progress.html's TABS keys, sir-ks02.html's VIEWS,
     true-storage.html's VIEWS); a sub-tab with none takes its tab's, which
     lands on the tab's FIRST sub-tab — so a later one says, in `press`, which
     button shows it.

     A SUB-TAB IS NOT A LEVEL ("if it's just sub tab I don't want to click
     just to show it"): it is a heading in its tab's own list, with its own
     Go →, and what it shows is listed under the heading — in the tab. SRCH's
     LIST and DIRECTORY show the same tree, and KOLB's ALL and UNLINKED the
     same Kolbs, so each of those tabs is one plain list.

     Home has no tabs: its three sections stand in, and the notes widget,
     which floats on every page, is listed under it with its own tabs. */
  var PAGES = [
    { id: 'home', title: 'Home', href: 'index.html', meta: 'Workspaces, the universal calendar, Quest, and the notes widget', tabs: [
      { id: 'workspaces', title: 'Workspaces', kind: 'section', meta: 'Create, rename, switch, import and export workspaces' },
      { id: 'calendar', title: 'Universal calendar', kind: 'section', meta: 'Day notes, deadlines, classes and milestones by month' },
      { id: 'quest', title: 'Quest', kind: 'section', meta: 'Starred quests and the quest tree' },
      { id: 'notes', title: '✎ Notes', kind: 'widget', href: null, meta: 'The notes widget: the ✎ button at the bottom right of every page', tabs: [
        { id: 'sorted', title: 'Sorted', meta: 'Sorted notes' },
        { id: 'journal', title: 'Journal', meta: 'One note a day, by month' },
        { id: 'kolbs', title: 'Kolbs', meta: 'Every Kolb, newest first' }
      ] }
    ] },
    { id: 'schedule', title: 'Schedule', href: 'progress.html', meta: 'The day, the calendar, learning, projects and actions', tabs: [
      { id: 'schedule', title: 'SCHEDULE', href: 'progress.html#schedule', meta: 'Day notes, deadlines and timetable classes' },
      { id: 'calendar', title: '★ CALENDAR', href: 'progress.html#calendar', meta: '★ Forced: day notes and deadlines' },
      { id: 'learn', title: '● LEARN', href: 'progress.html#learn', meta: 'Mind maps and MGs to work on', tabs: [
        { id: 'mindmaps', title: 'MIND MAPS', href: 'progress.html#mindmaps', meta: 'Today\'s mind maps' },
        { id: 'mg', title: 'MG', href: 'progress.html#mg', meta: 'The MG schedule' }
      ] },
      { id: 'project', title: '▲ PROJECT', href: 'progress.html#project', meta: 'Goals, milestones and quests', tabs: [
        { id: 'progression', title: 'PROGRESSION', href: 'progress.html#progression', meta: 'The goal overview' },
        { id: 'milestones', title: 'MILESTONES', href: 'progress.html#milestones', meta: 'Every milestone' },
        { id: 'quest', title: 'QUEST', href: 'progress.html#quest', meta: 'The quest tree' }
      ] },
      { id: 'actions', title: '■ ACTIONS', href: 'progress.html#actions', meta: 'Supporting actions' }
    ] },
    { id: 'ks', title: 'Knowledge Record', href: 'sir-ks02.html', meta: 'Mind maps, Kolbs, MG changes and source dumps', tabs: [
      { id: 'cal', title: 'CAL', href: 'sir-ks02.html#calendar', meta: 'SIR sessions by day' },
      { id: 'ks02', title: 'KS02', href: 'sir-ks02.html#ks02', meta: 'The encoding wheel and the +Lin log', tabs: [
        { id: 'wheel', title: 'WHEEL', meta: 'The encoding wheel' },
        { id: 'linlog', title: '+LIN LOG', press: true, meta: 'Every +Lin entry, by day' }
      ] },
      { id: 'mg', title: 'MG', href: 'sir-ks02.html#mg', meta: 'Marginal gains', tabs: [
        { id: 'timeline', title: 'TIMELINE', meta: 'Every MG change, newest first' },
        { id: 'levels', title: 'LEVELS', press: true, meta: 'Theory and schedule focus, by level' }
      ] },
      { id: 'ks03', title: 'KS03', href: 'sir-ks02.html#ks03', meta: 'Mind map storage', tabs: [
        { id: 'multiverse', title: 'MULTIVERSE', meta: 'Every mind map on one canvas' },
        { id: 'sourcedump', title: 'SOURCE DUMP', press: true, meta: 'Source dumps and their text blocks' }
      ] },
      // ALL and UNLINKED: one list (an unlinked Kolb lives here; the rest under their mind map).
      { id: 'kolb', title: 'KOLB', href: 'sir-ks02.html#kolb', meta: 'Every Kolb, newest first' },
      // LIST and DIRECTORY: one list — the mind maps live here.
      { id: 'srch', title: 'SRCH', href: 'sir-ks02.html#srch', meta: 'The mind-map tree' }
    ] },
    { id: 'docs', title: 'Documentations', href: 'documentations.html', meta: 'Event pages, and goals with their project pages', tabs: [
      { id: 'events', title: 'Events', href: 'documentations.html', meta: 'Pages that belong to no goal' },
      // Its href becomes the first goal's ?goal= link, which opens Projects, when there is one.
      { id: 'projects', title: 'Projects', href: 'documentations.html', press: true, meta: 'Goals with their tasks, milestones and pages' }
    ] },
    { id: 'storage', title: 'Storages', href: 'true-storage.html', meta: 'Source dumps, storage tags and FILES', tabs: [
      { id: 'sourcedump', title: 'SOURCE DUMP', href: 'true-storage.html#sourcedump', meta: 'Source dumps, and the storage tags they carry' },
      { id: 'files', title: 'FILES', href: 'true-storage.html#files', meta: 'Folders, notes and files' }
    ] }
  ];

  // The page an entry is listed straight under if no walk reached it.
  var HOME_OF = { notes: 'page:home', schedule: 'page:schedule', ks: 'page:ks', dumps: 'page:ks',
    goals: 'page:docs', docs: 'page:docs', storages: 'page:storage', files: 'page:storage' };

  /* A breadth-first walk from `seeds` that follows every entry's PRIMARY
     place — where it lives — before any place it is ALSO shown (a Kolb is
     under its mind map, and also under KOLB → ALL and the notes widget's
     Kolbs). So depth, and the one path a hit shows, are its real place's:
     a tab listing everything at one level cannot flatten "bigger parents
     first". Each entry is visited once, which is the cycle guard. */
  function walk(kids, prim, seeds) {
    var depth = new Map(), parent = new Map(), keys = [], queue = [], later = [];
    function visit(from, c) {
      if (depth.has(c)) return;
      depth.set(c, depth.get(from) + 1);
      parent.set(c, from);
      keys.push(c);
      queue.push(c);
    }
    seeds.forEach(function (k) {
      if (depth.has(k)) return;
      depth.set(k, 0); parent.set(k, null); queue.push(k);
    });
    var qi = 0;
    for (;;) {
      for (; qi < queue.length; qi++) {
        var from = queue[qi];
        (prim.get(from) || []).forEach(function (c) { visit(from, c); });
        (kids.get(from) || []).forEach(function (c) { if (!depth.has(c)) later.push([from, c]); });
      }
      if (!later.length) break;
      var batch = later;
      later = [];
      batch.forEach(function (p) { visit(p[0], p[1]); });
    }
    return { depth: depth, parent: parent, keys: keys };
  }

  function build(slot, deps) {
    var s = isMap(slot) ? slot : {};
    var d = deps || {};
    var T = d.tree, FS = d.files, SD = d.dumps, K = d.kolb, NT = d.notes;
    if (!T || !FS) throw new Error('search-core.js needs mm-tree-core.js and files-core.js');
    var norm = FS.searchNorm;
    var kindLabel = typeof d.kindLabel === 'function' ? d.kindLabel : function (t) { return str(t); };

    var PJ = d.project;
    var nodes = new Map();      // key → entry
    var kids = new Map();       // key → [child key], in directory order: every place it is shown
    var kidSets = new Map();
    var prim = new Map();       // key → [child key] whose PRIMARY place is here
    var order = [];             // every key, in the order it was put
    var subOf = new Map();      // sub-tab key → its tab (a sub-tab is a heading, not a level)
    var sect = new Map();       // tab key → Map(child key → the sub-tab it is listed under)

    function put(n) {
      if (nodes.has(n.key)) return n.key;
      n.fields = (n.fields || []).filter(function (f) { return f && str(f.text).trim(); });
      n.meta = str(n.meta);
      n.title = str(n.title) || '(untitled)';
      n.href = n.href || null;
      n.idx = order.length;
      nodes.set(n.key, n);
      order.push(n.key);
      return n.key;
    }
    // `also`: shown here too, but this is not where it lives. Linked under a
    // SUB-TAB, it goes in that sub-tab's tab, after the sub-tab's heading.
    function link(parent, key, also) {
      var sub = null;
      if (subOf.has(parent)) { sub = parent; parent = subOf.get(parent); }
      if (parent === key || !nodes.has(key) || !nodes.has(parent)) return;
      var set = kidSets.get(parent);
      if (!set) { set = new Set(); kidSets.set(parent, set); kids.set(parent, []); }
      if (!also) {
        var p = prim.get(parent);
        if (!p) { p = []; prim.set(parent, p); }
        if (p.indexOf(key) < 0) p.push(key);
      }
      if (set.has(key)) return;
      set.add(key);
      kids.get(parent).push(key);
      if (sub) {
        var m = sect.get(parent);
        if (!m) { m = new Map(); sect.set(parent, m); }
        m.set(key, sub);
      }
    }
    // A grouping folder made on first use: "Day notes", "November 2026" …
    function group(parent, key, title, meta, href, area) {
      if (!nodes.has(key)) put({ key: key, kind: 'folder', title: title, meta: meta, href: href, area: area });
      link(parent, key);
      return key;
    }
    // A key unique even when stored data repeats an id.
    function keyFor(prefix, id, i) {
      var k = prefix + ':' + (isId(id) ? str(id) : '#' + i);
      return nodes.has(k) ? k + '#' + i : k;
    }

    // ── The pages, their tabs and sub-tabs ──
    var firstGoal = records(s.goals).filter(function (g) { return !g.isLink && isId(g.id); })[0];
    function tabs(list, parentKey, parentTitle, parentHref, pageId, level) {
      (list || []).forEach(function (t) {
        var key = parentKey.replace(/^page:/, 'tab:') + ':' + t.id;
        var href = t.href !== undefined ? t.href : parentHref;
        var press = !!t.press;
        if (key === 'tab:docs:projects' && firstGoal) { href = 'documentations.html?goal=' + enc(firstGoal.id); press = false; }
        var area = t.kind === 'widget' ? 'notes' : pageId;
        var kind = t.kind || (level ? 'subtab' : 'tab');
        put({ key: key, kind: kind, title: t.title, meta: t.meta, href: href, area: area,
          hint: press ? 'Go → opens ' + parentTitle + ' — then press ' + t.title + '.' : '' });
        link(parentKey, key);
        if (kind === 'subtab') subOf.set(key, parentKey);
        tabs(t.tabs, key, t.title, href, area, level + 1);
      });
    }
    PAGES.forEach(function (pg) {
      put({ key: 'page:' + pg.id, kind: 'page', title: pg.title, meta: pg.meta, href: pg.href, area: pg.id });
      tabs(pg.tabs, 'page:' + pg.id, pg.title, pg.href, pg.id, 0);
    });

    // ── Knowledge Record: mind maps, each holding its children, Kolbs and MG ──
    var mms = records(s.mms);
    var mmName = new Map();
    mms.forEach(function (m) {
      if (!isId(m.id) || nodes.has('mm:' + str(m.id))) return;
      mmName.set(m.id, str(m.name));
      var meta = kindLabel(m.type) + (m.unclear ? ' · IN PRO' : '');
      put({
        key: 'mm:' + str(m.id), kind: 'mm', title: m.name, meta: meta, area: 'ks',
        href: 'sir-ks02.html?mm=' + enc(m.id),
        fields: [
          { label: 'Explanation', text: m.explanation },
          { label: 'Current MG', text: m.currentMG },
          { label: 'Comments', text: records(m.comments).map(function (c) { return str(c.text); }).filter(Boolean).join('\n') }
        ]
      });
    });
    // They live in SRCH, whose LIST and DIRECTORY show the same tree.
    T.roots(mms).forEach(function (r) { link('tab:ks:srch', 'mm:' + str(r.id)); });
    T.childIndex(mms).forEach(function (children, pid) {
      children.forEach(function (c) { link('mm:' + str(pid), 'mm:' + str(c.id)); });
    });

    // A Kolb or MG change lives under its mind map, or — with none — where
    // the Knowledge Record lists it: KOLB (its UNLINKED), MG → TIMELINE.
    // KOLB, TIMELINE and the notes widget's Kolbs list every one.
    function mmParent(mmId, loose) {
      return isId(mmId) && nodes.has('mm:' + str(mmId)) ? 'mm:' + str(mmId) : loose;
    }
    var textFields = K && Array.isArray(K.TEXT_FIELDS) ? K.TEXT_FIELDS : [];
    records(s.kolbs).slice().reverse().forEach(function (k, i) {
      var key = put({
        key: keyFor('kolb', k.id, i), kind: 'kolb', area: 'ks',
        title: 'Kolb · ' + (str(k.date) || 'no date'),
        meta: firstLine(k.experience) || (k.level ? 'Level ' + str(k.level) : ''),
        href: isId(k.mmId) ? 'sir-ks02.html?mm=' + enc(k.mmId) : 'sir-ks02.html#kolb',
        fields: (k.level ? [{ label: 'Level', text: str(k.level) }] : []).concat(textFields.map(function (f) {
          return { label: f.short, text: k[f.key] };
        }))
      });
      link(mmParent(k.mmId, 'tab:ks:kolb'), key);
      link('tab:ks:kolb', key, true);
      link('tab:home:notes:kolbs', key, true);
    });
    records(s.mgChanges).slice().reverse().forEach(function (g, i) {
      var key = put({
        key: keyFor('mg', g.id, i), kind: 'mg', area: 'ks',
        title: 'MG · ' + (firstLine(g.newMG, 70) || '(blank)'),
        meta: str(g.date) + (str(g.oldMG) ? ' · was ' + firstLine(g.oldMG, 40) : ''),
        href: isId(g.mmId) ? 'sir-ks02.html?mm=' + enc(g.mmId) : 'sir-ks02.html#mg',
        fields: [{ label: 'New MG', text: g.newMG }, { label: 'Was', text: g.oldMG }, { label: 'Experiment', text: g.experiment }]
      });
      link(mmParent(g.mmId, 'tab:ks:mg:timeline'), key);
      link('tab:ks:mg:timeline', key, true);
    });

    // A single `parentId`, walked as `parentIds` so TrackMMTree's roots give a
    // loop with nothing above it one entry, exactly as for mind maps.
    function asParentIds(list) {
      return list.filter(function (r) { return isId(r.id); }).map(function (r) {
        return { id: r.id, parentIds: isId(r.parentId) && r.parentId !== r.id ? [r.parentId] : [] };
      });
    }
    // Roots under `rootKey` (and, shown there too, under `alsoKey`); children nested.
    function treeLinks(list, rootKey, prefix, alsoKey) {
      T.roots(list).forEach(function (r) {
        link(rootKey, prefix + str(r.id));
        if (alsoKey) link(alsoKey, prefix + str(r.id), true);
      });
      T.childIndex(list).forEach(function (children, pid) {
        children.forEach(function (c) { link(prefix + str(pid), prefix + str(c.id)); });
      });
    }

    // ── Source dumps: each dump holds its child dumps, then its text blocks ──
    var dumps = records(s.sourceDumps);
    dumps.forEach(function (dm) {
      if (!isId(dm.id) || nodes.has('dump:' + str(dm.id))) return;
      put({ key: 'dump:' + str(dm.id), kind: 'dump', title: dm.title, area: 'dumps',
        meta: str(dm.createdAt) ? 'Source dump · ' + str(dm.createdAt) : 'Source dump',
        href: 'sir-ks02.html?dump=' + enc(dm.id) });
    });
    // KS03 → SOURCE DUMP is theirs; the Storages page's SOURCE DUMP tab is its twin.
    treeLinks(asParentIds(dumps), 'tab:ks:ks03:sourcedump', 'dump:', 'tab:storage:sourcedump');
    dumps.forEach(function (dm) {
      if (!isId(dm.id)) return;
      var dumpKey = 'dump:' + str(dm.id);
      records(dm.mmLinks).forEach(function (sec, si) {
        var blocks = SD && typeof SD.textBlocksOf === 'function' ? SD.textBlocksOf(sec) : [];
        var under = mmName.has(sec.mmId) ? mmName.get(sec.mmId) : '';
        blocks.forEach(function (b, bi) {
          var key = put({
            key: 'blk:' + str(dm.id) + ':' + (isId(b.id) ? str(b.id) : si + '.' + bi), kind: 'block', area: 'dumps',
            title: str(b.title) || firstLine(b.explanation) || '(empty block)',
            meta: under ? 'Text block · ' + under : 'Text block',
            href: 'sir-ks02.html?dump=' + enc(dm.id) + (isId(sec.mmId) ? '&mm=' + enc(sec.mmId) : ''),
            fields: [{ label: 'Text', text: b.explanation }]
          });
          link(dumpKey, key);
        });
      });
    });

    // ── Documentation pages (placed below, once the goals they belong to exist) ──
    var pages = records(s.docPages);
    pages.forEach(function (p) {
      if (!isId(p.id) || nodes.has('doc:' + str(p.id))) return;
      put({ key: 'doc:' + str(p.id), kind: 'doc', title: p.title || 'Untitled', area: 'docs',
        meta: isId(p.goalId) ? 'Project page' : 'Page',
        href: 'documentations.html?page=' + enc(p.id),
        fields: [{ label: 'Text', text: blocksText(p.blocks) }] });
    });

    // ── Goals: Documentations → Projects, each goal holding its sub-goals and
    // tasks, its milestones, then its pages. PROGRESSION shows the goals too,
    // and MILESTONES every milestone. ──
    var topGoals = [], milestoneKeys = [];
    function walkGoal(node, parentKey, ownerId, path, isTop) {
      if (!isMap(node) || path.indexOf(node) >= 0 || path.length > 60) return;
      if (node.isLink) return;
      var isGoal = isTop || !!node.isSubGoal;
      var owner = isGoal && isId(node.id) ? node.id : ownerId;
      var label = isGoal ? (isTop ? 'Goal' : 'Sub-goal')
        : (node.taskType === 'milestone' ? 'Milestone task' : 'Task');
      var key = put({
        key: keyFor(isGoal ? 'goal' : 'task', node.id, order.length), kind: isGoal ? 'goal' : 'task', area: 'goals',
        title: node.title, meta: label + (node.completed ? ' · done' : ''),
        href: isId(owner) ? 'documentations.html?goal=' + enc(owner) : 'documentations.html',
        fields: [{ label: 'Notes', text: notesText(node.notes) }]
      });
      link(parentKey, key);
      if (isTop) topGoals.push(key);
      var next = path.concat([node]);
      records(node.children).forEach(function (c) { walkGoal(c, key, owner, next, false); });
      records(node.milestones).forEach(function (m, mi) {
        var mk = put({
          key: keyFor('ms:' + str(owner), m.id, mi), kind: 'milestone', area: 'goals', title: m.title,
          meta: 'Milestone' + (isDay(m.startDate) || isDay(m.endDate) ? ' · ' + str(m.startDate) + ' → ' + str(m.endDate) : ''),
          href: isId(owner) ? 'documentations.html?goal=' + enc(owner) : 'documentations.html'
        });
        link(key, mk);
        milestoneKeys.push(mk);
      });
      // The top pages attached to this goal — TrackProject's rule, the
      // Projects sidebar's own.
      if (isGoal && isId(node.id) && PJ && typeof PJ.pagesForGoal === 'function') {
        PJ.pagesForGoal(pages, node.id).forEach(function (p) { link(key, 'doc:' + str(p.id)); });
      }
    }
    records(s.goals).forEach(function (g) { walkGoal(g, 'tab:docs:projects', null, [], true); });
    topGoals.forEach(function (k) { link('tab:schedule:project:progression', k, true); });
    milestoneKeys.forEach(function (k) { link('tab:schedule:project:milestones', k, true); });

    // Events: the top pages that name no goal (TrackProject.eventRoots); a
    // page's own pages nest under it, in either tab. A page in a parent loop
    // is in neither tab on Documentations, and is listed straight under it.
    var pageTree = asParentIds(pages);
    var eventRoots = PJ && typeof PJ.eventRoots === 'function' ? PJ.eventRoots(pages)
      : T.roots(pageTree).map(function (r) { return pages.filter(function (p) { return p.id === r.id; })[0]; });
    eventRoots.forEach(function (p) { if (p && isId(p.id)) link('tab:docs:events', 'doc:' + str(p.id)); });
    T.childIndex(pageTree).forEach(function (children, pid) {
      children.forEach(function (c) { link('doc:' + str(pid), 'doc:' + str(c.id)); });
    });

    // ── Schedule: dated things in month folders, newest month first, under
    // SCHEDULE; day notes and deadlines — ★ Forced — under ★ CALENDAR too ──
    function byMonth(list, groupKey, groupTitle, mk, alsoKey) {
      var dated = list.filter(function (x) { return isDay(x.item.date); });
      var undated = list.filter(function (x) { return !isDay(x.item.date); });
      if (!list.length) return;
      var gk = group('tab:schedule:schedule', 'grp:sched:' + groupKey, groupTitle, '', 'progress.html#schedule', 'schedule');
      if (alsoKey) link(alsoKey, gk, true);
      var months = [];
      dated.forEach(function (x) { var ym = x.item.date.slice(0, 7); if (months.indexOf(ym) < 0) months.push(ym); });
      months.sort().reverse().forEach(function (ym) {
        var fk = group(gk, gk + ':' + ym, monthTitle(ym), '', null, 'schedule');
        dated.filter(function (x) { return x.item.date.slice(0, 7) === ym; })
          .sort(function (a, b) { return a.item.date < b.item.date ? -1 : a.item.date > b.item.date ? 1 : a.i - b.i; })
          .forEach(function (x) { link(fk, mk(x.item, x.i)); });
      });
      if (undated.length) {
        var uk = group(gk, gk + ':none', groupKey === 'cls' ? 'Weekly' : 'No date', '', null, 'schedule');
        undated.forEach(function (x) { link(uk, mk(x.item, x.i)); });
      }
    }
    function indexed(list) { return records(list).map(function (item, i) { return { item: item, i: i }; }); }

    byMonth(indexed(s.calendarNotes), 'notes', 'Day notes', function (n, i) {
      return put({ key: keyFor('note', n.id, i), kind: 'daynote', area: 'schedule', title: n.title,
        meta: 'Day note · ' + (str(n.date) || 'no date') + (str(n.time) ? ' ' + str(n.time) : ''),
        href: isDay(n.date) ? 'progress.html?date=' + n.date + '#schedule' : 'progress.html#schedule',
        fields: [{ label: 'Detail', text: n.detail }, { label: 'Block notes', text: partsNotes(n) }] });
    }, 'tab:schedule:calendar');
    byMonth(indexed(s.deadlines), 'dl', 'Deadlines', function (n, i) {
      return put({ key: keyFor('dl', n.id, i), kind: 'deadline', area: 'schedule', title: n.title,
        meta: 'Deadline · due ' + (str(n.date) || 'no date') + (str(n.time) ? ' ' + str(n.time) : '') + (n.done ? ' · done' : ''),
        href: isDay(n.date) ? 'progress.html?date=' + n.date + '&dl=' + enc(n.id) + '#schedule' : 'progress.html#schedule',
        fields: [{ label: 'Detail', text: n.detail }, { label: 'Block notes', text: partsNotes(n) }] });
    }, 'tab:schedule:calendar');
    byMonth(indexed(s.refSchedules), 'cls', 'Timetable classes', function (c, i) {
      var when = isDay(c.date) ? str(c.date) : (WEEKDAYS[Number(c.dow)] ? 'every ' + WEEKDAYS[Number(c.dow)] : 'weekly');
      return put({ key: keyFor('cls', c.id, i), kind: 'class', area: 'schedule', title: c.title,
        meta: 'Class · ' + when + (str(c.time) ? ' ' + str(c.time) : ''),
        href: isDay(c.date) ? 'progress.html?date=' + c.date + '#schedule' : 'progress.html#schedule',
        fields: [{ label: 'Detail', text: c.detail }, { label: 'Notes', text: notesText(c.notes) }] });
    });
    records(s.saActions).forEach(function (a, i) {
      link('tab:schedule:actions', put({ key: keyFor('sa', a.id, i), kind: 'action', area: 'schedule',
        title: (str(a.emoji) ? str(a.emoji) + ' ' : '') + str(a.title), meta: 'Supporting action',
        href: 'progress.html#actions' }));
    });

    // ── Notes: the notes widget's Sorted and Journal tabs — no page of their own ──
    var sorted = records(s.notes);
    if (sorted.length) {
      var sk = 'tab:home:notes:sorted';
      sorted.forEach(function (n, i) {
        link(sk, put({ key: keyFor('sn', n.id, i), kind: 'note', area: 'notes',
          title: str(n.topic) || firstLine(n.content) || '(untitled note)', meta: 'Sorted note',
          fields: [{ label: 'Note', text: n.content }] }));
      });
    }
    var journal = isMap(s.dateNotes) ? s.dateNotes : {};
    var days = Object.keys(journal).filter(isDay).sort().reverse();
    var dayText = NT && typeof NT.dateNoteText === 'function' ? NT.dateNoteText : function (map, day) {
      var v = map[day]; return typeof v === 'string' ? v : (isMap(v) ? str(v.content) : '');
    };
    var dayTag = NT && typeof NT.dateNoteTag === 'function' ? NT.dateNoteTag : function () { return ''; };
    var withText = days.filter(function (day) { return dayText(journal, day).trim(); });
    if (withText.length) {
      var jk = 'tab:home:notes:journal';
      var jMonths = [];
      withText.forEach(function (day) { var ym = day.slice(0, 7); if (jMonths.indexOf(ym) < 0) jMonths.push(ym); });
      jMonths.forEach(function (ym) {
        var fk = group(jk, jk + ':' + ym, monthTitle(ym), '', null, 'notes');
        withText.filter(function (day) { return day.slice(0, 7) === ym; }).forEach(function (day) {
          var text = dayText(journal, day);
          var tag = str(dayTag(journal, day));
          link(fk, put({ key: 'jn:' + day, kind: 'journal', area: 'notes', title: day,
            meta: (tag ? tag + ' · ' : '') + firstLine(text, 70), fields: [{ label: 'Journal', text: text }] }));
        });
      });
    }

    // ── Storages, and FILES: both already in the mind maps' parentIds shape ──
    var storages = records(s.trueStorages);
    storages.forEach(function (st) {
      if (!isId(st.id) || nodes.has('st:' + str(st.id))) return;
      put({ key: 'st:' + str(st.id), kind: 'storage', title: st.name, meta: 'Storage', area: 'storages',
        href: 'true-storage.html?storage=' + enc(st.id),
        fields: [{ label: 'Explanation', text: st.explanation }] });
    });
    // A storage is a tag a source dump carries, drawn on the SOURCE DUMP tab.
    if (storages.length) {
      treeLinks(storages, group('tab:storage:sourcedump', 'grp:storage:tags', 'Storage tags',
        'The storages a source dump can be tagged with', 'true-storage.html#sourcedump', 'storages'), 'st:');
    }

    var files = typeof FS.records === 'function' ? FS.records(s.files) : records(s.files);
    files.forEach(function (f) {
      if (!isId(f.id) || nodes.has('file:' + str(f.id))) return;
      var kind = typeof FS.kindOf === 'function' ? FS.kindOf(f) : str(f.kind);
      var folder = kind === 'folder';
      put({ key: 'file:' + str(f.id), kind: folder ? 'filefolder' : 'file', title: f.name, area: 'files',
        meta: folder ? 'Folder' : kind === 'note' ? 'Note' : 'File' + (str(f.mime) ? ' · ' + str(f.mime) : ''),
        href: folder ? 'true-storage.html#files' : 'true-storage.html?file=' + enc(f.id) + '#files',
        fields: kind === 'note' ? [{ label: 'Note', text: f.text }] : [] });
    });
    treeLinks(files, 'tab:storage:files', 'file:');

    // ── A tab with sub-tabs lists what it holds of its own, then each
    // sub-tab's heading followed by what that sub-tab shows, in the bar's order ──
    sect.forEach(function (m, tabKey) {
      var list = kids.get(tabKey) || [];
      var out = list.filter(function (k) { return subOf.get(k) !== tabKey && !m.has(k); });
      list.forEach(function (h) {
        if (subOf.get(h) !== tabKey) return;
        out.push(h);
        list.forEach(function (k) { if (m.get(k) === h) out.push(k); });
      });
      kids.set(tabKey, out);
    });

    // ── depth and the one shown path: each entry's real place (see `walk`) ──
    var top = PAGES.map(function (pg) { return 'page:' + pg.id; });
    var w = walk(kids, prim, top);
    var depth = w.depth, parent = w.parent;
    // Anything no walk reached — a documentation page in a parent loop, a
    // project page whose goal is gone, data that is not to be trusted — is
    // listed straight under its page.
    order.forEach(function (k) {
      if (depth.has(k)) return;
      var homeKey = HOME_OF[nodes.get(k).area] || 'page:' + nodes.get(k).area;
      link(homeKey, k);
      depth.set(k, 1);
      parent.set(k, homeKey);
    });

    order.forEach(function (k) {
      var n = nodes.get(k);
      n.depth = depth.get(k);
      // What is inside, not counting sub-tab headings.
      n.size = (kids.get(k) || []).filter(function (c) { return subOf.get(c) !== k; }).length;
      n.titleHay = norm(n.title);
      n.hay = norm([n.title, n.meta].concat(n.fields.map(function (f) { return str(f.text); })).join('\n'));
    });

    return { nodes: nodes, kids: kids, prim: prim, parent: parent, order: order, norm: norm, top: top, sect: sect };
  }

  function node(ix, key) { return (ix && ix.nodes.get(key)) || null; }

  // A folder's entries in directory order (the five pages, for the top).
  function children(ix, key) {
    var keys = key == null ? ix.top : (ix.kids.get(key) || []);
    return keys.map(function (k) { return ix.nodes.get(k); }).filter(Boolean);
  }

  function count(ix, key) { return (ix.kids.get(key) || []).length; }

  // The sub-tab heading `key` is listed under in `parentKey`'s list, or null.
  function sectionOf(ix, parentKey, key) {
    var m = ix && ix.sect && parentKey != null ? ix.sect.get(parentKey) : null;
    var sub = m ? m.get(key) : null;
    return sub ? ix.nodes.get(sub) || null : null;
  }

  // Everything inside `scope`, each once, with its depth and the folder it is
  // first met in COUNTED FROM THE SCOPE — inside Chem › Organic, a mind map
  // that also hangs under Physics is one level down, as the folder shows it,
  // not two — real places first, as `walk` says. Null is the whole
  // directory, measured from the top. The last scope asked for is kept on
  // the index, so typing re-walks nothing.
  function within(ix, scope) {
    if (scope == null) {
      return { scope: null, keys: ix.order, parent: ix.parent,
        depth: function (k) { var n = ix.nodes.get(k); return n ? n.depth : 0; } };
    }
    if (ix.lastWithin && ix.lastWithin.scope === scope) return ix.lastWithin;
    var w = walk(ix.kids, ix.prim || ix.kids, [scope]);
    ix.lastWithin = { scope: scope, keys: w.keys, parent: w.parent,
      depth: function (k) { return w.depth.has(k) ? w.depth.get(k) : 0; } };
    return ix.lastWithin;
  }

  function inside(ix, scope) { return within(ix, scope).keys; }

  // The folders between `scope` (exclusive) and the entry (exclusive), along
  // its first-met place: from its area down when the scope is null. Bounded
  // by the entry count, so a broken map cannot spin.
  function pathOf(ix, key, scope) {
    var w = within(ix, scope == null ? null : scope);
    var out = [];
    var k = w.parent.get(key);
    var guard = ix.order.length + 1;
    while (k != null && k !== w.scope && guard-- > 0) { out.unshift(ix.nodes.get(k)); k = w.parent.get(k); }
    return out.filter(Boolean);
  }

  function terms(ix, text) {
    return ix.norm(str(text)).split(' ').filter(Boolean);
  }

  function find(ix, text, scope) {
    var words = terms(ix, text);
    if (!words.length) return [];
    var w = within(ix, scope == null ? null : scope);
    var hits = [];
    w.keys.forEach(function (k) {
      var n = ix.nodes.get(k);
      if (!n) return;
      for (var i = 0; i < words.length; i++) if (n.hay.indexOf(words[i]) < 0) return;
      var inTitle = words.every(function (word) { return n.titleHay.indexOf(word) >= 0; });
      hits.push({ n: n, d: w.depth(k), t: inTitle ? 0 : 1 });
    });
    hits.sort(function (a, b) { return (a.d - b.d) || (a.t - b.t) || (a.n.idx - b.n.idx); });
    return hits.map(function (h) { return h.n; });
  }

  // Where in an entry's fields the query first lands, as a short excerpt of
  // the stored text. Null when only the title or meta matched.
  function snippet(ix, n, text) {
    var words = terms(ix, text);
    if (!n || !words.length) return null;
    var raw = str(text).toLowerCase().split(/\s+/).filter(Boolean);
    for (var i = 0; i < n.fields.length; i++) {
      var f = n.fields[i];
      var t = str(f.text);
      var hay = ix.norm(t);
      if (!words.some(function (w) { return hay.indexOf(w) >= 0; })) continue;
      var lower = t.toLowerCase();
      var at = -1;
      for (var r = 0; r < raw.length && at < 0; r++) at = lower.indexOf(raw[r]);
      if (at < 0) at = 0;
      var from = Math.max(0, at - 40);
      var piece = t.slice(from, at + 100).replace(/\s+/g, ' ').trim();
      return { label: f.label, text: (from > 0 ? '…' : '') + piece + (at + 100 < t.length ? '…' : '') };
    }
    return null;
  }

  global.TrackSearch = {
    PAGES: PAGES,
    build: build,
    node: node,
    children: children,
    count: count,
    sectionOf: sectionOf,
    pathOf: pathOf,
    within: within,
    inside: inside,
    terms: terms,
    find: find,
    snippet: snippet
  };
})(typeof window !== 'undefined' ? window : globalThis);
