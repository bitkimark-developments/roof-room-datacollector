import type { RunRecord } from '../../shared/run-job';
import type { WorkspaceReadinessStatus } from '../../shared/readiness';
import type {
  DesktopTaskPackageDefinition,
  DesktopTaskPackageErrorCode,
  DesktopTaskPackageReasonCode,
  DesktopTaskPackageRequirementView,
  DesktopTaskPackageReview,
  DesktopTaskPackageReviewIntent,
} from '../../shared/desktop-task-package';
import { isDesktopTaskPackageReviewIntent } from '../../shared/desktop-task-package';
import type { TaskPackageAssemblyResult, TaskPackageManifestV1 } from '../../shared/task-package';
import type { WorkspaceSourceConnectionRecord } from '../../shared/workspace-connection';
import type { WorkspaceRecord } from '../../shared/workspace';
import type { TaskPackageAssembler } from '../task-packages/task-package-assembler';
import type { TaskPackageStore } from '../task-packages/task-package-store';
import { lastCompleteCalendarDays } from '../task-packages/task-package-window';

type Repository = {
  getWorkspace(workspace_id: string): WorkspaceRecord | null;
  getSourceConnection(workspace_id: string, source_id: string): WorkspaceSourceConnectionRecord | null;
  listRuns(workspace_id: string): RunRecord[];
};

type Assembler = Pick<TaskPackageAssembler, 'assemble'>;
type Store = Pick<TaskPackageStore, 'scanManifests'>;

const SAFE_REASON_CODES = new Set<DesktopTaskPackageReasonCode>([
  'CONFIGURATION_REQUIRED',
  'CONNECTION_REQUIRED',
  'FILE_REQUIRED',
  'MANUAL_ACTION_REQUIRED',
  'NO_COMPATIBLE_EVIDENCE',
  'NO_DATA_REQUIRES_EXACT_WINDOW',
  'INCOMPATIBLE_CONTEXT',
  'INCOMPATIBLE_WINDOW',
  'INCOMPATIBLE_WORKSPACE',
  'INELIGIBLE_VALIDATION',
  'MISSING_ACCEPTED_ARTIFACT',
  'ARTIFACT_INELIGIBLE',
  'DATASET_LOAD_FAILED',
  'DATASET_IDENTITY_MISMATCH',
  'DAILY_ROWS_REQUIRED',
  'INVALID_ROW_DATE',
  'NO_RESOLUTION',
  'RESOLUTION_REQUIREMENT_MISMATCH',
  'EVIDENCE_UNAVAILABLE',
]);

const sanitizeReasonCodes = (reasonCodes: readonly string[]): DesktopTaskPackageReasonCode[] => {
  const safe = reasonCodes.filter((code): code is DesktopTaskPackageReasonCode => (
    SAFE_REASON_CODES.has(code as DesktopTaskPackageReasonCode)
  ));
  return safe.length > 0 ? [...new Set(safe)] : ['EVIDENCE_UNAVAILABLE'];
};

const sameWindow = (
  left: { start: string; end: string },
  right: { start: string; end: string },
): boolean => left.start === right.start && left.end === right.end;

const sameAccount = (
  left: { field: string; value: string },
  right: { field: string; value: string },
): boolean => left.field === right.field && left.value === right.value;

const asRecord = (value: unknown): Record<string, unknown> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const matchingActiveRun = (
  runs: readonly RunRecord[],
  input: {
    recipe_id: string;
    recipe_version: number;
    workspace_id: string;
    account_identity: { field: string; value: string };
    current_window: { start: string; end: string };
  },
): RunRecord | undefined => runs.find((run) => {
  if (!['PENDING', 'RUNNING', 'MANUAL_ACTION_REQUIRED', 'RETRY_REQUIRED'].includes(run.run_status)) {
    return false;
  }
  const snapshot = asRecord(run.configuration_snapshot);
  const taskPackage = asRecord(snapshot?.task_package);
  const account = asRecord(taskPackage?.account_identity);
  const window = asRecord(taskPackage?.current_window);
  return taskPackage?.recipe_id === input.recipe_id
    && taskPackage.recipe_version === input.recipe_version
    && taskPackage.workspace_id === input.workspace_id
    && account?.field === input.account_identity.field
    && account.value === input.account_identity.value
    && window?.start === input.current_window.start
    && window.end === input.current_window.end;
});

const identicalPackage = (
  manifests: readonly TaskPackageManifestV1[],
  input: {
    recipe_id: string;
    recipe_version: number;
    workspace_id: string;
    account_identity: { field: string; value: string };
    current_window: { start: string; end: string };
  },
): TaskPackageManifestV1 | undefined => manifests.find((manifest) => (
  manifest.recipe_id === input.recipe_id
  && manifest.recipe_version === input.recipe_version
  && manifest.workspace_id === input.workspace_id
  && sameAccount(manifest.account_identity, input.account_identity)
  && sameWindow(manifest.current_window, input.current_window)
));

const requirementViews = (
  result: TaskPackageAssemblyResult,
): DesktopTaskPackageRequirementView[] => result.requirements.map((resolution) => {
  if (resolution.status === 'MISSING') {
    return {
      requirement_id: resolution.requirement.requirement_id,
      dataset_type: resolution.requirement.dataset_type,
      status: 'COLLECT_REQUIRED',
      reason_codes: sanitizeReasonCodes(resolution.reason_codes),
    };
  }
  const disposition = resolution.evidence.disposition;
  return {
    requirement_id: resolution.requirement.requirement_id,
    dataset_type: resolution.requirement.dataset_type,
    status: disposition === 'REUSED_FILTERED'
      ? 'REUSE_FILTERED'
      : disposition === 'NO_DATA'
        ? 'NO_DATA'
        : 'REUSE_EXACT',
    reason_codes: [],
  };
});

export class DesktopTaskPackageControllerError extends Error {
  constructor(public readonly code: DesktopTaskPackageErrorCode) {
    super(code);
    this.name = 'DesktopTaskPackageControllerError';
  }
}

export class DesktopTaskPackageController {
  private readonly definitions = new Map<string, DesktopTaskPackageDefinition>();

  constructor(private readonly dependencies: {
    definitions: readonly DesktopTaskPackageDefinition[];
    repository: Repository;
    assembler: Assembler;
    store: Store;
    get_connection_readiness: (
      workspace_id: string,
      source_id: string,
    ) => Promise<WorkspaceReadinessStatus>;
    reference_date: () => string;
    now: () => string;
    application_version: string;
  }) {
    for (const definition of dependencies.definitions) {
      if (this.definitions.has(definition.recipe.recipe_id)) {
        throw new Error(`Duplicate desktop Task Package recipe: ${definition.recipe.recipe_id}`);
      }
      this.definitions.set(definition.recipe.recipe_id, definition);
    }
  }

  async review(intent: DesktopTaskPackageReviewIntent): Promise<DesktopTaskPackageReview> {
    if (!isDesktopTaskPackageReviewIntent(intent)) {
      throw new DesktopTaskPackageControllerError('INVALID_INTENT');
    }
    const workspaceId = intent.workspace_id.trim();
    const recipeId = intent.recipe_id.trim();
    if (this.dependencies.repository.getWorkspace(workspaceId) === null) {
      throw new DesktopTaskPackageControllerError('UNKNOWN_WORKSPACE');
    }
    const definition = this.definitions.get(recipeId);
    if (definition === undefined) {
      throw new DesktopTaskPackageControllerError('UNKNOWN_RECIPE');
    }
    const referenceDate = this.dependencies.reference_date();
    const currentWindow = lastCompleteCalendarDays(
      referenceDate,
      definition.recipe.current_window_days,
    );
    const readiness = await this.dependencies.get_connection_readiness(
      workspaceId,
      definition.connection_source_id,
    );
    const connection = this.dependencies.repository.getSourceConnection(
      workspaceId,
      definition.connection_source_id,
    );
    let accountIdentity;
    try {
      if (connection === null) throw new Error('Missing connection.');
      accountIdentity = definition.normalize_account_identity(connection.safe_metadata);
    } catch {
      return this.blockedReview(
        definition,
        workspaceId,
        referenceDate,
        currentWindow,
        { field: definition.recipe.account_identity_field, value: '' },
        'CONFIGURATION_REQUIRED',
      );
    }
    if (readiness !== 'READY') {
      return this.blockedReview(
        definition,
        workspaceId,
        referenceDate,
        currentWindow,
        accountIdentity,
        readiness,
      );
    }

    const matchingInput = {
      recipe_id: definition.recipe.recipe_id,
      recipe_version: definition.recipe.recipe_version,
      workspace_id: workspaceId,
      account_identity: accountIdentity,
      current_window: currentWindow,
    };
    const active = matchingActiveRun(
      this.dependencies.repository.listRuns(workspaceId),
      matchingInput,
    );
    const assembly = await this.dependencies.assembler.assemble({
      recipe: definition.recipe,
      package_id: `review-${definition.recipe.recipe_id.toLowerCase()}-${referenceDate}`,
      workspace_id: workspaceId,
      account_identity: accountIdentity,
      reference_date: referenceDate,
      created_at: this.dependencies.now(),
      application_version: this.dependencies.application_version,
    });
    const requirements = requirementViews(assembly);
    const stored = await this.dependencies.store.scanManifests();
    const existing = identicalPackage(stored.manifests, matchingInput);
    const base: DesktopTaskPackageReview = {
      recipe_id: definition.recipe.recipe_id,
      recipe_version: definition.recipe.recipe_version,
      recipe_label: definition.recipe.label,
      workspace_id: workspaceId,
      account_identity: accountIdentity,
      customer_id: accountIdentity.value,
      reference_date: referenceDate,
      current_window: currentWindow,
      status: assembly.status === 'READY' ? assembly.package.manifest.package_kind : 'NOT_READY',
      can_start: active === undefined,
      can_open: false,
      collection_run_id: active?.run_id ?? null,
      requirements,
      ...(assembly.status === 'READY' && assembly.package.manifest.previous_package_id !== undefined ? {
        previous_package_id: assembly.package.manifest.previous_package_id,
        previous_window: assembly.package.manifest.previous_window,
        gap_days: assembly.package.manifest.gap_days,
      } : {}),
    };
    if (existing !== undefined) {
      return {
        ...base,
        status: 'EXISTING_PACKAGE',
        can_start: false,
        can_open: true,
        existing_package_id: existing.package_id,
      };
    }
    return base;
  }

  private blockedReview(
    definition: DesktopTaskPackageDefinition,
    workspaceId: string,
    referenceDate: string,
    currentWindow: { start: string; end: string },
    accountIdentity: { field: string; value: string },
    reason: Exclude<WorkspaceReadinessStatus, 'READY'>,
  ): DesktopTaskPackageReview {
    const safeReason: DesktopTaskPackageReasonCode = reason;
    return {
      recipe_id: definition.recipe.recipe_id,
      recipe_version: definition.recipe.recipe_version,
      recipe_label: definition.recipe.label,
      workspace_id: workspaceId,
      account_identity: accountIdentity,
      customer_id: accountIdentity.value,
      reference_date: referenceDate,
      current_window: currentWindow,
      status: 'NOT_READY',
      can_start: false,
      can_open: false,
      collection_run_id: null,
      requirements: definition.recipe.required_evidence.map((requirement) => ({
        requirement_id: requirement.requirement_id,
        dataset_type: requirement.dataset_type,
        status: 'BLOCKED',
        reason_codes: [safeReason],
      })),
    };
  }
}
