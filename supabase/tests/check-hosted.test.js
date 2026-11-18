// Checks check-hosted.js, which says which SQL files a Supabase project has. It runs it against
// the stand-in, which has every file, and against a made up project that answers like the
// hosted one does with only some of them.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';
import { ANON_KEY, startStandIn } from './stand-in.js';

const run = promisify(execFile);
const script = new URL('./check-hosted.js', import.meta.url).pathname;

/** Runs check-hosted.js against a project and gives its exit code and what it printed. */
async function check(url, key = ANON_KEY) {
  const env = { ...process.env, SUPABASE_URL: url, SUPABASE_ANON_KEY: key };
  try {
    const { stdout } = await run(process.execPath, [script], { env });
    return { code: 0, out: stdout };
  } catch (err) {
    if (typeof err.code !== 'number') throw err;
    return { code: err.code, out: `${err.stdout}${err.stderr}` };
  }
}

/**
 * A made up project that only knows the tables and columns it's given, and answers the way
 * PostgREST does: PGRST205 for a table it doesn't have and 42703 for a column it doesn't have.
 * It has no functions, so it answers PGRST202 for each one. edge-com isn't deployed on it.
 */
async function fakeProject(tables) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const answer = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname.startsWith('/functions/v1/')) return answer(404, { code: 'NOT_FOUND' });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return answer(404, { code: 'PGRST202' });
    const table = url.pathname.slice('/rest/v1/'.length);
    const column = url.searchParams.get('select');
    if (!tables[table]) return answer(404, { code: 'PGRST205' });
    if (column !== '*' && !tables[table].includes(column)) return answer(400, { code: '42703' });
    return answer(200, []);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

// What 001 makes, as far as the checks look
const only001 = {
  species: ['id'],
  records: ['id'],
  iot_nodes: ['node_id'],
  observations: ['id'],
};

let standIn;

before(async () => {
  standIn = await startStandIn({ port: 0, log: () => {} });
});

after(() => standIn.close());

test('the stand-in has every file, with edge-com deployed the right way', async () => {
  const { code, out } = await check(standIn.url);
  assert.equal(code, 0, out);
  assert.match(out, /^028 +in$/m);
  assert.match(out, /^029 +in$/m);
  // 019 can't be seen from outside, but 029 can't be in without it
  assert.match(out, /^019 +in \(029 is in and needs it\)$/m);
  assert.match(out, /edge-com deployed, with JWT verification off/);
  assert.match(out, /Every SQL file is in\./);
});

test("a stand-in with the files up to 015 gets 015 again, because it can't be seen", async () => {
  const behind = await startStandIn({ port: 0, log: () => {}, sqlThrough: '015' });
  try {
    const { code, out } = await check(behind.url);
    assert.equal(code, 1, out);
    assert.match(out, /^012 +in \(014 is in and needs it\)$/m);
    assert.match(out, /^015 +can't tell from outside$/m);
    assert.match(out, /^016_1 +missing$/m);
    assert.match(out, /edge-com not deployed/);
    assert.match(out, /in this order: 015, 016_1, 016_2, /);
  } finally {
    behind.close();
  }
});

test('a project with only 001 and 002 gets every file from 003 on, and not 002 again', async () => {
  const project = await fakeProject(only001);
  try {
    const { code, out } = await check(project.url);
    assert.equal(code, 1, out);
    assert.match(out, /^001 +in$/m);
    assert.match(out, /^003 +missing$/m);
    assert.match(out, /^007 +missing \(it needs 006 first\)$/m);
    assert.match(out, /edge-com not deployed/);
    const list = out.match(/in this order: (.*)\./)[1].split(', ');
    assert.equal(list[0], '003');
    assert.equal(list.at(-1), '029');
    assert.ok(!list.includes('002'));
    assert.equal(list.length, 29);
  } finally {
    project.close();
  }
});

test('a later file without the ones before it is pointed out', async () => {
  // Someone ran 026 by hand on a project that only had 001 and 002
  const project = await fakeProject({ ...only001, iot_alerts: ['dispatched_at'] });
  try {
    const { code, out } = await check(project.url);
    assert.equal(code, 1, out);
    assert.match(out, /Missing even though a later file is in: 003, 004/);
    assert.match(out, /Look at it by hand/);
  } finally {
    project.close();
  }
});

test("a key the project turns down, or a project it can't reach, exits with 2", async () => {
  const wrongKey = await check(standIn.url, 'not-the-key');
  assert.equal(wrongKey.code, 2, wrongKey.out);
  assert.match(wrongKey.out, /the key was turned down/);

  const project = await fakeProject(only001);
  project.close();
  const gone = await check(project.url);
  assert.equal(gone.code, 2, gone.out);
  assert.match(gone.out, /Couldn't reach/);
});
