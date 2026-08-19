import type {
  GoogleTrendsProbePage,
  GoogleTrendsProviderProbeResult,
} from './google-trends-provider-probe';
import {
  probeGoogleTrendsExplore,
} from './google-trends-provider-probe';
import {
  assessGoogleTrendsConfiguredExploreUrl,
  configuredExploreUrlAssessmentPasses,
  GoogleTrendsConfiguredExploreUrlError,
  type GoogleTrendsConfiguredExploreUrlInput,
} from './google-trends-configured-explore-url';

export interface ProbeConfiguredGoogleTrendsExploreInput {
  page:
    GoogleTrendsProbePage;
  requested_url: string;
  expected:
    GoogleTrendsConfiguredExploreUrlInput;
}

export interface ProbeConfiguredGoogleTrendsExploreDependencies {
  probe_provider:
    typeof probeGoogleTrendsExplore;
}

const DEFAULT_DEPENDENCIES:
  ProbeConfiguredGoogleTrendsExploreDependencies = {
    probe_provider:
      probeGoogleTrendsExplore,
  };

/**
 * Performs exactly one normal Explore navigation to a prebuilt provider
 * UI URL and verifies that the final URL still preserves the exact ordered
 * query group, geography, and date contract.
 *
 * Provider blocks are returned unchanged so RATE_LIMITED and
 * MANUAL_ACTION_REQUIRED retain priority. Contract verification runs only
 * after a non-blocking navigation and never refreshes or retries.
 */
export const probeConfiguredGoogleTrendsExplore =
  async (
    input:
      ProbeConfiguredGoogleTrendsExploreInput,
    dependencies:
      ProbeConfiguredGoogleTrendsExploreDependencies =
        DEFAULT_DEPENDENCIES,
  ): Promise<GoogleTrendsProviderProbeResult> => {
    const provider =
      await dependencies.probe_provider(
        input.page,
        {
          requested_url:
            input.requested_url,
        },
      );

    if (
      provider.provider_state !==
      'NO_RATE_LIMIT_SIGNAL'
    ) {
      return provider;
    }

    const assessment =
      assessGoogleTrendsConfiguredExploreUrl(
        provider.final_url,
        input.expected,
      );

    if (
      !configuredExploreUrlAssessmentPasses(
        assessment,
      )
    ) {
      throw new GoogleTrendsConfiguredExploreUrlError(
        'Google Trends final Explore URL did not preserve the exact configured query/date/geography contract.',
      );
    }

    return provider;
  };
