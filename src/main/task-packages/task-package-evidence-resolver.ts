import type { ArtifactRecord } from '../../shared/artifact';
import type { JobRecord, RunRecord } from '../../shared/run-job';
import type {
  TaskEvidenceRequirement,
  TaskPackageAccountIdentity,
  TaskPackageEvidenceEntry,
  TaskPackageRecipe,
  TaskPackageRequirementResolution,
  TaskPackageWindow,
} from '../../shared/task-package';
import { countCalendarDays } from './task-package-window';

const ACCEPTED_VALIDATION = new Set(['VALID', 'LOW_DATA', 'NO_DATA']);
const ACCEPTED_ARTIFACT_STATE = new Set(['ACCEPTED', 'ACCEPTED_WITH_WARNING']);

export interface TaskPackageEvidenceRepository {
  listRuns(workspace_id: string): RunRecord[];
  listJobs(run_id: string): JobRecord[];
  getArtifact(artifact_id: string): ArtifactRecord | null;
}

export interface LoadedTaskPackageDataset {
  source_id: string;
  dataset_type: string;
  job_id: string;
  job_key: string;
  rows: Array<Record<string, unknown>> | null;
  provenance?: Record<string, unknown>;
}

export interface TaskPackageDatasetLoader {
  loadAcceptedJobDataset(
    run_id: string,
    job_id: string,
  ): Promise<LoadedTaskPackageDataset>;
}

export interface ResolveCurrentEvidenceInput {
  recipe: TaskPackageRecipe;
  workspace_id: string;
  account_identity: TaskPackageAccountIdentity;
  current_window: TaskPackageWindow;
}

interface RejectedCandidate {
  code: string;
  identity: string;
}

interface ResolvedCandidate {
  exact: boolean;
  source_window: TaskPackageWindow;
  run: RunRecord;
  job: JobRecord;
  artifact: ArtifactRecord;
  rows: Array<Record<string, unknown>>;
  evidence: TaskPackageEvidenceEntry;
}

const cloneRows = (
  rows: readonly Record<string, unknown>[],
): Array<Record<string, unknown>> =>
  JSON.parse(JSON.stringify(rows)) as Array<Record<string, unknown>>;

const asObject = (value: unknown): Record<string, unknown> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const validDateOnly = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    countCalendarDays({ start: value, end: value });
    return true;
  } catch {
    return false;
  }
};

const windowContains = (
  candidate: TaskPackageWindow,
  requested: TaskPackageWindow,
): boolean => (
  candidate.start <= requested.start && candidate.end >= requested.end
);

const windowsEqual = (
  left: TaskPackageWindow,
  right: TaskPackageWindow,
): boolean => left.start === right.start && left.end === right.end;

const candidateIdentity = (
  run: RunRecord,
  job?: JobRecord,
  artifact?: ArtifactRecord,
): string => [run.run_id, job?.job_id ?? '-', artifact?.artifact_id ?? '-'].join('/');

const compareCandidates = (
  left: ResolvedCandidate,
  right: ResolvedCandidate,
): number => {
  if (left.exact !== right.exact) return left.exact ? -1 : 1;
  const leftDays = countCalendarDays(left.source_window);
  const rightDays = countCalendarDays(right.source_window);
  if (leftDays !== rightDays) return leftDays - rightDays;
  const acquired = right.artifact.created_at.localeCompare(left.artifact.created_at);
  if (acquired !== 0) return acquired;
  const run = left.run.run_id.localeCompare(right.run.run_id);
  if (run !== 0) return run;
  const job = left.job.job_id.localeCompare(right.job.job_id);
  if (job !== 0) return job;
  return left.artifact.artifact_id.localeCompare(right.artifact.artifact_id);
};

const compareRejections = (
  left: RejectedCandidate,
  right: RejectedCandidate,
): number => left.identity.localeCompare(right.identity) || left.code.localeCompare(right.code);

export class TaskPackageEvidenceResolver {
  constructor(
    private readonly repository: TaskPackageEvidenceRepository,
    private readonly datasetLoader: TaskPackageDatasetLoader,
  ) {}

  async resolveCurrent(
    input: ResolveCurrentEvidenceInput,
  ): Promise<TaskPackageRequirementResolution[]> {
    if (
      input.account_identity.field !== input.recipe.account_identity_field
      || input.account_identity.value.trim().length === 0
    ) {
      throw new Error('Task Package account identity does not match the recipe.');
    }
    countCalendarDays(input.current_window);
    const resolutions: TaskPackageRequirementResolution[] = [];
    for (const requirement of input.recipe.required_evidence) {
      resolutions.push(await this.resolveRequirement(input, requirement));
    }
    return resolutions;
  }

  private async resolveRequirement(
    input: ResolveCurrentEvidenceInput,
    requirement: TaskEvidenceRequirement,
  ): Promise<TaskPackageRequirementResolution> {
    const rejected: RejectedCandidate[] = [];
    const candidates: ResolvedCandidate[] = [];
    for (const run of this.repository.listRuns(input.workspace_id)) {
      if (run.workspace_id !== input.workspace_id) {
        rejected.push({ code: 'INCOMPATIBLE_WORKSPACE', identity: candidateIdentity(run) });
        continue;
      }
      for (const job of this.repository.listJobs(run.run_id)) {
        const identity = candidateIdentity(run, job);
        const context = asObject(job.source_context);
        if (
          job.run_id !== run.run_id
          || context === null
          || job.source_id !== requirement.source_id
          || context.source_id !== requirement.source_id
          || context.dataset_type !== requirement.dataset_type
          || context.resource_mode !== requirement.resource_mode
          || context.campaign_type !== requirement.campaign_scope
          || context.dataset_schema_version !== requirement.dataset_schema_version
          || context[input.account_identity.field] !== input.account_identity.value
        ) {
          rejected.push({ code: 'INCOMPATIBLE_CONTEXT', identity });
          continue;
        }
        if (
          job.execution_status !== 'COMPLETED'
          || !ACCEPTED_VALIDATION.has(job.validation_status)
        ) {
          rejected.push({ code: 'INELIGIBLE_VALIDATION', identity });
          continue;
        }
        if (job.accepted_artifact_id === null) {
          rejected.push({ code: 'MISSING_ACCEPTED_ARTIFACT', identity });
          continue;
        }
        const artifact = this.repository.getArtifact(job.accepted_artifact_id);
        if (
          artifact === null
          || artifact.run_id !== run.run_id
          || artifact.job_id !== job.job_id
          || artifact.source_id !== job.source_id
          || artifact.artifact_kind !== 'RAW_SOURCE_FILE'
          || !ACCEPTED_ARTIFACT_STATE.has(artifact.artifact_state)
          || artifact.sha256 === null
          || !Number.isFinite(Date.parse(artifact.created_at))
        ) {
          rejected.push({ code: 'ARTIFACT_INELIGIBLE', identity });
          continue;
        }
        const sourceStart = context.requested_date_start;
        const sourceEnd = context.requested_date_end;
        if (!validDateOnly(sourceStart) || !validDateOnly(sourceEnd)) {
          rejected.push({ code: 'INCOMPATIBLE_WINDOW', identity: candidateIdentity(run, job, artifact) });
          continue;
        }
        const sourceWindow = { start: sourceStart, end: sourceEnd };
        try {
          countCalendarDays(sourceWindow);
        } catch {
          rejected.push({ code: 'INCOMPATIBLE_WINDOW', identity: candidateIdentity(run, job, artifact) });
          continue;
        }
        const exact = windowsEqual(sourceWindow, input.current_window);
        if (!exact && !windowContains(sourceWindow, input.current_window)) {
          rejected.push({ code: 'INCOMPATIBLE_WINDOW', identity: candidateIdentity(run, job, artifact) });
          continue;
        }
        if (job.validation_status === 'NO_DATA' && !exact) {
          rejected.push({ code: 'NO_DATA_REQUIRES_EXACT_WINDOW', identity: candidateIdentity(run, job, artifact) });
          continue;
        }

        let dataset: LoadedTaskPackageDataset;
        try {
          dataset = await this.datasetLoader.loadAcceptedJobDataset(run.run_id, job.job_id);
        } catch {
          rejected.push({ code: 'DATASET_LOAD_FAILED', identity: candidateIdentity(run, job, artifact) });
          continue;
        }
        if (
          dataset.source_id !== job.source_id
          || dataset.dataset_type !== requirement.dataset_type
          || dataset.job_id !== job.job_id
          || !Array.isArray(dataset.rows)
        ) {
          rejected.push({ code: 'DATASET_IDENTITY_MISMATCH', identity: candidateIdentity(run, job, artifact) });
          continue;
        }

        let rows = cloneRows(dataset.rows);
        let transformation: TaskPackageEvidenceEntry['transformation'] = { kind: 'NONE' };
        if (!exact) {
          if (rows.length === 0) {
            rejected.push({ code: 'DAILY_ROWS_REQUIRED', identity: candidateIdentity(run, job, artifact) });
            continue;
          }
          let invalidDate = false;
          for (const row of rows) {
            const rowDate = row[requirement.row_date_field];
            if (
              !validDateOnly(rowDate)
              || rowDate < sourceWindow.start
              || rowDate > sourceWindow.end
            ) {
              invalidDate = true;
              break;
            }
          }
          if (invalidDate) {
            rejected.push({
              code: rows.some((row) => row[requirement.row_date_field] === undefined)
                ? 'DAILY_ROWS_REQUIRED'
                : 'INVALID_ROW_DATE',
              identity: candidateIdentity(run, job, artifact),
            });
            continue;
          }
          const inputRowCount = rows.length;
          rows = rows.filter((row) => {
            const rowDate = row[requirement.row_date_field] as string;
            return rowDate >= input.current_window.start && rowDate <= input.current_window.end;
          });
          transformation = {
            kind: 'DATE_FILTER',
            row_date_field: requirement.row_date_field,
            input_window: sourceWindow,
            output_window: { ...input.current_window },
            input_row_count: inputRowCount,
            output_row_count: rows.length,
          };
        }
        const disposition = job.validation_status === 'NO_DATA'
          ? 'NO_DATA'
          : exact
            ? 'REUSED_EXACT'
            : 'REUSED_FILTERED';
        const evidence: TaskPackageEvidenceEntry = {
          requirement_id: requirement.requirement_id,
          role: 'CURRENT',
          disposition,
          window: { ...input.current_window },
          origin: {
            run_id: run.run_id,
            job_id: job.job_id,
            attempt_number: artifact.attempt_number,
            artifact_id: artifact.artifact_id,
            artifact_sha256: artifact.sha256,
            acquired_at: artifact.created_at,
            validation_status: job.validation_status,
            source_id: job.source_id,
            dataset_type: requirement.dataset_type,
            resource_mode: requirement.resource_mode,
            acquisition_mode: requirement.acquisition_mode,
            campaign_scope: requirement.campaign_scope,
            dataset_schema_version: requirement.dataset_schema_version,
            account_identity: { ...input.account_identity },
            snapshot_observed_at: artifact.created_at,
          },
          transformation,
          row_count: rows.length,
        };
        candidates.push({ exact, source_window: sourceWindow, run, job, artifact, rows, evidence });
      }
    }

    rejected.sort(compareRejections);
    candidates.sort(compareCandidates);
    const selected = candidates[0];
    if (selected === undefined) {
      const reasonCodes = [...new Set(rejected.map(({ code }) => code))].sort();
      return {
        status: 'MISSING',
        requirement,
        reason_codes: reasonCodes.length === 0 ? ['NO_COMPATIBLE_EVIDENCE'] : reasonCodes,
        rejected_candidates: rejected,
      };
    }
    return {
      status: 'READY',
      requirement,
      rows: cloneRows(selected.rows),
      evidence: JSON.parse(JSON.stringify(selected.evidence)) as TaskPackageEvidenceEntry,
      rejected_candidates: rejected,
    };
  }
}
