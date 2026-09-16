const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DesktopMultiSourceController } = require(`${process.argv[2]}/main/app/desktop-multisource-controller.js`);

async function main() {
  const run = { run_id: 'rr_retry', workspace_id: 'ws_a', run_status: 'RETRY_REQUIRED', selected_sources: ['google-trends', 'serpapi'] };
  const failed = { job_id: 'job_failed', run_id: run.run_id, source_id: 'serpapi', job_key: 'q-2', execution_status: 'FAILED', validation_status: 'ERROR_NOT_DATA', attempt_count: 1, accepted_artifact_id: null };
  const accepted = { job_id: 'job_ok', run_id: run.run_id, source_id: 'google-trends', job_key: 'GT-01', execution_status: 'COMPLETED', validation_status: 'VALID', attempt_count: 1, accepted_artifact_id: 'art_ok' };
  const repository = {
    getRun: () => run,
    listJobs: () => [failed, accepted],
    listIncompleteRuns: () => [run],
    listAttempts: () => [],
    getArtifact: (id) => id === 'art_ok' ? { artifact_id: id, job_id: accepted.job_id, run_id: run.run_id, source_id: accepted.source_id, artifact_state: 'ACCEPTED' } : null,
    getJob: (id) => id === failed.job_id ? failed : accepted,
    reacquireRunAndStartRetryAttempt: () => { failed.execution_status = 'RUNNING'; failed.attempt_count = 2; return { attempt_id: 'att_2', attempt_number: 2 }; },
    reserveRunFromJobPlans: () => { throw new Error('unused'); },
  };
  const root = path.join(process.cwd(), '.tmp-desktop-package-fixture');
  fs.rmSync(root, { recursive: true, force: true });
  const controller = new DesktopMultiSourceController({ repository, readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) }, application_version: 'test', execute_run: async () => {}, execute_retry: async () => {}, package_directory: root, load_datasets: async () => [{ source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', rows: [{ query: 'ficus', value: null }] }, { source_id: 'serpapi', dataset_type: 'GOOGLE_SERP', rows: null, failure: { code: 'ERROR_NOT_DATA' } }] });
  const retried = await controller.retryFailed(run.run_id);
  assert.equal(retried.jobs.find((job) => job.job_id === failed.job_id).attempt_count, 2);
  assert.equal(retried.jobs.find((job) => job.job_id === accepted.job_id).attempt_count, 1);
  const all = await controller.exportRun(run.run_id, 'ALL');
  assert.equal(fs.existsSync(path.join(all.export_directory, 'MANIFEST.json')), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(all.export_directory, 'FAILURES.json'), 'utf8')).length, 1);
  const successful = await controller.exportRun(run.run_id, 'SUCCESSFUL_ONLY');
  assert.equal(fs.existsSync(path.join(successful.export_directory, 'serpapi_google_serp.json')), false);
  assert.equal(fs.existsSync(path.join(successful.export_directory, 'google-trends_interest_over_time.json')), true);
  fs.rmSync(root, { recursive: true, force: true });
  console.log('PASS DESKTOP-RETRY-EXPORT-001: generalized retry targets failed Job only and physical package modes remain source-separated');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
