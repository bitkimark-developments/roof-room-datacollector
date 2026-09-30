import type { JsonObject, JobPlan } from '../../shared/run-job';
import type { DesktopRunState } from '../../shared/desktop-multisource';
import type { WorkspaceReadinessStatus } from '../../shared/readiness';
import type { DesktopTaskPackageDefinition } from '../../shared/desktop-task-package';
import type { AssembledTaskPackage } from '../../shared/task-package';
import {
  GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES,
  type GoogleAdsSearchReportingDatasetType,
} from '../../shared/google-ads-search-reporting';
import { createGoogleAdsReportingJobContext } from '../sources/google-ads/search-reporting-request';
import type { StateRepository } from '../storage/state-repository';
import { TaskPackageAssembler } from '../task-packages/task-package-assembler';
import {
  TaskPackageEvidenceResolver,
  type TaskPackageDatasetLoader,
} from '../task-packages/task-package-evidence-resolver';
import { TaskPackageStore } from '../task-packages/task-package-store';
import { ADS_OPTIMIZATION_PACK_V1_RECIPE } from '../task-packages/ads-optimization-pack-recipe';
import { writeAdsOptimizationPackage } from '../export/ads-optimization-pack-exporter';
import type { DesktopExecutionService } from './desktop-execution-service';
import { resolveTaskPackageWorkbook } from './application-file-access';
import { DesktopTaskPackageController } from './desktop-task-package-controller';

const normalizeCustomerId = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Google Ads customer_id is missing.');
  const normalized = value.trim().replace(/-/gu, '');
  if (!/^\d+$/u.test(normalized)) {
    throw new Error('Google Ads customer_id must contain only digits or hyphens.');
  }
  return normalized;
};

const isDatasetType = (value: string): value is GoogleAdsSearchReportingDatasetType => (
  (GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES as readonly string[]).includes(value)
);

export const createAdsOptimizationPackDesktopDefinition = (dependencies: {
  publish_package: (taskPackage: AssembledTaskPackage) => Promise<{ package_id: string }>;
}): DesktopTaskPackageDefinition => ({
  recipe: ADS_OPTIMIZATION_PACK_V1_RECIPE,
  connection_source_id: 'google-ads-search-terms',
  normalize_account_identity: (safeMetadata) => ({
    field: 'customer_id',
    value: normalizeCustomerId(safeMetadata.customer_id),
  }),
  build_job_plan: ({ requirement, account_identity, current_window }): JobPlan => {
    if (!isDatasetType(requirement.dataset_type)) {
      throw new Error('ADS_OPTIMIZATION_PACK contains an unsupported dataset type.');
    }
    return {
      source_id: 'google-ads-search-reporting',
      job_key: requirement.dataset_type,
      query_group_id: null,
      source_context: {
        ...createGoogleAdsReportingJobContext({
          dataset_type: requirement.dataset_type,
          customer_id: account_identity.value,
          requested_date_start: current_window.start,
          requested_date_end: current_window.end,
        }),
      } as JsonObject,
    };
  },
  publish_package: dependencies.publish_package,
});

type CompositionRepository = Pick<
  StateRepository,
  | 'getWorkspace'
  | 'getSourceConnection'
  | 'listRuns'
  | 'listJobs'
  | 'getArtifact'
  | 'reserveRunFromJobPlans'
>;

export const createAdsOptimizationPackDesktopComposition = (dependencies: {
  repository: CompositionRepository;
  dataset_loader: TaskPackageDatasetLoader;
  packages_root: string;
  get_connection_readiness: (
    workspace_id: string,
    source_id: string,
  ) => Promise<WorkspaceReadinessStatus>;
  execution_service: Pick<DesktopExecutionService, 'execute'>;
  get_run_state: (run_id: string) => DesktopRunState;
  open_workbook: (workbook_path: string) => Promise<void>;
  reference_date: () => string;
  now: () => string;
  create_package_id: () => string;
  application_version: string;
}) => {
  const store = new TaskPackageStore(dependencies.packages_root);
  const resolver = new TaskPackageEvidenceResolver(
    dependencies.repository,
    dependencies.dataset_loader,
  );
  const assembler = new TaskPackageAssembler(resolver, store);
  const definition = createAdsOptimizationPackDesktopDefinition({
    publish_package: async (taskPackage) => {
      const published = await writeAdsOptimizationPackage(store, taskPackage);
      return { package_id: published.package_id };
    },
  });
  const controller = new DesktopTaskPackageController({
    definitions: [definition],
    repository: dependencies.repository,
    assembler,
    store,
    get_connection_readiness: dependencies.get_connection_readiness,
    reference_date: dependencies.reference_date,
    now: dependencies.now,
    application_version: dependencies.application_version,
    create_package_id: dependencies.create_package_id,
    execute_run: (runId) => dependencies.execution_service.execute(runId),
    get_run_state: dependencies.get_run_state,
  });
  return {
    controller,
    open_package: async (packageId: string): Promise<string> => {
      const workbookPath = await resolveTaskPackageWorkbook(
        dependencies.packages_root,
        packageId,
      );
      await dependencies.open_workbook(workbookPath);
      return workbookPath;
    },
  };
};
