// Runs before every test file. Jest gives it the jest global, like the test files.
/* global jest */

// The jest-expo stand-in for expo-crypto's randomUUID returns nothing, so every new record would
// get the same empty ID. This uses Node's own randomUUID instead, which makes real v4 UUIDs.
jest.mock('expo-crypto', () => ({
  __esModule: true,
  ...jest.requireActual('expo-crypto'),
  randomUUID: jest.fn(() => require('crypto').randomUUID()),
}));

// mobile/.env is for running the app, and no test should ever talk to a real server.
delete process.env.EXPO_PUBLIC_SUPABASE_URL;
delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.EXPO_PUBLIC_SITE_URL;
