import {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeConnectionTypes,
  NodeOperationError,
} from 'n8n-workflow';
import { buildSendHeaders, NtfyApiCredentials } from '../utils';

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
    credentials: [{ name: 'ntfyApi', required: true }],
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
    ],
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

        const headers = buildSendHeaders(credentials, { title, priority, tags });

        const response = await this.helpers.httpRequest({
          method: 'POST',
          url: `${serverUrl}/${topic}`,
          headers,
          body: message,
        });

        returnData.push({
          json: response as IDataObject,
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
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
      }
    }

    return [returnData];
  }
}
