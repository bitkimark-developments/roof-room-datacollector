import { createHash } from 'node:crypto';
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
import type {
  TaskPackageDatasetTableReference,
  TaskPackageEvidenceEntry,
  TaskPackageManifestV1,
  TaskPackageRole,
} from '../../shared/task-package';
import { parseTaskPackageManifest } from './task-package-manifest';

export interface StoredPackageRejection {
  package_id: string;
  code: string;
}

export interface PublishTaskPackageDataset {
  role: TaskPackageRole;
  dataset_type: string;
  rows: Array<Record<string, unknown>>;
}

export interface PublishTaskPackageFile {
  filename: string;
  bytes: Uint8Array;
}

export interface PublishTaskPackageInput {
  manifest: TaskPackageManifestV1;
  datasets: readonly PublishTaskPackageDataset[];
  files: readonly PublishTaskPackageFile[];
}

export interface PublishedTaskPackage {
  package_id: string;
  package_directory: string;
  manifest_path: string;
  manifest: TaskPackageManifestV1;
}

const safeSegment = (value: string, context: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value) || value === '.' || value === '..') {
    throw new Error(`${context} is unsafe.`);
  }
  return value;
};

const safeRelativePath = (value: string, context: string): string => {
  if (
    value.length === 0
    || path.isAbsolute(value)
    || value.includes('\\')
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`${context} is unsafe.`);
  }
  return value;
};

const inside = (root: string, relative: string, context: string): string => {
  const candidate = path.resolve(root, relative);
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (!candidate.startsWith(prefix)) throw new Error(`${context} escapes the package directory.`);
  return candidate;
};

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const datasetFilename = (role: TaskPackageRole, datasetType: string): string => (
  `datasets/${role.toLowerCase()}-${datasetType.toLowerCase().replace(/_/gu, '-')}.json`
);

const exists = async (candidate: string): Promise<boolean> => {
  try {
    await lstat(candidate);
    return true;
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
};

export class TaskPackageStore {
  private readonly root: string;

  constructor(packages_root: string) {
    this.root = path.resolve(packages_root);
  }

  async scanManifests(): Promise<{
    manifests: TaskPackageManifestV1[];
    rejected: StoredPackageRejection[];
  }> {
    if (!(await exists(this.root))) return { manifests: [], rejected: [] };
    const entries = (await readdir(this.root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .sort((left, right) => left.name.localeCompare(right.name));
    const manifests: TaskPackageManifestV1[] = [];
    const rejected: StoredPackageRejection[] = [];
    for (const entry of entries) {
      try {
        safeSegment(entry.name, 'stored package_id');
        const packageDirectory = inside(this.root, entry.name, 'stored package');
        const manifestPath = inside(packageDirectory, 'MANIFEST.json', 'stored manifest');
        const manifestStat = await lstat(manifestPath);
        if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
          throw new Error('Stored manifest is not a regular file.');
        }
        const manifest = parseTaskPackageManifest(JSON.parse(await readFile(manifestPath, 'utf8')) as unknown);
        if (manifest.package_id !== entry.name) throw new Error('Stored manifest package_id does not match its directory.');
        const workbookPath = inside(
          packageDirectory,
          safeRelativePath(manifest.workbook_filename, 'workbook filename'),
          'stored workbook',
        );
        const workbookStat = await lstat(workbookPath);
        if (!workbookStat.isFile() || workbookStat.isSymbolicLink()) {
          throw new Error('Stored workbook is not a regular file.');
        }
        for (const evidence of manifest.evidence) {
          if (evidence.table === undefined) throw new Error('Stored evidence has no dataset table.');
          await this.readDatasetTable(manifest.package_id, evidence.table);
        }
        manifests.push(manifest);
      } catch (error: unknown) {
        rejected.push({
          package_id: entry.name,
          code: error instanceof Error ? error.message : 'INVALID_STORED_PACKAGE',
        });
      }
    }
    return { manifests, rejected };
  }

  async readDatasetTable(
    package_id: string,
    reference: TaskPackageDatasetTableReference,
  ): Promise<Array<Record<string, unknown>>> {
    const packageDirectory = inside(this.root, safeSegment(package_id, 'package_id'), 'package');
    const filename = safeRelativePath(reference.filename, 'dataset table filename');
    const tablePath = inside(packageDirectory, filename, 'dataset table');
    const tableStat = await lstat(tablePath);
    if (!tableStat.isFile() || tableStat.isSymbolicLink()) {
      throw new Error('Dataset table is not a regular file.');
    }
    const bytes = new Uint8Array(await readFile(tablePath));
    if (sha256(bytes) !== reference.sha256) throw new Error('Dataset table checksum mismatch.');
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    if (!Array.isArray(parsed) || parsed.some((row) => typeof row !== 'object' || row === null || Array.isArray(row))) {
      throw new Error('Dataset table must contain an array of objects.');
    }
    if (parsed.length !== reference.row_count) throw new Error('Dataset table row count mismatch.');
    return JSON.parse(JSON.stringify(parsed)) as Array<Record<string, unknown>>;
  }

  async publishPackage(input: PublishTaskPackageInput): Promise<PublishedTaskPackage> {
    const packageId = safeSegment(input.manifest.package_id, 'package_id');
    await mkdir(this.root, { recursive: true });
    const finalDirectory = inside(this.root, packageId, 'package');
    if (await exists(finalDirectory)) throw new Error(`Task Package ${packageId} already exists; refusing overwrite.`);
    const stagingDirectory = await mkdtemp(path.join(this.root, `.${packageId}.tmp-`));
    try {
      const evidence = input.manifest.evidence.map((entry): TaskPackageEvidenceEntry => ({
        ...entry,
        table: undefined,
      }));
      const datasetsByKey = new Map(input.datasets.map((dataset) => [
        `${dataset.role}:${dataset.dataset_type}`,
        dataset,
      ]));
      if (datasetsByKey.size !== input.datasets.length) throw new Error('Duplicate package dataset role/type.');
      for (const entry of evidence) {
        const key = `${entry.role}:${entry.requirement_id}`;
        const dataset = datasetsByKey.get(key);
        if (dataset === undefined) throw new Error(`Missing package dataset ${key}.`);
        const filename = datasetFilename(dataset.role, dataset.dataset_type);
        const serialized = `${JSON.stringify(dataset.rows, null, 2)}\n`;
        const bytes = new TextEncoder().encode(serialized);
        const target = inside(stagingDirectory, filename, 'dataset table');
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: 'wx' });
        entry.table = {
          filename,
          sha256: sha256(bytes),
          row_count: dataset.rows.length,
          role: dataset.role,
          dataset_type: dataset.dataset_type,
        };
        entry.row_count = dataset.rows.length;
      }
      if (datasetsByKey.size !== evidence.length) throw new Error('Unexpected package dataset input.');
      for (const file of input.files) {
        const filename = safeRelativePath(file.filename, 'package file');
        if (filename === 'MANIFEST.json' || filename.startsWith('datasets/')) {
          throw new Error(`Reserved package file: ${filename}`);
        }
        const target = inside(stagingDirectory, filename, 'package file');
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.bytes, { flag: 'wx' });
      }
      const manifest = parseTaskPackageManifest({ ...input.manifest, evidence });
      if (!input.files.some(({ filename }) => filename === manifest.workbook_filename)) {
        throw new Error('Package workbook file is missing.');
      }
      const manifestPath = inside(stagingDirectory, 'MANIFEST.json', 'manifest');
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
      if (await exists(finalDirectory)) throw new Error(`Task Package ${packageId} already exists; refusing overwrite.`);
      await rename(stagingDirectory, finalDirectory);
      return {
        package_id: packageId,
        package_directory: finalDirectory,
        manifest_path: path.join(finalDirectory, 'MANIFEST.json'),
        manifest,
      };
    } catch (error: unknown) {
      await rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }
}
