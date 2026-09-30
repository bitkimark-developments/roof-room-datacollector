import type { DesktopRunState } from '../../shared/desktop-multisource';
import type { JsonObject, JobPlan, JobRecord, RunRecord } from '../../shared/run-job';
import type { WorkspaceReadinessStatus } from '../../shared/readiness';
import type {
  DesktopTaskPackageDefinition,
  DesktopTaskPackageErrorCode,
  DesktopTaskPackageReasonCode,
  DesktopTaskPackageRequirementView,
  DesktopTaskPackageReview,
  DesktopTaskPackageReviewIntent,
  DesktopTaskPackageStartIntent,
  DesktopTaskPackageStartResult,
  DesktopTaskPackageSummary,
} from '../../shared/desktop-task-package';
import {
  isDesktopTaskPackageReviewIntent,
  isDesktopTaskPackageStartIntent,
} from '../../shared/desktop-task-package';
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
  reserveRunFromJobPlans(input: {
    workspace_id: string;
    application_version: string;
    configuration_snapshot: JsonObject;
    reusable_configuration: JsonObject;
    job_plans: JobPlan[];
  }): { run: RunRecord; jobs: JobRecord[] };
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
): DesktopTaskPackageRequirementView[] => result.requirements.map((resolution): DesktopTaskPackageRequirementView => {
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

const packageSummary = (manifest: TaskPackageManifestV1): DesktopTaskPackageSummary => ({
  package_id: manifest.package_id,
  package_kind: manifest.package_kind,
  current_window: { ...manifest.current_window },
  ...(manifest.previous_package_id === undefined ? {} : {
    previous_package_id: manifest.previous_package_id,
    previous_window: manifest.previous_window === undefined
      ? undefined
      : { ...manifest.previous_window },
    gap_days: manifest.gap_days,
  }),
});

interface ResolvedReview {
  review: DesktopTaskPackageReview;
  definition: DesktopTaskPackageDefinition;
  assembly?: TaskPackageAssemblyResult;
  existing?: TaskPackageManifestV1;
}

export class DesktopTaskPackageControllerError extends Error {
  constructor(public readonly code: DesktopTaskPackageErrorCode) {
    super(code);
    this.name = 'DesktopTaskPackageControllerError';
  }
}

export class DesktopTaskPackageController {
  private readonly definitions = new Map<string, DesktopTaskPackageDefinition>();
  private readonly starts = new Set<string>();

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
    create_package_id: () => string;
    execute_run: (run_id: string) => Promise<unknown>;
    get_run_state: (run_id: string) => DesktopRunState;
  }) {
    for (const definition of dependencies.definitions) {
      if (this.definitions.has(definition.recipe.recipe_id)) {
        throw new Error(`Duplicate desktop Task Package recipe: ${definition.recipe.recipe_id}`);
      }
      this.definitions.set(definition.recipe.recipe_id, definition);
    }
  }

  async review(intent: DesktopTaskPackageReviewIntent): Promise<DesktopTaskPackageReview> {
    return (await this.resolveReview(intent, undefined)).review;
  }

  async start(intent: DesktopTaskPackageStartIntent): Promise<DesktopTaskPackageStartResult> {
    if (!isDesktopTaskPackageStartIntent(intent)) {
      throw new DesktopTaskPackageControllerError('INVALID_INTENT');
    }
    const lockKey = [intent.workspace_id, intent.recipe_id].join(':');
    if (this.starts.has(lockKey)) {
      throw new DesktopTaskPackageControllerError('ACTIVE_MATCHING_COLLECTION');
    }
    this.starts.add(lockKey);
    try {
      const packageId = this.dependencies.create_package_id();
      const resolved = await this.resolveReview({
        workspace_id: intent.workspace_id,
        recipe_id: intent.recipe_id,
      }, packageId);
      const { review } = resolved;
      const blocked = review.requirements.find(({ status }) => status === 'BLOCKED');
      if (blocked !== undefined) {
        const code = blocked.reason_codes[0];
        throw new DesktopTaskPackageControllerError(
          code === 'CONNECTION_REQUIRED' ? 'CONNECTION_REQUIRED' : 'CONFIGURATION_REQUIRED',
        );
      }
      if (
        intent.recipe_version !== review.recipe_version
        || intent.reference_date !== review.reference_date
        || !sameWindow(intent.current_window, review.current_window)
        || !sameAccount(intent.account_identity, review.account_identity)
      ) {
        throw new DesktopTaskPackageControllerError('STALE_REVIEW');
      }
      if (resolved.existing !== undefined) {
        return { status: 'EXISTING_PACKAGE', package: packageSummary(resolved.existing) };
      }
      if (review.collection_run_id !== null) {
        return {
          status: 'COLLECTION_STARTED',
          run_state: this.dependencies.get_run_state(review.collection_run_id),
        };
      }
      const assembly = resolved.assembly;
      if (assembly === undefined) {
        throw new DesktopTaskPackageControllerError('LOCAL_REVIEW_FAILED');
      }
      if (assembly.status === 'READY') {
        try {
          const published = await resolved.definition.publish_package(assembly.package);
          if (published.package_id !== assembly.package.manifest.package_id) {
            throw new Error('Published package identity mismatch.');
          }
          return {
            status: 'PACKAGE_PUBLISHED',
            package: packageSummary(assembly.package.manifest),
          };
        } catch {
          throw new DesktopTaskPackageControllerError('PUBLICATION_FAILED');
        }
      }
      const missing = assembly.requirements.filter((resolution) => resolution.status === 'MISSING');
      if (missing.length === 0) {
        throw new DesktopTaskPackageControllerError('LOCAL_REVIEW_FAILED');
      }
      const plans = missing.map(({ requirement }) => resolved.definition.build_job_plan({
        requirement,
        account_identity: review.account_identity,
        current_window: review.current_window,
      }));
      let reserved: { run: RunRecord; jobs: JobRecord[] };
      try {
        reserved = this.dependencies.repository.reserveRunFromJobPlans({
          workspace_id: review.workspace_id,
          application_version: this.dependencies.application_version,
          configuration_snapshot: {
            task_package: {
              recipe_id: review.recipe_id,
              recipe_version: review.recipe_version,
              workspace_id: review.workspace_id,
              account_identity: { ...review.account_identity },
              current_window: { ...review.current_window },
            },
          },
          reusable_configuration: {},
          job_plans: plans,
        });
      } catch {
        throw new DesktopTaskPackageControllerError('CORE_START_FAILED');
      }
      void this.dependencies.execute_run(reserved.run.run_id).catch(() => {
        // Persisted Core state remains authoritative and is surfaced by Run Detail.
      });
      return {
        status: 'COLLECTION_STARTED',
        run_state: this.dependencies.get_run_state(reserved.run.run_id),
      };
    } finally {
      this.starts.delete(lockKey);
    }
  }

  private async resolveReview(
    intent: DesktopTaskPackageReviewIntent,
    packageId: string | undefined,
  ): Promise<ResolvedReview> {
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
      return {
        definition,
        review: this.blockedReview(
          definition,
          workspaceId,
          referenceDate,
          currentWindow,
          { field: definition.recipe.account_identity_field, value: '' },
          'CONFIGURATION_REQUIRED',
        ),
      };
    }
    if (readiness !== 'READY') {
      return {
        definition,
        review: this.blockedReview(
          definition,
          workspaceId,
          referenceDate,
          currentWindow,
          accountIdentity,
          readiness,
        ),
      };
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
      package_id: packageId ?? `review-${definition.recipe.recipe_id.toLowerCase()}-${referenceDate}`,
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
        definition,
        assembly,
        existing,
        review: {
          ...base,
          status: 'EXISTING_PACKAGE',
          can_start: false,
          can_open: true,
          existing_package_id: existing.package_id,
        },
      };
    }
    return { definition, assembly, review: base };
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
