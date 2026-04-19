import type { Hono } from "hono";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * Active SSE transports keyed by session ID.
 * Tracked so the server can handle multiple concurrent connections.
 */
const transports = new Map<string, SSEServerTransport>();

/**
 * Mount the /mcp SSE endpoint and /mcp/message POST endpoint onto a Hono app.
 *
 * GET  /mcp          - establishes an SSE connection, sends the session endpoint
 * POST /mcp/message  - receives JSON-RPC messages for a given session
 */
export function mountSseTransport(app: Hono, mcpServer: McpServer): void {
  // SSE connection endpoint
  app.get("/mcp", async (c) => {
    const transport = new SSEServerTransport("/mcp/message", c.res);
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    // Clean up on close
    transport.onclose = () => {
      transports.delete(sessionId);
    };

    await mcpServer.connect(transport);

    // Keep the connection open — Hono's raw response is already streaming
    return c.body(null as unknown as string, 200);
  });

  // JSON-RPC message endpoint
  app.post("/mcp/message", async (c) => {
    const sessionId = c.req.query("sessionId");
    if (!sessionId) {
      return c.json({ error: "Missing sessionId query parameter" }, 400);
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      return c.json({ error: "Unknown session" }, 404);
    }

    const body = await c.req.json();
    await transport.handlePostMessage(body);
    return c.json({ ok: true });
  });
}

/**
 * Return the number of currently active SSE transport sessions.
 */
export function getActiveSessionCount(): number {
  return transports.size;
}
