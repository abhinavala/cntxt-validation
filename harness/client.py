"""WardenClient — Pythonic wrapper around the Warden MCP server."""

from __future__ import annotations

__all__ = ["WardenClient"]

import os
from dataclasses import dataclass
from typing import Any

from mcp import ClientSession
from mcp.client.sse import sse_client


DEFAULT_WARDEN_URL = "http://localhost:3000/mcp"


@dataclass
class WardenClient:
    """Thin, Pythonic façade over the Warden MCP tool surface."""

    url: str
    _session: ClientSession | None = None
    _read: Any = None
    _write: Any = None
    _sse_cm: Any = None
    _session_cm: Any = None

    @classmethod
    def from_env(cls) -> "WardenClient":
        return cls(url=os.environ.get("WARDEN_URL", DEFAULT_WARDEN_URL))

    # -- lifecycle --------------------------------------------------------

    async def connect(self) -> None:
        """Open the SSE transport and initialise the MCP session."""
        self._sse_cm = sse_client(self.url)
        self._read, self._write = await self._sse_cm.__aenter__()
        self._session_cm = ClientSession(self._read, self._write)
        self._session = await self._session_cm.__aenter__()
        await self._session.initialize()

    async def close(self) -> None:
        """Tear down session and transport."""
        if self._session_cm:
            await self._session_cm.__aexit__(None, None, None)
        if self._sse_cm:
            await self._sse_cm.__aexit__(None, None, None)
        self._session = None

    async def __aenter__(self) -> "WardenClient":
        await self.connect()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()

    # -- helpers ----------------------------------------------------------

    async def _call(self, tool: str, arguments: dict[str, Any]) -> Any:
        assert self._session is not None, "Not connected — call connect() first"
        result = await self._session.call_tool(tool, arguments=arguments)
        return result

    # -- run management ---------------------------------------------------

    async def start_run(self, task: str, environment: str = "development") -> str:
        """Begin a Warden run. Returns the run_id."""
        res = await self._call("warden_start_run", {
            "task": task,
            "environment": environment,
        })
        # The MCP result content is a list of content blocks
        return _extract_field(res, "run_id")

    async def end_run(self, run_id: str) -> Any:
        """End a Warden run, revoking all capabilities."""
        return await self._call("warden_end_run", {"run_id": run_id})

    # -- GitHub -----------------------------------------------------------

    async def request_github_access(
        self,
        run_id: str,
        repo: str,
        permissions: list[str],
        justification: str,
        ttl_seconds: int = 300,
    ) -> str:
        """Request a scoped GitHub capability. Returns the opaque handle."""
        res = await self._call("warden_request_github_access", {
            "run_id": run_id,
            "scope": {"repo": repo, "permissions": permissions},
            "justification": justification,
            "ttl_seconds": ttl_seconds,
        })
        return _extract_field(res, "handle")

    async def github_list_issues(
        self, handle: str, repo: str, state: str = "open"
    ) -> Any:
        return await self._call("warden_github_list_issues", {
            "handle": handle,
            "repo": repo,
            "state": state,
        })

    async def github_create_comment(
        self, handle: str, repo: str, issue_number: int, body: str
    ) -> Any:
        return await self._call("warden_github_create_comment", {
            "handle": handle,
            "repo": repo,
            "issue_number": issue_number,
            "body": body,
        })

    async def github_create_issue(
        self, handle_id: str, repo: str, title: str, body: str
    ) -> Any:
        return await self._call("warden_github_create_issue", {
            "handle_id": handle_id,
            "repo": repo,
            "title": title,
            "body": body,
        })

    # -- Groq (OpenAI-compatible LLM) ------------------------------------

    async def request_groq_access(
        self,
        run_id: str,
        models: list[str],
        justification: str,
        ttl_seconds: int = 300,
        max_tokens_per_call: int | None = None,
    ) -> str:
        """Request a scoped Groq capability. Returns the opaque handle."""
        scope: dict[str, Any] = {"models": models}
        if max_tokens_per_call is not None:
            scope["max_tokens_per_call"] = max_tokens_per_call
        res = await self._call("warden_request_groq_access", {
            "run_id": run_id,
            "scope": scope,
            "justification": justification,
            "ttl_seconds": ttl_seconds,
        })
        return _extract_field(res, "handle")

    async def groq_chat_completion(
        self,
        handle: str,
        messages: list[dict[str, str]],
        model: str | None = None,
        max_tokens: int | None = None,
    ) -> Any:
        args: dict[str, Any] = {"handle": handle, "messages": messages}
        if model is not None:
            args["model"] = model
        if max_tokens is not None:
            args["max_tokens"] = max_tokens
        return await self._call("warden_groq_chat_completion", args)


# -- internal helpers -----------------------------------------------------

def _extract_field(result: Any, field: str) -> str:
    """Pull a named field from an MCP CallToolResult.

    The MCP SDK returns a CallToolResult whose `.content` is a list of
    TextContent objects. We parse the first text block as JSON-ish and
    look for the requested key.
    """
    import json

    for block in result.content:
        text = getattr(block, "text", None)
        if text is None:
            continue
        try:
            data = json.loads(text)
            if isinstance(data, dict) and field in data:
                return data[field]
        except (json.JSONDecodeError, TypeError):
            # Might be plain text — try key: value pattern
            for line in text.splitlines():
                if line.strip().startswith(f"{field}:"):
                    return line.split(":", 1)[1].strip()
    raise ValueError(f"Could not extract '{field}' from MCP result: {result}")
