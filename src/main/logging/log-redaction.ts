import type {
  LogJsonValue,
} from '../../shared/logging';

export const REDACTED_LOG_VALUE =
  '[REDACTED]';

export const OMITTED_BINARY_LOG_VALUE =
  '[BINARY OMITTED]';

export const CIRCULAR_LOG_VALUE =
  '[CIRCULAR]';

export const MAX_DEPTH_LOG_VALUE =
  '[MAX DEPTH]';

const SENSITIVE_KEY_NAMES = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'apikey',
  'clientsecret',
  'session',
  'sessionid',
  'csrftoken',
]);

const normalizeKey = (
  key: string,
): string =>
  key
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const isSensitiveLogKey = (
  key: string,
): boolean =>
  SENSITIVE_KEY_NAMES.has(
    normalizeKey(key),
  );

const redactSensitiveString = (
  value: string,
): string => {
  let redacted = value;

  redacted = redacted.replace(
    /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
    '$1 [REDACTED]',
  );

  redacted = redacted.replace(
    /\b(authorization|proxy-authorization|cookie|set-cookie)\s*:\s*[^\r\n]+/gi,
    '$1: [REDACTED]',
  );

  redacted = redacted.replace(
    /\b(access_token|refresh_token|api_key|apikey|client_secret|password|passwd|secret|token|sessionid|csrf_token)\s*=\s*([^&\s;]+)/gi,
    '$1=[REDACTED]',
  );

  return redacted;
};

const sanitizeUnknown = (
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): LogJsonValue => {
  if (depth > 12) {
    return MAX_DEPTH_LOG_VALUE;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }

  if (
    typeof value === 'undefined' ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  if (
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer
  ) {
    return OMITTED_BINARY_LOG_VALUE;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveString(
        value.message,
      ),
    };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return CIRCULAR_LOG_VALUE;
    }

    seen.add(value);

    const sanitized = value.map(
      (entry) =>
        sanitizeUnknown(
          entry,
          seen,
          depth + 1,
        ),
    );

    seen.delete(value);

    return sanitized;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return CIRCULAR_LOG_VALUE;
    }

    seen.add(value);

    const output: {
      [key: string]: LogJsonValue;
    } = {};

    for (const [
      key,
      entry,
    ] of Object.entries(value)) {
      output[key] = isSensitiveLogKey(
        key,
      )
        ? REDACTED_LOG_VALUE
        : sanitizeUnknown(
            entry,
            seen,
            depth + 1,
          );
    }

    seen.delete(value);

    return output;
  }

  return String(value);
};

export const sanitizeLogContext = (
  context:
    | Record<string, unknown>
    | undefined,
): {
  [key: string]: LogJsonValue;
} => {
  if (!context) {
    return {};
  }

  const sanitized = sanitizeUnknown(
    context,
    new WeakSet<object>(),
    0,
  );

  if (
    sanitized === null ||
    Array.isArray(sanitized) ||
    typeof sanitized !== 'object'
  ) {
    throw new Error(
      'Structured log context must sanitize to an object.',
    );
  }

  return sanitized;
};
