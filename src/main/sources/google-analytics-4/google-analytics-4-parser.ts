import type {
  GoogleAnalytics4ContentPerformanceRow,
  GoogleAnalytics4DatasetType,
  GoogleAnalytics4PaidFunnelRow,
  GoogleAnalytics4ProviderMetadata,
  GoogleAnalytics4RawBundle,
} from '../../../shared/google-analytics-4';

export interface GoogleAnalytics4NormalizedResult {
  rows: (
    | GoogleAnalytics4ContentPerformanceRow
    | GoogleAnalytics4PaidFunnelRow
  )[];
  provider_metadata: GoogleAnalytics4ProviderMetadata;
}

const requireRecord = (
  value: unknown,
  context: string,
): Record<string, unknown> => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
};

const requireArray = (
  value: unknown,
  context: string,
): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value;
};

const parseRawPage = (
  rawBodyText: string,
): Record<string, unknown> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBodyText);
  } catch {
    throw new Error('GA4 raw page JSON is invalid.');
  }

  return requireRecord(parsed, 'GA4 raw page');
};

const headerNames = (
  value: unknown,
  context: string,
): string[] => requireArray(value, context).map(
  (header, index) => {
    const record = requireRecord(
      header,
      `${context}[${index}]`,
    );

    if (
      typeof record.name !== 'string'
      || record.name.length === 0
    ) {
      throw new Error(`${context}[${index}] must include a name.`);
    }

    return record.name;
  },
);

const valuesByHeader = (
  headerNamesInput: readonly string[],
  values: unknown,
  context: string,
): Map<string, unknown> => {
  const valueArray = requireArray(values, context);
  const mapped = new Map<string, unknown>();

  for (
    let index = 0;
    index < headerNamesInput.length;
    index += 1
  ) {
    const cell = valueArray[index];

    if (cell === undefined) {
      mapped.set(headerNamesInput[index], undefined);
      continue;
    }

    const record = requireRecord(
      cell,
      `${context}[${index}]`,
    );

    mapped.set(headerNamesInput[index], record.value);
  }

  return mapped;
};

const requireDimensionValue = (
  values: ReadonlyMap<string, unknown>,
  name: string,
): string => {
  if (!values.has(name)) {
    throw new Error(`GA4 dimension header ${name} is missing.`);
  }

  const value = values.get(name);

  if (typeof value !== 'string') {
    throw new Error(`GA4 dimension ${name} must be a string.`);
  }

  return value;
};

const parseNumericMetric = (
  values: ReadonlyMap<string, unknown>,
  name: string,
): number | null => {
  if (!values.has(name)) return null;

  const value = values.get(name);

  if (
    value === undefined
    || value === null
    || value === ''
  ) {
    return null;
  }

  if (
    typeof value !== 'string'
    && typeof value !== 'number'
  ) {
    throw new Error(`GA4 metric ${name} must be numeric or missing.`);
  }

  const parsed = typeof value === 'number'
    ? value
    : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`GA4 metric ${name} must be numeric or missing.`);
  }

  return parsed;
};

const parseGa4Date = (value: string): string => {
  if (!/^\d{8}$/u.test(value)) {
    throw new Error('GA4 date must use YYYYMMDD format.');
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error('GA4 date must be a valid calendar date.');
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
};

const metadataValue = (
  metadata: Record<string, unknown> | null,
  key: string,
): string | null => {
  if (metadata === null) return null;
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
};

export const normalizeGoogleAnalytics4Rows = (
  datasetType: GoogleAnalytics4DatasetType,
  bundle: GoogleAnalytics4RawBundle,
): GoogleAnalytics4NormalizedResult => {
  const normalizedRows: GoogleAnalytics4NormalizedResult['rows'] = [];

  let currencyCode: string | null = null;
  let timeZone: string | null = null;

  for (const page of bundle.pages) {
    const body = parseRawPage(page.raw_body_text);

    const dimensions = headerNames(
      body.dimensionHeaders,
      'GA4 dimensionHeaders',
    );

    const metrics = headerNames(
      body.metricHeaders,
      'GA4 metricHeaders',
    );

    const rows = requireArray(
      body.rows,
      'GA4 rows',
    );

    const metadata = body.metadata === undefined
      ? null
      : requireRecord(body.metadata, 'GA4 metadata');

    if (currencyCode === null) {
      currencyCode = metadataValue(metadata, 'currencyCode');
    }

    if (timeZone === null) {
      timeZone = metadataValue(metadata, 'timeZone');
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = requireRecord(
        rows[rowIndex],
        `GA4 rows[${rowIndex}]`,
      );

      const dimensionValues = valuesByHeader(
        dimensions,
        row.dimensionValues,
        `GA4 rows[${rowIndex}].dimensionValues`,
      );

      const metricValues = valuesByHeader(
        metrics,
        row.metricValues,
        `GA4 rows[${rowIndex}].metricValues`,
      );

      switch (datasetType) {
        case 'GA4_CONTENT_PERFORMANCE':
          normalizedRows.push({
            landing_page: requireDimensionValue(
              dimensionValues,
              'landingPage',
            ),
            active_users: parseNumericMetric(
              metricValues,
              'activeUsers',
            ),
            sessions: parseNumericMetric(
              metricValues,
              'sessions',
            ),
            engaged_sessions: parseNumericMetric(
              metricValues,
              'engagedSessions',
            ),
            engagement_rate: parseNumericMetric(
              metricValues,
              'engagementRate',
            ),
            key_events: parseNumericMetric(
              metricValues,
              'keyEvents',
            ),
            item_view_events: parseNumericMetric(
              metricValues,
              'itemViewEvents',
            ),
            add_to_carts: parseNumericMetric(
              metricValues,
              'addToCarts',
            ),
            checkouts: parseNumericMetric(
              metricValues,
              'checkouts',
            ),
            ecommerce_purchases: parseNumericMetric(
              metricValues,
              'ecommercePurchases',
            ),
            transactions: parseNumericMetric(
              metricValues,
              'transactions',
            ),
            purchase_revenue: parseNumericMetric(
              metricValues,
              'purchaseRevenue',
            ),
          });
          break;

        case 'GA4_PAID_FUNNEL':
          normalizedRows.push({
            performance_date: parseGa4Date(
              requireDimensionValue(
                dimensionValues,
                'date',
              ),
            ),
            session_source: requireDimensionValue(
              dimensionValues,
              'sessionSource',
            ),
            session_medium: requireDimensionValue(
              dimensionValues,
              'sessionMedium',
            ),
            session_campaign_id: requireDimensionValue(
              dimensionValues,
              'sessionCampaignId',
            ),
            session_campaign_name: requireDimensionValue(
              dimensionValues,
              'sessionCampaignName',
            ),
            landing_page: requireDimensionValue(
              dimensionValues,
              'landingPage',
            ),
            device_category: requireDimensionValue(
              dimensionValues,
              'deviceCategory',
            ),
            sessions: parseNumericMetric(
              metricValues,
              'sessions',
            ),
            engaged_sessions: parseNumericMetric(
              metricValues,
              'engagedSessions',
            ),
            item_view_events: parseNumericMetric(
              metricValues,
              'itemViewEvents',
            ),
            add_to_carts: parseNumericMetric(
              metricValues,
              'addToCarts',
            ),
            checkouts: parseNumericMetric(
              metricValues,
              'checkouts',
            ),
            ecommerce_purchases: parseNumericMetric(
              metricValues,
              'ecommercePurchases',
            ),
            transactions: parseNumericMetric(
              metricValues,
              'transactions',
            ),
            total_purchasers: parseNumericMetric(
              metricValues,
              'totalPurchasers',
            ),
            purchase_revenue: parseNumericMetric(
              metricValues,
              'purchaseRevenue',
            ),
          });
          break;
      }
    }
  }

  return {
    rows: normalizedRows,
    provider_metadata: {
      currency_code: currencyCode,
      time_zone: timeZone,
    },
  };
};
