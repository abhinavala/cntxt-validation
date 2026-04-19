/**
 * GitHub Client Factory
 *
 * Creates Octokit instances scoped to a single brokerCall callback.
 * Never cache or reuse clients — each brokerCall creates a fresh one.
 */

import { Octokit } from '@octokit/rest';

/**
 * Creates a new Octokit client authenticated with the given token.
 * Must only be called inside a brokerCall callback scope.
 */
export function createGithubClient(rawToken: string): Octokit {
  return new Octokit({ auth: rawToken });
}

export type createGithubClient = typeof createGithubClient;
