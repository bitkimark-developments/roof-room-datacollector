import type {
  KeywordPlannerRow,
} from '../../../shared/google-api';

const FIXED_HEADERS = [
  'Keyword',
  'Currency',
  'Segmentation',
  'Avg. monthly searches',
  'Three month change',
  'YoY change',
  'Competition',
  'Competition (indexed value)',
  'Top of page bid (low range)',
  'Top of page bid (high range)',
  'Ad impression share',
  'Organic average position',
  'Organic impression share',
  'In Account',
] as const;

const MONTHS = new Map<string, number>([
  ['Jan', 1],
  ['Feb', 2],
  ['Mar', 3],
  ['Apr', 4],
  ['May', 5],
  ['Jun', 6],
  ['Jul', 7],
  ['Aug', 8],
  ['Sep', 9],
  ['Oct', 10],
  ['Nov', 11],
  ['Dec', 12],
]);

export interface KeywordPlannerManualCsvRow
  extends KeywordPlannerRow {
  currency: string;
}

export interface KeywordPlannerManualCsv {
  metadata: {
    title: string;
    date_range_label: string;
    segmentation_rows: number;
  };
  rows: KeywordPlannerManualCsvRow[];
}

const decodeUtf16Le = (
  bytes: Uint8Array,
): string => {
  if (
    bytes.length < 4
    || bytes.length % 2 !== 0
    || bytes[0] !== 0xff
    || bytes[1] !== 0xfe
  ) {
    throw new Error(
      'Keyword Planner manual export must be UTF-16LE with a BOM.',
    );
  }

  return new TextDecoder(
    'utf-16le',
    { fatal: true },
  ).decode(
    bytes.subarray(2),
  );
};

const parseTabularRows = (
  text: string,
): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let afterQuote = false;

  const finishCell = () => {
    row.push(cell);
    cell = '';
    afterQuote = false;
  };

  const finishRow = () => {
    finishCell();
    rows.push(row);
    row = [];
  };

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const character = text[index];

    if (quoted) {
      if (character !== '"') {
        cell += character;
        continue;
      }

      if (text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
        afterQuote = true;
      }
      continue;
    }

    if (afterQuote) {
      if (character !== '\t'
        && character !== '\r'
        && character !== '\n') {
        throw new Error(
          'Keyword Planner manual export contains invalid quoted data.',
        );
      }
    } else if (character === '"') {
      if (cell.length > 0) {
        throw new Error(
          'Keyword Planner manual export contains an unexpected quote.',
        );
      }
      quoted = true;
      continue;
    } else if (character !== '\t'
      && character !== '\r'
      && character !== '\n') {
      cell += character;
      continue;
    }

    if (character === '\t') {
      finishCell();
      continue;
    }

    if (character === '\r') {
      if (text[index + 1] !== '\n') {
        throw new Error(
          'Keyword Planner manual export must use complete line endings.',
        );
      }
      index += 1;
    }

    finishRow();
  }

  if (quoted) {
    throw new Error(
      'Keyword Planner manual export contains an unclosed quoted field.',
    );
  }

  if (
    cell.length > 0
    || row.length > 0
  ) {
    finishRow();
  }

  return rows;
};

const requireNullableNumber = (
  value: string,
  field: string,
): number | null => {
  if (value === '') return null;
  if (!/^-?(?:\d+|\d+\.\d+)$/.test(value)) {
    throw new Error(
      `Keyword Planner ${field} is not a supported number.`,
    );
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Keyword Planner ${field} is not finite.`,
    );
  }
  return parsed;
};

const requireNullablePercent = (
  value: string,
  field: string,
): number | null => {
  if (value === '') return null;
  if (!/^-?\d+(?:[.,]\d+)?%$/.test(value)) {
    throw new Error(
      `Keyword Planner ${field} is not a supported percentage.`,
    );
  }
  return Number(
    value.slice(0, -1).replace(',', '.'),
  );
};

const requireNullableLocalizedNumber = (
  value: string,
  field: string,
): number | null => {
  if (value === '') return null;
  if (!/^-?\d+(?:,\d+)?$/.test(value)) {
    throw new Error(
      `Keyword Planner ${field} is not a supported localized number.`,
    );
  }
  return Number(
    value.replace(',', '.'),
  );
};

const parseMonthlyHeaders = (
  headers: readonly string[],
): Array<{ year: number; month: number }> => {
  if (headers.length !== 12) {
    throw new Error(
      'Keyword Planner manual export must contain exactly 12 monthly search columns.',
    );
  }

  const months = headers.map(
    (header) => {
      const match =
        /^Searches: ([A-Z][a-z]{2}) (\d{4})$/.exec(
          header,
        );
      const month =
        match
          ? MONTHS.get(match[1])
          : undefined;
      const year =
        match
          ? Number(match[2])
          : Number.NaN;

      if (
        month === undefined
        || !Number.isInteger(year)
      ) {
        throw new Error(
          `Unsupported Keyword Planner monthly header: ${header}`,
        );
      }

      return {
        year,
        month,
      };
    },
  );

  for (
    let index = 1;
    index < months.length;
    index += 1
  ) {
    const previous =
      months[index - 1];
    const current =
      months[index];

    if (
      current.year * 12
        + current.month
      !== previous.year * 12
        + previous.month
        + 1
    ) {
      throw new Error(
        'Keyword Planner monthly search columns must be consecutive.',
      );
    }
  }

  return months;
};

export const parseKeywordPlannerManualCsv = (
  bytes: Uint8Array,
): KeywordPlannerManualCsv => {
  const rows =
    parseTabularRows(
      decodeUtf16Le(
        bytes,
      ),
    );

  if (
    rows.length < 4
    || rows[0].length !== 1
    || !rows[0][0].startsWith(
      'Keyword Stats ',
    )
    || rows[1].length !== 1
    || rows[1][0].trim().length === 0
  ) {
    throw new Error(
      'Keyword Planner manual export metadata is missing or unsupported.',
    );
  }

  const header = rows[2];
  if (
    header.length
      !== FIXED_HEADERS.length + 12
    || FIXED_HEADERS.some(
      (expected, index) =>
        header[index] !== expected,
    )
  ) {
    throw new Error(
      'Keyword Planner manual export headers do not match the observed contract.',
    );
  }

  const months =
    parseMonthlyHeaders(
      header.slice(
        FIXED_HEADERS.length,
      ),
    );

  const parsedRows:
    KeywordPlannerManualCsvRow[] = [];
  let segmentationRows = 0;
  let keywordRowsStarted = false;

  for (
    const sourceRow of rows.slice(3)
  ) {
    if (
      sourceRow.length === 1
      && sourceRow[0] === ''
    ) {
      continue;
    }

    if (
      sourceRow.length !== header.length
    ) {
      throw new Error(
        'Keyword Planner manual export contains a partial row.',
      );
    }

    const cells =
      sourceRow.map(
        (value) => value.trim(),
      );
    const keyword = cells[0];

    if (keyword === '') {
      const unsupportedValues =
        cells.some(
          (value, index) =>
            value !== ''
            && index !== 2
            && index !== 3,
        );

      if (
        keywordRowsStarted
        || cells[2] === ''
        || unsupportedValues
      ) {
        throw new Error(
          'Keyword Planner segmentation rows must precede keyword rows and use the observed shape.',
        );
      }

      requireNullableNumber(
        cells[3],
        'segmentation average monthly searches',
      );
      segmentationRows += 1;
      continue;
    }

    keywordRowsStarted = true;

    if (
      cells[1] === ''
      || cells[2] !== ''
    ) {
      throw new Error(
        'Keyword Planner keyword row currency or segmentation shape is invalid.',
      );
    }

    parsedRows.push({
      requested_keyword:
        keyword,
      returned_keyword:
        keyword,
      group_id:
        'manual-import',
      currency:
        cells[1],
      avg_monthly_searches:
        requireNullableNumber(
          cells[3],
          'average monthly searches',
        ),
      change_3_month:
        requireNullablePercent(
          cells[4],
          'three month change',
        ),
      change_yoy:
        requireNullablePercent(
          cells[5],
          'YoY change',
        ),
      competition:
        cells[6] === ''
          ? null
          : cells[6],
      competition_index:
        requireNullableNumber(
          cells[7],
          'competition index',
        ),
      top_of_page_bid_low:
        requireNullableLocalizedNumber(
          cells[8],
          'top of page bid low range',
        ),
      top_of_page_bid_high:
        requireNullableLocalizedNumber(
          cells[9],
          'top of page bid high range',
        ),
      monthly_history:
        months.map(
          (month, index) => ({
            ...month,
            searches:
              requireNullableNumber(
                cells[
                  FIXED_HEADERS.length
                    + index
                ],
                `monthly searches ${month.year}-${String(month.month).padStart(2, '0')}`,
              ),
          }),
        ),
    });
  }

  if (segmentationRows === 0) {
    throw new Error(
      'Keyword Planner manual export contains no leading segmentation rows.',
    );
  }

  return {
    metadata: {
      title:
        rows[0][0],
      date_range_label:
        rows[1][0],
      segmentation_rows:
        segmentationRows,
    },
    rows:
      parsedRows,
  };
};

