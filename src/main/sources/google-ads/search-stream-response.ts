const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const flattenGoogleAdsSearchStream = (body: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(body)) {
    throw new Error('Google Ads SearchStream response must be a top-level array.');
  }

  const rows: Record<string, unknown>[] = [];
  body.forEach((candidateEnvelope, envelopeIndex) => {
    if (!isRecord(candidateEnvelope)) {
      throw new Error(`Google Ads SearchStream envelope[${envelopeIndex}] must be an object.`);
    }

    const { results } = candidateEnvelope;
    if (results === undefined) return;
    if (!Array.isArray(results)) {
      throw new Error(`Google Ads SearchStream envelope[${envelopeIndex}].results must be an array.`);
    }

    results.forEach((candidateRow, rowIndex) => {
      if (!isRecord(candidateRow)) {
        throw new Error(
          `Google Ads SearchStream envelope[${envelopeIndex}].results[${rowIndex}] result row must be an object.`,
        );
      }
      rows.push(candidateRow);
    });
  });

  return rows;
};
