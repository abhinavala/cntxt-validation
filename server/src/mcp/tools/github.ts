import { randomUUID } from 'node:crypto';
import { registerTool } from '../registry.js';
import type { McpToolResult } from '../../../../shared/src/types/mcp.js';
import { WardenError } from '../../../../shared/src/types/mcp.js';
import { resolveHandle } from '../../vault/index.js';
import { getDb } from '../../db/index.js';
import {
  createPr,
  listIssues,
  createComment,
  getRepoContents,
} from '../../capabilities/github/ops.js';

// ---------------------------------------------------------------------------
// Local types — dependency tasks (GithubScope, validateGithubScope) are not
// yet merged. These definitions match the expected contract so downstream
// consumers can swap in the shared imports later without API changes.
// ---------------------------------------------------------------------------

type GithubPermission = 'read' | 'write' | 'admin';

interface GithubScope {
  repo: string;
  permissions: GithubPermission[];
}

const ErrorCode = {
  NO_ACTIVE_RUN: -32001,
  NO_CREDENTIAL: -32003,
  SCOPE_EXCEEDS_CEILING: -32004,
  INTERNAL_ERROR: -32000,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PERMISSIONS: ReadonlySet<string> = new Set(['read', 'write', 'admin']);

function isGithubScope(value: unknown): value is GithubScope {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.repo !== 'string') return false;
  if (!Array.isArray(obj.permissions)) return false;
  return obj.permissions.every(
    (p: unknown) => typeof p === 'string' && VALID_PERMISSIONS.has(p),
  );
}

function validateGithubScope(
  requested: GithubScope,
  ceiling: GithubScope,
): boolean {
  if (ceiling.repo !== '*' && requested.repo !== ceiling.repo) {
    return false;
  }
  const ceilingPerms = new Set(ceiling.permissions);
  return requested.permissions.every((p) => ceilingPerms.has(p));
}

function clampScope(
  requested: GithubScope,
  ceiling: GithubScope,
): GithubScope {
  const allowedPermissions = requested.permissions.filter((p) =>
    ceiling.permissions.includes(p),
  );
  return {
    repo: ceiling.repo === '*' ? requested.repo : ceiling.repo,
    permissions: allowedPermissions,
  };
}

const DEFAULT_TTL_SECONDS = 3600;
const MAX_TTL_SECONDS = 14400;

/**
 * Registers the warden.request_github_access MCP tool.
 */
export function registerGithubTools(): void {
  registerTool({
    name: 'warden.request_github_access',
    description:
      'Request scoped GitHub access for the current run. Returns a capability handle with granted scope and expiry.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: {
          type: 'string',
          description: 'The active run_id from warden_start_run',
        },
        scope: {
          type: 'object',
          description: 'The GitHub scope being requested',
          properties: {
            repo: {
              type: 'string',
              description:
                'Repository name (e.g. "owner/repo") or "*" for all',
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['read', 'write', 'admin'],
              },
              description: 'Requested permission levels',
            },
          },
          required: ['repo', 'permissions'],
        },
        justification: {
          type: 'string',
          description: 'Why this access is needed',
        },
        ttl_seconds: {
          type: 'number',
          description:
            'Optional TTL in seconds (defaults to 3600, max 14400)',
        },
      },
      required: ['run_id', 'scope', 'justification'],
    },
    handler: async (args: Record<string, unknown>): Promise<McpToolResult> => {
      const runId = args.run_id;
      if (typeof runId !== 'string' || runId.length === 0) {
        throw new WardenError(
          'run_id is required and must be a non-empty string',
          ErrorCode.NO_ACTIVE_RUN,
        );
      }

      const scope = args.scope;
      if (!isGithubScope(scope)) {
        throw new WardenError(
          'scope must be an object with repo (string) and permissions (array of "read"|"write"|"admin")',
          ErrorCode.INTERNAL_ERROR,
        );
      }

      const justification = args.justification;
      if (typeof justification !== 'string' || justification.length === 0) {
        throw new WardenError(
          'justification is required and must be a non-empty string',
          ErrorCode.INTERNAL_ERROR,
        );
      }

      const ttlSeconds = Math.min(
        args.ttl_seconds != null ? Number(args.ttl_seconds) : DEFAULT_TTL_SECONDS,
        MAX_TTL_SECONDS,
      );

      const db = getDb();

      // Verify run exists and is active
      const run = db
        .prepare('SELECT id, status FROM runs WHERE id = ?')
        .get(runId) as { id: string; status: string } | undefined;

      if (!run) {
        throw new WardenError(
          `No active run found for run_id: ${runId}`,
          ErrorCode.NO_ACTIVE_RUN,
        );
      }
      if (run.status !== 'active') {
        throw new WardenError(
          `Run ${runId} is not active (status: ${run.status})`,
          ErrorCode.NO_ACTIVE_RUN,
        );
      }

      // Find GitHub credential
      const credRow = db
        .prepare('SELECT id FROM credentials WHERE service = ? LIMIT 1')
        .get('github') as { id: string } | undefined;

      if (!credRow) {
        throw new WardenError(
          'No GitHub credential registered. Store a credential first.',
          ErrorCode.NO_CREDENTIAL,
        );
      }

      const credHandle = `cred_${credRow.id}`;
      const resolved = resolveHandle(credHandle);
      if (!resolved || !resolved.scope_ceiling) {
        throw new WardenError(
          'Could not resolve GitHub credential ceiling',
          ErrorCode.NO_CREDENTIAL,
        );
      }

      const ceiling = resolved.scope_ceiling as unknown as GithubScope;

      // Validate scope against ceiling — do NOT silently clamp
      if (!validateGithubScope(scope, ceiling)) {
        const suggestion = clampScope(scope, ceiling);
        const error = new WardenError(
          'Requested scope exceeds the credential ceiling. Retry with a narrower scope.',
          ErrorCode.SCOPE_EXCEEDS_CEILING,
        );
        throw Object.assign(error, { suggestion });
      }

      // Mint the capability
      const now = new Date();
      const capId = randomUUID();
      const handle = `cap_${capId}`;
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
      const grantedAt = now.toISOString();

      db.prepare(
        'INSERT INTO capabilities_granted (id, run_id, credential_id, scope, expires_at, granted_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(capId, runId, credRow.id, JSON.stringify(scope), expiresAt, grantedAt, null);

      // Emit capability_granted event
      const eventId = randomUUID();
      db.prepare(
        'INSERT INTO events (id, run_id, capability_id, event_type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(
        eventId,
        runId,
        capId,
        'capability_granted',
        JSON.stringify({
          capability_handle: handle,
          granted_scope: scope,
          justification,
          ttl_seconds: ttlSeconds,
        }),
        grantedAt,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              handle,
              granted_scope: scope,
              expires_at: expiresAt,
            }),
          },
        ],
      };
    },
  });

  // -------------------------------------------------------------------------
  // warden.github.create_pr
  // -------------------------------------------------------------------------
  registerTool({
    name: 'warden.github.create_pr',
    description:
      'Create a pull request on GitHub. Use the handle from request_github_access, not a raw token.',
    inputSchema: {
      type: 'object',
      properties: {
        handle: {
          type: 'string',
          description: 'Capability handle from warden.request_github_access',
        },
        repo: {
          type: 'string',
          description: 'Repository in "owner/repo" format',
        },
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR body/description' },
        base: { type: 'string', description: 'Base branch (e.g. "main")' },
        head: { type: 'string', description: 'Head branch with changes' },
      },
      required: ['handle', 'repo', 'title', 'body', 'base', 'head'],
    },
    handler: async (args: Record<string, unknown>): Promise<McpToolResult> => {
      const handle = args.handle as string;
      const result = await createPr(handle, {
        repo: args.repo as string,
        title: args.title as string,
        body: args.body as string,
        base: args.base as string,
        head: args.head as string,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  });

  // -------------------------------------------------------------------------
  // warden.github.list_issues
  // -------------------------------------------------------------------------
  registerTool({
    name: 'warden.github.list_issues',
    description:
      'List issues for a GitHub repository. Use the handle from request_github_access, not a raw token.',
    inputSchema: {
      type: 'object',
      properties: {
        handle: {
          type: 'string',
          description: 'Capability handle from warden.request_github_access',
        },
        repo: {
          type: 'string',
          description: 'Repository in "owner/repo" format',
        },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filter by issue state (defaults to "open")',
        },
      },
      required: ['handle', 'repo'],
    },
    handler: async (args: Record<string, unknown>): Promise<McpToolResult> => {
      const handle = args.handle as string;
      const result = await listIssues(handle, {
        repo: args.repo as string,
        state: args.state as 'open' | 'closed' | 'all' | undefined,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  });

  // -------------------------------------------------------------------------
  // warden.github.create_comment
  // -------------------------------------------------------------------------
  registerTool({
    name: 'warden.github.create_comment',
    description:
      'Create a comment on a GitHub issue or pull request. Use the handle from request_github_access, not a raw token.',
    inputSchema: {
      type: 'object',
      properties: {
        handle: {
          type: 'string',
          description: 'Capability handle from warden.request_github_access',
        },
        repo: {
          type: 'string',
          description: 'Repository in "owner/repo" format',
        },
        issue_number: {
          type: 'number',
          description: 'Issue or PR number to comment on',
        },
        body: { type: 'string', description: 'Comment body text' },
      },
      required: ['handle', 'repo', 'issue_number', 'body'],
    },
    handler: async (args: Record<string, unknown>): Promise<McpToolResult> => {
      const handle = args.handle as string;
      const result = await createComment(handle, {
        repo: args.repo as string,
        issue_number: args.issue_number as number,
        body: args.body as string,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  });

  // -------------------------------------------------------------------------
  // warden.github.get_repo_contents
  // -------------------------------------------------------------------------
  registerTool({
    name: 'warden.github.get_repo_contents',
    description:
      'Get the contents of a file or directory in a GitHub repository. Use the handle from request_github_access, not a raw token.',
    inputSchema: {
      type: 'object',
      properties: {
        handle: {
          type: 'string',
          description: 'Capability handle from warden.request_github_access',
        },
        repo: {
          type: 'string',
          description: 'Repository in "owner/repo" format',
        },
        path: {
          type: 'string',
          description: 'Path to file or directory within the repo',
        },
      },
      required: ['handle', 'repo', 'path'],
    },
    handler: async (args: Record<string, unknown>): Promise<McpToolResult> => {
      const handle = args.handle as string;
      const result = await getRepoContents(handle, {
        repo: args.repo as string,
        path: args.path as string,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  });
}

/** Type alias for the warden.request_github_access tool handler */
export type requestGithubAccessTool = (args: Record<string, unknown>) => Promise<McpToolResult>;

export type registerGithubTools = typeof registerGithubTools;
