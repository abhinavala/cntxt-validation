import type Database from 'better-sqlite3';
import type { EventRow } from '../../../../shared/src/types/db.js';

export class EventsRepo {
  private db: Database.Database;
  private stmts: {
    insert: Database.Statement;
    findById: Database.Statement;
    findAll: Database.Statement;
    findByRunId: Database.Statement;
    findByCapabilityId: Database.Statement;
    findByEventType: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.db = db;
    this.stmts = {
      insert: db.prepare(
        'INSERT INTO events (id, run_id, capability_id, event_type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ),
      findById: db.prepare('SELECT * FROM events WHERE id = ?'),
      findAll: db.prepare('SELECT * FROM events'),
      findByRunId: db.prepare('SELECT * FROM events WHERE run_id = ?'),
      findByCapabilityId: db.prepare('SELECT * FROM events WHERE capability_id = ?'),
      findByEventType: db.prepare('SELECT * FROM events WHERE event_type = ?'),
      deleteById: db.prepare('DELETE FROM events WHERE id = ?'),
    };
  }

  insert(row: EventRow): void {
    this.stmts.insert.run(row.id, row.run_id, row.capability_id, row.event_type, row.detail, row.created_at);
  }

  findById(id: string): EventRow | undefined {
    return this.stmts.findById.get(id) as EventRow | undefined;
  }

  findAll(): EventRow[] {
    return this.stmts.findAll.all() as EventRow[];
  }

  findByRunId(runId: string): EventRow[] {
    return this.stmts.findByRunId.all(runId) as EventRow[];
  }

  findByCapabilityId(capabilityId: string): EventRow[] {
    return this.stmts.findByCapabilityId.all(capabilityId) as EventRow[];
  }

  findByEventType(eventType: string): EventRow[] {
    return this.stmts.findByEventType.all(eventType) as EventRow[];
  }

  deleteById(id: string): number {
    const result = this.stmts.deleteById.run(id);
    return result.changes;
  }
}

export type { EventsRepo };
