import { registerTool } from '../registry.js';
import { startRun, endRun } from '../../runs/lifecycle.js';
import type { LifecycleDeps } from '../../runs/lifecycle.js';
import type { McpToolResult } from '../../../../shared/src/types/mcp.js';
import { WardenError } from '../../../../shared/src/types/mcp.js';

/**
 * Registers the warden_start_run and warden_end_run MCP tools.
 * Must be called once at startup with the repository dependencies.
 */
/** Type alias for the registerRunTools function signature */
export type registerRunTools = typeof registerRunTools;

/** Type alias for the warden_start_run tool handler */
export type startRunTool = (args: Record<string, unknown>) => Promise<McpToolResult>;

/** Type alias for the warden_end_run tool handler */
export type endRunTool = (args: Record<string, unknown>) => Promise<McpToolResult>;

export function registerRunTools(deps: LifecycleDeps): void {
  registerTool({
    name: 'warden_start_run',
    description:
      'Start a new Warden run. Returns a run_id and agent_identity for the session.',
    inputSchema: {
      type: 'object',
      properties: {
        task_description: {
          type: 'string',
          description: 'A short description of what this agent run will do',
        },
      },
      required: ['task_description'],
    },
    handler: async (args: Record<string, unknown>): Promise<McpToolResult> => {
      const taskDescription = args.task_description;
      if (typeof taskDescription !== 'string' || taskDescription.length === 0) {
        throw new WardenError('task_description is required and must be a non-empty string');
      }

      const result = startRun(deps, taskDescription);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    },
  });

  registerTool({
    name: 'warden_end_run',
    description:
      'End a Warden run. Revokes all active capabilities and marks the run as completed.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: {
          type: 'string',
          description: 'The run_id returned by warden_start_run',
        },
      },
      required: ['run_id'],
    },
    handler: async (args: Record<string, unknown>): Promise<McpToolResult> => {
      const runId = args.run_id;
      if (typeof runId !== 'string' || runId.length === 0) {
        throw new WardenError('run_id is required and must be a non-empty string');
      }

      const run = deps.runsRepo.findById(runId);
      if (!run) {
        throw new WardenError(`Run not found: ${runId}`, -32602);
      }

      const result = endRun(deps, runId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    },
  });
}
