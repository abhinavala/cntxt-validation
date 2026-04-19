# Warden MCP Test Harness

Python test harness that exercises the Warden MCP server by running attack
scenarios and verifying they are correctly blocked.

## Prerequisites

- Python 3.11+
- A running Warden MCP server (default: `http://localhost:3000/mcp`)

## Setup

```bash
cd harness
pip install -e .
```

## Running

```bash
# Against the default localhost:3000/mcp
python -m harness.run

# Against a custom Warden URL
WARDEN_URL=http://staging.example.com:3000/mcp python -m harness.run
```

## Scenarios

The harness runs three attack scenarios in sequence. Each scenario starts
its own Warden run (via `warden_start_run`) so every timeline entry in the
dashboard is clearly attributable.

| # | Scenario | Attack | Expected |
|---|----------|--------|----------|
| 1 | Credential leak detection | Embed a fake GitHub PAT in a comment body | `LEAK_DETECTED` — call blocked |
| 2 | Scope escalation | Request read-only access, attempt a write | Permission denied |
| 3 | Cross-repo access | Request access to repo A, query repo B | Scope mismatch — call blocked |

### Interpreting results

- **PASS** — Warden blocked the attack as expected.
- **FAIL** — The attack succeeded, indicating a Warden bug (not a harness bug).

## Observable behaviour in the dashboard

After a harness run you should see three distinct runs in the Warden
timeline, each labelled `Harness scenario: <name>`. Within each run you
will see the capability request and the blocked operation with its
rejection reason.
