import type {
  ManagedBrowserLocator,
  ManagedBrowserPage,
} from '../../browser/browser-manager';

const QUERY_SEARCHBOX_NAME =
  'Add a search term';

const EMPTY_QUERY_SLOT_SELECTOR =
  '.compare-term-container .search-term-wrapper.term-not-selected';

const SEARCH_TERM_SUFFIX =
  'Search term';

const GOOGLE_TRENDS_COMPARISON_LIMIT =
  5;

const DEFAULT_UI_ACTION_TIMEOUT_MS =
  10_000;

export const GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS = {
  INITIAL_QUERY_INPUT:
    'INITIAL_QUERY_INPUT',
  EMPTY_COMPARISON_SLOT:
    'EMPTY_COMPARISON_SLOT',
  COMPARISON_QUERY_INPUT:
    'COMPARISON_QUERY_INPUT',
} as const;

export type GoogleTrendsQueryGroupDiagnosticControl =
  (typeof GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS)[
    keyof typeof GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
  ];

export interface GoogleTrendsQueryGroupDiagnosticContext {
  control:
    GoogleTrendsQueryGroupDiagnosticControl;
  observed_count: number;
  query_index: number;
}

export class GoogleTrendsQueryGroupUiContractError
  extends Error
{
  readonly diagnostic_context:
    GoogleTrendsQueryGroupDiagnosticContext | null;

  constructor(
    message: string,
    diagnosticContext:
      GoogleTrendsQueryGroupDiagnosticContext | null =
      null,
  ) {
    super(message);
    this.name =
      'GoogleTrendsQueryGroupUiContractError';
    this.diagnostic_context =
      diagnosticContext;
  }
}

export interface ApplyGoogleTrendsSearchTermQueryGroupInput {
  page: ManagedBrowserPage;
  queries: readonly string[];
  ui_action_timeout_ms?: number;
}

const requirePositiveTimeout = (
  value: number | undefined,
): number => {
  if (value === undefined) {
    return DEFAULT_UI_ACTION_TIMEOUT_MS;
  }

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new GoogleTrendsQueryGroupUiContractError(
      'ui_action_timeout_ms must be a positive integer.',
    );
  }

  return value;
};

const validateQueries = (
  queries: readonly string[],
): void => {
  if (
    queries.length < 1 ||
    queries.length >
      GOOGLE_TRENDS_COMPARISON_LIMIT
  ) {
    throw new GoogleTrendsQueryGroupUiContractError(
      `Google Trends comparison groups must contain between 1 and ${GOOGLE_TRENDS_COMPARISON_LIMIT} queries.`,
    );
  }

  for (
    let index = 0;
    index < queries.length;
    index += 1
  ) {
    const query =
      queries[index];

    if (
      query.length === 0 ||
      query.trim() !== query
    ) {
      throw new GoogleTrendsQueryGroupUiContractError(
        `queries[${index}] must be a non-empty, already-normalized query string without leading or trailing whitespace.`,
      );
    }
  }
};

const requireExactlyOne = async (
  locator: ManagedBrowserLocator,
  description: string,
  diagnostic: {
    control:
      GoogleTrendsQueryGroupDiagnosticControl;
    query_index: number;
  },
): Promise<void> => {
  const count =
    await locator.count();

  if (count !== 1) {
    throw new GoogleTrendsQueryGroupUiContractError(
      `Expected exactly one ${description}; found ${count}.`,
      {
        control:
          diagnostic.control,
        observed_count:
          count,
        query_index:
          diagnostic.query_index,
      },
    );
  }
};

const selectSearchTermSuggestion = async (
  page: ManagedBrowserPage,
  query: string,
  timeout: number,
): Promise<void> => {
  const suggestion =
    page.getByRole(
      'button',
      {
        name:
          `${query} ${SEARCH_TERM_SUFFIX}`,
      },
    );

  // Playwright locator actions wait for the async Angular Material
  // autocomplete result and remain strict if multiple matching
  // Search Term suggestions unexpectedly appear.
  await suggestion.click({
    timeout,
  });
};

const fillAndSelectQuery = async (
  page: ManagedBrowserPage,
  input: ManagedBrowserLocator,
  query: string,
  timeout: number,
  diagnosticControl:
    GoogleTrendsQueryGroupDiagnosticControl,
  queryIndex: number,
): Promise<void> => {
  await requireExactlyOne(
    input,
    `"${QUERY_SEARCHBOX_NAME}" query input`,
    {
      control:
        diagnosticControl,
      query_index:
        queryIndex,
    },
  );

  await input.fill(
    query,
    {
      timeout,
    },
  );

  await selectSearchTermSuggestion(
    page,
    query,
    timeout,
  );
};

const fillAndSelectComparisonQuery = async (
  page: ManagedBrowserPage,
  emptySlot: ManagedBrowserLocator,
  query: string,
  timeout: number,
  queryIndex: number,
): Promise<void> => {
  const initialSlotCount =
    await emptySlot.count();

  if (initialSlotCount > 1) {
    throw new GoogleTrendsQueryGroupUiContractError(
      `Expected at most one unselected comparison slot while waiting for the next query input; found ${initialSlotCount}.`,
      {
        control:
          GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
            .EMPTY_COMPARISON_SLOT,
        observed_count:
          initialSlotCount,
        query_index:
          queryIndex,
      },
    );
  }

  const queryInput =
    emptySlot.getByRole(
      'searchbox',
      {
        name:
          QUERY_SEARCHBOX_NAME,
      },
    );

  try {
    // The provider creates the next empty comparison slot asynchronously.
    // The strict nested fill action uses the existing bounded timeout to
    // wait for exactly one slot/input pair to become actionable.
    await queryInput.fill(
      query,
      {
        timeout,
      },
    );
  } catch (error: unknown) {
    const finalSlotCount =
      await emptySlot.count();

    if (finalSlotCount !== 1) {
      throw new GoogleTrendsQueryGroupUiContractError(
        `Expected exactly one unselected comparison slot after its bounded input action failed; found ${finalSlotCount}.`,
        {
          control:
            GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
              .EMPTY_COMPARISON_SLOT,
          observed_count:
            finalSlotCount,
          query_index:
            queryIndex,
        },
      );
    }

    const finalInputCount =
      await queryInput.count();

    if (finalInputCount !== 1) {
      throw new GoogleTrendsQueryGroupUiContractError(
        `Expected exactly one nested comparison query input after its bounded action failed; found ${finalInputCount}.`,
        {
          control:
            GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
              .COMPARISON_QUERY_INPUT,
          observed_count:
            finalInputCount,
          query_index:
            queryIndex,
        },
      );
    }

    throw error;
  }

  await selectSearchTermSuggestion(
    page,
    query,
    timeout,
  );
};

/**
 * Applies one ordered Google Trends comparison group in Search Term mode.
 *
 * Provider DOM evidence captured from the classic Explore UI:
 *
 * - query input: role=searchbox, aria-label="Add a search term"
 * - after the first accepted query, live evidence showed one unselected/new
 *   slot with class "term-not-selected"; the same strict slot contract is
 *   required for every later comparison and fails closed if it is absent
 * - autocomplete suggestions are role=button rows whose accessible text
 *   combines query title and the "Search term" descriptor
 *
 * Provider-generated runtime input/list IDs are deliberately excluded
 * from the locator contract.
 */
export const applyGoogleTrendsSearchTermQueryGroup =
  async (
    input:
      ApplyGoogleTrendsSearchTermQueryGroupInput,
  ): Promise<void> => {
    const timeout =
      requirePositiveTimeout(
        input.ui_action_timeout_ms,
      );

    validateQueries(
      input.queries,
    );

    const firstInput =
      input.page.getByRole(
        'searchbox',
        {
          name:
            QUERY_SEARCHBOX_NAME,
        },
      );

    await fillAndSelectQuery(
      input.page,
      firstInput,
      input.queries[0],
      timeout,
      GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
        .INITIAL_QUERY_INPUT,
      0,
    );

    for (
      let index = 1;
      index < input.queries.length;
      index += 1
    ) {
      const emptySlot =
        input.page.locator(
          EMPTY_QUERY_SLOT_SELECTOR,
        );

      await fillAndSelectComparisonQuery(
        input.page,
        emptySlot,
        input.queries[index],
        timeout,
        index,
      );
    }
  };
