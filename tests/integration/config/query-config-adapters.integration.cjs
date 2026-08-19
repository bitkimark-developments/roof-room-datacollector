const assert = require(
  'node:assert/strict',
);
const fs = require(
  'node:fs',
);
const path = require(
  'node:path',
);

const [
  buildRoot,
  tempRoot,
] = process.argv.slice(2);

if (
  !buildRoot ||
  !tempRoot
) {
  throw new Error(
    'Expected compiled build root and temp root.',
  );
}

const {
  ensureExternalQueryConfig,
  loadQueryConfig,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'config',
    'query-config-loader.js',
  ),
);

const yamlSource = `version: 1
source: google-trends
groups:
  - id: GT01
    name: first_group
    queries:
      - first query
      - second, quoted query
  - id: GT02
    name: second_group
    queries:
      - repeated query
`;

const jsonSource = JSON.stringify(
  {
    version:
      1,
    source:
      'google-trends',
    groups: [
      {
        id:
          'GT01',
        name:
          'first_group',
        queries: [
          'first query',
          'second, quoted query',
        ],
      },
      {
        id:
          'GT02',
        name:
          'second_group',
        queries: [
          'repeated query',
        ],
      },
    ],
  },
  null,
  2,
);

const csvSource = `version,source,group_id,group_name,query_order,query
1,google-trends,GT01,first_group,1,first query
1,google-trends,GT01,first_group,2,"second, quoted query"
1,google-trends,GT02,second_group,1,repeated query
`;

const write = (
  filename,
  source,
) => {
  const filePath =
    path.join(
      tempRoot,
      filename,
    );

  fs.writeFileSync(
    filePath,
    source,
    'utf8',
  );

  return filePath;
};

const main = async () => {
  fs.mkdirSync(
    tempRoot,
    {
      recursive:
        true,
    },
  );

  const yaml =
    await loadQueryConfig(
      write(
        'query-groups.yaml',
        yamlSource,
      ),
    );
  const json =
    await loadQueryConfig(
      write(
        'query-groups.json',
        jsonSource,
      ),
    );
  const csv =
    await loadQueryConfig(
      write(
        'query-groups.csv',
        csvSource,
      ),
    );

  assert.deepEqual(
    json,
    yaml,
  );
  assert.deepEqual(
    csv,
    yaml,
  );
  assert.deepEqual(
    csv.groups[0]
      .queries,
    [
      'first query',
      'second, quoted query',
    ],
  );

  console.log(
    'PASS CFG-008..010: YAML, JSON, and RFC-style CSV adapters normalize to one ordered QueryConfig contract',
  );

  await assert.rejects(
    loadQueryConfig(
      write(
        'query-groups.txt',
        yamlSource,
      ),
    ),
    /Unsupported query configuration extension/,
  );

  await assert.rejects(
    loadQueryConfig(
      write(
        'invalid-order.csv',
        csvSource.replace(
          ',2,"second, quoted query"',
          ',3,"second, quoted query"',
        ),
      ),
    ),
    /contiguous from 1/,
  );

  console.log(
    'PASS CFG-011: unknown formats and ambiguous/non-contiguous CSV semantics fail closed',
  );

  const discoveryRoot =
    path.join(
      tempRoot,
      'discovery',
    );
  const configDirectory =
    path.join(
      discoveryRoot,
      'app-data',
      'config',
    );
  const packagedRoot =
    path.join(
      discoveryRoot,
      'packaged',
    );

  fs.mkdirSync(
    configDirectory,
    {
      recursive:
        true,
    },
  );
  fs.mkdirSync(
    path.join(
      packagedRoot,
      'config',
    ),
    {
      recursive:
        true,
    },
  );
  fs.writeFileSync(
    path.join(
      packagedRoot,
      'config',
      'query-groups.yaml',
    ),
    yamlSource,
    'utf8',
  );

  const directories = {
    config:
      configDirectory,
  };

  const defaultPath =
    await ensureExternalQueryConfig(
      directories,
      packagedRoot,
    );

  assert.equal(
    path.basename(
      defaultPath,
    ),
    'query-groups.yaml',
  );

  fs.unlinkSync(
    defaultPath,
  );
  fs.writeFileSync(
    path.join(
      configDirectory,
      'query-groups.json',
    ),
    jsonSource,
    'utf8',
  );

  const discoveredJson =
    await ensureExternalQueryConfig(
      directories,
      packagedRoot,
    );

  assert.equal(
    path.basename(
      discoveredJson,
    ),
    'query-groups.json',
  );

  fs.writeFileSync(
    path.join(
      configDirectory,
      'query-groups.csv',
    ),
    csvSource,
    'utf8',
  );

  await assert.rejects(
    ensureExternalQueryConfig(
      directories,
      packagedRoot,
    ),
    /Multiple query configuration files found/,
  );

  console.log(
    'PASS CFG-012: external config discovery supports one YAML/JSON/CSV file and rejects ambiguous multiple authorities',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
