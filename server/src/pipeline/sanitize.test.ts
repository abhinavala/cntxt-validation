import { sanitize } from './sanitize';
import * as credentialIndex from './credentialIndex';

// Mock the credentialIndex module
jest.mock('./credentialIndex');
const mockGetRegisteredValues = credentialIndex.getRegisteredValues as jest.MockedFunction<
  typeof credentialIndex.getRegisteredValues
>;

describe('sanitize', () => {
  beforeEach(() => {
    mockGetRegisteredValues.mockReturnValue(['ghp_secretvalue', 'sk-12345']);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('nested object with 5 levels and raw value at each level', () => {
    const input = {
      level1: 'ghp_secretvalue',
      nested: {
        level2: 'ghp_secretvalue',
        deeper: {
          level3: 'sk-12345',
          more: {
            level4: 'ghp_secretvalue',
            final: {
              level5: 'sk-12345',
            },
          },
        },
      },
    };

    const result = sanitize(input);

    expect(result.level1).toBe('[REDACTED]');
    expect(result.nested.level2).toBe('[REDACTED]');
    expect(result.nested.deeper.level3).toBe('[REDACTED]');
    expect(result.nested.deeper.more.level4).toBe('[REDACTED]');
    expect(result.nested.deeper.more.final.level5).toBe('[REDACTED]');
    // Structure preserved
    expect(Object.keys(result)).toEqual(['level1', 'nested']);
    expect(Object.keys(result.nested)).toEqual(['level2', 'deeper']);
  });

  test('array of mixed types with one raw value string', () => {
    const input = [42, true, null, 'ghp_secretvalue', 'safe string', { key: 'value' }];

    const result = sanitize(input);

    expect(result).toEqual([42, true, null, '[REDACTED]', 'safe string', { key: 'value' }]);
    expect(Array.isArray(result)).toBe(true);
  });

  test('string with raw value embedded in middle of longer text', () => {
    const input = 'Error: token ghp_secretvalue is invalid for this request';

    const result = sanitize(input);

    expect(result).toBe('Error: token [REDACTED] is invalid for this request');
  });

  test('does not mutate the input', () => {
    const input = { secret: 'ghp_secretvalue', nested: { token: 'sk-12345' } };
    const original = JSON.parse(JSON.stringify(input));

    sanitize(input);

    expect(input).toEqual(original);
  });

  test('non-string leaves pass through untouched', () => {
    const input = { num: 42, bool: true, nil: null, undef: undefined };

    const result = sanitize(input);

    expect(result).toEqual({ num: 42, bool: true, nil: null, undef: undefined });
  });

  test('handles circular references without infinite loop', () => {
    const input: Record<string, unknown> = { secret: 'ghp_secretvalue' };
    input.self = input;

    const result = sanitize(input);

    expect(result.secret).toBe('[REDACTED]');
  });

  test('empty and whitespace-only registered values are ignored', () => {
    mockGetRegisteredValues.mockReturnValue(['ghp_secretvalue', '', '   ', 'sk-12345']);

    const input = 'token ghp_secretvalue and sk-12345 here';
    const result = sanitize(input);

    expect(result).toBe('token [REDACTED] and [REDACTED] here');
  });

  test('returns input as-is when no registered values exist', () => {
    mockGetRegisteredValues.mockReturnValue([]);

    const input = { data: 'some value' };
    const result = sanitize(input);

    expect(result).toEqual({ data: 'some value' });
  });

  test('performance: sanitizes a large object in under 50ms', () => {
    const largeObj: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      largeObj[`key${i}`] = {
        value: `some data with ghp_secretvalue embedded ${i}`,
        nested: {
          deep: `more data sk-12345 here ${i}`,
          number: i,
          bool: i % 2 === 0,
        },
      };
    }

    const start = performance.now();
    const result = sanitize(largeObj);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect((result['key0'] as Record<string, unknown>).value).toBe(
      'some data with [REDACTED] embedded 0'
    );
  });
});
