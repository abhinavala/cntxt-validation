import type Database from 'better-sqlite3';
import type { PolicyRow } from '../../../../shared/src/types/db.js';

export class PoliciesRepo {
  private db: Database.Database;
  private stmts: {
    insert: Database.Statement;
    findById: Database.Statement;
    findAll: Database.Statement;
    findByName: Database.Statement;
    update: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.db = db;
    this.stmts = {
      insert: db.prepare(
        'INSERT INTO policies (id, name, rules, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ),
      findById: db.prepare('SELECT * FROM policies WHERE id = ?'),
      findAll: db.prepare('SELECT * FROM policies'),
      findByName: db.prepare('SELECT * FROM policies WHERE name = ?'),
      update: db.prepare(
        'UPDATE policies SET name = ?, rules = ?, updated_at = ? WHERE id = ?'
      ),
      deleteById: db.prepare('DELETE FROM policies WHERE id = ?'),
    };
  }

  insert(row: PolicyRow): void {
    this.stmts.insert.run(row.id, row.name, row.rules, row.created_at, row.updated_at);
  }

  findById(id: string): PolicyRow | undefined {
    return this.stmts.findById.get(id) as PolicyRow | undefined;
  }

  findAll(): PolicyRow[] {
    return this.stmts.findAll.all() as PolicyRow[];
  }

  findByName(name: string): PolicyRow | undefined {
    return this.stmts.findByName.get(name) as PolicyRow | undefined;
  }

  update(row: PolicyRow): number {
    const result = this.stmts.update.run(row.name, row.rules, row.updated_at, row.id);
    return result.changes;
  }

  deleteById(id: string): number {
    const result = this.stmts.deleteById.run(id);
    return result.changes;
  }
}
