const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error(
    'Expected compiled build root and temporary work root.',
  );
}

const {
  StorageCollisionError,
  StorageManager,
  UnsafeStoragePathError,
} = require(
  path.join(
    buildRoot,
    'main',
    'storage',
    'storage-manager.js',
  ),
);

const dataRoot = path.join(
  workRoot,
  'app-data',
  'data',
);

const directories = {
  app_data_root: path.join(
    workRoot,
    'app-data',
  ),
  config: path.join(
    workRoot,
    'app-data',
    'config',
  ),
  data: dataRoot,
  runs: path.join(
    dataRoot,
    'runs',
  ),
  database: path.join(
    workRoot,
    'app-data',
    'database',
  ),
  browser_profiles: path.join(
    workRoot,
    'app-data',
    'browser-profiles',
  ),
  logs: path.join(
    workRoot,
    'app-data',
    'logs',
  ),
};

const runId =
  'rr_20260818T083700000Z_a1b2c3';
const sourceId = 'google-trends';
const preferredFilename =
  'GT01_TR_24M_interest_over_time.csv';

const firstBytes = Buffer.from(
  'Week,canlı bitki\n2026-08-09,42\n',
  'utf8',
);

const retryBytes = Buffer.from(
  'Week,canlı bitki\n2026-08-09,43\n',
  'utf8',
);

const main = async () => {
  const storageA = new StorageManager(
    directories,
  );

  // STORAGE-001 — run/source directory creation.
  const layout =
    await storageA.ensureRunSourceDirectories(
      runId,
      sourceId,
    );

  for (const directory of [
    layout.run,
    layout.source,
    layout.raw,
    layout.metadata,
    layout.validation,
    layout.exports,
    layout.logs,
  ]) {
    assert.equal(
      fs.statSync(directory).isDirectory(),
      true,
    );
  }

  // STORAGE-002/003 — exact bytes + real size/hash.
  const first =
    await storageA.persistRawArtifact({
      run_id: runId,
      source_id: sourceId,
      attempt_number: 1,
      preferred_filename: preferredFilename,
      media_type: 'text/csv',
      bytes: firstBytes,
    });

  assert.equal(
    first.filename,
    preferredFilename,
  );
  assert.equal(
    first.relative_path,
    `google-trends/raw/${preferredFilename}`,
  );
  assert.equal(
    first.byte_size,
    firstBytes.length,
  );
  assert.equal(
    first.sha256,
    createHash('sha256')
      .update(firstBytes)
      .digest('hex'),
  );

  assert.deepEqual(
    await fsp.readFile(first.absolute_path),
    firstBytes,
  );

  // STORAGE-004 — same attempt/path cannot overwrite.
  await assert.rejects(
    () =>
      storageA.persistRawArtifact({
        run_id: runId,
        source_id: sourceId,
        attempt_number: 1,
        preferred_filename:
          preferredFilename,
        media_type: 'text/csv',
        bytes: Buffer.from(
          'replacement must not win',
          'utf8',
        ),
      }),
    (error) =>
      error instanceof StorageCollisionError,
  );

  assert.deepEqual(
    await fsp.readFile(first.absolute_path),
    firstBytes,
  );

  // STORAGE-005 — retry gets deterministic attempt suffix.
  const retry =
    await storageA.persistRawArtifact({
      run_id: runId,
      source_id: sourceId,
      attempt_number: 2,
      preferred_filename: preferredFilename,
      media_type: 'text/csv',
      bytes: retryBytes,
    });

  assert.equal(
    retry.filename,
    'GT01_TR_24M_interest_over_time__attempt_2.csv',
  );
  assert.equal(
    retry.relative_path,
    'google-trends/raw/GT01_TR_24M_interest_over_time__attempt_2.csv',
  );

  assert.notEqual(
    retry.absolute_path,
    first.absolute_path,
  );

  assert.deepEqual(
    await fsp.readFile(first.absolute_path),
    firstBytes,
  );
  assert.deepEqual(
    await fsp.readFile(retry.absolute_path),
    retryBytes,
  );

  // STORAGE-006/007 — traversal and unsafe path inputs fail closed.
  await assert.rejects(
    () =>
      storageA.persistRawArtifact({
        run_id: runId,
        source_id: sourceId,
        attempt_number: 3,
        preferred_filename:
          '../escape.csv',
        media_type: 'text/csv',
        bytes: Buffer.from('bad'),
      }),
    (error) =>
      error instanceof UnsafeStoragePathError,
  );

  assert.throws(
    () =>
      storageA.resolveRunRelativePath(
        runId,
        '../../outside.csv',
      ),
    (error) =>
      error instanceof UnsafeStoragePathError,
  );

  assert.throws(
    () =>
      storageA.resolveRunRelativePath(
        '../not-a-run',
        first.relative_path,
      ),
    (error) =>
      error instanceof UnsafeStoragePathError,
  );

  const resolved =
    storageA.resolveRunRelativePath(
      runId,
      first.relative_path,
    );

  assert.equal(
    resolved,
    first.absolute_path,
  );

  // STORAGE-008 — a fresh manager resolves the same persisted evidence.
  const storageB = new StorageManager(
    directories,
  );

  const reloadedPath =
    storageB.resolveRunRelativePath(
      runId,
      first.relative_path,
    );

  assert.deepEqual(
    await fsp.readFile(reloadedPath),
    firstBytes,
  );

  console.log(
    'PASS STORAGE-001: run/source filesystem directories are created',
  );
  console.log(
    'PASS STORAGE-002: raw artifact bytes are preserved exactly',
  );
  console.log(
    'PASS STORAGE-003: byte_size and SHA-256 come from persisted bytes',
  );
  console.log(
    'PASS STORAGE-004: existing raw artifact is never silently overwritten',
  );
  console.log(
    'PASS STORAGE-005: retry uses a separate attempt-suffixed path',
  );
  console.log(
    'PASS STORAGE-006: unsafe filename/path traversal fails closed',
  );
  console.log(
    'PASS STORAGE-007: artifact relative_path remains run-scoped',
  );
  console.log(
    'PASS STORAGE-008: persisted raw evidence survives manager restart',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
