"use client";

import { FC, useCallback, useEffect, useState } from "react";
import { useWardenEvents, useWsStore } from "../../lib/ws";
import { wardenApi } from "../../lib/api";
import { EventRow } from "../../components/EventRow";
import { RunSelector } from "../../components/RunSelector";

interface WardenEvent {
  type: string;
  toolCalled?: string | null;
  outcome?: "success" | "denied" | "error" | null;
  durationMs?: number | null;
  capabilityHandle?: string | null;
  redactedArgs?: Record<string, unknown> | null;
  reasoningExcerpt?: string | null;
  timestamp: string;
  payload?: unknown;
  runId?: string;
}

function useWardenWsConnection() {
  const { addEvent, setConnected } = useWsStore();

  useEffect(() => {
    const wsUrl =
      process.env.NEXT_PUBLIC_WARDEN_WS_URL ?? "ws://localhost:3000/ws";
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as WardenEvent;
        addEvent(event);
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, [addEvent, setConnected]);
}

export type TimelinePage = FC;

const TimelinePage: FC = () => {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [historicalEvents, setHistoricalEvents] = useState<WardenEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = useWsStore((s) => s.connected);
  const liveEvents = useWardenEvents() as WardenEvent[];

  useWardenWsConnection();

  const fetchEvents = useCallback(async (runId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await wardenApi.fetchJson<WardenEvent[]>(
        `/api/events?runId=${encodeURIComponent(runId)}&limit=50`
      );
      setHistoricalEvents(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load events"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      fetchEvents(selectedRunId);
    }
  }, [selectedRunId, fetchEvents]);

  const handleRunSelect = useCallback((runId: string) => {
    setSelectedRunId(runId);
    setHistoricalEvents([]);
  }, []);

  // Merge live WS events (for selected run) with historical, newest first
  const liveForRun = selectedRunId
    ? liveEvents.filter(
        (e) => !("runId" in e) || e.runId === selectedRunId
      )
    : [];

  const allEvents = [...liveForRun.slice().reverse(), ...historicalEvents];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Timeline</h1>
        <div className="flex items-center gap-3">
          {!connected && (
            <span className="inline-flex items-center rounded bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-300">
              Disconnected
            </span>
          )}
          {connected && (
            <span className="inline-flex items-center rounded bg-green-900 px-2 py-1 text-xs font-medium text-green-300">
              Live
            </span>
          )}
          <RunSelector
            selectedRunId={selectedRunId}
            onSelect={handleRunSelect}
          />
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-900/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-gray-400">Loading events...</div>
      )}

      {!loading && allEvents.length === 0 && selectedRunId && (
        <div className="text-sm text-gray-400">
          No events yet for this run.
        </div>
      )}

      <div className="space-y-2">
        {allEvents.map((event, idx) => (
          <EventRow key={`${event.timestamp}-${idx}`} event={event} />
        ))}
      </div>
    </div>
  );
};

export default TimelinePage;
