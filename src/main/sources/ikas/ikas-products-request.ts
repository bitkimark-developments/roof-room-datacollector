import type {
  SourceCollectionContext,
} from '../../../shared/collection';
import type {
  JsonObject,
} from '../../../shared/run-job';
import {
  IKAS_PRODUCTS_SOURCE_ID,
} from '../../../shared/ikas-products';
import {
  requireAbsoluteFileImportPath,
} from '../file-import/file-import-evidence';

export const IKAS_PRODUCTS_TASK_ID =
  'ikas-products-import';

export const IKAS_PRODUCTS_SOURCE_MODE =
  'FILE_IMPORT';

export interface IkasProductsJobContext {
  task_id: typeof IKAS_PRODUCTS_TASK_ID;
  source_id: typeof IKAS_PRODUCTS_SOURCE_ID;
  source_mode: typeof IKAS_PRODUCTS_SOURCE_MODE;
  file_path: string;
}

export const createIkasProductsJobContext = (
  value: unknown,
): IkasProductsJobContext => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(
      'İkas Products Job context must be an object.',
    );
  }

  const context =
    value as Record<string, unknown>;

  if (
    context.task_id !== IKAS_PRODUCTS_TASK_ID
    || context.source_id !== IKAS_PRODUCTS_SOURCE_ID
    || context.source_mode !== IKAS_PRODUCTS_SOURCE_MODE
  ) {
    throw new Error(
      'İkas Products Job context must match the reviewed FILE_IMPORT contract.',
    );
  }

  return {
    task_id:
      IKAS_PRODUCTS_TASK_ID,
    source_id:
      IKAS_PRODUCTS_SOURCE_ID,
    source_mode:
      IKAS_PRODUCTS_SOURCE_MODE,
    file_path:
      requireAbsoluteFileImportPath(
        context.file_path,
      ),
  };
};

export const ikasProductsContextFromCollection = (
  context: SourceCollectionContext,
): IkasProductsJobContext => {
  if (
    context.source_id
    && context.source_id
      !== IKAS_PRODUCTS_SOURCE_ID
  ) {
    throw new Error(
      'İkas Products collection source identity does not match the Job context.',
    );
  }

  return createIkasProductsJobContext(
    context.source_context,
  );
};

export const ikasProductsContextAsJson = (
  context: IkasProductsJobContext,
): JsonObject => ({
  task_id:
    context.task_id,
  source_id:
    context.source_id,
  source_mode:
    context.source_mode,
  file_path:
    context.file_path,
});
