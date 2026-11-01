import * as SecureStore from 'expo-secure-store';

import { chunkedStorage } from './chunked-storage';

// The Android keystore and iOS keychain. After first unlock so a sync that's running when the
// phone locks can still save a refreshed token. This device only so the session doesn't move to a
// new phone with a backup.
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const secureStorage = chunkedStorage({
  getItemAsync: (key) => SecureStore.getItemAsync(key, options),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, options),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, options),
});
