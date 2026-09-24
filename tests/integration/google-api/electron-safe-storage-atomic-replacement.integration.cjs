const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const {
  ElectronSafeStorageCredentialStore,
} = require(path.join(
  buildRoot,
  'main',
  'core',
  'electron-safe-storage-credential-store.js',
));

class MemoryFileSystem {
  files = new Map();
  operations = [];
  failNextRename = false;

  async mkdir(directory, options) {
    this.operations.push(['mkdir', directory, options]);
  }

  async readFile(filePath) {
    if (!this.files.has(filePath)) {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    }
    return this.files.get(filePath);
  }

  async writeFile(filePath, bytes, options) {
    this.operations.push(['write', filePath, Buffer.from(bytes), options]);
    this.files.set(filePath, Buffer.from(bytes));
  }

  async rename(from, to) {
    this.operations.push(['rename', from, to]);
    if (this.failNextRename) {
      this.failNextRename = false;
      throw new Error('synthetic rename failure');
    }
    this.files.set(to, this.files.get(from));
    this.files.delete(from);
  }

  async unlink(filePath) {
    this.operations.push(['unlink', filePath]);
    if (!this.files.delete(filePath)) {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    }
  }
}

const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`cipher:${Buffer.from(value).toString('base64url')}`),
  decryptString: (value) => Buffer.from(
    value.toString('utf8').slice('cipher:'.length),
    'base64url',
  ).toString('utf8'),
};

const main = async () => {
  const fileSystem = new MemoryFileSystem();
  let stagingSerial = 0;
  const store = new ElectronSafeStorageCredentialStore(
    '/fixture/credentials',
    encryption,
    fileSystem,
    () => `stage-${stagingSerial += 1}`,
  );

  await store.writeCredential('provider:google', 'synthetic-old-secret');
  assert.equal(await store.readCredential('provider:google'), 'synthetic-old-secret');
  const firstRename = fileSystem.operations.find(([kind]) => kind === 'rename');
  assert.match(firstRename[1], /\.stage-stage-1$/);
  assert.match(firstRename[2], /\.credential$/);

  fileSystem.failNextRename = true;
  await assert.rejects(
    () => store.writeCredential('provider:google', 'synthetic-new-secret'),
    /rename failure/,
  );
  assert.equal(
    await store.readCredential('provider:google'),
    'synthetic-old-secret',
    'Failed activation must preserve the previous encrypted credential file.',
  );
  assert.equal(
    [...fileSystem.files.keys()].some((filePath) => filePath.includes('stage-2')),
    false,
    'Failed staging files must be cleaned up.',
  );
  assert.equal(
    fileSystem.operations
      .filter(([kind]) => kind === 'write')
      .some(([, , bytes]) => bytes.toString('utf8').includes('synthetic-')),
    false,
    'Only encrypted bytes may be written to either staging or active files.',
  );

  console.log(
    'PASS ELECTRON-SAFE-STORAGE-ATOMIC-001: encrypted credential replacement activates atomically and preserves the prior value on failure',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
