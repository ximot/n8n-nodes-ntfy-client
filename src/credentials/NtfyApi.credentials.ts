import {
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class NtfyApi implements ICredentialType {
  name = 'ntfyApi';
  displayName = 'Ntfy API';
  documentationUrl = 'https://docs.ntfy.sh/config/';

  properties: INodeProperties[] = [
    {
      displayName: 'Server URL',
      name: 'serverUrl',
      type: 'string',
      default: 'https://ntfy.sh',
      description: 'URL of the ntfy server. Use https://ntfy.sh for the public server or your self-hosted address.',
      required: true,
    },
    {
      displayName: 'Authentication Type',
      name: 'authType',
      type: 'options',
      options: [
        { name: 'None', value: 'none' },
        { name: 'Basic Auth (username + password)', value: 'basicAuth' },
        { name: 'Access Token', value: 'accessToken' },
      ],
      default: 'none',
      description: 'How to authenticate with the ntfy server',
    },
    {
      displayName: 'Username',
      name: 'username',
      type: 'string',
      default: '',
      displayOptions: { show: { authType: ['basicAuth'] } },
    },
    {
      displayName: 'Password',
      name: 'password',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      displayOptions: { show: { authType: ['basicAuth'] } },
    },
    {
      displayName: 'Access Token',
      name: 'accessToken',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'ntfy access token (e.g. tk_AgQdq7mVBoFD37zQVN29RhuMzNIz2)',
      displayOptions: { show: { authType: ['accessToken'] } },
    },
  ];

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.serverUrl}}',
      url: '/v1/health',
      method: 'GET',
    },
  };
}
