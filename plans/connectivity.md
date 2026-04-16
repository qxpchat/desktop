# PLAN: Connectivity Setting

## Context

Add a "Relays" settings screen that unifies proxy/relay server management with connectivity status into a single view. Delta Chat splits this across two screens (Settings → Advanced → Proxy Settings, and Settings → Connectivity); qxp merges them into one because relays *are* the connection — one screen for everything about "how am I connected."

**In scope:**
- Relay (proxy) management: enable/disable toggle, list with selection, add, delete
- Connectivity status: connected/connecting/not-connected badge, quota display
- Last sent message status
- Real-time updates via `DC_EVENT_CONNECTIVITY_CHANGED`

**Not in scope:**
- Proxy sharing via QR (deferred — needs camera/share infrastructure)
- Detailed connectivity HTML drill-down (the native summary covers the MVP need)

## Reference behaviour

### Proxy management (ProxySettingsViewController)

The reference client stores relay/proxy URLs in the `proxy_url` config key (newline-separated). The first entry is the selected (active) proxy. A boolean `proxy_enabled` config controls whether proxying is on.

**Workflow:**
1. Toggle at top enables/disables proxying (disabled when list is empty)
2. Proxy list shows each entry with its host extracted via `dc_check_qr()` → `text1` field, plus protocol badge
3. Selected proxy (first in list) has a checkmark and shows connectivity state text
4. Tapping a proxy calls `dc_set_config_from_qr()` to promote it to first position, then restarts IO
5. Add: alert with text field → validates via `dc_check_qr()` for `DC_QR_PROXY` state → `dc_set_config_from_qr()` → restart IO
6. Delete: swipe trailing → confirmation → removes from array → `setProxies()` → if deleted was selected, disable proxy → restart IO

After every mutation: `dc_accounts_stop_io()` + `dc_accounts_start_io()` (restartIO).

### Connectivity display (ConnectivityViewController)

Uses `dc_get_connectivity()` returning an int with thresholds:
- `>= DC_CONNECTIVITY_CONNECTED (1000)` → "Connected"
- `>= DC_CONNECTIVITY_WORKING (3000)` → "Updating…"
- `>= DC_CONNECTIVITY_CONNECTING (2000)` → "Connecting…"
- else → "Not connected"

Detailed info (quota, server, TLS) comes from `dc_get_connectivity_html()`. Reference renders this in a WKWebView. qxp will parse the key data points (quota percentage) natively instead.

---

## Phase 1: Core layer additions ✅

**Goal:** Expose proxy and connectivity DC APIs in the Swift wrapper layer.

### Steps

1. **DcContext additions** (`qxp/Core/DcContext.swift`):
   - `var isProxyEnabled: Bool` — get/set via `proxy_enabled` config
   - `func getProxies() -> [String]` — reads `proxy_url`, splits by `\n`
   - `func setProxies(_ urls: [String])` — joins by `\n`, writes `proxy_url`
   - `func getConnectivity() -> Int32` — wraps `dc_get_connectivity()`
   - `func getConnectivityHtml() -> String` — wraps `dc_get_connectivity_html()`

2. **DcAccounts addition** (`qxp/Core/DcAccounts.swift`):
   - `func restartIO()` — calls `stopIo()` then `startIo()`

3. **DcConfigKey additions** (`qxp/Core/DcConstants.swift`):
   - `static let proxyEnabled = "proxy_enabled"`
   - `static let proxyUrl = "proxy_url"`

---

## Phase 2: ConnectivityView ✅

**Goal:** Single SwiftUI settings screen combining relay management and connectivity status.

### Steps

1. **Create `qxp/Views/RelaysView.swift`** — `Form`-based view with sections:

   **Section: Enable**
   - `Toggle("Use Relay", isOn: proxyEnabledBinding)` — disabled when relay list is empty. On change: restart IO.

   **Section: Relays** (hidden when list is empty)
   - Each row shows: relay host (from `checkQr().text1`), checkmark on selected, connectivity state on selected row
   - Tap to select: `setConfigFromQr()` → restart IO → reload
   - Swipe-to-delete: confirmation dialog → remove from array → `setProxies()` → restart IO

   **Section: Add**
   - Button "Add Relay" with `+` icon
   - Presents `.alert` with `TextField` for URL input
   - Validates via `checkQr()` for `DC_QR_PROXY` state
   - On valid: `setConfigFromQr()` → restart IO → reload
   - On invalid: error alert

   **Section: Status**
   - Connectivity badge: icon + text ("Connected", "Connecting…", "Updating…", "Not connected")
   - Quota display: parsed from `getConnectivityHtml()` (percentage + bar)
   - Last sent message: timestamp + status of most recent outgoing message from any chat

2. **Wire into SettingsView** — add `NavigationLink` to `RelaysView` in the settings section, with connectivity status as detail text (like reference client).

3. **Event handling** — subscribe to `connectivityChanged` events via `AppState.events` to refresh status in real time. Use `.onReceive()` on the Combine publisher.

### UI notes
- iOS 26 Form with inset grouped style (default)
- No custom blurs or materials — standard Form sections
- Connectivity icon: `SF Symbol` matching state (checkmark.circle / arrow.trianglehead.2.clockwise / wifi.slash)
- Quota: native `ProgressView` or `Gauge` if available

---

## Open questions / deferred

- **Proxy sharing via QR:** requires camera permission + QR generation infrastructure. Deferred to a future plan.
- **Multiple account proxy per-account vs global:** proxies are per-account in DC core (stored in account DB). This matches the current pattern.
- **Background fetch connectivity:** reference checks `UserDefaults.nseFetching` — deferred until push/background refresh is implemented.
