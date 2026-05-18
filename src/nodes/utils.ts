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
    return { Authorization: `Bearer ${credentials.accessToken ?? ''}` };
  }
  return {};
}

export function buildTopicUrl(serverUrl: string, topics: string): string {
  return `${serverUrl.replace(/\/$/, '')}/${topics}/json`;
}

export function buildSendHeaders(
  credentials: NtfyApiCredentials,
  { title, priority, tags }: { title?: string; priority?: string; tags?: string },
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain',
    ...buildAuthHeader(credentials),
  };
  if (title) headers['X-Title'] = title;
  if (priority && priority !== '3') headers['X-Priority'] = priority;
  if (tags) headers['X-Tags'] = tags;
  return headers;
}

export function parseStreamLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const msg = JSON.parse(line) as Record<string, unknown>;
    return msg.event === 'message' ? msg : null;
  } catch {
    return null;
  }
}
