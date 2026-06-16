import { buildAuthHeader, buildTopicUrl, buildSendHeaders, parseStreamLine, testNtfyConnection, NtfyApiCredentials } from '../nodes/utils';

const baseCreds: NtfyApiCredentials = { serverUrl: 'https://ntfy.sh', authType: 'none' };

describe('buildAuthHeader', () => {
  it('returns empty object for authType none', () => {
    expect(buildAuthHeader(baseCreds)).toEqual({});
  });

  it('returns Basic header for basicAuth', () => {
    const creds: NtfyApiCredentials = { ...baseCreds, authType: 'basicAuth', username: 'user', password: 'pass' };
    expect(buildAuthHeader(creds)).toEqual({ Authorization: 'Basic dXNlcjpwYXNz' });
  });

  it('returns Bearer header for accessToken', () => {
    const creds: NtfyApiCredentials = { ...baseCreds, authType: 'accessToken', accessToken: 'tk_abc123' };
    expect(buildAuthHeader(creds)).toEqual({ Authorization: 'Bearer tk_abc123' });
  });

  it('handles missing username/password with empty strings', () => {
    const creds: NtfyApiCredentials = { ...baseCreds, authType: 'basicAuth' };
    expect(buildAuthHeader(creds)).toEqual({ Authorization: 'Basic Og==' }); // base64(':')
  });

  it('throws when accessToken is missing with authType accessToken', () => {
    const creds: NtfyApiCredentials = { ...baseCreds, authType: 'accessToken' };
    expect(() => buildAuthHeader(creds)).toThrow('accessToken is required when authType is "accessToken"');
  });
});

describe('buildTopicUrl', () => {
  it('builds single topic JSON URL', () => {
    expect(buildTopicUrl('https://ntfy.sh', 'alerts')).toBe('https://ntfy.sh/alerts/json');
  });

  it('builds multi-topic JSON URL', () => {
    expect(buildTopicUrl('https://ntfy.sh', 'alerts,backup,system')).toBe('https://ntfy.sh/alerts,backup,system/json');
  });

  it('strips trailing slash from serverUrl', () => {
    expect(buildTopicUrl('https://ntfy.sh/', 'test')).toBe('https://ntfy.sh/test/json');
  });

  it('strips multiple trailing slashes from serverUrl', () => {
    expect(buildTopicUrl('https://ntfy.sh//', 'test')).toBe('https://ntfy.sh/test/json');
  });
});

describe('buildSendHeaders', () => {
  it('includes Content-Type always', () => {
    const headers = buildSendHeaders(baseCreds, {});
    expect(headers['Content-Type']).toBe('text/plain');
  });

  it('adds X-Title when title provided', () => {
    const headers = buildSendHeaders(baseCreds, { title: 'My Alert' });
    expect(headers['X-Title']).toBe('My Alert');
  });

  it('omits X-Title when title is empty', () => {
    const headers = buildSendHeaders(baseCreds, { title: '' });
    expect(headers['X-Title']).toBeUndefined();
  });

  it('omits X-Priority when default (3)', () => {
    const headers = buildSendHeaders(baseCreds, { priority: '3' });
    expect(headers['X-Priority']).toBeUndefined();
  });

  it('adds X-Priority when non-default', () => {
    const headers = buildSendHeaders(baseCreds, { priority: '5' });
    expect(headers['X-Priority']).toBe('5');
  });

  it('adds X-Tags when provided', () => {
    const headers = buildSendHeaders(baseCreds, { tags: 'warning,📦' });
    expect(headers['X-Tags']).toBe('warning,📦');
  });

  it('includes auth header when authType is accessToken', () => {
    const creds: NtfyApiCredentials = { ...baseCreds, authType: 'accessToken', accessToken: 'tk_xyz' };
    const headers = buildSendHeaders(creds, {});
    expect(headers['Authorization']).toBe('Bearer tk_xyz');
  });

  it('includes Authorization header when authType is basicAuth', () => {
    const creds: NtfyApiCredentials = { ...baseCreds, authType: 'basicAuth', username: 'alice', password: 'secret' };
    const headers = buildSendHeaders(creds, {});
    expect(headers['Authorization']).toBe('Basic YWxpY2U6c2VjcmV0');
  });
});

describe('testNtfyConnection', () => {
  it('authType none: checks /v1/health and reports reachable', async () => {
    const request = jest.fn().mockResolvedValue({ healthy: true });
    const res = await testNtfyConnection(request, { serverUrl: 'https://ntfy.sh', authType: 'none' });
    expect(res.status).toBe('OK');
    expect(request.mock.calls[0][0]).toMatchObject({ uri: 'https://ntfy.sh/v1/health' });
  });

  it('accessToken valid (authenticated account) -> OK', async () => {
    const request = jest.fn().mockResolvedValue({ username: 'phil', role: 'user' });
    const res = await testNtfyConnection(request, {
      serverUrl: 'https://ntfy.sh', authType: 'accessToken', accessToken: 'tk_valid',
    });
    expect(res.status).toBe('OK');
    expect(request.mock.calls[0][0]).toMatchObject({ uri: 'https://ntfy.sh/v1/account' });
  });

  it('credentials that resolve to anonymous -> Error (false-green guard)', async () => {
    const request = jest.fn().mockResolvedValue({ username: '*', role: 'anonymous' });
    const res = await testNtfyConnection(request, {
      serverUrl: 'https://ntfy.sh', authType: 'accessToken', accessToken: 'tk_ignored',
    });
    expect(res.status).toBe('Error');
    expect(res.message).toMatch(/anonymous/i);
  });

  it('empty accessToken -> Error without hitting the network', async () => {
    const request = jest.fn();
    const res = await testNtfyConnection(request, {
      serverUrl: 'https://ntfy.sh', authType: 'accessToken', accessToken: '',
    });
    expect(res.status).toBe('Error');
    expect(request).not.toHaveBeenCalled();
  });

  it('basicAuth with missing password -> Error without hitting the network', async () => {
    const request = jest.fn();
    const res = await testNtfyConnection(request, {
      serverUrl: 'https://ntfy.sh', authType: 'basicAuth', username: 'alice',
    });
    expect(res.status).toBe('Error');
    expect(request).not.toHaveBeenCalled();
  });

  it('401 from server -> Error mentioning the status code', async () => {
    const request = jest.fn().mockRejectedValue({ statusCode: 401 });
    const res = await testNtfyConnection(request, {
      serverUrl: 'https://ntfy.sh', authType: 'accessToken', accessToken: 'tk_bad',
    });
    expect(res.status).toBe('Error');
    expect(res.message).toMatch(/401/);
  });

  it('strips trailing slash from serverUrl in the request URL', async () => {
    const request = jest.fn().mockResolvedValue({ username: 'phil', role: 'user' });
    await testNtfyConnection(request, {
      serverUrl: 'https://ntfy.sh/', authType: 'accessToken', accessToken: 'tk_v',
    });
    expect(request.mock.calls[0][0]).toMatchObject({ uri: 'https://ntfy.sh/v1/account' });
  });
});

describe('parseStreamLine', () => {
  it('returns null for empty line', () => {
    expect(parseStreamLine('')).toBeNull();
    expect(parseStreamLine('   ')).toBeNull();
  });

  it('returns null for non-message events', () => {
    expect(parseStreamLine('{"event":"open","id":"abc"}')).toBeNull();
    expect(parseStreamLine('{"event":"keepalive","id":"def"}')).toBeNull();
  });

  it('returns parsed object for message events', () => {
    const line = '{"id":"abc123","event":"message","topic":"alerts","message":"Hello","time":1716000000}';
    const result = parseStreamLine(line);
    expect(result).toEqual({ id: 'abc123', event: 'message', topic: 'alerts', message: 'Hello', time: 1716000000 });
  });

  it('returns null for malformed JSON', () => {
    expect(parseStreamLine('not json')).toBeNull();
    expect(parseStreamLine('{broken')).toBeNull();
  });

  it('returns null for JSON primitives (number, string)', () => {
    expect(parseStreamLine('123')).toBeNull();
    expect(parseStreamLine('"hello"')).toBeNull();
  });

  it('returns null for JSON arrays', () => {
    expect(parseStreamLine('[]')).toBeNull();
    expect(parseStreamLine('[1,2,3]')).toBeNull();
  });

  it('returns null for object without event field', () => {
    expect(parseStreamLine('{"id":"abc","topic":"test"}')).toBeNull();
  });
});
