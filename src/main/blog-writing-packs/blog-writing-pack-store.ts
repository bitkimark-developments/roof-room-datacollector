import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import * as path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import {
  BLOG_WRITING_PACK_DATASETS,
  BLOG_WRITING_PACK_RECIPE_ID,
  BLOG_WRITING_PACK_RECIPE_VERSION,
  BLOG_WRITING_PACK_WORKBOOK_FILENAME,
  type BlogWritingPackManifest,
} from '../../shared/blog-writing-pack';
import type { DataPackage } from '../../shared/data-package';
import { writeDataPackageEvidence } from '../export/data-package-exporter';
import {
  BLOG_WRITING_PACK_RECIPE,
  isBlogWritingPackSource,
} from './blog-writing-pack-recipe';

export interface PublishedBlogWritingPack {
  package_id: string;
  manifest: BlogWritingPackManifest;
}

const exists = async (candidate: string): Promise<boolean> => {
  try {
    await lstat(candidate);
    return true;
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
};

const safeSegment = (value: string, context: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value) || value === '.' || value === '..') {
    throw new Error(`${context} is unsafe.`);
  }
  return value;
};

const inside = (root: string, relative: string, context: string): string => {
  if (path.isAbsolute(relative) || relative.includes('/') || relative.includes('\\')) {
    throw new Error(`${context} path is unsafe.`);
  }
  const candidate = path.resolve(root, relative);
  if (!candidate.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`${context} escapes the package directory.`);
  }
  return candidate;
};

const asRecord = (value: unknown, context: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const parseJson = async (filename: string, context: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(filename, 'utf8')) as unknown;
  } catch {
    throw new Error(`${context} is invalid JSON.`);
  }
};

const sameArray = (left: readonly unknown[], right: readonly unknown[]): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const requireDatasetList = (
  value: unknown,
  context: string,
): string[] => {
  if (
    !Array.isArray(value)
    || value.some((item) => typeof item !== 'string' || !BLOG_WRITING_PACK_DATASETS.includes(item as never))
    || new Set(value).size !== value.length
  ) throw new Error(`${context} is invalid.`);
  return value as string[];
};

const validateCoverage = (manifest: Record<string, unknown>): void => {
  const coverage = asRecord(manifest.coverage_by_dataset, 'Blog package coverage');
  const missing: string[] = [];
  const incomplete: string[] = [];
  let complete = true;

  for (const datasetType of BLOG_WRITING_PACK_DATASETS) {
    const item = asRecord(coverage[datasetType], `${datasetType} coverage`);
    const counts = ['total_jobs', 'accepted_jobs', 'no_data_jobs', 'incomplete_jobs']
      .map((key) => item[key]);
    if (
      (item.status !== 'COVERED' && item.status !== 'PARTIAL' && item.status !== 'MISSING')
      || counts.some((value) => !Number.isInteger(value) || (value as number) < 0)
      || (item.no_data_jobs as number) > (item.accepted_jobs as number)
      || (item.accepted_jobs as number) > (item.total_jobs as number)
      || (item.incomplete_jobs as number) > (item.total_jobs as number)
      || (item.status === 'COVERED' && (item.accepted_jobs === 0 || item.incomplete_jobs !== 0))
      || (item.status === 'PARTIAL' && (item.accepted_jobs === 0 || item.incomplete_jobs === 0))
      || (item.status === 'MISSING' && item.accepted_jobs !== 0)
    ) throw new Error('Blog package coverage is invalid.');
    if (item.status !== 'COVERED') complete = false;
    if (item.status === 'MISSING') missing.push(datasetType);
    if (item.status === 'PARTIAL') incomplete.push(datasetType);
  }
  if (Object.keys(coverage).length !== BLOG_WRITING_PACK_DATASETS.length) {
    throw new Error('Blog package coverage is invalid.');
  }
  if (
    !sameArray(requireDatasetList(manifest.missing_datasets, 'missing_datasets'), missing)
    || !sameArray(requireDatasetList(manifest.incomplete_datasets, 'incomplete_datasets'), incomplete)
    || manifest.coverage_status !== (complete ? 'COMPLETE' : 'PARTIAL')
  ) throw new Error('Blog package coverage is inconsistent.');
};

const validateManifest = (value: unknown, packageId?: string): BlogWritingPackManifest => {
  const manifest = asRecord(value, 'Blog package manifest');
  if (
    manifest.manifest_version !== 1
    || manifest.recipe_id !== BLOG_WRITING_PACK_RECIPE_ID
    || manifest.recipe_version !== BLOG_WRITING_PACK_RECIPE_VERSION
    || typeof manifest.package_id !== 'string'
    || (packageId !== undefined && manifest.package_id !== packageId)
    || typeof manifest.run_id !== 'string'
    || manifest.run_id.length === 0
    || typeof manifest.workspace_id !== 'string'
    || manifest.workspace_id.length === 0
    || typeof manifest.created_at !== 'string'
    || manifest.created_at.length === 0
    || typeof manifest.application_version !== 'string'
    || manifest.application_version.length === 0
    || manifest.workbook_filename !== BLOG_WRITING_PACK_WORKBOOK_FILENAME
    || manifest.generic_manifest_filename !== 'MANIFEST.json'
    || manifest.datasets_index_filename !== 'DATASETS.json'
    || manifest.failures_filename !== 'FAILURES.json'
    || !Array.isArray(manifest.expected_datasets)
    || manifest.expected_datasets.length !== BLOG_WRITING_PACK_DATASETS.length
    || manifest.expected_datasets.some((item, index) => item !== BLOG_WRITING_PACK_DATASETS[index])
    || (manifest.coverage_status !== 'COMPLETE' && manifest.coverage_status !== 'PARTIAL')
    || /(credential|token|secret|password|api[_-]?key|developer[_-]?token|absolute[_-]?path|provider[_-]?body)/iu.test(JSON.stringify(manifest))
  ) {
    throw new Error('Blog package manifest identity is invalid.');
  }
  requireDatasetList(manifest.present_datasets, 'present_datasets');
  requireDatasetList(manifest.no_data_datasets, 'no_data_datasets');
  validateCoverage(manifest);
  safeSegment(manifest.package_id, 'package_id');
  return JSON.parse(JSON.stringify(manifest)) as BlogWritingPackManifest;
};

const validateWorkbook = async (filename: string): Promise<void> => {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Blog package workbook is not a regular file.');
  }
  try {
    const files = unzipSync(new Uint8Array(await readFile(filename)));
    const contentTypes = files['[Content_Types].xml'];
    const workbook = files['xl/workbook.xml'];
    const worksheet = Object.entries(files).find(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(name))?.[1];
    if (
      contentTypes === undefined
      || workbook === undefined
      || worksheet === undefined
      || !strFromU8(contentTypes).includes('<Types')
      || !strFromU8(workbook).includes('<workbook')
      || !strFromU8(worksheet).includes('<worksheet')
    ) throw new Error('invalid');
  } catch {
    throw new Error('Blog package workbook XLSX structure is invalid.');
  }
};

export class BlogWritingPackStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private async validatePackage(directory: string, packageId: string): Promise<BlogWritingPackManifest> {
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error('Blog package directory is invalid.');
    }
    const blogManifestPath = inside(directory, 'BLOG_PACKAGE.json', 'Blog manifest');
    const manifest = validateManifest(await parseJson(blogManifestPath, 'BLOG_PACKAGE.json'), packageId);
    const genericManifest = asRecord(
      await parseJson(inside(directory, manifest.generic_manifest_filename, 'generic manifest'), 'MANIFEST.json'),
      'Data Package manifest',
    );
    if (genericManifest.run_id !== manifest.run_id || genericManifest.workspace_id !== manifest.workspace_id) {
      throw new Error('Blog and Data Package identity do not match.');
    }
    if (genericManifest.package_version !== 1 || genericManifest.mode !== 'ALL') {
      throw new Error('Data Package manifest is invalid.');
    }

    const indexValue = await parseJson(
      inside(directory, manifest.datasets_index_filename, 'dataset index'),
      'DATASETS.json',
    );
    if (!Array.isArray(indexValue)) throw new Error('Dataset index is invalid.');
    const datasetFilenames: string[] = [];
    const acceptedByDataset = new Map<string, number>();
    const noDataByDataset = new Map<string, number>();
    for (const value of indexValue) {
      const entry = asRecord(value, 'Dataset index entry');
      const provenance = asRecord(entry.provenance, 'Dataset index provenance');
      if (
        typeof entry.filename !== 'string'
        || typeof entry.source_id !== 'string'
        || !isBlogWritingPackSource(entry.source_id)
        || entry.dataset_type !== BLOG_WRITING_PACK_RECIPE[entry.source_id]
        || typeof entry.job_id !== 'string'
        || typeof entry.job_key !== 'string'
        || !Number.isInteger(entry.row_count)
        || (entry.row_count as number) < 0
        || provenance.source_id !== entry.source_id
        || provenance.job_id !== entry.job_id
        || provenance.job_key !== entry.job_key
        || (provenance.validation_status !== 'VALID'
          && provenance.validation_status !== 'LOW_DATA'
          && provenance.validation_status !== 'NO_DATA')
        || (provenance.validation_status === 'NO_DATA' && entry.row_count !== 0)
      ) throw new Error('Dataset index entry is invalid.');
      const datasetPath = inside(directory, entry.filename, 'Dataset index entry');
      const datasetStat = await lstat(datasetPath);
      if (!datasetStat.isFile() || datasetStat.isSymbolicLink()) {
        throw new Error('Dataset index entry is not a regular file.');
      }
      const rows = await parseJson(datasetPath, entry.filename);
      if (!Array.isArray(rows) || rows.length !== entry.row_count) {
        throw new Error('Dataset index row_count is inconsistent.');
      }
      const datasetType = entry.dataset_type as string;
      acceptedByDataset.set(datasetType, (acceptedByDataset.get(datasetType) ?? 0) + 1);
      if (provenance.validation_status === 'NO_DATA') {
        noDataByDataset.set(datasetType, (noDataByDataset.get(datasetType) ?? 0) + 1);
      }
      datasetFilenames.push(entry.filename);
    }
    if (new Set(datasetFilenames).size !== datasetFilenames.length) {
      throw new Error('Dataset index filenames must be unique.');
    }

    const presentDatasets = BLOG_WRITING_PACK_DATASETS.filter((datasetType) => (
      (acceptedByDataset.get(datasetType) ?? 0) > (noDataByDataset.get(datasetType) ?? 0)
    ));
    const noDataDatasets = BLOG_WRITING_PACK_DATASETS.filter((datasetType) => (
      (noDataByDataset.get(datasetType) ?? 0) > 0
    ));
    if (
      !sameArray(manifest.present_datasets, presentDatasets)
      || !sameArray(manifest.no_data_datasets, noDataDatasets)
      || BLOG_WRITING_PACK_DATASETS.some((datasetType) => {
        const coverage = manifest.coverage_by_dataset[datasetType];
        return coverage.accepted_jobs !== (acceptedByDataset.get(datasetType) ?? 0)
          || coverage.no_data_jobs !== (noDataByDataset.get(datasetType) ?? 0);
      })
      || genericManifest.successful_jobs !== indexValue.length
    ) throw new Error('Blog package dataset coverage is inconsistent.');

    const failuresPath = inside(directory, manifest.failures_filename, 'failures');
    const failures = await parseJson(failuresPath, 'FAILURES.json');
    if (!Array.isArray(failures)) {
      throw new Error('FAILURES.json must contain an array.');
    }
    if (genericManifest.failed_jobs !== failures.length) {
      throw new Error('Data Package failure count is inconsistent.');
    }
    await validateWorkbook(inside(directory, manifest.workbook_filename, 'workbook'));

    const allowed = new Set([
      'BLOG_PACKAGE.json',
      manifest.workbook_filename,
      manifest.generic_manifest_filename,
      manifest.datasets_index_filename,
      manifest.failures_filename,
      ...datasetFilenames,
    ]);
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some((entry) => !allowed.has(entry.name) || !entry.isFile() || entry.isSymbolicLink())) {
      throw new Error('Blog package contains an unexpected file.');
    }
    if (entries.length !== allowed.size) throw new Error('Blog package file set is incomplete.');
    return manifest;
  }

  async publish(input: {
    manifest: BlogWritingPackManifest;
    data_package: DataPackage;
    workbook_bytes: Uint8Array;
  }): Promise<PublishedBlogWritingPack> {
    const manifest = validateManifest(input.manifest);
    const packageId = manifest.package_id;
    if (
      input.data_package.manifest.run_id !== manifest.run_id
      || input.data_package.manifest.workspace_id !== manifest.workspace_id
    ) throw new Error('Blog and Data Package identity do not match.');

    await mkdir(this.root, { recursive: true });
    const finalDirectory = inside(this.root, packageId, 'package');
    if (await exists(finalDirectory)) throw new Error(`Blog package ${packageId} exists; refusing overwrite.`);
    const stagingDirectory = await mkdtemp(path.join(this.root, `.${packageId}.tmp-`));
    try {
      await writeDataPackageEvidence(stagingDirectory, input.data_package);
      await writeFile(
        inside(stagingDirectory, manifest.workbook_filename, 'workbook'),
        input.workbook_bytes,
        { flag: 'wx' },
      );
      await writeFile(
        inside(stagingDirectory, 'BLOG_PACKAGE.json', 'Blog manifest'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        { flag: 'wx' },
      );
      await this.validatePackage(stagingDirectory, packageId);
      if (await exists(finalDirectory)) throw new Error(`Blog package ${packageId} exists; refusing overwrite.`);
      await rename(stagingDirectory, finalDirectory);
      return { package_id: packageId, manifest };
    } catch (error: unknown) {
      await rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async readManifest(package_id: string): Promise<BlogWritingPackManifest> {
    const packageId = safeSegment(package_id, 'package_id');
    return this.validatePackage(inside(this.root, packageId, 'package'), packageId);
  }
}
