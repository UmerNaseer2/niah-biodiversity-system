import type { TextStorage } from './chunked-storage';

// expo-secure-store has no web version. The web build is only for looking at the screens on a
// computer, so this keeps things in memory and they're gone when the page reloads, the same as
// records-store.web.ts.
const items = new Map<string, string>();

export const secureStorage: TextStorage = {
  async getItem(key) {
    return items.get(key) ?? null;
  },
  async setItem(key, value) {
    items.set(key, value);
  },
  async removeItem(key) {
    items.delete(key);
  },
};
