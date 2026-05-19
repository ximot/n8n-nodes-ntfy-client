import {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  ITriggerFunctions,
  ITriggerResponse,
  NodeConnectionTypes,
} from 'n8n-workflow';
import got, { RequestError } from 'got';
import { buildAuthHeader, buildTopicUrl, parseStreamLine, NtfyApiCredentials } from '../utils';

export class NtfyTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Ntfy Trigger',
    name: 'ntfyTrigger',
    icon: 'file:ntfy.svg',
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["topics"]}}',
    description: 'Triggers when a message is received on one or more ntfy topics',
    defaults: { name: 'Ntfy Trigger' },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'ntfyApi', required: true }],
    properties: [
      {
        displayName: 'Topics',
        name: 'topics',
        type: 'string',
        default: '',
        required: true,
        description: 'Topic name(s) to subscribe to. Use commas for multiple: "alerts,backup,system"',
        placeholder: 'alerts',
      },
      {
        displayName: 'Since',
        name: 'since',
        type: 'options',
        options: [
          { name: 'New messages only', value: 'new' },
          { name: 'Last 10 minutes', value: '10m' },
          { name: 'Last 1 hour', value: '1h' },
          { name: 'All cached messages', value: 'all' },
        ],
        default: 'new',
        description: 'Which messages to receive when first connecting',
      },
    ],
  };

  async trigger(this: ITriggerFunctions): Promise<ITriggerResponse | undefined> {
    const credentials = (await this.getCredentials('ntfyApi')) as NtfyApiCredentials;
    const topics = this.getNodeParameter('topics') as string;
    const since = this.getNodeParameter('since') as string;

    const url = buildTopicUrl(credentials.serverUrl, topics);
    const searchParams: Record<string, string> = since !== 'new' ? { since } : {};
    const headers = buildAuthHeader(credentials);

    let activeStream: ReturnType<typeof got.stream> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    let isClosed = false;

    const startStream = (): void => {
      if (isClosed) return;

      // Tear down any previous stream before creating a new one
      if (activeStream) {
        activeStream.removeAllListeners();
        activeStream.destroy();
      }

      activeStream = got.stream(url, { headers, searchParams, retry: { limit: 0 } });

      let buffer = '';

      activeStream.on('data', (chunk: Buffer) => {
        if (isClosed) return;

        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const msg = parseStreamLine(line);
          if (msg) {
            retryCount = 0;
            this.emit([[{ json: msg as IDataObject }]]);
          }
        }
      });

      activeStream.on('end', () => {
        if (!isClosed) {
          retryCount = 0;
          clearTimeout(retryTimer);
          retryTimer = setTimeout(startStream, 1000);
        }
      });

      activeStream.on('error', (err: Error) => {
        if (isClosed) return;

        // Fail fast on auth errors — retrying won't help
        const statusCode = err instanceof RequestError ? err.response?.statusCode : undefined;
        if (statusCode === 401 || statusCode === 403) {
          if (activeStream) {
            activeStream.removeAllListeners();
            activeStream.destroy();
            activeStream = undefined;
          }
          this.emitError(
            new Error(`Ntfy Trigger: authentication failed (HTTP ${statusCode}). Check your credentials.`),
          );
          return;
        }

        if (retryCount >= MAX_RETRIES) {
          if (activeStream) {
            activeStream.removeAllListeners();
            activeStream.destroy();
            activeStream = undefined;
          }
          this.emitError(
            new Error(
              `Ntfy Trigger: connection to ${url} failed after ${MAX_RETRIES} retries. Last error: ${err.message}`,
            ),
          );
          return;
        }
        retryCount++;
        const delay = Math.pow(2, retryCount - 1) * 1000;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(startStream, delay);
      });
    };

    startStream();

    return {
      closeFunction: async () => {
        isClosed = true;
        if (retryTimer !== undefined) clearTimeout(retryTimer);
        retryTimer = undefined;
        if (activeStream) {
          activeStream.removeAllListeners();
          activeStream.destroy();
        }
        activeStream = undefined;
      },
    };
  }
}
