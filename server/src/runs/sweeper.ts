import type { RunRow } from '../../../shared/src/types/db.js';
import type { LifecycleDeps } from './lifecycle.js';
import { endRun } from './lifecycle.js';

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const SWEEP_INTERVAL_MS = 60 * 1000; // 60 seconds

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Finds active runs older than WARDEN_RUN_TIMEOUT_MS and ends them
 * with status=timeout.
 */
export function sweep(deps: LifecycleDeps): number {
  const timeoutMs = parseInt(
    process.env.WARDEN_RUN_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS),
    10
  );
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();

  const allRuns = deps.runsRepo.findAll();
  const timedOut = allRuns.filter(
    (run: RunRow) => run.status === 'active' && run.started_at < cutoff
  );

  for (const run of timedOut) {
    endRun(deps, run.id, 'timeout');
  }

  return timedOut.length;
}

/**
 * Starts the background sweeper on a 60-second interval.
 * Returns a cleanup function (stopSweeper).
 */
export function startSweeper(deps: LifecycleDeps): void {
  if (intervalId !== null) return;
  intervalId = setInterval(() => sweep(deps), SWEEP_INTERVAL_MS);
}

/**
 * Stops the background sweeper.
 */
export function stopSweeper(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
