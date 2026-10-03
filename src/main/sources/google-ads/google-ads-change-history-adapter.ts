export interface GoogleAdsChangeHistoryNormalizedRow {
  change_date_time: string;
  user_email: string;
  client_type: string;
  change_resource_type: string;
  change_resource_name: string;
  resource_change_operation: string;
}

const requireStringField = (
  value: unknown,
  field: string,
): string => {
  if (typeof value !== 'string') {
    throw new Error(
      `Google Ads Change History ${field} must be a string.`,
    );
  }

  return value;
};

export const normalizeGoogleAdsChangeHistoryRows = (
  results: unknown,
): GoogleAdsChangeHistoryNormalizedRow[] => {
  if (!Array.isArray(results)) {
    throw new Error(
      'Google Ads Change History response must be an array of rows.',
    );
  }

  return results.map((item) => {
    if (
      typeof item !== 'object'
      || item === null
      || Array.isArray(item)
    ) {
      throw new Error(
        'Google Ads Change History result row must be an object.',
      );
    }

    const changeEvent =
      (item as { change_event?: unknown }).change_event;

    if (
      typeof changeEvent !== 'object'
      || changeEvent === null
      || Array.isArray(changeEvent)
    ) {
      throw new Error(
        'Google Ads Change History change_event is required.',
      );
    }

    const event =
      changeEvent as Record<string, unknown>;

    return {
      change_date_time:
        requireStringField(
          event.change_date_time,
          'change_date_time',
        ),
      user_email:
        requireStringField(
          event.user_email,
          'user_email',
        ),
      client_type:
        requireStringField(
          event.client_type,
          'client_type',
        ),
      change_resource_type:
        requireStringField(
          event.change_resource_type,
          'change_resource_type',
        ),
      change_resource_name:
        requireStringField(
          event.change_resource_name,
          'change_resource_name',
        ),
      resource_change_operation:
        requireStringField(
          event.resource_change_operation,
          'resource_change_operation',
        ),
    };
  });
};
