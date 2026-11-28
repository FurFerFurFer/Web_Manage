'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Browser } = require('./lib/cdp.js');
const { startServer } = require('./lib/server.js');

const workspace = title => JSON.stringify({ slots: [{ id: 's', name: title }], activeSlotId: 's' });
const device = workspace('Device');
const remote = workspace('Cloud');
const latest = workspace('Device with another pending edit');
const confirmedAt = Date.UTC(2026, 1, 4, 12, 24, 30);
const cloudAt = Date.UTC(2026, 1, 5, 15, 45, 10);

test('Firebase conflict banner in Chrome with synthetic Firestore', async t => {
  const server = await startServer(process.env.TRACK_TEST_ROOT || undefined);
  const browser = await Browser.launch();
  t.after(async () => {
    try { await browser.close(); } finally { await server.close(); }
  });
  const open = async (tc, localTime, cloudTime, cloudBytes = remote) => {
    const page = await browser.newPage();
    tc.after(() => page.close());
    await page.clearStorage(server.origin);
    await page.seedRaw(device, { track_db_ts: String(localTime), track_db_pending: '1' });
    await page.goto(server.url('tests/fixtures/firebase-sync.html'));
    await page.evaluate((bytes, ts) => { cloud.receive(bytes, ts); cloud.signIn(); }, cloudBytes, cloudTime);
    await page.waitFor(() => !!document.querySelector('#fb-sync-conflict'), { message: 'sync conflict' });
    return page;
  };
  const clickKeep = page => page.evaluate(() => {
    [...document.querySelectorAll('#fb-sync-conflict button')]
      .find(el => el.textContent === 'Keep this device — push now').click();
  });

  await t.test('labels each timestamp and refreshes the cloud time on a newer snapshot', async tc => {
    const page = await open(tc, confirmedAt, cloudAt);
    const displayedTimes = () => page.evaluate(() =>
      document.querySelector('#fb-sync-conflict').innerText);
    const expected = await page.evaluate((...times) =>
      times.map(ts => new Date(ts).toLocaleString()), confirmedAt, cloudAt, cloudAt + 60000);
    assert.ok((await displayedTimes()).includes('Last confirmed sync on this device: ' + expected[0]));
    assert.ok((await displayedTimes()).includes('Cloud version saved: ' + expected[1]));
    await page.evaluate((bytes, ts) => cloud.receive(bytes, ts), workspace('Newer cloud'), cloudAt + 60000);
    assert.ok((await displayedTimes()).includes('Cloud version saved: ' + expected[2]));
  });

  await t.test('shows unknown for missing times in a slot-count conflict', async tc => {
    const twoSlots = JSON.stringify({ slots: [{ id: 's' }, { id: 't' }], activeSlotId: 's' });
    const page = await open(tc, 0, 0, twoSlots);
    const msg = await page.evaluate(() => document.querySelector('#fb-sync-conflict').innerText);
    assert.ok(msg.includes('Last confirmed sync on this device: Unknown'));
    assert.ok(msg.includes('Cloud version saved: Unknown'));
  });

  await t.test('Cancel preserves both copies, pending state and the upload hold after another edit', async tc => {
    const page = await open(tc, confirmedAt, cloudAt);
    await page.evaluate(bytes => localStorage.setItem('track_db', bytes), latest);
    const pending = await page.evaluate(() => localStorage.getItem('track_db_pending'));
    page.rejectDialogs = true;
    await clickKeep(page);
    // Exercise the immediate flush path, then give the ordinary edit debounce its turn.
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('online'));
      await new Promise(resolve => setTimeout(resolve, TrackSync.limits.debounceMs + 100));
    });
    assert.deepEqual(await page.evaluate(async () => ({
      local: localStorage.getItem('track_db'), ts: localStorage.getItem('track_db_ts'),
      pending: localStorage.getItem('track_db_pending'), state: TrackSync.getStatus().state,
      banner: !!document.querySelector('#fb-sync-conflict'), cloud: await cloud.read()
    })), { local: latest, ts: String(confirmedAt), pending, state: 'conflict', banner: true,
      cloud: { raw: remote, ts: cloudAt, batches: 0 } });
    assert.equal(page.dialogs.length, 1, 'one native confirmation appears before upload');
    assert.match(page.dialogs[0], /replace the cloud copy/i);
  });

  await t.test('accepting pushes the latest device bytes once and clears pending after confirmation', async tc => {
    const page = await open(tc, confirmedAt, cloudAt);
    await page.evaluate(bytes => localStorage.setItem('track_db', bytes), latest);
    await clickKeep(page);
    await page.waitFor(() => TrackSync.getStatus().state === 'synced', { message: 'confirmed push' });
    const saved = await page.evaluate(() => cloud.read());
    assert.equal(saved.raw, latest);
    assert.equal(saved.batches, 1);
    assert.deepEqual(await page.evaluate(() => [
      localStorage.getItem('track_db'), localStorage.getItem('track_db_pending'),
      localStorage.getItem('track_db_ts'), !!document.querySelector('#fb-sync-conflict')
    ]), [latest, null, String(saved.ts), false]);
    assert.equal(page.dialogs.length, 1);
  });
});
