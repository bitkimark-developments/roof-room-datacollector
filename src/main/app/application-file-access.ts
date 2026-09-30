import {
  lstat,
  open,
  readdir,
  realpath,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

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

  const packageDirectory = await realpath(path.join(root, package_id));
  if (!isInside(root, packageDirectory)) throw new Error('Task Package directory is invalid.');
  const candidate = path.join(packageDirectory, manifest.workbook_filename);
  const candidateStat = await lstat(candidate);
  if (!candidateStat.isFile() || candidateStat.isSymbolicLink()) {
    throw new Error('Task Package workbook is not a regular file.');
  }
  const workbookPath = await realpath(candidate);
  if (!isInside(packageDirectory, workbookPath)) {
    throw new Error('Task Package workbook escapes its package directory.');
  }
  const handle = await open(workbookPath, 'r');
  try {
    const signature = Buffer.alloc(4);
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
    if (bytesRead !== 4 || !signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new Error('Task Package workbook content is invalid.');
    }
  } finally {
    await handle.close();
  }
  return workbookPath;
};
