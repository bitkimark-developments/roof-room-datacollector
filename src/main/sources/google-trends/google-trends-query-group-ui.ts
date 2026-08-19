import type {
  ManagedBrowserLocator,
  ManagedBrowserPage,
} from '../../browser/browser-manager';

const QUERY_SEARCHBOX_NAME =
  'Add a search term';

const ADD_COMPARISON_NAME =
  'Add a search term for comparison';

const EMPTY_QUERY_SLOT_SELECTOR =
  '.compare-term-container .search-term-wrapper.term-not-selected';

const SEARCH_TERM_SUFFIX =
  'Search term';

const GOOGLE_TRENDS_COMPARISON_LIMIT =
  5;

const DEFAULT_UI_ACTION_TIMEOUT_MS =
  30_000;

export const GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS = {
  INITIAL_QUERY_INPUT:
    'INITIAL_QUERY_INPUT',
  SEARCH_TERM_SUGGESTION:
    'SEARCH_TERM_SUGGESTION',
  ADD_COMPARISON:
    'ADD_COMPARISON',
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
  queryIndex: number,
): Promise<void> => {
  const suggestion =
    page.getByRole(
      'button',
      {
        name:
          `${query} ${SEARCH_TERM_SUFFIX}`,
      },
    );

  const initialCount =
    await suggestion.count();

  if (initialCount > 1) {
    throw new GoogleTrendsQueryGroupUiContractError(
      `Expected at most one Search Term suggestion while waiting for query selection; found ${initialCount}.`,
      {
        control:
          GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
            .SEARCH_TERM_SUGGESTION,
        observed_count:
          initialCount,
        query_index:
          queryIndex,
      },
    );
  }

  try {
    // Playwright locator actions wait for the async Angular Material
    // autocomplete result and remain strict if multiple matching
    // Search Term suggestions unexpectedly appear.
    await suggestion.click({
      timeout,
    });
  } catch {
    const finalCount =
      await suggestion.count();

    throw new GoogleTrendsQueryGroupUiContractError(
      `Search Term suggestion action failed with ${finalCount} matching controls.`,
      {
        control:
          GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
            .SEARCH_TERM_SUGGESTION,
        observed_count:
          finalCount,
        query_index:
          queryIndex,
      },
    );
  }
};

const openAdditionalComparisonSlot = async (
  page: ManagedBrowserPage,
  timeout: number,
  queryIndex: number,
): Promise<void> => {
  const addComparison =
    page.getByRole(
      'button',
      {
        name:
          ADD_COMPARISON_NAME,
      },
    );

  const initialCount =
    await addComparison.count();

  if (initialCount > 1) {
    throw new GoogleTrendsQueryGroupUiContractError(
      `Expected at most one comparison-add control while waiting for the next query slot; found ${initialCount}.`,
      {
        control:
          GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
            .ADD_COMPARISON,
        observed_count:
          initialCount,
        query_index:
          queryIndex,
      },
    );
  }

  try {
    // After the first comparison, the provider exposes this control
    // asynchronously. The strict action waits for one actionable match.
    await addComparison.click({
      timeout,
    });
  } catch {
    const finalCount =
      await addComparison.count();

    throw new GoogleTrendsQueryGroupUiContractError(
      `Comparison-add action failed with ${finalCount} matching controls.`,
      {
        control:
          GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
            .ADD_COMPARISON,
        observed_count:
          finalCount,
        query_index:
          queryIndex,
      },
    );
  }
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

  try {
    await input.fill(
      query,
      {
        timeout,
      },
    );
  } catch {
    const finalCount =
      await input.count();

    throw new GoogleTrendsQueryGroupUiContractError(
      `Query input action failed with ${finalCount} matching controls.`,
      {
        control:
          diagnosticControl,
        observed_count:
          finalCount,
        query_index:
          queryIndex,
      },
    );
  }

  await selectSearchTermSuggestion(
    page,
    query,
    timeout,
    queryIndex,
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
  } catch {
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

    throw new GoogleTrendsQueryGroupUiContractError(
      `Nested comparison query input action failed with ${finalInputCount} matching controls.`,
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

  await selectSearchTermSuggestion(
    page,
    query,
    timeout,
    queryIndex,
  );
};

/**
 * Applies one ordered Google Trends comparison group in Search Term mode.
 *
 * Provider DOM evidence captured from the classic Explore UI:
 *
 * - query input: role=searchbox, aria-label="Add a search term"
 * - after the first accepted query, live evidence showed one unselected/new
 *   slot with class "term-not-selected", without an add control
 * - after the second accepted query, live evidence showed the comparison-add
 *   control; it must be activated before each later comparison slot
 * - every empty comparison slot must satisfy the same strict nested contract
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
      if (index >= 2) {
        await openAdditionalComparisonSlot(
          input.page,
          timeout,
          index,
        );
      }

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
