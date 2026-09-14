import { useEffect, useState } from 'react';
import type {
  DesktopReview,
  DesktopRunDraft,
  DesktopRunState,
  DesktopWorkspaceView,
} from './shared/desktop-multisource';
import type {
  SavedCollectionPresetRecord,
} from './shared/collection-configuration';

const NAV_ITEMS = ['HOME', 'RUNS', 'PRESETS', 'WORKSPACE'] as const;
type View = (typeof NAV_ITEMS)[number] | 'SETUP' | 'REVIEW' | 'PROGRESS' | 'RESULT';

export function DesktopMultiSourceView() {
  const [section, setSection] = useState<View>('HOME');
  const [workspace, setWorkspace] = useState<DesktopWorkspaceView | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [presets, setPresets] = useState<SavedCollectionPresetRecord[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [draft, setDraft] = useState<DesktopRunDraft | null>(null);
  const [review, setReview] = useState<DesktopReview | null>(null);
  const [runState, setRunState] = useState<DesktopRunState | null>(null);
  const [message, setMessageValue] = useState<string | null>(null);
  const [messageTone, setMessageTone] =
    useState<'danger' | 'success'>('danger');

  const setMessage = (
    value: string | null,
    tone: 'danger' | 'success' = 'danger',
  ) => {
    setMessageTone(tone);
    setMessageValue(value);
  };
  const [busy, setBusy] = useState(false);
  const [newPresetName, setNewPresetName] =
    useState('Blog-Agentic-Beklentisi');

  useEffect(() => {
    let mounted = true;

    window.roofroom.getDesktopWorkspaces()
      .then((value) => {
        if (!mounted) return;
        setWorkspace(value);
        setSelectedWorkspaceId(
          value.selected_workspace_id
          ?? value.workspaces[0]?.workspace_id
          ?? '',
        );
      })
      .catch((error) => {
        if (!mounted) return;
        setMessage(
          error instanceof Error
            ? error.message
            : 'Workspace bilgisi okunamadı.',
        );
      });

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!selectedWorkspaceId) {
      setPresets([]);
      setSelectedPresetId('');
      return () => { mounted = false; };
    }

    window.roofroom.getDesktopPresets(selectedWorkspaceId)
      .then((value) => {
        if (!mounted) return;
        setPresets(value);
        setSelectedPresetId(value[0]?.preset_id ?? '');
      })
      .catch((error) => {
        if (!mounted) return;
        setPresets([]);
        setSelectedPresetId('');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Preset listesi okunamadı.',
        );
      });

    return () => { mounted = false; };
  }, [selectedWorkspaceId]);

  useEffect(() => {
    const runId = runState?.run.run_id;

    if (section !== 'PROGRESS' || !runId) {
      return;
    }

    let mounted = true;

    const refresh = async () => {
      try {
        const next = await window.roofroom.getDesktopRunState(runId);
        if (!mounted) return;

        setRunState(next);

        if (
          next.jobs.length > 0
          && next.completed_jobs + next.failed_jobs >= next.jobs.length
        ) {
          setSection('RESULT');
        }
      } catch (error) {
        if (!mounted) return;
        setMessage(
          error instanceof Error
            ? error.message
            : 'Run durumu okunamadı.',
        );
      }
    };

    void refresh();

    const timer = window.setInterval(
      () => { void refresh(); },
      1000,
    );

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [section, runState?.run.run_id]);

  const selectBase = async (kind: 'BLANK' | 'LAST_RUN_SETTINGS' | 'SAVED_PRESET') => {
    const workspaceId = selectedWorkspaceId;
    if (!workspaceId) { setMessage('Önce bir Workspace seçin.'); return; }
    try {
      let origin: import('./shared/collection-configuration').RunDraftOrigin = kind === 'BLANK'
        ? { kind: 'BLANK' }
        : { kind: 'LAST_RUN_SETTINGS' };
      if (kind === 'SAVED_PRESET') {
        if (!selectedPresetId) {
          setMessage('Bu Workspace için seçilebilir Saved Preset yok.');
          return;
        }
        origin = { kind, preset_id: selectedPresetId };
      }
      const next = await window.roofroom.createDesktopDraft({ workspace_id: workspaceId, origin });
      setDraft(next); setReview(null); setSection('SETUP');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Draft oluşturulamadı.'); }
  };

  const createPreset = async () => {
    if (!selectedWorkspaceId || busy) return;

    const presetName = newPresetName.trim();

    if (!presetName) {
      setMessage('Preset adı boş olamaz.');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const created =
        await window.roofroom.createDesktopPreset({
          workspace_id: selectedWorkspaceId,
          preset_name: presetName,
          reusable_configuration: {
            sources: {},
          },
        });

      const next =
        await window.roofroom.getDesktopPresets(
          selectedWorkspaceId,
        );

      setPresets(next);
      setSelectedPresetId(created.preset_id);
      setMessage(
        `Preset kaydedildi: ${created.preset_name}`,
        'success',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Preset kaydedilemedi.',
      );
    } finally {
      setBusy(false);
    }
  };

  const deletePreset = async (
    preset: SavedCollectionPresetRecord,
  ) => {
    if (busy) return;

    const confirmed = window.confirm(
      `"${preset.preset_name}" presetini silmek istiyor musunuz?`,
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage(null);

    try {
      await window.roofroom.deleteDesktopPreset({
        workspace_id: preset.workspace_id,
        preset_id: preset.preset_id,
      });

      const next =
        await window.roofroom.getDesktopPresets(
          preset.workspace_id,
        );

      setPresets(next);

      if (selectedPresetId === preset.preset_id) {
        setSelectedPresetId(
          next[0]?.preset_id ?? '',
        );
      }

      setMessage(
        `Preset silindi: ${preset.preset_name}`,
        'success',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Preset silinemedi.',
      );
    } finally {
      setBusy(false);
    }
  };

  const reviewDraft = async () => { if (!draft) return; try { setReview(await window.roofroom.reviewDesktopDraft(draft)); setSection('REVIEW'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Review okunamadı.'); } };
  const startDraft = async () => { if (!draft) return; try { const next = await window.roofroom.startDesktopDraft(draft); setRunState(next); setSection('PROGRESS'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Run başlatılamadı.'); } };
  const retryFailed = async () => { if (!runState || busy) return; setBusy(true); try { setRunState(await window.roofroom.retryDesktopFailed(runState.run.run_id)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Retry başarısız.'); } finally { setBusy(false); } };
  const exportRun = async (mode: 'ALL' | 'SUCCESSFUL_ONLY') => { if (!runState || busy) return; setBusy(true); try { const result = await window.roofroom.exportDesktopRun({ run_id: runState.run.run_id, mode }); setMessage(`Paket hazır: ${result.export_directory}`, 'success'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Export başarısız.'); } finally { setBusy(false); } };

  return (
    <section className="multisource-shell" aria-label="Multi-source collection">
      <nav className="multisource-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button key={item} type="button" className={section === item ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </nav>
      {message && (
        <p
          className={`inline-alert ${messageTone}`}
          role="alert"
        >
          {message}
        </p>
      )}
      {section === 'HOME' && (
        <div className="multisource-home">
          <div>
            <p className="eyebrow">WORKSPACE COLLECTION</p>
            <h2>Birden fazla kaynaktan tek Run</h2>
            <p>Workspace seçin, kayıtlı bir Preset, Last Run veya Blank ile Setup’a geçin.</p>
          </div>
          <label>
            Workspace
            <select
              aria-label="Workspace"
              value={selectedWorkspaceId}
              onChange={(event) => {
                setSelectedWorkspaceId(event.target.value);
                setDraft(null);
                setReview(null);
                setRunState(null);
                setMessage(null);
              }}
            >
              <option value="">Workspace seçin</option>
              {workspace?.workspaces.map((item) => (
                <option key={item.workspace_id} value={item.workspace_id}>
                  {item.workspace_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Saved Preset
            <select
              aria-label="Saved Preset"
              value={selectedPresetId}
              disabled={presets.length === 0}
              onChange={(event) => setSelectedPresetId(event.target.value)}
            >
              {presets.length === 0 && (
                <option value="">Preset yok</option>
              )}
              {presets.map((preset) => (
                <option key={preset.preset_id} value={preset.preset_id}>
                  {preset.preset_name}
                </option>
              ))}
            </select>
          </label>

          <div className="base-choice" role="group" aria-label="Starting configuration">
            <button
              type="button"
              disabled={!selectedPresetId}
              onClick={() => void selectBase('SAVED_PRESET')}
            >
              Saved Preset
            </button>
            <button type="button" onClick={() => void selectBase('LAST_RUN_SETTINGS')}>Last Run</button>
            <button type="button" onClick={() => void selectBase('BLANK')}>Blank</button>
          </div>
        </div>
      )}
      {section === 'SETUP' && draft && <div><h3>Run Setup</h3>{draft.source_cards.map((card) => <label key={card.source_id}><input type="checkbox" checked={card.included} readOnly /> {card.source_name} · {card.readiness_status} · {card.configuration_summary}</label>)}<button type="button" onClick={() => void reviewDraft()}>Review</button></div>}
      {section === 'REVIEW' && review && <div><h3>Review</h3><p>Workspace: {review.workspace.workspace_name}</p><p>{review.included_sources.join(', ')} · {review.job_count} Jobs</p>{review.blocking_sources.length > 0 && <p role="alert">Hazır değil: {review.blocking_sources.join(', ')}</p>}<button type="button" disabled={!review.can_start} onClick={() => void startDraft()}>Start</button></div>}
      {section === 'PROGRESS' && runState && <div><h3>Progress</h3><p>{runState.run.run_status} · {runState.completed_jobs}/{runState.jobs.length} Jobs · {runState.failed_jobs} failed</p><button type="button" onClick={() => setSection('RESULT')}>Result</button></div>}
      {section === 'RESULT' && runState && <div><h3>Result</h3><p>{runState.failed_jobs > 0 ? 'Failed' : 'Success'}</p><p>Completed: {runState.completed_jobs} · Failed: {runState.failed_jobs}</p><button type="button" disabled={runState.failed_jobs === 0 || busy} onClick={() => void retryFailed()}>Retry Failed</button><button type="button" disabled={busy} onClick={() => void exportRun('ALL')}>Export All</button><button type="button" disabled={busy} onClick={() => void exportRun('SUCCESSFUL_ONLY')}>Export Successful Only</button></div>}
      {section === 'PRESETS' && (
        <div className="multisource-home">
          <div>
            <p className="eyebrow">SAVED PRESETS</p>
            <h2>Collection Presets</h2>
            <p>
              Presetler seçili Workspace içinde saklanır.
            </p>
          </div>

          <label>
            Workspace
            <select
              aria-label="Preset Workspace"
              value={selectedWorkspaceId}
              onChange={(event) =>
                setSelectedWorkspaceId(
                  event.target.value,
                )
              }
            >
              <option value="">
                Workspace seçin
              </option>
              {workspace?.workspaces.map((item) => (
                <option
                  key={item.workspace_id}
                  value={item.workspace_id}
                >
                  {item.workspace_name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <strong>Mevcut presetler</strong>
            {presets.length === 0 ? (
              <p>Henüz preset yok.</p>
            ) : (
              <ul>
                {presets.map((preset) => (
                  <li key={preset.preset_id}>
                    <span>{preset.preset_name}</span>{' '}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void deletePreset(preset)
                      }
                    >
                      Sil
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label>
            Yeni preset adı
            <input
              type="text"
              value={newPresetName}
              onChange={(event) =>
                setNewPresetName(
                  event.target.value,
                )
              }
            />
          </label>

          <button
            type="button"
            disabled={
              !selectedWorkspaceId
              || !newPresetName.trim()
              || busy
            }
            onClick={() => void createPreset()}
          >
            {busy
              ? 'Kaydediliyor…'
              : 'Preset Oluştur'}
          </button>
        </div>
      )}

      {section !== 'HOME'
        && section !== 'PRESETS'
        && !['SETUP', 'REVIEW', 'PROGRESS', 'RESULT'].includes(section)
        && (
          <p className="multisource-placeholder">
            {section} görünümü Workspace-scoped Core verilerini kullanır.
          </p>
        )}
    </section>
  );
}
