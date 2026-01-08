/**
 * DataLogger Gateway App
 * ESP32 -> BLE -> iPhone -> Servidor
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { BleManager, Device, Subscription, State } from "react-native-ble-plx";
import * as Location from "expo-location";

import {
  SERVICE_UUID,
  CHAR_UUID,
  parseESP32Payload,
  isValidESP32Device,
  formatTimestamp,
  type ESP32Payload,
} from "./utils/ble";

import {
  TelemetryQueue,
  createTelemetryPayload,
  type LocationData,
} from "./utils/net";

// Estados de conexão
type ConnectionStatus =
  | "idle"
  | "scanning"
  | "connecting"
  | "connected"
  | "disconnected";

// Máximo de linhas de log
const MAX_LOG_LINES = 20;

export default function App() {
  // BLE Manager (singleton)
  const bleManagerRef = useRef<BleManager | null>(null);

  // Device conectado
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [deviceRssi, setDeviceRssi] = useState<number | null>(null);

  // Status de conexão
  const [status, setStatus] = useState<ConnectionStatus>("idle");

  // Dados do sensor
  const [sensorData, setSensorData] = useState<ESP32Payload | null>(null);

  // Localização
  const [location, setLocation] = useState<LocationData>({
    lat: null,
    lng: null,
    accuracyM: null,
    speedMps: null,
    headingDeg: null,
  });

  // Logs
  const [logs, setLogs] = useState<string[]>([]);

  // Nome do caso de teste
  const [testCaseName, setTestCaseName] = useState<string>("");

  // Scan progress
  const [scanSeconds, setScanSeconds] = useState<number>(0);
  const SCAN_TIMEOUT_SECONDS = 30;

  // Refs para cleanup
  const notificationSubscriptionRef = useRef<Subscription | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(
    null
  );
  const telemetryQueueRef = useRef<TelemetryQueue>(new TelemetryQueue());
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const testCaseNameRef = useRef<string>("");

  // Atualiza ref quando estado muda
  useEffect(() => {
    testCaseNameRef.current = testCaseName;
  }, [testCaseName]);

  // Função para adicionar log (máximo 20 linhas)
  const appendLog = useCallback((message: string) => {
    const timestamp = formatTimestamp(new Date());
    const logLine = `[${timestamp}] ${message}`;

    setLogs((prev) => {
      const newLogs = [...prev, logLine];
      // Mantém apenas as últimas MAX_LOG_LINES
      if (newLogs.length > MAX_LOG_LINES) {
        return newLogs.slice(-MAX_LOG_LINES);
      }
      return newLogs;
    });
  }, []);

  // Inicializa BLE Manager
  useEffect(() => {
    bleManagerRef.current = new BleManager();

    appendLog("App iniciado - BLE Manager criado");

    // Cleanup no unmount
    return () => {
      cleanup();
      bleManagerRef.current?.destroy();
    };
  }, []);

  // Inicia monitoramento de localização
  useEffect(() => {
    startLocationUpdates();

    return () => {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
      }
    };
  }, []);

  // Solicita permissões de localização e inicia updates
  const startLocationUpdates = async () => {
    try {
      const { status: permStatus } =
        await Location.requestForegroundPermissionsAsync();

      if (permStatus !== "granted") {
        appendLog("❌ Permissão de localização negada");
        Alert.alert(
          "Permissão Necessária",
          "Este app precisa de acesso à localização para funcionar corretamente."
        );
        return;
      }

      appendLog("✅ Permissão de localização concedida");

      // Inicia monitoramento contínuo
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000, // 1 segundo
          distanceInterval: 0, // Atualiza mesmo parado
        },
        (loc) => {
          setLocation({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            accuracyM: loc.coords.accuracy,
            speedMps: loc.coords.speed,
            headingDeg: loc.coords.heading,
          });
        }
      );

      appendLog("📍 Monitoramento de GPS iniciado");
    } catch (error) {
      appendLog(`❌ Erro ao iniciar GPS: ${error}`);
    }
  };

  // Cleanup de conexões e subscriptions
  const cleanup = useCallback(() => {
    // Para scan se estiver rodando
    isScanningRef.current = false;
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    // Para subscription de notificações
    if (notificationSubscriptionRef.current) {
      notificationSubscriptionRef.current.remove();
      notificationSubscriptionRef.current = null;
    }

    // Limpa fila de telemetria
    telemetryQueueRef.current.clear();
  }, []);

  // Função para parar o scan de forma limpa
  const stopScan = useCallback(() => {
    isScanningRef.current = false;
    setScanSeconds(0);

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    bleManagerRef.current?.stopDeviceScan();

    // Só volta para idle se não estiver conectando ou conectado
    setStatus((currentStatus) => {
      if (currentStatus === "scanning") {
        return "idle";
      }
      return currentStatus;
    });
  }, []);

  // Scan e conecta ao ESP32
  const scanAndConnect = async () => {
    const manager = bleManagerRef.current;
    if (!manager) return;

    try {
      // Verifica estado do Bluetooth
      const state = await manager.state();
      if (state !== State.PoweredOn) {
        appendLog("❌ Bluetooth está desligado");
        Alert.alert("Bluetooth", "Por favor, ligue o Bluetooth do dispositivo.");
        return;
      }

      // Limpa timers anteriores
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

      setStatus("scanning");
      isScanningRef.current = true;
      setScanSeconds(0);
      appendLog("🔍 Iniciando scan BLE...");

      // Contador visual de segundos
      scanIntervalRef.current = setInterval(() => {
        setScanSeconds((prev) => {
          if (prev >= SCAN_TIMEOUT_SECONDS - 1) {
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      // Scan por dispositivos
      manager.startDeviceScan(
        null, // Scan todos os serviços
        { allowDuplicates: false },
        async (error, device) => {
          if (error) {
            appendLog(`❌ Erro no scan: ${error.message}`);
            stopScan();
            return;
          }

          if (device && isScanningRef.current) {
            // Verifica se é um ESP32 válido
            if (isValidESP32Device(device.name, device.serviceUUIDs)) {
              appendLog(`✅ Encontrado: ${device.name || device.id}`);

              // Para o scan
              stopScan();

              // Conecta ao dispositivo
              await connectToDevice(device);
            }
          }
        }
      );

      // Timeout do scan
      scanTimeoutRef.current = setTimeout(() => {
        if (isScanningRef.current) {
          appendLog("⏱️ Scan timeout - nenhum ESP32 encontrado");
          stopScan();
        }
      }, SCAN_TIMEOUT_SECONDS * 1000);
    } catch (error) {
      appendLog(`❌ Erro: ${error}`);
      stopScan();
    }
  };

  // Conecta a um dispositivo específico
  const connectToDevice = async (device: Device) => {
    const manager = bleManagerRef.current;
    if (!manager) return;

    try {
      setStatus("connecting");
      isScanningRef.current = false;
      setScanSeconds(0);
      appendLog(`🔗 Conectando a ${device.name || device.id}...`);

      // Conecta ao dispositivo
      const connected = await device.connect({
        requestMTU: 512,
      });

      // Descobre serviços e características
      await connected.discoverAllServicesAndCharacteristics();

      appendLog("✅ Conectado! Descobrindo características...");

      // Verifica se a característica existe
      const services = await connected.services();
      let foundChar = false;

      for (const service of services) {
        if (service.uuid.toLowerCase() === SERVICE_UUID.toLowerCase()) {
          const characteristics = await service.characteristics();
          for (const char of characteristics) {
            if (char.uuid.toLowerCase() === CHAR_UUID.toLowerCase()) {
              foundChar = true;
              break;
            }
          }
        }
      }

      if (!foundChar) {
        appendLog("⚠️ Característica não encontrada, tentando mesmo assim...");
      }

      // Habilita notifications
      notificationSubscriptionRef.current = connected.monitorCharacteristicForService(
        SERVICE_UUID,
        CHAR_UUID,
        (error, characteristic) => {
          if (error) {
            appendLog(`❌ Erro notification: ${error.message}`);
            return;
          }

          if (characteristic?.value) {
            handleBleData(characteristic.value);
          }
        }
      );

      // Lê RSSI inicial
      const rssi = await connected.readRSSI();
      setDeviceRssi(rssi.rssi);

      // Atualiza RSSI periodicamente
      const rssiInterval = setInterval(async () => {
        try {
          const isConnected = await connected.isConnected();
          if (isConnected) {
            const newRssi = await connected.readRSSI();
            setDeviceRssi(newRssi.rssi);
          } else {
            clearInterval(rssiInterval);
          }
        } catch {
          // Ignora erros de RSSI
        }
      }, 5000);

      // Monitora desconexão
      connected.onDisconnected((error, device) => {
        clearInterval(rssiInterval);
        appendLog(`📴 Desconectado${error ? `: ${error.message}` : ""}`);
        setStatus("disconnected");
        setConnectedDevice(null);
        setDeviceRssi(null);
        cleanup();
      });

      setConnectedDevice(connected);
      setStatus("connected");
      appendLog(`🎉 Conectado a ${connected.name || connected.id}! Aguardando dados...`);
    } catch (error) {
      appendLog(`❌ Falha na conexão: ${error}`);
      setStatus("disconnected");
    }
  };

  // Processa dados BLE recebidos
  const handleBleData = async (base64Value: string) => {
    const payload = parseESP32Payload(base64Value);

    if (!payload) {
      appendLog("⚠️ Payload inválido recebido");
      return;
    }

    // Atualiza estado
    setSensorData(payload);

    const motorC = payload.sensors.temperature.motorC.toFixed(2);
    const batteryC = payload.sensors.temperature.batteryC.toFixed(2);
    const refC = payload.sensors.temperature.referenceC.toFixed(2);
    const { x: ax, y: ay, z: az } = payload.sensors.accelerometer;

    // Busca localização mais recente antes de enviar (rastreio em tempo real)
    let currentLocation: LocationData = location;
    try {
      const freshLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      currentLocation = {
        lat: freshLocation.coords.latitude,
        lng: freshLocation.coords.longitude,
        accuracyM: freshLocation.coords.accuracy,
        speedMps: freshLocation.coords.speed,
        headingDeg: freshLocation.coords.heading,
      };
      
      // Atualiza o estado com a localização mais recente
      setLocation(currentLocation);
    } catch (error) {
      // Se falhar, usa a última localização conhecida
      appendLog(`⚠️ GPS: usando última localização`);
    }

    appendLog(`🌡️ M:${motorC} B:${batteryC} R:${refC} | 📐 ${ax},${ay},${az}`);

    // Envia para o servidor com localização atualizada
    const telemetryPayload = createTelemetryPayload(payload, currentLocation, testCaseNameRef.current);
    const result = await telemetryQueueRef.current.send(telemetryPayload);

    if (result) {
      if (result.success) {
        appendLog(`📤 POST OK (${result.statusCode})`);
      } else {
        appendLog(`❌ POST falhou: ${result.error}`);
        if (telemetryQueueRef.current.hasPending()) {
          appendLog("⏳ Tentará retry no próximo ciclo");
        }
      }
    }
    // Se result é null, foi rate-limited (ignorado)
  };

  // Desconecta do dispositivo
  const disconnect = async () => {
    // Para scan se estiver rodando
    stopScan();

    if (connectedDevice) {
      try {
        appendLog("🔌 Desconectando...");
        await connectedDevice.cancelConnection();
      } catch (error) {
        appendLog(`⚠️ Erro ao desconectar: ${error}`);
      }
    }

    cleanup();
    setConnectedDevice(null);
    setDeviceRssi(null);
    setSensorData(null);
    setStatus("idle");
  };

  // Cancela o scan manualmente
  const cancelScan = () => {
    appendLog("🛑 Scan cancelado pelo usuário");
    stopScan();
  };

  // Renderiza status com cor
  const getStatusColor = () => {
    switch (status) {
      case "scanning":
        return "#f39c12";
      case "connecting":
        return "#3498db";
      case "connected":
        return "#27ae60";
      case "disconnected":
        return "#e74c3c";
      default:
        return "#95a5a6";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "scanning":
        return "Scanning...";
      case "connecting":
        return "Connecting...";
      case "connected":
        return "Connected";
      case "disconnected":
        return "Disconnected";
      default:
        return "Idle";
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style="light" />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>DataLogger Gateway</Text>
          <Text style={styles.subtitle}>ESP32 → BLE → iPhone → Server</Text>
        </View>

      {/* Test Case Input */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Caso de Teste:</Text>
        <TextInput
          style={styles.textInput}
          value={testCaseName}
          onChangeText={setTestCaseName}
          placeholder="Ex: teste_motor_frio_01"
          placeholderTextColor="#8892b0"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
      </View>

      {/* Status Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status de Conexão</Text>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.statusText}>{getStatusText()}</Text>
          {status === "scanning" && (
            <Text style={styles.scanTimer}>
              {scanSeconds}s / {SCAN_TIMEOUT_SECONDS}s
            </Text>
          )}
        </View>

        {status === "scanning" && (
          <View style={styles.scanProgressContainer}>
            <View style={styles.scanProgressBar}>
              <View
                style={[
                  styles.scanProgressFill,
                  { width: `${(scanSeconds / SCAN_TIMEOUT_SECONDS) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.scanHint}>Procurando dispositivos ESP32...</Text>
          </View>
        )}

        {connectedDevice && (
          <>
            <Text style={styles.deviceInfo}>
              📱 {connectedDevice.name || connectedDevice.id}
            </Text>
            {deviceRssi !== null && (
              <Text style={styles.rssiText}>📶 RSSI: {deviceRssi} dBm</Text>
            )}
          </>
        )}
      </View>

      {/* Sensor Data Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Temperaturas</Text>

        {sensorData ? (
          <>
            <View style={styles.sensorRow}>
              <Text style={styles.dataText}>🌡️ Motor</Text>
              <Text style={styles.dataValue}>{sensorData.sensors.temperature.motorC.toFixed(2)}°C</Text>
            </View>
            <View style={styles.sensorRow}>
              <Text style={styles.dataText}>🔋 Bateria</Text>
              <Text style={styles.dataValue}>{sensorData.sensors.temperature.batteryC.toFixed(2)}°C</Text>
            </View>
            <View style={styles.sensorRow}>
              <Text style={styles.dataText}>🎯 Referência</Text>
              <Text style={styles.dataValue}>{sensorData.sensors.temperature.referenceC.toFixed(2)}°C</Text>
            </View>
          </>
        ) : (
          <Text style={styles.noDataText}>Aguardando dados...</Text>
        )}
      </View>

      {/* Accelerometer Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Acelerômetro</Text>

        {sensorData ? (
          <>
            <View style={styles.accelContainer}>
              <View style={styles.accelItem}>
                <Text style={styles.accelLabel}>X</Text>
                <Text style={styles.accelValue}>{sensorData.sensors.accelerometer.x}</Text>
              </View>
              <View style={styles.accelItem}>
                <Text style={styles.accelLabel}>Y</Text>
                <Text style={styles.accelValue}>{sensorData.sensors.accelerometer.y}</Text>
              </View>
              <View style={styles.accelItem}>
                <Text style={styles.accelLabel}>Z</Text>
                <Text style={styles.accelValue}>{sensorData.sensors.accelerometer.z}</Text>
              </View>
            </View>
            <Text style={styles.dataTextSmall}>
              Sample ID: {sensorData.sample.id}
            </Text>
          </>
        ) : (
          <Text style={styles.noDataText}>Aguardando dados...</Text>
        )}
      </View>

      {/* Location Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Localização GPS</Text>

        {location.lat !== null ? (
          <>
            <Text style={styles.dataText}>
              📍 {location.lat?.toFixed(6)}, {location.lng?.toFixed(6)}
            </Text>
            <Text style={styles.dataTextSmall}>
              Precisão: {location.accuracyM?.toFixed(1)}m | 
              Velocidade: {location.speedMps?.toFixed(1)} m/s | 
              Direção: {location.headingDeg?.toFixed(0)}°
            </Text>
          </>
        ) : (
          <Text style={styles.noDataText}>Aguardando GPS...</Text>
        )}
      </View>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        {status === "scanning" ? (
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={cancelScan}
          >
            <Text style={styles.buttonText}>🛑 Cancelar Scan</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.button,
              styles.connectButton,
              (status === "connecting" || status === "connected") && styles.buttonDisabled,
            ]}
            onPress={scanAndConnect}
            disabled={status === "connecting" || status === "connected"}
          >
            <Text style={styles.buttonText}>🔍 Scan & Connect</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            styles.disconnectButton,
            status !== "connected" && styles.buttonDisabled,
          ]}
          onPress={disconnect}
          disabled={status !== "connected"}
        >
          <Text style={styles.buttonText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {/* Logs */}
      <View style={styles.logsContainer}>
        <Text style={styles.logsTitle}>Logs (últimas {MAX_LOG_LINES} linhas)</Text>
        <ScrollView
          style={styles.logsScroll}
          contentContainerStyle={styles.logsContent}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
        >
          {logs.map((log, index) => (
            <Text key={index} style={styles.logLine}>
              {log}
            </Text>
          ))}
          {logs.length === 0 && (
            <Text style={styles.logLineEmpty}>Nenhum log ainda...</Text>
          )}
        </ScrollView>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === "ios" ? 50 : 30,
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
  },
  subtitle: {
    fontSize: 12,
    color: "#8892b0",
    marginTop: 4,
  },
  inputContainer: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  inputLabel: {
    fontSize: 12,
    color: "#64ffda",
    fontWeight: "600",
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: "#0a0a14",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#ffffff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#2d3748",
  },
  card: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64ffda",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
  scanTimer: {
    fontSize: 14,
    color: "#f39c12",
    marginLeft: "auto",
    fontWeight: "500",
  },
  scanProgressContainer: {
    marginTop: 12,
  },
  scanProgressBar: {
    height: 6,
    backgroundColor: "#2d3748",
    borderRadius: 3,
    overflow: "hidden",
  },
  scanProgressFill: {
    height: "100%",
    backgroundColor: "#f39c12",
    borderRadius: 3,
  },
  scanHint: {
    fontSize: 12,
    color: "#8892b0",
    marginTop: 6,
    textAlign: "center",
  },
  deviceInfo: {
    fontSize: 14,
    color: "#ccd6f6",
    marginTop: 8,
  },
  rssiText: {
    fontSize: 12,
    color: "#8892b0",
    marginTop: 4,
  },
  dataText: {
    fontSize: 14,
    color: "#ccd6f6",
  },
  dataValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64ffda",
  },
  sensorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  accelContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 8,
  },
  accelItem: {
    alignItems: "center",
    flex: 1,
  },
  accelLabel: {
    fontSize: 12,
    color: "#8892b0",
    marginBottom: 4,
  },
  accelValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#64ffda",
  },
  dataTextSmall: {
    fontSize: 11,
    color: "#8892b0",
    marginTop: 4,
  },
  noDataText: {
    fontSize: 14,
    color: "#8892b0",
    fontStyle: "italic",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  connectButton: {
    backgroundColor: "#27ae60",
  },
  cancelButton: {
    backgroundColor: "#f39c12",
  },
  disconnectButton: {
    backgroundColor: "#e74c3c",
  },
  buttonDisabled: {
    backgroundColor: "#4a4a4a",
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  logsContainer: {
    height: 180,
    backgroundColor: "#0a0a14",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  logsTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64ffda",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  logsScroll: {
    flex: 1,
  },
  logsContent: {
    paddingBottom: 8,
  },
  logLine: {
    fontSize: 10,
    color: "#8892b0",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 2,
  },
  logLineEmpty: {
    fontSize: 10,
    color: "#4a4a4a",
    fontStyle: "italic",
  },
});
