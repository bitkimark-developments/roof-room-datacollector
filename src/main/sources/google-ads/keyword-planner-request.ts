import type {
  SourceCollectionContext,
} from '../../../shared/collection';
import type {
  JsonObject,
} from '../../../shared/run-job';
import {
  GOOGLE_KEYWORD_PLANNER_SOURCE_ID,
} from '../../../shared/google-api';

export const KEYWORD_PLANNER_TASK_ID =
  'keyword-planner-historical-metrics';

export const KEYWORD_PLANNER_SOURCE_MODE =
  'OFFICIAL_API';

export interface KeywordPlannerJobContext {
  task_id: typeof KEYWORD_PLANNER_TASK_ID;
  source_id: typeof GOOGLE_KEYWORD_PLANNER_SOURCE_ID;
  source_mode: typeof KEYWORD_PLANNER_SOURCE_MODE;
  group_id: string;
  group_name: string;
  keywords: string[];
}

const GROUP_ID_PATTERN =
  /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u;

const requireTrimmedString = (
  value: unknown,
  field: string,
): string => {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value !== value.trim()
  ) {
    throw new Error(
      `Keyword Planner ${field} must be a non-empty trimmed string.`,
    );
  }

  return value;
};

export const createKeywordPlannerJobContext = (
  value: unknown,
): KeywordPlannerJobContext => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(
      'Keyword Planner Job context must be an object.',
    );
  }

  const context =
    value as Record<string, unknown>;

  if (
    context.task_id !== KEYWORD_PLANNER_TASK_ID
    || context.source_id !== GOOGLE_KEYWORD_PLANNER_SOURCE_ID
    || context.source_mode !== KEYWORD_PLANNER_SOURCE_MODE
  ) {
    throw new Error(
      'Keyword Planner Job context must match the reviewed official-API contract.',
    );
  }

  const groupId =
    requireTrimmedString(
      context.group_id,
      'group_id',
    );

  if (!GROUP_ID_PATTERN.test(groupId)) {
    throw new Error(
      'Keyword Planner group_id must use lowercase letters, digits, hyphens, or underscores.',
    );
  }

  const groupName =
    requireTrimmedString(
      context.group_name,
      'group_name',
    );

  if (
    !Array.isArray(context.keywords)
    || context.keywords.length === 0
  ) {
    throw new Error(
      'Keyword Planner keywords must contain at least one keyword.',
    );
  }

  const keywords =
    context.keywords.map(
      (keyword, index) =>
        requireTrimmedString(
          keyword,
          `keywords[${String(index)}]`,
        ),
    );

  return {
    task_id:
      KEYWORD_PLANNER_TASK_ID,
    source_id:
      GOOGLE_KEYWORD_PLANNER_SOURCE_ID,
    source_mode:
      KEYWORD_PLANNER_SOURCE_MODE,
    group_id:
      groupId,
    group_name:
      groupName,
    keywords,
  };
};

export const keywordPlannerJobContextFromCollection = (
  context: SourceCollectionContext,
): KeywordPlannerJobContext => {
  if (
    context.source_id
    && context.source_id
      !== GOOGLE_KEYWORD_PLANNER_SOURCE_ID
  ) {
    throw new Error(
      'Keyword Planner collection source identity does not match the Job context.',
    );
  }

  return createKeywordPlannerJobContext(
    context.source_context,
  );
};

export const keywordPlannerContextAsJson = (
  context: KeywordPlannerJobContext,
): JsonObject => ({
  task_id:
    context.task_id,
  source_id:
    context.source_id,
  source_mode:
    context.source_mode,
  group_id:
    context.group_id,
  group_name:
    context.group_name,
  keywords: [
    ...context.keywords,
  ],
});
