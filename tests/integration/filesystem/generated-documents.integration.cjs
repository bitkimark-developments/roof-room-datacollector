const assert = require('node:assert/strict');
const {
  createHash,
} = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');

const [buildRoot, workRoot] =
  process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error(
    'Expected compiled build root and temporary work root.',
  );
}

const {
  StorageCollisionError,
  StorageManager,
} = require(
  path.join(
    buildRoot,
    'main',
    'storage',
    'storage-manager.js',
  ),
);

const appDataRoot = path.join(
  workRoot,
  'app-data',
);

const directories = {
  app_data_root: appDataRoot,
  config: path.join(
    appDataRoot,
    'config',
  ),
  data: path.join(
    appDataRoot,
    'data',
  ),
  runs: path.join(
    appDataRoot,
    'data',
    'runs',
  ),
  database: path.join(
    appDataRoot,
    'database',
  ),
  browser_profiles: path.join(
    appDataRoot,
    'browser-profiles',
  ),
  logs: path.join(
    appDataRoot,
    'logs',
  ),
};

const runId =
  'rr_20260818T110000000Z_c0ffee';

const metadataDocument = {
  schema_version: 1,
  run_id: runId,
  job_id:
    `${runId}__fake-source__GT04`,
  attempt_number: 1,
  raw_artifact_id:
    'artifact_test_raw',
  validation_status: 'VALID',
};

const validationDocument = {
  schema_version: 1,
  validation_id:
    'validation_test',
  run_id: runId,
  job_id:
    `${runId}__fake-source__GT04`,
  artifact_id:
    'artifact_test_raw',
  validation_status: 'VALID',
  validated_at:
    '2026-08-18T11:00:01.000Z',
  checks_total: 1,
  checks_passed: 1,
  checks_warning: 0,
  checks_failed: 0,
  findings: [],
};

const main = async () => {
  const storage =
    new StorageManager(directories);

  const metadata =
    await storage.persistMetadataJson({
      run_id: runId,
      source_id: 'fake-source',
      attempt_number: 1,
      document_key: 'GT04',
      document: metadataDocument,
    });

  assert.equal(
    metadata.filename,
    'GT04.metadata.json',
  );
  assert.equal(
    metadata.relative_path,
    'fake-source/metadata/GT04.metadata.json',
  );
  assert.deepEqual(
    JSON.parse(
      await fsp.readFile(
        metadata.absolute_path,
        'utf8',
      ),
    ),
    metadataDocument,
  );

  const validation =
    await storage.persistValidationJson({
      run_id: runId,
      source_id: 'fake-source',
      attempt_number: 1,
      document_key: 'GT04',
      document: validationDocument,
    });

  assert.equal(
    validation.filename,
    'GT04.validation.json',
  );
  assert.equal(
    validation.relative_path,
    'fake-source/validation/GT04.validation.json',
  );
  assert.deepEqual(
    JSON.parse(
      await fsp.readFile(
        validation.absolute_path,
        'utf8',
      ),
    ),
    validationDocument,
  );

  const metadataBytes =
    await fsp.readFile(
      metadata.absolute_path,
    );

  assert.equal(
    metadata.byte_size,
    metadataBytes.length,
  );
  assert.equal(
    metadata.sha256,
    createHash('sha256')
      .update(metadataBytes)
      .digest('hex'),
  );

  const retryMetadata =
    await storage.persistMetadataJson({
      run_id: runId,
      source_id: 'fake-source',
      attempt_number: 2,
      document_key: 'GT04',
      document: {
        ...metadataDocument,
        attempt_number: 2,
      },
    });

  assert.equal(
    retryMetadata.filename,
    'GT04.attempt_2.metadata.json',
  );

  const retryValidation =
    await storage.persistValidationJson({
      run_id: runId,
      source_id: 'fake-source',
      attempt_number: 2,
      document_key: 'GT04',
      document: {
        ...validationDocument,
        validation_id:
          'validation_test_attempt_2',
      },
    });

  assert.equal(
    retryValidation.filename,
    'GT04.attempt_2.validation.json',
  );

  await assert.rejects(
    () =>
      storage.persistMetadataJson({
        run_id: runId,
        source_id: 'fake-source',
        attempt_number: 1,
        document_key: 'GT04',
        document: {
          replaced: true,
        },
      }),
    (error) =>
      error instanceof
        StorageCollisionError,
  );

  assert.deepEqual(
    JSON.parse(
      await fsp.readFile(
        metadata.absolute_path,
        'utf8',
      ),
    ),
    metadataDocument,
  );

  console.log(
    'PASS STORAGE-005: metadata JSON remains linked to its run/job/raw artifact',
  );
  console.log(
    'PASS STORAGE-006: validation JSON remains linked to its candidate artifact',
  );
  console.log(
    'PASS STORAGE-007: generated JSON documents use attempt-specific filenames on retry',
  );
  console.log(
    'PASS STORAGE-008: generated JSON documents are immutable and collision-protected',
  );
  console.log(
    'PASS STORAGE-009: generated JSON byte_size and SHA-256 are derived from persisted bytes',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
