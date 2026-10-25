# Pi Background Tab Bridge

A Chrome Manifest V3 extension and local bridge that let Pi inspect and interact with one user-approved Chrome tab without intentionally bringing it to the foreground. The extension uses your existing Chrome profile and its signed-in sessions.

## Requirements

- Node.js 18 or newer
- Google Chrome

## Start the local bridge

From the project directory:

```sh
npm ci
npm start
```

The bridge listens only on `127.0.0.1:43127`. On first startup it generates a random 128-bit token, prints it to the console, and writes it to `.pi-bridge-token` with restrictive file permissions. Later starts reuse that saved token, so the extension stays paired across bridge restarts. Set `PI_BRIDGE_TOKEN` before `npm start` only when you intentionally want to override the saved token. The token file is git-ignored.

Keep the bridge process running while using the extension.

## Install the global command

Run this once from the project directory to make the bridge command available from any working directory:

```sh
npm run setup:global
```

The command wraps this project's bridge and client. Use it from anywhere:

```sh
pi-background-tab-bridge health
pi-background-tab-bridge status
pi-background-tab-bridge token
pi-background-tab-bridge command '{"type":"snapshot"}'
```

Start it in the foreground with `pi-background-tab-bridge start`; stop it with Ctrl-C. The global `start` command hides the token in its output. Use `pi-background-tab-bridge token` to display the saved token when pairing the extension, or run `npm start` in your own terminal for initial setup. When started as a Pi background job, stop that specific job when the browser task is done.

## Install and approve the extension

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose this project directory.
3. Open the page you want Pi to control and select the extension icon.
4. Paste the bridge token printed at startup and select **Allow Pi to use this tab**.
5. To allow the extension to script pages across sites, select **Allow Pi on all websites** and approve Chrome's permission prompt.
6. The approved tab can remain in the background while you use a different tab.

Tab approval and site permission are distinct. The broad host permission enables scripting on websites, but bridge commands are sent only to the tab ID explicitly approved in the popup. Chrome internal pages and other protected pages cannot be scripted. Chrome requires a user gesture to grant tab access and a separate approval for broad host permissions.

After changing extension files or its manifest, reload the unpacked extension at `chrome://extensions`. Extension storage retains its saved tab and token unless extension storage is cleared or the extension is removed.

## Check the connection

The read-only health endpoint does not require the token:

```sh
curl -s http://127.0.0.1:43127/health
```

It returns `{"connected":true}` when the extension has an active connection. For the approved tab ID as well, use:

```sh
node client.mjs status
```

If the bridge reports that no tab is connected, open the extension popup on the intended tab and approve it again. Confirm the popup token matches the bridge's current startup token.

## Send commands

`client.mjs` reads the ignored token file and authenticates requests without putting the token in command arguments:

```sh
node client.mjs '{"type":"snapshot"}'
node client.mjs '{"type":"inspect"}'
node client.mjs '{"type":"clickText","text":"Search"}'
node client.mjs '{"type":"type","selector":"textarea","text":"example query"}'
node client.mjs '{"type":"navigate","url":"https://example.com"}'
```

Supported command types:

| Type | Parameters | Behavior |
|---|---|---|
| `snapshot` | None | Returns page title, URL, and up to 12,000 characters of visible page text. |
| `inspect` | None | Lists common controls with visible text and accessibility attributes. Prefer stable IDs or accessibility labels; generated positional selectors may not be reliable. |
| `click` | `selector` | Clicks the first element matching a CSS selector. |
| `clickText` | `text` | Clicks a button-like control with exactly matching text. Fails if the match is ambiguous. |
| `type` | `selector`, `text` | Sets the value of an input or textarea, or text content of another selected element, and dispatches input events. |
| `navigate` | `url` | Navigates the approved tab to an HTTP or HTTPS URL without intentionally activating it. |
| `evaluate` | `code` | Experimental arbitrary JavaScript execution. It returned `null` in testing; do not depend on it until verified in your environment. |

The authenticated local API is also available at `GET /status` and `POST /command`; requests require `Authorization: Bearer <token>`. The bridge returns HTTP 503 when no approved tab is connected, 504 when an extension command times out, and 401 for an invalid token.

## Reliable browser workflows

A successful `navigate` response means navigation was requested, not that the destination finished loading. The next snapshot may still show the previous page or an intermediate state. Verify its URL and title, and wait for an explicit loaded state before interpreting results. For search pages, confirm the final result count or message; do not conclude there are no results while the page says it is loading.

After applying filters, verify that each requested filter is active and inspect the final results. Report whether prices are per person or total, and note fees or availability caveats shown by the site. Background tabs can be throttled, and DOM-based clicks or typing are not identical to trusted physical input.

## Security and privacy

The bearer token authorizes commands against the approved tab, including page interaction. The bridge binds only to loopback, and the token file is excluded from Git, but local processes running as your account may still be able to access it. Do not commit or share `.pi-bridge-token`, logs containing the startup token, or browser data. The `token` subcommand deliberately reveals the bearer token for extension pairing; only show it to the trusted user who controls the browser. Treat `evaluate` as arbitrary code execution in the approved page and use this prototype only with a trusted local Pi process. The health endpoint reveals only whether an extension is connected.

This project currently provides a local command-line bridge, not a built-in Pi tool or provider integration.

## License

Distributed under the [MIT License](LICENSE).
