import type { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { getRegisteredTools } from "./registry.js";
import { mountSseTransport } from "./transport.js";
import { WardenError } from "../../../shared/src/types/mcp.js";

/**
 * Create and start the MCP server, mounting it at /mcp on the given Hono app.
 *
 * Wires the tool registry into the MCP tools/list and tools/call handlers.
 * Feature tasks register their tools via registerTool() before calling this.
 */
export async function startMcpServer(app: Hono): Promise<void> {
  const server = new McpServer(
    { name: "warden", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  // Wire tools/list — return all registered tool definitions
  server.setRequestHandler(
    { method: "tools/list" } as any,
    async () => {
      const tools = getRegisteredTools();
      return {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    },
  );

  // Wire tools/call — dispatch to the matching handler
  server.setRequestHandler(
    { method: "tools/call" } as any,
    async (request: any) => {
      const { name, arguments: args = {} } = request.params;
      const tools = getRegisteredTools();
      const tool = tools.find((t) => t.name === name);

      if (!tool) {
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      try {
        return await tool.handler(args);
      } catch (err: unknown) {
        // Surface WardenError.code as JSON-RPC error code
        if (err instanceof WardenError) {
          throw Object.assign(new Error(err.message), {
            code: err.code,
            data: { name: err.name },
          });
        }
        const message =
          err instanceof Error ? err.message : "Internal tool error";
        return {
          content: [{ type: "text", text: message }],
          isError: true,
        };
      }
    },
  );

  // Mount SSE transport on the Hono app at /mcp
  mountSseTransport(app, server as any);
}
