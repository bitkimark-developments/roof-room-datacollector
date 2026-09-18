import type {
  SourceCollectionContext,
} from '../../../shared/collection';
import {
  GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID,
} from '../../../shared/google-api';
import type {
  JsonObject,
} from '../../../shared/run-job';
import {
  requireAbsoluteFileImportPath,
} from '../file-import/file-import-evidence';

export const KEYWORD_PLANNER_CSV_TASK_ID =
  'keyword-planner-manual-csv-import';

export const KEYWORD_PLANNER_CSV_SOURCE_MODE =
  'FILE_IMPORT';

export interface KeywordPlannerCsvJobContext {
  task_id: typeof KEYWORD_PLANNER_CSV_TASK_ID;
  source_id: typeof GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID;
  source_mode: typeof KEYWORD_PLANNER_CSV_SOURCE_MODE;
  file_path: string;
}

export const createKeywordPlannerCsvJobContext = (
  value: unknown,
): KeywordPlannerCsvJobContext => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(
      'Keyword Planner CSV Job context must be an object.',
    );
  }

  const context =
    value as Record<string, unknown>;

  if (
    context.task_id !== KEYWORD_PLANNER_CSV_TASK_ID
    || context.source_id !== GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID
    || context.source_mode !== KEYWORD_PLANNER_CSV_SOURCE_MODE
  ) {
    throw new Error(
      'Keyword Planner CSV Job context must match the reviewed FILE_IMPORT contract.',
    );
  }

  return {
    task_id:
      KEYWORD_PLANNER_CSV_TASK_ID,
    source_id:
      GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID,
    source_mode:
      KEYWORD_PLANNER_CSV_SOURCE_MODE,
    file_path:
      requireAbsoluteFileImportPath(
        context.file_path,
      ),
  };
};

export const keywordPlannerCsvContextFromCollection = (
  context: SourceCollectionContext,
): KeywordPlannerCsvJobContext => {
  if (
    context.source_id
    && context.source_id
      !== GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID
  ) {
    throw new Error(
      'Keyword Planner CSV collection source identity does not match the Job context.',
    );
  }

  return createKeywordPlannerCsvJobContext(
    context.source_context,
  );
};

export const keywordPlannerCsvContextAsJson = (
  context: KeywordPlannerCsvJobContext,
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

