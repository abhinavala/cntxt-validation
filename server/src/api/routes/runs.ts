import { Router, Request, Response } from "express";

const router = Router();

interface Run {
  id: string;
  agentId: string;
  status: "active" | "completed" | "failed";
  startedAt: string;
  endedAt: string | null;
}

// In-memory store for demo; replace with DB in production
const runs: Run[] = [];

export function addRun(run: Run): void {
  runs.push(run);
}

export function getRuns(): Run[] {
  return runs;
}

// GET /api/runs — list recent runs (active first, then by startedAt desc)
router.get("/", (_req: Request, res: Response) => {
  const sorted = [...runs].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  res.json(sorted);
});

export default router;
