/* ── tests/schema.test.js ──────────────────────────────────────────────────
   Offline cover for schema.js — the one definition of a Track slot.

       node --test tests/schema.test.js
       TZ=Pacific/Kiritimati node --test tests/schema.test.js

   Run by tests/run.js under every swept timezone, and that sweep is not
   decoration here: createEmptySlot stamps createdAt with a LOCAL calendar day,
   and the five sites it replaces all used toISOString(), which is the UTC day.
   That bug is completely invisible on a machine running in UTC.

   Nothing in this file touches localStorage or a browser. The contract being
   pinned is: normalizeSlot repairs and always succeeds, validateSlot and
   validateDatabase report and never repair.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const F = require('./lib/fixture.js');

// Both files are classic browser scripts that publish a window global. They are
// loaded in page order — storage-guard.js first, exactly as the four pages load
// them — so newSlotId() really does go through the shared minter here rather
// than through schema.js's standalone fallback.
//
// runInThisContext, NOT runInNewContext: this module is built on Array.isArray
// and instanceof-style checks, and a fresh realm would make an array built by
// this file fail them, quietly testing something the browser never does.
globalThis.window = globalThis;
for (const file of ['storage-guard.js', 'schema.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { filename: file });
}
const S = globalThis.TrackSchema;

const TZ = process.env.TZ || '(system default)';

// The 23 fields as AGENTS.md "Current Data Contract" writes them, in its order.
// Written out by hand on purpose: if the table in schema.js is edited, this is
// the assertion that notices.
const CONTRACT = [
  'id', 'name', 'createdAt', 'sessions', 'mms', 'kolbs', 'mgChanges',
  'linChanges', 'linDayTitles', 'goals', 'saActions', 'saEntries', 'sourceDumps',
  'notes', 'mmEntries', 'mgSchedule', 'calendarNotes', 'deadlines', 'pos',
  'levelTemplates', 'docPages', 'trueStorages', 'trueStoragePos'
];

const LISTS = CONTRACT.filter(k => S.SLOT_FIELDS[k] === 'list');
const MAPS = CONTRACT.filter(k => S.SLOT_FIELDS[k] === 'map');

test('module surface', () => {
  assert.ok(S, 'schema.js published window.TrackSchema under TZ=' + TZ);
  for (const name of ['localToday', 'newSlotId', 'createEmptySlot', 'normalizeSlot',
    'validateSlot', 'validateDatabase', 'hasFatalErrors', 'describeErrors', 'isList', 'isMap', 'isDay', 'isTime']) {
    assert.equal(typeof S[name], 'function', name + ' is exported');
  }
  assert.equal(typeof S.SLOT_FIELDS, 'object');
  assert.equal(S.SLOT_KEYS.length, 23);
  assert.ok(Object.isFrozen(S.SLOT_FIELDS), 'the field table is frozen — it is the schema, not a scratch object');
});

test('the field table matches the documented data contract, in order', () => {
  assert.deepEqual(S.SLOT_KEYS.slice(), CONTRACT,
    'schema.js SLOT_FIELDS and the AGENTS.md data contract must not drift apart');
  for (const key of CONTRACT) {
    assert.ok(['text', 'date', 'list', 'map'].includes(S.SLOT_FIELDS[key]), key + ' has a known kind');
  }
});

// ── local calendar days ────────────────────────────────────────────────────

test('localToday returns the LOCAL day at both ends of the day', () => {
  assert.equal(S.localToday(new Date(2026, 0, 1, 0, 15)), '2026-01-01');
  assert.equal(S.localToday(new Date(2026, 0, 1, 23, 30)), '2026-01-01');
  assert.equal(S.localToday(new Date(2026, 0, 1, 23, 59, 59)), '2026-01-01');
  // month, year and single-digit padding boundaries
  assert.equal(S.localToday(new Date(2026, 1, 28, 23, 30)), '2026-02-28');
  assert.equal(S.localToday(new Date(2024, 1, 29, 0, 15)), '2024-02-29');
  assert.equal(S.localToday(new Date(2026, 11, 31, 23, 30)), '2026-12-31');
  assert.equal(S.localToday(new Date(2027, 0, 1, 0, 15)), '2027-01-01');
  assert.equal(S.localToday(new Date(2026, 8, 9, 5, 5)), '2026-09-09');
});

test('the sweep is meaningful: outside UTC the UTC day really does disagree', () => {
  const probes = [new Date(2026, 0, 1, 0, 15), new Date(2026, 0, 1, 23, 30)];
  const offset = probes[0].getTimezoneOffset();
  const disagreements = probes.filter(d => S.localToday(d) !== d.toISOString().slice(0, 10));
  if (offset === 0) {
    assert.equal(disagreements.length, 0, 'in UTC the two agree, which is why UTC alone proves nothing');
  } else {
    assert.ok(disagreements.length > 0,
      'TZ=' + TZ + ' must expose at least one day where toISOString() is the wrong day');
  }
});

test('isDay accepts a real calendar day and rejects what only looks like one', () => {
  assert.ok(S.isDay('2026-03-10'));
  assert.ok(S.isDay('2024-02-29'), 'a leap day is a real day');
  assert.ok(!S.isDay('2026-02-30'), 'February never has 30 days');
  assert.ok(!S.isDay('2025-02-29'), '2025 is not a leap year');
  assert.ok(!S.isDay('2026-13-01'), 'there is no month 13');
  assert.ok(!S.isDay('2026-00-10'));
  assert.ok(!S.isDay('2026-3-10'), 'the month must be padded');
  assert.ok(!S.isDay('2026-03-10T00:00:00Z'));
  for (const bad of ['', 'today', null, undefined, 20260310, [], {}]) assert.ok(!S.isDay(bad));
});

test('isTime accepts HH:MM and nothing else', () => {
  for (const good of ['00:00', '09:30', '23:59', '13:00']) assert.ok(S.isTime(good), good);
  for (const bad of ['24:00', '09:60', '9:30', '09:30:00', '', ' ', null, undefined, 930]) {
    assert.ok(!S.isTime(bad), String(bad) + ' is not an HH:MM time');
  }
});

// ── createEmptySlot ────────────────────────────────────────────────────────

test('createEmptySlot produces every canonical field, in table order, and nothing else', () => {
  const slot = S.createEmptySlot({ name: 'Default' });
  assert.deepEqual(Object.keys(slot), CONTRACT,
    'a fresh slot serializes identically whichever page built it');
});

test('createEmptySlot gives a list to every list field and a plain object to every map field', () => {
  const slot = S.createEmptySlot({ name: 'Default' });
  for (const key of LISTS) {
    assert.ok(Array.isArray(slot[key]), key + ' is an array');
    assert.equal(slot[key].length, 0, key + ' starts empty');
  }
  for (const key of MAPS) {
    assert.ok(S.isMap(slot[key]), key + ' is a plain object');
    assert.deepEqual(Object.keys(slot[key]), [], key + ' starts empty');
  }
  assert.equal(slot.name, 'Default');
});

test('createEmptySlot stamps a LOCAL calendar day', () => {
  const slot = S.createEmptySlot({ name: 'Default' });
  assert.equal(slot.createdAt, S.localToday(new Date()),
    'TZ=' + TZ + ': createdAt is the local day, not toISOString()');
  assert.ok(S.isDay(slot.createdAt));
});

test('createEmptySlot mints ids that do not collide inside one millisecond', () => {
  // 'slot-'+Date.now() — what all six sites used — returns the same string for
  // every call in this loop, so this is the assertion that stops it coming back.
  // 50 draws off a 5-char base36 tail keeps the birthday odds negligible.
  const ids = new Set();
  for (let i = 0; i < 50; i++) ids.add(S.createEmptySlot({ name: 'x' }).id);
  assert.equal(ids.size, 50, 'every id is distinct even when the clock has not ticked');
  for (const id of ids) assert.ok(/^slot-/.test(id), 'the readable prefix is kept: ' + id);
});

test('an explicit id, name and createdAt are used exactly as given', () => {
  const slot = S.createEmptySlot({ id: 'slot-fixed', name: 'Named', createdAt: '2020-01-02' });
  assert.equal(slot.id, 'slot-fixed');
  assert.equal(slot.name, 'Named');
  assert.equal(slot.createdAt, '2020-01-02');
});

// ── normalizeSlot: it repairs, and always succeeds ─────────────────────────

test('normalizeSlot fills every field an older slot never had', () => {
  for (const [label, build] of [['pre-calendar', F.preCalendarSlot], ['pre-unified', F.preUnifiedSlot]]) {
    const legacy = build({ id: 'slot-old', name: 'Old', createdAt: '2025-01-01' });
    // Prove the keys are genuinely ABSENT before testing absence-handling.
    const missing = CONTRACT.filter(k => !Object.prototype.hasOwnProperty.call(legacy, k));
    assert.ok(missing.length > 0, label + ' really is missing fields');

    const out = S.normalizeSlot(legacy);
    assert.deepEqual(Object.keys(out), CONTRACT, label + ' normalizes to the full contract');
    for (const key of missing) {
      const kind = S.SLOT_FIELDS[key];
      if (kind === 'list') assert.deepEqual(out[key], [], label + ': ' + key + ' defaulted to []');
      if (kind === 'map') assert.deepEqual(out[key], {}, label + ': ' + key + ' defaulted to {}');
    }
    // Everything it DID have survives untouched.
    assert.equal(out.id, 'slot-old', label + ': the stored id is never rewritten');
    assert.equal(out.name, 'Old');
    assert.equal(out.createdAt, '2025-01-01');
    for (const key of CONTRACT) {
      if (Object.prototype.hasOwnProperty.call(legacy, key)) {
        assert.deepEqual(out[key], legacy[key], label + ': ' + key + ' carried through unchanged');
      }
    }
  }
});

test('normalizeSlot keeps a key it has never heard of', () => {
  // The same sentinel tests/browser.test.js seeds for page writes. Import must
  // not have a narrower contract than an ordinary edit, or a field added in a
  // later version is lost by every export made before it.
  const out = S.normalizeSlot(F.emptySlot({ futureField: { written: 'by a later version' } }));
  assert.deepEqual(out.futureField, { written: 'by a later version' });
});

test('an unknown key named after an Object.prototype member still survives', () => {
  // `SLOT_FIELDS[key]` is truthy for 'constructor', 'toString', 'valueOf' and
  // friends via the prototype chain, so a truthiness test silently classifies
  // them as canonical fields and drops them — breaking the one guarantee the
  // unknown-key branch exists to make.
  const out = S.normalizeSlot({
    name: 'x', constructor: 'MINE', toString: 'MINE2', valueOf: 'MINE3', hasOwnProperty: 'MINE4'
  });
  assert.equal(out.constructor, 'MINE');
  assert.equal(out.toString, 'MINE2');
  assert.equal(out.valueOf, 'MINE3');
  assert.equal(out.hasOwnProperty, 'MINE4');
});

test('an unknown key cannot masquerade as a canonical one', () => {
  const out = S.normalizeSlot({ goals: 'hello', futureField: 'ok' });
  assert.deepEqual(out.goals, [], 'the canonical field is written after the spread, so it wins');
  assert.equal(out.futureField, 'ok');
});

test('__proto__ in the input cannot poison the slot', () => {
  const hostile = JSON.parse('{"name":"x","__proto__":{"polluted":true}}');
  const out = S.normalizeSlot(hostile);
  assert.equal(out.polluted, undefined, 'the prototype was not replaced');
  assert.equal(({}).polluted, undefined, 'and nothing leaked onto Object.prototype');
});

test('normalizeSlot replaces a wrong-typed field with its default', () => {
  for (const key of LISTS) {
    for (const bad of ['hello', 42, null, {}, true]) {
      assert.deepEqual(S.normalizeSlot(F.malformedSlot(key, bad))[key], [],
        key + ' = ' + JSON.stringify(bad) + ' is repaired to []');
    }
  }
  for (const key of MAPS) {
    for (const bad of ['hello', 42, null, [], true]) {
      assert.deepEqual(S.normalizeSlot(F.malformedSlot(key, bad))[key], {},
        key + ' = ' + JSON.stringify(bad) + ' is repaired to {}');
    }
  }
  assert.equal(S.normalizeSlot({ name: 42 }).name, 'Untitled', 'a non-string name falls back');
  assert.ok(S.isDay(S.normalizeSlot({ createdAt: 'yesterday' }).createdAt), 'a junk date becomes today');
});

test('normalizeSlot never throws, whatever it is handed', () => {
  for (const junk of [null, undefined, 42, 'hello', true, [], [1, 2], NaN]) {
    let out;
    assert.doesNotThrow(() => { out = S.normalizeSlot(junk); }, String(junk) + ' is survivable');
    assert.deepEqual(Object.keys(out), CONTRACT, 'and still yields a complete slot');
  }
});

test('normalizeSlot never mutates the slot it is given', () => {
  const legacy = F.preCalendarSlot({ id: 'slot-old' });
  const before = JSON.stringify(legacy);
  S.normalizeSlot(legacy, { id: 'slot-new', name: 'Copy' });
  assert.equal(JSON.stringify(legacy), before, 'the caller keeps exactly what it passed in');
});

test('normalizeSlot shares untouched arrays rather than deep-cloning them', () => {
  // A deep clone would have to walk megabytes of base64 images in docPages on
  // every import. The caller's object is left untouched, which is the contract
  // that matters; the sub-objects are deliberately shared.
  const goals = [{ id: 'g-1' }];
  const out = S.normalizeSlot({ goals });
  assert.equal(out.goals, goals, 'the same array, not a copy');
});

test('normalizeSlot never rewrites an id it was given one', () => {
  assert.equal(S.normalizeSlot({ id: 'slot-keep' }).id, 'slot-keep');
  assert.equal(S.normalizeSlot({ id: 'slot-keep' }, { id: 'slot-override' }).id, 'slot-override',
    'an explicit opts.id is how import assigns a fresh one');
  assert.ok(/^slot-/.test(S.normalizeSlot({}).id), 'one is minted only when there is none to preserve');
});

test('normalizeSlot leaves an untimed day note untimed', () => {
  // Absence of `time` is meaningful and is the default: without it the note is
  // a chip in the day strip. Writing '' or adding the key would move it onto
  // the hour grid. See AGENTS.md on the `time` key.
  const untimed = F.calNote('cn-1', '2026-03-10');
  assert.equal(Object.prototype.hasOwnProperty.call(untimed, 'time'), false, 'the fixture really is untimed');
  const out = S.normalizeSlot(F.emptySlot({ calendarNotes: [untimed, F.calNote('cn-2', '2026-03-10', { time: '09:00' })] }));
  assert.equal(Object.prototype.hasOwnProperty.call(out.calendarNotes[0], 'time'), false,
    'the key is still absent, not an empty string');
  assert.equal(out.calendarNotes[1].time, '09:00', 'and a real time is untouched');
});

test('normalizeSlot keeps docPageId on the items that carry it', () => {
  const out = S.normalizeSlot(F.populatedSlot());
  assert.equal(out.calendarNotes.find(n => n.id === 'cn-doc').docPageId, 'p-1');
  assert.equal(out.deadlines.find(d => d.id === 'dl-doc').docPageId, 'p-1');
});

// ── validateSlot: it reports, and never repairs ────────────────────────────

test('validateSlot accepts a populated slot and an older one', () => {
  for (const [label, slot] of [['populated', F.populatedSlot()], ['empty', F.emptySlot()],
    ['pre-calendar', F.preCalendarSlot()], ['pre-unified', F.preUnifiedSlot()]]) {
    const r = S.validateSlot(slot);
    assert.equal(r.ok, true, label + ' is valid; got ' + JSON.stringify(r.errors));
  }
});

test('a missing field is not an error — that is just an older export', () => {
  const r = S.validateSlot(F.preCalendarSlot());
  assert.deepEqual(r.errors, [], 'absence is handled by normalizeSlot, not rejected');
});

test('validateSlot names the wrong-typed field', () => {
  const r = S.validateSlot(F.malformedSlot('goals', 'hello'));
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].field, 'goals');
  assert.match(r.errors[0].message, /"goals" must be a list, found text/);

  const m = S.validateSlot(F.malformedSlot('pos', [1, 2]));
  assert.equal(m.errors[0].field, 'pos');
  assert.match(m.errors[0].message, /must be an object, found a list/);
});

test('validateSlot reports every bad field, not just the first', () => {
  const r = S.validateSlot(F.emptySlot({ goals: 'hello', pos: [], mms: 42 }));
  assert.deepEqual(r.errors.map(e => e.field).sort(), ['goals', 'mms', 'pos']);
});

test('validateSlot rejects anything that is not an object', () => {
  for (const junk of [null, undefined, 42, 'hello', [], true]) {
    const r = S.validateSlot(junk);
    assert.equal(r.ok, false, String(junk) + ' is not a slot');
    assert.match(r.errors[0].message, /must be an object/);
  }
});

test('validateSlot checks the dates and times on calendar items', () => {
  const bad = F.emptySlot({
    calendarNotes: [F.calNote('cn-1', 'tomorrow'), F.calNote('cn-2', '2026-03-10', { time: '25:00' })],
    deadlines: [F.deadline('dl-1', '2026-02-30')]
  });
  const r = S.validateSlot(bad);
  assert.equal(r.ok, false);
  const messages = r.errors.map(e => e.message).join('\n');
  assert.match(messages, /calendarNotes\[0\]" needs a YYYY-MM-DD date/);
  assert.match(messages, /calendarNotes\[1\]" has an invalid time/);
  assert.match(messages, /deadlines\[0\]" needs a YYYY-MM-DD date/, 'February 30 is not a day');
});

test('validateSlot rejects junk INSIDE a correctly-typed list', () => {
  // The field being a list is not enough. `{"goals":[null]}` used to pass, land
  // in track_db, and then throw out of flattenGoals on the next render — the
  // white screen this whole slice exists to prevent.
  for (const bad of [null, 'a string', 42, true, []]) {
    const r = S.validateSlot({ name: 'x', goals: [bad] });
    assert.equal(r.ok, false, 'goals[0] = ' + JSON.stringify(bad) + ' must be refused');
    assert.match(r.errors[0].message, /"goals\[0\]" must be an object/);
  }
  // every list field, not just goals
  for (const key of LISTS) {
    assert.equal(S.validateSlot(F.emptySlot({ [key]: [null] })).ok, false, key + '[0] = null is refused');
  }
});

test('validateSlot names the position of the bad item', () => {
  const r = S.validateSlot({ name: 'x', mms: [{ id: 1 }, { id: 2 }, 'oops'] });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /"mms\[2\]"/, 'the index points at the offending item');
});

test('validateSlot checks goal structure recursively and never repairs it', () => {
  const slot = F.emptySlot({
    goals: [{
      id: 'g-root',
      children: [{
        id: 'g-child',
        toLearn: 'not-a-list',
        mmTargets: [],
        milestones: [{ id: 'ms-ok' }, null],
        children: [{ id: 'g-grandchild', children: 'not-a-list' }]
      }, 'not-a-goal']
    }]
  });
  const before = JSON.stringify(slot);
  const r = S.validateSlot(slot);

  assert.equal(r.ok, false);
  const messages = r.errors.map(e => e.message).join('\n');
  assert.match(messages, /goals\[0\]\.children\[0\]\.toLearn/);
  assert.match(messages, /goals\[0\]\.children\[0\]\.mmTargets/);
  assert.match(messages, /goals\[0\]\.children\[0\]\.milestones\[1\]/);
  assert.match(messages, /goals\[0\]\.children\[0\]\.children\[0\]\.children/);
  assert.match(messages, /goals\[0\]\.children\[1\]/);
  assert.ok(r.errors.every(e => e.fatal === true), 'every nested shape error is fatal');
  assert.equal(JSON.stringify(slot), before, 'recursive validation reports without repairing');
});

test('missing or null legacy goal fields remain valid at every depth', () => {
  const r = S.validateSlot(F.emptySlot({
    goals: [{
      id: 'g-root',
      children: [{
        id: 'g-child',
        children: null,
        toLearn: null,
        milestones: null,
        mmTargets: null
      }]
    }]
  }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('a real populated slot passes the item check', () => {
  assert.equal(S.validateSlot(F.populatedSlot()).ok, true, 'ordinary records are objects');
});

test('a field stored as null counts as missing, not as wrong', () => {
  // A null list holds no data, so filling in the default discards nothing.
  // Refusing the whole file over an empty field costs the user the import.
  const r = S.validateSlot({ name: 'x', goals: null, pos: null, createdAt: null });
  assert.equal(r.ok, true, 'null is treated as absent; got ' + JSON.stringify(r.errors));

  const out = S.normalizeSlot({ name: 'x', goals: null, pos: null, createdAt: null, id: null });
  assert.deepEqual(out.goals, []);
  assert.deepEqual(out.pos, {});
  assert.ok(S.isDay(out.createdAt), 'a null createdAt becomes today');
  assert.match(out.id, /^slot-/, 'a null id is minted rather than preserved');
});

test('looksLikeDatabase spots a whole-database file offered as a slot', () => {
  const db = { slots: [F.populatedSlot()], activeSlotId: 'slot-test-1' };
  assert.equal(S.looksLikeDatabase(db), true, 'a database has a slots array and no slot fields');

  assert.equal(S.looksLikeDatabase(F.populatedSlot()), false, 'a real slot is not a database');
  assert.equal(S.looksLikeDatabase(F.emptySlot()), false, 'nor is an empty one — it still has the fields');
  assert.equal(S.looksLikeDatabase(F.preCalendarSlot()), false, 'nor is an older export');
  assert.equal(S.looksLikeDatabase({ name: 'x' }), false, 'no slots array, so not a database');
  for (const junk of [null, undefined, 42, 'x', []]) {
    assert.equal(S.looksLikeDatabase(junk), false, String(junk) + ' is not a database either');
  }
});

test('an untimed day note is valid — absence is the default', () => {
  const r = S.validateSlot(F.emptySlot({ calendarNotes: [F.calNote('cn-1', '2026-03-10')] }));
  assert.equal(r.ok, true, 'no `time` key is the normal case, not an error');
});

// ── validateDatabase ───────────────────────────────────────────────────────

test('validateDatabase accepts a healthy database', () => {
  const r = S.validateDatabase(F.dbWith([F.populatedSlot()]));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.errors, []);
});

test('validateDatabase accepts an empty install', () => {
  assert.equal(S.validateDatabase({ slots: [], activeSlotId: null }).ok, true);
  assert.equal(S.validateDatabase({ slots: [] }).ok, true, 'an absent activeSlotId is not an error');
});

test('validateDatabase rejects every stored value that has broken a page', () => {
  for (const [label, raw] of Object.entries(F.MALFORMED_DB_STRINGS)) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; } // 'not json at all'
    const r = S.validateDatabase(parsed);
    assert.equal(r.ok, false, label + ' must be reported, not silently accepted');
    assert.ok(r.errors.length > 0 && r.errors[0].message, label + ' comes with a message');
  }
});

test('validateDatabase reports duplicate slot ids', () => {
  const r = S.validateDatabase(F.dbWith([F.emptySlot({ id: 'dup' }), F.emptySlot({ id: 'dup' })], 'dup'));
  assert.equal(r.ok, false);
  assert.match(r.errors.map(e => e.message).join('\n'), /two slots share the id "dup"/);
});

test('validateDatabase reports a slot with no id', () => {
  const noId = F.emptySlot();
  delete noId.id;
  const r = S.validateDatabase({ slots: [noId], activeSlotId: null });
  assert.equal(r.ok, false);
  assert.match(r.errors.map(e => e.message).join('\n'), /slots\[0\] has no id/);
});

test('validateDatabase reports an activeSlotId that points at nothing', () => {
  const r = S.validateDatabase(F.dbWith([F.emptySlot({ id: 'slot-a' })], 'slot-gone'));
  assert.equal(r.ok, false);
  assert.match(r.errors.map(e => e.message).join('\n'), /activeSlotId "slot-gone" does not match any slot/);
});

test('fatal classification separates structural damage from semantic warnings', () => {
  const structuralReports = [
    S.validateSlot(null),
    S.validateSlot(F.emptySlot({ goals: 'not-a-list' })),
    S.validateSlot(F.emptySlot({ goals: [{ id: 'g-1', children: [null] }] })),
    S.validateDatabase({ slots: 'not-a-list' }),
    S.validateDatabase({ slots: [Object.assign(F.emptySlot(), { id: '' })] }),
    S.validateDatabase(F.dbWith([F.emptySlot({ id: 'dup' }), F.emptySlot({ id: 'dup' })], 'dup'))
  ];
  for (const report of structuralReports) {
    assert.equal(S.hasFatalErrors(report), true, JSON.stringify(report.errors));
    assert.ok(report.errors.some(e => e.fatal === true));
  }

  const semanticReports = [
    S.validateSlot(F.emptySlot({ createdAt: '2026-02-30' })),
    S.validateSlot(F.emptySlot({ calendarNotes: [F.calNote('cn-bad', 'tomorrow', { time: '25:00' })] })),
    S.validateDatabase(F.dbWith([F.emptySlot({ id: 'slot-a' })], 'slot-gone'))
  ];
  for (const report of semanticReports) {
    assert.equal(report.ok, false);
    assert.equal(S.hasFatalErrors(report), false, JSON.stringify(report.errors));
    assert.ok(report.errors.every(e => e.fatal !== true));
  }

  const errors = [{ message: 'warning' }, { fatal: true, message: 'damage' }];
  assert.equal(S.hasFatalErrors(errors), true, 'the helper also accepts an errors array');
  assert.equal(S.hasFatalErrors([]), false);
});

test('validateDatabase names the slot a bad field is in', () => {
  const r = S.validateDatabase(F.dbWith([F.emptySlot({ id: 'a' }), F.malformedSlot('goals', 'hello')]));
  assert.equal(r.ok, false);
  assert.match(r.errors.map(e => e.message).join('\n'), /"goals" must be a list/);
});

test('validateDatabase never throws and never mutates', () => {
  const db = F.dbWith([F.populatedSlot()]);
  const before = JSON.stringify(db);
  for (const junk of [null, undefined, 42, 'x', [], NaN, { slots: {} }, { slots: [null] }]) {
    assert.doesNotThrow(() => S.validateDatabase(junk), String(junk) + ' is survivable');
  }
  S.validateDatabase(db);
  assert.equal(JSON.stringify(db), before, 'validation reports; it does not repair');
});

// ── the two together ───────────────────────────────────────────────────────

test('a slot that fails validation is valid once normalized', () => {
  // The whole point of the repair/report split, and the shape the migration
  // registry will need: normalize is total, validate is the gate.
  for (const broken of [F.malformedSlot('goals', 'hello'), F.malformedSlot('pos', []),
    F.preCalendarSlot(), F.preUnifiedSlot(), {}]) {
    const normalized = S.normalizeSlot(broken);
    const r = S.validateSlot(normalized);
    assert.equal(r.ok, true, 'normalized output always validates; got ' + JSON.stringify(r.errors));
  }
});

test('describeErrors renders a short list a person can read', () => {
  const r = S.validateSlot(F.emptySlot({ goals: 'hello', pos: [] }));
  const text = S.describeErrors(r.errors);
  assert.match(text, /• "goals" must be a list/);
  assert.equal(text.split('\n').length, 2);
  const many = S.describeErrors(Array.from({ length: 10 }, (_, i) => ({ message: 'e' + i })), 3);
  assert.match(many, /…and 7 more/, 'a long list is truncated rather than filling the screen');
});
