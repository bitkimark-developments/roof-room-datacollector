import type {
  ApplicationDirectories,
} from '../../../shared/bootstrap-status';

import {
  BrowserManager,
  type PersistentBrowserLauncher,
} from '../../browser/browser-manager';
import {
  PersistentDownloadStore,
} from '../../browser/persistent-download-store';
import {
  PlaywrightChromiumLauncher,
} from '../../browser/playwright-browser-launcher';

import {
  GoogleTrendsCollector,
} from './google-trends-collector';
import {
  GoogleTrendsSource,
} from './google-trends-source';

export interface GoogleTrendsRuntime {
  browser_manager:
    BrowserManager;
  source:
    GoogleTrendsSource;
}

/**
 * Composes the real M3 Google Trends runtime without opening a browser.
 *
 * Browser launch remains lazy and happens only when collect() is invoked.
 * This keeps SourceRegistry readiness summaries side-effect-free.
 */
export const createGoogleTrendsRuntime = (
  directories: ApplicationDirectories,
  launcher:
    PersistentBrowserLauncher =
      new PlaywrightChromiumLauncher(),
): GoogleTrendsRuntime => {
  const browserManager =
    new BrowserManager(
      directories,
      launcher,
    );

  const downloadStore =
    new PersistentDownloadStore(
      directories,
    );

  const collector =
    new GoogleTrendsCollector({
      browser_manager:
        browserManager,
      download_store:
        downloadStore,
    });

  return {
    browser_manager:
      browserManager,
    source:
      new GoogleTrendsSource(
        collector,
      ),
  };
};
