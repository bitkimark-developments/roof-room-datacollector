import type { SerpApiRequestContext } from '../../../shared/serpapi';
import {
  SERPAPI_LIVE_SMOKE_CONFIRMATION,
  SerpApiRuntimeFactory,
} from './serpapi-runtime';

export const createGuardedSerpApiLiveSmokeSource = (
  factory: SerpApiRuntimeFactory,
  input: {
    workspace_id: string;
    confirmation: string | undefined;
  },
) => {
  if (input.confirmation !== SERPAPI_LIVE_SMOKE_CONFIRMATION) {
    throw new Error(
      `SerpApi live smoke requires explicit confirmation: ${SERPAPI_LIVE_SMOKE_CONFIRMATION}`,
    );
  }
  return factory.createLiveSmokeSource(input);
};

export const SERPAPI_LIVE_SMOKE_CONTEXT: Omit<SerpApiRequestContext, 'query'> = {
  country_code: 'TR',
  language_code: 'tr',
  device: 'desktop',
  engine: 'google',
  organic_limit: 10,
  snapshot_date: '2026-09-10',
};
