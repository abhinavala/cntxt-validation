"use client";

import { FC, useCallback, useEffect, useState } from "react";
import { wardenApi } from "../lib/api";

interface Run {
  id: string;
  agentId: string;
  status: "active" | "completed" | "failed";
  startedAt: string;
  endedAt: string | null;
}

interface RunSelectorProps {
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}

export const RunSelector: FC<RunSelectorProps> = ({
  selectedRunId,
  onSelect,
}) => {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await wardenApi.fetchJson<Run[]>("/api/runs");
      setRuns(data);
      if (data.length > 0 && !selectedRunId) {
        onSelect(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [selectedRunId, onSelect]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  if (loading) {
    return (
      <div className="text-sm text-gray-400">Loading runs...</div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-400">{error}</div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-sm text-gray-400">No runs available</div>
    );
  }

  return (
    <select
      value={selectedRunId ?? ""}
      onChange={(e) => onSelect(e.target.value)}
      className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
    >
      {runs.map((run) => (
        <option key={run.id} value={run.id}>
          {run.id.slice(0, 8)} — {run.status}{" "}
          {run.status === "active" ? "(live)" : ""}
        </option>
      ))}
    </select>
  );
};

export default RunSelector;
