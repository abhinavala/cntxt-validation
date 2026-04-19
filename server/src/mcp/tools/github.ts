import { registerTool } from '../registry.js';
import { mintCapability } from '../../capabilities/grant.js';
import {
  validateGithubScope,
  type ValidationResult,
} from '../../capabilities/github/scope.js';
import type { GithubScope } from '../../../../shared/src/types/github.js';
import type { McpToolResult } from '../../../../shared/src/types/mcp.js';
import { WardenError, ErrorCode } from '../../../../shared/src/errors.js';
import { resolveHandle } from '../../vault/index.js';
import { getDb } from '../../db/index.js';

function isGithubScope(value: unknown): value is GithubScope {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.repo !== 'string') return false;
  if (!Array.isArray(obj.permissions)) return false;
  const valid = ['read', 'write', 'admin'];
  return obj.permissions.every(
    (p: unknown) => typeof p === 'string' && valid.includes(p),
  );
}

/**
 * Computes a clamped scope suggestion by intersecting the requested
 * permissions with the ceiling permissions.
 */
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
          ErrorCode.NO_ACTIVE_RUN,
          'run_id is required and must be a non-empty string',
        );
      }

      const scope = args.scope;
      if (!isGithubScope(scope)) {
        throw new WardenError(
          ErrorCode.INTERNAL_ERROR,
          'scope must be an object with repo (string) and permissions (array of "read"|"write"|"admin")',
        );
      }

      const justification = args.justification;
      if (typeof justification !== 'string' || justification.length === 0) {
        throw new WardenError(
          ErrorCode.INTERNAL_ERROR,
          'justification is required and must be a non-empty string',
        );
      }

      const ttlSeconds =
        args.ttl_seconds != null ? Number(args.ttl_seconds) : undefined;

      try {
        const capability = mintCapability({
          runId,
          type: 'github',
          scopeRequested: scope,
          justification,
          ttlSeconds,
          ceilingValidator: (
            requested: Record<string, unknown>,
            ceiling: Record<string, unknown>,
          ): boolean => {
            const result: ValidationResult = validateGithubScope(
              requested as GithubScope,
              ceiling as GithubScope,
            );
            return result.ok;
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                handle: capability.handle,
                granted_scope: capability.scopeGranted,
                expires_at: capability.ttlExpiresAt,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        if (err instanceof WardenError) {
          if (err.code === ErrorCode.SCOPE_EXCEEDS_CEILING) {
            // Re-throw with suggestion of clamped scope
            const suggestion = computeScopeSuggestion(scope);
            const error = new WardenError(
              ErrorCode.SCOPE_EXCEEDS_CEILING,
              err.message,
            );
            throw Object.assign(error, { suggestion });
          }
          throw err;
        }
        throw err;
      }
    },
  });
}

/**
 * Computes a scope suggestion by loading the credential ceiling and
 * intersecting with the requested scope. Falls back to a hint when
 * the credential cannot be resolved.
 */
function computeScopeSuggestion(
  requested: GithubScope,
): GithubScope | { hint: string } {
  try {
    const db = getDb();
    const credRow = db
      .prepare('SELECT id FROM credentials WHERE service = ? LIMIT 1')
      .get('github') as { id: string } | undefined;

    if (!credRow) {
      return { hint: 'No github credential registered to compute suggestion' };
    }

    const resolved = resolveHandle(`cred_${credRow.id}`);
    if (!resolved || !resolved.scope_ceiling) {
      return { hint: 'Could not resolve credential ceiling' };
    }

    return clampScope(requested, resolved.scope_ceiling as GithubScope);
  } catch {
    return { hint: 'Retry with a narrower scope' };
  }
}

/** Type alias for the warden.request_github_access tool handler */
export type requestGithubAccessTool = (args: Record<string, unknown>) => Promise<McpToolResult>;

export type registerGithubTools = typeof registerGithubTools;
