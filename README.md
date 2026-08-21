# MOA - Smart Plant Bot

MOA is an interactive, animated smart plant monitor built using ESP32. It features an expressive digital face that reacts to environmental conditions (temperature, soil moisture, light, and touch) while displaying a real-time dashboard of sensor readings on a TFT screen.

## Features

- **Dynamic Face Animations**: Expressions shift dynamically based on sensor thresholds (HAPPY, CURIOUS, SLEEPY, THIRSTY, HOT, EXCITED, CONFUSED, etc.).
- **Smoothed Sensor Dashboard**: Displays live readings for temperature, humidity, soil moisture, and ambient light with smooth gauges.
- **Natural Animation Engine**: Features realistic non-blocking animations for breathing, blinking, pupil lerping, and floating particle effects (like sleeping 'Z's, love hearts, and sweat drops).
- **Time & Date Display**: Real-time clock support with DS1307, falling back to a software clock if hardware RTC is unavailable.
- **Capacitive Touch Interactions**: Reacts instantly with a heart shower expression when touched.

## Hardware Components

- **MCU**: ESP32
- **Display**: ST7789 240x320 TFT (Landscape mode)
- **Temp/Humidity Sensor**: DHT22
- **Soil Moisture**: Analog soil sensor
- **Ambient Light**: LDR (Light Dependent Resistor)
- **Touch Sensor**: Capacitive touch pin
- **Real-Time Clock**: DS1307 (I2C)

## Pin Configuration

| Component | Pin | Notes |
| :--- | :--- | :--- |
| TFT CS | GPIO 15 | SPI |
| TFT DC | GPIO 2 | SPI |
| TFT RST | GPIO 4 | SPI |
| TFT MOSI | GPIO 23 | SPI |
| TFT MISO | GPIO 19 | SPI |
| TFT SCLK | GPIO 18 | SPI |
| DHT22 | GPIO 16 | Data |
| Soil Sensor | GPIO 33 | Analog Input |
| LDR | GPIO 34 | Analog Input |
| Touch Sensor | GPIO 5 | Digital/Capacitive Input |
| RTC SDA | GPIO 21 | I2C |
| RTC SCL | GPIO 22 | I2C |

## Software Libraries Required

Make sure to install the following libraries in the Arduino IDE before uploading:
- `Arduino_GFX_Library` (by Linar Yusupov / Arduino GFX)
- `DHT sensor library` (by Adafruit)
- `RTClib` (by Adafruit)
- `Adafruit Unified Sensor` (dependency for DHT)

## License

This project is open-source. Feel free to use, modify, and distribute it!
