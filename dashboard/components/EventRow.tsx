"use client";

import { FC, useState } from "react";

interface WardenEvent {
  type: string;
  toolCalled?: string | null;
  outcome?: "success" | "denied" | "error" | null;
  durationMs?: number | null;
  capabilityHandle?: string | null;
  redactedArgs?: Record<string, unknown> | null;
  reasoningExcerpt?: string | null;
  timestamp: string;
}

interface EventRowProps {
  event: WardenEvent;
}

const EVENT_COLORS: Record<string, string> = {
  capability_granted: "bg-green-900 text-green-300 border-green-700",
  tool_called: "bg-gray-800 text-gray-300 border-gray-600",
  success: "bg-gray-800 text-gray-300 border-gray-600",
  leak_detected: "bg-red-900 text-red-300 border-red-700",
  capability_revoked: "bg-yellow-900 text-yellow-300 border-yellow-700",
  run_ended: "bg-gray-800 text-gray-500 border-gray-700",
};

const BADGE_COLORS: Record<string, string> = {
  capability_granted: "bg-green-700 text-green-100",
  tool_called: "bg-gray-700 text-gray-200",
  success: "bg-gray-700 text-gray-200",
  leak_detected: "bg-red-700 text-red-100",
  capability_revoked: "bg-yellow-700 text-yellow-100",
  run_ended: "bg-gray-700 text-gray-400",
};

const OUTCOME_BADGES: Record<string, string> = {
  success: "bg-green-700 text-green-100",
  denied: "bg-red-700 text-red-100",
  error: "bg-red-800 text-red-200",
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const EventRow: FC<EventRowProps> = ({ event }) => {
  const [expanded, setExpanded] = useState(false);

  const rowColor =
    EVENT_COLORS[event.type] ?? "bg-gray-800 text-gray-300 border-gray-600";
  const badgeColor =
    BADGE_COLORS[event.type] ?? "bg-gray-700 text-gray-200";

  return (
    <div
      className={`rounded border ${rowColor} transition-colors`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm"
      >
        <span className="shrink-0 font-mono text-xs text-gray-400">
          {formatTimestamp(event.timestamp)}
        </span>

        <span
          className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-medium ${badgeColor}`}
        >
          {event.type}
        </span>

        {event.toolCalled && (
          <span className="truncate text-gray-300">
            {event.toolCalled}
          </span>
        )}

        {event.outcome && (
          <span
            className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-medium ${OUTCOME_BADGES[event.outcome] ?? "bg-gray-700 text-gray-200"}`}
          >
            {event.outcome}
          </span>
        )}

        {event.durationMs != null && (
          <span className="shrink-0 text-xs text-gray-500">
            {event.durationMs}ms
          </span>
        )}

        {event.capabilityHandle && (
          <span className="shrink-0 truncate text-xs text-gray-500">
            {event.capabilityHandle}
          </span>
        )}

        <span className="ml-auto shrink-0 text-xs text-gray-500">
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 px-4 py-3 space-y-3">
          {event.redactedArgs && (
            <div>
              <div className="mb-1 text-xs font-medium text-gray-400">
                Arguments
              </div>
              <pre className="overflow-x-auto rounded bg-gray-950 p-3 text-xs text-gray-300">
                {JSON.stringify(event.redactedArgs, null, 2)}
              </pre>
            </div>
          )}
          {event.reasoningExcerpt && (
            <div>
              <div className="mb-1 text-xs font-medium text-gray-400">
                Reasoning
              </div>
              <p className="text-sm text-gray-300 italic">
                {event.reasoningExcerpt}
              </p>
            </div>
          )}
          {!event.redactedArgs && !event.reasoningExcerpt && (
            <p className="text-xs text-gray-500">
              No additional details available.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default EventRow;
