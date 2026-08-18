import type {
  ManagedBrowserDownload,
  ManagedBrowserPage,
} from './browser-manager';
import type {
  PersistedPublicDownload,
} from './persistent-download-store';

const DEFAULT_DOWNLOAD_TIMEOUT_MS =
  30_000;

export interface BrowserDownloadStore {
  save(input: {
    source_id: string;
    download: ManagedBrowserDownload;
    preferred_filename?: string;
  }): Promise<PersistedPublicDownload>;
}

export interface CaptureAndPersistBrowserDownloadInput {
  page: ManagedBrowserPage;
  store: BrowserDownloadStore;
  source_id: string;
  trigger_download: () => Promise<void>;
  preferred_filename?: string;
  timeout_ms?: number;
}

const requirePositiveTimeout = (
  value: number | undefined,
): number => {
  if (value === undefined) {
    return DEFAULT_DOWNLOAD_TIMEOUT_MS;
  }

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      'Browser download timeout_ms must be a positive integer.',
    );
  }

  return value;
};

/**
 * Captures exactly one page-scoped download event and persists it
 * through the configured public download store.
 *
 * The listener is armed before the UI action is triggered. This helper
 * does not retry, refresh, navigate, or otherwise alter provider state.
 */
export const captureAndPersistBrowserDownload = async (
  input: CaptureAndPersistBrowserDownloadInput,
): Promise<PersistedPublicDownload> => {
  const timeout =
    requirePositiveTimeout(
      input.timeout_ms,
    );

  const downloadPromise =
    input.page.waitForEvent(
      'download',
      {
        timeout,
      },
    );

  try {
    await input.trigger_download();
  } catch (error: unknown) {
    // The event wait may still be pending. Attach a rejection handler
    // so a later timeout cannot become an unhandled rejection while
    // preserving the original trigger failure for the caller.
    void downloadPromise.catch(
      (): void => {
        // The original trigger error remains the failure surfaced
        // to the caller; this observer only prevents a later
        // download-wait timeout from becoming unhandled.
      },
    );

    throw error;
  }

  const download =
    await downloadPromise;

  return input.store.save({
    source_id:
      input.source_id,
    download,
    ...(input.preferred_filename ===
    undefined
      ? {}
      : {
          preferred_filename:
            input.preferred_filename,
        }),
  });
};
