import type {
  FreshnessPolicy,
  WorkspaceFreshnessResult,
} from '../../shared/freshness';
import { evaluateFreshness } from './freshness';

export interface FreshnessEvaluationContext {
  workspace_id: string;
  source_id: string;
  source_config: Record<string, unknown>;
}

export type FreshnessPolicyEvaluator = (
  context: FreshnessEvaluationContext,
) => FreshnessPolicy;

export interface FreshnessHistoryReader {
  getLatestAcceptedSourceCompletion(
    workspace_id: string,
    source_id: string,
  ): string | null;
}

export class FreshnessRegistryError extends Error {
  constructor(public readonly code: 'UNKNOWN_SOURCE_ID', sourceId: string) {
    super(`No freshness evaluator is registered for source: ${sourceId}`);
    this.name = 'FreshnessRegistryError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const resolveConfiguredIntervalPolicy = (
  sourceConfig: Record<string, unknown>,
  defaultPolicy: FreshnessPolicy,
): FreshnessPolicy => {
  const raw = sourceConfig.freshness_policy;
  if (raw === undefined) return defaultPolicy;
  if (!isRecord(raw) || raw.kind !== 'INTERVAL') {
    throw new Error('freshness_policy must be an explicit INTERVAL policy.');
  }
  const keys = Object.keys(raw);
  if (
    keys.some((key) => !['kind', 'fresh_for_hours', 'stale_after_hours'].includes(key))
    || !Number.isSafeInteger(raw.fresh_for_hours)
    || !Number.isSafeInteger(raw.stale_after_hours)
  ) {
    throw new Error('freshness_policy interval fields are invalid.');
  }
  return {
    kind: 'INTERVAL',
    fresh_for_ms: (raw.fresh_for_hours as number) * 60 * 60 * 1000,
    stale_after_ms: (raw.stale_after_hours as number) * 60 * 60 * 1000,
  };
};

export class FreshnessRegistry {
  private readonly evaluators = new Map<string, FreshnessPolicyEvaluator>();

  constructor(
    private readonly history: FreshnessHistoryReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  register(sourceId: string, evaluator: FreshnessPolicyEvaluator): void {
    if (!sourceId.trim()) throw new Error('Freshness source_id must be non-empty.');
    if (this.evaluators.has(sourceId)) {
      throw new Error(`Freshness evaluator already registered: ${sourceId}`);
    }
    this.evaluators.set(sourceId, evaluator);
  }

  getFreshness(
    workspaceId: string,
    sourceId: string,
    sourceConfig: Record<string, unknown> = {},
  ): WorkspaceFreshnessResult {
    const evaluator = this.evaluators.get(sourceId);
    if (!evaluator) throw new FreshnessRegistryError('UNKNOWN_SOURCE_ID', sourceId);
    const result = evaluateFreshness(
      evaluator({
        workspace_id: workspaceId,
        source_id: sourceId,
        source_config: sourceConfig,
      }),
      this.history.getLatestAcceptedSourceCompletion(workspaceId, sourceId),
      this.now().toISOString(),
    );
    return {
      workspace_id: workspaceId,
      source_id: sourceId,
      ...result,
    };
  }
}
