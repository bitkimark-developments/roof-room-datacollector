import type {
  SerpApiNormalizedRow,
  SerpApiParsedResponse,
  SerpApiRequestContext,
} from '../../../shared/serpapi';

export type SerpApiParseErrorCode =
  | 'ERROR_NOT_DATA'
  | 'INVALID_SCHEMA'
  | 'QUERY_MISMATCH'
  | 'CONTEXT_MISMATCH';

export class SerpApiParseError extends Error {
  constructor(
    public readonly code: SerpApiParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SerpApiParseError';
  }
}

const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nullableString = (
  value: unknown,
  field: string,
): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new SerpApiParseError(
      'INVALID_SCHEMA',
      `SerpApi ${field} must be a string or missing.`,
    );
  }
  return value;
};

const normalizedLink = (
  value: unknown,
): { url: string | null; domain: string | null } => {
  const url = nullableString(value, 'link');
  if (url === null) return { url: null, domain: null };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SerpApiParseError('INVALID_SCHEMA', 'SerpApi result link is not a valid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SerpApiParseError('INVALID_SCHEMA', 'SerpApi result link must use HTTP(S).');
  }
  return { url, domain: parsed.hostname.toLowerCase() || null };
};

const requiredPosition = (value: unknown): number => {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new SerpApiParseError(
      'INVALID_SCHEMA',
      'SerpApi organic result position must be a positive integer.',
    );
  }
  return value;
};

const observedContext = (
  parameters: Record<string, unknown> | null,
) => ({
  query: typeof parameters?.q === 'string' ? parameters.q : null,
  country_code: typeof parameters?.gl === 'string' ? parameters.gl : null,
  language_code: typeof parameters?.hl === 'string' ? parameters.hl : null,
  device: typeof parameters?.device === 'string' ? parameters.device : null,
  engine: typeof parameters?.engine === 'string' ? parameters.engine : null,
});

export const parseSerpApiResponse = (
  body: unknown,
  expected: SerpApiRequestContext,
): SerpApiParsedResponse => {
  if (!isRecord(body)) {
    throw new SerpApiParseError('ERROR_NOT_DATA', 'SerpApi response is not a JSON object.');
  }
  if (typeof body.error === 'string') {
    throw new SerpApiParseError('ERROR_NOT_DATA', 'SerpApi response contains a provider error.');
  }
  const metadata = isRecord(body.search_metadata)
    ? body.search_metadata
    : null;
  if (metadata?.status !== 'Success') {
    throw new SerpApiParseError('ERROR_NOT_DATA', 'SerpApi response is not a successful dataset.');
  }
  const parameters = isRecord(body.search_parameters)
    ? body.search_parameters
    : null;
  const observed = observedContext(parameters);
  if (observed.query !== null && observed.query !== expected.query) {
    throw new SerpApiParseError('QUERY_MISMATCH', 'SerpApi response query does not match the requested Job.');
  }
  const expectedContext = {
    country_code: expected.country_code.toLowerCase(),
    language_code: expected.language_code,
    device: expected.device,
    engine: expected.engine,
  };
  if (
    (observed.country_code !== null && observed.country_code !== expectedContext.country_code) ||
    (observed.language_code !== null && observed.language_code !== expectedContext.language_code) ||
    (observed.device !== null && observed.device !== expectedContext.device) ||
    (observed.engine !== null && observed.engine !== expectedContext.engine)
  ) {
    throw new SerpApiParseError('CONTEXT_MISMATCH', 'SerpApi response context does not match the requested Job.');
  }

  const rawOrganic = body.organic_results;
  if (rawOrganic !== undefined && !Array.isArray(rawOrganic)) {
    throw new SerpApiParseError('INVALID_SCHEMA', 'SerpApi organic_results must be an array.');
  }
  const organicEntries: unknown[] = Array.isArray(rawOrganic)
    ? rawOrganic
    : [];
  const organic = organicEntries.slice(0, expected.organic_limit);
  const rows: SerpApiNormalizedRow[] = organic.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new SerpApiParseError('INVALID_SCHEMA', `SerpApi organic_results[${index}] must be an object.`);
    }
    const link = normalizedLink(entry.link);
    return {
      query: expected.query,
      position: requiredPosition(entry.position),
      title: nullableString(entry.title, 'title'),
      url: link.url,
      domain: link.domain,
      snippet: nullableString(entry.snippet, 'snippet'),
      paa: null as string | null,
      result_type: 'ORGANIC',
    };
  });

  const related = body.related_questions;
  if (related !== undefined && !Array.isArray(related)) {
    throw new SerpApiParseError('INVALID_SCHEMA', 'SerpApi related_questions must be an array.');
  }
  const relatedEntries: unknown[] = Array.isArray(related) ? related : [];
  for (const [index, entry] of relatedEntries.entries()) {
    if (!isRecord(entry) || typeof entry.question !== 'string' || !entry.question.trim()) {
      throw new SerpApiParseError('INVALID_SCHEMA', `SerpApi related_questions[${index}] is missing question.`);
    }
    const link = normalizedLink(entry.link);
    rows.push({
      query: expected.query,
      position: null,
      title: null,
      url: link.url,
      domain: link.domain,
      snippet: nullableString(entry.snippet, 'snippet'),
      paa: entry.question as string,
      result_type: 'PAA',
    });
  }
  return {
    rows,
    organic_count: organic.length,
    paa_count: relatedEntries.length,
    observed_context: observed,
  };
};
