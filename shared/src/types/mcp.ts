import type { z } from "zod";

/**
 * Shape of a single MCP tool definition stored in the registry.
 */
export interface McpToolDefinition {
  /** Unique tool name (e.g. "warden_start_run") */
  name: string;
  /** Human-readable description shown in tools/list */
  description: string;
  /** JSON Schema describing the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /**
   * Handler invoked when the tool is called via tools/call.
   * Must return a JSON-RPC compatible result or throw.
   */
  handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
}

/**
 * Result returned by a tool handler, rendered as a tools/call response.
 */
export interface McpToolResult {
  content: McpToolContent[];
  isError?: boolean;
}

export interface McpToolContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Error class that preserves a machine-readable code for JSON-RPC errors.
 */
export class WardenError extends Error {
  public readonly code: number;

  constructor(message: string, code: number = -32000) {
    super(message);
    this.name = "WardenError";
    this.code = code;
  }
}
