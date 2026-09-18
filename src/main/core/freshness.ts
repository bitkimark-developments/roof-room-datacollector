import type {
  FreshnessPolicy,
  FreshnessResult,
} from '../../shared/freshness';

const MAX_INTERVAL_MS = 10 * 366 * 24 * 60 * 60 * 1000;

const parseUtcTimestamp = (value: unknown, field: string): number => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw new Error(`${field} must be a canonical UTC timestamp.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${field} must be a valid canonical UTC timestamp.`);
  }
  return timestamp;
};

const requireInterval = (
  policy: Extract<FreshnessPolicy, { kind: 'INTERVAL' }>,
): void => {
  if (
    !Number.isSafeInteger(policy.fresh_for_ms)
    || policy.fresh_for_ms < 1
    || policy.fresh_for_ms > MAX_INTERVAL_MS
    || !Number.isSafeInteger(policy.stale_after_ms)
    || policy.stale_after_ms < policy.fresh_for_ms
    || policy.stale_after_ms > MAX_INTERVAL_MS
  ) {
    throw new Error('Freshness interval policy bounds are invalid.');
  }
};

export const evaluateFreshness = (
  policy: FreshnessPolicy,
  lastSuccessfulAt: string | null,
  evaluatedAt: string,
): FreshnessResult => {
  const now = parseUtcTimestamp(evaluatedAt, 'evaluated_at');
  const lastSuccess = lastSuccessfulAt === null
    ? null
    : parseUtcTimestamp(lastSuccessfulAt, 'last_successful_at');
  if (lastSuccess !== null && lastSuccess > now) {
    throw new Error('last_successful_at must not be later than evaluated_at.');
  }

  if (policy.kind === 'UNKNOWN') {
    return {
      freshness_status: 'UNKNOWN', evaluated_at: evaluatedAt,
      last_successful_at: lastSuccessfulAt, next_due_at: null,
    };
  }
  if (policy.kind === 'ON_DEMAND') {
    return {
      freshness_status: 'ON_DEMAND', evaluated_at: evaluatedAt,
      last_successful_at: lastSuccessfulAt, next_due_at: null,
    };
  }
  if (policy.kind === 'MANUAL_IMPORT') {
    return {
      freshness_status: lastSuccess === null ? 'IMPORT_NEEDED' : 'FRESH',
      evaluated_at: evaluatedAt,
      last_successful_at: lastSuccessfulAt,
      next_due_at: null,
    };
  }
  if (policy.kind !== 'INTERVAL') {
    throw new Error('Freshness policy kind is invalid.');
  }

  requireInterval(policy);
  if (lastSuccess === null) {
    return {
      freshness_status: 'DUE', evaluated_at: evaluatedAt,
      last_successful_at: null, next_due_at: null,
    };
  }
  const nextDue = lastSuccess + policy.fresh_for_ms;
  const staleAt = lastSuccess + policy.stale_after_ms;
  return {
    freshness_status: now < nextDue
      ? 'FRESH'
      : now < staleAt
        ? 'DUE'
        : 'STALE',
    evaluated_at: evaluatedAt,
    last_successful_at: lastSuccessfulAt,
    next_due_at: new Date(nextDue).toISOString(),
  };
};
