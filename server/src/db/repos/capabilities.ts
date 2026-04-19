import type Database from 'better-sqlite3';
import type { CapabilityGrantedRow } from '../../../../shared/src/types/db.js';

export class CapabilitiesRepo {
  private db: Database.Database;
  private stmts: {
    insert: Database.Statement;
    findById: Database.Statement;
    findAll: Database.Statement;
    findByRunId: Database.Statement;
    revokeById: Database.Statement;
    revokeAllByRun: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.db = db;
    this.stmts = {
      insert: db.prepare(
        'INSERT INTO capabilities_granted (id, run_id, credential_id, scope, expires_at, granted_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ),
      findById: db.prepare('SELECT * FROM capabilities_granted WHERE id = ?'),
      findAll: db.prepare('SELECT * FROM capabilities_granted'),
      findByRunId: db.prepare('SELECT * FROM capabilities_granted WHERE run_id = ?'),
      revokeById: db.prepare(
        'UPDATE capabilities_granted SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL'
      ),
      revokeAllByRun: db.prepare(
        'UPDATE capabilities_granted SET revoked_at = ? WHERE run_id = ? AND revoked_at IS NULL'
      ),
      deleteById: db.prepare('DELETE FROM capabilities_granted WHERE id = ?'),
    };
  }

  insert(row: CapabilityGrantedRow): void {
    this.stmts.insert.run(
      row.id, row.run_id, row.credential_id, row.scope,
      row.expires_at, row.granted_at, row.revoked_at
    );
  }

  findById(id: string): CapabilityGrantedRow | undefined {
    return this.stmts.findById.get(id) as CapabilityGrantedRow | undefined;
  }

  findAll(): CapabilityGrantedRow[] {
    return this.stmts.findAll.all() as CapabilityGrantedRow[];
  }

  findByRunId(runId: string): CapabilityGrantedRow[] {
    return this.stmts.findByRunId.all(runId) as CapabilityGrantedRow[];
  }

  revokeById(id: string, revokedAt: string): number {
    const result = this.stmts.revokeById.run(revokedAt, id);
    return result.changes;
  }

  revokeAllByRun(runId: string, _reason: string): number {
    const now = new Date().toISOString();
    const result = this.stmts.revokeAllByRun.run(now, runId);
    return result.changes;
  }

  deleteById(id: string): number {
    const result = this.stmts.deleteById.run(id);
    return result.changes;
  }
}
