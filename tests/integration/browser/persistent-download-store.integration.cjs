const assert = require(
  'node:assert/strict',
);
const {
  createHash,
} = require(
  'node:crypto',
);
const fsp = require(
  'node:fs/promises',
);
const path = require(
  'node:path',
);

const [
  buildRoot,
  workRoot,
] = process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error(
    'Expected compiled build root and temporary work root.',
  );
}

const {
  PersistentDownloadStore,
  PublicDownloadStorageError,
} = require(
  path.join(
    buildRoot,
    'main',
    'browser',
    'persistent-download-store.js',
  ),
);

const appDataRoot =
  path.join(
    workRoot,
    'app-data',
  );

const publicDownloads =
  path.join(
    workRoot,
    'Downloads',
    'RoofRoom Data Collector',
  );

const directories = {
  app_data_root: appDataRoot,
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
    publicDownloads,
};

class FakeDownload {
  constructor({
    bytes,
    suggestedFilename,
    failure = null,
  }) {
    this.bytes = bytes;
    this.filename =
      suggestedFilename;
    this.failureValue =
      failure;
    this.saveAsCalls = [];
  }

  suggestedFilename() {
    return this.filename;
  }

  async saveAs(
    destinationPath,
  ) {
    this.saveAsCalls.push(
      destinationPath,
    );

    await fsp.writeFile(
      destinationPath,
      this.bytes,
    );
  }

  async failure() {
    return this.failureValue;
  }
}

const main = async () => {
  const store =
    new PersistentDownloadStore(
      directories,
    );

  const bytes =
    Buffer.from(
      [
        'Category: All categories',
        '',
        'Week,canlı bitki: (Türkiye)',
        '2024-08-18,30',
        '',
      ].join('\n'),
      'utf8',
    );

  const firstDownload =
    new FakeDownload({
      bytes,
      suggestedFilename:
        'multiTimeline.csv',
    });

  const first =
    await store.save({
      source_id:
        'google-trends',
      download:
        firstDownload,
      preferred_filename:
        'GT01_TR_2024-08-18_2026-08-17_interest_over_time.csv',
    });

  assert.equal(
    first.filename,
    'GT01_TR_2024-08-18_2026-08-17_interest_over_time.csv',
  );

  assert.equal(
    first.absolute_path,
    path.join(
      publicDownloads,
      'google-trends',
      first.filename,
    ),
  );

  assert.equal(
    first.byte_size,
    bytes.length,
  );

  assert.equal(
    first.sha256,
    createHash('sha256')
      .update(bytes)
      .digest('hex'),
  );

  assert.deepEqual(
    await fsp.readFile(
      first.absolute_path,
    ),
    bytes,
  );

  const secondDownload =
    new FakeDownload({
      bytes,
      suggestedFilename:
        'multiTimeline.csv',
    });

  const second =
    await store.save({
      source_id:
        'google-trends',
      download:
        secondDownload,
      preferred_filename:
        'GT01_TR_2024-08-18_2026-08-17_interest_over_time.csv',
    });

  assert.equal(
    second.filename,
    'GT01_TR_2024-08-18_2026-08-17_interest_over_time__2.csv',
  );

  assert.deepEqual(
    await fsp.readFile(
      first.absolute_path,
    ),
    bytes,
  );

  assert.deepEqual(
    await fsp.readFile(
      second.absolute_path,
    ),
    bytes,
  );

  const suggestedNameDownload =
    new FakeDownload({
      bytes,
      suggestedFilename:
        'provider-export.csv',
    });

  const suggested =
    await store.save({
      source_id:
        'google-trends',
      download:
        suggestedNameDownload,
    });

  assert.equal(
    suggested.filename,
    'provider-export.csv',
  );

  for (const unsafe of [
    '../escape.csv',
    '/tmp/escape.csv',
    'folder/escape.csv',
    '',
  ]) {
    await assert.rejects(
      () =>
        store.save({
          source_id:
            'google-trends',
          download:
            new FakeDownload({
              bytes,
              suggestedFilename:
                'safe.csv',
            }),
          preferred_filename:
            unsafe,
        }),
      (error) =>
        error instanceof
          PublicDownloadStorageError,
    );
  }

  await assert.rejects(
    () =>
      store.save({
        source_id:
          '../google-trends',
        download:
          new FakeDownload({
            bytes,
            suggestedFilename:
              'safe.csv',
          }),
      }),
    (error) =>
      error instanceof
        PublicDownloadStorageError,
  );

  const failedDownload =
    new FakeDownload({
      bytes,
      suggestedFilename:
        'failed.csv',
      failure:
        'download canceled',
    });

  await assert.rejects(
    () =>
      store.save({
        source_id:
          'google-trends',
        download:
          failedDownload,
      }),
    /Browser download failed: download canceled/,
  );

  const files =
    await fsp.readdir(
      path.join(
        publicDownloads,
        'google-trends',
      ),
    );

  assert.equal(
    files.some(
      (filename) =>
        filename.startsWith(
          '.roofroom-download-',
        ),
    ),
    false,
  );

  console.log(
    'PASS DOWNLOAD-001: persistent browser downloads are saved under the user-visible Downloads/RoofRoom Data Collector directory',
  );
  console.log(
    'PASS DOWNLOAD-002: source-specific subdirectories keep provider files organized',
  );
  console.log(
    'PASS DOWNLOAD-003: persisted bytes, byte_size, and SHA-256 are derived from the public copy',
  );
  console.log(
    'PASS DOWNLOAD-004: existing public files are never silently overwritten',
  );
  console.log(
    'PASS DOWNLOAD-005: unsafe source IDs and filenames fail closed',
  );
  console.log(
    'PASS DOWNLOAD-006: failed browser downloads are rejected and temporary files are cleaned up',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
