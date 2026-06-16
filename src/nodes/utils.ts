export interface NtfyApiCredentials {
  serverUrl: string;
  authType: 'none' | 'basicAuth' | 'accessToken';
  username?: string;
  password?: string;
  accessToken?: string;
}

export interface CredentialTestResult {
  status: 'OK' | 'Error';
  message: string;
}

export async function testNtfyConnection(
  request: (options: object) => Promise<unknown>,
  credentials: NtfyApiCredentials,
): Promise<CredentialTestResult> {
  const serverUrl = credentials.serverUrl.replace(/\/+$/, '');

  // No credentials: we can only verify the server is reachable. /v1/health is
  // auth-free and always succeeds, so a green result here does NOT imply access
  // to an auth-protected topic — be explicit about that.
  if (credentials.authType === 'none') {
    try {
      await request({ method: 'GET', uri: `${serverUrl}/v1/health`, json: true });
      return { status: 'OK', message: 'Server reachable (anonymous — no credentials configured)' };
    } catch (error: unknown) {
      return { status: 'Error', message: (error as Error).message };
    }
  }

  // Fail empty credentials up front instead of sending an effectively anonymous request.
  if (credentials.authType === 'accessToken' && !credentials.accessToken) {
    return { status: 'Error', message: 'Access Token is empty — enter a token or switch Authentication Type to None.' };
  }
  if (credentials.authType === 'basicAuth' && (!credentials.username || !credentials.password)) {
    return { status: 'Error', message: 'Username and password are both required for Basic Auth.' };
  }

  const headers = buildAuthHeader(credentials);

  try {
    // /v1/account returns 200 even for anonymous requests (role "anonymous",
    // username "*"), so a 200 alone is not proof of authentication. Inspect the
    // returned identity: if the server treated us as anonymous, the credentials
    // did not authenticate.
    const account = (await request({
      method: 'GET',
      uri: `${serverUrl}/v1/account`,
      headers,
      json: true,
    })) as { username?: string; role?: string } | undefined;

    if (!account || account.role === 'anonymous' || account.username === '*') {
      return {
        status: 'Error',
        message:
          'Authentication did not succeed — the server treated the request as anonymous. Check your token or username/password.',
      };
    }

    return { status: 'OK', message: `Connection successful (authenticated as ${account.username})` };
  } catch (error: unknown) {
    const err = error as { statusCode?: number; response?: { statusCode?: number } };
    const statusCode = err.statusCode ?? err.response?.statusCode;
    if (statusCode === 401 || statusCode === 403) {
      return {
        status: 'Error',
        message: `Authentication failed (HTTP ${statusCode}). Check your credentials.`,
      };
    }
    return { status: 'Error', message: (error as Error).message };
  }
}

export function buildAuthHeader(credentials: NtfyApiCredentials): Record<string, string> {
  if (credentials.authType === 'basicAuth') {
    const encoded = Buffer.from(`${credentials.username ?? ''}:${credentials.password ?? ''}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }
  if (credentials.authType === 'accessToken') {
    if (!credentials.accessToken) throw new Error('accessToken is required when authType is "accessToken"');
    return { Authorization: `Bearer ${credentials.accessToken}` };
  }
  return {};
}

export function buildTopicUrl(serverUrl: string, topics: string): string {
  return `${serverUrl.replace(/\/+$/, '')}/${topics}/json`;
}

export const DEFAULT_PRIORITY = '3';

export function buildSendHeaders(
  credentials: NtfyApiCredentials,
  { title, priority, tags }: { title?: string; priority?: string; tags?: string },
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain',
    ...buildAuthHeader(credentials),
  };
  if (title) headers['X-Title'] = title;
  if (priority && priority !== DEFAULT_PRIORITY) headers['X-Priority'] = priority;
  if (tags) headers['X-Tags'] = tags;
  return headers;
}

export function parseStreamLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const msg = JSON.parse(line) as unknown;
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return null;
    const record = msg as Record<string, unknown>;
    return record.event === 'message' ? record : null;
  } catch {
    return null;
  }
}

export const CUSTOM_HEADER_VALUE = '__custom__';

// RFC 7230 token: header names may contain letters, digits and these symbols.
export const VALID_HEADER_NAME = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

export interface AdditionalHeaderEntry {
  name: string;
  customName?: string;
  value: string;
}

/**
 * Resolves Additional Headers collection entries into a header map.
 * - `name === CUSTOM_HEADER_VALUE` uses `customName`, otherwise `name` is the header.
 * - Entries with an empty effective name or empty value are skipped.
 * - Throws on an invalid header name (RFC 7230 token). On duplicates, the last wins.
 */
export function buildAdditionalHeaders(entries: AdditionalHeaderEntry[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of entries) {
    const name = (entry.name === CUSTOM_HEADER_VALUE ? entry.customName : entry.name)?.trim();
    const value = entry.value?.trim();
    if (!name || !value) continue;
    if (!VALID_HEADER_NAME.test(name)) {
      throw new Error(
        `Invalid header name: "${name}". Header names may only contain letters, digits, and hyphens.`,
      );
    }
    headers[name] = value;
  }
  return headers;
}
