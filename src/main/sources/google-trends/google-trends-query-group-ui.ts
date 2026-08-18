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
  10_000;

export class GoogleTrendsQueryGroupUiContractError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsQueryGroupUiContractError';
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
): Promise<void> => {
  const count =
    await locator.count();

  if (count !== 1) {
    throw new GoogleTrendsQueryGroupUiContractError(
      `Expected exactly one ${description}; found ${count}.`,
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
): Promise<void> => {
  await requireExactlyOne(
    input,
    `"${QUERY_SEARCHBOX_NAME}" query input`,
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

/**
 * Applies one ordered Google Trends comparison group in Search Term mode.
 *
 * Provider DOM evidence captured from the classic Explore UI:
 *
 * - query input: role=searchbox, aria-label="Add a search term"
 * - comparison add button:
 *   aria-label="Add a search term for comparison"
 * - unselected/new slot receives the provider class "term-not-selected"
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
    );

    for (
      let index = 1;
      index < input.queries.length;
      index += 1
    ) {
      const addComparison =
        input.page.getByRole(
          'button',
          {
            name:
              ADD_COMPARISON_NAME,
          },
        );

      await requireExactlyOne(
        addComparison,
        `"${ADD_COMPARISON_NAME}" button`,
      );

      await addComparison.click({
        timeout,
      });

      const emptySlot =
        input.page.locator(
          EMPTY_QUERY_SLOT_SELECTOR,
        );

      await requireExactlyOne(
        emptySlot,
        'unselected comparison slot',
      );

      const queryInput =
        emptySlot.getByRole(
          'searchbox',
          {
            name:
              QUERY_SEARCHBOX_NAME,
          },
        );

      await fillAndSelectQuery(
        input.page,
        queryInput,
        input.queries[index],
        timeout,
      );
    }
  };
