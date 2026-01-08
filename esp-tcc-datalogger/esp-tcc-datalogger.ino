#include <Arduino.h>

#include <OneWire.h>
#include <DallasTemperature.h>

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ===================== BLE UUIDs =====================
#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define CHARACTERISTIC_UUID "abcd1234-1234-1234-1234-abcdef123456"

// ===================== Identidade =====================
const char* DEVICE_ID = "esp32-001";

// ===================== DS18B20 =====================
#define DS_MOTOR_PIN    33   // 🔹 motor
#define DS_BATERIA_PIN  25   // 🔹 bateria
#define DS_REF_PIN      32   // 🔹 referência

OneWire oneWireMotor(DS_MOTOR_PIN);
DallasTemperature dsMotor(&oneWireMotor);

OneWire oneWireBateria(DS_BATERIA_PIN);
DallasTemperature dsBateria(&oneWireBateria);

OneWire oneWireRef(DS_REF_PIN);
DallasTemperature dsRef(&oneWireRef);

// ===================== MPU-6050 (somente aceleração) =====================
Adafruit_MPU6050 mpu;
bool mpuOk = false;

// ===================== BLE =====================
BLEServer* pServer = nullptr;
BLECharacteristic* pCharacteristic = nullptr;

volatile bool deviceConnected = false;
bool oldDeviceConnected = false;

static uint32_t sampleId = 0;

// ===================== Helpers =====================
static bool isValidTemp(float t) {
  return (t != DEVICE_DISCONNECTED_C) && (t > -50.0f) && (t < 150.0f);
}

// ===================== BLE Callbacks =====================
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    deviceConnected = true;
    Serial.println("✅ Cliente BLE conectado!");
  }
  void onDisconnect(BLEServer*) override {
    deviceConnected = false;
    Serial.println("⚠️ Cliente BLE desconectado!");
  }
};

// ===================== Setup Sensores =====================
void setupSensors() {
  dsMotor.begin();
  dsBateria.begin();
  dsRef.begin();

  Serial.print("DS Motor: ");
  Serial.println(dsMotor.getDeviceCount());

  Serial.print("DS Bateria: ");
  Serial.println(dsBateria.getDeviceCount());

  Serial.print("DS Referência: ");
  Serial.println(dsRef.getDeviceCount());

  // I2C MPU-6050
  Wire.begin(21, 22);

  mpuOk = mpu.begin(0x68, &Wire); // use 0x69 se necessário
  if (!mpuOk) {
    Serial.println("⚠️ MPU6050 não encontrado (continuando sem IMU)");
  } else {
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println("✅ MPU6050 OK");
  }
};

// ===================== Setup BLE =====================
void setupBLE() {
  BLEDevice::init("ESP32-DataLogger");
  BLEDevice::setMTU(185);

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_NOTIFY
  );

  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);

  BLEDevice::startAdvertising();
  Serial.println("📡 BLE pronto! Aguardando conexão...");
}

// ===================== Setup =====================
void setup() {
  Serial.begin(115200);
  delay(300);

  setupSensors();
  setupBLE();
}

// ===================== Loop =====================
void loop() {
  static unsigned long lastSend = 0;
  const unsigned long SEND_MS = 1000;

  if (!deviceConnected && oldDeviceConnected) {
    delay(200);
    pServer->startAdvertising();
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  unsigned long now = millis();
  if (!deviceConnected || (now - lastSend < SEND_MS)) {
    delay(10);
    return;
  }
  lastSend = now;

  // ===== Temperaturas =====
  dsMotor.requestTemperatures();
  dsBateria.requestTemperatures();
  dsRef.requestTemperatures();

  float motorC   = dsMotor.getTempCByIndex(0);
  float batteryC = dsBateria.getTempCByIndex(0);
  float refC     = dsRef.getTempCByIndex(0);

  bool motorOk = isValidTemp(motorC);
  bool battOk  = isValidTemp(batteryC);
  bool refOk   = isValidTemp(refC);

  // ===== Acelerômetro =====
  int ax_i = 0, ay_i = 0, az_i = 0;

  if (mpuOk) {
    sensors_event_t a, g, t;
    mpu.getEvent(&a, &g, &t);

    ax_i = (int)(a.acceleration.x * 100.0f);
    ay_i = (int)(a.acceleration.y * 100.0f);
    az_i = (int)(a.acceleration.z * 100.0f);
  }

  Serial.printf(
    "🌡️ M=%.2f B=%.2f R=%.2f | 📐 ax=%d ay=%d az=%d\n",
    motorC, batteryC, refC, ax_i, ay_i, az_i
  );

  // ===== Payload BLE compacto =====
  char payload[160];

  snprintf(
    payload, sizeof(payload),
    "{\"id\":\"%s\",\"m\":%.2f,\"b\":%.2f,\"r\":%.2f,"
    "\"ax\":%d,\"ay\":%d,\"az\":%d,\"s\":%lu}",
    DEVICE_ID,
    motorOk ? motorC : -127.0f,
    battOk  ? batteryC : -127.0f,
    refOk   ? refC     : -127.0f,
    ax_i, ay_i, az_i,
    (unsigned long)sampleId++
  );

  pCharacteristic->setValue((uint8_t*)payload, strlen(payload));
  pCharacteristic->notify();

  Serial.print("➡️ BLE notify: ");
  Serial.println(payload);
}
