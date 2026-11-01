// Jest can't run the real expo-sqlite, because it needs the SQLite that comes with the phone. This
// stands in for the parts the app uses with sql.js, which is SQLite built for WebAssembly, so the
// tests still run real SQL against tables with the same rules as on the phone.
const { readFileSync } = require('fs');
const initSqlJs = require('sql.js');

// The WebAssembly is compiled straight away instead of in the background, so opening a database
// only waits on promises and still works in tests that use fake timers.
const wasm = new WebAssembly.Module(readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')));
const loading = initSqlJs({
  instantiateWasm(imports, receiveInstance) {
    const instance = new WebAssembly.Instance(wasm, imports);
    receiveInstance(instance, wasm);
    return instance.exports;
  },
});

// One database per name, shared by every connection to it like a file on the phone. They last
// until the test file ends or deleteDatabaseAsync removes them. Connections also share
// transactions, unlike the phone. That's fine because the tests never write on two connections
// at the same time.
const files = new Map();
const openConnections = new Map();

// Binds values the way expo-sqlite does: several arguments in order, or one array or object. Object
// keys keep the $ at the front. undefined is saved as null, and true or false as 1 or 0.
function bindValues(params) {
  let values = params.length > 1 ? params : params[0];
  if (values == null) {
    values = [];
  }
  if (typeof values !== 'object' || values instanceof ArrayBuffer || ArrayBuffer.isView(values)) {
    values = [values];
  }
  const bound = Array.isArray(values) ? [] : {};
  for (const key of Object.keys(values)) {
    const value = values[key];
    if (typeof value === 'boolean') {
      bound[key] = value ? 1 : 0;
    } else if (value instanceof ArrayBuffer) {
      bound[key] = new Uint8Array(value);
    } else {
      bound[key] = value ?? null;
    }
  }
  return bound;
}

class SQLiteDatabase {
  constructor(databaseName, database) {
    this.databaseName = databaseName;
    this.database = database;
    this.closed = false;
  }

  // Like the phone, a closed connection can't be used again.
  open() {
    if (this.closed) {
      throw new Error(`The database ${this.databaseName} is already closed.`);
    }
    return this.database;
  }

  query(source, params, firstOnly) {
    const statement = this.open().prepare(source);
    try {
      statement.bind(bindValues(params));
      const rows = [];
      while (statement.step()) {
        rows.push(statement.getAsObject());
        if (firstOnly) {
          break;
        }
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  async execAsync(source) {
    this.open().exec(source);
  }

  async runAsync(source, ...params) {
    const database = this.open();
    database.run(source, bindValues(params));
    const changes = database.getRowsModified();
    const [{ values }] = database.exec('SELECT last_insert_rowid()');
    return { lastInsertRowId: values[0][0], changes };
  }

  async getFirstAsync(source, ...params) {
    return this.query(source, params, true)[0] ?? null;
  }

  async getAllAsync(source, ...params) {
    return this.query(source, params, false);
  }

  // The same steps as the real withTransactionAsync.
  async withTransactionAsync(task) {
    try {
      await this.execAsync('BEGIN');
      await task();
      await this.execAsync('COMMIT');
    } catch (error) {
      await this.execAsync('ROLLBACK');
      throw error;
    }
  }

  // The same steps as the real withExclusiveTransactionAsync, which runs the task on a second
  // connection and closes it afterwards.
  async withExclusiveTransactionAsync(task) {
    this.open();
    const transaction = await openDatabaseAsync(this.databaseName);
    let error;
    try {
      await transaction.execAsync('BEGIN');
      await task(transaction);
      await transaction.execAsync('COMMIT');
    } catch (e) {
      await transaction.execAsync('ROLLBACK');
      error = e;
    } finally {
      await transaction.closeAsync();
    }
    if (error) {
      throw error;
    }
  }

  async closeAsync() {
    this.open();
    this.closed = true;
    openConnections.set(this.databaseName, openConnections.get(this.databaseName) - 1);
  }
}

async function openDatabaseAsync(databaseName) {
  const SQL = await loading;
  if (!files.has(databaseName)) {
    files.set(databaseName, new SQL.Database());
  }
  openConnections.set(databaseName, (openConnections.get(databaseName) ?? 0) + 1);
  return new SQLiteDatabase(databaseName, files.get(databaseName));
}

// The phone won't delete a database that's still open, so this won't either. Unlike the phone,
// deleting one that isn't there does nothing, so a test can start clean with a single call.
async function deleteDatabaseAsync(databaseName) {
  if ((openConnections.get(databaseName) ?? 0) > 0) {
    throw new Error(
      `Unable to delete database '${databaseName}' that is currently open. ` +
        'Close it prior to deletion.',
    );
  }
  files.get(databaseName)?.close();
  files.delete(databaseName);
}

// __esModule keeps the same object behind `import * as SQLite`, so jest.spyOn works on it.
module.exports = {
  __esModule: true,
  SQLiteDatabase,
  openDatabaseAsync,
  deleteDatabaseAsync,
  defaultDatabaseDirectory: '/stand-in/SQLite',
};
