# SmartCrutch+ — The Rehabilitation Companion

*Helping every step heal better.*

SmartCrutch+ is a browser dashboard for a sensor-equipped crutch prototype (ESP32 + HX711 load
cell + ADXL345 accelerometer). It shows crutch load and angle live, warns when configurable
limits are exceeded, records sessions, and keeps patient notes and emergency contacts.

> **Student prototype — not a medically validated device.** Thresholds are configurable
> examples, not clinical advice. Fall detection is not implemented or verified. The app never
> calls or messages anyone automatically.

## Requirements

- Node.js 18 or newer (tested with Node 24) and npm.
- To connect real hardware: **desktop Chrome or Edge** (Web Serial is not available in Firefox or
  Safari), with the app opened on `http://localhost` or HTTPS.

## Setup and run

```powershell
npm install          # if PowerShell blocks npm.ps1, use: npm.cmd install
npm run dev          # or: npm.cmd run dev
```

Then open **http://localhost:5173**.

Other scripts:

| Command | What it does |
|---|---|
| `npm.cmd run build` | Type-check and create a production build in `dist/` |
| `npm.cmd run preview` | Serve the production build locally |
| `npm.cmd run typecheck` | Type-check only |

## Pages

| Page | What it does |
|---|---|
| **Dashboard** | Overview stats, device status, current/most recent session, safety summary, peak-load chart, recent activity, quick actions |
| **Live Monitoring** | Large load and angle readouts, safe-load meter, live charts with threshold lines, start/stop session with an elapsed-time timer |
| **Safety Centre** | Threshold settings, current warnings, emergency contacts (add/edit/delete), safety guidance, and an **Emergency help** panel that only opens after confirmation |
| **Session History** | Saved sessions with summary statistics, sorting, expandable details, delete with confirmation, **CSV export** and optional simulated sample sessions |
| **Patient Profile** | Validated patient details form and dated rehabilitation notes |
| **Device & Settings** | Demo/Hardware mode, **Connect Hardware** (Web Serial), connection diagnostics, units (g/kg/lb), theme, compact layout, audible alerts, thresholds, backup download and data reset |

## Data sources: Demo vs Hardware

The two modes never mix.

- **Demo mode** — an in-browser simulator generates realistic-looking load and angle signals.
  Every simulated value is labelled **SIMULATED / DEMO DATA**.
- **Hardware mode** — readings come only from the ESP32 over USB serial and are labelled
  **LIVE HARDWARE DATA**. No simulated values are ever shown in this mode.

### Hardware connection statuses

| Status | Meaning |
|---|---|
| Disconnected | No port is open |
| Connecting | The browser is opening the selected port |
| Connected — Waiting for Data | The port is open, but no valid SmartCrutch+ message has been received yet (or none for 3 s) |
| Live Data Received | Valid protocol messages are arriving |
| Web Serial not supported | The browser cannot use Web Serial |

An open port alone never counts as live data.

### Serial protocol (v1)

115200 baud, one JSON object per line:

```json
{"type":"smartcrutch","weight_g":123.4,"angle_deg":4.2,"unsafe":false}
```

Any line that does not match exactly is ignored and counted, so startup messages and debug
output are harmless. **The current ESP32 firmware prints startup messages only.** It must be
updated before the app can show readings. The firmware changes and upload steps are in
[`firmware/README.md`](firmware/README.md), and a reference sketch is in
`firmware/SmartCrutchPlus_SerialJSON/`.

To view hardware values at the firmware's scale, go to **Device & Settings**. Select the **g**
unit and click **Match firmware (800 g, 20°)**.

## Storage and privacy

Everything is stored in the browser's `localStorage` on this computer only: profile, notes,
contacts, thresholds, settings, sessions and the activity log. Nothing is uploaded. Use
**Device & Settings → Download backup (JSON)** to keep a copy, or **Reset all local data** to
erase it.

## Project structure

```
src/
  App.tsx, main.tsx          App entry, providers, hash router
  components/                Layout (sidebar, mobile nav), charts, dialogs, forms, UI primitives
  pages/                     The six pages
  state/AppContext.tsx       Persisted state (profile, settings, sessions, contacts…) + toasts
  state/LiveContext.tsx      Live data: demo simulator OR Web Serial hardware, session recording
  lib/serialProtocol.ts      Strict parser for the serial JSON protocol
  lib/serialLink.ts          Web Serial transport (open, line splitting, disconnect handling)
  lib/simulator.ts           Demo signal generator
  lib/sessionStats.ts        Session statistics
  lib/csv.ts, format.ts, storage.ts, defaults.ts, router.ts
firmware/                    ESP32 protocol output, reference sketch and upload instructions
```

## Known limitations

- The HX711 weight uses the firmware's `read() / 230`, which includes no tare and has not been
  calibrated. Treat hardware weights as relative values until they are calibrated against known
  reference weights.
- The angle's zero point depends on how the ADXL345 is mounted.
- "Estimated strikes" is a simple load-threshold heuristic, not a validated step count.
