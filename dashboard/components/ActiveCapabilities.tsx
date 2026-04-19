"use client";

import { FC, useCallback, useEffect, useState } from "react";
import { wardenApi } from "../lib/api";
import { useWardenEvents } from "../lib/ws";
import { RevokeButton } from "./RevokeButton";

interface Capability {
  id: string;
  type: string;
  granted_scope: string;
  ttl: number;
  granted_at: string;
  revoked?: boolean;
  expired?: boolean;
}

interface ActiveCapabilitiesProps {
  runId: string | null;
}

function formatTtl(ttlSeconds: number, grantedAt: string): string {
  const elapsed = (Date.now() - new Date(grantedAt).getTime()) / 1000;
  const remaining = Math.max(0, ttlSeconds - elapsed);

  if (remaining <= 0) return "Expired";

  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);

  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export const ActiveCapabilities: FC<ActiveCapabilitiesProps> = ({ runId }) => {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsEvents = useWardenEvents();

  const fetchCapabilities = useCallback(async (rid: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await wardenApi.fetchJson<Capability[]>(
        `/api/capabilities?runId=${encodeURIComponent(rid)}`
      );
      setCapabilities(data.filter((c) => !c.revoked && !c.expired));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load capabilities"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (runId) {
      fetchCapabilities(runId);
    } else {
      setCapabilities([]);
    }
  }, [runId, fetchCapabilities]);

  // Listen for capability_revoked WS events and remove from active list
  useEffect(() => {
    const revokedEvents = wsEvents.filter(
      (e) => e.type === "capability_revoked"
    );
    if (revokedEvents.length === 0) return;

    setCapabilities((prev) => {
      const revokedIds = new Set(
        revokedEvents
          .map((e) => {
            const payload = e.payload as Record<string, unknown> | undefined;
            return (payload?.capabilityId as string) ?? null;
          })
          .filter(Boolean)
      );
      return prev.filter((c) => !revokedIds.has(c.id));
    });
  }, [wsEvents]);

  const handleRevoked = (capabilityId: string) => {
    setCapabilities((prev) => prev.filter((c) => c.id !== capabilityId));
  };

  if (!runId) return null;

  return (
    <div className="rounded border border-gray-700 bg-gray-900 p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-200">
        Active Capabilities
      </h2>

      {error && (
        <div className="mb-3 rounded border border-red-800 bg-red-900/50 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-xs text-gray-400">Loading capabilities...</div>
      )}

      {!loading && capabilities.length === 0 && (
        <div className="text-xs text-gray-500">
          No active capabilities for this run.
        </div>
      )}

      {capabilities.length > 0 && (
        <div className="space-y-2">
          {capabilities.map((cap) => (
            <div
              key={cap.id}
              className="flex items-center justify-between rounded border border-gray-700 bg-gray-800 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded bg-blue-900 px-2 py-0.5 text-xs font-medium text-blue-300">
                  {cap.type}
                </span>
                <span className="text-xs text-gray-300">
                  {cap.granted_scope}
                </span>
                <span className="text-xs text-gray-500">
                  TTL: {formatTtl(cap.ttl, cap.granted_at)}
                </span>
              </div>
              <RevokeButton
                capabilityId={cap.id}
                onRevoked={handleRevoked}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActiveCapabilities;
