import { useEffect, useState } from 'react';
import type { DesktopReview, DesktopRunDraft, DesktopRunState, DesktopWorkspaceView } from './shared/desktop-multisource';

const NAV_ITEMS = ['HOME', 'RUNS', 'PRESETS', 'WORKSPACE'] as const;
type View = (typeof NAV_ITEMS)[number] | 'SETUP' | 'REVIEW' | 'PROGRESS' | 'RESULT';

export function DesktopMultiSourceView() {
  const [section, setSection] = useState<View>('HOME');
  const [workspace, setWorkspace] = useState<DesktopWorkspaceView | null>(null);
  const [draft, setDraft] = useState<DesktopRunDraft | null>(null);
  const [review, setReview] = useState<DesktopReview | null>(null);
  const [runState, setRunState] = useState<DesktopRunState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    window.roofroom.getDesktopWorkspaces()
      .then((value) => { if (mounted) setWorkspace(value); })
      .catch(() => { /* legacy bootstrap may not compose generalized runtime yet */ });
    return () => { mounted = false; };
  }, []);

  const selectBase = async (kind: 'BLANK' | 'LAST_RUN_SETTINGS' | 'SAVED_PRESET') => {
    const workspaceId = workspace?.selected_workspace_id;
    if (!workspaceId) { setMessage('Önce bir Workspace seçin.'); return; }
    try {
      let origin: import('./shared/collection-configuration').RunDraftOrigin = kind === 'BLANK'
        ? { kind: 'BLANK' }
        : { kind: 'LAST_RUN_SETTINGS' };
      if (kind === 'SAVED_PRESET') {
        const presets = await window.roofroom.getDesktopPresets(workspaceId);
        const first = presets[0];
        if (!first) { setMessage('Bu Workspace için Saved Preset yok.'); return; }
        origin = { kind, preset_id: first.preset_id };
      }
      const next = await window.roofroom.createDesktopDraft({ workspace_id: workspaceId, origin });
      setDraft(next); setReview(null); setSection('SETUP');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Draft oluşturulamadı.'); }
  };

  const reviewDraft = async () => { if (!draft) return; try { setReview(await window.roofroom.reviewDesktopDraft(draft)); setSection('REVIEW'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Review okunamadı.'); } };
  const startDraft = async () => { if (!draft) return; try { const next = await window.roofroom.startDesktopDraft(draft); setRunState(next); setSection('PROGRESS'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Run başlatılamadı.'); } };
  const retryFailed = async () => { if (!runState || busy) return; setBusy(true); try { setRunState(await window.roofroom.retryDesktopFailed(runState.run.run_id)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Retry başarısız.'); } finally { setBusy(false); } };
  const exportRun = async (mode: 'ALL' | 'SUCCESSFUL_ONLY') => { if (!runState || busy) return; setBusy(true); try { const result = await window.roofroom.exportDesktopRun({ run_id: runState.run.run_id, mode }); setMessage(`Paket hazır: ${result.export_directory}`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Export başarısız.'); } finally { setBusy(false); } };

  return (
    <section className="multisource-shell" aria-label="Multi-source collection">
      <nav className="multisource-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button key={item} type="button" className={section === item ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </nav>
      {message && <p className="inline-alert danger" role="alert">{message}</p>}
      {section === 'HOME' && (
        <div className="multisource-home">
          <div>
            <p className="eyebrow">WORKSPACE COLLECTION</p>
            <h2>Birden fazla kaynaktan tek Run</h2>
            <p>Workspace seçin, kayıtlı bir Preset, Last Run veya Blank ile Setup’a geçin.</p>
          </div>
          <label>
            Workspace
            <select aria-label="Workspace" defaultValue={workspace?.selected_workspace_id ?? ''}>
              <option value="">Workspace seçin</option>
              {workspace?.workspaces.map((item) => <option key={item.workspace_id} value={item.workspace_id}>{item.workspace_name}</option>)}
            </select>
          </label>
          <div className="base-choice" role="group" aria-label="Starting configuration">
            <button type="button" onClick={() => void selectBase('SAVED_PRESET')}>Saved Preset</button>
            <button type="button" onClick={() => void selectBase('LAST_RUN_SETTINGS')}>Last Run</button>
            <button type="button" onClick={() => void selectBase('BLANK')}>Blank</button>
          </div>
        </div>
      )}
      {section === 'SETUP' && draft && <div><h3>Run Setup</h3>{draft.source_cards.map((card) => <label key={card.source_id}><input type="checkbox" checked={card.included} readOnly /> {card.source_name} · {card.configuration_summary}</label>)}<button type="button" onClick={() => void reviewDraft()}>Review</button></div>}
      {section === 'REVIEW' && review && <div><h3>Review</h3><p>Workspace: {review.workspace.workspace_name}</p><p>{review.included_sources.join(', ')} · {review.job_count} Jobs</p>{review.blocking_sources.length > 0 && <p role="alert">Hazır değil: {review.blocking_sources.join(', ')}</p>}<button type="button" disabled={!review.can_start} onClick={() => void startDraft()}>Start</button></div>}
      {section === 'PROGRESS' && runState && <div><h3>Progress</h3><p>{runState.run.run_status} · {runState.completed_jobs}/{runState.jobs.length} Jobs · {runState.failed_jobs} failed</p><button type="button" onClick={() => setSection('RESULT')}>Result</button></div>}
      {section === 'RESULT' && runState && <div><h3>Result</h3><p>{runState.failed_jobs > 0 ? 'Failed' : 'Success'}</p><p>Completed: {runState.completed_jobs} · Failed: {runState.failed_jobs}</p><button type="button" disabled={runState.failed_jobs === 0 || busy} onClick={() => void retryFailed()}>Retry Failed</button><button type="button" disabled={busy} onClick={() => void exportRun('ALL')}>Export All</button><button type="button" disabled={busy} onClick={() => void exportRun('SUCCESSFUL_ONLY')}>Export Successful Only</button></div>}
      {section !== 'HOME' && !['SETUP', 'REVIEW', 'PROGRESS', 'RESULT'].includes(section) && <p className="multisource-placeholder">{section} görünümü Workspace-scoped Core verilerini kullanır.</p>}
    </section>
  );
}
