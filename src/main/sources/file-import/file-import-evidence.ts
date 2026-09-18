import {
  readFile,
  realpath,
  stat,
} from 'node:fs/promises';
import * as path from 'node:path';

export interface FileImportEvidence {
  requested_path: string;
  resolved_path: string;
  bytes: Uint8Array;
}

export const requireAbsoluteFileImportPath = (
  value: unknown,
): string => {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value !== value.trim()
    || !path.isAbsolute(value)
  ) {
    throw new Error(
      'FILE_IMPORT file_path must be a non-empty absolute path.',
    );
  }

  return value;
};

export const readFileImportEvidence = async (
  filePathInput: unknown,
): Promise<FileImportEvidence> => {
  const requestedPath =
    requireAbsoluteFileImportPath(
      filePathInput,
    );

  const resolvedPath =
    await realpath(
      requestedPath,
    );

  const fileStat =
    await stat(
      resolvedPath,
    );

  if (!fileStat.isFile()) {
    throw new Error(
      'FILE_IMPORT input must resolve to a regular file.',
    );
  }

  return {
    requested_path:
      requestedPath,
    resolved_path:
      resolvedPath,
    bytes:
      new Uint8Array(
        await readFile(
          resolvedPath,
        ),
      ),
  };
};
