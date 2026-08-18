import * as os from 'node:os';
import * as path from 'node:path';

import {
  BrowserManager,
} from '../../src/main/browser/browser-manager';
import {
  PlaywrightChromiumLauncher,
} from '../../src/main/browser/playwright-browser-launcher';
import {
  GoogleTrendsBrowserProbeService,
} from '../../src/main/sources/google-trends/google-trends-browser-probe-service';
import type {
  ApplicationDirectories,
} from '../../src/shared/bootstrap-status';

export const LIVE_PROBE_CONFIRMATION_FLAG =
  '--confirm-live-request';

const HELP_FLAG = '--help';

const usage = (): string =>
  [
    'Usage:',
    '  npm run m3:live-provider-probe -- --confirm-live-request',
    '',
    'Safety:',
    '  - makes one explicit Google Trends Explore navigation',
    '  - uses the app-owned persistent google browser profile',
    '  - does not auto-refresh or auto-retry',
    '  - does not print raw HTML, cookies, auth headers, or session state',
  ].join('\n');

export interface LiveProbeArguments {
  help: boolean;
  confirmed: boolean;
}

export const parseLiveProbeArguments = (
  args: readonly string[],
): LiveProbeArguments => {
  const allowed = new Set([
    HELP_FLAG,
    LIVE_PROBE_CONFIRMATION_FLAG,
  ]);

  const unexpected =
    args.filter(
      (argument) =>
        !allowed.has(argument),
    );

  if (unexpected.length > 0) {
    throw new Error(
      `Unsupported argument(s): ${unexpected.join(', ')}`,
    );
  }

  return {
    help: args.includes(
      HELP_FLAG,
    ),
    confirmed: args.includes(
      LIVE_PROBE_CONFIRMATION_FLAG,
    ),
  };
};

export const requireLiveProbeConfirmation = (
  args: readonly string[],
): LiveProbeArguments => {
  const parsed =
    parseLiveProbeArguments(args);

  if (parsed.help) {
    return parsed;
  }

  if (!parsed.confirmed) {
    throw new Error(
      `Refusing live Google Trends request without ${LIVE_PROBE_CONFIRMATION_FLAG}.`,
    );
  }

  return parsed;
};

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
      'ROOFROOM_APP_DATA_ROOT is required outside macOS for the M3 development live probe.',
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
  app_data_root: appDataRoot,
  config: path.join(
    appDataRoot,
    'config',
  ),
  data: path.join(
    appDataRoot,
    'data',
  ),
  runs: path.join(
    appDataRoot,
    'data',
    'runs',
  ),
  database: path.join(
    appDataRoot,
    'database',
  ),
  browser_profiles: path.join(
    appDataRoot,
    'browser-profiles',
  ),
  logs: path.join(
    appDataRoot,
    'logs',
  ),
  public_downloads: path.join(
    os.homedir(),
    'Downloads',
    'RoofRoom Data Collector',
  ),
});

const main = async (): Promise<void> => {
  const parsed =
    requireLiveProbeConfirmation(
      process.argv.slice(2),
    );

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const directories =
    createDirectories(
      resolveAppDataRoot(),
    );

  const browserManager =
    new BrowserManager(
      directories,
      new PlaywrightChromiumLauncher(),
    );

  try {
    const service =
      new GoogleTrendsBrowserProbeService(
        browserManager,
      );

    const result =
      await service.probe();

    // Deliberately emit only the safe probe result.
    // Raw HTML, cookies, auth headers, and session
    // state are not included by the provider probe.
    console.log(
      JSON.stringify(
        {
          provider_state:
            result.provider_state,
          error_code:
            result.error_code,
          response_status:
            result.response_status,
          retry_after:
            result.retry_after,
          signals:
            result.signals,
        },
        null,
        2,
      ),
    );

    if (
      result.provider_state ===
      'RATE_LIMITED'
    ) {
      console.error(
        'Google Trends rate limiting detected. No refresh or retry was attempted.',
      );
      return;
    }

    console.error(
      'No rate-limit signal detected. This does not yet prove authentication state, UI readiness, selectors, or CSV export behavior.',
    );
  } finally {
    await browserManager.close();
  }
};

if (require.main === module) {
  main().catch(
    (error: unknown) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Unknown live Google Trends probe error.',
      );
      process.exitCode = 1;
    },
  );
}
