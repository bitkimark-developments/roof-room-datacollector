import {
  createHash,
} from 'node:crypto';
import {
  readFile,
} from 'node:fs/promises';

import type {
  BrowserDownloadStore,
} from '../../browser/browser-download-capture';
import type {
  ManagedBrowserPage,
} from '../../browser/browser-manager';
import type {
  PersistedPublicDownload,
} from '../../browser/persistent-download-store';

import {
  applyGoogleTrendsCustomDateRange,
} from './google-trends-custom-date-range';
import {
  applyGoogleTrendsTurkeyGeography,
} from './google-trends-geography-ui';
import {
  downloadGoogleTrendsInterestOverTime,
} from './google-trends-interest-over-time-download';
import {
  applyGoogleTrendsSearchTermQueryGroup,
} from './google-trends-query-group-ui';
import {
  verifyGoogleTrendsFixedFilters,
} from './google-trends-fixed-filter-verifier';

const CSV_MEDIA_TYPE =
  'text/csv';

export class GoogleTrendsConfiguredPageExportError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsConfiguredPageExportError';
  }
}

export interface ExportConfiguredGoogleTrendsPageInput {
  page: ManagedBrowserPage;
  store: BrowserDownloadStore;
  queries: readonly string[];
  requested_date_start: string;
  requested_date_end: string;
  public_preferred_filename?: string;
  ui_action_timeout_ms?: number;
  download_timeout_ms?: number;
}

export interface GoogleTrendsConfiguredPageExportResult {
  media_type: typeof CSV_MEDIA_TYPE;
  bytes: Uint8Array;
  public_download: PersistedPublicDownload;
}

export interface GoogleTrendsConfiguredPageExportDependencies {
  apply_query_group:
    typeof applyGoogleTrendsSearchTermQueryGroup;
  apply_turkey_geography:
    typeof applyGoogleTrendsTurkeyGeography;
  apply_custom_date_range:
    typeof applyGoogleTrendsCustomDateRange;
  verify_fixed_filters:
    typeof verifyGoogleTrendsFixedFilters;
  download_interest_over_time:
    typeof downloadGoogleTrendsInterestOverTime;
  read_public_download(
    absolutePath: string,
  ): Promise<Uint8Array>;
}

const DEFAULT_DEPENDENCIES:
  GoogleTrendsConfiguredPageExportDependencies = {
    apply_query_group:
      applyGoogleTrendsSearchTermQueryGroup,
    apply_turkey_geography:
      applyGoogleTrendsTurkeyGeography,
    apply_custom_date_range:
      applyGoogleTrendsCustomDateRange,
    verify_fixed_filters:
      verifyGoogleTrendsFixedFilters,
    download_interest_over_time:
      downloadGoogleTrendsInterestOverTime,
    read_public_download:
      async (
        absolutePath: string,
      ): Promise<Uint8Array> =>
        readFile(
          absolutePath,
        ),
  };

const sha256 = (
  bytes: Uint8Array,
): string =>
  createHash(
    'sha256',
  )
    .update(bytes)
    .digest('hex');

const assertPublicCopyIntegrity = (
  persisted:
    PersistedPublicDownload,
  bytes: Uint8Array,
): void => {
  if (
    bytes.byteLength !==
    persisted.byte_size
  ) {
    throw new GoogleTrendsConfiguredPageExportError(
      `Persisted public download byte-size mismatch: metadata=${persisted.byte_size}, reread=${bytes.byteLength}.`,
    );
  }

  const rereadSha256 =
    sha256(
      bytes,
    );

  if (
    rereadSha256 !==
    persisted.sha256
  ) {
    throw new GoogleTrendsConfiguredPageExportError(
      'Persisted public download SHA-256 mismatch after reread.',
    );
  }
};

/**
 * Executes the already-discovered classic Google Trends UI workflow on
 * an already-open Explore page:
 *
 * ordered Search Term query group
 * → Türkiye
 * → exact custom date range
 * → verify All categories + Web Search
 * → scoped Interest over time CSV download
 *
 * The browser download is first preserved in the user-visible public
 * download store. The exact persisted public copy is then reread and
 * checked against its recorded byte size and SHA-256. Those verified
 * bytes are returned to the caller so the shared CollectionOrchestrator
 * can remain the owner of the canonical run-scoped raw artifact.
 *
 * This service deliberately does not navigate, refresh, retry, perform
 * authentication, or decide run/job state.
 */
export const exportConfiguredGoogleTrendsPage =
  async (
    input:
      ExportConfiguredGoogleTrendsPageInput,
    dependencies:
      GoogleTrendsConfiguredPageExportDependencies =
        DEFAULT_DEPENDENCIES,
  ): Promise<GoogleTrendsConfiguredPageExportResult> => {
    const uiTimeout =
      input.ui_action_timeout_ms;

    await dependencies.apply_query_group({
      page:
        input.page,
      queries:
        input.queries,
      ...(uiTimeout === undefined
        ? {}
        : {
            ui_action_timeout_ms:
              uiTimeout,
          }),
    });

    await dependencies.apply_turkey_geography({
      page:
        input.page,
      ...(uiTimeout === undefined
        ? {}
        : {
            ui_action_timeout_ms:
              uiTimeout,
          }),
    });

    await dependencies.apply_custom_date_range({
      page:
        input.page,
      requested_date_start:
        input.requested_date_start,
      requested_date_end:
        input.requested_date_end,
      ...(uiTimeout === undefined
        ? {}
        : {
            ui_action_timeout_ms:
              uiTimeout,
          }),
    });

    await dependencies.verify_fixed_filters({
      page:
        input.page,
      ...(uiTimeout === undefined
        ? {}
        : {
            ui_read_timeout_ms:
              uiTimeout,
          }),
    });

    const publicDownload =
      await dependencies
        .download_interest_over_time({
          page:
            input.page,
          store:
            input.store,
          ...(input.public_preferred_filename ===
          undefined
            ? {}
            : {
                preferred_filename:
                  input.public_preferred_filename,
              }),
          ...(input.download_timeout_ms ===
          undefined
            ? {}
            : {
                download_timeout_ms:
                  input.download_timeout_ms,
              }),
          ...(uiTimeout === undefined
            ? {}
            : {
                ui_action_timeout_ms:
                  uiTimeout,
              }),
        });

    const bytes =
      await dependencies
        .read_public_download(
          publicDownload.absolute_path,
        );

    assertPublicCopyIntegrity(
      publicDownload,
      bytes,
    );

    return {
      media_type:
        CSV_MEDIA_TYPE,
      bytes:
        new Uint8Array(
          bytes,
        ),
      public_download:
        publicDownload,
    };
  };
