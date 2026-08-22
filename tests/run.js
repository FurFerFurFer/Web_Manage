#!/usr/bin/env node
/* ── tests/run.js ──────────────────────────────────────────────────────────
   The one command:

       node tests/run.js

   Runs each offline suite once per timezone, then the browser suite once.
   Exits non-zero if anything fails.

   Why the timezone sweep is the default and not an extra: calendar-core.js
   exists to turn instants into LOCAL calendar days, and schema.js stamps a new
   slot with one. The usual way to get that wrong — toISOString().split('T')[0]
   — is completely invisible when the machine runs in UTC. UTC+14 and UTC-11 are
   the two ends that catch it; the others are ordinary zones and a half-hour
   offset.

   Options:
     --offline     skip the browser suite
     --tz=A,B      run the offline suite under these zones instead
     --help

   No dependencies, no package.json, no runner config — node:test and
   node:child_process only. See AGENTS.md, "Current Architecture".
*/
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Browser } = require('./lib/cdp.js');

const HERE = __dirname;

// UTC+14 and UTC-11 are the extremes a local-day bug shows up at; Los Angeles
// adds DST transitions and Kathmandu a :45 offset.
const DEFAULT_ZONES = ['UTC', 'Pacific/Kiritimati', 'Pacific/Midway', 'America/Los_Angeles', 'Asia/Kathmandu'];

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(require('node:fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\* ?/, ''));
  process.exit(0);
}
const offlineOnly = args.includes('--offline');
const tzArg = args.find(a => a.startsWith('--tz='));
const zones = tzArg ? tzArg.slice('--tz='.length).split(',').filter(Boolean) : DEFAULT_ZONES;

const results = [];

function run(label, file, env) {
  process.stdout.write('\n── ' + label + ' ' + '─'.repeat(Math.max(0, 60 - label.length)) + '\n');
  const r = spawnSync(process.execPath, ['--test', path.join(HERE, file)], {
    stdio: 'inherit',
    env: Object.assign({}, process.env, env || {})
  });
  const ok = r.status === 0;
  results.push({ label, ok });
  return ok;
}

// Both files sweep every zone: calendar-core.js turns instants into local days,
// and schema.js stamps createdAt with one. Either can regress to a UTC day
// invisibly on a machine running in UTC.
const OFFLINE_FILES = ['calendar-core.test.js', 'schema.test.js'];

// Swept once, not per zone: true-storage-core.js, graph-layout.js and
// doc-table-core.js hold no date code at all, so five runs would cost five
// times as long and prove exactly the same thing.
const UNSWEPT_FILES = ['true-storage-core.test.js', 'graph-layout.test.js', 'doc-table-core.test.js'];

for (const tz of zones)
  for (const file of OFFLINE_FILES)
    run(file.replace(/\.test\.js$/, '') + '  TZ=' + tz, file, { TZ: tz });

for (const file of UNSWEPT_FILES)
  run(file.replace(/\.test\.js$/, '') + '  (no date code — one run)', file);

if (offlineOnly) {
  console.log('\n(browser suite skipped: --offline)');
} else if (!Browser.available()) {
  // A skip is not a pass. Say so loudly and fail, so a green run always means
  // the browser layer actually ran.
  console.error('\n!! No Chrome found — the browser suite did NOT run.');
  console.error('   Install Google Chrome or Chromium, set CHROME_PATH, or pass --offline');
  results.push({ label: 'browser (not run)', ok: false });
} else {
  run('browser (headless Chrome via CDP)', 'browser.test.js');
}

const failed = results.filter(r => !r.ok);
console.log('\n' + '='.repeat(64));
results.forEach(r => console.log((r.ok ? '  pass  ' : '  FAIL  ') + r.label));
console.log('='.repeat(64));
console.log(failed.length ? failed.length + ' of ' + results.length + ' suites failed'
  : 'all ' + results.length + ' suites passed');
process.exit(failed.length ? 1 : 0);
