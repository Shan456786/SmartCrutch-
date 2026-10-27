/*
 * SmartCrutch+ ESP32 firmware — OLED + HX711 + ADXL345 + LEDs + website serial protocol
 * ======================================================================================
 * BUZZER: DISABLED by default with polarity UNKNOWN. In that state GPIO 25 is set to INPUT (high
 * impedance) and is never written. Software cannot guarantee silence on its own: whether the
 * buzzer stays quiet with an undriven pin depends on the buzzer module and wiring.
 * To confirm polarity, set BUZZER_POLARITY and BUZZER_TEST_MODE = true: each 't' sent from the
 * Serial Monitor gives one 200 ms pulse, and GPIO 25 is undriven again between pulses.
 * Only after the polarity is confirmed, set BUZZER_TEST_MODE = false and BUZZER_ENABLED = true:
 * the buzzer then sounds only while readings are valid AND unsafe, never on a sensor fault.
 *
 * OLED: the original four-line "Rehab Safety Monitor" screen (from leg_injury.ino).
 *
 * Serial: 115200 baud. Every 200 ms, when both sensors are working, prints exactly one line:
 *   {"type":"smartcrutch","weight_g":412.0,"angle_deg":-3.5,"unsafe":false}
 * This matches the SmartCrutch+ website parser (src/lib/serialProtocol.ts).
 * If a sensor is not valid, NO JSON is sent; a plain-text "SmartCrutch+ ERROR: ..." line is
 * printed every 2 s instead, which the website ignores.
 *
 * Weight: sensor.tare() at startup, then sensor.read() / 230 with the original drift filter.
 * Keep the crutch UNLOADED while it powers up. The /230 factor has not been verified against
 * reference weights, so the value is not calibrated grams and must not be used clinically.
 *
 * Libraries: GyverHX711 (v1.2.1), Adafruit SSD1306, Adafruit GFX Library,
 *            Adafruit ADXL345, Adafruit Unified Sensor
 */

#include <Wire.h>
#include <math.h>
#include <cmath>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>
#include <GyverHX711.h>

// --- OLED SETUP ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- GYVER HX711 LOAD CELL SETUP ---
GyverHX711 sensor(32, 33, HX_GAIN64_A);   // data 32, clock 33 (as original)

// --- ADXL345 SETUP ---
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);

// --- ACTUATORS & PINS ---
const int BUZZER_PIN = 25;
const int RED_LED_PIN = 16;
const int GREEN_LED_PIN = 17;

// --- SAFETY THRESHOLDS (example values, as original) ---
const int MAX_WEIGHT_G = 800;
const float MAX_TILT_ANGLE = 20.0;

// --- TIMING ---
const unsigned long REPORT_INTERVAL_MS = 200;   // OLED + JSON refresh period (original delay(200))
const unsigned long HX_TIMEOUT_MS      = 1000;  // no new HX711 conversion for this long = not valid
const unsigned long ERROR_REPORT_MS    = 2000;

// --- BUZZER CONFIGURATION ---
// Polarity is NOT known from software. Set it only after a hardware check:
//   BUZZER_ACTIVE_HIGH : buzzer sounds when GPIO 25 is HIGH
//   BUZZER_ACTIVE_LOW  : buzzer sounds when GPIO 25 is LOW (many 3-pin "low-level trigger" modules)
// Modes (at most one of BUZZER_ENABLED / BUZZER_TEST_MODE may be true; both need a polarity):
//   both false        : GPIO 25 is INPUT and never written (default)
//   BUZZER_TEST_MODE  : GPIO 25 is INPUT except during a 200 ms pulse requested with 't' over
//                       serial. No alarm in this mode.
//   BUZZER_ENABLED    : GPIO 25 is an output held at the OFF level from the start of setup();
//                       ON only while readings are valid AND unsafe; OFF on any sensor fault.
enum BuzzerPolarity { BUZZER_POLARITY_UNKNOWN, BUZZER_ACTIVE_HIGH, BUZZER_ACTIVE_LOW };
constexpr BuzzerPolarity BUZZER_POLARITY = BUZZER_ACTIVE_HIGH;   // confirmed by 't' pulse test (one 200 ms beep)
constexpr bool BUZZER_ENABLED   = true;    // alarm on valid unsafe readings
constexpr bool BUZZER_TEST_MODE = false;   // serial 't' = one short pulse at the selected polarity

constexpr unsigned long BUZZER_TEST_PULSE_MS = 200;
constexpr unsigned long BUZZER_TEST_GAP_MS   = 1000;   // minimum time between test pulses

static_assert(!(BUZZER_ENABLED || BUZZER_TEST_MODE) || BUZZER_POLARITY != BUZZER_POLARITY_UNKNOWN,
              "Set BUZZER_POLARITY from a hardware check before enabling or testing the buzzer");
static_assert(!(BUZZER_ENABLED && BUZZER_TEST_MODE),
              "Use either BUZZER_TEST_MODE or BUZZER_ENABLED, not both");

constexpr bool    BUZZER_POLARITY_SET = BUZZER_POLARITY != BUZZER_POLARITY_UNKNOWN;
constexpr bool    BUZZER_ALARM     = BUZZER_ENABLED && BUZZER_POLARITY_SET;
constexpr bool    BUZZER_TEST      = BUZZER_TEST_MODE && BUZZER_POLARITY_SET;
constexpr uint8_t BUZZER_ON_LEVEL  = (BUZZER_POLARITY == BUZZER_ACTIVE_LOW) ? LOW : HIGH;
constexpr uint8_t BUZZER_OFF_LEVEL = (BUZZER_ON_LEVEL == HIGH) ? LOW : HIGH;

// --- STATE ---
bool oledOk  = false;
bool accelOk = false;
bool hxTared = false;   // HX711 delivered a conversion and was tared against it at startup
bool hxFresh = false;   // HX711 produced a new conversion within HX_TIMEOUT_MS

int   wgt    = 0;
float angleX = 0.0;

unsigned long lastHxSampleMs = 0;
unsigned long lastReportMs   = 0;
unsigned long lastErrorMs    = 0;

bool buzzerTestActive = false;
unsigned long buzzerTestStartMs = 0;

// --- BUZZER ---
// The only places GPIO 25 is touched: buzzerInit(), buzzerSet() (alarm mode only) and
// buzzerTestService() (test mode only).
void buzzerInit() {
  if (!BUZZER_ALARM) {
    pinMode(BUZZER_PIN, INPUT);   // disabled or test mode: high impedance, not driven
    return;
  }
  digitalWrite(BUZZER_PIN, BUZZER_OFF_LEVEL);   // ignored by ESP32 core 3.x before pinMode; harmless
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, BUZZER_OFF_LEVEL);   // OFF immediately after the pin becomes an output
}

void buzzerSet(bool on) {
  if (!BUZZER_ALARM) return;
  digitalWrite(BUZZER_PIN, on ? BUZZER_ON_LEVEL : BUZZER_OFF_LEVEL);
}

// Test mode: 't' over serial drives the selected ON level for BUZZER_TEST_PULSE_MS, then the pin
// is released to INPUT again. The pin is never held at either level outside a pulse.
void buzzerTestService(unsigned long now) {
  if (!BUZZER_TEST) return;
  if (buzzerTestActive) {
    if (now - buzzerTestStartMs >= BUZZER_TEST_PULSE_MS) {
      pinMode(BUZZER_PIN, INPUT);
      buzzerTestActive = false;
      Serial.println("Buzzer test: pulse finished, GPIO 25 released");
    }
    return;
  }
  while (Serial.available()) {
    int c = Serial.read();
    if (c != 't' && c != 'T') continue;
    if (now - buzzerTestStartMs < BUZZER_TEST_GAP_MS) continue;   // ignore rapid repeats
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, BUZZER_ON_LEVEL);
    buzzerTestStartMs = now;
    buzzerTestActive = true;
    Serial.println(BUZZER_POLARITY == BUZZER_ACTIVE_LOW
                   ? "Buzzer test: GPIO 25 LOW for 200 ms (testing ACTIVE_LOW)"
                   : "Buzzer test: GPIO 25 HIGH for 200 ms (testing ACTIVE_HIGH)");
    break;
  }
}

// --- OLED (original layout) ---
// A value that is not valid is shown as "--", never as a number.
void showReadings(bool weightValid, bool angleValid) {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.print("Rehab Safety Monitor");

  display.setCursor(0, 16);
  display.print("Weight: ");
  if (weightValid) display.print(wgt);
  else display.print("--");
  display.println(" G");

  display.setCursor(0, 32);
  display.print("Max Safe: ");
  display.print(MAX_WEIGHT_G);
  display.println(" G");

  display.setCursor(0, 48);
  display.print("Angle: ");
  if (angleValid) display.print(angleX, 1);
  else display.print("--");
  display.print(" deg");

  display.display();
}

// --- SERIAL ---
// Exactly the format the website parser accepts. One line, newline-terminated.
void sendJson(bool unsafe) {
  double w = (double)wgt;
  double a = (double)angleX;
  if (!std::isfinite(w) || !std::isfinite(a)) return;   // never send nan/inf (not valid JSON)
  Serial.printf("{\"type\":\"smartcrutch\",\"weight_g\":%.1f,\"angle_deg\":%.1f,\"unsafe\":%s}\n",
                w, a, unsafe ? "true" : "false");
}

void reportErrors(unsigned long now) {
  if (now - lastErrorMs < ERROR_REPORT_MS) return;
  lastErrorMs = now;
  Serial.print("SmartCrutch+ ERROR:");
  if (!hxTared)      Serial.print(" HX711 not responding at startup, no tare (check pins 32/33, then reboot);");
  else if (!hxFresh) Serial.print(" HX711 stopped sending data (check wiring);");
  if (!accelOk)      Serial.print(" ADXL345 not detected at startup (check I2C wiring, then reboot);");
  Serial.println(" no readings sent.");
}

void setup() {
  buzzerInit();   // first: leaves GPIO 25 undriven while the buzzer is disabled

  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, LOW);

  Serial.begin(115200);
  delay(1000);
  Serial.println("SmartCrutch+ starting");
  if (BUZZER_ALARM)     Serial.println("Buzzer: ENABLED (valid unsafe readings only)");
  else if (BUZZER_TEST) Serial.println("Buzzer: TEST MODE - send 't' for one 200 ms pulse");
  else                  Serial.println("Buzzer: DISABLED, GPIO 25 not driven");

  // Initialize I2C explicitly on pins 21 (SDA) and 22 (SCL)
  Wire.begin(21, 22);

  oledOk = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (oledOk) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Patient Safety System");
    display.display();
  } else {
    Serial.println(F("SSD1306 allocation failed (continuing without display)"));
  }
  delay(2000);

  // GyverHX711 Tare. tare() uses the latest conversion, and its internal read() only reads if a
  // conversion is ready at that instant; otherwise the offset stays 0 and the weight is untared.
  // So wait for a conversion first, then call tare() as the original did.
  unsigned long start = millis();
  while (millis() - start < HX_TIMEOUT_MS) {
    if (sensor.available()) {
      sensor.tare();
      hxTared = true;
      hxFresh = true;
      lastHxSampleMs = millis();
      break;
    }
    delay(5);
  }
  if (hxTared) {
    Serial.print("HX711 OK, tare offset = ");
    Serial.println(sensor.getOffset());
  } else {
    Serial.println("HX711 not responding (no tare performed, weight not reported)");
  }

  accelOk = accel.begin();
  if (accelOk) {
    accel.setRange(ADXL345_RANGE_16_G);
    Serial.println("ADXL345 Found!");
  } else {
    Serial.println("Ooops, no ADXL345 detected ... Check your wiring!");
  }
}

void loop() {
  unsigned long now = millis();

  // 1. Read Weight via GyverHX711 (only after a successful tare; untared values are never used)
  if (hxTared) {
    if (sensor.available()) {
      wgt = sensor.read() / 230;   // Your custom divisor scaling factor
      if (wgt < 2) wgt = 0;        // Filter out minor drift
      lastHxSampleMs = now;
      hxFresh = true;
    } else if (now - lastHxSampleMs > HX_TIMEOUT_MS) {
      hxFresh = false;             // stale value must not be reported
    }
  }

  buzzerTestService(now);   // test mode only; does nothing otherwise

  if (now - lastReportMs < REPORT_INTERVAL_MS) return;
  lastReportMs = now;

  // 2. Read ADXL345 Angle
  if (accelOk) {
    sensors_event_t event;
    accel.getEvent(&event);
    angleX = atan2(event.acceleration.y, event.acceleration.z) * 180 / PI;
  }

  bool weightValid = hxTared && hxFresh;
  bool angleValid  = accelOk && std::isfinite(angleX);

  // 3. Update OLED Display (original layout)
  showReadings(weightValid, angleValid);

  // Invalid readings: red LED as fault indicator, no green, buzzer off, no JSON.
  if (!weightValid || !angleValid) {
    digitalWrite(RED_LED_PIN, HIGH);
    digitalWrite(GREEN_LED_PIN, LOW);
    buzzerSet(false);
    reportErrors(now);
    return;
  }

  // 4. Safety Logic Evaluation
  bool isWeightUnsafe = (wgt > MAX_WEIGHT_G);
  bool isAngleUnsafe  = (fabs(angleX) > MAX_TILT_ANGLE);
  bool unsafe = isWeightUnsafe || isAngleUnsafe;

  digitalWrite(RED_LED_PIN,   unsafe ? HIGH : LOW);
  digitalWrite(GREEN_LED_PIN, unsafe ? LOW  : HIGH);
  buzzerSet(unsafe);   // no effect while the buzzer is disabled

  // 5. Website serial protocol
  sendJson(unsafe);
}
