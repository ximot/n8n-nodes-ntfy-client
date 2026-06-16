# n8n-nodes-ntfy-client

n8n community node package for [ntfy](https://ntfy.sh) — a simple HTTP-based pub-sub notification service. Supports self-hosted and public `ntfy.sh` servers.

## Nodes

### Ntfy Send

Publishes a notification to an ntfy topic. Runs once per workflow execution.

| Parameter | Required | Description |
|-----------|----------|-------------|
| Topic | ✓ | Topic name to publish to (e.g. `my-alerts`) |
| Message | ✓ | Notification body text |
| Title | | Notification title |
| Priority | | `Min (1)` / `Low (2)` / `Default (3)` / `High (4)` / `Urgent (5)` |
| Tags | | Comma-separated tags or emoji (e.g. `warning,📦`) |
| Additional Headers | | Extra ntfy headers as Name/Value pairs (e.g. `X-Markdown: true`, `X-Click`, `X-Attach`) |

#### Additional headers

The **Additional Headers** field passes arbitrary ntfy headers straight to the publish request, unlocking the full ntfy feature set beyond the built-in fields:

| Header | Purpose |
|--------|---------|
| `X-Markdown` | Render the message body as Markdown (set to `true`) |
| `X-Click` | URL opened when the notification is tapped |
| `X-Attach` | Attach a file or image by URL |
| `X-Actions` | Add action buttons to the notification |
| `X-Email` | Forward the notification to an email address |
| `X-Icon` | Custom notification icon URL |

Header names are validated as RFC 7230 tokens (letters, digits, and `` !#$%&'*+-.^_`|~ ``); an invalid name fails the node with a clear error. Empty names are skipped.

> **Header values must be ASCII.** HTTP headers are transmitted as latin-1, so non-ASCII characters (accented letters like `ó`/`ł`, or emoji) in a *header value* — including the built-in `Title` / `Tags` fields and any Additional Header such as an `X-Actions` button label — may be shown as `?` or rejected by ntfy with `400 Bad Request`. The message **body** is sent as UTF-8 and is unaffected (so Polish text, emoji, etc. work fine in the message itself). To use non-ASCII in a header value, encode it as [RFC 2047](https://datatracker.ietf.org/doc/html/rfc2047), e.g. `=?UTF-8?B?T3R3w7NyeiBDb29saWZ5?=` renders as "Otwórz Coolify".

### Ntfy Trigger

Subscribes to one or more ntfy topics using a persistent JSON stream. Triggers the workflow for each incoming message.

| Parameter | Required | Description |
|-----------|----------|-------------|
| Topics | ✓ | Topic name(s). Use commas for multiple: `alerts,backup,system` |
| Since | | `New messages only` (default) / `Last 10 minutes` / `Last 1 hour` / `All cached` |

**Output** — the full ntfy message object:
```json
{
  "id": "abc123",
  "time": 1716000000,
  "topic": "alerts",
  "event": "message",
  "message": "Server is down",
  "title": "Alert",
  "priority": 5,
  "tags": ["warning"]
}
```

On connection loss the trigger reconnects automatically with exponential backoff (up to 5 retries). Authentication errors (401/403) surface immediately without retrying.

## Installation

In your n8n instance go to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-ntfy-client
```

## Credentials — Ntfy API

After installing, create a new credential of type **Ntfy API**:

| Field | Description |
|-------|-------------|
| Server URL | `https://ntfy.sh` for the public server, or your self-hosted address |
| Authentication Type | `None` / `Basic Auth` / `Access Token` |
| Username / Password | Shown when `Basic Auth` is selected |
| Access Token | Shown when `Access Token` is selected |

### Connection test

Click **Save & Test** after filling in the credential — n8n will validate it immediately:

| Auth type | Test endpoint | What it verifies |
|-----------|--------------|------------------|
| `None` | `GET /v1/health` | Server is reachable |
| `Basic Auth` | `GET /v1/account` | Username and password are accepted |
| `Access Token` | `GET /v1/account` | Token is valid and not revoked |

A green **Connection successful** means the credential is ready to use. A red **Authentication failed (HTTP 401/403)** means the password or token is wrong — fix it before activating any workflow that uses this credential.

## Requirements

- n8n `>=1.0.0`
- Node.js `>=22`
- ntfy server (self-hosted or public `ntfy.sh`)

## License

MIT
