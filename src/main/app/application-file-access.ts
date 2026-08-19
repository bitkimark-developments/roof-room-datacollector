import {
  readdir,
  realpath,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

import type {
  ApplicationDirectories,
} from '../../shared/bootstrap-status';

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
