# DataLogger Gateway App

App React Native (Expo) que funciona como gateway entre ESP32 (via BLE) e servidor de telemetria.

**Fluxo:** `ESP32 → BLE → iPhone → Servidor HTTP`

---

## 📋 Pré-requisitos

- **macOS** com Xcode instalado (versão 15+)
- **Node.js** 18+ e npm/yarn
- **iPhone físico** (simulador não suporta BLE real)
- **Conta Apple Developer** (para rodar em dispositivo físico)
- **ESP32** configurado com os UUIDs corretos

---

## 🚀 Instalação

### 1. Instalar dependências

```bash
cd datalogger-app
npm install
```

### 2. Gerar projeto nativo (prebuild)

Como usamos `expo-dev-client` + `react-native-ble-plx`, precisamos gerar os projetos nativos:

```bash
npx expo prebuild
```

Ou para limpar e regerar:

```bash
npx expo prebuild --clean
```

### 3. Configurar signing no Xcode (OBRIGATÓRIO para iPhone)

1. Abra o projeto iOS no Xcode:
   ```bash
   open ios/datalogger-app.xcworkspace
   ```

2. Selecione o target **datalogger-app**

3. Vá em **Signing & Capabilities**

4. Selecione seu **Team** (conta Apple Developer)

5. O Bundle Identifier deve ser: `com.datalogger.gateway`

6. Certifique-se que "Automatically manage signing" está ativado

### 4. Rodar no iPhone

**Opção A - Via Expo CLI (recomendado):**

```bash
# Conecte o iPhone via USB
npx expo run:ios --device
```

**Opção B - Via Xcode:**

1. Selecione seu iPhone no Xcode
2. Clique em Run (▶️)

**Opção C - Via EAS Build (para distribuição):**

```bash
# Instale EAS CLI
npm install -g eas-cli

# Configure (primeira vez)
eas build:configure

# Build de desenvolvimento
eas build --profile development --platform ios

# Após build, instale o .ipa no iPhone via TestFlight ou ad-hoc
```

### 5. Iniciar Metro Bundler

Após o app estar instalado, inicie o bundler:

```bash
npx expo start --dev-client
```

Escaneie o QR code com o app instalado no iPhone.

---

## 📱 Uso do App

1. **Ligue o Bluetooth** do iPhone
2. **Ligue o ESP32** com o firmware correto
3. Toque em **"Scan & Connect"**
4. O app irá:
   - Escanear dispositivos BLE
   - Conectar ao ESP32 (nome contém "esp32" ou anuncia SERVICE_UUID)
   - Habilitar notificações na característica
   - Receber dados a cada 1s
   - Enviar para o servidor

5. Visualize:
   - Status de conexão e RSSI
   - Temperaturas (motor e bateria)
   - Localização GPS
   - Logs das operações

6. Toque em **"Disconnect"** para desconectar

---

## 🔧 Configuração do ESP32

O ESP32 deve anunciar:

```
SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab"
CHAR_UUID    = "abcd1234-1234-1234-1234-abcdef123456"
```

E enviar notificações com JSON UTF-8:

```json
{
  "device": {
    "id": "esp32-001"
  },
  "sensors": {
    "temperature": {
      "motorC": 22.94,
      "batteryC": 23.81
    }
  },
  "sample": {
    "id": 123,
    "timestamp": {
      "type": "uptime",
      "valueMs": 123456
    }
  }
}
```

---

## 🌐 Servidor de Telemetria

O app envia dados para:

```
POST http://datalogger.srv603687.hstgr.cloud/api/telemetry
Content-Type: application/json
```

### Payload enviado:

```json
{
  "deviceId": "esp32-001",
  "receivedAtMs": 1704067200000,
  "location": {
    "lat": -23.550520,
    "lng": -46.633308,
    "accuracyM": 10.5,
    "speedMps": 0.5,
    "headingDeg": 180
  },
  "temps": {
    "motorC": 22.94,
    "batteryC": 23.81
  },
  "raw": { ... objeto BLE original ... }
}
```

---

## 🧪 Testando com Servidor Local

### 1. Criar servidor Express simples

Crie um arquivo `test-server.js`:

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/telemetry', (req, res) => {
  console.log('📥 Telemetria recebida:');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('---');
  res.status(200).json({ success: true, timestamp: Date.now() });
});

app.listen(3000, '0.0.0.0', () => {
  console.log('🚀 Servidor de teste rodando em http://localhost:3000');
  console.log('📡 Endpoint: POST /api/telemetry');
});
```

### 2. Rodar servidor

```bash
npm install express
node test-server.js
```

### 3. Alterar URL no app (para teste local)

Em `utils/net.ts`, altere temporariamente:

```typescript
// Substitua pelo IP do seu Mac na rede local
export const TELEMETRY_URL = "http://192.168.1.100:3000/api/telemetry";
```

> **Nota:** Use o IP local do Mac, não `localhost` (o iPhone não resolve localhost).

Para descobrir o IP do Mac:

```bash
ipconfig getifaddr en0
```

---

## 📁 Estrutura do Projeto

```
datalogger-app/
├── App.tsx              # Tela principal + lógica BLE/GPS/POST
├── app.config.ts        # Configuração Expo + permissões iOS
├── package.json         # Dependências
├── tsconfig.json        # Config TypeScript
├── utils/
│   ├── ble.ts           # Helpers BLE (decode, parse, UUIDs)
│   └── net.ts           # Funções de rede (POST, retry)
├── assets/              # Ícones e splash
├── ios/                 # Projeto nativo iOS (gerado)
└── android/             # Projeto nativo Android (gerado)
```

---

## ⚠️ Permissões iOS Configuradas

Em `app.config.ts`:

| Chave | Descrição |
|-------|-----------|
| `NSBluetoothAlwaysUsageDescription` | Bluetooth para conectar ao ESP32 |
| `NSBluetoothPeripheralUsageDescription` | Bluetooth peripheral |
| `UIBackgroundModes: ["bluetooth-central"]` | BLE em background |
| `NSLocationWhenInUseUsageDescription` | GPS em uso |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | GPS em background |

---

## 🐛 Troubleshooting

### "Bluetooth está desligado"
- Ligue o Bluetooth em Ajustes > Bluetooth

### "Permissão de localização negada"
- Vá em Ajustes > Privacidade > Serviços de Localização
- Encontre o app e permita "Ao Usar o App"

### "Scan timeout - nenhum ESP32 encontrado"
- Verifique se o ESP32 está ligado e anunciando
- Verifique os UUIDs no firmware do ESP32
- Aproxime o iPhone do ESP32

### "Erro notification: ..."
- Verifique se o CHAR_UUID está correto
- Verifique se a característica suporta notify

### POST falha constantemente
- Verifique conectividade de internet
- Verifique se o servidor está online
- Para teste local, use o IP correto da máquina

### Build falha no Xcode
- `npx expo prebuild --clean`
- `cd ios && pod install && cd ..`
- Verifique signing no Xcode

---

## 📦 Dependências

| Pacote | Versão | Uso |
|--------|--------|-----|
| `expo` | ~52.0.0 | Framework base |
| `expo-dev-client` | ~5.0.0 | Dev client para libs nativas |
| `expo-location` | ~18.0.0 | API de geolocalização |
| `react-native-ble-plx` | ^3.2.1 | API BLE |
| `typescript` | ~5.3.3 | Tipagem estática |

---

## 📄 Licença

MIT License - Use como quiser para seu TCC!
