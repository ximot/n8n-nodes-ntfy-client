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
  // /v1/account requires authentication — returns 401/403 on bad creds
  // /v1/health is auth-free — use only when no auth is configured
  const endpoint = credentials.authType === 'none' ? '/v1/health' : '/v1/account';
  const headers = buildAuthHeader(credentials);

  try {
    await request({ method: 'GET', uri: `${serverUrl}${endpoint}`, headers, json: true });
    return { status: 'OK', message: 'Connection successful' };
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
