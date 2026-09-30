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
import { lastCompleteCalendarDays } from './task-package-window';

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

    await this.packageStore.scanManifests();
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
    const evidence = ready.map(({ evidence: entry }) => clone<TaskPackageEvidenceEntry>(entry));
    const datasets: AssembledTaskPackageDataset[] = ready.map((resolution) => ({
      requirement_id: resolution.requirement.requirement_id,
      dataset_type: resolution.requirement.dataset_type,
      role: 'CURRENT',
      rows: clone(resolution.rows),
      evidence: clone(resolution.evidence),
    }));
    const manifest: TaskPackageManifestV1 = {
      manifest_version: 1,
      package_id: input.package_id,
      recipe_id: input.recipe.recipe_id,
      recipe_version: input.recipe.recipe_version,
      recipe_label: input.recipe.label,
      package_kind: 'INITIAL_BASELINE',
      workspace_id: input.workspace_id,
      account_identity: clone(input.account_identity),
      customer_id: input.account_identity.value,
      created_at: input.created_at,
      application_version: input.application_version,
      campaign_scope: campaignScope,
      current_window: clone<TaskPackageWindow>(currentWindow),
      dataset_schema_version: datasetSchemaVersion,
      required_datasets: [...requirementIds],
      evidence,
      excluded_coverage: {},
      workbook_filename: baselineWorkbookFilename(input.reference_date),
    };

    return {
      status: 'READY',
      package: { manifest, datasets },
      requirements: resolutions,
    };
  }
}
