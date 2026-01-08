#include <OneWire.h>
#include <DallasTemperature.h>
#include <TinyGPS.h>
#include <SPI.h>
#include <SD.h>

// ==== RTC (DS3231) ====
#include <Wire.h>
#include "RTClib.h"
RTC_DS3231 rtc;
bool rtcFound = false;

// ==== MPU-6050 ====
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
Adafruit_MPU6050 mpu;
bool mpuFound = false;

// ------- Config -------
#define LOG_BAUD 115200
#define GPS_BAUD 9600
#define SAMPLE_MS 1000  // 1 Hz

// DS18B20
#define DS_MOTOR_PIN 2
#define DS_BATERIA_PIN 3

// SD
#define SD_CS_PIN 4
File logFile;

OneWire oneWireMotor(DS_MOTOR_PIN);
DallasTemperature dsMotor(&oneWireMotor);

OneWire oneWireBateria(DS_BATERIA_PIN);
DallasTemperature dsBateria(&oneWireBateria);

// GPS em Serial1 (Mega)
TinyGPS gps;

// ----------------------------------------------------------------------
// ESTRUTURA DAS AMOSTRAS
// ----------------------------------------------------------------------
struct DataSample {
  unsigned long ms;
  uint32_t epoch;
  bool rtcOk;

  float tempMotorC;
  float tempBateriaC;

  bool gpsFix;
  double lat;
  double lng;
  float speedKmh;
  unsigned int sats;

  bool imuOk;
  float ax, ay, az;
  float gx, gy, gz;
  float imuTempC;
};

unsigned long lastSample = 0;

// ----------------------------------------------------------------------
// PRINT HELPERS
// ----------------------------------------------------------------------
static void print2(uint8_t v) {
  if (v < 10) Serial.print('0');
  Serial.print(v);
}

static void printISO8601(uint32_t epoch) {
  DateTime dt(epoch);
  Serial.print(dt.year()); Serial.print('-'); print2(dt.month()); Serial.print('-'); print2(dt.day());
  Serial.print('T'); print2(dt.hour()); Serial.print(':'); print2(dt.minute()); Serial.print(':'); print2(dt.second());
  Serial.print('Z');
}

// ----------------------------------------------------------------------
// MOSTRA AMOSTRA NO SERIAL
// ----------------------------------------------------------------------
void printSample(const DataSample& s) {
  Serial.print(F("t(ms)=")); Serial.print(s.ms);

  Serial.print(F(" ts="));
  if (s.rtcOk) printISO8601(s.epoch); else Serial.print(F("NA"));

  Serial.print(F(" motorC=")); Serial.print(s.tempMotorC, 2);
  Serial.print(F(" bateriaC=")); Serial.print(s.tempBateriaC, 2);

  Serial.print(F(" sats=")); Serial.print(s.sats);
  Serial.print(F(" fix=")); Serial.print(s.gpsFix ? 1 : 0);

  Serial.print(F(" lat=")); if (s.gpsFix) Serial.print(s.lat, 6); else Serial.print(F("NA"));
  Serial.print(F(" lng=")); if (s.gpsFix) Serial.print(s.lng, 6); else Serial.print(F("NA"));

  Serial.print(F(" v(kmh)="));
  if (isnan(s.speedKmh)) Serial.print(F("NA")); else Serial.print(s.speedKmh, 2);

  Serial.print(F(" imu=")); Serial.print(s.imuOk ? 1 : 0);
  Serial.print(F(" ax=")); Serial.print(s.ax, 3);
  Serial.print(F(" ay=")); Serial.print(s.ay, 3);
  Serial.print(F(" az=")); Serial.print(s.az, 3);

  Serial.print(F(" gx=")); Serial.print(s.gx, 3);
  Serial.print(F(" gy=")); Serial.print(s.gy, 3);
  Serial.print(F(" gz=")); Serial.print(s.gz, 3);

  Serial.print(F(" imuTempC=")); Serial.println(s.imuTempC, 2);
}

// ----------------------------------------------------------------------
// SALVA CSV NO SD
// ----------------------------------------------------------------------
void logSampleToSD(const DataSample& s) {
  if (!logFile) return;

  logFile.print(s.ms); logFile.print(',');
  logFile.print(s.epoch); logFile.print(',');
  logFile.print(s.tempMotorC, 2); logFile.print(',');
  logFile.print(s.tempBateriaC, 2); logFile.print(',');
  logFile.print(s.sats); logFile.print(',');
  logFile.print(s.gpsFix ? 1 : 0); logFile.print(',');

  if (s.gpsFix) logFile.print(s.lat, 6); else logFile.print("NA"); logFile.print(',');
  if (s.gpsFix) logFile.print(s.lng, 6); else logFile.print("NA"); logFile.print(',');

  if (isnan(s.speedKmh)) logFile.print("NA"); else logFile.print(s.speedKmh, 2);
  logFile.print(',');

  logFile.print(s.imuOk ? 1 : 0); logFile.print(',');
  logFile.print(s.ax, 3); logFile.print(',');
  logFile.print(s.ay, 3); logFile.print(',');
  logFile.print(s.az, 3); logFile.print(',');
  logFile.print(s.gx, 3); logFile.print(',');
  logFile.print(s.gy, 3); logFile.print(',');
  logFile.print(s.gz, 3); logFile.print(',');

  logFile.println(s.imuTempC, 2);

  logFile.flush();
}

// ----------------------------------------------------------------------
// SETUP
// ----------------------------------------------------------------------
void setup() {
  Serial.begin(LOG_BAUD);
  delay(1000);

  Serial1.begin(GPS_BAUD);
  Wire.begin();
  pinMode(53, OUTPUT);  // SPI SS

  dsMotor.begin();
  dsBateria.begin();

  // RTC
  rtcFound = rtc.begin();
  if (!rtcFound) {
    Serial.println(F("[RTC] Nao encontrado em 0x68. ts ficara NA."));
  } else {
    if (rtc.lostPower()) {
      Serial.println(F("[RTC] Perdeu energia. Ajustando para hora da compilacao."));
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }

    DateTime dt = rtc.now();
    Serial.print(F("[RTC] Leitura inicial: "));
    Serial.print(dt.year()); Serial.print('-'); print2(dt.month()); Serial.print('-'); print2(dt.day());
    Serial.print(' ');
    print2(dt.hour()); Serial.print(':'); print2(dt.minute()); Serial.print(':'); print2(dt.second());
    Serial.println();
  }

  // MPU-6050
  if (mpu.begin(0x69, &Wire)) {
    mpuFound = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }

  // --- SD COM ARQUIVO NOVO POR BOOT ---
  Serial.print(F("Inicializando SD... "));
  if (!SD.begin(SD_CS_PIN)) {
    Serial.println(F("FALHA"));
  } else {
    Serial.println(F("OK"));

    // Criar nome de arquivo automaticamente
    char filename[20];
    int fileIndex = 1;

    do {
      sprintf(filename, "log_%03d.csv", fileIndex);
      fileIndex++;
    } while (SD.exists(filename));

    Serial.print(F("[SD] Criando arquivo: "));
    Serial.println(filename);

    logFile = SD.open(filename, FILE_WRITE);
    if (!logFile) {
      Serial.println(F("[SD] ERRO ao criar arquivo!"));
    } else {
      logFile.println(F(
        "ms,epoch,tempMotorC,tempBateriaC,sats,fix,lat,lng,speedKmh,"
        "imuOk,ax,ay,az,gx,gy,gz,imuTempC"
      ));
      logFile.flush();
      Serial.println(F("[SD] Cabecalho escrito."));
    }
  }

  Serial.println(F("Init pronto."));
}

// ----------------------------------------------------------------------
// LOOP PRINCIPAL
// ----------------------------------------------------------------------
void loop() {
  while (Serial1.available()) gps.encode(Serial1.read());

  unsigned long now = millis();
  if (now - lastSample < SAMPLE_MS) return;
  lastSample = now;

  // Temperaturas
  dsMotor.requestTemperatures();
  dsBateria.requestTemperatures();
  float tMotor = dsMotor.getTempCByIndex(0);
  float tBateria = dsBateria.getTempCByIndex(0);

  // GPS
  float flat = 0, flng = 0;
  unsigned long fix_age = TinyGPS::GPS_INVALID_AGE;
  gps.f_get_position(&flat, &flng, &fix_age);

  bool hasFix = fix_age != TinyGPS::GPS_INVALID_AGE && fix_age < 2000;
  unsigned int satsUL = gps.satellites();
  if (satsUL == TinyGPS::GPS_INVALID_SATELLITES) satsUL = 0;

  float vkmh = gps.f_speed_kmph();
  if (!hasFix) vkmh = NAN;

  // RTC
  uint32_t epoch = 0;
  bool rtcOkSample = false;

  if (rtcFound) {
    DateTime dt = rtc.now();
    epoch = dt.unixtime();
    rtcOkSample = true;
  }

  // IMU
  bool imuOk = false;
  float ax=NAN, ay=NAN, az=NAN;
  float gx=NAN, gy=NAN, gz=NAN;
  float imuTempC = NAN;

  if (mpuFound) {
    sensors_event_t a, g, tempEvent;
    mpu.getEvent(&a, &g, &tempEvent);

    imuOk = true;

    ax = a.acceleration.x;
    ay = a.acceleration.y;
    az = a.acceleration.z;

    gx = g.gyro.x;
    gy = g.gyro.y;
    gz = g.gyro.z;

    int16_t rawTemp = 0;
    Wire.beginTransmission(0x69);
    Wire.write(0x41);
    Wire.endTransmission(false);
    Wire.requestFrom(0x69, 2, true);

    if (Wire.available() == 2) {
      rawTemp = (Wire.read() << 8) | Wire.read();
      imuTempC = (rawTemp / 340.0) + 36.53;
    }
  }

  DataSample s{
    now,
    epoch,
    rtcOkSample,
    tMotor,
    tBateria,
    hasFix,
    hasFix ? flat : NAN,
    hasFix ? flng : NAN,
    vkmh,
    satsUL,
    imuOk, ax, ay, az, gx, gy, gz, imuTempC
  };

  printSample(s);
  logSampleToSD(s);
}
