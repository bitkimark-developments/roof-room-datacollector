import { readFile } from 'node:fs/promises';
import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
  ValidatedDatasetMetadata,
} from '../../../shared/collection';
import {
  GOOGLE_ADS_CONFIGURATION_SOURCE_ID,
  type GoogleAdsConfigurationNormalizedRow,
} from '../../../shared/google-ads-configuration';
import {
  normalizeGoogleAdsConfigurationRows,
} from './configuration-normalizer';
import {
  extractGoogleAdsCampaignTargetingGeoResourceNames,
  parseGoogleAdsCampaignTargetingEvidenceBundle,
  type GoogleAdsCampaignSettingsNormalizationOptions,
  type GoogleAdsGeoTargetConstantEvidence,
} from './campaign-settings-adapter';
import {
  requireGoogleAdsConfigurationJobContext,
} from './configuration-request';
import {
  flattenGoogleAdsSearchStream,
} from './search-stream-response';

type FailureStatus =
  | 'INVALID_SCHEMA'
  | 'ERROR_NOT_DATA'
  | 'QUERY_MISMATCH';

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
    check_id: 'GOOGLE_ADS_CONFIGURATION_RESPONSE',
    severity: 'ERROR',
    passed: false,
    message,
    expected:
      'Canonical Google Ads configuration SearchStream evidence matching the immutable Job',
    actual:
      'Artifact did not satisfy the Google Ads configuration contract',
  }],
});

const validatedMetadata = (): ValidatedDatasetMetadata => ({
  actual_date_start: null,
  actual_date_end: null,
  country_name: null,
});

export class GoogleAdsConfigurationValidator
implements CollectionValidator {
  async validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    if (
      context.job.source_id
        !== GOOGLE_ADS_CONFIGURATION_SOURCE_ID
      || context.artifact.source_id
        !== GOOGLE_ADS_CONFIGURATION_SOURCE_ID
      || context.job.run_id !== context.run.run_id
      || context.attempt.job_id !== context.job.job_id
      || context.artifact.run_id !== context.run.run_id
      || context.artifact.job_id !== context.job.job_id
      || context.artifact.attempt_number
        !== context.attempt.attempt_number
    ) {
      return failure(
        'INVALID_SCHEMA',
        'Google Ads configuration evidence ownership is invalid.',
      );
    }

    let jobContext;

    try {
      jobContext =
        requireGoogleAdsConfigurationJobContext(
          context.source_context,
        );

      if (
        context.job.job_key
        !== jobContext.dataset_type
      ) {
        throw new Error(
          'Google Ads configuration Job key does not match the dataset.',
        );
      }
    } catch (error) {
      return failure(
        'QUERY_MISMATCH',
        error instanceof Error
          ? error.message
          : 'Google Ads configuration Job context is invalid.',
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(
        new TextDecoder().decode(
          await readFile(context.absolute_path),
        ),
      ) as unknown;
    } catch (error) {
      return failure(
        'ERROR_NOT_DATA',
        error instanceof Error
          ? error.message
          : 'Google Ads configuration artifact is unreadable.',
      );
    }

    let rows: Record<string, unknown>[];
    let normalizationOptions:
      GoogleAdsCampaignSettingsNormalizationOptions = {};

    if (
      jobContext.dataset_type
        === 'CAMPAIGN_TARGETING_CRITERIA'
    ) {
      let bundle;

      try {
        bundle =
          parseGoogleAdsCampaignTargetingEvidenceBundle(body);
      } catch (error) {
        return failure(
          'INVALID_SCHEMA',
          error instanceof Error
            ? error.message
            : 'Google Ads campaign targeting evidence bundle is invalid.',
        );
      }

      const searchStreamPart = bundle.parts.find(
        (part) =>
          part.kind === 'CAMPAIGN_CRITERIA_SEARCH_STREAM',
      );

      if (
        !searchStreamPart
        || searchStreamPart.kind
          !== 'CAMPAIGN_CRITERIA_SEARCH_STREAM'
      ) {
        return failure(
          'INVALID_SCHEMA',
          'Google Ads campaign targeting SearchStream evidence is required.',
        );
      }

      let searchStreamBody: unknown;

      try {
        searchStreamBody = JSON.parse(
          Buffer.from(
            searchStreamPart.raw_body_base64,
            'base64',
          ).toString('utf8'),
        ) as unknown;
      } catch (error) {
        return failure(
          'INVALID_SCHEMA',
          error instanceof Error
            ? error.message
            : 'Google Ads campaign targeting SearchStream evidence is invalid.',
        );
      }

      try {
        rows = flattenGoogleAdsSearchStream(searchStreamBody);
      } catch (error) {
        return failure(
          'INVALID_SCHEMA',
          error instanceof Error
            ? error.message
            : 'Google Ads campaign targeting SearchStream envelope is invalid.',
        );
      }

      let observedGeoResourceNames: string[];

      try {
        observedGeoResourceNames = [
          ...new Set(
            extractGoogleAdsCampaignTargetingGeoResourceNames(
              searchStreamBody,
            ),
          ),
        ];
      } catch (error) {
        return failure(
          'QUERY_MISMATCH',
          error instanceof Error
            ? error.message
            : 'Google Ads campaign targeting LOCATION evidence is invalid.',
        );
      }

      const geoPart = bundle.parts.find(
        (part) =>
          part.kind === 'GEO_TARGET_CONSTANT_SUGGESTIONS',
      );

      if (
        geoPart
        && geoPart.kind
          === 'GEO_TARGET_CONSTANT_SUGGESTIONS'
      ) {
        if (
          geoPart.requested_resource_names.length
            !== observedGeoResourceNames.length
          || geoPart.requested_resource_names.some(
            (resourceName, index) =>
              resourceName !== observedGeoResourceNames[index],
          )
        ) {
          return failure(
            'QUERY_MISMATCH',
            'Google Ads geo resolver requested resource names do not exactly match observed LOCATION evidence.',
          );
        }

        let geoBody: unknown;

        try {
          geoBody = JSON.parse(
            Buffer.from(
              geoPart.raw_body_base64,
              'base64',
            ).toString('utf8'),
          ) as unknown;
        } catch (error) {
          return failure(
            'INVALID_SCHEMA',
            error instanceof Error
              ? error.message
              : 'Google Ads geo target resolver evidence is invalid.',
          );
        }

        if (
          typeof geoBody !== 'object'
          || geoBody === null
          || Array.isArray(geoBody)
        ) {
          return failure(
            'INVALID_SCHEMA',
            'Google Ads geo target resolver response is invalid.',
          );
        }

        const suggestions =
          (geoBody as Record<string, unknown>)
            .geoTargetConstantSuggestions;

        if (!Array.isArray(suggestions)) {
          return failure(
            'INVALID_SCHEMA',
            'Google Ads geo target resolver suggestions are invalid.',
          );
        }

        const geoTargetConstants =
          new Map<string, GoogleAdsGeoTargetConstantEvidence>();

        try {
          for (const suggestionValue of suggestions) {
            if (
              typeof suggestionValue !== 'object'
              || suggestionValue === null
              || Array.isArray(suggestionValue)
            ) {
              throw new Error(
                'Google Ads geo target resolver suggestion is invalid.',
              );
            }

            const suggestion =
              suggestionValue as Record<string, unknown>;
            const constantValue = suggestion.geoTargetConstant;

            if (
              typeof constantValue !== 'object'
              || constantValue === null
              || Array.isArray(constantValue)
            ) {
              throw new Error(
                'Google Ads geo target constant evidence is invalid.',
              );
            }

            const constant =
              constantValue as Record<string, unknown>;

            const requireText = (
              value: unknown,
              label: string,
            ): string => {
              if (
                typeof value !== 'string'
                || value.length === 0
              ) {
                throw new Error(
                  `Google Ads geo target constant ${label} is required.`,
                );
              }

              return value;
            };

            const resourceName = requireText(
              constant.resourceName,
              'resourceName',
            );
            const id = requireText(
              constant.id,
              'id',
            );

            if (
              resourceName
                !== `geoTargetConstants/${id}`
            ) {
              return failure(
                'QUERY_MISMATCH',
                'Google Ads geo target constant resourceName does not match its id.',
              );
            }

            geoTargetConstants.set(resourceName, {
              resource_name: resourceName,
              id,
              name: requireText(constant.name, 'name'),
              canonical_name: requireText(
                constant.canonicalName,
                'canonicalName',
              ),
              country_code: requireText(
                constant.countryCode,
                'countryCode',
              ),
              target_type: requireText(
                constant.targetType,
                'targetType',
              ),
              status: requireText(
                constant.status,
                'status',
              ),
            });
          }
        } catch (error) {
          return failure(
            'INVALID_SCHEMA',
            error instanceof Error
              ? error.message
              : 'Google Ads geo target constant evidence is invalid.',
          );
        }

        normalizationOptions = {
          geo_target_constants: geoTargetConstants,
        };
      }
    } else {
      try {
        rows = flattenGoogleAdsSearchStream(body);
      } catch (error) {
        return failure(
          'INVALID_SCHEMA',
          error instanceof Error
            ? error.message
            : 'Google Ads configuration SearchStream envelope is invalid.',
        );
      }
    }

    let normalizedRows:
      GoogleAdsConfigurationNormalizedRow[];

    try {
      normalizedRows =
        normalizeGoogleAdsConfigurationRows(
          jobContext.dataset_type,
          rows,
          normalizationOptions,
        );
    } catch (error) {
      return failure(
        'QUERY_MISMATCH',
        error instanceof Error
          ? error.message
          : 'Google Ads configuration row semantics are invalid.',
      );
    }

    if (
      jobContext.dataset_type
        === 'CUSTOMER_CONVERSION_TRACKING_SETTINGS'
    ) {
      if (normalizedRows.length !== 1) {
        return failure(
          'QUERY_MISMATCH',
          'Google Ads customer conversion tracking settings must contain exactly one normalized row.',
        );
      }

      return {
        validation_status: 'VALID',
        checks_total: 5,
        checks_passed: 5,
        checks_warning: 0,
        checks_failed: 0,
        findings: [],
        validated_metadata: validatedMetadata(),
      };
    }

    if (normalizedRows.length === 0) {
      return {
        validation_status: 'NO_DATA',
        checks_total: 5,
        checks_passed: 5,
        checks_warning: 0,
        checks_failed: 0,
        findings: [],
        validated_metadata: validatedMetadata(),
      };
    }

    return {
      validation_status: 'VALID',
      checks_total: 5,
      checks_passed: 5,
      checks_warning: 0,
      checks_failed: 0,
      findings: [],
      validated_metadata: validatedMetadata(),
    };
  }
}
