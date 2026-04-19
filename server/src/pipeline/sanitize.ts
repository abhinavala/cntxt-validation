import { getRegisteredValues } from './credentialIndex';

export const REDACTION_MARKER = '[REDACTED]';

/**
 * Recursively walks any JS value and replaces any occurrence of a registered
 * credential value with '[REDACTED]'. Returns a new object — never mutates input.
 */
export function sanitize<T>(payload: T): T {
  const registeredValues = getRegisteredValues().filter(
    (v) => typeof v === 'string' && v.trim().length > 0
  );

  if (registeredValues.length === 0) {
    return payload;
  }

  const visited = new WeakSet();
  return walk(payload, registeredValues, visited);
}

function walk<T>(value: T, secrets: string[], visited: WeakSet<object>): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value, secrets) as unknown as T;
  }

  if (typeof value !== 'object') {
    return value;
  }

  const obj = value as object;

  if (visited.has(obj)) {
    return value;
  }
  visited.add(obj);

  if (Array.isArray(value)) {
    return value.map((item) => walk(item, secrets, visited)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    result[key] = walk((obj as Record<string, unknown>)[key], secrets, visited);
  }
  return result as unknown as T;
}

function redactString(str: string, secrets: string[]): string {
  let result = str;
  for (const secret of secrets) {
    if (result.includes(secret)) {
      result = result.split(secret).join(REDACTION_MARKER);
    }
  }
  return result;
}
