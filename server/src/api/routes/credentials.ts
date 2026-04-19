import { Router, Request, Response } from "express";
import { z } from "zod";
import { storeCredential, resolveHandle } from "../../vault/index.js";
import { addToIndex, rebuildIndex } from "../../vault/registeredValues.js";
import { getDb } from "../../db/index.js";
import type { CredentialType } from "../../../../shared/src/types/credentials.js";

const router = Router();

const StoreCredentialBody = z.object({
  name: z.string().min(1),
  type: z.enum(["github", "openai"]),
  value: z.string().min(1),
  scopeCeiling: z.record(z.unknown()),
});

// POST /api/credentials — register a new credential
router.post("/", (req: Request, res: Response) => {
  const parsed = StoreCredentialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }

  const { name, type, value, scopeCeiling } = parsed.data;

  const result = storeCredential({
    value,
    service: type as CredentialType,
    label: name,
    scope_ceiling: scopeCeiling,
  });

  addToIndex(value);

  const resolved = resolveHandle(result.handle);

  res.status(201).json({
    handle: result.handle,
    id: result.id,
    type,
    scopeCeiling,
    createdAt: resolved?.created_at ?? new Date().toISOString(),
  });
});

// GET /api/credentials — list all credentials (encrypted_value redacted)
router.get("/", (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, service, label, created_at, updated_at FROM credentials")
    .all() as Array<{
    id: string;
    service: string;
    label: string;
    created_at: string;
    updated_at: string;
  }>;

  const credentials = rows.map((row) => ({
    id: row.id,
    handle: `cred_${row.id}`,
    type: row.service,
    label: row.label,
    encrypted_value: "[REDACTED]",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  res.json(credentials);
});

// DELETE /api/credentials/:id — remove a credential and rebuild index
router.delete("/:id", (req: Request, res: Response) => {
  const { id } = req.params;

  const db = getDb();
  const result = db.prepare("DELETE FROM credentials WHERE id = ?").run(id);

  if (result.changes === 0) {
    res.status(404).json({ error: "Credential not found" });
    return;
  }

  rebuildIndex();

  res.status(204).send();
});

export type credentialsRouter = typeof router;

export default router;
