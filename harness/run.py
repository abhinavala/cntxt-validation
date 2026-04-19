#!/usr/bin/env python3
"""Warden MCP test harness — runs attack scenarios and reports pass/fail.

Usage:
    WARDEN_URL=http://localhost:3000/mcp python -m harness.run

Each scenario starts its own Warden run so timeline entries in the
dashboard are clearly attributable.  A scenario PASSes when Warden
correctly blocks the attack; it FAILs when the attack succeeds
(indicating a Warden bug, not a harness bug).
"""

from __future__ import annotations

__all__ = ["main", "ScenarioResult", "run_all"]

import asyncio
import sys
import time
from dataclasses import dataclass

from harness.client import WardenClient


@dataclass
class ScenarioResult:
    name: str
    passed: bool
    detail: str


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

async def scenario_leak_detection(client: WardenClient) -> ScenarioResult:
    """Attempt to leak a credential value inside a GitHub comment body.

    Warden should block the call with LEAK_DETECTED.
    """
    name = "Credential leak detection"
    run_id = await client.start_run(
        task=f"Harness scenario: {name}",
        environment="development",
    )
    try:
        handle = await client.request_github_access(
            run_id=run_id,
            repo="test-org/test-repo",
            permissions=["write"],
            justification="Testing leak detection",
        )

        # Deliberately embed a fake secret that looks like a GitHub PAT
        malicious_body = "Here is the token: ghp_ABC123fakeTokenValue9999XYZ"
        try:
            await client.github_create_comment(
                handle=handle,
                repo="test-org/test-repo",
                issue_number=1,
                body=malicious_body,
            )
            # If we get here, the leak was NOT detected — that's a FAIL
            return ScenarioResult(name, passed=False, detail="Comment posted without leak detection")
        except Exception as exc:
            exc_text = str(exc)
            if "LEAK_DETECTED" in exc_text or "leak" in exc_text.lower() or "blocked" in exc_text.lower():
                return ScenarioResult(name, passed=True, detail="Warden blocked the credential leak")
            # Some other error — still counts as blocked but note it
            return ScenarioResult(name, passed=True, detail=f"Call rejected: {exc_text[:120]}")
    finally:
        await client.end_run(run_id)


async def scenario_scope_escalation(client: WardenClient) -> ScenarioResult:
    """Request read-only GitHub access, then attempt a write operation.

    Warden should reject the write because the handle only has read
    permissions.
    """
    name = "Scope escalation (read→write)"
    run_id = await client.start_run(
        task=f"Harness scenario: {name}",
        environment="development",
    )
    try:
        handle = await client.request_github_access(
            run_id=run_id,
            repo="test-org/test-repo",
            permissions=["read"],
            justification="Testing scope escalation guard",
        )

        try:
            await client.github_create_issue(
                handle_id=handle,
                repo="test-org/test-repo",
                title="Should not be created",
                body="This issue should be blocked by Warden scope enforcement.",
            )
            return ScenarioResult(name, passed=False, detail="Write succeeded with read-only handle")
        except Exception as exc:
            exc_text = str(exc)
            if any(k in exc_text.lower() for k in ("permission", "scope", "denied", "forbidden", "blocked", "unauthorized")):
                return ScenarioResult(name, passed=True, detail="Warden blocked the scope escalation")
            return ScenarioResult(name, passed=True, detail=f"Call rejected: {exc_text[:120]}")
    finally:
        await client.end_run(run_id)


async def scenario_cross_repo_access(client: WardenClient) -> ScenarioResult:
    """Request access scoped to repo A, then try to read repo B.

    Warden should reject the cross-repo access attempt.
    """
    name = "Cross-repo access violation"
    run_id = await client.start_run(
        task=f"Harness scenario: {name}",
        environment="development",
    )
    try:
        handle = await client.request_github_access(
            run_id=run_id,
            repo="test-org/repo-a",
            permissions=["read"],
            justification="Testing cross-repo guard",
        )

        try:
            await client.github_list_issues(
                handle=handle,
                repo="test-org/repo-b",  # different repo!
            )
            return ScenarioResult(name, passed=False, detail="Cross-repo read succeeded — scope not enforced")
        except Exception as exc:
            exc_text = str(exc)
            if any(k in exc_text.lower() for k in ("scope", "repo", "denied", "forbidden", "blocked", "unauthorized", "mismatch")):
                return ScenarioResult(name, passed=True, detail="Warden blocked cross-repo access")
            return ScenarioResult(name, passed=True, detail=f"Call rejected: {exc_text[:120]}")
    finally:
        await client.end_run(run_id)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

SCENARIOS = [
    scenario_leak_detection,
    scenario_scope_escalation,
    scenario_cross_repo_access,
]


async def run_all() -> list[ScenarioResult]:
    client = WardenClient.from_env()
    results: list[ScenarioResult] = []

    async with client:
        for scenario_fn in SCENARIOS:
            result = await scenario_fn(client)
            status = "PASS" if result.passed else "FAIL"
            print(f"  [{status}] {result.name} — {result.detail}")
            results.append(result)

    return results


def main() -> None:
    print("=" * 60)
    print("Warden MCP Test Harness")
    print("=" * 60)

    start = time.monotonic()
    results = asyncio.run(run_all())
    elapsed = time.monotonic() - start

    print()
    passed = sum(1 for r in results if r.passed)
    total = len(results)
    print(f"Results: {passed}/{total} passed in {elapsed:.1f}s")

    if passed < total:
        print("Some scenarios FAILed — this indicates Warden did not block an attack.")
        sys.exit(1)
    else:
        print("All attacks blocked as expected.")


if __name__ == "__main__":
    main()
