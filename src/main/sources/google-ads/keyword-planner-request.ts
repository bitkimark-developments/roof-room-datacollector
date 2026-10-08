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
  customer_id?: string;
  group_id: string;
  group_name: string;
  keywords: string[];
  requested_date_start: string;
  requested_date_end: string;
  country_code: 'TR';
  language_code: 'tr';
  keyword_plan_network: 'GOOGLE_SEARCH';
}

const GROUP_ID_PATTERN =
  /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/iu;

const ISO_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/u;

const pad2 = (value: number): string =>
  String(value).padStart(2, '0');

const formatLocalDate = (value: Date): string =>
  [
    String(value.getFullYear()).padStart(4, '0'),
    pad2(value.getMonth() + 1),
    pad2(value.getDate()),
  ].join('-');

export const resolveKeywordPlannerHistoricalScope = (
  referenceDate: Date,
): Pick<
  KeywordPlannerJobContext,
  | 'requested_date_start'
  | 'requested_date_end'
  | 'country_code'
  | 'language_code'
  | 'keyword_plan_network'
> => {
  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error(
      'Keyword Planner reference date must be valid.',
    );
  }

  // The most recent fully completed calendar month.
  const end = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    0,
  );

  // Twelve completed calendar months inclusive.
  const start = new Date(
    end.getFullYear(),
    end.getMonth() - 11,
    1,
  );

  return {
    requested_date_start:
      formatLocalDate(start),
    requested_date_end:
      formatLocalDate(end),
    country_code: 'TR',
    language_code: 'tr',
    keyword_plan_network: 'GOOGLE_SEARCH',
  };
};

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

const parseIsoDate = (
  value: unknown,
  field: string,
): {
  year: number;
  month: number;
  day: number;
} => {
  const text =
    requireTrimmedString(value, field);

  const match =
    ISO_DATE_PATTERN.exec(text);

  if (!match) {
    throw new Error(
      `Keyword Planner ${field} must use YYYY-MM-DD.`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const candidate =
    new Date(year, month - 1, day);

  if (
    candidate.getFullYear() !== year
    || candidate.getMonth() !== month - 1
    || candidate.getDate() !== day
  ) {
    throw new Error(
      `Keyword Planner ${field} must be a valid calendar date.`,
    );
  }

  return {
    year,
    month,
    day,
  };
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

  const customerId =
    context.customer_id === undefined
      ? undefined
      : requireTrimmedString(
          context.customer_id,
          'customer_id',
        );

  if (
    customerId === undefined
      ? false
      : /^\d+$/u.test(customerId) === false
  ) {
    throw new Error(
      'Keyword Planner customer_id must contain digits only.',
    );
  }

  const groupId =
    requireTrimmedString(
      context.group_id,
      'group_id',
    );

  if (!GROUP_ID_PATTERN.test(groupId)) {
    throw new Error(
      'Keyword Planner group_id must use letters, digits, hyphens, or underscores.',
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

  const requestedDateStart =
    requireTrimmedString(
      context.requested_date_start,
      'requested_date_start',
    );

  const requestedDateEnd =
    requireTrimmedString(
      context.requested_date_end,
      'requested_date_end',
    );

  const start =
    parseIsoDate(
      requestedDateStart,
      'requested_date_start',
    );

  const end =
    parseIsoDate(
      requestedDateEnd,
      'requested_date_end',
    );

  const expectedEndDay =
    new Date(
      end.year,
      end.month,
      0,
    ).getDate();

  const monthSpan =
    ((end.year - start.year) * 12)
    + end.month
    - start.month;

  if (
    start.day !== 1
    || end.day !== expectedEndDay
    || monthSpan !== 11
  ) {
    throw new Error(
      'Keyword Planner date range must contain exactly 12 complete calendar months.',
    );
  }

  if (
    context.country_code !== 'TR'
    || context.language_code !== 'tr'
    || context.keyword_plan_network !== 'GOOGLE_SEARCH'
  ) {
    throw new Error(
      'Keyword Planner reviewed scope must be Turkey, Turkish, and Google Search.',
    );
  }

  return {
    task_id:
      KEYWORD_PLANNER_TASK_ID,
    source_id:
      GOOGLE_KEYWORD_PLANNER_SOURCE_ID,
    source_mode:
      KEYWORD_PLANNER_SOURCE_MODE,
    ...(customerId === undefined
      ? {}
      : { customer_id: customerId }),
    group_id:
      groupId,
    group_name:
      groupName,
    keywords,
    requested_date_start:
      requestedDateStart,
    requested_date_end:
      requestedDateEnd,
    country_code: 'TR',
    language_code: 'tr',
    keyword_plan_network:
      'GOOGLE_SEARCH',
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
  ...(context.customer_id === undefined
    ? {}
    : {
        customer_id:
          context.customer_id,
      }),
  group_id:
    context.group_id,
  group_name:
    context.group_name,
  keywords: [
    ...context.keywords,
  ],
  requested_date_start:
    context.requested_date_start,
  requested_date_end:
    context.requested_date_end,
  country_code:
    context.country_code,
  language_code:
    context.language_code,
  keyword_plan_network:
    context.keyword_plan_network,
});
