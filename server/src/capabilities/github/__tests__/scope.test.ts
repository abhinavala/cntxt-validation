import { validateGithubScope, GITHUB_CEILING_DEFAULT } from '../scope';
import { GithubScope } from '../../../../../shared/src/types/github';

describe('validateGithubScope', () => {
  const testCases: {
    name: string;
    requested: GithubScope;
    ceiling: GithubScope;
    expectedOk: boolean;
    expectedReasonContains?: string;
  }[] = [
    {
      name: 'allows read when ceiling has read+write with wildcard repo',
      requested: { repo: 'abhi/x', permissions: ['read'] },
      ceiling: { repo: '*', permissions: ['read', 'write'] },
      expectedOk: true,
    },
    {
      name: 'allows exact repo match with matching permissions',
      requested: { repo: 'abhi/foo', permissions: ['read'] },
      ceiling: { repo: 'abhi/foo', permissions: ['read', 'write'] },
      expectedOk: true,
    },
    {
      name: 'rejects permission escalation (admin not in ceiling)',
      requested: { repo: 'abhi/x', permissions: ['admin'] },
      ceiling: { repo: '*', permissions: ['read', 'write'] },
      expectedOk: false,
      expectedReasonContains: 'admin',
    },
    {
      name: 'rejects repo mismatch with non-wildcard ceiling',
      requested: { repo: 'abhi/foo', permissions: ['read'] },
      ceiling: { repo: 'abhi/bar', permissions: ['read', 'write'] },
      expectedOk: false,
      expectedReasonContains: 'abhi/foo',
    },
    {
      name: 'wildcard ceiling repo matches any requested repo',
      requested: { repo: 'org/any-repo', permissions: ['write'] },
      ceiling: { repo: '*', permissions: ['read', 'write', 'admin'] },
      expectedOk: true,
    },
    {
      name: 'rejects multiple disallowed permissions',
      requested: { repo: 'abhi/x', permissions: ['write', 'admin'] },
      ceiling: { repo: '*', permissions: ['read'] },
      expectedOk: false,
      expectedReasonContains: 'write',
    },
    {
      name: 'allows exact match of all permissions',
      requested: { repo: 'abhi/x', permissions: ['read', 'write', 'admin'] },
      ceiling: { repo: '*', permissions: ['read', 'write', 'admin'] },
      expectedOk: true,
    },
    {
      name: 'rejects when both repo and permissions mismatch (repo checked first)',
      requested: { repo: 'abhi/foo', permissions: ['admin'] },
      ceiling: { repo: 'abhi/bar', permissions: ['read'] },
      expectedOk: false,
      expectedReasonContains: 'repo',
    },
  ];

  test.each(testCases)(
    '$name',
    ({ requested, ceiling, expectedOk, expectedReasonContains }) => {
      const result = validateGithubScope(requested, ceiling);
      expect(result.ok).toBe(expectedOk);
      if (!expectedOk && expectedReasonContains) {
        expect(result.reason).toBeDefined();
        expect(result.reason).toContain(expectedReasonContains);
      }
      if (expectedOk) {
        expect(result.reason).toBeUndefined();
      }
    }
  );
});

describe('GITHUB_CEILING_DEFAULT', () => {
  it('has wildcard repo and read+write permissions', () => {
    expect(GITHUB_CEILING_DEFAULT.repo).toBe('*');
    expect(GITHUB_CEILING_DEFAULT.permissions).toEqual(['read', 'write']);
  });
});
