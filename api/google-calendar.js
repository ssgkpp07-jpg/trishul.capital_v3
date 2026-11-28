import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export class MeetingApiError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'MeetingApiError';
    this.statusCode = statusCode;
    this.expose = true;
  }
}

function googleConfig() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new MeetingApiError('Google Calendar is not configured. Add the Google OAuth variables in Vercel.', 503);
  }
  let redirect;
  try {
    redirect = new URL(GOOGLE_REDIRECT_URI);
  } catch {
    throw new MeetingApiError('GOOGLE_REDIRECT_URI must be a valid URL.', 503);
  }
  if (redirect.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(redirect.hostname)) {
    throw new MeetingApiError('GOOGLE_REDIRECT_URI must use HTTPS outside local development.', 503);
  }
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, redirectUri: redirect.href };
}

function encryptionKey() {
  const value = (process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '').trim();
  const key = /^[\da-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new MeetingApiError('GOOGLE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.', 503);
  }
  return key;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function createOAuthState() {
  const state = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { state, stateHash: sha256(state), codeVerifier, codeChallenge };
}

export function buildGoogleAuthorizationUrl({ state, codeChallenge }) {
  const config = googleConfig();
  encryptionKey();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.events'
    ].join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  }).toString();
  return url.toString();
}

export function encryptRefreshToken(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}

export function decryptRefreshToken(value) {
  const [ivValue, tagValue, encryptedValue] = String(value || '').split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new MeetingApiError('The saved Google Calendar connection is unreadable.', 503);
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw new MeetingApiError('Could not decrypt the Google Calendar token. Check GOOGLE_TOKEN_ENCRYPTION_KEY.', 503);
  }
}

async function tokenRequest(parameters) {
  const config = googleConfig();
  let response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...(parameters.grant_type === 'authorization_code' ? { redirect_uri: config.redirectUri } : {}),
        ...parameters
      })
    });
  } catch {
    throw new MeetingApiError('Could not reach Google OAuth. Try again shortly.', 502);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new MeetingApiError(result.error_description || 'Google OAuth could not authorize this request.', 502);
  }
  return result;
}

export async function exchangeGoogleCode(code, codeVerifier) {
  return tokenRequest({
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code'
  });
}

export async function getGoogleUser(accessToken) {
  let response;
  try {
    response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  } catch {
    throw new MeetingApiError('Could not read the connected Google account.', 502);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.email || result.email_verified === false) {
    throw new MeetingApiError('Google did not return an account email for this connection.', 502);
  }
  return result;
}

export async function getGoogleIntegration(supabase) {
  const { data, error } = await supabase.from('google_calendar_integrations')
    .select('id,connected_email,refresh_token_encrypted,scopes,connected_at,updated_at')
    .eq('id', 'primary')
    .maybeSingle();
  if (error) throw new MeetingApiError(`Could not read Google Calendar connection: ${error.message}`, 500);
  return data;
}

export async function getGoogleAccessToken(supabase) {
  const integration = await getGoogleIntegration(supabase);
  if (!integration) throw new MeetingApiError('Connect Google Calendar before using meeting scheduling.', 503);
  const refreshToken = decryptRefreshToken(integration.refresh_token_encrypted);
  const tokens = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  if (tokens.refresh_token) {
    const { error } = await supabase.from('google_calendar_integrations')
      .update({
        refresh_token_encrypted: encryptRefreshToken(tokens.refresh_token),
        updated_at: new Date().toISOString()
      })
      .eq('id', 'primary');
    if (error) throw new MeetingApiError(`Could not update the Google Calendar token: ${error.message}`, 500);
  }
  return tokens.access_token;
}

export async function googleCalendarRequest(accessToken, path, options = {}) {
  const url = path.startsWith('https://') ? path : `https://www.googleapis.com/calendar/v3${path}`;
  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
  } catch {
    throw new MeetingApiError('Could not reach Google Calendar. Try again shortly.', 502);
  }
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.error?.message || 'Google Calendar rejected the request.';
    throw new MeetingApiError(message, response.status === 404 ? 404 : 502);
  }
  return result;
}

export async function listGoogleCalendarEvents(accessToken, startAt, endAt) {
  const allEvents = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({
      timeMin: new Date(startAt).toISOString(),
      timeMax: new Date(endAt).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      showDeleted: 'false',
      maxResults: '2500'
    });
    if (pageToken) query.set('pageToken', pageToken);
    const result = await googleCalendarRequest(accessToken, `/calendars/primary/events?${query}`);
    allEvents.push(...(result.items || []).filter(event => event.status !== 'cancelled' && event.transparency !== 'transparent'));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return allEvents;
}

export async function revokeGoogleToken(refreshToken) {
  let response;
  try {
    response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken })
    });
  } catch {
    throw new MeetingApiError('Could not reach Google to disconnect the calendar. Try again shortly.', 502);
  }
  if (!response.ok) throw new MeetingApiError('Google did not confirm the calendar disconnection.', 502);
}
