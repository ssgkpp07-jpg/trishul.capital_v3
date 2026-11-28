import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  decryptRefreshToken,
  encryptRefreshToken,
  sha256
} from './google-calendar.js';

test('creates a hashed OAuth state and a PKCE challenge without exposing the verifier', () => {
  const oauth = createOAuthState();
  assert.notEqual(oauth.state, oauth.stateHash);
  assert.equal(oauth.stateHash, sha256(oauth.state));
  assert.notEqual(oauth.codeChallenge, oauth.codeVerifier);
  assert.match(oauth.codeChallenge, /^[A-Za-z0-9_-]+$/);
});

test('encrypts refresh tokens with authenticated encryption', () => {
  const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  try {
    const token = 'google-refresh-token-for-test';
    const encrypted = encryptRefreshToken(token);
    assert.ok(!encrypted.includes(token));
    assert.equal(decryptRefreshToken(encrypted), token);
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
    assert.throws(() => decryptRefreshToken(encrypted), /Could not decrypt/);
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey;
  }
});

test('authorization URL requests offline access and a server-side PKCE callback', () => {
  const previous = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    encryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  };
  process.env.GOOGLE_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'https://example.com/api/google-calendar/callback';
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  try {
    const url = new URL(buildGoogleAuthorizationUrl({ state: 'state', codeChallenge: 'challenge' }));
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.equal(url.searchParams.get('state'), 'state');
    assert.equal(url.searchParams.get('code_challenge'), 'challenge');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('redirect_uri'), process.env.GOOGLE_REDIRECT_URI);
    assert.match(url.searchParams.get('scope'), /calendar\.events/);
    assert.doesNotMatch(url.searchParams.get('scope'), /calendar\.freebusy/);
  } finally {
    for (const [key, value] of Object.entries({
      GOOGLE_CLIENT_ID: previous.clientId,
      GOOGLE_CLIENT_SECRET: previous.clientSecret,
      GOOGLE_REDIRECT_URI: previous.redirectUri,
      GOOGLE_TOKEN_ENCRYPTION_KEY: previous.encryptionKey
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
