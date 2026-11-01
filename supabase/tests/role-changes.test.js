// Checks 021: every role change is written down, nobody can change the list, and administrators
// can't remove each other and leave nobody. PGlite has one connection, so two people really acting
// at the same moment can't be run here. The tests get the same result by turning Row Level Security
// off for a moment, which lets a former admin reach the trigger the way they would if they'd asked
// just before someone removed them.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, test } from 'node:test';
import { SQL_FILES, addUser, asUser, newDatabase, readSql, selectAs } from './harness.js';

const FILE = '021_role_changes.sql';

let db;
let admin;
let otherAdmin;
let officer;
let visitor;

before(async () => {
  db = await newDatabase();
  admin = await addUser(db, { role: 'admin', name: 'First admin' });
  otherAdmin = await addUser(db, { role: 'admin', name: 'Other admin' });
  officer = await addUser(db, { role: 'conservation_officer' });
  visitor = await addUser(db);
});

function changeRole(user, id, role) {
  return asUser(db, user, (tx) =>
    tx.query('UPDATE public.profiles SET role = $1 WHERE id = $2 RETURNING id', [role, id]),
  );
}

async function linesFor(id) {
  const { rows } = await db.query(
    'SELECT * FROM public.role_changes WHERE user_id = $1 ORDER BY id',
    [id],
  );
  return rows;
}

function setRole(user, role) {
  return db.query('UPDATE public.profiles SET role = $1 WHERE id = $2', [role, user.id]);
}

/** Runs fn with Row Level Security off on profiles, then puts it back whatever happens. */
async function withoutRls(fn) {
  await db.exec('ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY');
  try {
    return await fn();
  } finally {
    await db.exec('ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY');
  }
}

/** A database with exactly the given roles, so the admin counts are known. */
async function databaseWith(...roles) {
  const fresh = await newDatabase();
  await fresh.exec("UPDATE public.profiles SET role = 'visitor' WHERE role = 'admin'");
  const users = [];
  for (const role of roles) users.push(await addUser(fresh, { role, name: `${role} user` }));
  return { fresh, users };
}

describe('the list of role changes', () => {
  test('a change by an admin writes one line saying who, what and when', async () => {
    const target = await addUser(db, { name: 'Changed person' });
    const started = Date.now();
    await changeRole(admin, target.id, 'botanist');
    const lines = await linesFor(target.id);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].user_email, `${target.id}@example.test`);
    assert.equal(lines[0].user_name, 'Changed person');
    assert.equal(lines[0].old_role, 'visitor');
    assert.equal(lines[0].new_role, 'botanist');
    assert.equal(lines[0].changed_by, admin.id);
    assert.equal(lines[0].changed_by_name, 'First admin');
    assert.ok(new Date(lines[0].changed_at).getTime() >= started - 60000);
  });

  test('saving the same role writes nothing', async () => {
    const target = await addUser(db, { role: 'botanist' });
    const before = (await linesFor(target.id)).length;
    await changeRole(admin, target.id, 'botanist');
    assert.equal((await linesFor(target.id)).length, before);
  });

  test('a change in the SQL editor is written down with nobody named', async () => {
    const target = await addUser(db);
    await setRole(target, 'researcher');
    const lines = await linesFor(target.id);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].new_role, 'researcher');
    assert.equal(lines[0].changed_by, null);
    assert.equal(lines[0].changed_by_name, null);
  });

  test('a refused change writes nothing', async () => {
    const target = await addUser(db);
    for (const user of [officer, visitor]) {
      const { rows } = await changeRole(user, target.id, 'admin');
      assert.equal(rows.length, 0);
    }
    assert.equal((await linesFor(target.id)).length, 0);
  });

  test('a line stays after the account is deleted, with the role empty', async () => {
    const target = await addUser(db, { role: 'botanist', name: 'Leaving person' });
    await db.query('DELETE FROM auth.users WHERE id = $1', [target.id]);
    const lines = await linesFor(target.id);
    assert.equal(lines.length, 2);
    assert.equal(lines[1].old_role, 'botanist');
    assert.equal(lines[1].new_role, null);
    assert.equal(lines[1].user_name, 'Leaving person');
    assert.equal(lines[1].user_email, `${target.id}@example.test`);
  });

  test('only admins can read it', async () => {
    const sql = 'SELECT id FROM public.role_changes';
    assert.ok((await selectAs(db, admin, sql)).length > 0);
    for (const user of [officer, visitor]) {
      assert.equal((await selectAs(db, user, sql)).length, 0);
    }
    await assert.rejects(selectAs(db, null, sql), { code: '42501' });
  });

  test('nobody can add to it, change it or empty it, admins included', async () => {
    const statements = [
      `INSERT INTO public.role_changes (user_id, user_email, user_name, old_role)
       VALUES ('${randomUUID()}', 'made@up.test', 'Made up', 'admin')`,
      "UPDATE public.role_changes SET changed_by_name = 'Someone else'",
      'DELETE FROM public.role_changes',
      'TRUNCATE public.role_changes',
    ];
    for (const user of [admin, officer, visitor, null]) {
      for (const sql of statements) {
        await assert.rejects(
          asUser(db, user, (tx) => tx.query(sql)),
          { code: '42501' },
        );
      }
    }
  });

  test("nobody can call the trigger functions", async () => {
    for (const user of [admin, visitor, null]) {
      for (const name of ['keep_one_admin', 'remember_role_change']) {
        await assert.rejects(
          asUser(db, user, (tx) => tx.query(`SELECT public.${name}()`)),
          { code: '42501' },
        );
      }
    }
  });
});

describe('keeping one administrator', () => {
  test('an admin can still remove another admin, and it goes on the list', async () => {
    const { fresh, users } = await databaseWith('admin', 'admin');
    const [first, second] = users;
    const { rows } = await asUser(fresh, first, (tx) =>
      tx.query("UPDATE public.profiles SET role = 'visitor' WHERE id = $1 RETURNING id", [
        second.id,
      ]),
    );
    assert.equal(rows.length, 1);
    const lines = await fresh.query('SELECT * FROM public.role_changes WHERE user_id = $1', [
      second.id,
    ]);
    assert.equal(lines.rows.at(-1).old_role, 'admin');
    assert.equal(lines.rows.at(-1).new_role, 'visitor');
  });

  test('two admins removing each other in turn leaves one', async () => {
    const { fresh, users } = await databaseWith('admin', 'admin');
    const [first, second] = users;
    const demote = (who, whom) =>
      asUser(fresh, who, (tx) =>
        tx.query("UPDATE public.profiles SET role = 'visitor' WHERE id = $1 RETURNING id", [
          whom.id,
        ]),
      );
    assert.equal((await demote(first, second)).rows.length, 1);
    assert.equal((await demote(second, first)).rows.length, 0);
    const left = await fresh.query("SELECT id FROM public.profiles WHERE role = 'admin'");
    assert.deepEqual(
      left.rows.map((row) => row.id),
      [first.id],
    );
  });

  test('a former admin who gets past the first check is still refused', async () => {
    const formerAdmin = await addUser(db, { role: 'admin' });
    const target = await addUser(db, { role: 'admin' });
    await setRole(formerAdmin, 'visitor');
    await withoutRls(async () => {
      await assert.rejects(changeRole(formerAdmin, target.id, 'visitor'), { code: '42501' });
    });
    const { rows } = await db.query('SELECT role FROM public.profiles WHERE id = $1', [target.id]);
    assert.equal(rows[0].role, 'admin');
  });

  test('the last admin who gets past the first check is still refused', async () => {
    const { fresh, users } = await databaseWith('admin');
    const [only] = users;
    await fresh.exec('ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY');
    await assert.rejects(
      asUser(fresh, only, (tx) =>
        tx.query("UPDATE public.profiles SET role = 'visitor' WHERE id = $1", [only.id]),
      ),
      { message: /leave nobody as an administrator/, code: 'P0001' },
    );
  });

  test('removing an admin takes the lock, and other changes do not', async () => {
    const { fresh, users } = await databaseWith('admin', 'admin', 'botanist');
    const [first, second, botanist] = users;
    const locksDuring = (id, role) =>
      asUser(fresh, first, async (tx) => {
        await tx.query('UPDATE public.profiles SET role = $1 WHERE id = $2', [role, id]);
        const { rows } = await tx.query(
          "SELECT count(*)::int AS held FROM pg_locks WHERE locktype = 'advisory'",
        );
        return rows[0].held;
      });
    assert.equal(await locksDuring(botanist.id, 'researcher'), 0);
    assert.equal(await locksDuring(second.id, 'visitor'), 1);
  });

  test('other role changes are not held up', async () => {
    const target = await addUser(db, { role: 'botanist' });
    const { rows } = await changeRole(admin, target.id, 'visitor');
    assert.equal(rows.length, 1);
    const { rows: up } = await changeRole(admin, target.id, 'admin');
    assert.equal(up.length, 1);
    await setRole(target, 'visitor');
  });

  test('the SQL editor can still change the last admin, as the way back in', async () => {
    const { fresh, users } = await databaseWith('admin');
    const [only] = users;
    await fresh.query("UPDATE public.profiles SET role = 'visitor' WHERE id = $1", [only.id]);
    await fresh.query("UPDATE public.profiles SET role = 'admin' WHERE id = $1", [only.id]);
    await fresh.query('DELETE FROM auth.users WHERE id = $1', [only.id]);
    const left = await fresh.query("SELECT id FROM public.profiles WHERE role = 'admin'");
    assert.equal(left.rows.length, 0);
  });
});

describe('running 021', () => {
  test('running it again keeps the list and the triggers', async () => {
    const target = await addUser(db);
    await changeRole(admin, target.id, 'botanist');
    await db.exec(readSql(FILE));
    await changeRole(admin, target.id, 'researcher');
    const lines = await linesFor(target.id);
    assert.deepEqual(
      lines.map((line) => line.new_role),
      ['botanist', 'researcher'],
    );
  });

  test("it stops on its first line if 020 isn't there", async () => {
    const older = await newDatabase(
      SQL_FILES.slice(0, SQL_FILES.indexOf('020_record_photo_access.sql')),
    );
    await assert.rejects(older.exec(readSql(FILE)), {
      message: /021 needs 020_record_photo_access\.sql/,
    });
  });
});
