const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) {
  throw new Error('Expected compiled build root and work root.');
}

const load = (modulePath) => require(path.join(buildRoot, modulePath));

const {
  GoogleAdsConfigurationValidator,
} = load('main/sources/google-ads/configuration-validator.js');

const {
  createGoogleAdsConfigurationJobContext,
} = load('main/sources/google-ads/configuration-request.js');

fs.mkdirSync(workRoot, { recursive: true });

const validator = new GoogleAdsConfigurationValidator();
let artifactSequence = 0;

const rowsByDataset = {
  CAMPAIGN_NEGATIVE_KEYWORDS: {
    campaign: {
      id: '1001',
      name: 'Search Campaign',
      advertisingChannelType: 'SEARCH',
    },
    campaignCriterion: {
      resourceName: 'customers/1234567890/campaignCriteria/1001~2001',
      criterionId: '2001',
      status: 'REMOVED',
      type: 'KEYWORD',
      negative: true,
      keyword: {
        text: 'free',
        matchType: 'BROAD',
      },
    },
  },

  AD_GROUP_NEGATIVE_KEYWORDS: {
    campaign: {
      id: '1001',
      name: 'Search Campaign',
      advertisingChannelType: 'SEARCH',
    },
    adGroup: {
      id: '3001',
      name: 'Ficus Group',
    },
    adGroupCriterion: {
      resourceName: 'customers/1234567890/adGroupCriteria/3001~4001',
      criterionId: '4001',
      status: 'ENABLED',
      type: 'KEYWORD',
      negative: true,
      keyword: {
        text: 'cheap',
        matchType: 'PHRASE',
      },
    },
  },

  SHARED_NEGATIVE_KEYWORDS: {
    sharedSet: {
      resourceName: 'customers/1234567890/sharedSets/5001',
      id: '5001',
      name: 'Shared Negatives',
      status: 'ENABLED',
      type: 'NEGATIVE_KEYWORDS',
    },
    sharedCriterion: {
      resourceName: 'customers/1234567890/sharedCriteria/5001~6001',
      criterionId: '6001',
      type: 'KEYWORD',
      negative: true,
      keyword: {
        text: 'jobs',
        matchType: 'EXACT',
      },
    },
  },

  CAMPAIGN_NEGATIVE_KEYWORD_LISTS: {
    campaign: {
      id: '1001',
      name: 'Search Campaign',
      advertisingChannelType: 'SEARCH',
    },
    campaignSharedSet: {
      resourceName: 'customers/1234567890/campaignSharedSets/1001~5001',
      status: 'ENABLED',
    },
    sharedSet: {
      resourceName: 'customers/1234567890/sharedSets/5001',
      id: '5001',
      name: 'Campaign Negative List',
      status: 'ENABLED',
      type: 'NEGATIVE_KEYWORDS',
    },
  },

  ACCOUNT_NEGATIVE_KEYWORD_LISTS: {
    customerNegativeCriterion: {
      resourceName: 'customers/1234567890/customerNegativeCriteria/7001',
      id: '7001',
      type: 'NEGATIVE_KEYWORD_LIST',
      negativeKeywordList: {
        sharedSet: 'customers/1234567890/sharedSets/8001',
      },
    },
    sharedSet: {
      resourceName: 'customers/1234567890/sharedSets/8001',
      id: '8001',
      name: 'Account Negative List',
      status: 'ENABLED',
      type: 'ACCOUNT_LEVEL_NEGATIVE_KEYWORDS',
    },
  },
};

const validationContext = (
  datasetType,
  body,
  overrides = {},
) => {
  artifactSequence += 1;

  const sourceContext =
    createGoogleAdsConfigurationJobContext({
      dataset_type: datasetType,
      customer_id: '1234567890',
    });

  const absolutePath =
    path.join(workRoot, `artifact-${artifactSequence}.json`);

  fs.writeFileSync(
    absolutePath,
    typeof body === 'string'
      ? body
      : JSON.stringify(body),
  );

  const run = {
    run_id: 'run-1',
    workspace_id: 'workspace-1',
    run_status: 'RUNNING',
    created_at: '2026-10-02T00:00:00.000Z',
    started_at: '2026-10-02T00:00:00.000Z',
    completed_at: null,
    application_version: 'test',
    selected_sources: ['google-ads-configuration'],
    requested_configuration: null,
    configuration_snapshot: {},
  };

  const job = {
    job_id: 'job-1',
    run_id: 'run-1',
    source_id: 'google-ads-configuration',
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
    attempt_id: 'attempt-1',
    job_id: 'job-1',
    attempt_number: 1,
    execution_status: 'VALIDATING',
    candidate_artifact_id: 'artifact-1',
    validation_id: null,
    error_code: null,
    started_at: run.started_at,
    completed_at: null,
  };

  const artifact = {
    artifact_id: 'artifact-1',
    run_id: 'run-1',
    job_id: 'job-1',
    attempt_number: 1,
    source_id: 'google-ads-configuration',
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

const assertNullDateMetadata = (decision, label) => {
  assert.deepEqual(
    decision.validated_metadata,
    {
      actual_date_start: null,
      actual_date_end: null,
      country_name: null,
    },
    `${label} must not fabricate date metadata.`,
  );
};

(async () => {
  /*
   * All five approved datasets must validate from canonical
   * SearchStream envelopes.
   */
  for (const [datasetType, row] of Object.entries(rowsByDataset)) {
    const decision = await validator.validate(
      validationContext(
        datasetType,
        [{ results: [row] }],
      ),
    );

    assert.equal(
      decision.validation_status,
      'VALID',
      `${datasetType} must validate.`,
    );

    assertNullDateMetadata(decision, datasetType);
  }

  /*
   * Truthful NO_DATA requires a structurally valid SearchStream
   * envelope with zero in-contract normalized rows.
   */
  const noData = await validator.validate(
    validationContext(
      'CAMPAIGN_NEGATIVE_KEYWORDS',
      [{ results: [] }, {}],
    ),
  );

  assert.equal(noData.validation_status, 'NO_DATA');
  assertNullDateMetadata(noData, 'NO_DATA');

  /*
   * Ownership/provenance mismatch must fail closed.
   */
  const ownershipBase = validationContext(
    'CAMPAIGN_NEGATIVE_KEYWORDS',
    [{
      results: [
        rowsByDataset.CAMPAIGN_NEGATIVE_KEYWORDS,
      ],
    }],
  );

  const ownershipMismatches = [
    {
      label: 'Job belongs to another Run',
      patch: {
        job: {
          ...ownershipBase.job,
          run_id: 'other-run',
        },
      },
    },
    {
      label: 'Attempt belongs to another Job',
      patch: {
        attempt: {
          ...ownershipBase.attempt,
          job_id: 'other-job',
        },
      },
    },
    {
      label: 'Artifact belongs to another Run',
      patch: {
        artifact: {
          ...ownershipBase.artifact,
          run_id: 'other-run',
        },
      },
    },
    {
      label: 'Artifact belongs to another Job',
      patch: {
        artifact: {
          ...ownershipBase.artifact,
          job_id: 'other-job',
        },
      },
    },
    {
      label: 'Artifact belongs to another Attempt',
      patch: {
        artifact: {
          ...ownershipBase.artifact,
          attempt_number: 2,
        },
      },
    },
  ];

  for (const mismatch of ownershipMismatches) {
    const decision = await validator.validate({
      ...ownershipBase,
      ...mismatch.patch,
    });

    assert.equal(
      decision.validation_status,
      'INVALID_SCHEMA',
      mismatch.label,
    );

    assert.equal(
      decision.findings[0].check_id,
      'GOOGLE_ADS_CONFIGURATION_RESPONSE',
    );
  }

  /*
   * Wrong source identity is not configuration evidence.
   */
  const wrongSourceBase = validationContext(
    'CAMPAIGN_NEGATIVE_KEYWORDS',
    [{
      results: [
        rowsByDataset.CAMPAIGN_NEGATIVE_KEYWORDS,
      ],
    }],
  );

  const wrongJobSource = await validator.validate({
    ...wrongSourceBase,
    job: {
      ...wrongSourceBase.job,
      source_id: 'google-ads-search-reporting',
    },
  });

  assert.equal(
    wrongJobSource.validation_status,
    'INVALID_SCHEMA',
  );

  const wrongArtifactSource = await validator.validate({
    ...wrongSourceBase,
    artifact: {
      ...wrongSourceBase.artifact,
      source_id: 'google-ads-search-reporting',
    },
  });

  assert.equal(
    wrongArtifactSource.validation_status,
    'INVALID_SCHEMA',
  );

  /*
   * Immutable Job/query contract mismatch.
   */
  const wrongJobKeyBase = validationContext(
    'CAMPAIGN_NEGATIVE_KEYWORDS',
    [{
      results: [
        rowsByDataset.CAMPAIGN_NEGATIVE_KEYWORDS,
      ],
    }],
  );

  const wrongJobKey = await validator.validate({
    ...wrongJobKeyBase,
    job: {
      ...wrongJobKeyBase.job,
      job_key: 'AD_GROUP_NEGATIVE_KEYWORDS',
    },
  });

  assert.equal(
    wrongJobKey.validation_status,
    'QUERY_MISMATCH',
  );

  const wrongSchemaBase = validationContext(
    'CAMPAIGN_NEGATIVE_KEYWORDS',
    [{
      results: [
        rowsByDataset.CAMPAIGN_NEGATIVE_KEYWORDS,
      ],
    }],
  );

  const wrongSchema = await validator.validate({
    ...wrongSchemaBase,
    source_context: {
      ...wrongSchemaBase.source_context,
      dataset_schema_version: 2,
    },
  });

  assert.equal(
    wrongSchema.validation_status,
    'QUERY_MISMATCH',
  );

  const wrongResourceBase = validationContext(
    'CAMPAIGN_NEGATIVE_KEYWORDS',
    [{
      results: [
        rowsByDataset.CAMPAIGN_NEGATIVE_KEYWORDS,
      ],
    }],
  );

  const wrongResource = await validator.validate({
    ...wrongResourceBase,
    source_context: {
      ...wrongResourceBase.source_context,
      resource_mode: 'AD_GROUP_CRITERION',
    },
  });

  assert.equal(
    wrongResource.validation_status,
    'QUERY_MISMATCH',
  );

  /*
   * Unreadable/non-JSON evidence is operationally not data.
   */
  const unreadableBase = validationContext(
    'CAMPAIGN_NEGATIVE_KEYWORDS',
    [{ results: [] }],
  );

  const unreadable = await validator.validate({
    ...unreadableBase,
    absolute_path:
      path.join(workRoot, 'missing-artifact.json'),
  });

  assert.equal(
    unreadable.validation_status,
    'ERROR_NOT_DATA',
  );

  const notJson = await validator.validate(
    validationContext(
      'CAMPAIGN_NEGATIVE_KEYWORDS',
      '<html>login</html>',
    ),
  );

  assert.equal(
    notJson.validation_status,
    'ERROR_NOT_DATA',
  );

  /*
   * SearchStream envelope failures are schema failures.
   */
  const malformedEnvelope = await validator.validate(
    validationContext(
      'CAMPAIGN_NEGATIVE_KEYWORDS',
      [{ results: 'not-an-array' }],
    ),
  );

  assert.equal(
    malformedEnvelope.validation_status,
    'INVALID_SCHEMA',
  );

  /*
   * Semantic mismatches must fail closed and must never become NO_DATA.
   */
  const wrongCriterion =
    structuredClone(
      rowsByDataset.CAMPAIGN_NEGATIVE_KEYWORDS,
    );

  wrongCriterion.campaignCriterion.type = 'PLACEMENT';

  const wrongCriterionDecision = await validator.validate(
    validationContext(
      'CAMPAIGN_NEGATIVE_KEYWORDS',
      [{ results: [wrongCriterion] }],
    ),
  );

  assert.equal(
    wrongCriterionDecision.validation_status,
    'QUERY_MISMATCH',
  );

  assert.notEqual(
    wrongCriterionDecision.validation_status,
    'NO_DATA',
    'Normalization failure must never become NO_DATA.',
  );

  const falseNegative =
    structuredClone(
      rowsByDataset.AD_GROUP_NEGATIVE_KEYWORDS,
    );

  falseNegative.adGroupCriterion.negative = false;

  const falseNegativeDecision = await validator.validate(
    validationContext(
      'AD_GROUP_NEGATIVE_KEYWORDS',
      [{ results: [falseNegative] }],
    ),
  );

  assert.equal(
    falseNegativeDecision.validation_status,
    'QUERY_MISMATCH',
  );

  const unsupportedSharedSet =
    structuredClone(
      rowsByDataset.SHARED_NEGATIVE_KEYWORDS,
    );

  unsupportedSharedSet.sharedSet.type =
    'PLACEMENT_EXCLUSION_LIST';

  const unsupportedSharedSetDecision =
    await validator.validate(
      validationContext(
        'SHARED_NEGATIVE_KEYWORDS',
        [{ results: [unsupportedSharedSet] }],
      ),
    );

  assert.equal(
    unsupportedSharedSetDecision.validation_status,
    'QUERY_MISMATCH',
  );

  const accountLevelCampaignList =
    structuredClone(
      rowsByDataset.CAMPAIGN_NEGATIVE_KEYWORD_LISTS,
    );

  accountLevelCampaignList.sharedSet.type =
    'ACCOUNT_LEVEL_NEGATIVE_KEYWORDS';

  const accountLevelCampaignListDecision =
    await validator.validate(
      validationContext(
        'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
        [{ results: [accountLevelCampaignList] }],
      ),
    );

  assert.equal(
    accountLevelCampaignListDecision.validation_status,
    'QUERY_MISMATCH',
  );

  const nonSearchCampaign =
    structuredClone(
      rowsByDataset.CAMPAIGN_NEGATIVE_KEYWORDS,
    );

  nonSearchCampaign.campaign.advertisingChannelType =
    'DISPLAY';

  const nonSearchDecision = await validator.validate(
    validationContext(
      'CAMPAIGN_NEGATIVE_KEYWORDS',
      [{ results: [nonSearchCampaign] }],
    ),
  );

  assert.equal(
    nonSearchDecision.validation_status,
    'QUERY_MISMATCH',
  );

  /*
   * Missing required provider identity is semantic/schema-invalid
   * evidence, never zero-row evidence.
   */
  const missingIdentity =
    structuredClone(
      rowsByDataset.ACCOUNT_NEGATIVE_KEYWORD_LISTS,
    );

  delete missingIdentity.customerNegativeCriterion.id;

  const missingIdentityDecision =
    await validator.validate(
      validationContext(
        'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
        [{ results: [missingIdentity] }],
      ),
    );

  assert.equal(
    missingIdentityDecision.validation_status,
    'QUERY_MISMATCH',
  );

  assert.notEqual(
    missingIdentityDecision.validation_status,
    'NO_DATA',
  );

  console.log(
    'PASS GOOGLE-ADS-CONFIGURATION-VALIDATION-001: five configuration datasets validate canonical raw SearchStream evidence, fail closed on ownership/context/schema/semantic mismatch, and emit truthful NO_DATA without fabricated dates',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
