const assert = require('node:assert/strict');

const {
  BLOG_WRITING_PACK_RECIPE_ID,
  BLOG_WRITING_PACK_RECIPE_VERSION,
  BLOG_WRITING_PACK_WORKBOOK_FILENAME,
  BLOG_WRITING_PACK_DATASETS,
} = require(`${process.argv[2]}/shared/blog-writing-pack.js`);

const {
  BLOG_WRITING_PACK_RECIPE,
} = require(`${process.argv[2]}/main/blog-writing-packs/blog-writing-pack-recipe.js`);

const {
  assembleBlogWritingPack,
} = require(`${process.argv[2]}/main/blog-writing-packs/blog-writing-pack-assembler.js`);

const EXPECTED_DATASETS = [
  'INTEREST_OVER_TIME',
  'QUERY_PAGE',
  'SEARCH_TERMS',
  'KEYWORD_HISTORICAL_METRICS',
  'PRODUCTS',
  'SITEMAP_URLS',
  'GOOGLE_SERP',
];

const EXPECTED_RECIPE = {
  'google-trends': 'INTEREST_OVER_TIME',
  'google-search-console-query-page': 'QUERY_PAGE',
  'google-ads-search-terms': 'SEARCH_TERMS',
  'google-keyword-planner': 'KEYWORD_HISTORICAL_METRICS',
  'google-keyword-planner-csv': 'KEYWORD_HISTORICAL_METRICS',
  'ikas-products': 'PRODUCTS',
  'bitkimark-sitemap': 'SITEMAP_URLS',
  serpapi: 'GOOGLE_SERP',
};

const run = {
  run_id: 'run_blog_1',
  workspace_id: 'ws_blog',
  run_status: 'COMPLETED_WITH_WARNINGS',
  created_at: '2026-10-01T10:00:00.000Z',
  started_at: '2026-10-01T10:01:00.000Z',
  completed_at: '2026-10-01T10:30:00.000Z',
  application_version: '1.0.0',
  selected_sources: Object.keys(EXPECTED_RECIPE),
  requested_configuration: null,
  configuration_snapshot: {},
};

let jobOrder = 0;

const job = ({
  job_id,
  source_id,
  job_key = job_id,
  execution_status = 'COMPLETED',
  validation_status = 'VALID',
  accepted_artifact_id = `artifact_${job_id}`,
  query_group_id = null,
}) => ({
  job_id,
  run_id: run.run_id,
  source_id,
  job_key,
  query_group_id,
  source_context: {},
  job_order: ++jobOrder,
  execution_status,
  validation_status,
  attempt_count: 1,
  accepted_artifact_id,
  created_at: '2026-10-01T10:00:00.000Z',
  started_at: '2026-10-01T10:01:00.000Z',
  completed_at: '2026-10-01T10:02:00.000Z',
});

const dataset = ({
  job: owner,
  dataset_type,
  rows = [{ value: owner.job_id }],
  source_id = owner.source_id,
  job_id = owner.job_id,
  job_key = owner.job_key,
}) => ({
  source_id,
  dataset_type,
  job_id,
  job_key,
  rows,
  provenance: {
    run_id: run.run_id,
    workspace_id: run.workspace_id,
    job_id,
    job_key,
    source_id,
    validation_status: owner.validation_status,
    raw_artifact_id: owner.accepted_artifact_id,
  },
});

const assemble = (jobs, datasets) => assembleBlogWritingPack({
  package_id: 'blog_pkg_1',
  created_at: '2026-10-01T12:00:00.000Z',
  application_version: '1.0.0',
  run,
  jobs,
  datasets,
});

assert.equal(BLOG_WRITING_PACK_RECIPE_ID, 'BLOG_WRITING_PACK');
assert.equal(BLOG_WRITING_PACK_RECIPE_VERSION, 1);
assert.equal(BLOG_WRITING_PACK_WORKBOOK_FILENAME, 'BLOG_WRITING_PACK.xlsx');
assert.deepEqual(BLOG_WRITING_PACK_DATASETS, EXPECTED_DATASETS);
assert.deepEqual(BLOG_WRITING_PACK_RECIPE, EXPECTED_RECIPE);
console.log('PASS BLOG-RECIPE-001: recipe identity and source-to-dataset mapping are exact');

{
  const gt = job({
    job_id: 'job_gt',
    source_id: 'google-trends',
    job_key: 'GT01',
    query_group_id: 'GT01',
  });
  const gscQuery = job({
    job_id: 'job_gsc_query',
    source_id: 'google-search-console-query',
  });
  const adsReporting = job({
    job_id: 'job_ads_reporting',
    source_id: 'google-ads-search-reporting',
  });

  const result = assemble(
    [gt, gscQuery, adsReporting],
    [
      dataset({ job: gt, dataset_type: 'INTEREST_OVER_TIME' }),
      dataset({ job: gscQuery, dataset_type: 'QUERY' }),
      dataset({ job: adsReporting, dataset_type: 'CAMPAIGN_PERFORMANCE' }),
    ],
  );

  assert.equal(result.status, 'READY');
  assert.deepEqual(
    result.assembly.data_package.datasets.map(({ source_id, dataset_type }) => ({ source_id, dataset_type })),
    [{ source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME' }],
  );
  assert.deepEqual(result.assembly.data_package.failures, []);
  assert.equal(result.assembly.manifest.coverage_status, 'PARTIAL');
  assert.deepEqual(result.assembly.manifest.present_datasets, ['INTEREST_OVER_TIME']);
  assert.equal(result.assembly.manifest.coverage_by_dataset.INTEREST_OVER_TIME.status, 'COVERED');

  assert.throws(
    () => assemble(
      [gt],
      [dataset({ job: gt, dataset_type: 'QUERY_PAGE' })],
    ),
    /dataset type|recipe|mapping/i,
  );
}
console.log('PASS BLOG-RECIPE-FILTER-001: out-of-recipe evidence is excluded and recipe mismatches fail closed');

{
  const sourceByDataset = {
    INTEREST_OVER_TIME: 'google-trends',
    QUERY_PAGE: 'google-search-console-query-page',
    SEARCH_TERMS: 'google-ads-search-terms',
    KEYWORD_HISTORICAL_METRICS: 'google-keyword-planner',
    PRODUCTS: 'ikas-products',
    SITEMAP_URLS: 'bitkimark-sitemap',
    GOOGLE_SERP: 'serpapi',
  };

  const jobs = EXPECTED_DATASETS.map((datasetType, index) => job({
    job_id: `job_complete_${index}`,
    source_id: sourceByDataset[datasetType],
    job_key: `key_complete_${index}`,
  }));
  const datasets = jobs.map((owner, index) => dataset({
    job: owner,
    dataset_type: EXPECTED_DATASETS[index],
  }));

  const result = assemble(jobs, datasets);
  assert.equal(result.status, 'READY');
  assert.equal(result.assembly.manifest.coverage_status, 'COMPLETE');
  assert.deepEqual(result.assembly.manifest.missing_datasets, []);
  assert.deepEqual(result.assembly.manifest.incomplete_datasets, []);

  for (const datasetType of EXPECTED_DATASETS) {
    assert.deepEqual(
      result.assembly.manifest.coverage_by_dataset[datasetType],
      {
        status: 'COVERED',
        total_jobs: 1,
        accepted_jobs: 1,
        no_data_jobs: 0,
        incomplete_jobs: 0,
      },
    );
  }
}
console.log('PASS BLOG-COVERAGE-COMPLETE-001: all logical families covered produces COMPLETE');

{
  const gtJobs = [
    job({ job_id: 'gt_01', source_id: 'google-trends', job_key: 'GT01', query_group_id: 'GT01' }),
    job({ job_id: 'gt_02', source_id: 'google-trends', job_key: 'GT02', query_group_id: 'GT02' }),
    job({ job_id: 'gt_03', source_id: 'google-trends', job_key: 'GT03', query_group_id: 'GT03' }),
    job({ job_id: 'gt_04', source_id: 'google-trends', job_key: 'GT04', query_group_id: 'GT04' }),
    job({
      job_id: 'gt_05',
      source_id: 'google-trends',
      job_key: 'GT05',
      query_group_id: 'GT05',
      execution_status: 'FAILED',
      validation_status: 'ERROR_NOT_DATA',
      accepted_artifact_id: null,
    }),
  ];

  const result = assemble(
    gtJobs,
    gtJobs.slice(0, 4).map((owner) => dataset({
      job: owner,
      dataset_type: 'INTEREST_OVER_TIME',
    })),
  );

  assert.equal(result.status, 'READY');
  assert.equal(result.assembly.manifest.coverage_status, 'PARTIAL');
  assert.deepEqual(
    result.assembly.manifest.coverage_by_dataset.INTEREST_OVER_TIME,
    {
      status: 'PARTIAL',
      total_jobs: 5,
      accepted_jobs: 4,
      no_data_jobs: 0,
      incomplete_jobs: 1,
    },
  );
  assert.deepEqual(result.assembly.manifest.incomplete_datasets, ['INTEREST_OVER_TIME']);
  assert.equal(result.assembly.data_package.datasets.length, 4);
}
console.log('PASS BLOG-COVERAGE-PARTIAL-001: accepted siblings survive while incomplete expected work remains explicit');

{
  const noData = job({
    job_id: 'serp_no_data',
    source_id: 'serpapi',
    validation_status: 'NO_DATA',
  });

  const result = assemble(
    [noData],
    [dataset({ job: noData, dataset_type: 'GOOGLE_SERP', rows: [] })],
  );

  assert.equal(result.status, 'READY');
  assert.deepEqual(
    result.assembly.manifest.coverage_by_dataset.GOOGLE_SERP,
    {
      status: 'COVERED',
      total_jobs: 1,
      accepted_jobs: 1,
      no_data_jobs: 1,
      incomplete_jobs: 0,
    },
  );
  assert.deepEqual(result.assembly.manifest.no_data_datasets, ['GOOGLE_SERP']);
  assert.equal(result.assembly.data_package.datasets[0].rows.length, 0);
}
console.log('PASS BLOG-NO-DATA-001: verified NO_DATA covers a family without fabricating rows');

{
  const api = job({
    job_id: 'kwp_api',
    source_id: 'google-keyword-planner',
  });
  const csv = job({
    job_id: 'kwp_csv',
    source_id: 'google-keyword-planner-csv',
  });

  const result = assemble(
    [api, csv],
    [
      dataset({ job: api, dataset_type: 'KEYWORD_HISTORICAL_METRICS' }),
      dataset({ job: csv, dataset_type: 'KEYWORD_HISTORICAL_METRICS' }),
    ],
  );

  assert.equal(result.status, 'READY');
  assert.deepEqual(
    result.assembly.data_package.datasets.map((item) => item.source_id),
    ['google-keyword-planner', 'google-keyword-planner-csv'],
  );
  assert.equal(
    result.assembly.manifest.coverage_by_dataset.KEYWORD_HISTORICAL_METRICS.status,
    'COVERED',
  );
}
console.log('PASS BLOG-KWP-DUAL-001: accepted API and CSV evidence remain distinct');

{
  const api = job({
    job_id: 'kwp_api_ok',
    source_id: 'google-keyword-planner',
  });
  const csvFailed = job({
    job_id: 'kwp_csv_failed',
    source_id: 'google-keyword-planner-csv',
    execution_status: 'FAILED',
    validation_status: 'ERROR_NOT_DATA',
    accepted_artifact_id: null,
  });

  const result = assemble(
    [api, csvFailed],
    [dataset({ job: api, dataset_type: 'KEYWORD_HISTORICAL_METRICS' })],
  );

  assert.equal(
    result.assembly.manifest.coverage_by_dataset.KEYWORD_HISTORICAL_METRICS.status,
    'COVERED',
  );
  assert.equal(
    result.assembly.manifest.coverage_by_dataset.KEYWORD_HISTORICAL_METRICS.incomplete_jobs,
    0,
  );
}
console.log('PASS BLOG-KWP-ALTERNATE-001: failed unused alternate acquisition path does not force PARTIAL');

{
  const pending = job({
    job_id: 'gt_pending',
    source_id: 'google-trends',
    job_key: 'GT-PENDING',
    query_group_id: 'GT-PENDING',
    execution_status: 'PENDING',
    validation_status: 'NOT_RUN',
    accepted_artifact_id: null,
  });

  const result = assemble([pending], []);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.coverage_by_dataset.INTEREST_OVER_TIME.status, 'MISSING');
}
console.log('PASS BLOG-NOT-READY-001: zero accepted Blog evidence produces NOT_READY');

{
  const gt = job({
    job_id: 'identity_gt',
    source_id: 'google-trends',
    job_key: 'GT-ID',
    query_group_id: 'GT-ID',
  });

  assert.throws(
    () => assemble([gt], []),
    /accepted.*dataset|matching.*dataset/i,
  );

  assert.throws(
    () => assemble(
      [gt],
      [
        dataset({ job: gt, dataset_type: 'INTEREST_OVER_TIME' }),
        dataset({ job: gt, dataset_type: 'INTEREST_OVER_TIME' }),
      ],
    ),
    /duplicate|multiple/i,
  );

  assert.throws(
    () => assemble(
      [gt],
      [dataset({
        job: gt,
        dataset_type: 'INTEREST_OVER_TIME',
        job_key: 'WRONG-KEY',
      })],
    ),
    /identity|job.key/i,
  );

  assert.throws(
    () => assemble(
      [gt],
      [dataset({
        job: gt,
        dataset_type: 'INTEREST_OVER_TIME',
        source_id: 'serpapi',
      })],
    ),
    /identity|source/i,
  );
}
console.log('PASS BLOG-IDENTITY-001: accepted evidence identity mismatches fail closed');
