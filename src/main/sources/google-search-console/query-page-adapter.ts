import type { GscQueryPageRow, GscQueryRow } from '../../../shared/google-api';
import { requireApiObject, requireArray, requireNumberOrNull, type ApiRequester } from '../google-api/api-helpers';

export interface GscQueryPageRequest { site_url: string; start_date: string; end_date: string; }
export interface GscQueryPageResult { raw_pages: unknown[]; rows: GscQueryPageRow[]; }
export const normalizeGscRows = (body: unknown): GscQueryPageRow[] => requireArray(requireApiObject(body, 'GSC response').rows, 'GSC response.rows').map((entry, index) => { const row = requireApiObject(entry, `GSC rows[${index}]`); const keys = requireArray(row.keys, `GSC rows[${index}].keys`); if (keys.length < 2 || typeof keys[0] !== 'string' || typeof keys[1] !== 'string') throw new Error('GSC row keys must contain query and page.'); return { query: keys[0], page: keys[1], clicks: requireNumberOrNull(row.clicks, 'clicks'), impressions: requireNumberOrNull(row.impressions, 'impressions'), ctr: requireNumberOrNull(row.ctr, 'ctr'), position: requireNumberOrNull(row.position, 'position') }; });
export const fetchGscQueryPage = async (request: GscQueryPageRequest, requester: ApiRequester, maxPages = 100): Promise<GscQueryPageResult> => { const pages: unknown[] = []; const rows: GscQueryPageRow[] = []; for (let page = 0; page < maxPages; page += 1) { const response = await requester({ url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(request.site_url)}/searchAnalytics/query`, method: 'POST', body: { siteUrl: request.site_url, startDate: request.start_date, endDate: request.end_date, dimensions: ['query', 'page'], rowLimit: 25000, startRow: page * 25000 } }); if (response.status < 200 || response.status >= 300) throw new Error(`GSC provider error HTTP ${response.status}.`); pages.push(response.body); const normalized = normalizeGscRows(response.body); rows.push(...normalized); if (normalized.length < 25000) break; } return { raw_pages: pages, rows }; };

export interface GscQueryRequest {
  site_url: string;
  start_date: string;
  end_date: string;
}

export interface GscQueryResult {
  raw_pages: unknown[];
  rows: GscQueryRow[];
}

export const normalizeGscQueryRows = (
  body: unknown,
): GscQueryRow[] =>
  requireArray(
    requireApiObject(body, 'GSC response').rows,
    'GSC response.rows',
  ).map((entry, index) => {
    const row = requireApiObject(
      entry,
      `GSC rows[${index}]`,
    );
    const keys = requireArray(
      row.keys,
      `GSC rows[${index}].keys`,
    );

    if (
      keys.length < 1
      || typeof keys[0] !== 'string'
    ) {
      throw new Error(
        'GSC query row keys must contain query.',
      );
    }

    return {
      query: keys[0],
      clicks: requireNumberOrNull(
        row.clicks,
        'clicks',
      ),
      impressions: requireNumberOrNull(
        row.impressions,
        'impressions',
      ),
      ctr: requireNumberOrNull(
        row.ctr,
        'ctr',
      ),
      position: requireNumberOrNull(
        row.position,
        'position',
      ),
    };
  });

export const fetchGscQuery = async (
  request: GscQueryRequest,
  requester: ApiRequester,
  maxPages = 100,
): Promise<GscQueryResult> => {
  const pages: unknown[] = [];
  const rows: GscQueryRow[] = [];

  for (
    let page = 0;
    page < maxPages;
    page += 1
  ) {
    const response = await requester({
      url:
        `https://www.googleapis.com/webmasters/v3/sites/${
          encodeURIComponent(request.site_url)
        }/searchAnalytics/query`,
      method: 'POST',
      body: {
        siteUrl: request.site_url,
        startDate: request.start_date,
        endDate: request.end_date,
        dimensions: ['query'],
        rowLimit: 25000,
        startRow: page * 25000,
      },
    });

    if (
      response.status < 200
      || response.status >= 300
    ) {
      throw new Error(
        `GSC provider error HTTP ${response.status}.`,
      );
    }

    pages.push(response.body);

    const normalized =
      normalizeGscQueryRows(
        response.body,
      );

    rows.push(...normalized);

    if (normalized.length < 25000) {
      break;
    }
  }

  return {
    raw_pages: pages,
    rows,
  };
};
