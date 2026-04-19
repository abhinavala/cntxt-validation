import { Router, Request, Response } from "express";

const router = Router();

interface WardenEvent {
  id: string;
  runId: string;
  type: string;
  toolCalled: string | null;
  outcome: "success" | "denied" | "error" | null;
  durationMs: number | null;
  capabilityHandle: string | null;
  redactedArgs: Record<string, unknown> | null;
  reasoningExcerpt: string | null;
  timestamp: string;
}

// In-memory store for demo; replace with DB in production
const events: WardenEvent[] = [];

export function addEvent(event: WardenEvent): void {
  events.push(event);
}

export function getEvents(): WardenEvent[] {
  return events;
}

// GET /api/events?runId=<id>&limit=<n>
router.get("/", (req: Request, res: Response) => {
  const { runId, limit } = req.query;

  if (!runId || typeof runId !== "string") {
    res.status(400).json({ error: "runId query parameter is required" });
    return;
  }

  const maxResults = limit ? parseInt(limit as string, 10) : 50;
  const filtered = events
    .filter((e) => e.runId === runId)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, maxResults);

  res.json(filtered);
});

export type eventsRouter = typeof router;

export default router;
