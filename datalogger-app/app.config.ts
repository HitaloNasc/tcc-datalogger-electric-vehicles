import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "DataLogger Gateway",
  slug: "datalogger-app",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  scheme: "datalogger",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.datalogger.gateway",
    infoPlist: {
      // Permissões BLE - OBRIGATÓRIAS para iOS
      NSBluetoothAlwaysUsageDescription:
        "Este app precisa de Bluetooth para conectar ao sensor ESP32 e receber dados de telemetria.",
      NSBluetoothPeripheralUsageDescription:
        "Este app precisa de Bluetooth para conectar ao sensor ESP32.",
      // Modos de background para BLE
      UIBackgroundModes: ["bluetooth-central"],
      // Permissões de localização
      NSLocationWhenInUseUsageDescription:
        "Este app precisa de sua localização para enviar dados de telemetria junto com os dados do sensor.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Este app precisa de sua localização em background para enviar dados de telemetria continuamente.",
      // Permitir HTTP (App Transport Security)
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSExceptionDomains: {
          "srv603687.hstgr.cloud": {
            NSExceptionAllowsInsecureHTTPLoads: true,
            NSIncludesSubdomains: true,
          },
          localhost: {
            NSExceptionAllowsInsecureHTTPLoads: true,
          },
        },
      },
    },
  },
  android: {
    package: "com.datalogger.gateway",
    permissions: [
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
    ],
  },
  plugins: [
    // Plugin do expo-dev-client é automático
    [
      "react-native-ble-plx",
      {
        isBackgroundEnabled: true,
        modes: ["peripheral", "central"],
        bluetoothAlwaysPermission:
          "Este app precisa de Bluetooth para conectar ao sensor ESP32.",
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Este app precisa de sua localização para enviar dados de telemetria.",
        locationAlwaysPermission:
          "Este app precisa de sua localização em background.",
        locationWhenInUsePermission:
          "Este app precisa de sua localização para enviar dados de telemetria.",
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "your-project-id-here",
    },
  },
});
