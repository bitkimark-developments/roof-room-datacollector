import type {
  BrowserManager,
  ManagedBrowserPage,
} from '../../browser/browser-manager';

import {
  probeGoogleTrendsExplore,
  type GoogleTrendsProviderProbeOptions,
  type GoogleTrendsProviderProbeResult,
} from './google-trends-provider-probe';

const GOOGLE_TRENDS_PROFILE_ID =
  'google';

export interface GoogleTrendsBrowserProbeServiceOptions {
  profile_id?: string;
}

export class GoogleTrendsBrowserProbeService {
  private readonly profileId: string;

  constructor(
    private readonly browserManager:
      BrowserManager,
    options:
      GoogleTrendsBrowserProbeServiceOptions = {},
  ) {
    this.profileId =
      options.profile_id ??
      GOOGLE_TRENDS_PROFILE_ID;
  }

  async probe(
    options:
      GoogleTrendsProviderProbeOptions = {},
  ): Promise<GoogleTrendsProviderProbeResult> {
    const session =
      await this.browserManager.openProfile(
        this.profileId,
        {
          // Provider probing is intentionally headed so
          // any security/authentication boundary remains
          // visible to the user during future live use.
          headless: false,
          accept_downloads: true,
        },
      );

    const page:
      ManagedBrowserPage =
      await session.context.newPage();

    try {
      // Exactly one navigation attempt is delegated to
      // probeGoogleTrendsExplore. No automatic refresh,
      // retry, profile rotation, or rate-limit bypass.
      return await probeGoogleTrendsExplore(
        page,
        options,
      );
    } finally {
      await page.close();
    }
  }
}
