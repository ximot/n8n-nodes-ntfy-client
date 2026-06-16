import {
  ICredentialTestFunctions,
  ICredentialsDecrypted,
  IDataObject,
  IExecuteFunctions,
  INodeCredentialTestResult,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeConnectionTypes,
  NodeOperationError,
} from 'n8n-workflow';
import {
  buildSendHeaders,
  testNtfyConnection,
  buildAdditionalHeaders,
  CUSTOM_HEADER_VALUE,
  NtfyApiCredentials,
  AdditionalHeaderEntry,
} from '../utils';

export class NtfySend implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Ntfy Send',
    name: 'ntfySend',
    icon: 'file:ntfy.svg',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["topic"]}}',
    description: 'Send a notification to an ntfy topic',
    defaults: { name: 'Ntfy Send' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'ntfyApi', required: true, testedBy: 'testNtfyApiCredentials' }],
    properties: [
      {
        displayName: 'Topic',
        name: 'topic',
        type: 'string',
        default: '',
        required: true,
        description: 'Topic name to publish to (e.g. "my-alerts")',
        placeholder: 'my-alerts',
      },
      {
        displayName: 'Message',
        name: 'message',
        type: 'string',
        typeOptions: { rows: 3 },
        default: '',
        required: true,
        description: 'Notification message body',
      },
      {
        displayName: 'Title',
        name: 'title',
        type: 'string',
        default: '',
        description: 'Notification title (optional)',
      },
      {
        displayName: 'Priority',
        name: 'priority',
        type: 'options',
        options: [
          { name: 'Min (1)', value: '1' },
          { name: 'Low (2)', value: '2' },
          { name: 'Default (3)', value: '3' },
          { name: 'High (4)', value: '4' },
          { name: 'Urgent (5)', value: '5' },
        ],
        default: '3',
        description: 'Notification priority',
      },
      {
        displayName: 'Tags',
        name: 'tags',
        type: 'string',
        default: '',
        description: 'Comma-separated tags or emoji (e.g. "warning,📦")',
        placeholder: 'warning,📦',
      },
      {
        displayName: 'Additional Headers',
        name: 'additionalHeaders',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        description: 'Extra ntfy headers. Pick a common one or choose "Custom…" to enter any header.',
        options: [
          {
            displayName: 'Header',
            name: 'header',
            values: [
              {
                displayName: 'Name',
                name: 'name',
                type: 'options',
                default: 'X-Click',
                description: 'Which ntfy header to set',
                options: [
                  { name: 'Click Action URL', value: 'X-Click', description: 'URL opened when the notification is tapped' },
                  { name: 'Attachment URL', value: 'X-Attach', description: 'Attach a file or image by URL' },
                  { name: 'Attachment Filename', value: 'X-Filename', description: 'Display name for the attachment' },
                  { name: 'Icon URL', value: 'X-Icon', description: 'Custom notification icon URL' },
                  { name: 'Format as Markdown', value: 'X-Markdown', description: 'Render the message as Markdown (set value to "true")' },
                  { name: 'Delay / Schedule', value: 'X-Delay', description: 'Delay delivery, e.g. "30min", "tomorrow", "9am"' },
                  { name: 'Custom…', value: CUSTOM_HEADER_VALUE, description: 'Enter any ntfy header name manually' },
                ],
              },
              {
                displayName: 'Custom Name',
                name: 'customName',
                type: 'string',
                default: '',
                placeholder: 'X-Email',
                description: 'Header name (e.g. X-Email, X-Call, X-Actions)',
                displayOptions: { show: { name: [CUSTOM_HEADER_VALUE] } },
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
                placeholder: 'https://example.com',
                description: 'Header value. Must be ASCII (see README).',
              },
            ],
          },
        ],
      },
    ],
  };

  methods = {
    credentialTest: {
      async testNtfyApiCredentials(
        this: ICredentialTestFunctions,
        credential: ICredentialsDecrypted,
      ): Promise<INodeCredentialTestResult> {
        return testNtfyConnection(
          (opts) => this.helpers.request(opts),
          credential.data as unknown as NtfyApiCredentials,
        );
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = (await this.getCredentials('ntfyApi')) as NtfyApiCredentials;
    const serverUrl = credentials.serverUrl.replace(/\/+$/, '');

    for (let i = 0; i < items.length; i++) {
      try {
        const topic = this.getNodeParameter('topic', i) as string;
        const message = this.getNodeParameter('message', i) as string;
        const title = this.getNodeParameter('title', i) as string;
        const priority = this.getNodeParameter('priority', i) as string;
        const tags = this.getNodeParameter('tags', i) as string;
        const additionalHeaders = this.getNodeParameter('additionalHeaders', i) as {
          header?: AdditionalHeaderEntry[];
        };

        const headers = buildSendHeaders(credentials, { title, priority, tags });

        try {
          Object.assign(headers, buildAdditionalHeaders(additionalHeaders.header ?? []));
        } catch (error) {
          throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex: i });
        }

        const response = await this.helpers.httpRequest({
          method: 'POST',
          url: `${serverUrl}/${encodeURIComponent(topic)}`,
          headers,
          body: message,
        });

        returnData.push({
          json: (response !== null && typeof response === 'object' ? response : { response }) as IDataObject,
          pairedItem: { item: i },
        });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: { item: i },
          });
          continue;
        }
        if (error instanceof NodeOperationError) throw error;
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
      }
    }

    return [returnData];
  }
}
