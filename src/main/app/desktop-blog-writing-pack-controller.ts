import type {
  JobRecord,
  RunRecord,
  RunStatus,
} from '../../shared/run-job';
import type {
  DesktopBlogWritingPackBuildResult,
  DesktopBlogWritingPackErrorCode,
} from '../../shared/desktop-blog-writing-pack';
import type { DataPackageInputDataset } from '../export/data-package-exporter';
import { assembleBlogWritingPack } from '../blog-writing-packs/blog-writing-pack-assembler';
import type {
  BlogWritingPackAssembly,
} from '../../shared/blog-writing-pack';

const TERMINAL_RUN_STATUSES = new Set<RunStatus>([
  'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED',
]);

export class DesktopBlogWritingPackControllerError extends Error {
  constructor(readonly code: DesktopBlogWritingPackErrorCode) {
    super(code);
  }
}

export class DesktopBlogWritingPackController {
  constructor(private readonly dependencies: {
    repository: {
      getRun(run_id: string): RunRecord | null;
      listJobs(run_id: string): JobRecord[];
    };
    loader: {
      loadRunDatasets(run_id: string): Promise<DataPackageInputDataset[]>;
    };
    publish(assembly: BlogWritingPackAssembly): Promise<{ package_id: string }>;
    now(): string;
    application_version: string;
    create_package_id(): string;
  }) {}

  async build(run_id: string): Promise<DesktopBlogWritingPackBuildResult> {
    if (typeof run_id !== 'string' || run_id.trim().length === 0 || run_id !== run_id.trim()) {
      throw new DesktopBlogWritingPackControllerError('INVALID_INTENT');
    }
    const run = this.dependencies.repository.getRun(run_id);
    if (run === null) throw new DesktopBlogWritingPackControllerError('UNKNOWN_RUN');
    if (!TERMINAL_RUN_STATUSES.has(run.run_status)) {
      throw new DesktopBlogWritingPackControllerError('RUN_NOT_TERMINAL');
    }

    let result;
    try {
      result = assembleBlogWritingPack({
        package_id: this.dependencies.create_package_id(),
        created_at: this.dependencies.now(),
        application_version: this.dependencies.application_version,
        run,
        jobs: this.dependencies.repository.listJobs(run_id),
        datasets: await this.dependencies.loader.loadRunDatasets(run_id),
      });
    } catch {
      throw new DesktopBlogWritingPackControllerError('BUILD_FAILED');
    }

    if (result.status === 'NOT_READY') {
      return {
        status: 'NOT_READY',
        run_id: result.run_id,
        missing_datasets: result.missing_datasets,
        coverage_by_dataset: result.coverage_by_dataset,
      };
    }

    try {
      const published = await this.dependencies.publish(result.assembly);
      if (published.package_id !== result.assembly.manifest.package_id) {
        throw new Error('Published Blog package identity mismatch.');
      }
    } catch {
      throw new DesktopBlogWritingPackControllerError('PUBLICATION_FAILED');
    }

    const manifest = result.assembly.manifest;
    return {
      status: 'PACKAGE_PUBLISHED',
      package: {
        package_id: manifest.package_id,
        run_id: manifest.run_id,
        coverage_status: manifest.coverage_status,
        present_datasets: manifest.present_datasets,
        no_data_datasets: manifest.no_data_datasets,
        incomplete_datasets: manifest.incomplete_datasets,
        missing_datasets: manifest.missing_datasets,
      },
    };
  }
}
