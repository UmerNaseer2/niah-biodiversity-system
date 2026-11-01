// Jest can't run the real expo-file-system, because it needs the phone's file system. This stands
// in for the parts the app uses, and keeps every file in memory. It doesn't remember anything
// between test files, and a test clears it by deleting the folder it used.
const files = new Map();
const folders = new Set();

function uriFrom(parts) {
  return parts
    .map((part) => (typeof part === 'string' ? part : part.uri))
    .join('/')
    .replace(/([^:/])\/+/g, '$1/')
    .replace(/\/$/, '');
}

class File {
  constructor(...parts) {
    this.uri = uriFrom(parts);
  }

  get exists() {
    return files.has(this.uri);
  }

  get name() {
    return this.uri.slice(this.uri.lastIndexOf('/') + 1);
  }

  get size() {
    return files.get(this.uri)?.length ?? 0;
  }

  write(content) {
    files.set(this.uri, content);
  }

  delete() {
    if (!files.delete(this.uri)) {
      throw new Error(`No file at ${this.uri}`);
    }
  }

  async move(destination) {
    const content = files.get(this.uri);
    if (!content) {
      throw new Error(`No file at ${this.uri}`);
    }
    files.delete(this.uri);
    files.set(destination.uri, content);
    this.uri = destination.uri;
  }

  async arrayBuffer() {
    const content = files.get(this.uri);
    if (!content) {
      throw new Error(`No file at ${this.uri}`);
    }
    return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
  }
}

class Directory {
  constructor(...parts) {
    this.uri = uriFrom(parts);
  }

  get exists() {
    return folders.has(this.uri);
  }

  create() {
    folders.add(this.uri);
  }

  list() {
    return [...files.keys()]
      .filter((uri) => uri.slice(0, uri.lastIndexOf('/')) === this.uri)
      .map((uri) => new File(uri));
  }

  delete() {
    folders.delete(this.uri);
    for (const uri of [...files.keys()]) {
      if (uri.startsWith(`${this.uri}/`)) {
        files.delete(uri);
      }
    }
  }
}

const Paths = {
  document: new Directory('file:///document'),
  cache: new Directory('file:///cache'),
};

// __esModule keeps the same object behind `import * as`, so jest.spyOn works on it.
module.exports = { __esModule: true, File, Directory, Paths };
