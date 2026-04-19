/**
 * GitHub Proxy Operations
 *
 * Each operation is wrapped in brokerCall which:
 * 1. Validates the capability handle (not expired, not revoked)
 * 2. Resolves the credential to get the raw token
 * 3. Executes the Octokit call inside the callback scope
 * 4. Sanitizes the response to redact any leaked credential values
 * 5. Emits a tool_called event with redactedArgs and duration
 *
 * The raw token NEVER leaves the brokerCall callback scope.
 */

import { randomUUID } from 'node:crypto';
import { getRawValue, resolveHandle } from '../../vault/index.js';
import { getDb } from '../../db/index.js';
import { sanitize } from '../../pipeline/sanitize.js';
import { WardenError } from '../../../../shared/src/types/mcp.js';
import type { CapabilityGrantedRow } from '../../../../shared/src/types/db.js';
import { createGithubClient } from './client.js';

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

const ErrorCode = {
  EXPIRED: -32010,
  REVOKED: -32011,
  INVALID_HANDLE: -32012,
  INTERNAL_ERROR: -32000,
} as const;

// ---------------------------------------------------------------------------
// brokerCall — the core pipeline
// ---------------------------------------------------------------------------

interface BrokerCallInput {
  handle: string;
  toolName: string;
  redactedArgs: Record<string, unknown>;
}

/**
 * Validates a capability handle, resolves the raw credential, executes the
 * callback with the raw token, sanitizes the result, and emits a tool_called event.
 *
 * The raw token exists ONLY inside the callback scope.
 */
async function brokerCall<T>(
  input: BrokerCallInput,
  callback: (rawToken: string) => Promise<T>,
): Promise<T> {
  const { handle, toolName, redactedArgs } = input;
  const startTime = Date.now();

  // Strip cap_ prefix to get the capability ID
  if (!handle.startsWith('cap_')) {
    throw new WardenError(`Invalid capability handle: ${handle}`, ErrorCode.INVALID_HANDLE);
  }
  const capId = handle.slice(4);

  const db = getDb();

  // Look up the capability
  const cap = db
    .prepare('SELECT * FROM capabilities_granted WHERE id = ?')
    .get(capId) as CapabilityGrantedRow | undefined;

  if (!cap) {
    throw new WardenError(`Unknown capability handle: ${handle}`, ErrorCode.INVALID_HANDLE);
  }

  // Check revoked
  if (cap.revoked_at !== null) {
    throw new WardenError(
      `Capability ${handle} has been revoked`,
      ErrorCode.REVOKED,
    );
  }

  // Check expired
  if (cap.expires_at && new Date(cap.expires_at) < new Date()) {
    throw new WardenError(
      `Capability ${handle} has expired`,
      ErrorCode.EXPIRED,
    );
  }

  // Resolve credential handle to get the raw token
  const credHandle = `cred_${cap.credential_id}`;
  const rawToken = getRawValue(credHandle);

  // Execute the callback — raw token scoped to this closure only
  let result: T;
  try {
    result = await callback(rawToken);
  } catch (err) {
    // Re-throw WardenErrors, wrap others
    if (err instanceof WardenError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new WardenError(`GitHub API error: ${message}`, ErrorCode.INTERNAL_ERROR);
  }

  // Sanitize the result to redact any leaked credential values
  const sanitized = sanitize(result);

  const durationMs = Date.now() - startTime;

  // Emit tool_called event
  const eventId = randomUUID();
  db.prepare(
    'INSERT INTO events (id, run_id, capability_id, event_type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    eventId,
    cap.run_id,
    cap.id,
    'tool_called',
    JSON.stringify({ toolName, redactedArgs, duration_ms: durationMs }),
    new Date().toISOString(),
  );

  return sanitized;
}

// ---------------------------------------------------------------------------
// GitHub Operations
// ---------------------------------------------------------------------------

export interface CreatePrArgs {
  repo: string;
  title: string;
  body: string;
  base: string;
  head: string;
}

export async function createPr(
  handle: string,
  args: CreatePrArgs,
): Promise<Record<string, unknown>> {
  const [owner, repo] = args.repo.split('/');
  return brokerCall(
    {
      handle,
      toolName: 'warden.github.create_pr',
      redactedArgs: { repo: args.repo, title: args.title, base: args.base, head: args.head },
    },
    async (rawToken) => {
      const client = createGithubClient(rawToken);
      const response = await client.rest.pulls.create({
        owner,
        repo,
        title: args.title,
        body: args.body,
        base: args.base,
        head: args.head,
      });
      return response.data as unknown as Record<string, unknown>;
    },
  );
}

export interface ListIssuesArgs {
  repo: string;
  state?: 'open' | 'closed' | 'all';
}

export async function listIssues(
  handle: string,
  args: ListIssuesArgs,
): Promise<Record<string, unknown>[]> {
  const [owner, repo] = args.repo.split('/');
  return brokerCall(
    {
      handle,
      toolName: 'warden.github.list_issues',
      redactedArgs: { repo: args.repo, state: args.state ?? 'open' },
    },
    async (rawToken) => {
      const client = createGithubClient(rawToken);
      const response = await client.rest.issues.listForRepo({
        owner,
        repo,
        state: args.state ?? 'open',
      });
      return response.data as unknown as Record<string, unknown>[];
    },
  );
}

export interface CreateCommentArgs {
  repo: string;
  issue_number: number;
  body: string;
}

export async function createComment(
  handle: string,
  args: CreateCommentArgs,
): Promise<Record<string, unknown>> {
  const [owner, repo] = args.repo.split('/');
  return brokerCall(
    {
      handle,
      toolName: 'warden.github.create_comment',
      redactedArgs: { repo: args.repo, issue_number: args.issue_number },
    },
    async (rawToken) => {
      const client = createGithubClient(rawToken);
      const response = await client.rest.issues.createComment({
        owner,
        repo,
        issue_number: args.issue_number,
        body: args.body,
      });
      return response.data as unknown as Record<string, unknown>;
    },
  );
}

export interface GetRepoContentsArgs {
  repo: string;
  path: string;
}

export async function getRepoContents(
  handle: string,
  args: GetRepoContentsArgs,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const [owner, repo] = args.repo.split('/');
  return brokerCall(
    {
      handle,
      toolName: 'warden.github.get_repo_contents',
      redactedArgs: { repo: args.repo, path: args.path },
    },
    async (rawToken) => {
      const client = createGithubClient(rawToken);
      const response = await client.rest.repos.getContent({
        owner,
        repo,
        path: args.path,
      });
      return response.data as unknown as Record<string, unknown> | Record<string, unknown>[];
    },
  );
}

export { brokerCall };
export type { BrokerCallInput };
