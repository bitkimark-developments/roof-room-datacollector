const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) {
  throw new Error('Expected compiled build root and work root.');
}

const validatorModulePath = path.join(
  buildRoot,
  'main',
  'sources',
  'google-analytics-4',
  'google-analytics-4-validator.js',
);

assert.ok(
  fs.existsSync(validatorModulePath),
  'GA4 validator module must exist',
);

const {
  GoogleAnalytics4Validator,
} = require(validatorModulePath);

const validator = new GoogleAnalytics4Validator();

fs.mkdirSync(workRoot, { recursive: true });

const CONTENT_DIMENSIONS = [
  { name: 'landingPage' },
];

const CONTENT_METRICS = [
  { name: 'activeUsers', type: 'TYPE_INTEGER' },
  { name: 'sessions', type: 'TYPE_INTEGER' },
  { name: 'engagedSessions', type: 'TYPE_INTEGER' },
  { name: 'engagementRate', type: 'TYPE_FLOAT' },
  { name: 'keyEvents', type: 'TYPE_FLOAT' },
  { name: 'itemViewEvents', type: 'TYPE_INTEGER' },
  { name: 'addToCarts', type: 'TYPE_INTEGER' },
  { name: 'checkouts', type: 'TYPE_INTEGER' },
  { name: 'ecommercePurchases', type: 'TYPE_INTEGER' },
  { name: 'transactions', type: 'TYPE_INTEGER' },
  { name: 'purchaseRevenue', type: 'TYPE_CURRENCY' },
];

const PAID_DIMENSIONS = [
  { name: 'date' },
  { name: 'sessionSource' },
  { name: 'sessionMedium' },
  { name: 'sessionCampaignId' },
  { name: 'sessionCampaignName' },
  { name: 'landingPage' },
  { name: 'deviceCategory' },
];

const PAID_METRICS = [
  { name: 'sessions', type: 'TYPE_INTEGER' },
  { name: 'engagedSessions', type: 'TYPE_INTEGER' },
  { name: 'itemViewEvents', type: 'TYPE_INTEGER' },
  { name: 'addToCarts', type: 'TYPE_INTEGER' },
  { name: 'checkouts', type: 'TYPE_INTEGER' },
  { name: 'ecommercePurchases', type: 'TYPE_INTEGER' },
  { name: 'transactions', type: 'TYPE_INTEGER' },
  { name: 'totalPurchasers', type: 'TYPE_INTEGER' },
  { name: 'purchaseRevenue', type: 'TYPE_CURRENCY' },
];

const contentRow = (metricValues = [
  '1', '2', '1', '0.5', '0', '1', '0', '0', '0', '0', '0',
]) => ({
  dimensionValues: [{ value: '/example' }],
  metricValues: metricValues.map((value) => ({ value })),
});

const paidRow = ({
  date = '20261003',
  source = 'google',
  medium = 'cpc',
} = {}) => ({
  dimensionValues: [
    { value: date },
    { value: source },
    { value: medium },
    { value: '(not set)' },
    { value: '(not set)' },
    { value: '/example' },
    { value: 'mobile' },
  ],
  metricValues: [
    { value: '10' },
    { value: '7' },
    { value: '5' },
    { value: '3' },
    { value: '2' },
    { value: '1' },
    { value: '1' },
    { value: '1' },
    { value: '99.95' },
  ],
});

const providerPage = ({
  datasetType,
  rows,
  rowCount = rows.length,
  dimensions,
  metrics,
  metadata = {
    currencyCode: 'TRY',
    timeZone: 'Europe/Istanbul',
  },
}) => ({
  dimensionHeaders:
    dimensions
    ?? (datasetType === 'GA4_CONTENT_PERFORMANCE'
      ? CONTENT_DIMENSIONS
      : PAID_DIMENSIONS),
  metricHeaders:
    metrics
    ?? (datasetType === 'GA4_CONTENT_PERFORMANCE'
      ? CONTENT_METRICS
      : PAID_METRICS),
  rows,
  rowCount,
  metadata,
});

const bundle = ({
  datasetType,
  pages,
  propertyId = '123456789',
  startDate = '2026-10-01',
  endDate = '2026-10-07',
}) => ({
  bundle_schema_version: 1,
  dataset_type: datasetType,
  request: {
    property_id: propertyId,
    start_date: startDate,
    end_date: endDate,
    limit: 250000,
  },
  pages: pages.map(({ offset, body }) => ({
    offset,
    raw_body_text:
      typeof body === 'string'
        ? body
        : JSON.stringify(body),
  })),
});

let artifactSequence = 0;

const validationContext = ({
  datasetType,
  artifactBody,
  startDate = '2026-10-01',
  endDate = '2026-10-07',
  includeSessionFilter =
    datasetType === 'GA4_PAID_FUNNEL',
  sessionFilter = {
    session_source: 'google',
    session_medium: 'cpc',
  },
  overrides = {},
}) => {
  artifactSequence += 1;

  const absolutePath = path.join(
    workRoot,
    `ga4-artifact-${artifactSequence}.json`,
  );

  fs.writeFileSync(
    absolutePath,
    typeof artifactBody === 'string'
      ? artifactBody
      : JSON.stringify(artifactBody),
  );

  const sourceContext = {
    dataset_type: datasetType,
    start_date: startDate,
    end_date: endDate,
    ...(includeSessionFilter
      ? { session_filter: sessionFilter }
      : {}),
  };

  const run = {
    run_id: 'run-ga4',
    workspace_id: 'workspace-ga4',
    run_status: 'RUNNING',
    created_at: '2026-10-08T00:00:00.000Z',
    started_at: '2026-10-08T00:00:00.000Z',
    completed_at: null,
    application_version: 'test',
    selected_sources: ['google-analytics-4'],
    requested_configuration: null,
    configuration_snapshot: {},
  };

  const job = {
    job_id: 'job-ga4',
    run_id: run.run_id,
    source_id: 'google-analytics-4',
    job_key: datasetType,
    query_group_id: null,
    source_context: sourceContext,
    job_order: 1,
    execution_status: 'VALIDATING',
    validation_status: 'NOT_RUN',
    attempt_count: 1,
    accepted_artifact_id: null,
    created_at: run.created_at,
    started_at: run.started_at,
    completed_at: null,
  };

  const attempt = {
    attempt_id: 'attempt-ga4',
    job_id: job.job_id,
    attempt_number: 1,
    execution_status: 'VALIDATING',
    candidate_artifact_id: `artifact-${artifactSequence}`,
    validation_id: null,
    error_code: null,
    started_at: run.started_at,
    completed_at: null,
  };

  const artifact = {
    artifact_id: `artifact-${artifactSequence}`,
    run_id: run.run_id,
    job_id: job.job_id,
    attempt_number: 1,
    source_id: 'google-analytics-4',
    artifact_kind: 'RAW_SOURCE_FILE',
    artifact_state: 'CANDIDATE',
    filename: path.basename(absolutePath),
    relative_path: path.basename(absolutePath),
    media_type: 'application/json',
    byte_size: fs.statSync(absolutePath).size,
    sha256: null,
    created_at: run.created_at,
  };

  return {
    run,
    job,
    attempt,
    artifact,
    source_context: sourceContext,
    absolute_path: absolutePath,
    ...overrides,
  };
};

const decisionFor = async (
  datasetType,
  artifactBody,
  options = {},
) => validator.validate(validationContext({
  datasetType,
  artifactBody,
  ...options,
}));

(async () => {
  const contentValidBundle = bundle({
    datasetType: 'GA4_CONTENT_PERFORMANCE',
    pages: [{
      offset: 0,
      body: providerPage({
        datasetType: 'GA4_CONTENT_PERFORMANCE',
        rows: [contentRow()],
      }),
    }],
  });

  const contentValid = await decisionFor(
    'GA4_CONTENT_PERFORMANCE',
    contentValidBundle,
  );

  assert.equal(contentValid.validation_status, 'VALID');
  assert.deepEqual(contentValid.validated_metadata, {
    actual_date_start: null,
    actual_date_end: null,
    country_name: null,
  });

  const paidValidBundle = bundle({
    datasetType: 'GA4_PAID_FUNNEL',
    pages: [{
      offset: 0,
      body: providerPage({
        datasetType: 'GA4_PAID_FUNNEL',
        rows: [paidRow()],
      }),
    }],
  });

  const paidValid = await decisionFor(
    'GA4_PAID_FUNNEL',
    paidValidBundle,
  );

  assert.equal(paidValid.validation_status, 'VALID');
  assert.deepEqual(paidValid.validated_metadata, {
    actual_date_start: '2026-10-03',
    actual_date_end: '2026-10-03',
    country_name: null,
  });

  const missingPaidFilter = await decisionFor(
    'GA4_PAID_FUNNEL',
    paidValidBundle,
    {
      includeSessionFilter: false,
    },
  );

  assert.equal(
    missingPaidFilter.validation_status,
    'QUERY_MISMATCH',
    'Paid Funnel validation must reject missing locked session filter context',
  );

  const wrongPaidFilter = await decisionFor(
    'GA4_PAID_FUNNEL',
    paidValidBundle,
    {
      sessionFilter: {
        session_source: 'bing',
        session_medium: 'cpc',
      },
    },
  );

  assert.equal(
    wrongPaidFilter.validation_status,
    'QUERY_MISMATCH',
    'Paid Funnel validation must reject changed session filter semantics',
  );

  const contentWithPaidFilter = await decisionFor(
    'GA4_CONTENT_PERFORMANCE',
    contentValidBundle,
    {
      includeSessionFilter: true,
    },
  );

  assert.equal(
    contentWithPaidFilter.validation_status,
    'QUERY_MISMATCH',
    'Content Performance must reject Paid Funnel-only filter context',
  );

  const noDataBundle = bundle({
    datasetType: 'GA4_CONTENT_PERFORMANCE',
    pages: [{
      offset: 0,
      body: providerPage({
        datasetType: 'GA4_CONTENT_PERFORMANCE',
        rows: [],
        rowCount: 0,
      }),
    }],
  });

  const noData = await decisionFor(
    'GA4_CONTENT_PERFORMANCE',
    noDataBundle,
  );

  assert.equal(
    noData.validation_status,
    'NO_DATA',
    'only canonical rowCount=0 evidence may become NO_DATA',
  );

  const allZeroBundle = bundle({
    datasetType: 'GA4_CONTENT_PERFORMANCE',
    pages: [{
      offset: 0,
      body: providerPage({
        datasetType: 'GA4_CONTENT_PERFORMANCE',
        rows: [contentRow([
          '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
        ])],
      }),
    }],
  });

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        allZeroBundle,
      )
    ).validation_status,
    'VALID',
    'all-zero provider rows are data and must never become NO_DATA',
  );

  const wrongSourceBase = validationContext({
    datasetType: 'GA4_CONTENT_PERFORMANCE',
    artifactBody: contentValidBundle,
  });

  const wrongSource = await validator.validate({
    ...wrongSourceBase,
    job: {
      ...wrongSourceBase.job,
      source_id: 'other-source',
    },
  });

  assert.equal(wrongSource.validation_status, 'INVALID_SCHEMA');

  const wrongJobKeyBase = validationContext({
    datasetType: 'GA4_CONTENT_PERFORMANCE',
    artifactBody: contentValidBundle,
  });

  const wrongJobKey = await validator.validate({
    ...wrongJobKeyBase,
    job: {
      ...wrongJobKeyBase.job,
      job_key: 'GA4_PAID_FUNNEL',
    },
  });

  assert.equal(wrongJobKey.validation_status, 'QUERY_MISMATCH');

  const wrongBundleDataset = structuredClone(contentValidBundle);
  wrongBundleDataset.dataset_type = 'GA4_PAID_FUNNEL';

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        wrongBundleDataset,
      )
    ).validation_status,
    'QUERY_MISMATCH',
  );

  const wrongDates = structuredClone(contentValidBundle);
  wrongDates.request.start_date = '2026-09-01';

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        wrongDates,
      )
    ).validation_status,
    'QUERY_MISMATCH',
  );

  const invalidProperty = structuredClone(contentValidBundle);
  invalidProperty.request.property_id = 'properties/123456789';

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        invalidProperty,
      )
    ).validation_status,
    'QUERY_MISMATCH',
    'raw GA4 request property context must remain canonical digits-only',
  );

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        '<html>login</html>',
      )
    ).validation_status,
    'ERROR_NOT_DATA',
    'artifact that is not JSON data must remain ERROR_NOT_DATA',
  );

  const malformedPageJson = bundle({
    datasetType: 'GA4_CONTENT_PERFORMANCE',
    pages: [{
      offset: 0,
      body: '<html>provider-page</html>',
    }],
  });

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        malformedPageJson,
      )
    ).validation_status,
    'INVALID_SCHEMA',
  );

  const reorderedHeaders = structuredClone(contentValidBundle);
  {
    const body = JSON.parse(reorderedHeaders.pages[0].raw_body_text);
    [
      body.metricHeaders[0],
      body.metricHeaders[1],
    ] = [
      body.metricHeaders[1],
      body.metricHeaders[0],
    ];
    reorderedHeaders.pages[0].raw_body_text = JSON.stringify(body);
  }

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        reorderedHeaders,
      )
    ).validation_status,
    'INVALID_SCHEMA',
    'reordered provider headers must fail closed',
  );

  const missingHeader = structuredClone(contentValidBundle);
  {
    const body = JSON.parse(missingHeader.pages[0].raw_body_text);
    body.metricHeaders.pop();
    missingHeader.pages[0].raw_body_text = JSON.stringify(body);
  }

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        missingHeader,
      )
    ).validation_status,
    'INVALID_SCHEMA',
  );

  const extraHeader = structuredClone(contentValidBundle);
  {
    const body = JSON.parse(extraHeader.pages[0].raw_body_text);
    body.metricHeaders.push({
      name: 'unexpectedMetric',
      type: 'TYPE_INTEGER',
    });
    extraHeader.pages[0].raw_body_text = JSON.stringify(body);
  }

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        extraHeader,
      )
    ).validation_status,
    'INVALID_SCHEMA',
  );

  const rowWidthMismatch = structuredClone(contentValidBundle);
  {
    const body = JSON.parse(rowWidthMismatch.pages[0].raw_body_text);
    body.rows[0].metricValues.pop();
    rowWidthMismatch.pages[0].raw_body_text = JSON.stringify(body);
  }

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        rowWidthMismatch,
      )
    ).validation_status,
    'INVALID_SCHEMA',
  );

  const incompletePagination = bundle({
    datasetType: 'GA4_CONTENT_PERFORMANCE',
    pages: [{
      offset: 0,
      body: providerPage({
        datasetType: 'GA4_CONTENT_PERFORMANCE',
        rows: [contentRow()],
        rowCount: 250001,
      }),
    }],
  });

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        incompletePagination,
      )
    ).validation_status,
    'INVALID_SCHEMA',
    'interrupted pagination must never be accepted',
  );

  const offsetGap = bundle({
    datasetType: 'GA4_CONTENT_PERFORMANCE',
    pages: [
      {
        offset: 0,
        body: providerPage({
          datasetType: 'GA4_CONTENT_PERFORMANCE',
          rows: [contentRow()],
          rowCount: 250001,
        }),
      },
      {
        offset: 500000,
        body: providerPage({
          datasetType: 'GA4_CONTENT_PERFORMANCE',
          rows: [contentRow()],
          rowCount: 250001,
        }),
      },
    ],
  });

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        offsetGap,
      )
    ).validation_status,
    'INVALID_SCHEMA',
  );

  const invalidNumeric = structuredClone(contentValidBundle);
  {
    const body = JSON.parse(invalidNumeric.pages[0].raw_body_text);
    body.rows[0].metricValues[0].value = 'not-a-number';
    invalidNumeric.pages[0].raw_body_text = JSON.stringify(body);
  }

  assert.equal(
    (
      await decisionFor(
        'GA4_CONTENT_PERFORMANCE',
        invalidNumeric,
      )
    ).validation_status,
    'INVALID_SCHEMA',
  );

  const invalidDateBundle = bundle({
    datasetType: 'GA4_PAID_FUNNEL',
    pages: [{
      offset: 0,
      body: providerPage({
        datasetType: 'GA4_PAID_FUNNEL',
        rows: [paidRow({ date: '20260230' })],
      }),
    }],
  });

  assert.equal(
    (
      await decisionFor(
        'GA4_PAID_FUNNEL',
        invalidDateBundle,
      )
    ).validation_status,
    'INVALID_SCHEMA',
  );

  const wrongPaidFilterEvidence = bundle({
    datasetType: 'GA4_PAID_FUNNEL',
    pages: [{
      offset: 0,
      body: providerPage({
        datasetType: 'GA4_PAID_FUNNEL',
        rows: [paidRow({
          source: 'bing',
          medium: 'cpc',
        })],
      }),
    }],
  });

  assert.equal(
    (
      await decisionFor(
        'GA4_PAID_FUNNEL',
        wrongPaidFilterEvidence,
      )
    ).validation_status,
    'QUERY_MISMATCH',
    'paid-funnel rows must match the locked google / cpc request semantics',
  );

  console.log(
    'PASS GA4-VALIDATION-001: ownership, request context, exact schema, pagination, typed rows, and truthful NO_DATA semantics fail closed',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
