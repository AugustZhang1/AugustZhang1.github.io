/*
 * Gold-set regression for the exact scorer used by index.html.
 * The script runs the page's marked decode/cosine/scoring source in a Node VM;
 * there is intentionally no second implementation of ranking or tokenization.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GOLD = [
  ['python', ['league', 'minecraft', 'rag', 'audiobook', 'jobapply', 'clerk'], ['league', 'minecraft', 'rag', 'audiobook', 'jobapply', 'clerk']],
  ['lidar', ['senseway'], ['senseway']],
  ['react', ['sinai', 'arkproject'], ['sinai', 'arkproject', 'clerk', 'league', 'ark-eagle']],
  ['python postgres', ['rag'], ['rag', 'senseway', 'arbitrage', 'arkproject', 'ark-eagle', 'league', 'clerk', 'audiobook', 'minecraft', 'jobapply']],
  ['database', ['arbitrage', 'senseway'], ['arbitrage', 'senseway', 'arkproject', 'medihub', 'ark-eagle', 'rag', 'league']],
  ['machine learning', ['league'], ['league', 'rag', 'minecraft', 'jobapply', 'clerk', 'audiobook']],
  ['mobile app', ['medihub'], ['medihub', 'ark-eagle', 'senseway', 'arkproject']],
  ['chrome extension', ['reels', 'jobapply'], ['reels', 'pet', 'jobapply']],
  ['testing', ['sinai'], ['sinai', 'rag', 'clerk', 'ark-eagle']],
  ['llm', ['rag'], ['rag', 'minecraft', 'clerk', 'jobapply', 'league']],
  ['payments', ['sinai'], ['sinai']],
  ['websocket', ['senseway'], ['senseway']],
  ['xyzzy', [], []],
  ['a', [], []],
];

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const payloadSource = fs.readFileSync(path.join(root, 'embeddings.js'), 'utf8');
const between = (start, end) => {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Could not extract ${start}`);
  return html.slice(a + start.length, b);
};
const chunksSource = between('  const CHUNKS = ', '\n  ];') + ']';
const metaSource = between('  const META = ', '\n  };\n\n  //') + '}';
const decodeSource = between('  // EMBEDDING_DECODE_BEGIN\n', '  // EMBEDDING_DECODE_END');
const cosineSource = between('  // SEARCH_COSINE_BEGIN\n', '  // SEARCH_COSINE_END');
const scorerSource = between('  // SEARCH_SCORER_BEGIN\n', '  // SEARCH_SCORER_END');

const context = vm.createContext({
  window: {},
  atob: value => Buffer.from(value, 'base64').toString('latin1'),
  console,
});
vm.runInContext(payloadSource, context, { filename: 'embeddings.js' });
vm.runInContext(`const CHUNKS = ${chunksSource}; const META = ${metaSource}; globalThis.__CHUNKS = CHUNKS;`, context, { filename: 'galaxy-data.js' });
vm.runInContext(decodeSource, context, { filename: 'galaxy-decode.js' });
vm.runInContext(cosineSource, context, { filename: 'galaxy-cosine.js' });
vm.runInContext(scorerSource, context, { filename: 'galaxy-search.js' });

const rows = GOLD.map(([query]) => {
  const hits = vm.runInContext(`scoreQuery(${JSON.stringify(query)})`, context);
  return {
    query,
    hits: hits.map(hit => ({ id: context.__CHUNKS[hit.i].id, project: context.__CHUNKS[hit.i].project, score: hit.score })),
  };
});
console.log(rows.map(row => `${row.query}\t${row.hits.map(h => `${h.project}/${h.id}:${h.score.toFixed(2)}`).join(' ') || '(none)'}`).join('\n'));

const size = Buffer.byteLength(payloadSource);
assert.ok(size <= 300 * 1024, `embeddings.js exceeds 300 KB: ${size}`);
for (let i = 0; i < GOLD.length; i++) {
  const [query, must, allowed] = GOLD[i];
  const hits = rows[i].hits;
  assert.ok(hits.length <= 8, `${query}: more than eight hits`);
  const counts = new Map();
  for (const hit of hits) {
    assert.ok(Number.isFinite(hit.score), `${query}: non-finite score`);
    counts.set(hit.project, (counts.get(hit.project) || 0) + 1);
    assert.ok(allowed.includes(hit.project), `${query}: disallowed ${hit.project}`);
  }
  for (const [project, count] of counts) assert.ok(count <= 1, `${query}: >1 chunk for ${project}`);
  for (const project of must) assert.ok(counts.has(project), `${query}: missing required ${project}`);
  if (!must.length) assert.equal(hits.length, 0, `${query}: expected no hits`);
}
console.log(`embeddings.js ${size} bytes; ${rows.length} gold queries passed`);
