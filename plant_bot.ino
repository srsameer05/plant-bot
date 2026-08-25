#include <Arduino_GFX_Library.h>
#include <DHT.h>
#include <Wire.h>
#include <RTClib.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <XPT2046_Touchscreen.h>
#include <Preferences.h>
#include <WebServer.h>
#include <DNSServer.h>


// =====================================================
// CONFIGURATION & PINS
// =====================================================

#define TFT_CS     15
#define TFT_DC      2
#define TFT_RST     4
#define TFT_MOSI   23
#define TFT_MISO   19
#define TFT_SCLK   18

#define DHT_PIN    16
#define DHT_TYPE   DHT22

#define SOIL_PIN   33
#define LDR_PIN    34
#define TOUCH_PIN   5

// Touch Controller Pins (XPT2046)
#define T_CLK      25
#define T_CS       27
#define T_DIN      32
#define T_DO       26
#define T_IRQ      35


// SDA = GPIO 21
// SCL = GPIO 22

#define WIFI_SSID       "ABC"      // Change to your WiFi SSID
#define WIFI_PASSWORD   "12345678"  // Change to your WiFi Password

String wifiSSID = WIFI_SSID;
String wifiPassword = WIFI_PASSWORD;
#define NTFY_TOPIC      "srsameer_plant_bot" // Change to your unique ntfy.sh topic

// Telemetry Server Config
#define TELEMETRY_SERVER      "http://10.234.37.171:5000/api/telemetry" // Replace with your computer's local IP on startup
#define TELEMETRY_INTERVAL    5000 // Send data every 5 seconds

// =====================================================
// HARDWARE INSTANCES
// =====================================================

Arduino_DataBus *bus = new Arduino_ESP32SPI(
  TFT_DC,
  TFT_CS,
  TFT_SCLK,
  TFT_MOSI,
  TFT_MISO
);

// Landscape / upside-down rotation
Arduino_GFX *gfx = new Arduino_ST7789(
  bus,
  TFT_RST,
  3,
  false,
  240,
  320
);

DHT dht(DHT_PIN, DHT_TYPE);
RTC_DS1307 rtc;

SPIClass touchSPI(HSPI);
XPT2046_Touchscreen ts(T_CS); // Switched to polling mode by removing T_IRQ to avoid issues with floating GPIO 35

Preferences preferences;
WebServer server(80);
DNSServer dnsServer;

bool wifiConfigMode = false;
unsigned long touchStartTime = 0;
const unsigned long LONG_PRESS_DURATION = 3000; // 3 seconds to trigger WiFi config mode

bool detailedPopupActive = false;
int popupSensorId = -1;


// =====================================================
// DESIGN SYSTEM - MODERN PALETTE
// =====================================================

#define C_BACKGROUND   0x10E4 // Sleek dark slate
#define C_CARD_BG      0x2147 // Soft dark blue-grey
#define C_CARD_BORDER  0x31CD // Card border grey
#define C_WHITE        0xFFFF
#define C_CREAM        0xFFDF
#define C_LIGHT_CREAM  0xF7BE
#define C_PUPIL        0x1084 // Deep dark blue-black
#define C_TEAL         0x3ED6 // Premium cyan
#define C_MINT         0x5FFA // Fresh green
#define C_CORAL        0xF38A // Coral pink/red
#define C_GOLD         0xFE20 // Gold/yellow
#define C_SKY_BLUE     0x6EFE // Soft light blue
#define C_PINK         0xF4B3 // Blush pink
#define C_PURPLE       0xB3DF // Lavender
#define C_TEXT_MUTED   0x8C71 // Mid grey
#define C_ALERT_RED    0xE144 // Visual warning red

const int W = 320;
const int H = 240;

// =====================================================
// CHARACTER COORDINATES
// =====================================================

const int LEFT_EYE_X  = 92;
const int RIGHT_EYE_X = 228;
const int EYE_Y       = 104;

// =====================================================
// SENSORS & FILTERING
// =====================================================

// Smoothed variables (Exponential Moving Average)
float filteredTemp  = 25.0;
float filteredHum   = 60.0;
float filteredSoil  = 50.0;
float filteredLight = 50.0;

// EMA Alpha factor (smoothing coefficient)
const float EMA_ALPHA_FAST = 0.15; // LDR, Soil
const float EMA_ALPHA_SLOW = 0.20; // DHT22

// =====================================================
// MOODS & STATE MACHINE
// =====================================================

enum Expression {
  HAPPY,
  CURIOUS,
  LAZY,
  CONFUSED,
  SLEEPY,
  SHY,
  SURPRISED,
  THIRSTY,
  HOT,
  EXCITED,
  TOUCH
};

Expression expression = HAPPY;

// =====================================================
// TIMERS (NON-BLOCKING)
// =====================================================

unsigned long lastFastSensorRead   = 0;
unsigned long lastSlowSensorRead   = 0;
unsigned long lastMoodChange       = 0;
unsigned long lastBreathTime       = 0;
unsigned long lastEyeLerpTime      = 0;
unsigned long lastEyeGazeTime      = 0;
unsigned long lastBlinkTime        = 0;
unsigned long blinkFrameTime       = 0;
unsigned long lastParticleSpawnTime= 0;

unsigned long touchUntil           = 0;
unsigned long nextEyeGazeInterval  = 3000;
unsigned long blinkInterval        = 4000;

unsigned long lastWifiCheck        = 0;
const unsigned long WIFI_CHECK_INTERVAL = 20000; // 20 seconds

bool notificationSent              = false;
unsigned long lastNotificationTime = 0;
const unsigned long NOTIFICATION_COOLDOWN = 6UL * 60UL * 60UL * 1000UL; // 6 hours

unsigned long lastTelemetryTime    = 0;

const unsigned long FAST_SENSOR_INTERVAL = 200;  // 5 Hz reads
const unsigned long SLOW_SENSOR_INTERVAL = 2000; // 2 sec reads (DHT limit)
const unsigned long MOOD_INTERVAL        = 8000;  // Cycle moods every 8s

// =====================================================
// ANIMATION STATE VARIABLES
// =====================================================

bool blinking = false;
int blinkState = 0; // 0: open, 1: half, 2: closed, 3: half, 4: open

// Breathing offsets (sine-like cycle)
const int breathSequence[] = {0, 1, 2, 2, 1, 0, -1, -2, -2, -1};
int breathIndex = 0;
int breathY = 0;

// Gaze offset target & current (for smooth shifting pupil)
float targetPupilX = 0;
float targetPupilY = 0;
float currentPupilX = 0;
float currentPupilY = 0;

// Software fallback clock tracking if RTC is missing
bool rtcFound = false;

// =====================================================
// FLOATING PARTICLE ENGINE (Zzz, Hearts, Sweat)
// =====================================================

struct Particle {
  float x, y;
  float prevX, prevY;
  float vx, vy;
  char type; // 'Z' = sleep, 'H' = heart, 'S' = sweat
  bool active;
  unsigned long spawnTime;
  uint8_t size;
};

const int MAX_PARTICLES = 5;
Particle particles[MAX_PARTICLES];

// =====================================================
// TEXT HELPER
// =====================================================

void centerText(
  const char *text,
  int x,
  int y,
  uint8_t size,
  uint16_t color
) {
  gfx->setTextSize(size);
  gfx->setTextColor(color);

  int width = strlen(text) * 6 * size;

  gfx->setCursor(
    x - width / 2,
    y
  );

  gfx->print(text);
}

// =====================================================
// SHAPE HELPERS
// =====================================================

// Scaled heart drawing function
void drawHeart(int x, int y, int size, uint16_t color) {
  int r = size / 4;
  gfx->fillCircle(x - r, y - r, r + 1, color);
  gfx->fillCircle(x + r, y - r, r + 1, color);
  gfx->fillTriangle(
    x - 2 * r, y,
    x + 2 * r, y,
    x, y + size / 2 + 2,
    color
  );
}

// =====================================================
// PARTICLE ENGINE LOGIC
// =====================================================

void spawnParticle(char type) {
  for (int i = 0; i < MAX_PARTICLES; i++) {
    if (!particles[i].active) {
      particles[i].active = true;
      particles[i].type = type;
      particles[i].spawnTime = millis();
      
      if (type == 'Z') { // sleep
        particles[i].x = 180 + random(0, 15);
        particles[i].y = 120;
        particles[i].vx = 0.4 + (random(0, 10) / 25.0);
        particles[i].vy = -0.5 - (random(0, 10) / 25.0);
        particles[i].size = random(1, 3);
      } else if (type == 'H') { // love
        particles[i].x = (random(0, 2) == 0 ? 50 : 270) + random(-10, 10);
        particles[i].y = 130;
        particles[i].vx = (random(0, 10) - 5) / 12.0;
        particles[i].vy = -0.7 - (random(0, 10) / 25.0);
        particles[i].size = random(6, 12);
      } else if (type == 'S') { // sweat
        particles[i].x = (random(0, 2) == 0 ? 80 : 240) + random(-10, 10);
        particles[i].y = 70;
        particles[i].vx = 0;
        particles[i].vy = 0.7 + (random(0, 10) / 20.0);
        particles[i].size = 3;
      }
      particles[i].prevX = particles[i].x;
      particles[i].prevY = particles[i].y;
      break;
    }
  }
}

void updateParticles(bool characterWasRedrawn) {
  for (int i = 0; i < MAX_PARTICLES; i++) {
    if (!particles[i].active) continue;
    
    // Clean up previous position if the screen wasn't just cleared
    if (!characterWasRedrawn) {
      if (particles[i].type == 'Z') {
        gfx->fillRect(particles[i].prevX - 2, particles[i].prevY - 8, 12, 12, C_BACKGROUND);
      } else if (particles[i].type == 'H') {
        gfx->fillRect(particles[i].prevX - 10, particles[i].prevY - 10, 20, 20, C_BACKGROUND);
      } else if (particles[i].type == 'S') {
        gfx->fillRect(particles[i].prevX - 4, particles[i].prevY - 8, 8, 16, C_BACKGROUND);
      }
    }
    
    // Update coordinates
    particles[i].prevX = particles[i].x;
    particles[i].prevY = particles[i].y;
    particles[i].x += particles[i].vx;
    particles[i].y += particles[i].vy;
    
    // Keep inside character bounds or kill
    if (millis() - particles[i].spawnTime > 2200 || 
        particles[i].y < 43 || particles[i].y > 170 || 
        particles[i].x < 10 || particles[i].x > 310) {
      particles[i].active = false;
      continue;
    }
    
    // Draw in new coordinates
    if (particles[i].type == 'Z') {
      gfx->setTextSize(particles[i].size);
      gfx->setTextColor(C_PURPLE);
      gfx->setCursor((int)particles[i].x, (int)particles[i].y);
      gfx->print("z");
    } else if (particles[i].type == 'H') {
      drawHeart((int)particles[i].x, (int)particles[i].y, particles[i].size, C_PINK);
    } else if (particles[i].type == 'S') {
      gfx->fillCircle((int)particles[i].x, (int)particles[i].y, 3, C_SKY_BLUE);
      gfx->fillTriangle(
        (int)particles[i].x - 3, (int)particles[i].y, 
        (int)particles[i].x + 3, (int)particles[i].y, 
        (int)particles[i].x, (int)particles[i].y - 5, 
        C_SKY_BLUE
      );
    }
  }
}

// =====================================================
// WIFI & NOTIFICATIONS
// =====================================================

void drawWiFiIcon(uint16_t color) {
  int x = 84;
  int y = 14;
  
  // Clear the small region first inside the header bounds
  gfx->fillRect(x - 2, y - 2, 18, 14, C_CARD_BG);
  
  // If disconnected, draw a muted diagonal line across the bars
  if (color == C_TEXT_MUTED) {
    gfx->fillRect(x, y + 8, 2, 2, C_TEXT_MUTED);
    gfx->fillRect(x + 4, y + 6, 2, 4, C_TEXT_MUTED);
    gfx->fillRect(x + 8, y + 4, 2, 6, C_TEXT_MUTED);
    gfx->fillRect(x + 12, y + 2, 2, 8, C_TEXT_MUTED);
    gfx->drawLine(x - 1, y + 9, x + 15, y + 1, C_ALERT_RED);
  } else {
    gfx->fillRect(x, y + 8, 2, 2, C_MINT);
    gfx->fillRect(x + 4, y + 6, 2, 4, C_MINT);
    gfx->fillRect(x + 8, y + 4, 2, 6, C_MINT);
    gfx->fillRect(x + 12, y + 2, 2, 8, C_MINT);
  }
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());
  Serial.print("Connecting to WiFi...");
  
  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 6000) {
    delay(200);
    Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" Connected!");
  } else {
    Serial.println(" Timeout. Reconnecting in background.");
  }
}

const char* expressionName(Expression expr) {
  switch (expr) {
    case HAPPY: return "HAPPY";
    case CURIOUS: return "CURIOUS";
    case LAZY: return "LAZY";
    case CONFUSED: return "CONFUSED";
    case SLEEPY: return "SLEEPY";
    case SHY: return "SHY";
    case SURPRISED: return "SURPRISED";
    case THIRSTY: return "THIRSTY";
    case HOT: return "HOT";
    case EXCITED: return "EXCITED";
    case TOUCH: return "TOUCH";
    default: return "HAPPY";
  }
}

void sendTelemetry() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(TELEMETRY_SERVER);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(1500); // Set a short timeout to prevent UI stutters on laggy networks
    
    String jsonPayload = "{\"temp\":" + String(filteredTemp, 1) + 
                         ",\"hum\":" + String(filteredHum, 0) + 
                         ",\"soil\":" + String((int)filteredSoil) + 
                         ",\"light\":" + String((int)filteredLight) + 
                         ",\"expression\":\"" + String(expressionName(expression)) + "\"}";
                         
    int httpResponseCode = http.POST(jsonPayload);
    if (httpResponseCode > 0) {
      Serial.print("Telemetry sent. Code: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("Telemetry error: ");
      Serial.println(http.errorToString(httpResponseCode).c_str());
    }
    http.end();
  }
}

void sendPhoneNotification(const char *message) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = "https://ntfy.sh/" + String(NTFY_TOPIC);
    http.begin(url);
    http.addHeader("Content-Type", "text/plain");
    
    int httpResponseCode = http.POST(message);
    if (httpResponseCode > 0) {
      Serial.print("Notification sent successfully. Code: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("Error sending notification: ");
      Serial.println(http.errorToString(httpResponseCode).c_str());
    }
    http.end();
  }
}

// =====================================================
// FLOATING TOP HEADER
// =====================================================

void drawHeaderBase() {
  // Beautiful rounded floating status panel
  gfx->fillRoundRect(6, 6, 308, 32, 6, C_CARD_BG);
  gfx->drawRoundRect(6, 6, 308, 32, 6, C_CARD_BORDER);

  // Logo Label
  gfx->setTextSize(2);
  gfx->setTextColor(C_MINT);
  gfx->setCursor(16, 14);
  gfx->print("MOA");

  // Initial WiFi status icon (disconnected)
  drawWiFiIcon(C_TEXT_MUTED);
}

void updateHeader() {
  DateTime now;
  if (rtcFound) {
    now = rtc.now();
  } else {
    // Software clock fallback
    unsigned long secs = millis() / 1000;
    now = DateTime(F(__DATE__), F(__TIME__)) + TimeSpan(secs);
  }

  // Update WiFi signal icon dynamically on state change
  static bool lastWifiState = false;
  bool currentWifiState = (WiFi.status() == WL_CONNECTED);
  if (currentWifiState != lastWifiState) {
    lastWifiState = currentWifiState;
    drawWiFiIcon(currentWifiState ? C_MINT : C_TEXT_MUTED);
  }

  static int lastSecond = -1;
  static bool pulseState = false;

  if (now.second() != lastSecond) {
    lastSecond = now.second();
    pulseState = !pulseState;

    // Pulse heartbeat status dot
    gfx->fillCircle(62, 21, 4, pulseState ? C_PINK : C_CARD_BORDER);

    // Format fields
    int hr = now.hour();
    int min = now.minute();
    int sec = now.second();
    bool pm = hr >= 12;
    int displayHr = hr % 12;
    if (displayHr == 0) displayHr = 12;

    char timeStr[12];
    snprintf(timeStr, sizeof(timeStr), "%02d:%02d:%02d", displayHr, min, sec);

    char dateStr[12];
    snprintf(dateStr, sizeof(dateStr), "%02d/%02d/%02d", now.day(), now.month(), now.year() % 100);

    // Wipe text fields inside header to eliminate trailing artifacts
    gfx->fillRect(108, 10, 200, 24, C_CARD_BG);

    // Time value
    gfx->setTextSize(2);
    gfx->setTextColor(C_WHITE);
    gfx->setCursor(112, 14);
    gfx->print(timeStr);

    // AM/PM Indicator
    gfx->setTextSize(1);
    gfx->setTextColor(C_TEXT_MUTED);
    gfx->setCursor(212, 14);
    gfx->print(pm ? "PM" : "AM");

    // Date
    gfx->setTextSize(1);
    gfx->setTextColor(C_TEXT_MUTED);
    gfx->setCursor(240, 18);
    gfx->print(dateStr);
  }
}

// =====================================================
// SENSOR DASHBOARD UI
// =====================================================

void drawSensorCard(
  int id, 
  const char *label, 
  float value, 
  const char *unit, 
  int percent, 
  uint16_t barColor
) {
  int x = 7 + id * 78;
  int y = 176;
  int w = 72;
  int h = 58;

  // Base card
  gfx->fillRoundRect(x, y, w, h, 6, C_CARD_BG);
  gfx->drawRoundRect(x, y, w, h, 6, C_CARD_BORDER);

  // Label text
  gfx->setTextSize(1);
  gfx->setTextColor(C_TEXT_MUTED);
  int labelW = strlen(label) * 6;
  gfx->setCursor(x + (w - labelW) / 2, y + 8);
  gfx->print(label);

  // Mapped value text
  char valStr[12];
  if (strcmp(unit, "C") == 0) {
    snprintf(valStr, sizeof(valStr), "%.0fC", value);
  } else {
    snprintf(valStr, sizeof(valStr), "%.0f%%", value);
  }

  gfx->setTextSize(2);
  gfx->setTextColor(C_WHITE);
  int valW = strlen(valStr) * 12;
  gfx->setCursor(x + (w - valW) / 2, y + 22);
  gfx->print(valStr);

  // Dynamic Horizontal Gauge
  int bx = x + 8;
  int by = y + 44;
  int bw = w - 16; // 56
  int bh = 5;

  gfx->drawRect(bx, by, bw, bh, C_CARD_BORDER);

  int fillW = (percent * bw) / 100;
  fillW = constrain(fillW, 0, bw);

  if (fillW > 0) {
    gfx->fillRect(bx, by, fillW, bh, barColor);
  }
}

void updateSensorsUI(bool forceRedraw) {
  static float lastTemp = -999;
  static float lastHum  = -999;
  static int lastSoil   = -999;
  static int lastLight  = -999;

  // Alert flash state machine
  static bool alertFlashState = false;
  static unsigned long lastFlashTime = 0;
  bool flashChanged = false;

  if (millis() - lastFlashTime >= 500) {
    lastFlashTime = millis();
    alertFlashState = !alertFlashState;
    flashChanged = true;
  }

  bool tempAlert = (filteredTemp > 32);
  bool soilAlert = (filteredSoil < 25);

  bool redrawTemp  = forceRedraw || flashChanged || (abs(filteredTemp - lastTemp) >= 1.0);
  bool redrawHum   = forceRedraw || (abs(filteredHum - lastHum) >= 1.0);
  bool redrawSoil  = forceRedraw || flashChanged || (abs(filteredSoil - lastSoil) >= 1);
  bool redrawLight = forceRedraw || (abs(filteredLight - lastLight) >= 2);

  if (redrawTemp) {
    lastTemp = filteredTemp;
    uint16_t barColor = tempAlert ? (alertFlashState ? C_CORAL : C_ALERT_RED) : C_MINT;
    drawSensorCard(0, "TEMP", filteredTemp, "C", (int)((filteredTemp / 50.0) * 100), barColor);
    
    // Visual Alert frame
    if (tempAlert) {
      gfx->drawRoundRect(7, 176, 72, 58, 6, C_ALERT_RED);
    }
  }

  if (redrawHum) {
    lastHum = filteredHum;
    drawSensorCard(1, "HUMID", filteredHum, "%", (int)filteredHum, C_SKY_BLUE);
  }

  if (redrawSoil) {
    lastSoil = (int)filteredSoil;
    uint16_t barColor = soilAlert ? (alertFlashState ? C_CORAL : C_ALERT_RED) : C_MINT;
    drawSensorCard(2, "SOIL", filteredSoil, "%", (int)filteredSoil, barColor);
    
    // Visual Alert frame
    if (soilAlert) {
      gfx->drawRoundRect(163, 176, 72, 58, 6, C_ALERT_RED);
    }
  }

  if (redrawLight) {
    lastLight = (int)filteredLight;
    uint16_t barColor = (filteredLight > 80) ? C_GOLD : C_CREAM;
    drawSensorCard(3, "LIGHT", filteredLight, "%", (int)filteredLight, barColor);
  }
}

// =====================================================
// CHARACTER DRAW LOGIC
// =====================================================

void drawBigEye(int x, int y, int pupilX, int pupilY, uint16_t irisColor) {
  // Eye outer border
  gfx->fillRoundRect(x - 36, y - 40, 72, 80, 24, C_CREAM);
  
  // Iris area
  gfx->fillRoundRect(x - 28, y - 32, 56, 64, 18, irisColor);
  
  // Pupil
  gfx->fillCircle(x + pupilX, y + pupilY, 15, C_PUPIL);
  
  // Highlights
  gfx->fillCircle(x + pupilX - 6, y + pupilY - 8, 6, C_WHITE);
  gfx->fillCircle(x + pupilX + 8, y + pupilY + 8, 3, C_WHITE);
}

void drawHalfEye(int x, int y) {
  gfx->fillRoundRect(x - 36, y - 18, 72, 36, 12, C_CREAM);
  gfx->fillRoundRect(x - 28, y - 12, 56, 24, 8, C_SKY_BLUE);
  gfx->fillCircle(x, y, 10, C_PUPIL);
  gfx->fillCircle(x - 4, y - 4, 4, C_WHITE);
}

void drawClosedEye(int x, int y) {
  // Sleepy eyelashes sleeping line
  gfx->drawFastHLine(x - 24, y, 48, C_CREAM);
  gfx->drawFastHLine(x - 20, y + 1, 40, C_LIGHT_CREAM);
  
  // Custom lashes
  gfx->drawLine(x - 20, y, x - 24, y - 5, C_LIGHT_CREAM);
  gfx->drawLine(x + 20, y, x + 24, y - 5, C_LIGHT_CREAM);
  gfx->drawLine(x, y + 1, x, y + 6, C_LIGHT_CREAM);
}

void drawCheeks(int y) {
  gfx->fillCircle(40, y + 36, 10, C_PINK);
  gfx->fillCircle(280, y + 36, 10, C_PINK);
}

void drawBeak(int y, uint16_t color) {
  gfx->fillTriangle(148, y, 172, y, 160, y + 14, color);
}

void drawCharacter() {
  static Expression prevDrawnExpr = (Expression)-1;
  static int prevBreathY = 999;
  static bool prevBlinking = false;

  bool exprChanged = (expression != prevDrawnExpr);
  bool blinkChanged = (blinking != prevBlinking);

  // If expression changed or blinking state toggled, wipe character middle canvas
  if (exprChanged || blinkChanged) {
    gfx->fillRect(0, 42, W, 130, C_BACKGROUND);
    prevDrawnExpr = expression;
    prevBlinking = blinking;
  }
  // Otherwise, if we are not blinking and breathing shifted, clear only the minimal trails
  else if (!blinking && breathY != prevBreathY && prevBreathY != 999) {
    int diff = breathY - prevBreathY;
    if (diff > 0) { // Moved down
      gfx->fillRect(LEFT_EYE_X - 36, EYE_Y + prevBreathY - 40, 72, diff, C_BACKGROUND);
      gfx->fillRect(RIGHT_EYE_X - 36, EYE_Y + prevBreathY - 40, 72, diff, C_BACKGROUND);
      gfx->fillRect(148, 149 + prevBreathY, 24, diff, C_BACKGROUND);
      gfx->fillRect(30, 140 + prevBreathY - 10, 20, diff, C_BACKGROUND);
      gfx->fillRect(270, 140 + prevBreathY - 10, 20, diff, C_BACKGROUND);
    } else { // Moved up
      gfx->fillRect(LEFT_EYE_X - 36, EYE_Y + breathY + 40, 72, -diff, C_BACKGROUND);
      gfx->fillRect(RIGHT_EYE_X - 36, EYE_Y + breathY + 40, 72, -diff, C_BACKGROUND);
      gfx->fillRect(148, 149 + breathY + 14, 24, -diff, C_BACKGROUND);
      gfx->fillRect(30, 140 + breathY + 10, 20, -diff, C_BACKGROUND);
      gfx->fillRect(270, 140 + breathY + 10, 20, -diff, C_BACKGROUND);
    }
  }
  prevBreathY = breathY;

  int curY = EYE_Y + breathY;
  int curBeakY = 149 + breathY;

  // Blinking overrides standard facial expressions
  if (blinking && expression != SLEEPY && expression != LAZY) {
    // Clear only the eye regions so they don't leave trails of the big eye
    gfx->fillRect(LEFT_EYE_X - 36, curY - 40, 72, 80, C_BACKGROUND);
    gfx->fillRect(RIGHT_EYE_X - 36, curY - 40, 72, 80, C_BACKGROUND);

    if (blinkState == 1 || blinkState == 3) {
      drawHalfEye(LEFT_EYE_X, curY);
      drawHalfEye(RIGHT_EYE_X, curY);
    } else if (blinkState == 2) {
      drawClosedEye(LEFT_EYE_X, curY);
      drawClosedEye(RIGHT_EYE_X, curY);
    }
    drawBeak(curBeakY, C_GOLD);
    return;
  }

  switch (expression) {
    case HAPPY:
      drawBigEye(LEFT_EYE_X, curY, currentPupilX, currentPupilY, C_SKY_BLUE);
      drawBigEye(RIGHT_EYE_X, curY, currentPupilX, currentPupilY, C_SKY_BLUE);
      drawCheeks(curY);
      drawBeak(curBeakY, C_GOLD);
      break;

    case CURIOUS:
      drawBigEye(LEFT_EYE_X, curY, -5, -3, C_TEAL);
      drawBigEye(RIGHT_EYE_X, curY, 5, -3, C_TEAL);
      // tilted brow lines
      gfx->drawLine(LEFT_EYE_X - 25, curY - 48, LEFT_EYE_X + 20, curY - 43, C_LIGHT_CREAM);
      gfx->drawLine(RIGHT_EYE_X - 20, curY - 43, RIGHT_EYE_X + 25, curY - 48, C_LIGHT_CREAM);
      drawBeak(curBeakY, C_GOLD);
      centerText("?", 160, 50 + breathY, 2, C_GOLD);
      break;

    case LAZY:
      drawClosedEye(LEFT_EYE_X, curY + 2);
      drawClosedEye(RIGHT_EYE_X, curY + 2);
      drawBeak(curBeakY + 2, C_TEXT_MUTED);
      break;

    case CONFUSED:
      drawBigEye(LEFT_EYE_X, curY, -4, 4, C_GOLD);
      drawBigEye(RIGHT_EYE_X, curY, 6, -3, C_GOLD);
      // worry brows
      gfx->drawLine(LEFT_EYE_X - 20, curY - 46, LEFT_EYE_X + 20, curY - 42, C_LIGHT_CREAM);
      gfx->drawLine(RIGHT_EYE_X - 20, curY - 42, RIGHT_EYE_X + 20, curY - 46, C_LIGHT_CREAM);
      gfx->fillCircle(160, curBeakY + 6, 6, C_GOLD);
      break;

    case SLEEPY:
      drawClosedEye(LEFT_EYE_X, curY + 1);
      drawClosedEye(RIGHT_EYE_X, curY + 1);
      drawBeak(curBeakY + 1, C_TEXT_MUTED);
      break;

    case SHY:
      drawBigEye(LEFT_EYE_X, curY, 10, 4, C_SKY_BLUE);
      drawBigEye(RIGHT_EYE_X, curY, -10, 4, C_SKY_BLUE);
      drawCheeks(curY);
      drawBeak(curBeakY, C_GOLD);
      break;

    case SURPRISED:
      gfx->fillCircle(LEFT_EYE_X, curY, 36, C_CREAM);
      gfx->fillCircle(RIGHT_EYE_X, curY, 36, C_CREAM);
      gfx->fillCircle(LEFT_EYE_X, curY, 12, C_PUPIL);
      gfx->fillCircle(RIGHT_EYE_X, curY, 12, C_PUPIL);
      gfx->fillCircle(LEFT_EYE_X - 4, curY - 4, 4, C_WHITE);
      gfx->fillCircle(RIGHT_EYE_X - 4, curY - 4, 4, C_WHITE);
      gfx->fillCircle(160, curBeakY + 6, 9, C_CORAL);
      centerText("!", 160, 48 + breathY, 2, C_GOLD);
      break;

    case THIRSTY:
      drawBigEye(LEFT_EYE_X, curY, 0, 8, C_SKY_BLUE);
      drawBigEye(RIGHT_EYE_X, curY, 0, 8, C_SKY_BLUE);
      drawBeak(curBeakY + 2, C_SKY_BLUE);
      // Sad outer angled brow
      gfx->drawLine(LEFT_EYE_X - 25, curY - 43, LEFT_EYE_X + 20, curY - 48, C_LIGHT_CREAM);
      gfx->drawLine(RIGHT_EYE_X - 20, curY - 48, RIGHT_EYE_X + 25, curY - 43, C_LIGHT_CREAM);
      break;

    case HOT:
      drawBigEye(LEFT_EYE_X, curY, 0, -4, C_CORAL);
      drawBigEye(RIGHT_EYE_X, curY, 0, -4, C_CORAL);
      drawCheeks(curY);
      // Sweating red tongue beak
      gfx->fillRoundRect(152, curBeakY, 16, 16, 4, C_CORAL);
      break;

    case EXCITED:
      drawBigEye(LEFT_EYE_X, curY, 0, 0, C_GOLD);
      drawBigEye(RIGHT_EYE_X, curY, 0, 0, C_GOLD);
      drawCheeks(curY);
      gfx->fillTriangle(148, curBeakY, 172, curBeakY, 160, curBeakY - 6, C_GOLD);
      gfx->fillTriangle(148, curBeakY, 172, curBeakY, 160, curBeakY + 12, C_GOLD);
      break;

    case TOUCH:
      drawHeart(LEFT_EYE_X, curY, 22, C_PINK);
      drawHeart(RIGHT_EYE_X, curY, 22, C_PINK);
      drawCheeks(curY);
      gfx->fillTriangle(148, curBeakY, 172, curBeakY, 160, curBeakY - 6, C_GOLD);
      gfx->fillTriangle(148, curBeakY, 172, curBeakY, 160, curBeakY + 12, C_GOLD);
      centerText("HEllo!", 160, 48 + breathY, 1, C_PINK);
      break;
  }
}

// =====================================================
// NON-BLOCKING ANIMATION ENGINE
// =====================================================

void updateAnimations() {
  bool needRedraw = false;
  unsigned long now = millis();

  // 1. Idle breathing clock
  if (now - lastBreathTime >= 280) {
    lastBreathTime = now;
    breathIndex = (breathIndex + 1) % 10;
    breathY = breathSequence[breathIndex];
    needRedraw = true;
  }

  // 2. Eye glance LERPing
  if (now - lastEyeLerpTime >= 30) {
    lastEyeLerpTime = now;
    float dx = targetPupilX - currentPupilX;
    float dy = targetPupilY - currentPupilY;
    if (abs(dx) > 0.1 || abs(dy) > 0.1) {
      currentPupilX += dx * 0.20;
      currentPupilY += dy * 0.20;
      needRedraw = true;
    }
  }

  // 3. Random look-around gazes
  if (now - lastEyeGazeTime >= nextEyeGazeInterval) {
    lastEyeGazeTime = now;
    nextEyeGazeInterval = random(2500, 6000);
    if (expression != TOUCH && expression != SLEEPY && expression != LAZY && expression != THIRSTY && expression != HOT) {
      targetPupilX = random(-10, 11);
      targetPupilY = random(-4, 5);
    } else {
      targetPupilX = 0;
      targetPupilY = 0;
    }
  }

  // 4. Blink frame execution
  if (blinking) {
    if (now - blinkFrameTime >= 35) {
      blinkFrameTime = now;
      blinkState++;
      if (blinkState > 3) {
        blinking = false;
        blinkState = 0;
        lastBlinkTime = now;
      }
      needRedraw = true;
    }
  } else {
    if (now - lastBlinkTime >= blinkInterval) {
      if (expression != SLEEPY && expression != LAZY) {
        blinking = true;
        blinkState = 1;
        blinkFrameTime = now;
        blinkInterval = random(3000, 8000);
        needRedraw = true;
      } else {
        lastBlinkTime = now;
      }
    }
  }

  // 5. Spawn expression particles
  if (now - lastParticleSpawnTime >= 1500) {
    lastParticleSpawnTime = now;
    if (expression == SLEEPY || expression == LAZY) {
      spawnParticle('Z');
    } else if (expression == TOUCH || expression == EXCITED) {
      spawnParticle('H');
    } else if (expression == THIRSTY || expression == HOT) {
      spawnParticle('S');
    }
  }

  if (needRedraw) {
    drawCharacter();
  }

  // Render particles on top of the character layer
  updateParticles(needRedraw);
}

// =====================================================
// REACTION ENGINE (EXPRESSION SELECTION)
// =====================================================

void chooseExpression() {
  Expression lastExpr = expression;

  if (millis() < touchUntil) {
    expression = TOUCH;
  }
  else if (filteredSoil < 25) {
    expression = THIRSTY;
    // Trigger phone notification with cooldown
    if (!notificationSent && (millis() - lastNotificationTime >= NOTIFICATION_COOLDOWN || lastNotificationTime == 0)) {
      sendPhoneNotification("🚨 Your Plant Bot is thirsty! Soil moisture is critically low.");
      notificationSent = true;
      lastNotificationTime = millis();
    }
  }
  else if (filteredTemp > 32) {
    expression = HOT;
  }
  else if (filteredLight < 12) {
    expression = SLEEPY;
  }
  else if (filteredLight > 85) {
    expression = EXCITED;
  }
  else {
    // Reset notification trigger once soil moisture goes back to normal (> 40%)
    if (filteredSoil > 40) {
      notificationSent = false;
    }

    // Normal mood shifts
    if (millis() - lastMoodChange >= MOOD_INTERVAL) {
      lastMoodChange = millis();
      int mood = random(0, 6);
      switch (mood) {
        case 0: expression = HAPPY; break;
        case 1: expression = CURIOUS; break;
        case 2: expression = LAZY; break;
        case 3: expression = CONFUSED; break;
        case 4: expression = SHY; break;
        case 5: expression = SURPRISED; break;
        default: expression = HAPPY; break;
      }
    }
  }

  if (expression != lastExpr) {
    // Reset gaze offsets for non-gaze expressions
    if (expression == TOUCH || expression == SLEEPY || expression == LAZY) {
      targetPupilX = 0;
      targetPupilY = 0;
      currentPupilX = 0;
      currentPupilY = 0;
    }
    drawCharacter();
  }
}

// =====================================================
// TOUCH SENSOR
// =====================================================

void checkTouch() {
  if (wifiConfigMode) return;

  bool currentTouch = digitalRead(TOUCH_PIN);
  bool screenTouched = false;
  TS_Point p;

  if (ts.touched()) {
    p = ts.getPoint();
    // Log raw touch coordinates for hardware diagnostics
    Serial.printf("Raw Touch Event -> X=%d, Y=%d, Z=%d\n", p.x, p.y, p.z);
    
    // Validate pressure Z and coordinates to filter out ghost touches and SPI error readings (e.g., 4095)
    if (p.z > 150 && p.z < 4000 && p.x > 20 && p.x < 4000 && p.y > 20 && p.y < 4000) {
      screenTouched = true;
    }
  }

  bool isTouched = currentTouch || screenTouched;
  static bool touchActive = false;

  if (isTouched) {
    if (!touchActive) {
      touchActive = true;
      
      // If a popup is active, tap anywhere to dismiss it
      if (detailedPopupActive) {
        dismissDetailedPopup();
        return;
      }
      
      // If the screen was touched, check if the tap falls in the sensor card region
      if (screenTouched) {
        // Map raw touch (typically 200-3800) to screen pixel coordinates (0-320, 0-240)
        int lcdX = map(p.x, 200, 3800, 0, 320);
        int lcdY = map(p.y, 200, 3800, 0, 240);
        lcdX = constrain(lcdX, 0, 320);
        lcdY = constrain(lcdY, 0, 240);
        
        Serial.printf("Mapped Touch Point -> X=%d, Y=%d\n", lcdX, lcdY);
        
        // Sensor cards region starts at y = 170
        if (lcdY >= 170) {
          int sensorId = -1;
          if (lcdX >= 7 && lcdX <= 79)       sensorId = 0; // TEMP
          else if (lcdX >= 85 && lcdX <= 157)  sensorId = 1; // HUMID
          else if (lcdX >= 163 && lcdX <= 235) sensorId = 2; // SOIL
          else if (lcdX >= 241 && lcdX <= 313) sensorId = 3; // LIGHT
          
          if (sensorId != -1) {
            drawDetailedPopup(sensorId);
            return;
          }
        }
      }
      
      // Default cute touch interaction (heart eyes expression)
      touchUntil = millis() + 2500;
      expression = TOUCH;
      
      drawCharacter();
      for (int i = 0; i < 3; i++) {
        spawnParticle('H');
      }
      
      touchStartTime = millis();
    } else {
      // Long press triggers Wi-Fi config mode (if popup is not open)
      if (touchStartTime != 0 && millis() - touchStartTime >= LONG_PRESS_DURATION && !detailedPopupActive) {
        startWiFiConfigMode();
        return;
      }
    }
  } else {
    touchStartTime = 0;
    if (touchActive) {
      touchActive = false;
    }
  }
}

// =====================================================
// SENSOR READING & FILTERING
// =====================================================

void readFastSensors() {
  // Read soil percent
  int rawSoil = analogRead(SOIL_PIN);
  int percentSoil = map(rawSoil, 4095, 1200, 0, 100);
  percentSoil = constrain(percentSoil, 0, 100);

  // Read light percent
  int rawLight = analogRead(LDR_PIN);
  int percentLight = map(rawLight, 0, 4095, 0, 100);
  percentLight = constrain(percentLight, 0, 100);

  // Apply EMA filters to prevent rapid bouncing
  filteredSoil = (EMA_ALPHA_FAST * percentSoil) + ((1.0 - EMA_ALPHA_FAST) * filteredSoil);
  filteredLight = (EMA_ALPHA_FAST * percentLight) + ((1.0 - EMA_ALPHA_FAST) * filteredLight);
}

void readSlowSensors() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t)) {
    filteredTemp = (EMA_ALPHA_SLOW * t) + ((1.0 - EMA_ALPHA_SLOW) * filteredTemp);
  }
  if (!isnan(h)) {
    filteredHum = (EMA_ALPHA_SLOW * h) + ((1.0 - EMA_ALPHA_SLOW) * filteredHum);
  }
}

void initFilters() {
  // Populate first readings directly to avoid ramping from 0
  int rawSoil = analogRead(SOIL_PIN);
  int percentSoil = map(rawSoil, 4095, 1200, 0, 100);
  filteredSoil = constrain(percentSoil, 0, 100);

  int rawLight = analogRead(LDR_PIN);
  int percentLight = map(rawLight, 0, 4095, 0, 100);
  filteredLight = constrain(percentLight, 0, 100);

  float t = dht.readTemperature();
  float h = dht.readHumidity();
  filteredTemp = isnan(t) ? 25.0 : t;
  filteredHum = isnan(h) ? 60.0 : h;
}

// =====================================================
// SERIAL DEBUGGER
// =====================================================

void printDebugInfo() {
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint >= 2000) {
    lastPrint = millis();
    Serial.print("Temp: ");     Serial.print(filteredTemp, 1);
    Serial.print("C | Hum: ");  Serial.print(filteredHum, 0);
    Serial.print("% | Soil: "); Serial.print((int)filteredSoil);
    Serial.print("% | Light: ");Serial.print((int)filteredLight);
    Serial.print("% | Mood: ");
    
    switch (expression) {
      case HAPPY:     Serial.println("HAPPY"); break;
      case CURIOUS:   Serial.println("CURIOUS"); break;
      case LAZY:      Serial.println("LAZY"); break;
      case CONFUSED:  Serial.println("CONFUSED"); break;
      case SLEEPY:    Serial.println("SLEEPY"); break;
      case SHY:       Serial.println("SHY"); break;
      case SURPRISED: Serial.println("SURPRISED"); break;
      case THIRSTY:   Serial.println("THIRSTY"); break;
      case HOT:       Serial.println("HOT"); break;
      case EXCITED:   Serial.println("EXCITED"); break;
      case TOUCH:     Serial.println("TOUCH"); break;
    }
  }
}

// =====================================================
// INTERACTIVE DETAILED POPUPS
// =====================================================

void drawDetailedPopup(int sensorId) {
  detailedPopupActive = true;
  popupSensorId = sensorId;
  
  // Draw a popup window overlay in the center of the screen
  int px = 20;
  int py = 45;
  int pw = 280;
  int ph = 150;
  
  gfx->fillRoundRect(px, py, pw, ph, 8, C_CARD_BG);
  gfx->drawRoundRect(px, py, pw, ph, 8, C_TEAL); // Teal glowing border
  
  // Title & Icon
  gfx->setTextSize(2);
  gfx->setTextColor(C_GOLD);
  
  const char *title = "";
  char valStr[32];
  const char *condition = "";
  const char *action = "";
  
  if (sensorId == 0) {
    title = "TEMPERATURE";
    snprintf(valStr, sizeof(valStr), "Value: %.1f C", filteredTemp);
    if (filteredTemp < 18.0) {
      condition = "COLD";
      action = "Metabolism slow. Move to warm spot.";
    } else if (filteredTemp > 30.0) {
      condition = "HOT";
      action = "High evaporation. Water more often.";
    } else {
      condition = "IDEAL";
      action = "Temp is optimal for photosynthesis.";
    }
  } else if (sensorId == 1) {
    title = "AIR HUMIDITY";
    snprintf(valStr, sizeof(valStr), "Value: %.0f %%", filteredHum);
    if (filteredHum < 40.0) {
      condition = "DRY AIR";
      action = "Mist leaves or use humidifier.";
    } else if (filteredHum > 75.0) {
      condition = "HUMID";
      action = "Watch out for mold or fungus.";
    } else {
      condition = "COMFORTABLE";
      action = "Comfortable humidity for growth.";
    }
  } else if (sensorId == 2) {
    title = "SOIL MOISTURE";
    snprintf(valStr, sizeof(valStr), "Value: %.0f %%", filteredSoil);
    if (filteredSoil < 30.0) {
      condition = "DRY / THIRSTY";
      action = "Please water plant immediately!";
    } else if (filteredSoil > 80.0) {
      condition = "OVERWATERED";
      action = "Halt watering to prevent root rot.";
    } else {
      condition = "WELL HYDRATED";
      action = "Moisture balance is perfect.";
    }
  } else if (sensorId == 3) {
    title = "AMBIENT LIGHT";
    snprintf(valStr, sizeof(valStr), "Value: %.0f %%", filteredLight);
    if (filteredLight < 20.0) {
      condition = "TOO DARK";
      action = "Move closer to window or add light.";
    } else if (filteredLight > 80.0) {
      condition = "VERY BRIGHT";
      action = "Perfect for sun-loving plants.";
    } else {
      condition = "OPTIMAL LIGHT";
      action = "Excellent indirect sunlight.";
    }
  }
  
  // Header text
  centerText(title, 160, py + 12, 1, C_GOLD);
  gfx->drawFastHLine(px + 15, py + 28, pw - 30, C_CARD_BORDER);
  
  // Large Value
  centerText(valStr, 160, py + 38, 2, C_WHITE);
  
  // Condition status
  char condStr[64];
  snprintf(condStr, sizeof(condStr), "Status: %s", condition);
  centerText(condStr, 160, py + 64, 1, (strcmp(condition, "IDEAL") == 0 || strcmp(condition, "COMFORTABLE") == 0 || strcmp(condition, "WELL HYDRATED") == 0 || strcmp(condition, "OPTIMAL LIGHT") == 0) ? C_MINT : C_CORAL);
  
  // Detailed Action/Advice
  gfx->setTextSize(1);
  gfx->setTextColor(C_LIGHT_CREAM);
  
  // Center wrapped description manually
  int textLen = strlen(action);
  if (textLen < 32) {
    centerText(action, 160, py + 86, 1, C_LIGHT_CREAM);
  } else {
    // split into two lines
    char line1[36] = {0};
    char line2[36] = {0};
    // Simple split on space near midpoint
    int splitIdx = 25;
    while (splitIdx > 10 && action[splitIdx] != ' ') {
      splitIdx--;
    }
    strncpy(line1, action, splitIdx);
    strcpy(line2, action + splitIdx + 1);
    centerText(line1, 160, py + 86, 1, C_LIGHT_CREAM);
    centerText(line2, 160, py + 98, 1, C_LIGHT_CREAM);
  }
  
  // Close instruction
  centerText("[ Tap Screen to Dismiss ]", 160, py + 124, 1, C_TEXT_MUTED);
}

void dismissDetailedPopup() {
  detailedPopupActive = false;
  popupSensorId = -1;
  
  // Redraw the main canvas
  gfx->fillScreen(C_BACKGROUND);
  drawHeaderBase();
  updateHeader();
  updateSensorsUI(true);
  drawCharacter();
}

// =====================================================
// WIFI CONFIGURATION PORTAL
// =====================================================

void drawWiFiConfigScreen() {
  gfx->fillScreen(C_BACKGROUND);
  
  // Floating rounded card for instructions
  gfx->fillRoundRect(15, 15, 290, 210, 8, C_CARD_BG);
  gfx->drawRoundRect(15, 15, 290, 210, 8, C_CARD_BORDER);
  
  centerText("WiFi SETUP MODE", 160, 30, 2, C_GOLD);
  
  gfx->drawFastHLine(30, 55, 260, C_CARD_BORDER);
  
  centerText("1. Connect your phone/PC to:", 160, 75, 1, C_WHITE);
  centerText("MOA-Plant-Bot", 160, 95, 2, C_TEAL);
  
  centerText("2. Open your web browser to:", 160, 130, 1, C_WHITE);
  centerText("http://192.168.4.1", 160, 150, 2, C_MINT);
  
  centerText("Or wait for the automatic portal", 160, 185, 1, C_TEXT_MUTED);
  centerText("Status: Waiting for input...", 160, 205, 1, C_MINT);
}

void handleWifiConfigPortal() {
  String html = "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  html += "<style>";
  html += "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }";
  html += ".card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; width: 100%; max-width: 360px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); box-sizing: border-box; }";
  html += "h2 { color: #10b981; margin-top: 0; font-size: 24px; text-align: center; font-weight: 600; }";
  html += "p { color: #94a3b8; font-size: 14px; text-align: center; margin-bottom: 24px; }";
  html += ".form-group { margin-bottom: 16px; display: flex; flex-direction: column; }";
  html += "label { margin-bottom: 6px; font-size: 14px; color: #cbd5e1; }";
  html += "input, select { background: #0f172a; border: 1px solid #475569; border-radius: 6px; padding: 10px; color: #f8fafc; font-size: 16px; outline: none; transition: border-color 0.2s; }";
  html += "input:focus, select:focus { border-color: #10b981; }";
  html += "button { background: #10b981; color: #0f172a; border: none; border-radius: 6px; padding: 12px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 12px; transition: background 0.2s; }";
  html += "button:hover { background: #34d399; }";
  html += ".footer { text-align: center; margin-top: 24px; font-size: 12px; color: #64748b; }";
  html += "</style></head><body>";
  html += "<div class='card'>";
  html += "<h2>MOA Setup</h2>";
  html += "<p>Configure your smart plant bot's Wi-Fi connection parameters below.</p>";
  html += "<form method='POST' action='/save'>";
  html += "<div class='form-group'>";
  html += "<label>WiFi Network Name (SSID)</label>";
  html += "<input type='text' name='ssid' placeholder='SSID' required>";
  html += "</div>";
  html += "<div class='form-group'>";
  html += "<label>WiFi Password</label>";
  html += "<input type='password' name='password' placeholder='••••••••' required>";
  html += "</div>";
  html += "<button type='submit'>Save and Connect</button>";
  html += "</form>";
  html += "</div>";
  html += "<div class='footer'>MOA Interactive Plant Bot &copy; 2026</div>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

void handleWifiConfigSave() {
  String reqSSID = server.arg("ssid");
  String reqPass = server.arg("password");
  
  Serial.println("Saving new WiFi credentials:");
  Serial.print("SSID: "); Serial.println(reqSSID);
  
  // Clear instructions card and display saving and rebooting status on TFT screen
  gfx->fillRoundRect(15, 15, 290, 210, 8, C_CARD_BG);
  gfx->drawRoundRect(15, 15, 290, 210, 8, C_CARD_BORDER);
  centerText("SAVING CREDENTIALS", 160, 45, 2, C_GOLD);
  centerText("Connecting to WiFi:", 160, 90, 1, C_WHITE);
  centerText(reqSSID.c_str(), 160, 115, 2, C_TEAL);
  centerText("Rebooting after submission...", 160, 175, 1, C_PINK);
  centerText("Please wait...", 160, 200, 1, C_TEXT_MUTED);

  preferences.begin("wifi-config", false);
  preferences.putString("ssid", reqSSID);
  preferences.putString("password", reqPass);
  preferences.end();
  
  String html = "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  html += "<style>body { font-family: sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding: 40px; } h2 { color: #10b981; }</style></head><body>";
  html += "<h2>Credentials Saved!</h2>";
  html += "<p>MOA is now restarting and trying to connect to: <b>" + reqSSID + "</b></p>";
  html += "<p>You can close this window now.</p>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
  delay(2000);
  ESP.restart();
}

void handleNotFound() {
  server.sendHeader("Location", "http://192.168.4.1/", true);
  server.send(302, "text/plain", "");
}

void startWiFiConfigMode() {
  wifiConfigMode = true;
  Serial.println("Starting WiFi Configuration Mode...");
  
  drawWiFiConfigScreen();
  
  WiFi.disconnect();
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  WiFi.softAP("MOA-Plant-Bot");
  
  dnsServer.start(53, "*", IPAddress(192, 168, 4, 1));
  
  server.on("/", HTTP_GET, handleWifiConfigPortal);
  server.on("/save", HTTP_POST, handleWifiConfigSave);
  server.onNotFound(handleNotFound);
  server.begin();
  
  Serial.println("Access Point 'MOA-Plant-Bot' Started. Captive portal running at 192.168.4.1");
}

// =====================================================
// SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  // Load saved Wi-Fi credentials from Preferences
  preferences.begin("wifi-config", true);
  wifiSSID = preferences.getString("ssid", WIFI_SSID);
  wifiPassword = preferences.getString("password", WIFI_PASSWORD);
  preferences.end();

  Serial.print("Booting. Saved SSID: ");
  Serial.println(wifiSSID);

  pinMode(TOUCH_PIN, INPUT);
  pinMode(SOIL_PIN, INPUT);
  pinMode(LDR_PIN, INPUT);

  dht.begin();
  
  // Initialize Touchscreen (XPT2046) using secondary HSPI bus
  touchSPI.begin(T_CLK, T_DO, T_DIN, T_CS);
  ts.begin(touchSPI);
  ts.setRotation(1); // Set to match the landscape screen orientation
  
  // Seed random from noise pin
  randomSeed(analogRead(34));

  // Initialize DS1307
  Wire.begin(21, 22);
  if (!rtc.begin()) {
    Serial.println("DS1307 NOT FOUND! Operating in software clock fallback.");
    rtcFound = false;
  } else {
    rtcFound = true;
    Serial.println("DS1307 connected.");
    if (!rtc.isrunning()) {
      Serial.println("RTC was stopped. Syncing to build time.");
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }
  }

  // Initialize TFT Screen
  if (!gfx->begin()) {
    Serial.println("TFT initialization failed!");
    while (true) {
      delay(100);
    }
  }
  delay(300);

  // Initial Full Redraw
  gfx->fillScreen(C_BACKGROUND);
  drawHeaderBase();
  
  // Show connection status on screen
  centerText("Connecting WiFi...", 160, 110, 1, C_TEXT_MUTED);
  connectWiFi();
  
  // Wipe temporary message
  gfx->fillRect(40, 95, 240, 30, C_BACKGROUND);
  
  initFilters();
  updateHeader();
  updateSensorsUI(true);
  
  lastBlinkTime = millis();
  blinkInterval = 1000;
  lastMoodChange = millis();

  drawCharacter();
  
  Serial.println("MOA INITIALIZATION COMPLETE");
}

// =====================================================
// MAIN LOOP (NON-BLOCKING)
// =====================================================

void loop() {
  // If in WiFi Config Portal mode, process web/dns requests and halt regular loop
  if (wifiConfigMode) {
    dnsServer.processNextRequest();
    server.handleClient();
    delay(10);
    return;
  }

  // If a detailed sensor card popup is active, pause standard loops and only monitor touch dismissal
  if (detailedPopupActive) {
    checkTouch();
    delay(10);
    return;
  }

  unsigned long now = millis();

  // 1. Update Clock & WiFi status
  updateHeader();

  // Background WiFi reconnect logic
  if (now - lastWifiCheck >= WIFI_CHECK_INTERVAL) {
    lastWifiCheck = now;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi disconnected. Reconnecting...");
      WiFi.disconnect();
      WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());
    }
  }

  // 2. Read Sensors on Timers
  if (now - lastFastSensorRead >= FAST_SENSOR_INTERVAL) {
    lastFastSensorRead = now;
    readFastSensors();
    updateSensorsUI(false);
  }

  if (now - lastSlowSensorRead >= SLOW_SENSOR_INTERVAL) {
    lastSlowSensorRead = now;
    readSlowSensors();
    updateSensorsUI(false);
  }

  // Send Telemetry on Timer
  if (now - lastTelemetryTime >= TELEMETRY_INTERVAL) {
    lastTelemetryTime = now;
    sendTelemetry();
  }

  // 3. Evaluate Touch Interaction
  checkTouch();

  // 4. Update Expressions & Animation Frame Tick
  chooseExpression();
  updateAnimations();

  // 5. Debug Log
  printDebugInfo();

  delay(10);
}
