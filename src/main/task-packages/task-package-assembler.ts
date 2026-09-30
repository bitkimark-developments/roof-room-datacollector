import type {
  AssembledTaskPackageDataset,
  TaskPackageAccountIdentity,
  TaskPackageAssemblyResult,
  TaskPackageEvidenceEntry,
  TaskPackageManifestV1,
  TaskPackageRecipe,
  TaskPackageRequirementResolution,
  TaskPackageWindow,
} from '../../shared/task-package';
import type { TaskPackageEvidenceResolver } from './task-package-evidence-resolver';
import type { TaskPackageStore } from './task-package-store';
import { countCalendarDays, gapDays, lastCompleteCalendarDays } from './task-package-window';

export interface AssembleTaskPackageInput {
  recipe: TaskPackageRecipe;
  package_id: string;
  workspace_id: string;
  account_identity: TaskPackageAccountIdentity;
  reference_date: string;
  created_at: string;
  application_version: string;
}

type EvidenceResolver = Pick<TaskPackageEvidenceResolver, 'resolveCurrent'>;
type PackageStore = Pick<TaskPackageStore, 'scanManifests' | 'readDatasetTable'>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const consistentValue = <T>(values: readonly T[], context: string): T => {
  if (values.length === 0 || values.some((value) => value !== values[0])) {
    throw new Error(`Task Package recipe requires one consistent ${context}.`);
  }
  return values[0];
};

const missingResolution = (
  requirement: TaskPackageRecipe['required_evidence'][number],
  reason: string,
): TaskPackageRequirementResolution => ({
  status: 'MISSING',
  requirement,
  reason_codes: [reason],
  rejected_candidates: [],
});

const normalizeResolutions = (
  recipe: TaskPackageRecipe,
  resolutions: readonly TaskPackageRequirementResolution[],
): TaskPackageRequirementResolution[] => {
  const byRequirement = new Map<string, TaskPackageRequirementResolution>();
  for (const resolution of resolutions) {
    const id = resolution.requirement.requirement_id;
    if (byRequirement.has(id)) throw new Error(`Duplicate evidence resolution for ${id}.`);
    byRequirement.set(id, resolution);
  }
  return recipe.required_evidence.map((requirement) => {
    const resolution = byRequirement.get(requirement.requirement_id);
    if (resolution === undefined) return missingResolution(requirement, 'NO_RESOLUTION');
    if (
      resolution.requirement.source_id !== requirement.source_id
      || resolution.requirement.dataset_type !== requirement.dataset_type
      || resolution.requirement.resource_mode !== requirement.resource_mode
      || resolution.requirement.acquisition_mode !== requirement.acquisition_mode
      || resolution.requirement.campaign_scope !== requirement.campaign_scope
      || resolution.requirement.dataset_schema_version !== requirement.dataset_schema_version
      || resolution.requirement.row_date_field !== requirement.row_date_field
    ) {
      return missingResolution(requirement, 'RESOLUTION_REQUIREMENT_MISMATCH');
    }
    return clone(resolution);
  });
};

const baselineWorkbookFilename = (referenceDate: string): string =>
  `kampanya-gelisim-${referenceDate}-baseline.xlsx`;

const comparisonWorkbookFilename = (
  referenceDate: string,
  previousCreatedAt: string,
): string => `kampanya-gelisim-${referenceDate}-${previousCreatedAt.slice(0, 10)}.xlsx`;

const isCompatibleBaseline = (
  manifest: TaskPackageManifestV1,
  input: AssembleTaskPackageInput,
  currentWindow: TaskPackageWindow,
): boolean => {
  const required = input.recipe.required_evidence;
  const currentEvidence = manifest.evidence.filter(({ role }) => role === 'CURRENT');
  try {
    countCalendarDays(manifest.current_window);
  } catch {
    return false;
  }
  return (
    manifest.recipe_id === input.recipe.recipe_id
    && manifest.recipe_version === input.recipe.recipe_version
    && manifest.workspace_id === input.workspace_id
    && manifest.account_identity.field === input.account_identity.field
    && manifest.account_identity.value === input.account_identity.value
    && manifest.customer_id === input.account_identity.value
    && manifest.campaign_scope === consistentValue(required.map(({ campaign_scope }) => campaign_scope), 'campaign scope')
    && manifest.dataset_schema_version === consistentValue(required.map(({ dataset_schema_version }) => dataset_schema_version), 'dataset schema version')
    && manifest.current_window.end < currentWindow.start
    && manifest.required_datasets.length === required.length
    && new Set(manifest.required_datasets).size === required.length
    && required.every(({ requirement_id }) => manifest.required_datasets.includes(requirement_id))
    && currentEvidence.length === required.length
    && required.every((requirement) => {
      const matches = currentEvidence.filter(({ requirement_id }) => requirement_id === requirement.requirement_id);
      if (matches.length !== 1) return false;
      const entry = matches[0];
      return (
        entry.table !== undefined
        && entry.window.start === manifest.current_window.start
        && entry.window.end === manifest.current_window.end
        && entry.origin.source_id === requirement.source_id
        && entry.origin.dataset_type === requirement.dataset_type
        && entry.origin.resource_mode === requirement.resource_mode
        && entry.origin.acquisition_mode === requirement.acquisition_mode
        && entry.origin.campaign_scope === requirement.campaign_scope
        && entry.origin.dataset_schema_version === requirement.dataset_schema_version
        && entry.origin.account_identity.field === input.account_identity.field
        && entry.origin.account_identity.value === input.account_identity.value
        && entry.table.role === 'CURRENT'
        && entry.table.dataset_type === requirement.dataset_type
        && entry.table.row_count === entry.row_count
      );
    })
  );
};

const compareBaselines = (
  left: TaskPackageManifestV1,
  right: TaskPackageManifestV1,
): number => (
  right.current_window.end.localeCompare(left.current_window.end)
  || right.created_at.localeCompare(left.created_at)
  || left.package_id.localeCompare(right.package_id)
);

export class TaskPackageAssembler {
  constructor(
    private readonly evidenceResolver: EvidenceResolver,
    private readonly packageStore: PackageStore,
  ) {}

  async assemble(input: AssembleTaskPackageInput): Promise<TaskPackageAssemblyResult> {
    if (input.account_identity.field !== input.recipe.account_identity_field) {
      throw new Error('Task Package account identity does not match the recipe.');
    }
    if (input.package_id.trim().length === 0 || input.workspace_id.trim().length === 0) {
      throw new Error('Task Package identity fields must not be empty.');
    }
    if (!Number.isFinite(Date.parse(input.created_at))) {
      throw new Error('Task Package created_at must be a timestamp.');
    }
    const requirementIds = input.recipe.required_evidence.map(({ requirement_id }) => requirement_id);
    if (requirementIds.length === 0 || new Set(requirementIds).size !== requirementIds.length) {
      throw new Error('Task Package recipe requirements must be non-empty and unique.');
    }

    const currentWindow = lastCompleteCalendarDays(
      input.reference_date,
      input.recipe.current_window_days,
    );
    const resolutions = normalizeResolutions(
      input.recipe,
      await this.evidenceResolver.resolveCurrent({
        recipe: input.recipe,
        workspace_id: input.workspace_id,
        account_identity: input.account_identity,
        current_window: currentWindow,
      }),
    );
    if (resolutions.some(({ status }) => status === 'MISSING')) {
      return { status: 'NOT_READY', current_window: currentWindow, requirements: resolutions };
    }

    const stored = await this.packageStore.scanManifests();
    const ready = resolutions.filter((
      resolution,
    ): resolution is Extract<TaskPackageRequirementResolution, { status: 'READY' }> => (
      resolution.status === 'READY'
    ));
    const campaignScope = consistentValue(
      input.recipe.required_evidence.map(({ campaign_scope }) => campaign_scope),
      'campaign scope',
    );
    const datasetSchemaVersion = consistentValue(
      input.recipe.required_evidence.map(({ dataset_schema_version }) => dataset_schema_version),
      'dataset schema version',
    );
    const currentEvidence = ready.map(({ evidence: entry }) => clone<TaskPackageEvidenceEntry>(entry));
    const currentDatasets: AssembledTaskPackageDataset[] = ready.map((resolution) => ({
      requirement_id: resolution.requirement.requirement_id,
      dataset_type: resolution.requirement.dataset_type,
      role: 'CURRENT',
      rows: clone(resolution.rows),
      evidence: clone(resolution.evidence),
    }));
    const compatibleBaselines = stored.manifests
      .filter((manifest) => isCompatibleBaseline(manifest, input, currentWindow))
      .sort(compareBaselines);
    let previousManifest: TaskPackageManifestV1 | undefined;
    let previousDatasets: AssembledTaskPackageDataset[] = [];
    for (const candidate of compatibleBaselines) {
      try {
        const loaded: AssembledTaskPackageDataset[] = [];
        for (const requirement of input.recipe.required_evidence) {
          const sourceEvidence = candidate.evidence.find((entry) => (
            entry.role === 'CURRENT' && entry.requirement_id === requirement.requirement_id
          ));
          if (sourceEvidence?.table === undefined) throw new Error('Previous evidence table is missing.');
          const rows = await this.packageStore.readDatasetTable(candidate.package_id, sourceEvidence.table);
          if (rows.length !== sourceEvidence.row_count) throw new Error('Previous evidence row count is inconsistent.');
          const previousEvidence = clone<TaskPackageEvidenceEntry>(sourceEvidence);
          delete previousEvidence.table;
          previousEvidence.role = 'PREVIOUS';
          previousEvidence.source_package_id = candidate.package_id;
          loaded.push({
            requirement_id: requirement.requirement_id,
            dataset_type: requirement.dataset_type,
            role: 'PREVIOUS',
            rows: clone(rows),
            evidence: previousEvidence,
          });
        }
        previousManifest = candidate;
        previousDatasets = loaded;
        break;
      } catch {
        // A candidate that changes or fails verification after scanning remains baseline-ineligible.
      }
    }
    const isComparison = previousManifest !== undefined;
    const previousEvidence = previousDatasets.map(({ evidence: entry }) => clone(entry));
    const manifest: TaskPackageManifestV1 = {
      manifest_version: 1,
      package_id: input.package_id,
      recipe_id: input.recipe.recipe_id,
      recipe_version: input.recipe.recipe_version,
      recipe_label: input.recipe.label,
      package_kind: isComparison ? 'COMPARISON' : 'INITIAL_BASELINE',
      workspace_id: input.workspace_id,
      account_identity: clone(input.account_identity),
      customer_id: input.account_identity.value,
      created_at: input.created_at,
      application_version: input.application_version,
      campaign_scope: campaignScope,
      current_window: clone<TaskPackageWindow>(currentWindow),
      ...(previousManifest === undefined ? {} : {
        previous_package_id: previousManifest.package_id,
        previous_window: clone(previousManifest.current_window),
        gap_days: gapDays(previousManifest.current_window, currentWindow),
      }),
      dataset_schema_version: datasetSchemaVersion,
      required_datasets: [...requirementIds],
      evidence: [...currentEvidence, ...previousEvidence],
      excluded_coverage: {},
      workbook_filename: previousManifest === undefined
        ? baselineWorkbookFilename(input.reference_date)
        : comparisonWorkbookFilename(input.reference_date, previousManifest.created_at),
    };

    return {
      status: 'READY',
      package: { manifest, datasets: [...currentDatasets, ...previousDatasets] },
      requirements: resolutions,
    };
  }
}
