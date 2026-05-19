export interface NtfyApiCredentials {
  serverUrl: string;
  authType: 'none' | 'basicAuth' | 'accessToken';
  username?: string;
  password?: string;
  accessToken?: string;
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
