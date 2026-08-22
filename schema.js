/* ── schema.js ─────────────────────────────────────────────────────────────
   The one definition of what a Track slot is.

   Six places used to build a new slot and each built a different one — 10, 11,
   12, 13, 14 and 21 fields. Nothing broke visibly, because every reader defends
   itself with `slot.goals || []`, but that meant the real shape of a slot lived
   in ~120 scattered fallbacks instead of one place. SLOT_FIELDS below is now
   that place: defaults, validation and normalization all derive from it, so
   adding a slot field means editing one object.

   Loaded as a classic script before the page's own script, and before the
   inline bootstrap IIFEs in progress.html and sir-ks02.html, which create slots
   at page-script load. Publishes window.TrackSchema.

   Two functions, two different answers to bad data, and the split is
   deliberate:

     normalizeSlot   always succeeds. It repairs. The legacy rescue paths need
                     this — refusing there would strand the user's oldest data.
     validateSlot    only reports. It never repairs. Import calls it FIRST and
                     refuses on any error, so a corrupt file cannot reach
                     localStorage at all.

   Dates are LOCAL calendar days. toISOString is never used: it returns the UTC
   day, so a workspace created at 6pm in UTC-7 was stamped tomorrow. This file
   carries its own localToday rather than calling calendar-core.js, because
   progress.html and sir-ks02.html do not load calendar-core.js.

   NOTE: nothing here rewrites data already in track_db. normalizeSlot runs at
   creation and import only. Running it over stored slots is a migration, and
   migrations belong behind a schemaVersion that does not exist yet.
*/
(function (global) {
  'use strict';

  // ── the schema ───────────────────────────────────────────────────────────
  // field name → kind:
  //   text  a string
  //   date  a 'YYYY-MM-DD' local calendar day
  //   list  an array
  //   map   a plain object used as a keyed map
  var SLOT_FIELDS = {
    id: 'text',
    name: 'text',
    createdAt: 'date',
    sessions: 'list',
    mms: 'list',
    kolbs: 'list',
    mgChanges: 'list',
    linChanges: 'list',
    linDayTitles: 'map',
    goals: 'list',
    saActions: 'list',
    saEntries: 'list',
    sourceDumps: 'list',
    notes: 'list',
    mmEntries: 'list',
    mgSchedule: 'map',
    calendarNotes: 'list',
    deadlines: 'list',
    pos: 'map',
    levelTemplates: 'map',
    docPages: 'list',
    trueStorages: 'list',
    trueStoragePos: 'map'
  };

  var SLOT_KEYS = Object.keys(SLOT_FIELDS);

  // Must be an own-property test, not `SLOT_FIELDS[key]`. Truthiness inherits
  // from Object.prototype, so 'constructor', 'toString', 'valueOf' and
  // 'hasOwnProperty' would all look like canonical fields and get dropped by
  // the unknown-key branch of normalizeSlot.
  function isCanonical(key) {
    return Object.prototype.hasOwnProperty.call(SLOT_FIELDS, key);
  }

  // ── kinds ────────────────────────────────────────────────────────────────

  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  function isList(v) { return Array.isArray(v); }

  // Arrays and null are both typeof 'object', and broken imports have stored
  // both in fields that readers then treat as maps.
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function isText(v) { return typeof v === 'string'; }

  // The shape AND a real day: '2026-13-45' matches the regex but is not a date.
  // Built with local Date components — day 0 of the next month is the last day
  // of this one — so this never touches UTC.
  function isDay(v) {
    if (typeof v !== 'string' || !DAY_RE.test(v)) return false;
    var y = +v.slice(0, 4), m = +v.slice(5, 7), d = +v.slice(8, 10);
    if (m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(y, m, 0).getDate();
  }

  function isTime(v) { return typeof v === 'string' && TIME_RE.test(v); }

  function matches(kind, v) {
    if (kind === 'list') return isList(v);
    if (kind === 'map') return isMap(v);
    if (kind === 'date') return isDay(v);
    return isText(v);
  }

  function defaultFor(kind) {
    if (kind === 'list') return [];
    if (kind === 'map') return {};
    return '';
  }

  // ── local calendar day ───────────────────────────────────────────────────

  // Takes an optional Date so the local-day contract is testable at both ends
  // of a day, the way calendar-core.js's toDateStr is. This is a fourth copy of
  // that expression (calendar-core.js, documentations.html, progress.html are
  // the others) because two of the four pages do not load calendar-core.js.
  // NOTES Proposal 3 consolidates all four.
  function localToday(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // TrackStorage is read at call time, not load time, so script order between
  // this file and storage-guard.js cannot matter. The 'slot-' prefix is
  // cosmetic — nothing anywhere parses it — but it keeps an export readable.
  // The random tail removes the same-millisecond collision 'slot-'+Date.now()
  // had.
  function newSlotId() {
    var store = global.TrackStorage;
    var tail = (store && store.newId)
      ? store.newId()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    return 'slot-' + tail;
  }

  // ── normalize ────────────────────────────────────────────────────────────

  // Returns a complete slot. Never throws, never mutates `input`, never returns
  // a field of the wrong kind. `opts` ({id, name, createdAt}) wins over `input`,
  // which wins over the default.
  //
  // Sub-objects are shared with `input` rather than deep-copied: the caller's
  // object is left untouched, which is what matters, and import always hands us
  // a freshly parsed tree anyway.
  function normalizeSlot(input, opts) {
    var src = isMap(input) ? input : {};
    var o = opts || {};
    var out = {};
    var i, key, kind, v;

    // Unknown keys first, so a field this version has never heard of survives
    // an export/import round trip instead of being dropped by a hand-maintained
    // allow-list — the exact problem NOTES Proposal 1 opens with. The per-page
    // writers already guarantee this for ordinary edits.
    //
    // __proto__ is skipped: JSON.parse makes it an own property, and assigning
    // it here would set the prototype of the slot we are building.
    for (key in src) {
      if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
      if (key === '__proto__' || isCanonical(key)) continue;
      out[key] = src[key];
    }

    // Table order, so JSON.stringify of a fresh slot is byte-stable whichever
    // page built it. The fixups below overwrite these keys rather than adding
    // them, which leaves that order intact.
    for (i = 0; i < SLOT_KEYS.length; i++) {
      key = SLOT_KEYS[i];
      kind = SLOT_FIELDS[key];
      if (key === 'id') {
        // An id already present is copied through verbatim whatever its type,
        // because an id is a reference: activeSlotId and every export point at
        // it, and AGENTS.md is explicit that a stored id is never rewritten. A
        // bad one is reported by validateSlot instead of being repaired here.
        out.id = (o.id !== undefined) ? o.id : src.id;
        continue;
      }
      v = Object.prototype.hasOwnProperty.call(src, key) ? src[key] : undefined;
      out[key] = matches(kind, v) ? v : defaultFor(kind);
    }

    // Minted only when there is no id to preserve.
    if (!out.id) out.id = newSlotId();

    if (o.name !== undefined) out.name = o.name;
    if (!out.name) out.name = 'Untitled';

    if (o.createdAt !== undefined) out.createdAt = o.createdAt;
    if (!isDay(out.createdAt)) out.createdAt = localToday();

    return out;
  }

  function createEmptySlot(opts) {
    return normalizeSlot({}, opts);
  }

  // ── validate ─────────────────────────────────────────────────────────────

  function describe(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'nothing';
    if (Array.isArray(v)) return 'a list';
    if (typeof v === 'object') return 'an object';
    if (typeof v === 'string') return 'text';
    return 'a ' + typeof v;
  }

  function kindLabel(kind) {
    if (kind === 'list') return 'a list';
    if (kind === 'map') return 'an object';
    if (kind === 'date') return 'a YYYY-MM-DD date';
    return 'text';
  }

  function validationError(field, message, fatal) {
    return { field: field, message: message, fatal: fatal === true };
  }

  // Accept either a validation report or its errors array. Keeping severity in
  // the report means storage-guard.js and future migration code do not have to
  // infer structural damage from field names or message text.
  function hasFatalErrors(reportOrErrors) {
    var errors = isList(reportOrErrors)
      ? reportOrErrors
      : (reportOrErrors && isList(reportOrErrors.errors) ? reportOrErrors.errors : []);
    return errors.some(function (error) { return !!error && error.fatal === true; });
  }

  // Every list field holds records. A field being a list is not enough: a stray
  // null or string inside one imports cleanly under a type check that only looks
  // at the field, and then throws out of flattenGoals or buildBuckets on the
  // next render, which is a white screen with no way back except editing
  // localStorage by hand.
  function listItemErrors(slot) {
    var errors = [];
    for (var i = 0; i < SLOT_KEYS.length; i++) {
      var key = SLOT_KEYS[i];
      if (SLOT_FIELDS[key] !== 'list') continue;
      var list = slot[key];
      if (!isList(list)) continue; // the kind check already reported this
      /* jshint loopfunc:true */
      list.forEach(function (item, n) {
        if (!isMap(item)) {
          errors.push(validationError(
            key,
            '"' + key + '[' + n + ']" must be an object, found ' + describe(item),
            true
          ));
        }
      });
    }
    return errors;
  }

  // Goal readers recurse through children and directly iterate these nested
  // fields. Validate that structure at every depth, not only the top-level
  // `goals` array. Absence and null remain legacy-safe just like canonical slot
  // fields: they hold no data, and migrations may fill their defaults later.
  function goalTreeErrors(slot) {
    var errors = [];
    if (!isList(slot.goals)) return errors; // the canonical kind check reports it

    function nestedKindError(at, key, value, predicate, expected) {
      if (value === undefined || value === null || predicate(value)) return;
      errors.push(validationError(
        'goals',
        '"' + at + '.' + key + '" must be ' + expected + ', found ' + describe(value),
        true
      ));
    }

    function walk(nodes, path) {
      nodes.forEach(function (node, n) {
        var at = path + '[' + n + ']';
        if (!isMap(node)) {
          // listItemErrors already reports top-level goals; nested child lists
          // need the same protection here.
          if (path !== 'goals') {
            errors.push(validationError(
              'goals',
              '"' + at + '" must be an object, found ' + describe(node),
              true
            ));
          }
          return;
        }

        nestedKindError(at, 'toLearn', node.toLearn, isList, 'a list');
        nestedKindError(at, 'milestones', node.milestones, isList, 'a list');
        nestedKindError(at, 'mmTargets', node.mmTargets, isMap, 'an object');

        if (isList(node.milestones)) {
          node.milestones.forEach(function (milestone, milestoneIndex) {
            if (!isMap(milestone)) {
              errors.push(validationError(
                'goals',
                '"' + at + '.milestones[' + milestoneIndex + ']" must be an object, found ' + describe(milestone),
                true
              ));
            }
          });
        }

        if (node.children === undefined || node.children === null) return;
        if (!isList(node.children)) {
          errors.push(validationError(
            'goals',
            '"' + at + '.children" must be a list, found ' + describe(node.children),
            true
          ));
          return;
        }
        walk(node.children, at + '.children');
      });
    }

    walk(slot.goals, 'goals');
    return errors;
  }

  // calendarNotes and deadlines are the two arrays whose items carry dates that
  // the calendar reads directly, so a bad one there is what actually breaks a
  // render.
  function datedItemErrors(slot) {
    var errors = [];
    ['calendarNotes', 'deadlines'].forEach(function (key) {
      var list = slot[key];
      if (!isList(list)) return; // the kind check already reported this
      list.forEach(function (item, n) {
        var at = '"' + key + '[' + n + ']"';
        if (!isMap(item)) return; // listItemErrors reports this one
        if (!isDay(item.date)) {
          errors.push(validationError(key, at + ' needs a YYYY-MM-DD date, found ' + describe(item.date), false));
        }
        if (item.startDate !== undefined && !isDay(item.startDate)) {
          errors.push(validationError(key, at + ' has an invalid startDate, found ' + describe(item.startDate), false));
        }
        // ABSENCE IS THE DEFAULT AND IT IS MEANINGFUL: a note with no `time` is
        // a chip in the day strip, which is how every day note behaved before
        // the field existed. Only a value that is present is checked, and ''
        // is not a value — see AGENTS.md on the `time` key.
        if (item.time !== undefined && !isTime(item.time)) {
          errors.push(validationError(key, at + ' has an invalid time ' + describe(item.time) + ', expected HH:MM', false));
        }
        // The schedule-block keys. Their ABSENCE is the automatic default —
        // every item is on the hour grid at DEFAULT_BLOCK_MINS on its own day —
        // so only a present value is checked, exactly as for `time`.
        //
        // Non-fatal, and the split from `done` and `blockOff` is deliberate:
        // those two are safe by construction because every reader goes through
        // `!!`, so a check there could only invent a way to block a database.
        // These three reach GEOMETRY instead. A string or a NaN duration
        // renders `height: NaNpx`, a malformed blockTime misplaces the block
        // and a malformed blockDate would draw it on a day that does not exist
        // — the same class of damage as a malformed `time`, so all three warn
        // and stay editable rather than freezing the database.
        if (item.blockDuration !== undefined
            && !(typeof item.blockDuration === 'number' && isFinite(item.blockDuration) && item.blockDuration > 0)) {
          errors.push(validationError(key, at + ' has an invalid blockDuration ' + describe(item.blockDuration) + ', expected a positive number of minutes', false));
        }
        if (item.blockTime !== undefined && !isTime(item.blockTime)) {
          errors.push(validationError(key, at + ' has an invalid blockTime ' + describe(item.blockTime) + ', expected HH:MM', false));
        }
        if (item.blockDate !== undefined && !isDay(item.blockDate)) {
          errors.push(validationError(key, at + ' has an invalid blockDate ' + describe(item.blockDate) + ', expected YYYY-MM-DD', false));
        }
        // `parts` holds records and is traversed, so it is FATAL like a goal's
        // children rather than a warning like the three values above: a stray null
        // in it imports cleanly under a field-only check and then throws out of
        // the next render.
        //
        // `null` is read as absent here, unlike the two warnings above, and the
        // difference is severity rather than oversight: those only warn, so they
        // can afford to point at a suspect value, while this one freezes the
        // whole database — and `parts: null` unambiguously means "no parts".
        if (item.parts !== undefined && item.parts !== null) {
          if (!isList(item.parts)) {
            errors.push(validationError(key, at + '.parts must be a list when present, found ' + describe(item.parts), true));
          } else {
            item.parts.forEach(function (part, p) {
              if (!isMap(part)) {
                errors.push(validationError(key, at + '.parts[' + p + '] must be an object, found ' + describe(part), true));
              }
            });
          }
        }
      });
    });
    return errors;
  }

  // Reports; never repairs, never throws. A field that is ABSENT is not an
  // error — that is simply an older export, and normalizeSlot fills it in.
  function validateSlot(input, label) {
    var where = label || 'slot';
    if (!isMap(input)) {
      return { ok: false, errors: [validationError(where, where + ' must be an object, found ' + describe(input), true)] };
    }
    var errors = [];
    for (var i = 0; i < SLOT_KEYS.length; i++) {
      var key = SLOT_KEYS[i];
      var v = input[key];
      // null counts as missing, not as wrong. A null list holds no data, so
      // normalizeSlot filling in the default discards nothing — refusing the
      // whole file over an empty field would just cost the user the import.
      if (v === undefined || v === null) continue;
      if (!matches(SLOT_FIELDS[key], v)) {
        // A string that is not a real calendar day is a semantic warning. A
        // non-string in that field is structural, like every other wrong
        // canonical kind, because readers cannot safely use it as text.
        var fatal = SLOT_FIELDS[key] !== 'date' || !isText(v);
        errors.push(validationError(
          key,
          '"' + key + '" must be ' + kindLabel(SLOT_FIELDS[key]) + ', found ' + describe(v),
          fatal
        ));
      }
    }
    errors = errors.concat(listItemErrors(input), goalTreeErrors(input), datedItemErrors(input));
    return { ok: !errors.length, errors: errors };
  }

  // A whole database offered to the slot importer is structurally a valid but
  // completely empty slot, so it would import as a blank workspace with the real
  // data stranded under an unknown `slots` key. Worth naming rather than
  // silently accepting.
  var DATA_KEYS = SLOT_KEYS.filter(function (k) {
    return k !== 'id' && k !== 'name' && k !== 'createdAt';
  });

  function looksLikeDatabase(input) {
    if (!isMap(input) || !isList(input.slots)) return false;
    for (var i = 0; i < DATA_KEYS.length; i++) {
      // Any real slot data present means treat it as a slot that merely happens
      // to carry a `slots` key.
      if (input[DATA_KEYS[i]] !== undefined) return false;
    }
    return true;
  }

  // The invariants NOTES.md lists that are cheap and structural. Deliberately
  // NOT covered yet, and belonging with the migration registry: goal and task
  // id uniqueness, whether linked task/mind-map references resolve, source-dump
  // nested block id uniqueness, and schema-version support.
  function validateDatabase(db) {
    if (!isMap(db)) {
      return { ok: false, errors: [validationError('database', 'the database must be an object, found ' + describe(db), true)] };
    }
    if (!isList(db.slots)) {
      // Nothing below can run without a slot list, so stop here rather than
      // pile on errors that are all the same error.
      return { ok: false, errors: [validationError('slots', '"slots" must be a list, found ' + describe(db.slots), true)] };
    }

    var errors = [];
    var seen = Object.create(null);

    db.slots.forEach(function (slot, n) {
      var where = 'slots[' + n + ']';
      errors = errors.concat(validateSlot(slot, where).errors);
      if (!isMap(slot)) return;
      if (!slot.id) {
        errors.push(validationError('slots', where + ' has no id', true));
        return;
      }
      var k = String(slot.id);
      if (seen[k]) errors.push(validationError('slots', 'two slots share the id "' + k + '"', true));
      seen[k] = true;
    });

    var active = db.activeSlotId;
    if (active !== undefined && active !== null && !seen[String(active)]) {
      errors.push(validationError('activeSlotId', 'activeSlotId "' + active + '" does not match any slot', false));
    }

    return { ok: !errors.length, errors: errors };
  }

  // For the one-line summary an alert can show without becoming a wall of text.
  function describeErrors(errors, limit) {
    var max = limit || 6;
    var lines = (errors || []).slice(0, max).map(function (e) { return '  • ' + e.message; });
    if (errors && errors.length > max) lines.push('  • …and ' + (errors.length - max) + ' more');
    return lines.join('\n');
  }

  global.TrackSchema = {
    SLOT_FIELDS: Object.freeze(SLOT_FIELDS),
    SLOT_KEYS: Object.freeze(SLOT_KEYS),
    localToday: localToday,
    newSlotId: newSlotId,
    createEmptySlot: createEmptySlot,
    normalizeSlot: normalizeSlot,
    validateSlot: validateSlot,
    validateDatabase: validateDatabase,
    hasFatalErrors: hasFatalErrors,
    looksLikeDatabase: looksLikeDatabase,
    describeErrors: describeErrors,
    isList: isList,
    isMap: isMap,
    isDay: isDay,
    isTime: isTime
  };
})(window);
