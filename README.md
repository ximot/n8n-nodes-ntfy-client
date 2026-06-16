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
| Additional Headers | | Extra ntfy headers. Pick a common one from the dropdown (Click URL, Attachment, Icon, Markdown, Delay…) or choose **Custom…** to enter any header by name |

#### Additional headers

The **Additional Headers** field lets you set extra ntfy headers without knowing their exact names. Pick one from the **Name** dropdown (friendly labels for the most common ones) or choose **Custom…** to type any ntfy header name yourself, unlocking the full ntfy feature set beyond the built-in fields:

| Header | Purpose |
|--------|---------|
| `X-Markdown` | Render the message body as Markdown (set to `true`) |
| `X-Click` | URL opened when the notification is tapped |
| `X-Attach` | Attach a file or image by URL |
| `X-Actions` | Add action buttons to the notification |
| `X-Email` | Forward the notification to an email address |
| `X-Icon` | Custom notification icon URL |

The **Name** dropdown offers the most common of these as ready-to-pick options; any header not listed (e.g. `X-Actions`, `X-Email`, `X-Call`) is still available via **Custom…**.

Custom header names are validated as RFC 7230 tokens (letters, digits, and `` !#$%&'*+-.^_`|~ ``); an invalid name fails the node with a clear error. Entries with an empty name or empty value are skipped.

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
| `None` | `GET /v1/health` | Server is reachable (anonymous) |
| `Basic Auth` | `GET /v1/account` | Username and password actually authenticate a (non-anonymous) account |
| `Access Token` | `GET /v1/account` | Token is valid, not revoked, and authenticates a (non-anonymous) account |

A green result means the credential reached the server and — for `Basic Auth` / `Access Token` — authenticated a real account. A red result means the server is unreachable, the credentials are empty, or they were rejected / silently treated as anonymous.

> **What the test does *not* check.** ntfy's `/v1/account` returns `200` even for anonymous requests, so the test verifies your **account/token**, not your **per-topic permissions** — the credential has no knowledge of the topic (that's set on the node). A green test does **not** guarantee you can publish to a specific auth-protected topic; that depends on the topic's access-control rules on the server. Likewise, `None` only confirms the server is up — it cannot validate access to a protected topic.

## Requirements

- n8n `>=1.0.0`
- Node.js `>=22`
- ntfy server (self-hosted or public `ntfy.sh`)

## License

MIT
