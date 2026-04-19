"""Scenario 1 — Raw dump attack.

A compromised agent attempts to enumerate credentials visible in its own
context by calling ``warden_list_my_capabilities`` and inspecting every
field in the response.  It also probes by requesting repo contents and
scanning the response bodies.

The scenario **passes** when no returned payload contains a string that
matches a plausible credential shape.  A match means Warden leaked a raw
secret — that is a Warden bug.
"""

from __future__ import annotations

__all__ = ["run_scenario"]

import json
import re
from typing import Any

from harness.client import WardenClient
from harness.run import ScenarioResult

# Credential patterns that must NEVER appear in any Warden response.
_CREDENTIAL_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("GitHub PAT", re.compile(r"ghp_[A-Za-z0-9]{36,}")),
    ("OpenAI key", re.compile(r"sk-[A-Za-z0-9]{40,}")),
]


def _scan_for_credentials(value: Any, path: str = "$") -> list[str]:
    """Recursively walk *value* and return descriptions of any credential matches."""
    findings: list[str] = []

    if isinstance(value, str):
        for label, pattern in _CREDENTIAL_PATTERNS:
            match = pattern.search(value)
            if match:
                findings.append(f"{label} found at {path}: {match.group()[:12]}...")
    elif isinstance(value, dict):
        for k, v in value.items():
            findings.extend(_scan_for_credentials(v, f"{path}.{k}"))
    elif isinstance(value, (list, tuple)):
        for i, item in enumerate(value):
            findings.extend(_scan_for_credentials(item, f"{path}[{i}]"))

    return findings


def _extract_all_text(result: Any) -> list[str]:
    """Pull every text block from an MCP CallToolResult."""
    texts: list[str] = []
    for block in getattr(result, "content", []):
        text = getattr(block, "text", None)
        if text is not None:
            texts.append(text)
    return texts


def _scan_mcp_result(result: Any, context: str) -> list[str]:
    """Scan an MCP result for credential leaks, returning findings."""
    findings: list[str] = []
    for text in _extract_all_text(result):
        # Try structured JSON first
        try:
            data = json.loads(text)
            findings.extend(_scan_for_credentials(data, context))
        except (json.JSONDecodeError, TypeError):
            pass
        # Also scan the raw text
        findings.extend(_scan_for_credentials(text, f"{context}(raw)"))
    return findings


async def run_scenario(client: WardenClient) -> ScenarioResult:
    """Run the raw-dump attack scenario."""
    name = "Raw dump attack"
    all_findings: list[str] = []

    run_id = await client.start_run(
        task=f"Harness scenario: {name}",
        environment="development",
    )
    try:
        # 1. Request GitHub access so we have an active capability
        handle = await client.request_github_access(
            run_id=run_id,
            repo="test-org/test-repo",
            permissions=["read"],
            justification="Probing for raw credential exposure",
        )

        # 2. Call list_my_capabilities — the primary attack vector.
        #    A secure Warden returns opaque handles, never raw tokens.
        caps_result = await client._call(
            "warden_list_my_capabilities", {"run_id": run_id}
        )
        all_findings.extend(_scan_mcp_result(caps_result, "list_my_capabilities"))

        # 3. Probe by listing issues — check response for leaked tokens
        try:
            issues_result = await client.github_list_issues(
                handle=handle,
                repo="test-org/test-repo",
                state="open",
            )
            all_findings.extend(_scan_mcp_result(issues_result, "github_list_issues"))
        except Exception:
            # The call itself failing is fine — we only care about leaks
            pass

        # 4. Verdict
        if all_findings:
            detail = (
                f"RAW CREDENTIALS LEAKED ({len(all_findings)} finding(s)): "
                + "; ".join(all_findings)
            )
            return ScenarioResult(name, passed=False, detail=detail)

        return ScenarioResult(
            name,
            passed=True,
            detail="No raw credential values found in any response",
        )

    finally:
        await client.end_run(run_id)
