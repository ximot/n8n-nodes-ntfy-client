# Ntfy Header Name Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text header `Name` field in Ntfy Send with a friendly dropdown of common ntfy headers plus a `Custom…` escape hatch, with header-resolution logic extracted to a tested `utils.ts` function. Release as 0.2.1.

**Architecture:** A pure `buildAdditionalHeaders(entries)` function in `utils.ts` resolves each collection entry (predefined option value or custom name) into a `Record<string,string>`, validates names, and skips empty entries. `NtfySend.node.ts` swaps the `Name` string input for an `options` dropdown + conditional `Custom Name` field and delegates the loop to the new function.

**Tech Stack:** TypeScript, n8n-workflow node API, Jest.

**Branch:** `feat/header-dropdown` (already checked out; do NOT push to `master`).

---

## File Structure

- `src/nodes/utils.ts` — add `CUSTOM_HEADER_VALUE`, `VALID_HEADER_NAME`, `AdditionalHeaderEntry`, `buildAdditionalHeaders()`. This is where the testable logic lives, next to the existing `buildSendHeaders`.
- `src/nodes/NtfySend/NtfySend.node.ts` — change the `additionalHeaders` property definition (dropdown + custom field) and replace the inline header loop in `execute()` with a call to `buildAdditionalHeaders`. Remove the now-duplicated local `VALID_HEADER_NAME` regex.
- `src/__tests__/utils.test.ts` — add a `describe('buildAdditionalHeaders')` block.
- `README.md` — rewrite the "Additional headers" section for the new dropdown UX.
- `package.json` — bump version 0.2.0 → 0.2.1.

---

## Task 1: `buildAdditionalHeaders` in utils.ts (TDD)

**Files:**
- Modify: `src/nodes/utils.ts`
- Test: `src/__tests__/utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this import-extension and describe block to `src/__tests__/utils.test.ts`. Change the existing top import line to also pull in the new symbols:

```ts
import {
  buildAuthHeader,
  buildTopicUrl,
  buildSendHeaders,
  parseStreamLine,
  testNtfyConnection,
  buildAdditionalHeaders,
  CUSTOM_HEADER_VALUE,
  NtfyApiCredentials,
} from '../nodes/utils';
```

Then append at the end of the file:

```ts
describe('buildAdditionalHeaders', () => {
  it('returns empty object for no entries', () => {
    expect(buildAdditionalHeaders([])).toEqual({});
  });

  it('maps a predefined header 1:1', () => {
    const headers = buildAdditionalHeaders([{ name: 'X-Click', value: 'https://example.com' }]);
    expect(headers).toEqual({ 'X-Click': 'https://example.com' });
  });

  it('uses customName when name is the custom sentinel', () => {
    const headers = buildAdditionalHeaders([
      { name: CUSTOM_HEADER_VALUE, customName: 'X-Email', value: 'me@example.com' },
    ]);
    expect(headers).toEqual({ 'X-Email': 'me@example.com' });
  });

  it('skips a custom entry with an empty customName', () => {
    expect(buildAdditionalHeaders([{ name: CUSTOM_HEADER_VALUE, customName: '', value: 'x' }])).toEqual({});
  });

  it('throws on an invalid custom header name', () => {
    expect(() =>
      buildAdditionalHeaders([{ name: CUSTOM_HEADER_VALUE, customName: 'X Bad', value: 'x' }]),
    ).toThrow(/Invalid header name/);
  });

  it('skips an entry with an empty value', () => {
    expect(buildAdditionalHeaders([{ name: 'X-Click', value: '' }])).toEqual({});
  });

  it('last duplicate wins', () => {
    const headers = buildAdditionalHeaders([
      { name: 'X-Click', value: 'https://first.example' },
      { name: 'X-Click', value: 'https://second.example' },
    ]);
    expect(headers).toEqual({ 'X-Click': 'https://second.example' });
  });

  it('trims whitespace around name and value', () => {
    const headers = buildAdditionalHeaders([
      { name: CUSTOM_HEADER_VALUE, customName: '  X-Icon  ', value: '  https://i.example/x.png  ' },
    ]);
    expect(headers).toEqual({ 'X-Icon': 'https://i.example/x.png' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- utils.test.ts`
Expected: FAIL — `buildAdditionalHeaders` / `CUSTOM_HEADER_VALUE` not exported (TS compile error or "is not a function").

- [ ] **Step 3: Implement the function in utils.ts**

Append to `src/nodes/utils.ts`:

```ts
export const CUSTOM_HEADER_VALUE = '__custom__';

// RFC 7230 token: header names may contain letters, digits and these symbols.
export const VALID_HEADER_NAME = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

export interface AdditionalHeaderEntry {
  name: string;
  customName?: string;
  value: string;
}

/**
 * Resolves Additional Headers collection entries into a header map.
 * - `name === CUSTOM_HEADER_VALUE` uses `customName`, otherwise `name` is the header.
 * - Entries with an empty effective name or empty value are skipped.
 * - Throws on an invalid header name (RFC 7230 token). On duplicates, the last wins.
 */
export function buildAdditionalHeaders(entries: AdditionalHeaderEntry[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of entries) {
    const name = (entry.name === CUSTOM_HEADER_VALUE ? entry.customName : entry.name)?.trim();
    const value = entry.value?.trim();
    if (!name || !value) continue;
    if (!VALID_HEADER_NAME.test(name)) {
      throw new Error(
        `Invalid header name: "${name}". Header names may only contain letters, digits, and hyphens.`,
      );
    }
    headers[name] = value;
  }
  return headers;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- utils.test.ts`
Expected: PASS — all `buildAdditionalHeaders` tests plus the existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/nodes/utils.ts src/__tests__/utils.test.ts
git commit -m "feat: add buildAdditionalHeaders helper with tests"
```

---

## Task 2: Wire the dropdown into NtfySend.node.ts

**Files:**
- Modify: `src/nodes/NtfySend/NtfySend.node.ts:15` (remove local regex)
- Modify: `src/nodes/NtfySend/NtfySend.node.ts:13` (import)
- Modify: `src/nodes/NtfySend/NtfySend.node.ts:78-107` (property definition)
- Modify: `src/nodes/NtfySend/NtfySend.node.ts:139-155` (execute loop)

- [ ] **Step 1: Update the import and remove the local regex**

Change the import on line 13 to add the new symbols:

```ts
import {
  buildSendHeaders,
  testNtfyConnection,
  buildAdditionalHeaders,
  CUSTOM_HEADER_VALUE,
  NtfyApiCredentials,
  AdditionalHeaderEntry,
} from '../utils';
```

Delete line 15 entirely (the local `const VALID_HEADER_NAME = ...`); it now lives in `utils.ts`.

- [ ] **Step 2: Replace the `additionalHeaders` property definition**

Replace the whole `additionalHeaders` object (currently lines 78-107) with:

```ts
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
```

- [ ] **Step 3: Replace the execute() header loop**

Replace the current block (lines 139-155 — the `additionalHeaders` getNodeParameter cast plus the `for (const { name, value } ...)` loop) with:

```ts
        const additionalHeaders = this.getNodeParameter('additionalHeaders', i) as {
          header?: AdditionalHeaderEntry[];
        };

        const headers = buildSendHeaders(credentials, { title, priority, tags });

        try {
          Object.assign(headers, buildAdditionalHeaders(additionalHeaders.header ?? []));
        } catch (error) {
          throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex: i });
        }
```

Note: the original code declared `const headers = buildSendHeaders(...)` on line 143 between the getNodeParameter calls and the loop. The replacement above keeps that single `const headers` declaration — make sure there is exactly one `const headers =` in `execute()` after this edit (remove the original line 143 if it would otherwise duplicate).

- [ ] **Step 4: Build to verify it compiles**

Run: `npm run build`
Expected: PASS — `tsc` completes with no errors and copies the svg files.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS — no eslint errors in `src`.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green (no node-level test exists for the loop; coverage is via `buildAdditionalHeaders` unit tests from Task 1).

- [ ] **Step 7: Commit**

```bash
git add src/nodes/NtfySend/NtfySend.node.ts
git commit -m "feat: ntfy header name dropdown with Custom escape hatch"
```

---

## Task 3: Docs and version bump

**Files:**
- Modify: `README.md:18` and `README.md:20-35`
- Modify: `package.json` (version)

- [ ] **Step 1: Update the README parameter table row**

Replace line 18:

```markdown
| Additional Headers | | Extra ntfy headers. Pick a common one from the dropdown (Click URL, Attachment, Icon, Markdown, Delay…) or choose **Custom…** to enter any header by name |
```

- [ ] **Step 2: Rewrite the "Additional headers" prose**

Replace the paragraph at line 22 (keep the table at 24-32 and the ASCII warning blockquote at line 35 unchanged):

```markdown
The **Additional Headers** field lets you set extra ntfy headers without knowing their exact names. Pick one from the **Name** dropdown (friendly labels for the most common ones) or choose **Custom…** to type any ntfy header name yourself, unlocking the full ntfy feature set beyond the built-in fields:
```

- [ ] **Step 3: Update the validation sentence**

Replace line 33:

```markdown
Custom header names are validated as RFC 7230 tokens (letters, digits, and `` !#$%&'*+-.^_`|~ ``); an invalid name fails the node with a clear error. Entries with an empty name or empty value are skipped.
```

- [ ] **Step 4: Bump the version**

In `package.json`, change `"version": "0.2.0"` to `"version": "0.2.1"`.

- [ ] **Step 5: Verify build still passes after doc/version changes**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md package.json
git commit -m "docs: document header dropdown; bump version to 0.2.1"
```

---

## Self-Review Notes

- **Spec coverage:** UI struct (Task 2 Step 2) ✓; dropdown options incl. Custom… (Task 2 Step 2) ✓; `buildAdditionalHeaders` extraction (Task 1) ✓; execute() wiring + NodeOperationError with itemIndex (Task 2 Step 3) ✓; skip-empty-value behavior change (Task 1 logic + test) ✓; backward compat via real header names as option values (Task 2 Step 2) ✓; all 8 test cases (Task 1 Step 1) ✓; version bump + README (Task 3) ✓.
- **Type consistency:** `AdditionalHeaderEntry`, `buildAdditionalHeaders`, `CUSTOM_HEADER_VALUE`, `VALID_HEADER_NAME` defined in Task 1 and consumed by the same names in Task 2.
- **No push to master:** all commits stay on `feat/header-dropdown`.
