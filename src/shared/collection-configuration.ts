import type { JsonObject } from './run-job';

export type ReusableCollectionConfiguration = JsonObject;

export interface SavedCollectionPresetRecord {
  preset_id: string;
  workspace_id: string;
  preset_name: string;
  reusable_configuration: ReusableCollectionConfiguration;
  created_at: string;
  updated_at: string;
}

export interface LastRunSettingsRecord {
  workspace_id: string;
  reusable_configuration: ReusableCollectionConfiguration;
  updated_at: string;
}

export type RunDraftOrigin =
  | { kind: 'BLANK' }
  | { kind: 'SAVED_PRESET'; preset_id: string }
  | { kind: 'LAST_RUN_SETTINGS' };

export interface RunDraft {
  workspace_id: string;
  origin: RunDraftOrigin;
  reusable_configuration: ReusableCollectionConfiguration;
}
