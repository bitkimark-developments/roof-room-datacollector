import { readFile } from 'node:fs/promises';
import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
  ValidatedDatasetMetadata,
} from '../../../shared/collection';
import {
  GA4_DATASET_TYPES,
  GA4_PAID_FUNNEL_SESSION_FILTER,
  GOOGLE_ANALYTICS_4_SOURCE_ID,
  type GoogleAnalytics4DatasetType,
  type GoogleAnalytics4RawBundle,
  type GoogleAnalytics4RequestContext,
} from '../../../shared/google-analytics-4';
import {
  normalizeGoogleAnalytics4Rows,
} from './google-analytics-4-parser';

type FailureStatus =
  | 'INVALID_SCHEMA'
  | 'ERROR_NOT_DATA'
  | 'QUERY_MISMATCH';

const PAGE_LIMIT = 250_000;

const CONTENT_DIMENSIONS = [
  { name: 'landingPage' },
] as const;

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
] as const;

const PAID_DIMENSIONS = [
  { name: 'date' },
  { name: 'sessionSource' },
  { name: 'sessionMedium' },
  { name: 'sessionCampaignId' },
  { name: 'sessionCampaignName' },
  { name: 'landingPage' },
  { name: 'deviceCategory' },
] as const;

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
] as const;

const failure = (
  status: FailureStatus,
  message: string,
): CollectionValidationDecision => ({
  validation_status: status,
  checks_total: 1,
  checks_passed: 0,
  checks_warning: 0,
  checks_failed: 1,
  findings: [{
    check_id: 'GOOGLE_ANALYTICS_4_RESPONSE',
    severity: 'ERROR',
    passed: false,
    message,
    expected:
      'Canonical Google Analytics 4 evidence matching the immutable Job',
    actual:
      'Artifact did not satisfy the Google Analytics 4 contract',
  }],
});

const validatedMetadata = (
  actualDateStart: string | null = null,
  actualDateEnd: string | null = null,
): ValidatedDatasetMetadata => ({
  actual_date_start: actualDateStart,
  actual_date_end: actualDateEnd,
  country_name: null,
});

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
);

const isDatasetType = (
  value: unknown,
): value is GoogleAnalytics4DatasetType => (
  typeof value === 'string'
  && (GA4_DATASET_TYPES as readonly string[]).includes(value)
);

const requireIsoDate = (
  value: unknown,
  context: string,
): string => {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
  ) {
    throw new Error(`${context} must be an absolute calendar date.`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`${context} must be a valid calendar date.`);
  }

  return value;
};

const requireJobContext = (
  value: unknown,
): GoogleAnalytics4RequestContext => {
  if (!isRecord(value)) {
    throw new Error('GA4 source_context is required.');
  }

  if (!isDatasetType(value.dataset_type)) {
    throw new Error(
      'GA4 source_context dataset type is unsupported.',
    );
  }

  const datasetType = value.dataset_type;

  const allowedKeys = new Set(
    datasetType === 'GA4_PAID_FUNNEL'
      ? [
          'dataset_type',
          'start_date',
          'end_date',
          'session_filter',
        ]
      : [
          'dataset_type',
          'start_date',
          'end_date',
        ],
  );

  if (
    Object.keys(value).some(
      (key) => !allowedKeys.has(key),
    )
  ) {
    throw new Error(
      'GA4 source_context contains unsupported fields.',
    );
  }

  const startDate = requireIsoDate(
    value.start_date,
    'GA4 source_context start_date',
  );
  const endDate = requireIsoDate(
    value.end_date,
    'GA4 source_context end_date',
  );

  if (startDate > endDate) {
    throw new Error(
      'GA4 source_context date range is reversed.',
    );
  }

  if (datasetType === 'GA4_PAID_FUNNEL') {
    const sessionFilter = value.session_filter;

    if (
      !isRecord(sessionFilter)
      || Object.keys(sessionFilter).length !== 2
      || sessionFilter.session_source
        !== GA4_PAID_FUNNEL_SESSION_FILTER.session_source
      || sessionFilter.session_medium
        !== GA4_PAID_FUNNEL_SESSION_FILTER.session_medium
    ) {
      throw new Error(
        'GA4 Paid Funnel source_context must preserve the locked google / cpc session filter.',
      );
    }

    return {
      dataset_type: datasetType,
      start_date: startDate,
      end_date: endDate,
      session_filter:
        GA4_PAID_FUNNEL_SESSION_FILTER,
    };
  }

  return {
    dataset_type: datasetType,
    start_date: startDate,
    end_date: endDate,
  };
};

const expectedHeaders = (
  datasetType: GoogleAnalytics4DatasetType,
) => (
  datasetType === 'GA4_CONTENT_PERFORMANCE'
    ? {
        dimensions: CONTENT_DIMENSIONS,
        metrics: CONTENT_METRICS,
      }
    : {
        dimensions: PAID_DIMENSIONS,
        metrics: PAID_METRICS,
      }
);

const requireExactHeaders = (
  body: Record<string, unknown>,
  datasetType: GoogleAnalytics4DatasetType,
): void => {
  const expected = expectedHeaders(datasetType);

  if (!Array.isArray(body.dimensionHeaders)) {
    throw new Error(
      'GA4 dimensionHeaders must be an array.',
    );
  }

  if (!Array.isArray(body.metricHeaders)) {
    throw new Error(
      'GA4 metricHeaders must be an array.',
    );
  }

  const dimensionHeaders = body.dimensionHeaders;
  const metricHeaders = body.metricHeaders;

  if (
    dimensionHeaders.length
      !== expected.dimensions.length
  ) {
    throw new Error(
      'GA4 dimension header count does not match the dataset.',
    );
  }

  if (
    metricHeaders.length
      !== expected.metrics.length
  ) {
    throw new Error(
      'GA4 metric header count does not match the dataset.',
    );
  }

  expected.dimensions.forEach((expectedHeader, index) => {
    const actual = dimensionHeaders[index];

    if (
      !isRecord(actual)
      || actual.name !== expectedHeader.name
    ) {
      throw new Error(
        'GA4 dimension headers do not match the exact dataset contract.',
      );
    }
  });

  expected.metrics.forEach((expectedHeader, index) => {
    const actual = metricHeaders[index];

    if (
      !isRecord(actual)
      || actual.name !== expectedHeader.name
      || actual.type !== expectedHeader.type
    ) {
      throw new Error(
        'GA4 metric headers do not match the exact dataset contract.',
      );
    }
  });
};

const requirePageRows = (
  body: Record<string, unknown>,
  datasetType: GoogleAnalytics4DatasetType,
  rowCount: number,
): unknown[] => {
  const expected = expectedHeaders(datasetType);

  if (body.rows === undefined && rowCount === 0) {
    return [];
  }

  if (!Array.isArray(body.rows)) {
    throw new Error('GA4 rows must be an array.');
  }

  for (
    let index = 0;
    index < body.rows.length;
    index += 1
  ) {
    const row = body.rows[index];

    if (!isRecord(row)) {
      throw new Error(
        `GA4 rows[${index}] must be an object.`,
      );
    }

    if (
      !Array.isArray(row.dimensionValues)
      || row.dimensionValues.length
        !== expected.dimensions.length
    ) {
      throw new Error(
        `GA4 rows[${index}] dimension width does not match headers.`,
      );
    }

    if (
      !Array.isArray(row.metricValues)
      || row.metricValues.length
        !== expected.metrics.length
    ) {
      throw new Error(
        `GA4 rows[${index}] metric width does not match headers.`,
      );
    }
  }

  return body.rows;
};

const requireRawBundle = (
  value: unknown,
  jobContext: {
    dataset_type: GoogleAnalytics4DatasetType;
    start_date: string;
    end_date: string;
  },
): {
  bundle: GoogleAnalytics4RawBundle;
  row_count: number;
} => {
  if (!isRecord(value)) {
    throw new Error(
      'GA4 artifact must contain a raw evidence bundle.',
    );
  }

  if (value.bundle_schema_version !== 1) {
    throw new Error(
      'GA4 raw bundle schema version is unsupported.',
    );
  }

  if (!isDatasetType(value.dataset_type)) {
    throw new Error(
      'GA4 raw bundle dataset type is unsupported.',
    );
  }

  if (value.dataset_type !== jobContext.dataset_type) {
    throw new Error(
      'GA4 raw bundle dataset does not match the immutable Job.',
    );
  }

  if (!isRecord(value.request)) {
    throw new Error(
      'GA4 raw bundle request context is required.',
    );
  }

  if (
    typeof value.request.property_id !== 'string'
    || !/^\d+$/u.test(value.request.property_id)
  ) {
    throw new Error(
      'GA4 raw bundle property ID must contain digits only.',
    );
  }

  if (
    value.request.start_date !== jobContext.start_date
    || value.request.end_date !== jobContext.end_date
  ) {
    throw new Error(
      'GA4 raw bundle dates do not match the immutable Job.',
    );
  }

  if (value.request.limit !== PAGE_LIMIT) {
    throw new Error(
      'GA4 raw bundle page limit is invalid.',
    );
  }

  if (!Array.isArray(value.pages) || value.pages.length === 0) {
    throw new Error(
      'GA4 raw bundle must preserve at least one provider page.',
    );
  }

  let observedRowCount: number | null = null;

  for (
    let pageIndex = 0;
    pageIndex < value.pages.length;
    pageIndex += 1
  ) {
    const page = value.pages[pageIndex];

    if (!isRecord(page)) {
      throw new Error(
        `GA4 raw bundle page ${pageIndex} is invalid.`,
      );
    }

    const expectedOffset = pageIndex * PAGE_LIMIT;

    if (page.offset !== expectedOffset) {
      throw new Error(
        'GA4 raw bundle pagination contains a gap, overlap, or duplicate page.',
      );
    }

    if (typeof page.raw_body_text !== 'string') {
      throw new Error(
        'GA4 raw bundle page must preserve raw response text.',
      );
    }

    let parsedPage: unknown;

    try {
      parsedPage = JSON.parse(page.raw_body_text);
    } catch {
      throw new Error(
        'GA4 preserved provider page is not valid JSON.',
      );
    }

    if (!isRecord(parsedPage)) {
      throw new Error(
        'GA4 preserved provider page must be a JSON object.',
      );
    }

    const rowCount = parsedPage.rowCount;

    if (
      typeof rowCount !== 'number'
      || !Number.isInteger(rowCount)
      || rowCount < 0
    ) {
      throw new Error(
        'GA4 provider page must include a non-negative integer rowCount.',
      );
    }

    if (
      observedRowCount !== null
      && rowCount !== observedRowCount
    ) {
      throw new Error(
        'GA4 provider pages disagree on rowCount.',
      );
    }

    observedRowCount = rowCount;

    requireExactHeaders(
      parsedPage,
      jobContext.dataset_type,
    );

    const rows = requirePageRows(
      parsedPage,
      jobContext.dataset_type,
      rowCount,
    );

    if (rowCount > 0 && rows.length === 0) {
      throw new Error(
        'GA4 non-empty report page cannot contain zero rows.',
      );
    }
  }

  if (observedRowCount === null) {
    throw new Error('GA4 rowCount is unavailable.');
  }

  const expectedPageCount = observedRowCount === 0
    ? 1
    : Math.floor(
        (observedRowCount - 1) / PAGE_LIMIT,
      ) + 1;

  if (value.pages.length !== expectedPageCount) {
    throw new Error(
      'GA4 raw bundle pagination is incomplete.',
    );
  }

  return {
    bundle: value as unknown as GoogleAnalytics4RawBundle,
    row_count: observedRowCount,
  };
};

export class GoogleAnalytics4Validator
implements CollectionValidator {
  async validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    if (
      context.job.source_id
        !== GOOGLE_ANALYTICS_4_SOURCE_ID
      || context.artifact.source_id
        !== GOOGLE_ANALYTICS_4_SOURCE_ID
      || context.job.run_id !== context.run.run_id
      || context.attempt.job_id !== context.job.job_id
      || context.artifact.run_id !== context.run.run_id
      || context.artifact.job_id !== context.job.job_id
      || context.artifact.attempt_number
        !== context.attempt.attempt_number
    ) {
      return failure(
        'INVALID_SCHEMA',
        'GA4 evidence ownership is invalid.',
      );
    }

    let jobContext:
      ReturnType<typeof requireJobContext>;

    try {
      jobContext = requireJobContext(
        context.source_context,
      );

      if (
        context.job.job_key
          !== jobContext.dataset_type
      ) {
        throw new Error(
          'GA4 Job key does not match the dataset.',
        );
      }
    } catch (error) {
      return failure(
        'QUERY_MISMATCH',
        error instanceof Error
          ? error.message
          : 'GA4 Job context is invalid.',
      );
    }

    let artifactBody: unknown;

    try {
      artifactBody = JSON.parse(
        new TextDecoder().decode(
          await readFile(context.absolute_path),
        ),
      ) as unknown;
    } catch (error) {
      return failure(
        'ERROR_NOT_DATA',
        error instanceof Error
          ? error.message
          : 'GA4 artifact is unreadable.',
      );
    }

    let bundle: GoogleAnalytics4RawBundle;
    let rowCount: number;

    try {
      const required = requireRawBundle(
        artifactBody,
        jobContext,
      );

      bundle = required.bundle;
      rowCount = required.row_count;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'GA4 raw bundle is invalid.';

      const queryMismatch = (
        message.includes('immutable Job')
        || message.includes('property ID')
        || message.includes('dates do not match')
      );

      return failure(
        queryMismatch
          ? 'QUERY_MISMATCH'
          : 'INVALID_SCHEMA',
        message,
      );
    }

    let normalized:
      ReturnType<typeof normalizeGoogleAnalytics4Rows>;

    try {
      normalized = normalizeGoogleAnalytics4Rows(
        jobContext.dataset_type,
        bundle,
      );
    } catch (error) {
      return failure(
        'INVALID_SCHEMA',
        error instanceof Error
          ? error.message
          : 'GA4 normalized evidence is invalid.',
      );
    }

    if (rowCount === 0) {
      if (normalized.rows.length !== 0) {
        return failure(
          'INVALID_SCHEMA',
          'GA4 rowCount=0 conflicts with returned rows.',
        );
      }

      return {
        validation_status: 'NO_DATA',
        checks_total: 6,
        checks_passed: 6,
        checks_warning: 0,
        checks_failed: 0,
        findings: [],
        validated_metadata: validatedMetadata(),
      };
    }

    if (normalized.rows.length === 0) {
      return failure(
        'INVALID_SCHEMA',
        'GA4 non-empty report produced no normalized rows.',
      );
    }

    if (
      jobContext.dataset_type
        === 'GA4_PAID_FUNNEL'
    ) {
      const paidRows = normalized.rows.filter(
        (row): row is Extract<
          (typeof normalized.rows)[number],
          { performance_date: string }
        > => 'performance_date' in row,
      );

      if (paidRows.length !== normalized.rows.length) {
        return failure(
          'INVALID_SCHEMA',
          'GA4 paid-funnel normalization returned an incompatible row shape.',
        );
      }

      if (
        paidRows.some(
          (row) =>
            row.session_source !== 'google'
            || row.session_medium !== 'cpc',
        )
      ) {
        return failure(
          'QUERY_MISMATCH',
          'GA4 paid-funnel rows do not match the locked google / cpc request.',
        );
      }

      const dates = paidRows.map(
        (row) => row.performance_date,
      );

      if (
        dates.some(
          (date) =>
            date < jobContext.start_date
            || date > jobContext.end_date,
        )
      ) {
        return failure(
          'QUERY_MISMATCH',
          'GA4 paid-funnel row is outside the immutable Job date range.',
        );
      }

      dates.sort();

      return {
        validation_status: 'VALID',
        checks_total: 6,
        checks_passed: 6,
        checks_warning: 0,
        checks_failed: 0,
        findings: [],
        validated_metadata: validatedMetadata(
          dates[0],
          dates[dates.length - 1],
        ),
      };
    }

    return {
      validation_status: 'VALID',
      checks_total: 6,
      checks_passed: 6,
      checks_warning: 0,
      checks_failed: 0,
      findings: [],
      validated_metadata: validatedMetadata(),
    };
  }
}
