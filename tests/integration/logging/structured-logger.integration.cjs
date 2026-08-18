const assert = require('node:assert/strict');
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
  StructuredLogger,
} = require(
  path.join(
    buildRoot,
    'main',
    'logging',
    'structured-logger.js',
  ),
);

const {
  OMITTED_BINARY_LOG_VALUE,
  REDACTED_LOG_VALUE,
} = require(
  path.join(
    buildRoot,
    'main',
    'logging',
    'log-redaction.js',
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
  'rr_20260818T120000000Z_abc123';

const jobId =
  `${runId}__fake-source__GT01`;

const attemptId =
  'attempt_abc123def4567890';

const fixedTimes = [
  '2026-08-18T12:00:00.000Z',
  '2026-08-18T12:00:01.000Z',
  '2026-08-18T12:00:02.000Z',
];

let clockIndex = 0;

const now = () =>
  new Date(
    fixedTimes[
      Math.min(
        clockIndex++,
        fixedTimes.length - 1,
      )
    ],
  );

const readRecords = async (
  logPath,
) => {
  const content =
    await fsp.readFile(
      logPath,
      'utf8',
    );

  return content
    .trimEnd()
    .split('\n')
    .map((line) =>
      JSON.parse(line),
    );
};

const main = async () => {
  const loggerA =
    new StructuredLogger(
      directories,
      { now },
    );

  const circular = {
    name: 'cycle',
  };
  circular.self = circular;

  await loggerA.write({
    level: 'INFO',
    event:
      'collection_attempt_started',
    run_id: runId,
    job_id: jobId,
    attempt_id: attemptId,
    context: {
      source_id: 'fake-source',
      attempt_number: 1,
      headers: {
        Authorization:
          'Bearer super-secret-token',
        Cookie:
          'SID=session-secret',
        Accept: 'text/csv',
      },
      password:
        'should-never-reach-disk',
      nested: {
        api_key:
          'another-secret',
        refresh_token:
          'refresh-secret',
      },
      raw_bytes:
        Buffer.from(
          'raw-secret-data',
          'utf8',
        ),
      message:
        'authorization: Bearer hidden-token',
      query:
        'token=hidden-value&safe=yes',
      circular,
    },
  });

  await loggerA.write({
    level: 'WARN',
    event:
      'collection_attempt_failed',
    run_id: runId,
    job_id: jobId,
    attempt_id: attemptId,
    context: {
      error_code:
        'DOWNLOAD_FAILED',
      error: new Error(
        'Cookie: SID=very-secret',
      ),
    },
  });

  const logPath =
    loggerA.getRunLogPath(
      runId,
    );

  const beforeRestart =
    await readRecords(logPath);

  assert.equal(
    beforeRestart.length,
    2,
  );

  assert.deepEqual(
    {
      timestamp:
        beforeRestart[0].timestamp,
      level:
        beforeRestart[0].level,
      event:
        beforeRestart[0].event,
      run_id:
        beforeRestart[0].run_id,
      job_id:
        beforeRestart[0].job_id,
      attempt_id:
        beforeRestart[0].attempt_id,
    },
    {
      timestamp:
        fixedTimes[0],
      level: 'INFO',
      event:
        'collection_attempt_started',
      run_id: runId,
      job_id: jobId,
      attempt_id: attemptId,
    },
  );

  assert.equal(
    beforeRestart[0]
      .context
      .password,
    REDACTED_LOG_VALUE,
  );

  assert.equal(
    beforeRestart[0]
      .context
      .headers
      .Authorization,
    REDACTED_LOG_VALUE,
  );

  assert.equal(
    beforeRestart[0]
      .context
      .headers
      .Cookie,
    REDACTED_LOG_VALUE,
  );

  assert.equal(
    beforeRestart[0]
      .context
      .headers
      .Accept,
    'text/csv',
  );

  assert.equal(
    beforeRestart[0]
      .context
      .nested
      .api_key,
    REDACTED_LOG_VALUE,
  );

  assert.equal(
    beforeRestart[0]
      .context
      .nested
      .refresh_token,
    REDACTED_LOG_VALUE,
  );

  assert.equal(
    beforeRestart[0]
      .context
      .raw_bytes,
    OMITTED_BINARY_LOG_VALUE,
  );

  assert.equal(
    beforeRestart[0]
      .context
      .message,
    'authorization: [REDACTED]',
  );

  assert.equal(
    beforeRestart[0]
      .context
      .query,
    'token=[REDACTED]&safe=yes',
  );

  assert.equal(
    beforeRestart[0]
      .context
      .circular
      .self,
    '[CIRCULAR]',
  );

  assert.equal(
    beforeRestart[1]
      .context
      .error
      .message,
    'Cookie: [REDACTED]',
  );

  const originalContent =
    await fsp.readFile(
      logPath,
      'utf8',
    );

  const loggerB =
    new StructuredLogger(
      directories,
      { now },
    );

  await loggerB.write({
    level: 'INFO',
    event:
      'collection_attempt_completed',
    run_id: runId,
    job_id: jobId,
    attempt_id: attemptId,
    context: {
      validation_status:
        'VALID',
    },
  });

  const afterRestart =
    await readRecords(logPath);

  assert.equal(
    afterRestart.length,
    3,
  );

  const appendedContent =
    await fsp.readFile(
      logPath,
      'utf8',
    );

  assert.equal(
    appendedContent.startsWith(
      originalContent,
    ),
    true,
  );

  assert.equal(
    afterRestart[2].event,
    'collection_attempt_completed',
  );

  assert.equal(
    afterRestart[2]
      .context
      .validation_status,
    'VALID',
  );

  assert.equal(
    path.relative(
      path.join(
        directories.runs,
        runId,
      ),
      logPath,
    ),
    path.join(
      'logs',
      'events.jsonl',
    ),
  );

  assert.throws(
    () =>
      loggerA.getRunLogPath(
        '../unsafe-run',
      ),
    /Invalid filesystem-safe run_id/,
  );

  console.log(
    'PASS LOG-001: JSONL events append to a run-scoped log',
  );
  console.log(
    'PASS LOG-002: every event preserves timestamp, level, and event name',
  );
  console.log(
    'PASS LOG-003: run/job/attempt context is preserved',
  );
  console.log(
    'PASS LOG-004: sensitive keys are recursively redacted',
  );
  console.log(
    'PASS LOG-005: Authorization/Cookie-like values are redacted',
  );
  console.log(
    'PASS LOG-006: raw binary values are omitted instead of stringified',
  );
  console.log(
    'PASS LOG-007: logger restart appends and never overwrites prior evidence',
  );
  console.log(
    'PASS LOG-008: log path remains inside the run-scoped logs directory',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
