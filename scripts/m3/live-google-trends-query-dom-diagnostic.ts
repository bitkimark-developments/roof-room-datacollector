import {
  access,
} from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  Locator,
  Page,
} from 'playwright';

import {
  BrowserManager,
} from '../../src/main/browser/browser-manager';
import {
  PlaywrightChromiumLauncher,
} from '../../src/main/browser/playwright-browser-launcher';
import {
  loadQueryConfig,
} from '../../src/main/config/query-config-loader';
import {
  probeGoogleTrendsExplore,
} from '../../src/main/sources/google-trends/google-trends-provider-probe';
import type {
  ApplicationDirectories,
} from '../../src/shared/bootstrap-status';

export const LIVE_QUERY_DOM_DIAGNOSTIC_CONFIRMATION_FLAG =
  '--confirm-live-diagnostic';

const HELP_FLAG =
  '--help';

const QUERY_GROUP_ID =
  'GT01';

const INITIAL_QUERY_INPUT_NAME =
  'Add a search term';

const SEARCH_TERM_SUFFIX =
  'Search term';

const EMPTY_QUERY_SLOT_SELECTOR =
  '.compare-term-container .search-term-wrapper.term-not-selected';

const UI_ACTION_TIMEOUT_MS =
  10_000;

const MAX_CONTRACT_ROWS =
  100;

const MAX_ATTRIBUTE_LENGTH =
  200;

const RELEVANT_ARIA_LABEL =
  /search|term|comparison|compare|add|ekle|arama|karşılaştır/iu;

const SAFE_COMMAND_ERROR =
  /^(Refusing live Google Trends query DOM diagnostic|Unsupported argument\(s\)|External query configuration|ROOFROOM_APP_DATA_ROOT|External query configuration does not contain)/u;

interface RawContractRow {
  tag: string;
  role: string | null;
  aria_label: string | null;
  class_name: string | null;
  track_name: string | null;
}

export interface SafeContractRow {
  tag: string;
  role: string | null;
  aria_label: string | null;
  class_name: string | null;
  track_name: string | null;
}

export interface LiveQueryDomDiagnosticArguments {
  help: boolean;
  confirmed: boolean;
}

const usage = (): string =>
  [
    'Usage:',
    '  npm run m3:live-query-diagnostic -- --confirm-live-diagnostic',
    '',
    'Scope:',
    '  - makes one controlled Google Trends Explore navigation',
    '  - uses GT01 only through the second query input',
    '  - exercises the existing comparison Search Term suggestion locator once',
    '  - reports only bounded structural tag/role/aria-label/class evidence',
    '',
    'Safety:',
    '  - uses the app-owned persistent google browser profile',
    '  - makes no refresh, retry, download, or broader query-group request',
    '  - stops on RATE_LIMITED or MANUAL_ACTION_REQUIRED',
    '  - redacts configured query strings from structural attributes',
    '  - never prints page text, input values, HTML, cookies, headers, or session state',
  ].join('\n');

export const parseLiveQueryDomDiagnosticArguments = (
  args: readonly string[],
): LiveQueryDomDiagnosticArguments => {
  const allowed =
    new Set([
      HELP_FLAG,
      LIVE_QUERY_DOM_DIAGNOSTIC_CONFIRMATION_FLAG,
    ]);

  const unexpected =
    args.filter(
      (argument) =>
        !allowed.has(
          argument,
        ),
    );

  if (unexpected.length > 0) {
    throw new Error(
      `Unsupported argument(s): ${unexpected.join(', ')}`,
    );
  }

  return {
    help:
      args.includes(
        HELP_FLAG,
      ),
    confirmed:
      args.includes(
        LIVE_QUERY_DOM_DIAGNOSTIC_CONFIRMATION_FLAG,
      ),
  };
};

export const requireLiveQueryDomDiagnosticConfirmation = (
  args: readonly string[],
): LiveQueryDomDiagnosticArguments => {
  const parsed =
    parseLiveQueryDomDiagnosticArguments(
      args,
    );

  if (parsed.help) {
    return parsed;
  }

  if (!parsed.confirmed) {
    throw new Error(
      `Refusing live Google Trends query DOM diagnostic without ${LIVE_QUERY_DOM_DIAGNOSTIC_CONFIRMATION_FLAG}.`,
    );
  }

  return parsed;
};

const truncate = (
  value: string,
): string =>
  value.slice(
    0,
    MAX_ATTRIBUTE_LENGTH,
  );

const redactQueries = (
  value: string | null,
  queries: readonly string[],
): string | null => {
  if (value === null) {
    return null;
  }

  let redacted =
    value;

  for (const query of queries) {
    const normalizedQuery =
      query.toLocaleLowerCase(
        'tr-TR',
      );

    let matchIndex =
      redacted
        .toLocaleLowerCase(
          'tr-TR',
        )
        .indexOf(
          normalizedQuery,
        );

    while (matchIndex >= 0) {
      redacted =
        `${redacted.slice(0, matchIndex)}<QUERY>${redacted.slice(matchIndex + query.length)}`;

      matchIndex =
        redacted
          .toLocaleLowerCase(
            'tr-TR',
          )
          .indexOf(
            normalizedQuery,
          );
    }
  }

  return truncate(
    redacted,
  );
};

export const sanitizeQueryDomDiagnosticRows = (
  rows: readonly RawContractRow[],
  queries: readonly string[],
): SafeContractRow[] =>
  rows
    .slice(
      0,
      MAX_CONTRACT_ROWS,
    )
    .map(
      (row) => ({
        tag:
          truncate(
            row.tag,
          ),
        role:
          redactQueries(
            row.role,
            queries,
          ),
        aria_label:
          redactQueries(
            row.aria_label,
            queries,
          ),
        class_name:
          redactQueries(
            row.class_name,
            queries,
          ),
        track_name:
          redactQueries(
            row.track_name,
            queries,
          ),
      }),
    );

const resolveAppDataRoot = (): string => {
  const override =
    process.env
      .ROOFROOM_APP_DATA_ROOT;

  if (
    override !== undefined &&
    override.trim().length > 0
  ) {
    return path.resolve(
      override,
    );
  }

  if (process.platform !== 'darwin') {
    throw new Error(
      'ROOFROOM_APP_DATA_ROOT is required outside macOS for the M3 live query DOM diagnostic.',
    );
  }

  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'RoofRoom Data Collector',
    'app-data',
  );
};

const createDirectories = (
  appDataRoot: string,
): ApplicationDirectories => ({
  app_data_root:
    appDataRoot,
  config:
    path.join(
      appDataRoot,
      'config',
    ),
  data:
    path.join(
      appDataRoot,
      'data',
    ),
  runs:
    path.join(
      appDataRoot,
      'data',
      'runs',
    ),
  database:
    path.join(
      appDataRoot,
      'database',
    ),
  browser_profiles:
    path.join(
      appDataRoot,
      'browser-profiles',
    ),
  logs:
    path.join(
      appDataRoot,
      'logs',
    ),
  public_downloads:
    path.join(
      os.homedir(),
      'Downloads',
      'RoofRoom Data Collector',
    ),
});

const resolveExternalQueryConfigPath = (
  directories:
    ApplicationDirectories,
): string => {
  const override =
    process.env
      .ROOFROOM_QUERY_CONFIG_PATH;

  if (
    override !== undefined &&
    override.trim().length > 0
  ) {
    return path.resolve(
      override,
    );
  }

  return path.join(
    directories.config,
    'query-groups.yaml',
  );
};

const requireReadableFile = async (
  filePath: string,
): Promise<void> => {
  try {
    await access(
      filePath,
    );
  } catch {
    throw new Error(
      `External query configuration is not readable: ${filePath}`,
    );
  }
};

const rawContractRows = async (
  locator: Locator,
): Promise<RawContractRow[]> =>
  locator.evaluateAll(
    (elements) =>
      elements.map(
        (element) => ({
          tag:
            element.tagName.toLowerCase(),
          role:
            element.getAttribute(
              'role',
            ),
          aria_label:
            element.getAttribute(
              'aria-label',
            ),
          class_name:
            element.getAttribute(
              'class',
            ),
          track_name:
            element.getAttribute(
              'track-name',
            ),
        }),
      ),
  );

const main = async (): Promise<void> => {
  const parsed =
    requireLiveQueryDomDiagnosticConfirmation(
      process.argv.slice(2),
    );

  if (parsed.help) {
    console.log(
      usage(),
    );
    return;
  }

  const directories =
    createDirectories(
      resolveAppDataRoot(),
    );

  const queryConfigPath =
    resolveExternalQueryConfigPath(
      directories,
    );

  await requireReadableFile(
    queryConfigPath,
  );

  const queryConfig =
    await loadQueryConfig(
      queryConfigPath,
    );

  const queryGroup =
    queryConfig.groups.find(
      (group) =>
        group.query_group_id ===
        QUERY_GROUP_ID,
    );

  if (queryGroup === undefined) {
    throw new Error(
      `External query configuration does not contain ${QUERY_GROUP_ID}.`,
    );
  }

  const browserManager =
    new BrowserManager(
      directories,
      new PlaywrightChromiumLauncher(),
    );

  try {
    const session =
      await browserManager.openProfile(
        'google',
        {
          headless: false,
          accept_downloads: false,
        },
      );

    const managedPage =
      await session.context
        .newPage();

    const page =
      managedPage as Page;

    const provider =
      await probeGoogleTrendsExplore(
        page,
      );

    if (
      provider.provider_state !==
        'NO_RATE_LIMIT_SIGNAL'
    ) {
      console.log(
        JSON.stringify(
          {
            result_type:
              provider.provider_state,
            signals:
              provider.signals,
          },
          null,
          2,
        ),
      );

      process.exitCode =
        provider.provider_state ===
          'RATE_LIMITED'
          ? 4
          : 3;
      return;
    }

    const firstQuery =
      queryGroup.queries[0];

    const secondQuery =
      queryGroup.queries[1];

    if (secondQuery === undefined) {
      throw new Error(
        'External query configuration does not contain a second GT01 query.',
      );
    }

    const initialInput =
      page.getByRole(
        'searchbox',
        {
          name:
            INITIAL_QUERY_INPUT_NAME,
        },
      );

    const initialInputCount =
      await initialInput.count();

    if (initialInputCount !== 1) {
      console.log(
        JSON.stringify(
          {
            result_type:
              'INITIAL_QUERY_INPUT_CONTRACT',
            observed_count:
              initialInputCount,
          },
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    await initialInput.fill(
      firstQuery,
      {
        timeout:
          UI_ACTION_TIMEOUT_MS,
      },
    );

    await page
      .getByRole(
        'button',
        {
          name:
            `${firstQuery} ${SEARCH_TERM_SUFFIX}`,
        },
      )
      .click({
        timeout:
          UI_ACTION_TIMEOUT_MS,
      });

    const emptySlot =
      page.locator(
        EMPTY_QUERY_SLOT_SELECTOR,
      );

    const comparisonInput =
      emptySlot.getByRole(
        'searchbox',
        {
          name:
            INITIAL_QUERY_INPUT_NAME,
        },
      );

    await comparisonInput.fill(
      secondQuery,
      {
        timeout:
          UI_ACTION_TIMEOUT_MS,
      },
    );

    const expectedSuggestion =
      page.getByRole(
        'button',
        {
          name:
            `${secondQuery} ${SEARCH_TERM_SUFFIX}`,
        },
      );

    const initialExpectedSuggestionCount =
      await expectedSuggestion.count();

    let suggestionAction =
      'CLICKED';

    try {
      await expectedSuggestion.click({
        timeout:
          UI_ACTION_TIMEOUT_MS,
      });
    } catch (error: unknown) {
      suggestionAction =
        error instanceof Error
          ? error.name
          : 'UNKNOWN_ERROR';
    }

    const finalExpectedSuggestionCount =
      await expectedSuggestion.count();

    const selectorCounts:
      Record<string, number> = {};

    for (
      const selector of [
        '.compare-term-container',
        '.compare-term-container .search-term-wrapper',
        '.compare-term-container .search-term-wrapper.term-not-selected',
        '.compare-term-container button',
        '.compare-term-container [role="button"]',
        '.compare-term-container [aria-label]',
        '.md-autocomplete-suggestions-container',
        '.md-autocomplete-suggestions-container [role]',
        '.md-autocomplete-suggestions-container button',
        '.md-autocomplete-suggestions-container [role="button"]',
        '.md-autocomplete-suggestions-container [role="option"]',
        '[role="option"]',
      ]
    ) {
      selectorCounts[selector] =
        await page
          .locator(
            selector,
          )
          .count();
    }

    const compareRows =
      await rawContractRows(
        page.locator(
          '.compare-term-container, .compare-term-container *',
        ),
      );

    const suggestionRows =
      await rawContractRows(
        page.locator(
          '.md-autocomplete-suggestions-container, .md-autocomplete-suggestions-container *',
        ),
      );

    const relevantAriaRows =
      (
        await rawContractRows(
          page.locator(
            '[aria-label]',
          ),
        )
      ).filter(
        (row) =>
          row.aria_label !== null &&
          RELEVANT_ARIA_LABEL.test(
            row.aria_label,
          ),
      );

    console.log(
      JSON.stringify(
        {
          result_type:
            'QUERY_DOM_DIAGNOSTIC',
          initial_expected_suggestion_count:
            initialExpectedSuggestionCount,
          suggestion_action:
            suggestionAction,
          final_expected_suggestion_count:
            finalExpectedSuggestionCount,
          selector_counts:
            selectorCounts,
          compare_contracts:
            sanitizeQueryDomDiagnosticRows(
              compareRows,
              queryGroup.queries,
            ),
          suggestion_contracts:
            sanitizeQueryDomDiagnosticRows(
              suggestionRows,
              queryGroup.queries,
            ),
          relevant_aria_contracts:
            sanitizeQueryDomDiagnosticRows(
              relevantAriaRows,
              queryGroup.queries,
            ),
        },
        null,
        2,
      ),
    );
  } finally {
    await browserManager.close();
  }
};

if (require.main === module) {
  main().catch(
    (error: unknown) => {
      const safeMessage =
        error instanceof Error &&
        SAFE_COMMAND_ERROR.test(
          error.message,
        )
          ? error.message
          : error instanceof Error
            ? error.name
            : 'UNKNOWN_DIAGNOSTIC_ERROR';

      console.error(
        safeMessage,
      );
      process.exitCode = 1;
    },
  );
}
