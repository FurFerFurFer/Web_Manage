#!/usr/bin/env node
/**
 * notifications-build.js
 *
 * Merges a batch of freshly fetched notification items into notifications.json.
 *
 * Usage:
 *   node notifications-build.js <batch.json> [--out notifications.json] [--days 60] [--max 800]
 *
 * The batch file is an array of loosely shaped records, e.g. from Gmail:
 *   [{ id, source, kind, from, subject, preview, date, unread, url }]
 *
 * Guarantees:
 *   - Existing items in the output file are preserved and de-duplicated by id.
 *   - `unread` and `preview` are refreshed from the newer record on re-fetch.
 *   - HTML entities in subject/preview/from are decoded.
 *   - Items older than --days are pruned; the newest --max are kept.
 *   - Writes atomically via a temp file, so a crash cannot truncate the feed.
 *   - Exits non-zero without touching the output if the batch is malformed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SOURCES = ['gmail', 'outlook', 'teams'];
const KINDS = ['email', 'chat', 'mention', 'calendar'];

// ── args ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) {
  console.error('usage: node notifications-build.js <batch.json> [--out FILE] [--days N] [--max N]');
  process.exit(2);
}
const batchPath = argv[0];
function arg(flag, dflt) {
  const i = argv.indexOf(flag);
  return i === -1 ? dflt : argv[i + 1];
}
const outPath = arg('--out', path.join(__dirname, 'notifications.json'));
const days = Number(arg('--days', 60));
const max = Number(arg('--max', 800));

// ── helpers ─────────────────────────────────────────────────
const ENTITIES = {
  quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  hellip: '…', mdash: '—', ndash: '–'
};
function decodeEntities(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const k = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : m;
    })
    // Strip the invisible padding bulk senders use to stretch preview text:
    // combining grapheme joiner, zero-width space/non-joiner/joiner, BOM, soft hyphen.
    .replace(/[͏​-‍﻿­]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Foo Bar <foo@bar.com>" -> "Foo Bar"; bare address kept as-is. */
function cleanSender(s) {
  const raw = decodeEntities(s);
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  const name = m && m[1] && m[1].trim();
  return name || raw;
}

function isoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

function normalize(r, i) {
  if (!r || typeof r !== 'object') return null;

  let source = String(r.source || '').toLowerCase();
  if (!SOURCES.includes(source)) source = 'gmail';

  let kind = String(r.kind || '').toLowerCase();
  if (!KINDS.includes(kind)) kind = source === 'teams' ? 'chat' : 'email';

  const rawId = r.id != null ? String(r.id) : String(i);
  const id = rawId.includes(':') ? rawId : source + ':' + rawId;

  let url = typeof r.url === 'string' && /^https?:\/\//i.test(r.url) ? r.url : null;
  if (!url && source === 'gmail') {
    const tid = rawId.split(':').pop();
    if (/^[0-9a-f]+$/i.test(tid)) url = 'https://mail.google.com/mail/u/0/#inbox/' + tid;
  }

  const subject = decodeEntities(r.subject) || '(no subject)';

  return {
    id,
    source,
    kind,
    from: cleanSender(r.from) || 'Unknown',
    subject,
    preview: decodeEntities(r.preview),
    date: isoOrNull(r.date),
    unread: r.unread !== false,
    url
  };
}

// ── read batch ──────────────────────────────────────────────
let batch;
try {
  batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  if (!Array.isArray(batch)) throw new Error('batch must be a JSON array');
} catch (e) {
  console.error('refusing to write: bad batch file — ' + e.message);
  process.exit(1);
}

const incoming = batch.map(normalize).filter(Boolean);
if (batch.length && !incoming.length) {
  console.error('refusing to write: no valid records in batch');
  process.exit(1);
}

// ── read existing feed (missing file is fine) ───────────────
let existing = [];
if (fs.existsSync(outPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    if (Array.isArray(prev.items)) existing = prev.items.map(normalize).filter(Boolean);
  } catch (e) {
    console.error('warning: existing feed unreadable, starting fresh — ' + e.message);
  }
}

// ── merge: incoming wins on conflict, order preserved by date ──
const byId = new Map();
existing.forEach(it => byId.set(it.id, it));
let added = 0;
incoming.forEach(it => {
  if (!byId.has(it.id)) added++;
  byId.set(it.id, Object.assign({}, byId.get(it.id) || {}, it));
});

let items = Array.from(byId.values());

const cutoff = Date.now() - days * 86400000;
const beforePrune = items.length;
items = items.filter(it => !it.date || new Date(it.date).getTime() >= cutoff);
items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
const pruned = beforePrune - items.length;
if (items.length > max) items = items.slice(0, max);

// ── atomic write ────────────────────────────────────────────
const payload = {
  generatedAt: new Date().toISOString(),
  items
};
const tmp = outPath + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
fs.renameSync(tmp, outPath);

const counts = {};
items.forEach(it => { counts[it.source] = (counts[it.source] || 0) + 1; });
console.log(
  'wrote ' + path.basename(outPath) + ': ' + items.length + ' items ' +
  '(' + added + ' new, ' + pruned + ' pruned) — ' +
  Object.keys(counts).map(k => k + ' ' + counts[k]).join(', ')
);
