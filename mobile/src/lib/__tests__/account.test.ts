import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import {
  canUpload,
  NO_SIGNAL_SIGN_IN,
  readSavedAccount,
  roleLabel,
  signInMessage,
} from '@/lib/account';

describe('roleLabel', () => {
  it('writes each role the way a person would', () => {
    expect(roleLabel('botanist')).toBe('Botanist');
    expect(roleLabel('conservation_officer')).toBe('Conservation officer');
    expect(roleLabel('admin')).toBe('Administrator');
    expect(roleLabel('researcher')).toBe('Researcher');
    expect(roleLabel('visitor')).toBe('Visitor');
  });

  it('says when it does not know yet, and shows a role it has never heard of as it is', () => {
    expect(roleLabel(null)).toBe('Not known yet');
    expect(roleLabel('park_guide')).toBe('park_guide');
  });
});

describe('canUpload', () => {
  it.each(['botanist', 'conservation_officer', 'admin'])('lets a %s upload', (role) => {
    expect(canUpload(role)).toBe(true);
  });

  it.each(['visitor', 'researcher', 'park_guide'])("doesn't let a %s upload", (role) => {
    expect(canUpload(role)).toBe(false);
  });

  it("doesn't complain before the phone has managed to read the role", () => {
    expect(canUpload(null)).toBe(true);
  });
});

describe('readSavedAccount', () => {
  const account = { userId: 'u1', email: 'a@example.test', name: 'Ali', role: 'botanist' };

  it('reads back what the app saved', () => {
    expect(readSavedAccount(JSON.stringify(account))).toEqual(account);
  });

  it('fills in what is missing from an older save', () => {
    expect(readSavedAccount('{"userId":"u1","email":"a@example.test"}')).toEqual({
      userId: 'u1',
      email: 'a@example.test',
      name: null,
      role: null,
    });
  });

  it.each([null, '', 'not json', 'null', '[]', '{"userId":1,"email":"a"}', '{"userId":"u1"}'])(
    'treats %s as no account',
    (text) => {
      expect(readSavedAccount(text)).toBeNull();
    },
  );
});

describe('signInMessage', () => {
  it('says so when there is no signal, and that records are still safe', () => {
    expect(signInMessage(new AuthRetryableFetchError('Failed to fetch', 0))).toBe(
      NO_SIGNAL_SIGN_IN,
    );
    expect(NO_SIGNAL_SIGN_IN).toMatch(/stay on this phone/);
  });

  it("doesn't blame the signal or the password when the server is struggling", () => {
    const expected = "Sign in isn't working right now. Try again in a minute.";
    expect(signInMessage(new AuthRetryableFetchError('Bad gateway', 502))).toBe(expected);
    expect(signInMessage(new AuthApiError('Oops', 500, 'unexpected_failure'))).toBe(expected);
    expect(signInMessage({})).toBe(expected);
  });

  it('asks them to wait after too many tries', () => {
    expect(signInMessage(new AuthApiError('Slow down', 429, 'over_request_rate_limit'))).toBe(
      'Too many tries. Wait a few minutes, then try again.',
    );
  });

  it('gives the same message for a wrong password and a deactivated account', () => {
    const expected = "That email and password don't match an active account.";
    expect(signInMessage(new AuthApiError('Invalid', 400, 'invalid_credentials'))).toBe(expected);
    expect(signInMessage(new AuthApiError('Banned', 400, 'user_banned'))).toBe(expected);
  });
});
