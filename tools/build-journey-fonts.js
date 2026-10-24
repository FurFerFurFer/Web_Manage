#!/usr/bin/env node
/* ── tools/build-journey-fonts.js ─────────────────────────────────────────
   Writes scripts/journey-fonts.js: the Journey book's typefaces, downloaded
   ONCE from Google Fonts and embedded as base64, so the book works offline and
   opened from disk. (A font file beside the page would not do: Chrome refuses
   a @font-face URL from file:// under CORS, while a FontFace built from bytes
   is never fetched at all.)

       node tools/build-journey-fonts.js          needs the network, this once

   What it embeds, every one under the SIL Open Font License 1.1:

     Journey Hand   Fondamento           latin, latin-ext   the entries
     Journey Hand   Charm                thai               Thai, in a matching hand
     Journey Caps   IM Fell English SC   latin              dates and page numbers
     Journey Title  Cinzel Decorative    latin              the title page

   The woff2 bytes are Google's own served subsets, UNMODIFIED, and each one's
   unicode-range is copied from Google's stylesheet, so the browser picks Charm
   for Thai letters and Fondamento for the rest with no rule of ours. Each
   family's OFL.txt, with its copyright line, comes from github.com/google/fonts
   and is copied whole into the generated file's header, as the licence asks.

   No dependencies (Node 18+'s global fetch). It writes NOTHING unless every
   download arrived and checked out: a woff2 must start with "wOF2", a licence
   must be the OFL 1.1.

   After replacing a copy that was already deployed, bump FONTS_V in
   scripts/journey-book.js, and journey-book.js's own ?v= on the five pages,
   or a returning visitor keeps the cached old file.
*/
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const OUT = path.join(__dirname, '..', 'scripts', 'journey-fonts.js');
// A current browser's agent: Google serves woff2 only to one that takes it.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const WANT = [
  { family: 'Journey Hand', source: 'Fondamento', dir: 'fondamento', subsets: ['latin', 'latin-ext'] },
  { family: 'Journey Hand', source: 'Charm', dir: 'charm', subsets: ['thai'] },
  { family: 'Journey Caps', source: 'IM Fell English SC', dir: 'imfellenglishsc', subsets: ['latin'] },
  { family: 'Journey Title', source: 'Cinzel Decorative', dir: 'cinzeldecorative', subsets: ['latin'] }
];

async function get(url, as) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText + ' for ' + url);
  return as === 'bytes' ? Buffer.from(await res.arrayBuffer()) : res.text();
}

// Google's stylesheet is one @font-face per subset, each after a comment
// naming the subset: /* latin */ @font-face { … src: url(…) …; unicode-range: …; }
function facesIn(css) {
  const out = {};
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[2];
    const url = (body.match(/src:\s*url\(([^)]+)\)\s*format\(['"]woff2['"]\)/) || [])[1];
    const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1];
    const style = (body.match(/font-style:\s*([a-z]+)/) || [])[1];
    const weight = (body.match(/font-weight:\s*(\d+)/) || [])[1];
    if (url && range && style === 'normal' && weight === '400') out[m[1]] = { url: url.trim(), range: range.trim() };
  }
  return out;
}

async function main() {
  const faces = [];
  const licences = [];
  for (const w of WANT) {
    const css = await get('https://fonts.googleapis.com/css2?family=' + encodeURIComponent(w.source).replace(/%20/g, '+') +
      '&display=swap', 'text');
    const found = facesIn(css);
    for (const subset of w.subsets) {
      const f = found[subset];
      if (!f) throw new Error(w.source + ' has no regular "' + subset + '" woff2 in Google\'s stylesheet');
      const bytes = await get(f.url, 'bytes');
      if (bytes.slice(0, 4).toString('latin1') !== 'wOF2') throw new Error(f.url + ' is not a woff2 file');
      faces.push({
        family: w.family, source: w.source, subset, unicodeRange: f.range, url: f.url,
        bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        data: bytes.toString('base64')
      });
    }
    const ofl = await get('https://raw.githubusercontent.com/google/fonts/main/ofl/' + w.dir + '/OFL.txt', 'text');
    if (!/SIL OPEN FONT LICENSE Version 1\.1/i.test(ofl)) throw new Error(w.source + '\'s licence is not the OFL 1.1');
    licences.push({ source: w.source, text: ofl.replace(/\r\n/g, '\n').trim() });
  }

  const comment = s => s.replace(/\*\//g, '* /');
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const lines = [];
  lines.push('/* ── journey-fonts.js ─────────────────────────────────────────────────────');
  lines.push('   GENERATED by tools/build-journey-fonts.js on ' + today + '. Do not edit by hand.');
  lines.push('');
  lines.push('   The lettering of the Journey book, embedded so it works offline and opened');
  lines.push('   from disk (window.TrackJourneyFonts). journey-book.js loads this file on');
  lines.push('   the book\'s first open, never a page, and registers each face with');
  lines.push('   new FontFace(family, bytes, {unicodeRange}).');
  lines.push('');
  lines.push('   Google Fonts\' served woff2 subsets, unmodified:');
  faces.forEach(f => lines.push('     ' + f.family.padEnd(14) + f.source.padEnd(20) + f.subset.padEnd(10) +
    String(f.bytes).padStart(7) + ' B  sha256 ' + f.sha256.slice(0, 16) + '…'));
  lines.push('');
  lines.push('   Every typeface here is licensed under the SIL Open Font License,');
  lines.push('   Version 1.1. Each family\'s licence follows, verbatim.');
  licences.forEach(l => {
    lines.push('');
    lines.push('   ── ' + l.source + ' ──');
    lines.push('');
    comment(l.text).split('\n').forEach(t => lines.push(('   ' + t).replace(/\s+$/, '')));
  });
  lines.push('*/');
  lines.push('window.TrackJourneyFonts = {');
  lines.push('  generated: true,');
  lines.push('  faces: [');
  faces.forEach((f, i) => {
    lines.push('    { family: ' + JSON.stringify(f.family) + ', source: ' + JSON.stringify(f.source) +
      ', subset: ' + JSON.stringify(f.subset) + ', unicodeRange: ' + JSON.stringify(f.unicodeRange) + ',');
    lines.push('      data: ' + JSON.stringify(f.data) + ' }' + (i < faces.length - 1 ? ',' : ''));
  });
  lines.push('  ]');
  lines.push('};');
  lines.push('');

  fs.writeFileSync(OUT, lines.join('\n'));
  const total = faces.reduce((n, f) => n + f.bytes, 0);
  console.log('wrote ' + path.relative(process.cwd(), OUT) + ': ' + faces.length + ' faces, ' +
    Math.round(total / 1024) + ' KB of fonts, ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB on disk');
  faces.forEach(f => console.log('  ' + f.source + ' (' + f.subset + ')  ' + f.bytes + ' B  ' + f.sha256));
  console.log('If an older copy was already deployed: bump FONTS_V in scripts/journey-book.js,');
  console.log('and journey-book.js\'s ?v= on the five pages.');
}

main().catch(err => {
  console.error('journey fonts NOT written: ' + err.message);
  process.exit(1);
});
