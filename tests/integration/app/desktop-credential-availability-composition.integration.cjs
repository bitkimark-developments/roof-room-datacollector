const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = process.argv[2];
if (!projectRoot) {
  throw new Error('Expected project root argument.');
}

const mainSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'main.ts'),
  'utf8',
);

const constructorStart = mainSource.indexOf(
  'new DesktopMultiSourceController({',
);
assert.notEqual(
  constructorStart,
  -1,
  'Expected DesktopMultiSourceController production construction in src/main.ts.',
);

const productionRuntimeStart = mainSource.indexOf(
  'const productionRuntime = createProductionCollectionRuntime({',
  constructorStart,
);
assert.notEqual(
  productionRuntimeStart,
  -1,
  'Expected production runtime construction after the desktop controller.',
);

const controllerComposition = mainSource.slice(
  constructorStart,
  productionRuntimeStart,
);

assert.match(
  controllerComposition,
  /credential_availability:\s*credentialStore/u,
  'Production DesktopMultiSourceController must receive the real credentialStore as credential_availability.',
);

console.log(
  'PASS DESKTOP-CREDENTIAL-AVAILABILITY-COMPOSITION-001: production desktop controller receives the real credential availability reader',
);
