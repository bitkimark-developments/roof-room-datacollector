import type {
  GoogleAnalytics4DatasetType,
  GoogleAnalytics4RawBundle,
} from '../../../shared/google-analytics-4';
import type {
  ApiRequester,
} from '../google-api/api-helpers';

const GA4_PAGE_LIMIT = 250_000 as const;

const CONTENT_PERFORMANCE_DIMENSIONS = [
  { name: 'landingPage' },
] as const;

const CONTENT_PERFORMANCE_METRICS = [
  { name: 'activeUsers' },
  { name: 'sessions' },
  { name: 'engagedSessions' },
  { name: 'engagementRate' },
  { name: 'keyEvents' },
  { name: 'itemViewEvents' },
  { name: 'addToCarts' },
  { name: 'checkouts' },
  { name: 'ecommercePurchases' },
  { name: 'transactions' },
  { name: 'purchaseRevenue' },
] as const;

const PAID_FUNNEL_DIMENSIONS = [
  { name: 'date' },
  { name: 'sessionSource' },
  { name: 'sessionMedium' },
  { name: 'sessionCampaignId' },
  { name: 'sessionCampaignName' },
  { name: 'landingPage' },
  { name: 'deviceCategory' },
] as const;

const PAID_FUNNEL_METRICS = [
  { name: 'sessions' },
  { name: 'engagedSessions' },
  { name: 'itemViewEvents' },
  { name: 'addToCarts' },
  { name: 'checkouts' },
  { name: 'ecommercePurchases' },
  { name: 'transactions' },
  { name: 'totalPurchasers' },
  { name: 'purchaseRevenue' },
] as const;

const PAID_FUNNEL_FILTER = {
  andGroup: {
    expressions: [
      {
        filter: {
          fieldName: 'sessionSource',
          stringFilter: {
            matchType: 'EXACT',
            value: 'google',
          },
        },
      },
      {
        filter: {
          fieldName: 'sessionMedium',
          stringFilter: {
            matchType: 'EXACT',
            value: 'cpc',
          },
        },
      },
    ],
  },
} as const;

const requireRowCount = (body: unknown): number => {
  if (
    typeof body !== 'object'
    || body === null
    || Array.isArray(body)
  ) {
    throw new Error('GA4 runReport response must be an object.');
  }

  const rowCount = (body as { rowCount?: unknown }).rowCount;

  if (
    typeof rowCount !== 'number'
    || !Number.isInteger(rowCount)
    || rowCount < 0
  ) {
    throw new Error('GA4 runReport response must include rowCount.');
  }

  return rowCount;
};

const reportShapeForDataset = (
  datasetType: GoogleAnalytics4DatasetType,
): {
  dimensions: readonly { readonly name: string }[];
  metrics: readonly { readonly name: string }[];
  dimensionFilter?: typeof PAID_FUNNEL_FILTER;
} => {
  switch (datasetType) {
    case 'GA4_CONTENT_PERFORMANCE':
      return {
        dimensions: CONTENT_PERFORMANCE_DIMENSIONS,
        metrics: CONTENT_PERFORMANCE_METRICS,
      };

    case 'GA4_PAID_FUNNEL':
      return {
        dimensions: PAID_FUNNEL_DIMENSIONS,
        metrics: PAID_FUNNEL_METRICS,
        dimensionFilter: PAID_FUNNEL_FILTER,
      };
  }
};

export const collectGoogleAnalytics4Raw = async (
  input: {
    property_id: string;
    dataset_type: GoogleAnalytics4DatasetType;
    start_date: string;
    end_date: string;
  },
  requester: ApiRequester,
): Promise<GoogleAnalytics4RawBundle> => {
  const reportShape = reportShapeForDataset(input.dataset_type);
  const pages: GoogleAnalytics4RawBundle['pages'] = [];

  let offset = 0;

  while (true) {
    const response = await requester({
      url:
        `https://analyticsdata.googleapis.com/v1beta/properties/`
        + `${input.property_id}:runReport`,
      method: 'POST',
      body: {
        dateRanges: [{
          startDate: input.start_date,
          endDate: input.end_date,
        }],
        dimensions: [...reportShape.dimensions],
        metrics: [...reportShape.metrics],
        ...(reportShape.dimensionFilter === undefined
          ? {}
          : { dimensionFilter: reportShape.dimensionFilter }),
        limit: GA4_PAGE_LIMIT,
        offset,
      },
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `GA4 runReport provider error HTTP ${response.status}.`,
      );
    }

    if (!response.raw_body) {
      throw new Error(
        'GA4 runReport requires exact provider raw response bytes.',
      );
    }

    const rowCount = requireRowCount(response.body);

    pages.push({
      offset,
      raw_body_text: new TextDecoder().decode(response.raw_body),
    });

    const nextOffset = offset + GA4_PAGE_LIMIT;

    if (nextOffset >= rowCount) break;

    offset = nextOffset;
  }

  return {
    bundle_schema_version: 1,
    dataset_type: input.dataset_type,
    request: {
      property_id: input.property_id,
      start_date: input.start_date,
      end_date: input.end_date,
      limit: GA4_PAGE_LIMIT,
    },
    pages,
  };
};
