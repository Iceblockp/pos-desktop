import type { DatabaseSync } from 'node:sqlite';
type IdentityDatabase = DatabaseSync;

/**
 * Repair identities, not names. Payments already refer to the stable code and
 * snapshot their labels. Only the built-in default price level has a known
 * identity; two custom levels with the same label may have different prices.
 * Caller owns the transaction. Backups and aliases are local to this shop.
 */
export function reconcileIdentities(db: IdentityDatabase): void {
  const all = (sql: string, params: any[] = []): any[] => db.prepare(sql).all(...params);
  const run = (sql: string, params: any[] = []): void => { db.prepare(sql).run(...params); };
  const backup = (table: string, row: any): void => {
    run('INSERT OR IGNORE INTO sync_state (key,value) VALUES (?,?)',
      ['identity.backup.' + table + '.' + row.id, JSON.stringify(row)]);
  };
  const retire = (table: string, row: any): void => {
    if (row.deletedAt) return;
    backup(table, row);
    const at = new Date(Math.max(Date.now(), Date.parse(row.updatedAt) + 1)).toISOString();
    run(`UPDATE ${table} SET deletedAt = ?, updatedAt = ?, dirty = 1 WHERE id = ?`, [at, at, row.id]);
  };
  const alias = (table: string, oldId: string, canonical: string): void => {
    run('INSERT INTO sync_state (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['identity.alias.' + table + '.' + oldId, canonical]);
  };

  // A price tier may arrive on a later page than the level we already merged.
  // Recover a separate custom level when that would collide with a retail tier.
  const candidates = all(`SELECT * FROM price_levels WHERE id != 'level-retail' AND
    (isDefault = 1 OR id IN (SELECT substr(key, 29) FROM sync_state WHERE key LIKE 'identity.alias.price_levels.%')
      OR id IN (SELECT substr(key, 25) FROM sync_state WHERE key LIKE 'identity.price-conflict.%'))`);
  for (const row of candidates) {
    const conflict = all(`SELECT a.id FROM bulk_pricing a JOIN bulk_pricing b
      ON a.productId = b.productId AND a.minQuantity = b.minQuantity
      WHERE a.priceLevelId = ? AND a.deletedAt IS NULL AND b.deletedAt IS NULL
        AND (b.priceLevelId = 'level-retail' OR b.priceLevelId IS NULL)
        AND a.bulkPrice != b.bulkPrice LIMIT 1`, [row.id]);
    const marked = (all('SELECT value FROM sync_state WHERE key = ?', ['identity.price-conflict.' + row.id]))[0];
    if (!conflict.length && !marked) continue;
    run('DELETE FROM sync_state WHERE key = ?', ['identity.alias.price_levels.' + row.id]);
    if (!marked || row.isDefault) {
      backup('price_levels', row);
      const at = new Date(Math.max(Date.now(), Date.parse(row.updatedAt) + 1)).toISOString();
      const label = marked?.value ?? row.name + ' (pricing conflict)';
      run('INSERT OR IGNORE INTO sync_state (key,value) VALUES (?,?)', ['identity.price-conflict.' + row.id, label]);
      run('UPDATE price_levels SET isDefault = 0, deletedAt = NULL, name = ?, updatedAt = ?, dirty = 1 WHERE id = ?', [label, at, row.id]);
    }
  }

  // Stable ordering gives every device the same survivor, even when pages
  // arrive in a different order. Existing aliases are enforced before grouping.
  for (const table of ['payment_methods', 'price_levels']) {
    const saved = all('SELECT key,value FROM sync_state WHERE key LIKE ?', ['identity.alias.' + table + '.%']);
    for (const item of saved) {
      const id = item.key.slice(('identity.alias.' + table + '.').length);
      const row = (all(`SELECT * FROM ${table} WHERE id = ?`, [id]))[0];
      if (table === 'price_levels' && row && !row.isDefault) {
        run('DELETE FROM sync_state WHERE key = ?', [item.key]);
        continue;
      }
      if (row) retire(table, row);
    }
  }

  const methods = all('SELECT * FROM payment_methods WHERE deletedAt IS NULL ORDER BY id COLLATE BINARY');
  const survivors = new Map<string, any>();
  for (const row of methods) {
    const canonical = survivors.get(row.code);
    if (!canonical) { survivors.set(row.code, row); continue; }
    // Hiding one duplicate must not hide a second, still-active method.
    if (row.isActive && !canonical.isActive) {
      backup('payment_methods', canonical);
      const at = new Date(Math.max(Date.now(), Date.parse(canonical.updatedAt) + 1)).toISOString();
      run('UPDATE payment_methods SET isActive = 1, dirty = 1, updatedAt = ? WHERE id = ?', [at, canonical.id]);
      canonical.isActive = 1;
    }
    alias('payment_methods', row.id, canonical.id);
    retire('payment_methods', row);
  }

  const levels = all('SELECT * FROM price_levels WHERE isDefault = 1 AND id != ? ORDER BY id COLLATE BINARY', ['level-retail']);
  for (const row of levels) {
    alias('price_levels', row.id, 'level-retail');
    retire('price_levels', row);
  }

  // Repair references again on every page: children can arrive after a parent
  // was merged. Sales keep their amounts, timestamps and sync state unchanged.
  const levelAliases = all('SELECT key,value FROM sync_state WHERE key LIKE ?', ['identity.alias.price_levels.%']);
  for (const item of levelAliases) {
    const id = item.key.slice('identity.alias.price_levels.'.length);
    for (const table of ['sales', 'bulk_pricing']) {
      const refs = all(`SELECT * FROM ${table} WHERE priceLevelId = ?`, [id]);
      for (const row of refs) {
        backup(table, row);
        if (table === 'bulk_pricing') {
          const at = new Date(Math.max(Date.now(), Date.parse(row.updatedAt) + 1)).toISOString();
          run('UPDATE bulk_pricing SET priceLevelId = ?, updatedAt = ?, dirty = 1 WHERE id = ?', [item.value, at, row.id]);
        } else {
          run('UPDATE sales SET priceLevelId = ? WHERE id = ?', [item.value, row.id]);
        }
      }
    }
    const stored = (all('SELECT value FROM sync_state WHERE key = ?', ['cart.draft']))[0];
    if (stored?.value) {
      let draft: any;
      try { draft = JSON.parse(stored.value); } catch { continue; }
      if (draft?.priceLevelId === id) {
        draft.priceLevelId = item.value;
        run('UPDATE sync_state SET value = ? WHERE key = ?', [JSON.stringify(draft), 'cart.draft']);
      }
    }
  }
}
