# SmartCrutch+ firmware — serial JSON protocol

The web app's **Hardware mode** reads the ESP32 over USB using the browser's Web Serial API.
It only shows a reading after it receives a valid **protocol line**. The current firmware prints
startup messages only, so **no readings will appear until the firmware is updated** to print
the lines described below.

## Protocol v1

- Serial: **115200 baud**, 8 data bits, no parity, 1 stop bit (Arduino default).
- One JSON object per line, ending in `\n` (`\r\n` from `Serial.println` is also fine).
- Nothing else may be on the same line.

```json
{"type":"smartcrutch","weight_g":123.4,"angle_deg":4.2,"unsafe":false}
```

| Field       | Type    | Meaning |
|-------------|---------|---------|
| `type`      | string  | Must be exactly `"smartcrutch"` |
| `weight_g`  | number  | Weight in grams as the firmware computes it: `sensor.read() / 230` |
| `angle_deg` | number  | `atan2(acceleration.y, acceleration.z) * 180 / PI`, must be within −180…180 |
| `unsafe`    | boolean | The firmware's own decision (currently 800 g / 20°) |

The app ignores, and counts as "ignored lines", anything else: startup text, debug prints,
`nan`/`inf` values, missing fields, wrong types or partial lines. The last received line is
shown in **Device & Settings**, which helps with debugging.

## Exact patch for the current sketch (`wgt`, `angleX`, `isWeightUnsafe || isAngleUnsafe`)

Add this near the top of the sketch, below the `#include` lines:

```cpp
unsigned long lastSerialReportMs = 0;
const unsigned long SERIAL_REPORT_INTERVAL_MS = 200;
```

Add this at the **end of `loop()`**, after `wgt`, `angleX`, `isWeightUnsafe` and `isAngleUnsafe`
have been updated:

```cpp
  // --- SmartCrutch+ website protocol: one JSON line every 200 ms ---
  if (millis() - lastSerialReportMs >= SERIAL_REPORT_INTERVAL_MS) {
    lastSerialReportMs = millis();
    double w = (double)wgt;      // cast: wgt may be an integer type
    double a = (double)angleX;
    if (isfinite(w) && isfinite(a)) {
      Serial.printf("{\"type\":\"smartcrutch\",\"weight_g\":%.1f,\"angle_deg\":%.1f,\"unsafe\":%s}\n",
                    w, a, (isWeightUnsafe || isAngleUnsafe) ? "true" : "false");
    }
  }
```

## Option A — add only the output section to your existing sketch (generic)

1. Paste this function above `setup()`:

   ```cpp
   void emitSmartCrutchLine(float weightG, float angleDeg, bool unsafe) {
     if (!isfinite(weightG) || !isfinite(angleDeg)) return;   // never send nan/inf
     Serial.printf("{\"type\":\"smartcrutch\",\"weight_g\":%.1f,\"angle_deg\":%.1f,\"unsafe\":%s}\n",
                   weightG, angleDeg, unsafe ? "true" : "false");
   }
   ```

2. In `loop()`, after your sketch has calculated the weight, the angle and its unsafe decision,
   call it **about 10 times per second**. Replace the names below with your own variable names:

   ```cpp
   static unsigned long lastReportMs = 0;
   if (millis() - lastReportMs >= 100) {
     lastReportMs = millis();
     emitSmartCrutchLine(weight /* grams */, angle /* degrees */, isUnsafe);
   }
   ```

3. Remove, or slow down, any other `Serial.print` calls inside `loop()`. They are ignored safely,
   but they waste serial bandwidth.

## Option B — full reference sketch

`SmartCrutchPlus_SerialJSON/SmartCrutchPlus_SerialJSON.ino` is the complete sketch for the
SmartCrutch+ hardware:
- SSD1306 OLED at 0x3C
- GyverHX711 on pins 32/33 with `HX_GAIN64_A`
- ADXL345
- buzzer on GPIO 25, red LED on GPIO 16, green LED on GPIO 17
- 115200 baud, weight = `read() / 230`, limits 800 g and 20°

It sends one JSON line every 200 ms, and only while both sensors are working. If a sensor fails, it
prints `SmartCrutch+ ERROR: ...` every 2 s instead. **It has not been compiled or tested on the real
board.** Check these points against your original:
- **HX711 pin order** — the constructor is `(data, clock, gain)`. The sketch uses data = 32 and
  clock = 33.
- **OLED size** — the sketch assumes 128×64.
- **Buzzer type** — the sketch assumes an active buzzer (`HIGH` = sound).
- **Tilt check** — the sketch uses `|angle| > 20°`.

## Uploading (Arduino IDE 2.x)

1. Install the ESP32 board package: **File → Preferences → Additional boards manager URLs**:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`. Then go to
   **Tools → Board → Boards Manager**, search for "esp32" (by Espressif) and install it.
2. Install the libraries (Option B): **Tools → Manage Libraries**. Install "GyverHX711",
   "Adafruit SSD1306", "Adafruit GFX Library", "Adafruit ADXL345" and "Adafruit Unified Sensor".
3. Open the sketch. Select your board (for example **ESP32 Dev Module**) and the COM port under
   **Tools → Port**.
4. Click **Upload**. If it stays on `Connecting.....`, hold the board's **BOOT** button until the
   upload starts.
5. Check the output: open **Tools → Serial Monitor**, set it to **115200 baud**, and look for lines like
   `{"type":"smartcrutch",...}` about 10 times per second.
6. **Close the Serial Monitor** (or the whole IDE). Only one program can use the COM port at a time.

## Connecting from the web app

1. Run the app with `npm.cmd run dev` and open **http://localhost:5173** in **desktop Chrome or Edge**.
   Web Serial needs Chrome/Edge on `localhost` or HTTPS. Firefox and Safari do not support it.
2. Go to **Device & Settings → Hardware mode → Connect Hardware** and choose the ESP32's port.
   It often appears as "CP210x", "CH340" or "USB Serial".
3. The status changes in this order:
   - **Connecting** — the port is opening.
   - **Connected — Waiting for Data** — the port is open, but no valid protocol line has arrived yet.
   - **Live Data Received** — valid lines are arriving. If none arrive for 3 s, the status returns to
     *Waiting for Data*.
4. Many ESP32 dev boards reset when a serial port is opened. You may first see the startup
   messages counted as "ignored lines". This is expected.

## Known limitations (not fixed by this update)

- `sensor.read()` returns the **raw** HX711 value, including its zero offset (there is no tare),
  and 230 is an unverified scale factor. `weight_g` is therefore **not calibrated grams**.
  Treat it as a relative value until it is calibrated against known reference weights.
- The angle's zero point depends on how the ADXL345 is mounted on the crutch.
- Fall detection is not implemented or verified.
