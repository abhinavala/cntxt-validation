export type GithubPermission = 'read' | 'write' | 'admin';

export interface GithubScope {
  repo: string;
  permissions: GithubPermission[];
}
