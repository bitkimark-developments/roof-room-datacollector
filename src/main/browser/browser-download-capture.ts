import {
  createHash,
} from 'node:crypto';
import {
  buffer,
} from 'node:stream/consumers';

import type {
  ManagedBrowserPage,
} from './browser-manager';

const DEFAULT_DOWNLOAD_TIMEOUT_MS =
  30_000;

export interface CapturedBrowserDownload {
  suggested_filename: string;
  bytes: Uint8Array;
  byte_size: number;
  sha256: string;
}

export interface CaptureBrowserDownloadInput {
  page: ManagedBrowserPage;
  trigger_download: () => Promise<void>;
  timeout_ms?: number;
}

export class BrowserDownloadCaptureError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'BrowserDownloadCaptureError';
  }
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
 * Captures exactly one page-scoped download event and reads the provider
 * bytes directly from Playwright's download stream.
 *
 * The listener is armed before the UI action is triggered. This helper
 * does not write to Downloads, retry, refresh, navigate, or otherwise
 * alter provider state. The caller passes the bytes to shared Core,
 * which owns run-scoped candidate persistence and later acceptance.
 */
export const captureBrowserDownload = async (
  input: CaptureBrowserDownloadInput,
): Promise<CapturedBrowserDownload> => {
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

  let download;

  try {
    download =
      await downloadPromise;
  } catch (error: unknown) {
    throw new BrowserDownloadCaptureError(
      `Browser download event failed: ${
        error instanceof Error
          ? error.message
          : 'unknown error'
      }`,
    );
  }

  let bytes: Buffer;

  try {
    const failure =
      await download.failure();

    if (failure !== null) {
      throw new BrowserDownloadCaptureError(
        `Browser download failed: ${failure}`,
      );
    }

    const stream =
      await download.createReadStream();

    bytes =
      await buffer(stream);
  } catch (error: unknown) {
    if (
      error instanceof
        BrowserDownloadCaptureError
    ) {
      throw error;
    }

    throw new BrowserDownloadCaptureError(
      `Browser download byte capture failed: ${
        error instanceof Error
          ? error.message
          : 'unknown error'
      }`,
    );
  }

  return {
    suggested_filename:
      download.suggestedFilename(),
    bytes:
      new Uint8Array(bytes),
    byte_size:
      bytes.byteLength,
    sha256:
      createHash('sha256')
        .update(bytes)
        .digest('hex'),
  };
};
