import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';

import type {
  ApplicationDirectories,
} from '../../shared/bootstrap-status';
import { BlogWritingPackStore } from '../blog-writing-packs/blog-writing-pack-store';
import { TaskPackageStore } from '../task-packages/task-package-store';

const WORKBOOK_PATTERN =
  /^ROOFROOM_SEARCH_DEMAND_RAW_\d{4}-\d{2}-\d{2}\.xlsx$/u;

const isInside = (
  root: string,
  candidate: string,
): boolean => {
  const relative =
    path.relative(
      root,
      candidate,
    );

  return (
    relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(
      `..${path.sep}`,
    ) &&
    !path.isAbsolute(
      relative,
    )
  );
};

export const findLatestExportWorkbook = async (
  directories:
    ApplicationDirectories,
): Promise<string | null> => {
  const runsRoot =
    await realpath(
      directories.runs,
    );
  const runEntries =
    await readdir(
      runsRoot,
      {
        withFileTypes: true,
      },
    );

  const runNames =
    runEntries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith(
            'rr_',
          ),
      )
      .map(
        (entry) =>
          entry.name,
      )
      .sort()
      .reverse();

  for (const runName of
    runNames) {
    const exportDirectory =
      path.join(
        runsRoot,
        runName,
        'exports',
      );

    let exportEntries;

    try {
      exportEntries =
        await readdir(
          exportDirectory,
          {
            withFileTypes:
              true,
          },
        );
    } catch {
      continue;
    }

    const workbookNames =
      exportEntries
        .filter(
          (entry) =>
            entry.isFile() &&
            WORKBOOK_PATTERN.test(
              entry.name,
            ),
        )
        .map(
          (entry) =>
            entry.name,
        )
        .sort()
        .reverse();

    for (const workbookName of
      workbookNames) {
      const workbookPath =
        await realpath(
          path.join(
            exportDirectory,
            workbookName,
          ),
        );

      if (
        !isInside(
          runsRoot,
          workbookPath,
        )
      ) {
        continue;
      }

      const workbookStat =
        await stat(
          workbookPath,
        );

      if (
        workbookStat.isFile()
      ) {
        return workbookPath;
      }
    }
  }

  return null;
};

const SAFE_PACKAGE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;

const requireSafePackageId = (packageId: string, context: string): void => {
  if (!SAFE_PACKAGE_ID.test(packageId) || packageId === '.' || packageId === '..') {
    throw new Error(`${context} identity is invalid.`);
  }
};

const resolveVerifiedWorkbook = async (
  packageDirectory: string,
  workbookFilename: string,
  context: string,
): Promise<string> => {
  const candidate = path.join(packageDirectory, workbookFilename);
  const candidateStat = await lstat(candidate);
  if (!candidateStat.isFile() || candidateStat.isSymbolicLink()) {
    throw new Error(`${context} workbook is not a regular file.`);
  }
  const workbookPath = await realpath(candidate);
  if (!isInside(packageDirectory, workbookPath)) {
    throw new Error(`${context} workbook escapes its package directory.`);
  }
  const bytes = await readFile(workbookPath);
  try {
    const files = unzipSync(bytes);
    const contentTypes = files['[Content_Types].xml'];
    const workbook = files['xl/workbook.xml'];
    const worksheet = Object.entries(files).find(([filename]) => (
      /^xl\/worksheets\/sheet\d+\.xml$/u.test(filename)
    ))?.[1];
    if (
      contentTypes === undefined
      || workbook === undefined
      || worksheet === undefined
      || !strFromU8(contentTypes).includes('<Types')
      || !strFromU8(workbook).includes('<workbook')
      || !strFromU8(worksheet).includes('<worksheet')
    ) throw new Error(`${context} workbook content is invalid.`);
  } catch {
    throw new Error(`${context} workbook content is invalid.`);
  }
  return workbookPath;
};

export const resolveTaskPackageWorkbook = async (
  packages_root: string,
  package_id: string,
): Promise<string> => {
  requireSafePackageId(package_id, 'Task Package');
  const root = path.resolve(packages_root);
  const scanned = await new TaskPackageStore(root).scanManifests();
  const manifest = scanned.manifests.find((candidate) => candidate.package_id === package_id);
  if (manifest === undefined) throw new Error('Task Package is missing or invalid.');

  const canonicalRoot = await realpath(root);
  const packageDirectory = await realpath(path.join(canonicalRoot, package_id));
  if (!isInside(canonicalRoot, packageDirectory)) throw new Error('Task Package directory is invalid.');
  return resolveVerifiedWorkbook(packageDirectory, manifest.workbook_filename, 'Task Package');
};

const resolveBlogWritingPack = async (
  packagesRoot: string,
  packageId: string,
): Promise<{ directory: string; workbook_filename: string }> => {
  requireSafePackageId(packageId, 'Blog Writing Pack');
  const canonicalRoot = await realpath(path.resolve(packagesRoot));
  const candidate = path.join(canonicalRoot, packageId);
  const candidateStat = await lstat(candidate);
  if (!candidateStat.isDirectory() || candidateStat.isSymbolicLink()) {
    throw new Error('Blog Writing Pack directory is invalid.');
  }
  const directory = await realpath(candidate);
  if (!isInside(canonicalRoot, directory)) {
    throw new Error('Blog Writing Pack directory escapes its package root.');
  }
  const manifest = await new BlogWritingPackStore(canonicalRoot).readManifest(packageId);
  return { directory, workbook_filename: manifest.workbook_filename };
};

export const resolveBlogWritingPackDirectory = async (
  packages_root: string,
  package_id: string,
): Promise<string> => (
  await resolveBlogWritingPack(packages_root, package_id)
).directory;

export const resolveBlogWritingPackWorkbook = async (
  packages_root: string,
  package_id: string,
): Promise<string> => {
  const resolved = await resolveBlogWritingPack(packages_root, package_id);
  return resolveVerifiedWorkbook(
    resolved.directory,
    resolved.workbook_filename,
    'Blog Writing Pack',
  );
};
