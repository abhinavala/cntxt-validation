import { randomBytes } from 'node:crypto';
import type { EventRow } from '../../../shared/src/types/db.js';

/**
 * Generates a random token string for each test run so tests stay honest
 * and never rely on a hardcoded value.
 */
export function generateTestToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Builds an API response object with the raw token buried at various depths.
 */
export function craftApiResponse(rawToken: string) {
  return {
    status: 200,
    data: {
      user: { name: 'alice', apiKey: rawToken },
      nested: {
        deep: {
          veryDeep: { secret: rawToken },
        },
      },
      items: [
        { id: 1, value: 'safe' },
        { id: 2, value: `Bearer ${rawToken}` },
      ],
    },
    headers: { 'x-token': rawToken },
  };
}

/**
 * Builds tool-call args containing the raw token at various locations.
 */
export function craftToolCallArgs(rawToken: string): Record<string, unknown> {
  return {
    url: `https://api.example.com/v1?token=${rawToken}`,
    headers: { Authorization: `Bearer ${rawToken}` },
    body: {
      credentials: { secret: rawToken },
      nested: [{ key: rawToken }],
    },
  };
}

/**
 * Simulates a downstream API error payload that echoes back the raw token.
 */
export function craftDownstreamErrorPayload(rawToken: string) {
  return {
    error: {
      message: `Authentication failed for token: ${rawToken}`,
      code: 401,
      details: {
        attempted_token: rawToken,
        suggestion: 'Verify your credentials',
      },
    },
  };
}

/**
 * Stub EventsRepo that records inserted events in memory for assertions.
 */
export class StubEventsRepo {
  public inserted: EventRow[] = [];

  insert(row: EventRow): void {
    this.inserted.push(row);
  }

  findById(_id: string): EventRow | undefined {
    return undefined;
  }

  findAll(): EventRow[] {
    return this.inserted;
  }

  findByRunId(_runId: string): EventRow[] {
    return [];
  }

  findByCapabilityId(_capabilityId: string): EventRow[] {
    return [];
  }

  findByEventType(_eventType: string): EventRow[] {
    return [];
  }

  deleteById(_id: string): number {
    return 0;
  }
}
