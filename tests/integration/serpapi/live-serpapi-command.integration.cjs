const assert = require('node:assert/strict');
const path = require('node:path');
const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');
const command = require(path.join(buildRoot, 'scripts/m3/live-serpapi-smoke.js'));
assert.throws(() => command.requireSerpApiLiveSmokeConfirmation([]), /Refusing live SerpApi request/u);
assert.throws(() => command.requireSerpApiLiveSmokeConfirmation(['--confirm-live-serpapi']), /--workspace=/u);
assert.deepEqual(command.requireSerpApiLiveSmokeConfirmation(['--help']), {
  help: true,
  confirmed: false,
  query: 'ficus çeşitleri',
  workspace_id: null,
});
assert.throws(() => command.parseSerpApiLiveSmokeArguments(['--confirm-live-serpapi', '--retry']), /Unsupported argument/u);
console.log('PASS SERPAPI-LIVE-CMD-001: unconfirmed or unbounded live SerpApi smoke exits before Electron/provider activity');
