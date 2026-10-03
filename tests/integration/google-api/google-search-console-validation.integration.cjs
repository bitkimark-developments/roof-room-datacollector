const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error('Expected compiled build root and work root.');
}

const load = (modulePath) => require(path.join(buildRoot, modulePath));

const {
  GoogleSearchConsoleValidator,
} = load('main/sources/google-search-console/google-search-console-validator.js');

const {
  createProductionCollectionRuntime,
} = load('main/app/production-collection-runtime.js');

const {
  GSC_QUERY_PAGE_SOURCE_ID,
  GSC_QUERY_SOURCE_ID,
} = load('shared/google-api.js');

fs.mkdirSync(workRoot, { recursive: true });

(async () => {
const validator = new GoogleSearchConsoleValidator(
  GSC_QUERY_PAGE_SOURCE_ID,
);

let artifactSequence = 0;

const createContext = (
  sourceId,
  body,
) => {
  artifactSequence += 1;

  const absolutePath = path.join(
    workRoot,
    `artifact-${artifactSequence}.json`,
  );

  fs.writeFileSync(
    absolutePath,
    JSON.stringify(body),
  );

  return {
    absolutePath,
    context: {
      run: {
        run_id: 'run-1',
        workspace_id: 'workspace-1',
      },
      job: {
        job_id: 'job-1',
        run_id: 'run-1',
        source_id: sourceId,
        source_context: {},
      },
      artifact: {
        source_id: sourceId,
        run_id: 'run-1',
      },
      absolute_path: absolutePath,
    },
  };
};

const validPageArtifact = [
  {
    rows: [
      {
        keys: [
          'ficus',
          'https://example.com',
        ],
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        position: 2,
      },
    ],
  },
];

const validQueryArtifact = [
  {
    rows: [
      {
        keys: [
          'ficus',
        ],
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        position: 2,
      },
    ],
  },
];

{
  const { context } = createContext(
    GSC_QUERY_PAGE_SOURCE_ID,
    validPageArtifact,
  );

  const result = await validator.validate(context);

  assert.equal(
    result.validation_status,
    'VALID',
  );
}

{
  const queryValidator =
    new GoogleSearchConsoleValidator(
      GSC_QUERY_SOURCE_ID,
    );

  const { context } = createContext(
    GSC_QUERY_SOURCE_ID,
    validQueryArtifact,
  );

  const result =
    await queryValidator.validate(context);

  assert.equal(
    result.validation_status,
    'VALID',
  );
}

{
  const { context } = createContext(
    GSC_QUERY_PAGE_SOURCE_ID,
    [
      {
        rows: [],
      },
    ],
  );

  const result = await validator.validate(context);

  assert.equal(
    result.validation_status,
    'NO_DATA',
  );
}

{
  const { context } = createContext(
    GSC_QUERY_PAGE_SOURCE_ID,
    {},
  );

  const result = await validator.validate(context);

  assert.equal(
    result.validation_status,
    'INVALID_SCHEMA',
  );
}

{
  const runtime =
    createProductionCollectionRuntime({
      repository: {},
      credentialStore: {},
      directories: {
        data: workRoot,
        runs: workRoot,
      },
      googleTrendsSource: {},
    });

  assert.equal(
    runtime.validator_registry
      .get(GSC_QUERY_PAGE_SOURCE_ID)
      .constructor.name,
    'GoogleSearchConsoleValidator',
  );

  assert.equal(
    runtime.validator_registry
      .get(GSC_QUERY_SOURCE_ID)
      .constructor.name,
    'GoogleSearchConsoleValidator',
  );
}

console.log(
  'PASS GOOGLE-SEARCH-CONSOLE-VALIDATION-001: dedicated validator preserves VALID, NO_DATA, fail-closed semantics, and runtime ownership',
);
})();
