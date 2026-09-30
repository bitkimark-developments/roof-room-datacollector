import type {
  TaskPackageAccountIdentity,
  TaskPackageDatasetTableReference,
  TaskPackageEvidenceEntry,
  TaskPackageEvidenceOrigin,
  TaskPackageEvidenceTransformation,
  TaskPackageManifestV1,
  TaskPackageRole,
  TaskPackageWindow,
} from '../../shared/task-package';
import { countCalendarDays, gapDays } from './task-package-window';

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;
const ACCEPTED_VALIDATION = new Set(['VALID', 'LOW_DATA', 'NO_DATA']);
const DISPOSITIONS = new Set(['COLLECTED', 'REUSED_EXACT', 'REUSED_FILTERED', 'NO_DATA']);
const FORBIDDEN_KEYS = /^(?:oauth_token|access_token|refresh_token|developer_token|client_secret|secret|password|api_key|recommendation|recommendation_score|score|delta|action|cpa|roas|winner|loser|go_pause)$/iu;

const object = (value: unknown, context: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const exactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void => {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(`${context} contains unknown field ${key}.`);
  }
};

const rejectForbiddenKeys = (value: unknown, context = 'manifest'): void => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbiddenKeys(entry, `${context}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.test(key)) throw new Error(`${context} contains forbidden field ${key}.`);
    rejectForbiddenKeys(nested, `${context}.${key}`);
  }
};

const string = (value: unknown, context: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value;
};

const integer = (value: unknown, context: string, minimum = 0): number => {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(`${context} must be an integer >= ${minimum}.`);
  }
  return value as number;
};

const literal = <T extends string | number>(
  value: unknown,
  expected: T,
  context: string,
): T => {
  if (value !== expected) throw new Error(`${context} must equal ${String(expected)}.`);
  return expected;
};

const timestamp = (value: unknown, context: string): string => {
  const result = string(value, context);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${context} must be a timestamp.`);
  return result;
};

const dateWindow = (value: unknown, context: string): TaskPackageWindow => {
  const record = object(value, context);
  exactKeys(record, ['start', 'end'], context);
  const result = { start: string(record.start, `${context}.start`), end: string(record.end, `${context}.end`) };
  if (countCalendarDays(result) < 1) throw new Error(`${context} must be a valid inclusive date window.`);
  return result;
};

const sevenDayWindow = (value: unknown, context: string): TaskPackageWindow => {
  const result = dateWindow(value, context);
  if (countCalendarDays(result) !== 7) throw new Error(`${context} must contain exactly seven calendar days.`);
  return result;
};

const safeRelativePath = (value: unknown, context: string): string => {
  const result = string(value, context);
  if (
    result.startsWith('/')
    || result.includes('\\')
    || result.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`${context} must be a safe relative path.`);
  }
  return result;
};

const accountIdentity = (value: unknown, context: string): TaskPackageAccountIdentity => {
  const record = object(value, context);
  exactKeys(record, ['field', 'value'], context);
  return { field: string(record.field, `${context}.field`), value: string(record.value, `${context}.value`) };
};

const tableReference = (
  value: unknown,
  context: string,
): TaskPackageDatasetTableReference => {
  const record = object(value, context);
  exactKeys(record, ['filename', 'sha256', 'row_count', 'role', 'dataset_type'], context);
  const role = string(record.role, `${context}.role`);
  if (role !== 'CURRENT' && role !== 'PREVIOUS') throw new Error(`${context}.role is invalid.`);
  const sha256 = string(record.sha256, `${context}.sha256`);
  if (!SHA256.test(sha256)) throw new Error(`${context}.sha256 is invalid.`);
  return {
    filename: safeRelativePath(record.filename, `${context}.filename`),
    sha256,
    row_count: integer(record.row_count, `${context}.row_count`),
    role,
    dataset_type: string(record.dataset_type, `${context}.dataset_type`),
  };
};

const origin = (value: unknown, context: string): TaskPackageEvidenceOrigin => {
  const record = object(value, context);
  exactKeys(record, [
    'run_id', 'job_id', 'attempt_number', 'artifact_id', 'artifact_sha256', 'acquired_at',
    'validation_status', 'source_id', 'dataset_type', 'resource_mode', 'acquisition_mode',
    'campaign_scope', 'dataset_schema_version', 'account_identity', 'snapshot_observed_at',
  ], context);
  const artifactSha256 = string(record.artifact_sha256, `${context}.artifact_sha256`);
  if (!SHA256.test(artifactSha256)) throw new Error(`${context}.artifact_sha256 is invalid.`);
  const validationStatus = string(record.validation_status, `${context}.validation_status`);
  if (!ACCEPTED_VALIDATION.has(validationStatus)) throw new Error(`${context}.validation_status is not export eligible.`);
  return {
    run_id: string(record.run_id, `${context}.run_id`),
    job_id: string(record.job_id, `${context}.job_id`),
    attempt_number: integer(record.attempt_number, `${context}.attempt_number`, 1),
    artifact_id: string(record.artifact_id, `${context}.artifact_id`),
    artifact_sha256: artifactSha256,
    acquired_at: timestamp(record.acquired_at, `${context}.acquired_at`),
    validation_status: validationStatus,
    source_id: string(record.source_id, `${context}.source_id`),
    dataset_type: string(record.dataset_type, `${context}.dataset_type`),
    resource_mode: string(record.resource_mode, `${context}.resource_mode`),
    acquisition_mode: string(record.acquisition_mode, `${context}.acquisition_mode`),
    campaign_scope: string(record.campaign_scope, `${context}.campaign_scope`),
    dataset_schema_version: integer(record.dataset_schema_version, `${context}.dataset_schema_version`, 1),
    account_identity: accountIdentity(record.account_identity, `${context}.account_identity`),
    snapshot_observed_at: timestamp(record.snapshot_observed_at, `${context}.snapshot_observed_at`),
  };
};

const transformation = (
  value: unknown,
  context: string,
): TaskPackageEvidenceTransformation => {
  const record = object(value, context);
  const kind = string(record.kind, `${context}.kind`);
  if (kind === 'NONE') {
    exactKeys(record, ['kind'], context);
    return { kind: 'NONE' };
  }
  if (kind !== 'DATE_FILTER') throw new Error(`${context}.kind is invalid.`);
  exactKeys(record, [
    'kind', 'row_date_field', 'input_window', 'output_window', 'input_row_count', 'output_row_count',
  ], context);
  return {
    kind: 'DATE_FILTER',
    row_date_field: string(record.row_date_field, `${context}.row_date_field`),
    input_window: dateWindow(record.input_window, `${context}.input_window`),
    output_window: sevenDayWindow(record.output_window, `${context}.output_window`),
    input_row_count: integer(record.input_row_count, `${context}.input_row_count`),
    output_row_count: integer(record.output_row_count, `${context}.output_row_count`),
  };
};

const evidenceEntry = (value: unknown, index: number): TaskPackageEvidenceEntry => {
  const context = `manifest.evidence[${index}]`;
  const record = object(value, context);
  exactKeys(record, [
    'requirement_id', 'role', 'disposition', 'window', 'origin', 'transformation',
    'row_count', 'source_package_id', 'table',
  ], context);
  const role = string(record.role, `${context}.role`);
  if (role !== 'CURRENT' && role !== 'PREVIOUS') throw new Error(`${context}.role is invalid.`);
  const disposition = string(record.disposition, `${context}.disposition`);
  if (!DISPOSITIONS.has(disposition)) throw new Error(`${context}.disposition is invalid.`);
  const parsedOrigin = origin(record.origin, `${context}.origin`);
  const parsedTransformation = transformation(record.transformation, `${context}.transformation`);
  const parsedTable = tableReference(record.table, `${context}.table`);
  const rowCount = integer(record.row_count, `${context}.row_count`);
  const requirementId = string(record.requirement_id, `${context}.requirement_id`);
  if (
    parsedOrigin.dataset_type !== requirementId
    || parsedTable.dataset_type !== requirementId
    || parsedTable.role !== role
    || parsedTable.row_count !== rowCount
  ) {
    throw new Error(`${context} dataset/table identity is inconsistent.`);
  }
  if (disposition === 'NO_DATA' && (rowCount !== 0 || parsedOrigin.validation_status !== 'NO_DATA')) {
    throw new Error(`${context} NO_DATA evidence is inconsistent.`);
  }
  if (parsedTransformation.kind === 'DATE_FILTER' && parsedTransformation.output_row_count !== rowCount) {
    throw new Error(`${context} filtered row counts are inconsistent.`);
  }
  const sourcePackageId = record.source_package_id === undefined
    ? undefined
    : string(record.source_package_id, `${context}.source_package_id`);
  if ((role === 'PREVIOUS') !== (sourcePackageId !== undefined)) {
    throw new Error(`${context} previous source package identity is inconsistent.`);
  }
  return {
    requirement_id: requirementId,
    role,
    disposition: disposition as TaskPackageEvidenceEntry['disposition'],
    window: sevenDayWindow(record.window, `${context}.window`),
    origin: parsedOrigin,
    transformation: parsedTransformation,
    row_count: rowCount,
    ...(sourcePackageId === undefined ? {} : { source_package_id: sourcePackageId }),
    table: parsedTable,
  };
};

const parseStringArray = (value: unknown, context: string): string[] => {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array.`);
  return value.map((entry, index) => string(entry, `${context}[${index}]`));
};

const parseExcludedCoverage = (value: unknown): Record<string, string> => {
  const record = object(value, 'manifest.excluded_coverage');
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [
    string(key, 'manifest.excluded_coverage key'),
    string(entry, `manifest.excluded_coverage.${key}`),
  ]));
};

export const parseTaskPackageManifest = (value: unknown): TaskPackageManifestV1 => {
  rejectForbiddenKeys(value);
  const record = object(value, 'manifest');
  exactKeys(record, [
    'manifest_version', 'package_id', 'recipe_id', 'recipe_version', 'recipe_label',
    'package_kind', 'workspace_id', 'account_identity', 'customer_id', 'created_at',
    'application_version', 'campaign_scope', 'current_window', 'previous_package_id',
    'previous_window', 'gap_days', 'dataset_schema_version', 'required_datasets',
    'evidence', 'excluded_coverage', 'workbook_filename',
  ], 'manifest');
  literal(record.manifest_version, 1, 'manifest.manifest_version');
  const packageId = string(record.package_id, 'manifest.package_id');
  if (!SAFE_SEGMENT.test(packageId) || packageId === '.' || packageId === '..') {
    throw new Error('manifest.package_id is unsafe.');
  }
  literal(record.recipe_id, 'ADS_OPTIMIZATION_PACK', 'manifest.recipe_id');
  literal(record.recipe_version, 1, 'manifest.recipe_version');
  const packageKind = string(record.package_kind, 'manifest.package_kind');
  if (packageKind !== 'INITIAL_BASELINE' && packageKind !== 'COMPARISON') {
    throw new Error('manifest.package_kind is invalid.');
  }
  const identity = accountIdentity(record.account_identity, 'manifest.account_identity');
  const customerId = string(record.customer_id, 'manifest.customer_id');
  if (identity.field !== 'customer_id' || identity.value !== customerId) {
    throw new Error('manifest customer identity is inconsistent.');
  }
  const currentWindow = sevenDayWindow(record.current_window, 'manifest.current_window');
  const requiredDatasets = parseStringArray(record.required_datasets, 'manifest.required_datasets');
  if (requiredDatasets.length !== 6 || new Set(requiredDatasets).size !== 6) {
    throw new Error('manifest.required_datasets must contain six unique datasets.');
  }
  if (!Array.isArray(record.evidence)) throw new Error('manifest.evidence must be an array.');
  const evidence = record.evidence.map(evidenceEntry);
  const roles: TaskPackageRole[] = packageKind === 'COMPARISON' ? ['CURRENT', 'PREVIOUS'] : ['CURRENT'];
  if (evidence.length !== requiredDatasets.length * roles.length) {
    throw new Error('manifest.evidence does not cover every required dataset and role.');
  }
  for (const role of roles) {
    const entries = evidence.filter((entry) => entry.role === role);
    if (
      entries.length !== requiredDatasets.length
      || new Set(entries.map(({ requirement_id }) => requirement_id)).size !== requiredDatasets.length
      || entries.some(({ requirement_id }) => !requiredDatasets.includes(requirement_id))
    ) {
      throw new Error(`manifest.evidence ${role} coverage is invalid.`);
    }
    const expectedWindow = role === 'CURRENT' ? currentWindow : sevenDayWindow(record.previous_window, 'manifest.previous_window');
    if (entries.some((entry) => entry.window.start !== expectedWindow.start || entry.window.end !== expectedWindow.end)) {
      throw new Error(`manifest.evidence ${role} window is inconsistent.`);
    }
  }

  let previousPackageId: string | undefined;
  let previousWindow: TaskPackageWindow | undefined;
  let parsedGapDays: number | undefined;
  if (packageKind === 'COMPARISON') {
    previousPackageId = string(record.previous_package_id, 'manifest.previous_package_id');
    previousWindow = sevenDayWindow(record.previous_window, 'manifest.previous_window');
    parsedGapDays = integer(record.gap_days, 'manifest.gap_days');
    if (gapDays(previousWindow, currentWindow) !== parsedGapDays) {
      throw new Error('manifest.gap_days is inconsistent with package windows.');
    }
  } else if (
    record.previous_package_id !== undefined
    || record.previous_window !== undefined
    || record.gap_days !== undefined
    || evidence.some(({ role }) => role === 'PREVIOUS')
  ) {
    throw new Error('INITIAL_BASELINE manifest must not contain previous package evidence.');
  }

  const workbookFilename = safeRelativePath(record.workbook_filename, 'manifest.workbook_filename');
  if (workbookFilename.includes('/') || !workbookFilename.endsWith('.xlsx')) {
    throw new Error('manifest.workbook_filename must be a package-root XLSX filename.');
  }
  return {
    manifest_version: 1,
    package_id: packageId,
    recipe_id: 'ADS_OPTIMIZATION_PACK',
    recipe_version: 1,
    recipe_label: string(record.recipe_label, 'manifest.recipe_label'),
    package_kind: packageKind,
    workspace_id: string(record.workspace_id, 'manifest.workspace_id'),
    account_identity: identity,
    customer_id: customerId,
    created_at: timestamp(record.created_at, 'manifest.created_at'),
    application_version: string(record.application_version, 'manifest.application_version'),
    campaign_scope: literal(record.campaign_scope, 'SEARCH', 'manifest.campaign_scope'),
    current_window: currentWindow,
    ...(previousPackageId === undefined ? {} : {
      previous_package_id: previousPackageId,
      previous_window: previousWindow,
      gap_days: parsedGapDays,
    }),
    dataset_schema_version: literal(record.dataset_schema_version, 1, 'manifest.dataset_schema_version'),
    required_datasets: requiredDatasets,
    evidence,
    excluded_coverage: parseExcludedCoverage(record.excluded_coverage),
    workbook_filename: workbookFilename,
  };
};
