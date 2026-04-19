"use client";

import { FC, useCallback, useEffect, useState } from "react";
import { wardenApi } from "../lib/api";

interface Credential {
  id: string;
  name: string;
  type: string;
  handle: string;
  created_at: string;
}

interface CredentialListProps {
  refreshKey: number;
}

export const CredentialList: FC<CredentialListProps> = ({ refreshKey }) => {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await wardenApi.fetchJson<Credential[]>("/api/credentials");
      setCredentials(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load credentials"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials, refreshKey]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await wardenApi.fetchJson(`/api/credentials/${id}`, {
        method: "DELETE",
      });
      await fetchCredentials();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete credential"
      );
    } finally {
      setDeletingId(null);
    }
  }

  function truncateHandle(handle: string): string {
    if (handle.length <= 12) return handle;
    return `${handle.slice(0, 8)}…${handle.slice(-4)}`;
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-white">
        Registered Credentials
      </h2>

      {error && (
        <div className="mb-4 rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : credentials.length === 0 ? (
        <p className="text-sm text-gray-500">No credentials registered yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium">Handle</th>
                <th className="pb-2 pr-4 font-medium">Created</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((cred) => (
                <tr
                  key={cred.id}
                  className="border-b border-gray-800 last:border-0"
                >
                  <td className="py-2 pr-4 text-gray-100">{cred.name}</td>
                  <td className="py-2 pr-4">
                    <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                      {cred.type}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-400">
                    {truncateHandle(cred.handle)}
                  </td>
                  <td className="py-2 pr-4 text-gray-400">
                    {new Date(cred.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => handleDelete(cred.id)}
                      disabled={deletingId === cred.id}
                      className="rounded border border-red-800 px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 disabled:opacity-50"
                    >
                      {deletingId === cred.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CredentialList;
