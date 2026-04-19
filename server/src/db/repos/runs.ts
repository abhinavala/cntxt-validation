import type Database from 'better-sqlite3';
import type { RunRow } from '../../../../shared/src/types/db.js';

export class RunsRepo {
  private db: Database.Database;
  private stmts: {
    insert: Database.Statement;
    findById: Database.Statement;
    findAll: Database.Statement;
    findByAgentId: Database.Statement;
    updateStatus: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.db = db;
    this.stmts = {
      insert: db.prepare(
        'INSERT INTO runs (id, agent_id, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?)'
      ),
      findById: db.prepare('SELECT * FROM runs WHERE id = ?'),
      findAll: db.prepare('SELECT * FROM runs'),
      findByAgentId: db.prepare('SELECT * FROM runs WHERE agent_id = ?'),
      updateStatus: db.prepare(
        'UPDATE runs SET status = ?, ended_at = ? WHERE id = ?'
      ),
      deleteById: db.prepare('DELETE FROM runs WHERE id = ?'),
    };
  }

  insert(row: RunRow): void {
    this.stmts.insert.run(row.id, row.agent_id, row.status, row.started_at, row.ended_at);
  }

  findById(id: string): RunRow | undefined {
    return this.stmts.findById.get(id) as RunRow | undefined;
  }

  findAll(): RunRow[] {
    return this.stmts.findAll.all() as RunRow[];
  }

  findByAgentId(agentId: string): RunRow[] {
    return this.stmts.findByAgentId.all(agentId) as RunRow[];
  }

  updateStatus(id: string, status: string, endedAt: string | null): number {
    const result = this.stmts.updateStatus.run(status, endedAt, id);
    return result.changes;
  }

  deleteById(id: string): number {
    const result = this.stmts.deleteById.run(id);
    return result.changes;
  }
}

export type { RunsRepo };
