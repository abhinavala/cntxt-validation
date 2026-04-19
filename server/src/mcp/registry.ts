import type { McpToolDefinition } from "../../../shared/src/types/mcp.js";

export type { McpToolDefinition };

/**
 * Module-level registry of MCP tools.
 * Feature tasks (F1-F5) call registerTool() at import time to add their tools.
 */
const tools: McpToolDefinition[] = [];

/**
 * Register a tool definition. Appends to the module-level registry so it
 * appears in tools/list and is callable via tools/call.
 *
 * @throws if a tool with the same name is already registered
 */
export function registerTool(def: McpToolDefinition): void {
  const existing = tools.find((t) => t.name === def.name);
  if (existing) {
    throw new Error(`Tool "${def.name}" is already registered`);
  }
  tools.push(def);
}

/** Function signature type for registerTool */
export type registerTool = typeof registerTool;

/**
 * Return a shallow copy of all registered tool definitions.
 */
export function getRegisteredTools(): McpToolDefinition[] {
  return [...tools];
}

/** Function signature type for getRegisteredTools */
export type getRegisteredTools = typeof getRegisteredTools;
