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

    const indexValue = await parseJson(
      inside(directory, manifest.datasets_index_filename, 'dataset index'),
      'DATASETS.json',
    );
    if (!Array.isArray(indexValue)) throw new Error('Dataset index is invalid.');
    const datasetFilenames: string[] = [];
    for (const value of indexValue) {
      const entry = asRecord(value, 'Dataset index entry');
      if (typeof entry.filename !== 'string') throw new Error('Dataset index filename is invalid.');
      const datasetPath = inside(directory, entry.filename, 'Dataset index entry');
      const datasetStat = await lstat(datasetPath);
      if (!datasetStat.isFile() || datasetStat.isSymbolicLink()) {
        throw new Error('Dataset index entry is not a regular file.');
      }
      datasetFilenames.push(entry.filename);
    }
    if (new Set(datasetFilenames).size !== datasetFilenames.length) {
      throw new Error('Dataset index filenames must be unique.');
    }

    const failuresPath = inside(directory, manifest.failures_filename, 'failures');
    if (!Array.isArray(await parseJson(failuresPath, 'FAILURES.json'))) {
      throw new Error('FAILURES.json must contain an array.');
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
