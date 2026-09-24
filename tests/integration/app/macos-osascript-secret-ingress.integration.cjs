const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { PassThrough, Writable } = require('node:stream');

const buildRoot = process.argv[2];
const projectRoot = process.argv[3];
if (!buildRoot || !projectRoot) {
  throw new Error('Expected compiled build root and project root arguments.');
}

const {
  MacOsascriptSecretIngress,
  createRunOsaScript,
} = require(path.join(
  buildRoot,
  'main',
  'app',
  'macos-osascript-secret-ingress.js',
));

const syntheticKey = 'rr_test_only_key_0123456789';
const submittedPrefix = 'ROOFROOM_SECRET_SUBMITTED:';
const cancelSentinel = 'ROOFROOM_SECRET_CANCELLED';

const processResult = (overrides = {}) => ({
  exit_code: 0,
  signal: null,
  stdout: Buffer.from(`${submittedPrefix}${syntheticKey}\n`),
  stderr_bytes: 0,
  timed_out: false,
  overflowed: false,
  ...overrides,
});

const capturedConsoleCalls = [];
const originalConsole = {};
for (const method of ['log', 'error', 'warn', 'debug']) {
  originalConsole[method] = console[method];
  console[method] = (...values) => capturedConsoleCalls.push([method, values]);
}

const makeChild = () => {
  const child = new EventEmitter();
  const stdinChunks = [];
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinChunks.push(Buffer.from(chunk));
      callback();
    },
  });
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killCalls = [];
  child.kill = (signal) => {
    child.killCalls.push(signal);
    return true;
  };
  child.stdinText = () => Buffer.concat(stdinChunks).toString('utf8');
  return child;
};

const baseRunRequest = (script = 'fixed script') => ({
  executable: '/usr/bin/osascript',
  argv: [],
  shell: false,
  script,
  timeout_ms: 120000,
  max_output_bytes: 1024,
});

const main = async () => {
  const calls = [];
  const ingress = new MacOsascriptSecretIngress(async (request) => {
    calls.push(request);
    return processResult();
  });
  assert.deepEqual(
    await ingress.requestSecret({ purpose: 'SERPAPI_API_KEY' }),
    { status: 'SUBMITTED', secret: syntheticKey },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, '/usr/bin/osascript');
  assert.deepEqual(calls[0].argv, []);
  assert.equal(calls[0].shell, false);
  assert.equal(calls[0].timeout_ms, 120000);
  assert.equal(calls[0].max_output_bytes, 1024);
  assert.match(calls[0].script, /with hidden answer/);
  assert.equal(calls[0].script.includes(syntheticKey), false);

  const googlePrompts = [
    ['GOOGLE_OAUTH_CLIENT_ID', /Google OAuth Client ID/],
    ['GOOGLE_OAUTH_CLIENT_SECRET', /Google OAuth Client Secret/],
    ['GOOGLE_ADS_DEVELOPER_TOKEN', /Google Ads Developer Token/],
  ];
  for (const [purpose, expectedPrompt] of googlePrompts) {
    let promptRequest;
    const googleIngress = new MacOsascriptSecretIngress(async (request) => {
      promptRequest = request;
      return processResult();
    });
    assert.deepEqual(
      await googleIngress.requestSecret({ purpose }),
      { status: 'SUBMITTED', secret: syntheticKey },
    );
    assert.match(promptRequest.script, expectedPrompt);
    assert.match(promptRequest.script, /with hidden answer/);
    assert.deepEqual(promptRequest.argv, []);
    assert.equal(promptRequest.script.includes(syntheticKey), false);
  }

  const cancellation = new MacOsascriptSecretIngress(async () => processResult({
    stdout: Buffer.from(`${cancelSentinel}\n`),
  }));
  assert.deepEqual(
    await cancellation.requestSecret({ purpose: 'SERPAPI_API_KEY' }),
    { status: 'CANCELLED' },
  );

  const unavailable = new MacOsascriptSecretIngress(async () => {
    throw new Error(`raw-spawn-error-${syntheticKey}`);
  });
  assert.deepEqual(
    await unavailable.requestSecret({ purpose: 'SERPAPI_API_KEY' }),
    { status: 'FAILED', code: 'PROCESS_UNAVAILABLE' },
  );

  const failureCases = [
    ['timeout', { timed_out: true }, 'TIMED_OUT'],
    ['overflow', { overflowed: true }, 'OUTPUT_LIMIT_EXCEEDED'],
    ['signal', { exit_code: null, signal: 'SIGTERM' }, 'PROCESS_FAILED'],
    ['non-zero exit', { exit_code: 1 }, 'PROCESS_FAILED'],
    ['stderr on success', { stderr_bytes: 1 }, 'INVALID_OUTPUT'],
    ['unknown sentinel', { stdout: Buffer.from('UNKNOWN\n') }, 'INVALID_OUTPUT'],
    [
      'duplicate protocol lines',
      { stdout: Buffer.from(`${submittedPrefix}${syntheticKey}\n${cancelSentinel}\n`) },
      'INVALID_OUTPUT',
    ],
  ];
  for (const [label, overrides, code] of failureCases) {
    const candidate = new MacOsascriptSecretIngress(
      async () => processResult(overrides),
    );
    assert.deepEqual(
      await candidate.requestSecret({ purpose: 'SERPAPI_API_KEY' }),
      { status: 'FAILED', code },
      label,
    );
  }

  {
    const child = makeChild();
    let spawnCall;
    const run = createRunOsaScript((executable, argv, options) => {
      spawnCall = { executable, argv, options };
      queueMicrotask(() => {
        child.stdout.write(Buffer.from(submittedPrefix.slice(0, 12)));
        child.stdout.write(Buffer.from(submittedPrefix.slice(12)));
        child.stdout.write(Buffer.from(syntheticKey));
        child.stdout.write(Buffer.from('\n'));
        child.emit('close', 0, null);
      });
      return child;
    });
    const result = await run(baseRunRequest('fixed-stdin-script'));
    assert.equal(spawnCall.executable, '/usr/bin/osascript');
    assert.deepEqual(spawnCall.argv, []);
    assert.deepEqual(spawnCall.options, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.equal(child.stdinText(), 'fixed-stdin-script');
    assert.equal(result.stdout.toString('utf8'), `${submittedPrefix}${syntheticKey}\n`);
    assert.equal(result.stderr_bytes, 0);
    assert.equal(result.timed_out, false);
    assert.equal(result.overflowed, false);
    assert.deepEqual(child.killCalls, []);
  }

  {
    const child = makeChild();
    const run = createRunOsaScript(() => {
      queueMicrotask(() => {
        child.stdout.write(Buffer.alloc(1025, 0x61));
        child.emit('error', new Error(`late-${syntheticKey}`));
        child.emit('close', 1, 'SIGTERM');
      });
      return child;
    });
    const result = await run(baseRunRequest());
    assert.equal(result.overflowed, true);
    assert.equal(result.timed_out, false);
    assert.deepEqual(child.killCalls, ['SIGTERM']);
  }

  {
    const child = makeChild();
    const run = createRunOsaScript(() => {
      queueMicrotask(() => {
        child.stdout.write(Buffer.from('é'.repeat(513), 'utf8'));
        child.emit('close', 0, null);
      });
      return child;
    });
    const result = await run(baseRunRequest());
    assert.equal(result.overflowed, true, 'multibyte output uses byte cap');
    assert.deepEqual(child.killCalls, ['SIGTERM']);
  }

  {
    const child = makeChild();
    const run = createRunOsaScript(() => {
      queueMicrotask(() => {
        child.stderr.write(Buffer.alloc(1025, 0x62));
        child.emit('close', 0, null);
      });
      return child;
    });
    const result = await run(baseRunRequest());
    assert.equal(result.overflowed, true, 'stderr has an independent byte cap');
    assert.deepEqual(child.killCalls, ['SIGTERM']);
  }

  {
    const child = makeChild();
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    global.setTimeout = (callback) => {
      callback();
      return { test_timer: true };
    };
    global.clearTimeout = () => {};
    try {
      const run = createRunOsaScript(() => {
        queueMicrotask(() => {
          child.emit('error', new Error(`late-${syntheticKey}`));
          child.emit('close', 1, 'SIGTERM');
        });
        return child;
      });
      const result = await run(baseRunRequest());
      assert.equal(result.timed_out, true);
      assert.equal(result.overflowed, false);
      assert.deepEqual(child.killCalls, ['SIGTERM']);
    } finally {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  }

  {
    const child = makeChild();
    const run = createRunOsaScript(() => {
      queueMicrotask(() => {
        child.stdin.emit('error', new Error(`stdin-${syntheticKey}`));
        child.emit('close', 1, 'SIGTERM');
      });
      return child;
    });
    await assert.rejects(
      run(baseRunRequest()),
      (error) => {
        assert.equal(
          error.message,
          'The native secret-ingress process is unavailable.',
        );
        assert.equal(error.message.includes(syntheticKey), false);
        return true;
      },
    );
    assert.deepEqual(
      child.killCalls,
      ['SIGTERM'],
      'stdin failure terminates the native child before settling',
    );
  }

  const sourcePaths = [
    path.join(projectRoot, 'src', 'main', 'core', 'secret-ingress.ts'),
    path.join(projectRoot, 'src', 'main', 'app', 'macos-osascript-secret-ingress.ts'),
  ];
  for (const sourcePath of sourcePaths) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const forbidden of [
      'clipboard',
      'writeFile',
      'mkdtemp',
      'tmpdir',
    ]) {
      assert.equal(source.includes(forbidden), false, `${sourcePath}: ${forbidden}`);
    }
  }
  const adapterSource = fs.readFileSync(sourcePaths[1], 'utf8');
  assert.equal(adapterSource.includes("['-e'"), false);
  assert.equal(adapterSource.includes('`-e'), false);

  const serializedConsole = JSON.stringify(capturedConsoleCalls);
  assert.equal(serializedConsole.includes(syntheticKey), false);
  assert.equal(serializedConsole.includes('raw-spawn-error'), false);
  assert.equal(capturedConsoleCalls.length, 0);
};

main()
  .then(() => {
    for (const method of Object.keys(originalConsole)) {
      console[method] = originalConsole[method];
    }
    console.log(
      'PASS MACOS-OSASCRIPT-SECRET-INGRESS-001: native secret ingress uses fixed bounded private pipes and safe outcomes',
    );
  })
  .catch((error) => {
    for (const method of Object.keys(originalConsole)) {
      console[method] = originalConsole[method];
    }
    throw error;
  });
