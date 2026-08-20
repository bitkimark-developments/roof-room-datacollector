import type {
  JsonValue,
} from '../../../shared/validation-detail';

export interface GoogleTrendsInterestSeries {
  provider_header: string;
  query: string;
  geography_label: string;
}

export interface GoogleTrendsInterestValue {
  query: string;
  geography_label: string;
  relative_interest: number | null;
}

export interface GoogleTrendsInterestRow {
  period_start: string;
  values: GoogleTrendsInterestValue[];
}

export interface ParsedGoogleTrendsInterestOverTime {
  category_label: string;
  temporal_dimension: 'Day' | 'Week';
  series: GoogleTrendsInterestSeries[];
  rows: GoogleTrendsInterestRow[];
}

export class GoogleTrendsCsvParseError
  extends Error
{
  constructor(
    readonly check_id: string,
    message: string,
    readonly expected: JsonValue,
    readonly actual: JsonValue,
  ) {
    super(message);
    this.name =
      'GoogleTrendsCsvParseError';
  }
}

type CsvState =
  | 'FIELD_START'
  | 'UNQUOTED'
  | 'QUOTED'
  | 'AFTER_QUOTE';

const decodeUtf8 = (
  bytes: Uint8Array,
): string => {
  try {
    return new TextDecoder(
      'utf-8',
      {
        fatal: true,
      },
    ).decode(bytes);
  } catch {
    throw new GoogleTrendsCsvParseError(
      'GEN_PARSEABLE',
      'Google Trends CSV is not valid UTF-8 text.',
      'UTF-8 CSV text',
      'invalid UTF-8 byte sequence',
    );
  }
};

const parseCsvRows = (
  input: string,
): string[][] => {
  const text =
    input
      .replace(/\r\n/gu, '\n')
      .replace(/\r/gu, '\n');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let state: CsvState =
    'FIELD_START';

  const pushField = (): void => {
    row.push(field);
    field = '';
    state =
      'FIELD_START';
  };

  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const character =
      text[index];

    switch (state) {
      case 'FIELD_START':
        if (character === '"') {
          state = 'QUOTED';
        } else if (
          character === ','
        ) {
          pushField();
        } else if (
          character === '\n'
        ) {
          pushRow();
        } else {
          field += character;
          state = 'UNQUOTED';
        }
        break;

      case 'UNQUOTED':
        if (character === ',') {
          pushField();
        } else if (
          character === '\n'
        ) {
          pushRow();
        } else if (
          character === '"'
        ) {
          throw new GoogleTrendsCsvParseError(
            'GEN_PARSEABLE',
            'Unexpected quote in an unquoted CSV field.',
            'RFC-style CSV field',
            `character ${index}`,
          );
        } else {
          field += character;
        }
        break;

      case 'QUOTED':
        if (character === '"') {
          if (
            text[index + 1] === '"'
          ) {
            field += '"';
            index += 1;
          } else {
            state =
              'AFTER_QUOTE';
          }
        } else {
          field += character;
        }
        break;

      case 'AFTER_QUOTE':
        if (character === ',') {
          pushField();
        } else if (
          character === '\n'
        ) {
          pushRow();
        } else {
          throw new GoogleTrendsCsvParseError(
            'GEN_PARSEABLE',
            'Unexpected character after a quoted CSV field.',
            'comma or row terminator',
            character,
          );
        }
        break;
    }
  }

  if (state === 'QUOTED') {
    throw new GoogleTrendsCsvParseError(
      'GEN_PARSEABLE',
      'CSV ended inside a quoted field.',
      'closed quoted field',
      'unterminated quoted field',
    );
  }

  if (
    field.length > 0 ||
    row.length > 0 ||
    state === 'AFTER_QUOTE'
  ) {
    pushField();
    rows.push(row);
  }

  return rows;
};

const isBlankRow = (
  row: readonly string[],
): boolean =>
  row.every(
    (cell) =>
      cell.trim().length === 0,
  );

const parseCategoryLabel = (
  row: readonly string[],
): string => {
  if (row.length !== 1) {
    throw new GoogleTrendsCsvParseError(
      'GEN_REQUIRED_COLUMNS',
      'Google Trends category preamble has an unexpected shape.',
      'one Category preamble field',
      [...row],
    );
  }

  const match =
    /^Category:\s*(.+)$/u.exec(
      row[0].trim(),
    );

  if (!match) {
    throw new GoogleTrendsCsvParseError(
      'GEN_REQUIRED_COLUMNS',
      'Google Trends category preamble is missing.',
      'Category: <label>',
      row[0],
    );
  }

  return match[1].trim();
};

const parseSeriesHeader = (
  header: string,
): GoogleTrendsInterestSeries => {
  const match =
    /^(.*):\s+\(([^()]*)\)$/u.exec(
      header.trim(),
    );

  if (!match) {
    throw new GoogleTrendsCsvParseError(
      'GEN_REQUIRED_COLUMNS',
      'Google Trends series header does not expose query and geography identity.',
      '<query>: (<geography>)',
      header,
    );
  }

  const query =
    match[1].trim();

  const geographyLabel =
    match[2].trim();

  if (
    query.length === 0 ||
    geographyLabel.length === 0
  ) {
    throw new GoogleTrendsCsvParseError(
      'GEN_REQUIRED_COLUMNS',
      'Google Trends series header contains an empty query or geography label.',
      'non-empty query and geography label',
      header,
    );
  }

  return {
    provider_header: header,
    query,
    geography_label:
      geographyLabel,
  };
};

const requireIsoDate = (
  value: string,
): string => {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/u.exec(
      value,
    );

  if (!match) {
    throw new GoogleTrendsCsvParseError(
      'GT_TEMPORAL_DIMENSION',
      'Google Trends period is not an ISO calendar date.',
      'YYYY-MM-DD',
      value,
    );
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const candidate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !==
      month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new GoogleTrendsCsvParseError(
      'GT_TEMPORAL_DIMENSION',
      'Google Trends period contains an invalid calendar date.',
      'valid YYYY-MM-DD date',
      value,
    );
  }

  return value;
};

const parseRelativeInterest = (
  rawValue: string,
): number | null => {
  const value =
    rawValue.trim();

  if (value.length === 0) {
    return null;
  }

  if (!/^\d+$/u.test(value)) {
    throw new GoogleTrendsCsvParseError(
      'GT_RELATIVE_INTEREST_PARSE',
      'Google Trends relative-interest value is not an integer.',
      'integer 0-100 or empty',
      rawValue,
    );
  }

  return Number(value);
};

export const parseGoogleTrendsInterestOverTimeCsv = (
  bytes: Uint8Array,
): ParsedGoogleTrendsInterestOverTime => {
  const decoded =
    decodeUtf8(bytes);

  const text =
    decoded.startsWith('\uFEFF')
      ? decoded.slice(1)
      : decoded;

  const rows =
    parseCsvRows(text);

  while (
    rows.length > 0 &&
    isBlankRow(
      rows[rows.length - 1],
    )
  ) {
    rows.pop();
  }

  if (rows.length === 0) {
    throw new GoogleTrendsCsvParseError(
      'GEN_NON_EMPTY_FILE',
      'Google Trends CSV contains no data rows or preamble.',
      'non-empty provider CSV',
      'empty content',
    );
  }

  let cursor = 0;

  while (
    cursor < rows.length &&
    isBlankRow(rows[cursor])
  ) {
    cursor += 1;
  }

  if (cursor >= rows.length) {
    throw new GoogleTrendsCsvParseError(
      'GEN_NON_EMPTY_FILE',
      'Google Trends CSV contains only blank rows.',
      'non-empty provider CSV',
      'blank content',
    );
  }

  const categoryLabel =
    parseCategoryLabel(
      rows[cursor],
    );

  cursor += 1;

  while (
    cursor < rows.length &&
    isBlankRow(rows[cursor])
  ) {
    cursor += 1;
  }

  if (cursor >= rows.length) {
    throw new GoogleTrendsCsvParseError(
      'GEN_REQUIRED_COLUMNS',
      'Google Trends CSV has no Interest Over Time header.',
      'Day or Week plus one or more query-series columns',
      'missing header',
    );
  }

  const header =
    rows[cursor];

  cursor += 1;

  const temporalDimension =
    header[0]?.trim();

  if (
    header.length < 2 ||
    (
      temporalDimension !== 'Day' &&
      temporalDimension !== 'Week'
    )
  ) {
    throw new GoogleTrendsCsvParseError(
      'GT_TEMPORAL_DIMENSION',
      'Google Trends Interest Over Time header must start with an observed supported temporal dimension.',
      'Day or Week',
      temporalDimension ?? null,
    );
  }

  const series =
    header
      .slice(1)
      .map(parseSeriesHeader);

  if (series.length === 0) {
    throw new GoogleTrendsCsvParseError(
      'GEN_REQUIRED_COLUMNS',
      'Google Trends CSV contains no query-series columns.',
      'at least one query-series column',
      0,
    );
  }

  const dataRows:
    GoogleTrendsInterestRow[] = [];

  for (
    ;
    cursor < rows.length;
    cursor += 1
  ) {
    const rawRow =
      rows[cursor];

    if (isBlankRow(rawRow)) {
      continue;
    }

    if (
      rawRow.length !==
      header.length
    ) {
      throw new GoogleTrendsCsvParseError(
        'GEN_PARSEABLE',
        'Google Trends data row width does not match the header.',
        header.length,
        rawRow.length,
      );
    }

    const periodStart =
      requireIsoDate(
        rawRow[0].trim(),
      );

    const values =
      series.map(
        (
          seriesIdentity,
          seriesIndex,
        ) => ({
          query:
            seriesIdentity.query,
          geography_label:
            seriesIdentity
              .geography_label,
          relative_interest:
            parseRelativeInterest(
              rawRow[
                seriesIndex + 1
              ],
            ),
        }),
      );

    dataRows.push({
      period_start:
        periodStart,
      values,
    });
  }

  if (dataRows.length === 0) {
    throw new GoogleTrendsCsvParseError(
      'GEN_REQUIRED_COLUMNS',
      'Google Trends Interest Over Time CSV contains no temporal rows.',
      'at least one Day or Week row',
      0,
    );
  }

  return {
    category_label:
      categoryLabel,
    temporal_dimension:
      temporalDimension,
    series,
    rows: dataRows,
  };
};

