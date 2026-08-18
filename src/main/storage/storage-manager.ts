import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import * as path from 'node:path';

import type { ApplicationDirectories } from '../../shared/bootstrap-status';

const RUN_ID_PATTERN =
  /^rr_\d{8}T\d{9}Z_[0-9a-f]{6}$/;

const SOURCE_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PersistRawArtifactInput {
  run_id: string;
  source_id: string;
  attempt_number: number;
  preferred_filename: string;
  media_type: string;
  bytes: Uint8Array;
}

export interface PersistedRawArtifactFile {
  filename: string;
  relative_path: string;
  absolute_path: string;
  media_type: string;
  byte_size: number;
  sha256: string;
}

export interface RunStorageDirectories {
  run: string;
  source: string;
  raw: string;
  metadata: string;
  validation: string;
  exports: string;
  logs: string;
}

export interface PersistJsonDocumentInput {
  run_id: string;
  source_id: string;
  attempt_number: number;
  document_key: string;
  document: unknown;
}

export interface PersistedJsonDocument {
  filename: string;
  relative_path: string;
  absolute_path: string;
  media_type: 'application/json';
  byte_size: number;
  sha256: string;
}

export class StorageCollisionError extends Error {
  constructor(public readonly target_path: string) {
    super(
      `Refusing to overwrite an existing raw artifact: ${target_path}`,
    );
    this.name = 'StorageCollisionError';
  }
}

export class UnsafeStoragePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeStoragePathError';
  }
}

const requireNonEmpty = (
  value: string,
  context: string,
): string => {
  if (value.trim().length === 0) {
    throw new Error(`${context} must be non-empty.`);
  }

  return value;
};

const assertInside = (
  parent: string,
  candidate: string,
  context: string,
): void => {
  const relative = path.relative(parent, candidate);

  if (
    relative === '' ||
    (
      !relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative)
    )
  ) {
    return;
  }

  throw new UnsafeStoragePathError(
    `${context} escapes its storage root.`,
  );
};

const requireRunId = (runId: string): string => {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new UnsafeStoragePathError(
      `Invalid filesystem-safe run_id: ${runId}`,
    );
  }

  return runId;
};

const requireSourceId = (
  sourceId: string,
): string => {
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    throw new UnsafeStoragePathError(
      `Invalid source_id for filesystem storage: ${sourceId}`,
    );
  }

  return sourceId;
};

const requireSafeFilename = (
  filename: string,
): string => {
  requireNonEmpty(filename, 'preferred_filename');

  if (
    filename === '.' ||
    filename === '..' ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0') ||
    path.basename(filename) !== filename
  ) {
    throw new UnsafeStoragePathError(
      `Unsafe raw artifact filename: ${filename}`,
    );
  }

  return filename;
};

const requireAttemptNumber = (
  attemptNumber: number,
): number => {
  if (
    !Number.isInteger(attemptNumber) ||
    attemptNumber < 1
  ) {
    throw new Error(
      'attempt_number must be an integer >= 1.',
    );
  }

  return attemptNumber;
};

const requireDocumentKey = (
  documentKey: string,
): string => {
  requireNonEmpty(documentKey, 'document_key');

  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(
      documentKey,
    )
  ) {
    throw new UnsafeStoragePathError(
      `Unsafe JSON document key: ${documentKey}`,
    );
  }

  return documentKey;
};

const createAttemptDocumentFilename = (
  documentKey: string,
  attemptNumber: number,
  documentKind: 'metadata' | 'validation',
): string =>
  attemptNumber === 1
    ? `${documentKey}.${documentKind}.json`
    : `${documentKey}.attempt_${attemptNumber}.${documentKind}.json`;

const serializeJsonDocument = (
  document: unknown,
): Uint8Array => {
  let serialized: string;

  try {
    serialized = JSON.stringify(
      document,
      null,
      2,
    );
  } catch (error: unknown) {
    throw new Error(
      `JSON document could not be serialized: ${
        error instanceof Error
          ? error.message
          : 'unknown serialization error'
      }`,
    );
  }

  if (serialized === undefined) {
    throw new Error(
      'JSON document serialized to undefined.',
    );
  }

  return Buffer.from(
    `${serialized}\n`,
    'utf8',
  );
};

const withAttemptSuffix = (
  filename: string,
  attemptNumber: number,
): string => {
  if (attemptNumber === 1) {
    return filename;
  }

  const extension = path.extname(filename);
  const stem = filename.slice(
    0,
    filename.length - extension.length,
  );

  return `${stem}__attempt_${attemptNumber}${extension}`;
};

const toPortableRelativePath = (
  relativePath: string,
): string =>
  relativePath
    .split(path.sep)
    .join('/');

const isAlreadyExistsError = (
  error: unknown,
): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'EEXIST';

export class StorageManager {
  private readonly dataRoot: string;
  private readonly runsRoot: string;

  constructor(
    private readonly directories: ApplicationDirectories,
  ) {
    this.dataRoot = path.resolve(
      directories.data,
    );
    this.runsRoot = path.resolve(
      directories.runs,
    );

    assertInside(
      this.dataRoot,
      this.runsRoot,
      'runs directory',
    );
  }

  async ensureRunSourceDirectories(
    runIdInput: string,
    sourceIdInput: string,
  ): Promise<RunStorageDirectories> {
    const runId = requireRunId(runIdInput);
    const sourceId = requireSourceId(sourceIdInput);

    const runDirectory = path.resolve(
      this.runsRoot,
      runId,
    );

    assertInside(
      this.runsRoot,
      runDirectory,
      'run directory',
    );

    const sourceDirectory = path.resolve(
      runDirectory,
      sourceId,
    );
    const rawDirectory = path.resolve(
      sourceDirectory,
      'raw',
    );
    const metadataDirectory = path.resolve(
      sourceDirectory,
      'metadata',
    );
    const validationDirectory = path.resolve(
      sourceDirectory,
      'validation',
    );
    const exportsDirectory = path.resolve(
      runDirectory,
      'exports',
    );
    const logsDirectory = path.resolve(
      runDirectory,
      'logs',
    );

    for (const [context, candidate] of [
      ['source directory', sourceDirectory],
      ['raw directory', rawDirectory],
      ['metadata directory', metadataDirectory],
      ['validation directory', validationDirectory],
      ['exports directory', exportsDirectory],
      ['logs directory', logsDirectory],
    ] as const) {
      assertInside(
        runDirectory,
        candidate,
        context,
      );
    }

    await Promise.all([
      mkdir(rawDirectory, { recursive: true }),
      mkdir(metadataDirectory, {
        recursive: true,
      }),
      mkdir(validationDirectory, {
        recursive: true,
      }),
      mkdir(exportsDirectory, {
        recursive: true,
      }),
      mkdir(logsDirectory, {
        recursive: true,
      }),
    ]);

    return {
      run: runDirectory,
      source: sourceDirectory,
      raw: rawDirectory,
      metadata: metadataDirectory,
      validation: validationDirectory,
      exports: exportsDirectory,
      logs: logsDirectory,
    };
  }

  async persistRawArtifact(
    input: PersistRawArtifactInput,
  ): Promise<PersistedRawArtifactFile> {
    const attemptNumber =
      requireAttemptNumber(
        input.attempt_number,
      );

    const preferredFilename =
      requireSafeFilename(
        input.preferred_filename,
      );

    requireNonEmpty(
      input.media_type,
      'media_type',
    );

    if (!(input.bytes instanceof Uint8Array)) {
      throw new Error(
        'bytes must be a Uint8Array.',
      );
    }

    const storage =
      await this.ensureRunSourceDirectories(
        input.run_id,
        input.source_id,
      );

    const filename = withAttemptSuffix(
      preferredFilename,
      attemptNumber,
    );

    const absolutePath = path.resolve(
      storage.raw,
      filename,
    );

    assertInside(
      storage.raw,
      absolutePath,
      'raw artifact path',
    );

    try {
      await writeFile(
        absolutePath,
        input.bytes,
        {
          flag: 'wx',
        },
      );
    } catch (error: unknown) {
      if (isAlreadyExistsError(error)) {
        throw new StorageCollisionError(
          absolutePath,
        );
      }

      throw error;
    }

    const [
      persistedBytes,
      fileStat,
    ] = await Promise.all([
      readFile(absolutePath),
      stat(absolutePath),
    ]);

    if (!fileStat.isFile()) {
      throw new Error(
        `Persisted raw artifact is not a regular file: ${absolutePath}`,
      );
    }

    const sha256 = createHash('sha256')
      .update(persistedBytes)
      .digest('hex');

    const relativePath =
      toPortableRelativePath(
        path.relative(
          storage.run,
          absolutePath,
        ),
      );

    if (
      relativePath.length === 0 ||
      relativePath === '..' ||
      relativePath.startsWith('../') ||
      path.isAbsolute(relativePath)
    ) {
      throw new UnsafeStoragePathError(
        'Persisted artifact relative path escaped the run directory.',
      );
    }

    return {
      filename,
      relative_path: relativePath,
      absolute_path: absolutePath,
      media_type: input.media_type,
      byte_size: fileStat.size,
      sha256,
    };
  }

  async persistMetadataJson(
    input: PersistJsonDocumentInput,
  ): Promise<PersistedJsonDocument> {
    return this.persistJsonDocument(
      input,
      'metadata',
    );
  }

  async persistValidationJson(
    input: PersistJsonDocumentInput,
  ): Promise<PersistedJsonDocument> {
    return this.persistJsonDocument(
      input,
      'validation',
    );
  }

  private async persistJsonDocument(
    input: PersistJsonDocumentInput,
    documentKind:
      | 'metadata'
      | 'validation',
  ): Promise<PersistedJsonDocument> {
    const attemptNumber =
      requireAttemptNumber(
        input.attempt_number,
      );
    const documentKey =
      requireDocumentKey(
        input.document_key,
      );

    const storage =
      await this.ensureRunSourceDirectories(
        input.run_id,
        input.source_id,
      );

    const directory =
      documentKind === 'metadata'
        ? storage.metadata
        : storage.validation;

    const filename =
      createAttemptDocumentFilename(
        documentKey,
        attemptNumber,
        documentKind,
      );

    const absolutePath = path.resolve(
      directory,
      filename,
    );

    assertInside(
      directory,
      absolutePath,
      `${documentKind} JSON path`,
    );

    const bytes =
      serializeJsonDocument(
        input.document,
      );

    try {
      await writeFile(
        absolutePath,
        bytes,
        {
          flag: 'wx',
        },
      );
    } catch (error: unknown) {
      if (isAlreadyExistsError(error)) {
        throw new StorageCollisionError(
          absolutePath,
        );
      }

      throw error;
    }

    const [
      persistedBytes,
      fileStat,
    ] = await Promise.all([
      readFile(absolutePath),
      stat(absolutePath),
    ]);

    if (!fileStat.isFile()) {
      throw new Error(
        `Persisted ${documentKind} JSON is not a regular file: ${absolutePath}`,
      );
    }

    const sha256 = createHash('sha256')
      .update(persistedBytes)
      .digest('hex');

    const relativePath =
      toPortableRelativePath(
        path.relative(
          storage.run,
          absolutePath,
        ),
      );

    if (
      relativePath.length === 0 ||
      relativePath === '..' ||
      relativePath.startsWith('../') ||
      path.isAbsolute(relativePath)
    ) {
      throw new UnsafeStoragePathError(
        `Persisted ${documentKind} JSON path escaped the run directory.`,
      );
    }

    return {
      filename,
      relative_path: relativePath,
      absolute_path: absolutePath,
      media_type: 'application/json',
      byte_size: fileStat.size,
      sha256,
    };
  }

  resolveRunRelativePath(
    runIdInput: string,
    relativePathInput: string,
  ): string {
    const runId = requireRunId(runIdInput);
    requireNonEmpty(
      relativePathInput,
      'relative_path',
    );

    if (
      path.isAbsolute(relativePathInput) ||
      relativePathInput.includes('\0')
    ) {
      throw new UnsafeStoragePathError(
        'Artifact relative_path must remain relative to its run.',
      );
    }

    const runDirectory = path.resolve(
      this.runsRoot,
      runId,
    );

    assertInside(
      this.runsRoot,
      runDirectory,
      'run directory',
    );

    const candidate = path.resolve(
      runDirectory,
      relativePathInput,
    );

    assertInside(
      runDirectory,
      candidate,
      'artifact relative_path',
    );

    return candidate;
  }
}
