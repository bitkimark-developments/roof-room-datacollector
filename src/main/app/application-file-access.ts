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

export const resolveTaskPackageWorkbook = async (
  packages_root: string,
  package_id: string,
): Promise<string> => {
  if (
    !SAFE_PACKAGE_ID.test(package_id)
    || package_id === '.'
    || package_id === '..'
  ) {
    throw new Error('Task Package identity is invalid.');
  }
  const root = path.resolve(packages_root);
  const scanned = await new TaskPackageStore(root).scanManifests();
  const manifest = scanned.manifests.find((candidate) => candidate.package_id === package_id);
  if (manifest === undefined) throw new Error('Task Package is missing or invalid.');

  const canonicalRoot = await realpath(root);
  const packageDirectory = await realpath(path.join(canonicalRoot, package_id));
  if (!isInside(canonicalRoot, packageDirectory)) throw new Error('Task Package directory is invalid.');
  const candidate = path.join(packageDirectory, manifest.workbook_filename);
  const candidateStat = await lstat(candidate);
  if (!candidateStat.isFile() || candidateStat.isSymbolicLink()) {
    throw new Error('Task Package workbook is not a regular file.');
  }
  const workbookPath = await realpath(candidate);
  if (!isInside(packageDirectory, workbookPath)) {
    throw new Error('Task Package workbook escapes its package directory.');
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
    ) throw new Error('Task Package workbook content is invalid.');
  } catch {
    throw new Error('Task Package workbook content is invalid.');
  }
  return workbookPath;
};
