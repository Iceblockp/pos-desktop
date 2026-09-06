const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');

const {createLoader}=require('./helpers.cjs');
const loadSource=(file,overrides={})=>createLoader(root,overrides)(file);

const { PosDatabase } = loadSource('src/main/database.ts');
// September 5 in Myanmar spans two UTC dates.
const from = '2026-09-04T17:30:00.000Z';
const to = '2026-09-05T17:29:59.999Z';

function setup(t) {
  const db = new PosDatabase(':memory:');
  t.after(() => db.sqlite.close());
  const insert = db.sqlite.prepare(
    'INSERT INTO sales (id, voucherId, soldAt, updatedAt) VALUES (?, ?, ?, ?)',
  );
  for (const [voucher, soldAt] of [
    ['MATCH-older', '2026-09-01T06:00:00.000Z'],
    ['MATCH-yesterday', '2026-09-04T17:29:59.999Z'],
    ['MATCH-midnight', from],
    ['OTHER-noon', '2026-09-05T05:30:00.000Z'],
    ['MATCH-last-millisecond', to],
    ['MATCH-tomorrow', '2026-09-05T17:30:00.000Z'],
  ]) insert.run(voucher, voucher, soldAt, soldAt);

  let api;
  loadSource('src/preload/preload.ts', {
    electron: {
      contextBridge: {
        exposeInMainWorld(name, value) {
          assert.equal(name, 'storePos');
          api = value;
        },
      },
      ipcRenderer: {
        invoke(channel, search, start, end) {
          assert.equal(channel, 'pos:sales');
          return Promise.resolve(db.listSales(search, start, end));
        },
      },
    },
  });
  return api.pos;
}

async function vouchers(pos, ...args) {
  return Array.from(await pos.sales(...args), (sale) => sale.voucherId);
}

test('Today crosses UTC midnight and excludes both adjacent local dates', async (t) => {
  assert.deepEqual(await vouchers(setup(t), '', from, to), [
    'MATCH-last-millisecond', 'OTHER-noon', 'MATCH-midnight',
  ]);
});

test('search remains constrained by the selected dates', async (t) => {
  assert.deepEqual(await vouchers(setup(t), 'MATCH', from, to), [
    'MATCH-last-millisecond', 'MATCH-midnight',
  ]);
});

test('an empty date range returns no sales', async (t) => {
  assert.deepEqual(await vouchers(setup(t), '',
    '2026-09-06T17:30:00.000Z', '2026-09-07T17:29:59.999Z'), []);
});

test('All time still works without date arguments', async (t) => {
  assert.equal((await vouchers(setup(t), '')).length, 6);
});
