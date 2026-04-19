import { GithubScope } from '../../../../shared/src/types/github';

export { GithubScope } from '../../../../shared/src/types/github';

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export const GITHUB_CEILING_DEFAULT: GithubScope = {
  repo: '*',
  permissions: ['read', 'write'],
};

export function validateGithubScope(
  requested: GithubScope,
  ceiling: GithubScope
): ValidationResult {
  // Check repo match: ceiling must be wildcard or exact match
  if (ceiling.repo !== '*' && ceiling.repo !== requested.repo) {
    return {
      ok: false,
      reason: `requested repo '${requested.repo}' does not match ceiling repo '${ceiling.repo}'`,
    };
  }

  // Check permission escalation: every requested permission must be in ceiling
  const disallowed = requested.permissions.filter(
    (p) => !ceiling.permissions.includes(p)
  );

  if (disallowed.length > 0) {
    return {
      ok: false,
      reason: `requested permission ${disallowed.join(', ')} exceeds ceiling [${ceiling.permissions.join(', ')}]`,
    };
  }

  return { ok: true };
}
