import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateTestToken,
  craftApiResponse,
  craftToolCallArgs,
  craftDownstreamErrorPayload,
  StubEventsRepo,
} from './fixtures/mockApi.js';
import { sanitize, REDACTION_MARKER } from '../src/pipeline/sanitize.js';
import { detectLeak, LEAK_DETECTED } from '../src/pipeline/detectLeak.js';
import { assertNoLeak, INTERNAL_LEAK } from '../src/pipeline/honesty.js';
import * as credentialIndex from '../src/pipeline/credentialIndex.js';
import { WardenError } from '../../shared/src/types/mcp.js';
import type { WardenEvent } from '../../shared/src/types/events.js';

/**
 * Type describing the adversarial test suite scenarios.
 * Each scenario defines a name and a factory that produces a payload
 * containing the raw token for testing sanitization / leak detection.
 */
export interface AdversarialSuite {
  /** Human-readable scenario name */
  name: string;
  /** Factory that produces a payload containing the raw token */
  buildPayload: (rawToken: string) => unknown;
  /** Which pipeline stage this scenario targets */
  stage: 'sanitize' | 'detectLeak' | 'honesty' | 'brokerPipeline';
}

/**
 * Adversarial sanitizer / leak-detector test suite.
 *
 * Generates a fresh random token per test run so the suite never relies on
 * a hardcoded value. Tests the real sanitize, detectLeak, and honesty modules
 * — no mocking of the modules under test.
 */

let rawToken: string;

beforeEach(() => {
  rawToken = generateTestToken();
  // Stub credentialIndex to return our random test token
  vi.spyOn(credentialIndex, 'getRegisteredValues').mockReturnValue([rawToken]);
});

// ---------------------------------------------------------------------------
// Helper: recursively assert no raw token survives in any value
// ---------------------------------------------------------------------------
function assertNoRawValue(value: unknown, path = 'root'): void {
  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    expect(value, `raw token leaked at ${path}`).not.toContain(rawToken);
    return;
  }

  if (typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoRawValue(item, `${path}[${i}]`));
    return;
  }

  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    assertNoRawValue(v, `${path}.${key}`);
  }
}

// ---------------------------------------------------------------------------
// (a) sanitize: API response containing raw token at various depths
// ---------------------------------------------------------------------------
describe('sanitize — redacts raw credentials from API responses', () => {
  it('redacts raw token at top-level string fields', () => {
    const payload = { token: rawToken, safe: 'hello' };
    const result = sanitize(payload);

    expect(result.token).toBe(REDACTION_MARKER);
    expect(result.safe).toBe('hello');
    assertNoRawValue(result);
  });

  it('redacts raw token nested multiple levels deep', () => {
    const response = craftApiResponse(rawToken);
    const result = sanitize(response);

    assertNoRawValue(result);
    expect(result.data.user.apiKey).toBe(REDACTION_MARKER);
    expect(result.data.nested.deep.veryDeep.secret).toBe(REDACTION_MARKER);
    expect(result.headers['x-token']).toBe(REDACTION_MARKER);
  });

  it('redacts raw token embedded inside longer strings', () => {
    const response = craftApiResponse(rawToken);
    const result = sanitize(response);

    // "Bearer <token>" → "Bearer [REDACTED]"
    expect(result.data.items[1].value).toContain(REDACTION_MARKER);
    expect(result.data.items[1].value).not.toContain(rawToken);
  });

  it('redacts raw token inside arrays', () => {
    const payload = { list: [rawToken, 'safe', rawToken] };
    const result = sanitize(payload);

    result.list.forEach((item: string) => {
      expect(item).not.toContain(rawToken);
    });
    expect(result.list[0]).toBe(REDACTION_MARKER);
    expect(result.list[1]).toBe('safe');
  });

  it('does not mutate the original input', () => {
    const payload = { secret: rawToken };
    const result = sanitize(payload);

    expect(payload.secret).toBe(rawToken); // original untouched
    expect(result.secret).toBe(REDACTION_MARKER);
  });

  it('handles circular references gracefully', () => {
    const obj: Record<string, unknown> = { secret: rawToken };
    obj.self = obj;

    const result = sanitize(obj);
    expect(result.secret).toBe(REDACTION_MARKER);
  });

  it('redacts downstream error payloads containing the raw token', () => {
    const errorPayload = craftDownstreamErrorPayload(rawToken);
    const result = sanitize(errorPayload);

    assertNoRawValue(result);
    expect(result.error.details.attempted_token).toBe(REDACTION_MARKER);
    expect(result.error.message).not.toContain(rawToken);
    expect(result.error.message).toContain(REDACTION_MARKER);
  });
});

// ---------------------------------------------------------------------------
// (b) detectLeak: tool-call args containing raw token → throws LEAK_DETECTED
// ---------------------------------------------------------------------------
describe('detectLeak — catches raw credentials in tool-call args', () => {
  it('throws LEAK_DETECTED when args contain raw token at top level', () => {
    const eventsRepo = new StubEventsRepo();
    const ctx = { toolName: 'test_tool', runId: 'run-1', eventsRepo };

    expect(() => detectLeak({ token: rawToken }, ctx)).toThrowError(WardenError);

    try {
      detectLeak({ token: rawToken }, ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(WardenError);
      expect((err as WardenError).code).toBe(LEAK_DETECTED);
    }
  });

  it('throws LEAK_DETECTED when args contain raw token deeply nested', () => {
    const eventsRepo = new StubEventsRepo();
    const ctx = { toolName: 'test_tool', runId: 'run-1', eventsRepo };
    const args = craftToolCallArgs(rawToken);

    expect(() => detectLeak(args, ctx)).toThrowError(WardenError);
  });

  it('emits a leak_detected event with redactedArgs on detection', () => {
    const eventsRepo = new StubEventsRepo();
    const ctx = { toolName: 'test_tool', runId: 'run-1', eventsRepo };

    try {
      detectLeak(craftToolCallArgs(rawToken), ctx);
    } catch {
      // expected
    }

    expect(eventsRepo.inserted.length).toBe(1);
    const event = eventsRepo.inserted[0];
    expect(event.event_type).toBe('leak_detected');
    expect(event.run_id).toBe('run-1');

    // The detail should contain redacted args, not the raw token
    const detail = JSON.parse(event.detail!);
    expect(detail.toolName).toBe('test_tool');
    assertNoRawValue(detail.redactedArgs);
  });

  it('passes through silently when no credentials are in args', () => {
    const eventsRepo = new StubEventsRepo();
    const ctx = { toolName: 'test_tool', runId: 'run-1', eventsRepo };

    expect(() =>
      detectLeak({ url: 'https://example.com', safe: true }, ctx),
    ).not.toThrow();
    expect(eventsRepo.inserted.length).toBe(0);
  });

  it('detects raw token embedded in a URL query string', () => {
    const eventsRepo = new StubEventsRepo();
    const ctx = { toolName: 'test_tool', runId: 'run-1', eventsRepo };

    expect(() =>
      detectLeak({ endpoint: `https://api.example.com?key=${rawToken}` }, ctx),
    ).toThrowError(WardenError);
  });
});

// ---------------------------------------------------------------------------
// (c) Downstream API returning raw token in error payload → sanitized
// ---------------------------------------------------------------------------
describe('brokerCall pipeline — downstream error payloads are sanitized', () => {
  it('sanitize removes raw token from downstream error payload', () => {
    const errorPayload = craftDownstreamErrorPayload(rawToken);
    const sanitized = sanitize(errorPayload);

    assertNoRawValue(sanitized);
    expect(sanitized.error.details.attempted_token).toBe(REDACTION_MARKER);
    expect(sanitized.error.message).toContain(REDACTION_MARKER);
    expect(sanitized.error.message).not.toContain(rawToken);
  });

  it('sanitize handles error payloads with token in nested arrays', () => {
    const payload = {
      errors: [
        { message: `Invalid token: ${rawToken}`, code: 'AUTH_FAILED' },
        { message: 'Rate limited', code: 'RATE_LIMIT' },
      ],
      metadata: { attempted_credentials: [rawToken] },
    };

    const sanitized = sanitize(payload);
    assertNoRawValue(sanitized);
  });

  it('sanitize handles error payloads with token in stringified JSON', () => {
    const payload = {
      raw_body: JSON.stringify({ token: rawToken, ok: false }),
    };

    const sanitized = sanitize(payload);
    // The raw token inside the stringified JSON should be redacted
    expect(sanitized.raw_body).not.toContain(rawToken);
  });
});

// ---------------------------------------------------------------------------
// (d) Emitting an event with a raw value → honesty-test throws
// ---------------------------------------------------------------------------
describe('assertNoLeak — honesty-test catches raw credentials in events', () => {
  it('throws INTERNAL_LEAK when event detail contains raw token', () => {
    const event: WardenEvent = {
      id: 'evt-1',
      run_id: 'run-1',
      capability_id: null,
      event_type: 'tool_called',
      detail: JSON.stringify({ result: rawToken }),
      created_at: new Date().toISOString(),
    };

    expect(() => assertNoLeak(event)).toThrowError(WardenError);

    try {
      assertNoLeak(event);
    } catch (err) {
      expect(err).toBeInstanceOf(WardenError);
      expect((err as WardenError).code).toBe(INTERNAL_LEAK);
    }
  });

  it('throws when raw token is in the event detail string', () => {
    const event: WardenEvent = {
      id: 'evt-2',
      run_id: 'run-1',
      capability_id: 'cap-1',
      event_type: 'capability_granted',
      detail: `Granted access with token ${rawToken}`,
      created_at: new Date().toISOString(),
    };

    expect(() => assertNoLeak(event)).toThrowError(WardenError);
  });

  it('passes when event contains no raw credentials', () => {
    const event: WardenEvent = {
      id: 'evt-3',
      run_id: 'run-1',
      capability_id: null,
      event_type: 'tool_called',
      detail: JSON.stringify({ result: 'safe-value' }),
      created_at: new Date().toISOString(),
    };

    expect(() => assertNoLeak(event)).not.toThrow();
  });

  it('throws when raw token appears in a nested event field', () => {
    const event: WardenEvent = {
      id: 'evt-4',
      run_id: 'run-1',
      capability_id: null,
      event_type: 'tool_called',
      detail: JSON.stringify({
        response: { nested: { deep: { value: rawToken } } },
      }),
      created_at: new Date().toISOString(),
    };

    // assertNoLeak scans the event object — the detail field is a string
    // that contains the raw token, so it should be caught
    expect(() => assertNoLeak(event)).toThrowError(WardenError);
  });
});

// ---------------------------------------------------------------------------
// Meta: ensure the suite itself fails the build on any raw-value pass-through
// ---------------------------------------------------------------------------
describe('meta — build-failure guarantee', () => {
  it('generates a unique token per run (not hardcoded)', () => {
    const token1 = generateTestToken();
    const token2 = generateTestToken();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThan(0);
  });

  it('REDACTION_MARKER is the expected constant', () => {
    expect(REDACTION_MARKER).toBe('[REDACTED]');
  });
});
