import {
  constants as fsConstants,
} from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  stat,
  unlink,
} from 'node:fs/promises';
import {
  createHash,
  randomUUID,
} from 'node:crypto';
import * as path from 'node:path';

import type {
  ApplicationDirectories,
} from '../../shared/bootstrap-status';

const SOURCE_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_COLLISION_SUFFIX =
  10_000;

export interface PersistableBrowserDownload {
  suggestedFilename(): string;

  saveAs(
    destinationPath: string,
  ): Promise<void>;

  failure(): Promise<string | null>;
}

export interface SavePublicDownloadInput {
  source_id: string;
  download: PersistableBrowserDownload;
  preferred_filename?: string;
}

export interface PersistedPublicDownload {
  filename: string;
  absolute_path: string;
  byte_size: number;
  sha256: string;
}

export class PublicDownloadStorageError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'PublicDownloadStorageError';
  }
}

const requireSourceId = (
  sourceId: string,
): string => {
  if (
    !SOURCE_ID_PATTERN.test(
      sourceId,
    )
  ) {
    throw new PublicDownloadStorageError(
      `Unsafe source_id for public download storage: ${sourceId}`,
    );
  }

  return sourceId;
};

const requireSafeFilename = (
  filenameInput: string,
): string => {
  const filename =
    filenameInput.trim();

  if (
    filename.length === 0 ||
    filename !==
      path.basename(filename) ||
    filename === '.' ||
    filename === '..' ||
    filename.includes('\0') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    throw new PublicDownloadStorageError(
      `Unsafe public download filename: ${filenameInput}`,
    );
  }

  return filename;
};

const assertInside = (
  parent: string,
  candidate: string,
): void => {
  const relative = path.relative(
    parent,
    candidate,
  );

  if (
    relative.length === 0 ||
    relative === '..' ||
    relative.startsWith(
      `..${path.sep}`,
    ) ||
    path.isAbsolute(relative)
  ) {
    throw new PublicDownloadStorageError(
      'Public download path escaped its configured root.',
    );
  }
};

const withCollisionSuffix = (
  filename: string,
  suffix: number,
): string => {
  if (suffix === 1) {
    return filename;
  }

  const extension =
    path.extname(filename);

  const stem =
    extension.length > 0
      ? filename.slice(
          0,
          -extension.length,
        )
      : filename;

  return `${stem}__${suffix}${extension}`;
};

const isAlreadyExistsError = (
  error: unknown,
): error is NodeJS.ErrnoException =>
  error instanceof Error &&
  'code' in error &&
  error.code === 'EEXIST';

const removeTemporaryFile = async (
  temporaryPath: string,
): Promise<void> => {
  try {
    await unlink(
      temporaryPath,
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return;
    }

    throw error;
  }
};

export class PersistentDownloadStore {
  private readonly root: string;

  constructor(
    directories: ApplicationDirectories,
  ) {
    this.root = path.resolve(
      directories.public_downloads,
    );
  }

  getSourceDirectory(
    sourceIdInput: string,
  ): string {
    const sourceId =
      requireSourceId(
        sourceIdInput,
      );

    const directory =
      path.resolve(
        this.root,
        sourceId,
      );

    assertInside(
      this.root,
      directory,
    );

    return directory;
  }

  async save(
    input: SavePublicDownloadInput,
  ): Promise<PersistedPublicDownload> {
    const sourceDirectory =
      this.getSourceDirectory(
        input.source_id,
      );

    await mkdir(
      sourceDirectory,
      {
        recursive: true,
      },
    );

    const filename =
      requireSafeFilename(
        input.preferred_filename ??
          input.download
            .suggestedFilename(),
      );

    const temporaryPath =
      path.join(
        sourceDirectory,
        `.roofroom-download-${randomUUID()}.tmp`,
      );

    assertInside(
      sourceDirectory,
      temporaryPath,
    );

    try {
      await input.download.saveAs(
        temporaryPath,
      );

      const failure =
        await input.download.failure();

      if (failure !== null) {
        throw new PublicDownloadStorageError(
          `Browser download failed: ${failure}`,
        );
      }

      let finalPath:
        | string
        | null = null;

      let finalFilename:
        | string
        | null = null;

      for (
        let suffix = 1;
        suffix <=
          MAX_COLLISION_SUFFIX;
        suffix += 1
      ) {
        const candidateFilename =
          withCollisionSuffix(
            filename,
            suffix,
          );

        const candidatePath =
          path.resolve(
            sourceDirectory,
            candidateFilename,
          );

        assertInside(
          sourceDirectory,
          candidatePath,
        );

        try {
          await copyFile(
            temporaryPath,
            candidatePath,
            fsConstants.COPYFILE_EXCL,
          );

          finalPath =
            candidatePath;

          finalFilename =
            candidateFilename;

          break;
        } catch (error: unknown) {
          if (
            isAlreadyExistsError(
              error,
            )
          ) {
            continue;
          }

          throw error;
        }
      }

      if (
        finalPath === null ||
        finalFilename === null
      ) {
        throw new PublicDownloadStorageError(
          'Could not allocate a collision-safe public download filename.',
        );
      }

      const [
        bytes,
        fileStat,
      ] = await Promise.all([
        readFile(finalPath),
        stat(finalPath),
      ]);

      if (!fileStat.isFile()) {
        throw new PublicDownloadStorageError(
          'Persisted public download is not a regular file.',
        );
      }

      const result:
        PersistedPublicDownload = {
          filename:
            finalFilename,
          absolute_path:
            finalPath,
          byte_size:
            fileStat.size,
          sha256:
            createHash('sha256')
              .update(bytes)
              .digest('hex'),
        };

      await removeTemporaryFile(
        temporaryPath,
      );

      return result;
    } catch (error: unknown) {
      try {
        await removeTemporaryFile(
          temporaryPath,
        );
      } catch {
        // Preserve the original download/persistence failure.
        // A later startup cleanup can remove a rare orphaned temp file.
      }

      throw error;
    }
  }
}
