export const ARTIFACT_KINDS = [
  'RAW_SOURCE_FILE',
  'METADATA_JSON',
  'VALIDATION_JSON',
  'NORMALIZED_CSV',
  'EXPORT_XLSX',
  'LOG_FILE',
] as const;

export type ArtifactKind =
  (typeof ARTIFACT_KINDS)[number];

export const ARTIFACT_STATES = [
  'CANDIDATE',
  'ACCEPTED',
  'ACCEPTED_WITH_WARNING',
  'REJECTED',
  'SUPERSEDED',
] as const;

export type ArtifactState =
  (typeof ARTIFACT_STATES)[number];

export interface ArtifactRecord {
  artifact_id: string;
  run_id: string;
  job_id: string;
  attempt_number: number;
  source_id: string;
  artifact_kind: ArtifactKind;
  artifact_state: ArtifactState;
  filename: string;
  relative_path: string;
  media_type: string;
  byte_size: number;
  sha256: string | null;
  created_at: string;
}

export const isArtifactKind = (
  value: unknown,
): value is ArtifactKind =>
  typeof value === 'string' &&
  (ARTIFACT_KINDS as readonly string[]).includes(value);

export const isArtifactState = (
  value: unknown,
): value is ArtifactState =>
  typeof value === 'string' &&
  (ARTIFACT_STATES as readonly string[]).includes(value);
