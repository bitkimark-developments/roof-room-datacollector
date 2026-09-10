const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);

if (!buildRoot) {
  throw new Error('Expected compiled build root.');
}

const {
  CollectionValidatorRegistry,
} = require(
  path.join(
    buildRoot,
    'main',
    'core',
    'collection-validator-registry.js',
  ),
);

const validatorA = {
  async validate() {
    throw new Error(
      'Registry contract test does not invoke validation.',
    );
  },
};

const validatorB = {
  async validate() {
    throw new Error(
      'Registry contract test does not invoke validation.',
    );
  },
};

const registry =
  new CollectionValidatorRegistry();

registry.register(
  'fake-source-a',
  validatorA,
);
registry.register(
  'fake-source-b',
  validatorB,
);

assert.equal(
  registry.get('fake-source-a'),
  validatorA,
);
assert.equal(
  registry.get('fake-source-b'),
  validatorB,
);

assert.throws(
  () =>
    registry.register(
      'Fake Source',
      validatorA,
    ),
  (error) =>
    error.code === 'INVALID_SOURCE_ID',
);

assert.throws(
  () =>
    registry.register(
      'fake-source-a',
      validatorA,
    ),
  (error) =>
    error.code === 'DUPLICATE_SOURCE_ID',
);

assert.throws(
  () => registry.get('missing-source'),
  (error) =>
    error.code === 'UNKNOWN_SOURCE_ID',
);

console.log(
  'PASS VALIDATOR-REGISTRY-001: source-keyed validators register and unknown, duplicate, or invalid source IDs fail closed',
);
