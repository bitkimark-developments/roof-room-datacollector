import {
  BLOG_WRITING_PACK_DATASETS,
} from '../../shared/blog-writing-pack';
import {
  isDesktopBlogWritingPackBuildIntent,
  isDesktopBlogWritingPackPackageIntent,
  type DesktopBlogWritingPackBuildResult,
  type DesktopBlogWritingPackErrorCode,
  type DesktopBlogWritingPackResponse,
} from '../../shared/desktop-blog-writing-pack';
import { DesktopBlogWritingPackControllerError } from './desktop-blog-writing-pack-controller';

const ERROR_CODES = new Set<DesktopBlogWritingPackErrorCode>([
  'INVALID_INTENT', 'UNKNOWN_RUN', 'RUN_NOT_TERMINAL', 'BUILD_FAILED',
  'PUBLICATION_FAILED', 'PACKAGE_INVALID', 'LOCAL_RESULT_INVALID',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
};

const safeId = (value: unknown): value is string => (
  typeof value === 'string'
  && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u.test(value)
  && value !== '.'
  && value !== '..'
);

const containsForbiddenKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => (
    /(credential|token|secret|password|api[_-]?key|path|raw|provider[_-]?body|stack)/iu.test(key)
    || containsForbiddenKey(nested)
  ));
};

const isDatasetArray = (value: unknown): boolean => (
  Array.isArray(value)
  && new Set(value).size === value.length
  && value.every((item) => (
    typeof item === 'string'
    && (BLOG_WRITING_PACK_DATASETS as readonly string[]).includes(item)
  ))
);

const isCoverage = (value: unknown): boolean => {
  if (!isRecord(value) || !exactKeys(value, BLOG_WRITING_PACK_DATASETS)) return false;
  return BLOG_WRITING_PACK_DATASETS.every((dataset) => {
    const item = value[dataset];
    return isRecord(item)
      && exactKeys(item, ['status', 'total_jobs', 'accepted_jobs', 'no_data_jobs', 'incomplete_jobs'])
      && (item.status === 'COVERED' || item.status === 'PARTIAL' || item.status === 'MISSING')
      && ['total_jobs', 'accepted_jobs', 'no_data_jobs', 'incomplete_jobs'].every((key) => (
        Number.isInteger(item[key]) && (item[key] as number) >= 0
      ));
  });
};

const requireSafeResult = (value: unknown): DesktopBlogWritingPackBuildResult => {
  if (!isRecord(value) || containsForbiddenKey(value)) throw new Error('Unsafe Blog result.');
  if (
    value.status === 'NOT_READY'
    && exactKeys(value, ['status', 'run_id', 'missing_datasets', 'coverage_by_dataset'])
    && safeId(value.run_id)
    && isDatasetArray(value.missing_datasets)
    && isCoverage(value.coverage_by_dataset)
  ) return JSON.parse(JSON.stringify(value)) as DesktopBlogWritingPackBuildResult;
  if (value.status === 'PACKAGE_PUBLISHED' && exactKeys(value, ['status', 'package']) && isRecord(value.package)) {
    const summary = value.package;
    if (
      exactKeys(summary, [
        'package_id', 'run_id', 'coverage_status', 'present_datasets', 'no_data_datasets',
        'incomplete_datasets', 'missing_datasets',
      ])
      && safeId(summary.package_id)
      && safeId(summary.run_id)
      && (summary.coverage_status === 'COMPLETE' || summary.coverage_status === 'PARTIAL')
      && isDatasetArray(summary.present_datasets)
      && isDatasetArray(summary.no_data_datasets)
      && isDatasetArray(summary.incomplete_datasets)
      && isDatasetArray(summary.missing_datasets)
    ) return JSON.parse(JSON.stringify(value)) as DesktopBlogWritingPackBuildResult;
  }
  throw new Error('Unsafe Blog result.');
};

const failure = <T>(code: DesktopBlogWritingPackErrorCode): DesktopBlogWritingPackResponse<T> => ({
  ok: false,
  error: { code, retryable: false },
});

const buildFailure = <T>(error: unknown): DesktopBlogWritingPackResponse<T> => (
  error instanceof DesktopBlogWritingPackControllerError && ERROR_CODES.has(error.code)
    ? failure(error.code)
    : failure('BUILD_FAILED')
);

export const createDesktopBlogWritingPackHandlers = <Event>(dependencies: {
  assertTrustedSender(event: Event): void;
  controller: { build(run_id: string): Promise<unknown> };
  open_package(package_id: string): Promise<void>;
  reveal_package(package_id: string): Promise<void>;
}) => {
  const packageAction = (
    operation: (package_id: string) => Promise<void>,
  ) => async (
    event: Event,
    value: unknown,
  ): Promise<DesktopBlogWritingPackResponse<{ package_id: string }>> => {
    dependencies.assertTrustedSender(event);
    if (!isDesktopBlogWritingPackPackageIntent(value)) return failure('INVALID_INTENT');
    try {
      await operation(value.package_id);
      return { ok: true, result: { package_id: value.package_id } };
    } catch {
      return failure('PACKAGE_INVALID');
    }
  };

  return {
    build: async (
      event: Event,
      value: unknown,
    ): Promise<DesktopBlogWritingPackResponse<DesktopBlogWritingPackBuildResult>> => {
      dependencies.assertTrustedSender(event);
      if (!isDesktopBlogWritingPackBuildIntent(value)) return failure('INVALID_INTENT');
      let result: unknown;
      try {
        result = await dependencies.controller.build(value.run_id);
      } catch (error: unknown) {
        return buildFailure(error);
      }
      try {
        return { ok: true, result: requireSafeResult(result) };
      } catch {
        return failure('LOCAL_RESULT_INVALID');
      }
    },
    open: packageAction(dependencies.open_package),
    reveal: packageAction(dependencies.reveal_package),
  };
};
