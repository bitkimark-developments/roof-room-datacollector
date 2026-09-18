export type FreshnessStatus =
  | 'FRESH'
  | 'DUE'
  | 'STALE'
  | 'IMPORT_NEEDED'
  | 'ON_DEMAND'
  | 'UNKNOWN';

export type FreshnessPolicy =
  | { kind: 'UNKNOWN' }
  | { kind: 'ON_DEMAND' }
  | { kind: 'MANUAL_IMPORT' }
  | {
      kind: 'INTERVAL';
      fresh_for_ms: number;
      stale_after_ms: number;
    };

export interface FreshnessResult {
  freshness_status: FreshnessStatus;
  evaluated_at: string;
  last_successful_at: string | null;
  next_due_at: string | null;
}

export interface WorkspaceFreshnessResult extends FreshnessResult {
  workspace_id: string;
  source_id: string;
}
