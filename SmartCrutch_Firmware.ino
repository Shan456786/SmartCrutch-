/*
 * SmartCrutch+ ESP32 firmware — OLED + HX711 + ADXL345 + buzzer/LEDs + website serial protocol
 * ============================================================================================
 * BENCH-TEST BUILD: BUZZER_ENABLED = false, so the buzzer cannot sound. Confirm stable readings
 * with the crutch at rest before deciding how to enable the alarm.
 *
 * Serial: 115200 baud. Every 200 ms, when both sensors are working, prints exactly one line:
 *   {"type":"smartcrutch","weight_g":412.0,"angle_deg":-3.5,"unsafe":false}
 * This matches the SmartCrutch+ website parser (src/lib/serialProtocol.ts).
 *
 * If a sensor fails, NO JSON is sent (the website stays on "Waiting for Data") and a plain-text
 * "SmartCrutch+ ERROR: ..." line is printed every 2 s instead. The website ignores that line
 * but shows it under Device & Settings -> "Last line received".
 *
 * Weight: sensor.tare() at startup, then sensor.read() / 230, as in the original firmware.
 * Keep the crutch UNLOADED while it powers up: tare() zeroes whatever load is present then.
 * The /230 factor has not been verified against reference weights, so the value is not
 * accurate grams and must not be used for clinical decisions.
 *
 * Libraries (Arduino IDE -> Tools -> Manage Libraries):
 *   GyverHX711 (AlexGyver, API checked against v1.2.1), Adafruit SSD1306, Adafruit GFX Library,
 *   Adafruit ADXL345, Adafruit Unified Sensor
 */

#include <Wire.h>
#include <math.h>
#include <cmath>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>
#include <GyverHX711.h>

// ---------------- Pins & settings ----------------
const uint8_t HX_DATA_PIN  = 32;   // HX711 DT   (constructor order: data, clock)
const uint8_t HX_CLOCK_PIN = 33;   // HX711 SCK
const uint8_t BUZZER_PIN   = 25;
const uint8_t RED_LED_PIN  = 16;
const uint8_t GREEN_LED_PIN = 17;

const unsigned long SERIAL_BAUD = 115200;
const uint8_t OLED_ADDRESS = 0x3C;
const int SCREEN_WIDTH  = 128;
const int SCREEN_HEIGHT = 64;      // change to 32 if your module is 128x32

const long  WEIGHT_DIVISOR   = 230;    // original: sensor.read() / 230
const float MAX_WEIGHT_G     = 800.0;  // original threshold
const float MAX_TILT_DEG     = 20.0;   // original threshold

const unsigned long REPORT_INTERVAL_MS  = 200;   // JSON + OLED update period
const unsigned long HX_TIMEOUT_MS       = 1000;  // no new HX711 conversion for this long = fault
const unsigned long ERROR_REPORT_MS     = 2000;

// ---------------- Buzzer configuration ----------------
// BUZZER_ON_LEVEL: the pin level that makes YOUR buzzer sound.
//   HIGH = plain active buzzer or NPN-driven buzzer.
//   LOW  = many 3-pin "low-level trigger" buzzer modules.
// The OFF level is always derived as the inverse, so the two can never contradict.
const uint8_t BUZZER_ON_LEVEL  = HIGH;   // >>> confirm against your wiring before enabling
const uint8_t BUZZER_OFF_LEVEL = (BUZZER_ON_LEVEL == HIGH) ? LOW : HIGH;
// Bench-test switch: while false, buzzerOn() never drives the buzzer — it forces OFF instead.
const bool    BUZZER_ENABLED   = false;

// ---------------- Devices ----------------
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);
GyverHX711 sensor(HX_DATA_PIN, HX_CLOCK_PIN, HX_GAIN64_A);

// ---------------- State ----------------
bool oledOk    = false;
bool accelOk   = false;   // set once in setup(); a failed ADXL345 init is never cleared without a reboot
bool hxInitOk  = false;   // set once in setup(): HX711 delivered a conversion AND was tared against it
bool hxFresh   = false;   // HX711 produced a new conversion within HX_TIMEOUT_MS

long  wgt    = 0;      // grams, as computed by the original formula (integer division)
float angleX = 0.0;    // degrees: atan2(y, z) * 180 / PI
bool  isWeightUnsafe = false;
bool  isAngleUnsafe  = false;

unsigned long lastHxSampleMs = 0;
unsigned long lastReportMs   = 0;
unsigned long lastErrorMs    = 0;

// ---------------- Buzzer ----------------
void buzzerOff() {
  digitalWrite(BUZZER_PIN, BUZZER_OFF_LEVEL);
}

void buzzerOn() {
  if (!BUZZER_ENABLED) {   // bench test: never sound
    buzzerOff();
    return;
  }
  digitalWrite(BUZZER_PIN, BUZZER_ON_LEVEL);
}

// ---------------- Outputs ----------------
// Only called with valid readings from both sensors.
void setOutputs(bool unsafe) {
  digitalWrite(RED_LED_PIN,   unsafe ? HIGH : LOW);
  digitalWrite(GREEN_LED_PIN, unsafe ? LOW  : HIGH);
  if (unsafe) buzzerOn();
  else buzzerOff();
}

// Sensor fault or no valid reading: red LED as fault indicator, green off, buzzer always silent.
void setFaultOutputs() {
  digitalWrite(RED_LED_PIN,   HIGH);
  digitalWrite(GREEN_LED_PIN, LOW);
  buzzerOff();
}

// ---------------- OLED ----------------
void showMessage(const char* line1, const char* line2) {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(line1);
  display.println(line2);
  display.display();
}

void showReadings(bool unsafe) {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("SmartCrutch+");

  display.setTextSize(2);
  display.setCursor(0, 14);
  display.print(wgt);
  display.println(" g");

  display.setCursor(0, 34);
  display.print(angleX, 1);
  display.println(" deg");

  display.setTextSize(1);
  display.setCursor(0, 56);
  if (unsafe) {
    display.print("UNSAFE:");
    if (isWeightUnsafe) display.print(" WEIGHT");
    if (isAngleUnsafe)  display.print(" TILT");
  } else {
    display.print("SAFE");
  }
  display.display();
}

const char* faultText() {
  if (!accelOk)  return "ADXL345 missing";
  if (!hxInitOk) return "HX711 init failed";
  return "HX711 no data";
}

// ---------------- Serial ----------------
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
  if (!hxInitOk)     Serial.print(" HX711 failed initialisation/tare (check pins 32/33 and wiring, then reboot);");
  else if (!hxFresh) Serial.print(" HX711 stopped sending data (check wiring);");
  if (!accelOk)      Serial.print(" ADXL345 not detected at startup (check I2C wiring, then reboot);");
  Serial.println(" no readings sent.");
}

// ---------------- Setup ----------------
void setup() {
  // 1. Silence the buzzer before anything else. Writing the OFF level before and after
  //    pinMode() keeps the pin from being driven to the ON level as it becomes an output.
  digitalWrite(BUZZER_PIN, BUZZER_OFF_LEVEL);
  pinMode(BUZZER_PIN, OUTPUT);
  buzzerOff();

  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, LOW);

  Serial.begin(SERIAL_BAUD);
  delay(200);
  Serial.println("SmartCrutch+ starting");
  Serial.println(BUZZER_ENABLED ? "Buzzer: ENABLED" : "Buzzer: DISABLED (bench test)");

  Wire.begin();   // ESP32 default I2C pins (SDA 21, SCL 22)

  oledOk = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS);
  Serial.println(oledOk ? "OLED OK" : "OLED not found at 0x3C (continuing without display)");
  showMessage("SmartCrutch+", "Starting...");

  accelOk = accel.begin();
  Serial.println(accelOk ? "ADXL345 OK" : "ADXL345 not detected");

  // 2. HX711: wait for a real conversion, then tare against it (original firmware behaviour).
  //    GyverHX711::tare() only reads if a conversion is ready; called too early it would
  //    "tare" against 0 and silently do nothing, so tare only after a confirmed sample.
  showMessage("SmartCrutch+", "Taring - no load");
  unsigned long start = millis();
  while (millis() - start < HX_TIMEOUT_MS) {
    if (sensor.available()) {
      sensor.read();     // take the conversion that is ready now
      sensor.tare();     // offset = -(that conversion), so read() returns ~0 at this load
      hxInitOk = true;
      hxFresh  = true;
      lastHxSampleMs = millis();
      wgt = sensor.read() / WEIGHT_DIVISOR;
      break;
    }
    delay(5);
  }
  if (hxInitOk) {
    Serial.print("HX711 OK, tare offset = ");
    Serial.println(sensor.getOffset());
  } else {
    Serial.println("HX711 not responding (no tare performed)");
  }

  if (!hxInitOk || !accelOk) {
    setFaultOutputs();
    showMessage("SENSOR ERROR", faultText());
  }
}

// ---------------- Loop ----------------
void loop() {
  unsigned long now = millis();

  // Weight: take a new HX711 conversion whenever one is ready (non-blocking).
  // Only meaningful after a successful startup tare.
  if (hxInitOk) {
    if (sensor.available()) {
      wgt = sensor.read() / WEIGHT_DIVISOR;
      lastHxSampleMs = now;
      hxFresh = true;
    } else if (now - lastHxSampleMs > HX_TIMEOUT_MS) {
      hxFresh = false;   // no fresh data: the last value is stale and must not be reported
    }
  }

  if (now - lastReportMs < REPORT_INTERVAL_MS) return;
  lastReportMs = now;

  // Angle: same formula as the original firmware.
  if (accelOk) {
    sensors_event_t event;
    accel.getEvent(&event);
    angleX = atan2(event.acceleration.y, event.acceleration.z) * 180.0 / PI;
  }

  bool readingsValid = accelOk && hxInitOk && hxFresh;
  if (!readingsValid) {
    setFaultOutputs();
    showMessage("SENSOR ERROR", faultText());
    reportErrors(now);
    return;   // no JSON, no green LED, no buzzer: readings are not valid
  }

  isWeightUnsafe = wgt > MAX_WEIGHT_G;
  isAngleUnsafe  = fabs(angleX) > MAX_TILT_DEG;
  bool unsafe = isWeightUnsafe || isAngleUnsafe;

  setOutputs(unsafe);
  showReadings(unsafe);
  sendJson(unsafe);
}
