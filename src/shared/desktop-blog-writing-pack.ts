import type {
  BlogWritingPackCoverageByDataset,
  BlogWritingPackDatasetType,
} from './blog-writing-pack';

export interface DesktopBlogWritingPackBuildIntent {
  run_id: string;
}

export interface DesktopBlogWritingPackPackageIntent {
  package_id: string;
}

export type DesktopBlogWritingPackBuildResult =
  | {
      status: 'NOT_READY';
      run_id: string;
      missing_datasets: BlogWritingPackDatasetType[];
      coverage_by_dataset: BlogWritingPackCoverageByDataset;
    }
  | {
      status: 'PACKAGE_PUBLISHED';
      package: {
        package_id: string;
        run_id: string;
        coverage_status: 'COMPLETE' | 'PARTIAL';
        present_datasets: BlogWritingPackDatasetType[];
        no_data_datasets: BlogWritingPackDatasetType[];
        incomplete_datasets: BlogWritingPackDatasetType[];
        missing_datasets: BlogWritingPackDatasetType[];
      };
    };

export type DesktopBlogWritingPackErrorCode =
  | 'INVALID_INTENT'
  | 'UNKNOWN_RUN'
  | 'RUN_NOT_TERMINAL'
  | 'BUILD_FAILED'
  | 'PUBLICATION_FAILED'
  | 'PACKAGE_INVALID'
  | 'LOCAL_RESULT_INVALID';

export type DesktopBlogWritingPackResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error: { code: DesktopBlogWritingPackErrorCode; retryable: false } };

const exactObject = (value: unknown, key: 'run_id' | 'package_id'): value is Record<string, string> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && Object.keys(value).length === 1
  && Object.hasOwn(value, key)
  && typeof (value as Record<string, unknown>)[key] === 'string'
);

const safeId = (value: string): boolean => (
  /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u.test(value)
  && value !== '.'
  && value !== '..'
);

export const isDesktopBlogWritingPackBuildIntent = (
  value: unknown,
): value is DesktopBlogWritingPackBuildIntent => (
  exactObject(value, 'run_id') && safeId(value.run_id)
);

export const isDesktopBlogWritingPackPackageIntent = (
  value: unknown,
): value is DesktopBlogWritingPackPackageIntent => (
  exactObject(value, 'package_id') && safeId(value.package_id)
);
