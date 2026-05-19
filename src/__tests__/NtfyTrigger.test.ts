import { EventEmitter } from 'events';
import got, { RequestError } from 'got';
import { NtfyTrigger } from '../nodes/NtfyTrigger/NtfyTrigger.node';

jest.mock('got', () => ({
  stream: jest.fn(),
  RequestError: jest.requireActual('got').RequestError,
}));

const mockedGotStream = got.stream as unknown as jest.Mock;

function makeStream() {
  const ee = new EventEmitter() as EventEmitter & { destroy: jest.Mock };
  ee.destroy = jest.fn();
  return ee;
}

function makeAuthError(statusCode: 401 | 403): RequestError {
  const err = new RequestError('HTTP error', {}, { options: { url: new URL('https://ntfy.sh') } } as any);
  (err as any).response = { statusCode };
  return err;
}

function makeContext() {
  return {
    getCredentials: jest.fn().mockResolvedValue({
      serverUrl: 'https://ntfy.sh',
      authType: 'none',
    }),
    getNodeParameter: jest.fn().mockImplementation((name: string) => {
      if (name === 'topics') return 'test';
      if (name === 'since') return 'new';
      return '';
    }),
    emit: jest.fn(),
    emitError: jest.fn(),
  };
}

describe('NtfyTrigger', () => {
  let stream: ReturnType<typeof makeStream>;

  beforeEach(() => {
    stream = makeStream();
    mockedGotStream.mockReturnValue(stream);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('authentication errors', () => {
    it('calls emitError on HTTP 401', async () => {
      const ctx = makeContext();
      const node = new NtfyTrigger();
      await node.trigger.call(ctx as any);

      stream.emit('error', makeAuthError(401));

      expect(ctx.emitError).toHaveBeenCalledTimes(1);
      expect((ctx.emitError as jest.Mock).mock.calls[0][0].message).toContain(
        'authentication failed (HTTP 401)',
      );
    });

    it('calls emitError on HTTP 403', async () => {
      const ctx = makeContext();
      const node = new NtfyTrigger();
      await node.trigger.call(ctx as any);

      stream.emit('error', makeAuthError(403));

      expect(ctx.emitError).toHaveBeenCalledTimes(1);
      expect((ctx.emitError as jest.Mock).mock.calls[0][0].message).toContain(
        'authentication failed (HTTP 403)',
      );
    });

    it('does not retry after auth error', async () => {
      jest.useFakeTimers();
      const ctx = makeContext();
      const node = new NtfyTrigger();
      await node.trigger.call(ctx as any);

      stream.emit('error', makeAuthError(401));

      jest.runAllTimers();

      expect(mockedGotStream).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconnect stream lifecycle', () => {
    it('destroys the previous stream when reconnecting after end', async () => {
      jest.useFakeTimers();
      const ctx = makeContext();
      const node = new NtfyTrigger();
      await node.trigger.call(ctx as any);

      const firstStream = stream;
      const secondStream = makeStream();
      mockedGotStream.mockReturnValue(secondStream);

      firstStream.emit('end');
      jest.advanceTimersByTime(1000);

      expect(firstStream.destroy).toHaveBeenCalled();
      expect(mockedGotStream).toHaveBeenCalledTimes(2);
    });

    it('destroys the previous stream when reconnecting after error', async () => {
      jest.useFakeTimers();
      const ctx = makeContext();
      const node = new NtfyTrigger();
      await node.trigger.call(ctx as any);

      const firstStream = stream;
      const secondStream = makeStream();
      mockedGotStream.mockReturnValue(secondStream);

      const err = Object.assign(new Error('ECONNREFUSED'), { response: undefined });
      firstStream.emit('error', err);
      jest.advanceTimersByTime(1000);

      expect(firstStream.destroy).toHaveBeenCalled();
      expect(mockedGotStream).toHaveBeenCalledTimes(2);
    });
  });

  describe('closeFunction', () => {
    it('destroys the active stream', async () => {
      const ctx = makeContext();
      const node = new NtfyTrigger();
      const response = await node.trigger.call(ctx as any);

      await response!.closeFunction!();

      expect(stream.destroy).toHaveBeenCalled();
    });

    it('cancels a pending reconnect timer so startStream does not fire again', async () => {
      jest.useFakeTimers();
      const ctx = makeContext();
      const node = new NtfyTrigger();
      const response = await node.trigger.call(ctx as any);

      stream.emit('end');
      await response!.closeFunction!();
      jest.runAllTimers();

      expect(mockedGotStream).toHaveBeenCalledTimes(1);
    });
  });

  describe('message emission', () => {
    it('emits parsed message objects on data', async () => {
      const ctx = makeContext();
      const node = new NtfyTrigger();
      await node.trigger.call(ctx as any);

      const line = '{"id":"x1","event":"message","topic":"test","message":"hello","time":1000}\n';
      stream.emit('data', Buffer.from(line));

      expect(ctx.emit).toHaveBeenCalledTimes(1);
      expect(ctx.emit.mock.calls[0][0][0][0].json).toMatchObject({
        id: 'x1',
        event: 'message',
        message: 'hello',
      });
    });

    it('does not emit for keepalive events', async () => {
      const ctx = makeContext();
      const node = new NtfyTrigger();
      await node.trigger.call(ctx as any);

      const line = '{"event":"keepalive","id":"k1"}\n';
      stream.emit('data', Buffer.from(line));

      expect(ctx.emit).not.toHaveBeenCalled();
    });
  });
});
