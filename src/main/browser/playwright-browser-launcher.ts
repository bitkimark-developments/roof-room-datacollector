import {
  chromium,
  type BrowserContext,
} from 'playwright';

import type {
  PersistentBrowserLauncher,
  PersistentBrowserLaunchOptions,
} from './browser-manager';

export class PlaywrightChromiumLauncher
  implements PersistentBrowserLauncher
{
  async launchPersistentContext(
    userDataDir: string,
    options:
      PersistentBrowserLaunchOptions,
  ): Promise<BrowserContext> {
    return chromium
      .launchPersistentContext(
        userDataDir,
        {
          headless: options.headless,
          acceptDownloads:
            options.acceptDownloads,
        },
      );
  }
}
