import type Database from 'better-sqlite3';
import type { CredentialRow } from '../../../../shared/src/types/db.js';

export class CredentialsRepo {
  private db: Database.Database;
  private stmts: {
    insert: Database.Statement;
    findById: Database.Statement;
    findAll: Database.Statement;
    findByService: Database.Statement;
    update: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.db = db;
    this.stmts = {
      insert: db.prepare(
        'INSERT INTO credentials (id, service, label, encrypted_blob, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ),
      findById: db.prepare('SELECT * FROM credentials WHERE id = ?'),
      findAll: db.prepare('SELECT * FROM credentials'),
      findByService: db.prepare('SELECT * FROM credentials WHERE service = ?'),
      update: db.prepare(
        'UPDATE credentials SET service = ?, label = ?, encrypted_blob = ?, updated_at = ? WHERE id = ?'
      ),
      deleteById: db.prepare('DELETE FROM credentials WHERE id = ?'),
    };
  }

  insert(row: CredentialRow): void {
    this.stmts.insert.run(row.id, row.service, row.label, row.encrypted_blob, row.created_at, row.updated_at);
  }

  findById(id: string): CredentialRow | undefined {
    return this.stmts.findById.get(id) as CredentialRow | undefined;
  }

  findAll(): CredentialRow[] {
    return this.stmts.findAll.all() as CredentialRow[];
  }

  findByService(service: string): CredentialRow[] {
    return this.stmts.findByService.all(service) as CredentialRow[];
  }

  update(row: CredentialRow): number {
    const result = this.stmts.update.run(row.service, row.label, row.encrypted_blob, row.updated_at, row.id);
    return result.changes;
  }

  deleteById(id: string): number {
    const result = this.stmts.deleteById.run(id);
    return result.changes;
  }
}
