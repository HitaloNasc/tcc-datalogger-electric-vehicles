/**
 * BLE Utilities - Base64 decode e JSON parse
 */

// UUIDs do serviço e característica do ESP32
export const SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
export const CHAR_UUID = "abcd1234-1234-1234-1234-abcdef123456";

// Tipo do payload COMPACTO recebido do ESP32 via BLE
type BleCompactPayload = {
  id: string;
  m: number;  // motor temp
  b: number;  // battery temp
  r: number;  // temperatura de referência
  ax: number; // acelerômetro X
  ay: number; // acelerômetro Y
  az: number; // acelerômetro Z
  s: number;  // sampleId
};

// Tipo do payload expandido usado internamente pelo app
export interface ESP32Payload {
  device: {
    id: string;
  };
  sensors: {
    temperature: {
      motorC: number;
      batteryC: number;
      referenceC: number;
    };
    accelerometer: {
      x: number;
      y: number;
      z: number;
    };
  };
  sample: {
    id: number;
    timestamp: {
      type: string;
      valueMs: number;
    };
  };
}

/**
 * Decodifica uma string Base64 para UTF-8
 * react-native-ble-plx retorna valores em Base64
 */
export function decodeBase64(base64: string): string {
  try {
    // Tabela de caracteres Base64
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";

    // Remove caracteres de padding e whitespace
    const cleaned = base64.replace(/[=\s]/g, "");

    let buffer = 0;
    let bits = 0;

    for (let i = 0; i < cleaned.length; i++) {
      const charIndex = chars.indexOf(cleaned[i]);
      if (charIndex === -1) continue;

      buffer = (buffer << 6) | charIndex;
      bits += 6;

      if (bits >= 8) {
        bits -= 8;
        result += String.fromCharCode((buffer >> bits) & 0xff);
      }
    }

    return result;
  } catch (error) {
    throw new Error(`Falha ao decodificar Base64: ${error}`);
  }
}

/**
 * Decodifica e parseia o payload BLE COMPACTO do ESP32
 * Formato de entrada: {"id":"esp32-001","m":25.5,"b":26.3,"s":123}
 * @param base64Value - Valor em Base64 recebido via BLE
 * @returns Payload expandido ou null em caso de erro
 */
export function parseESP32Payload(base64Value: string): ESP32Payload | null {
  try {
    const jsonString = decodeBase64(base64Value);
    console.log("[BLE] JSON recebido:", jsonString);

    const compact = JSON.parse(jsonString) as BleCompactPayload;

    // Validação do payload compacto
    if (
      typeof compact.m !== "number" ||
      typeof compact.b !== "number"
    ) {
      throw new Error("Payload BLE compacto inválido");
    }

    // Expande para o formato rico esperado pelo app
    return {
      device: { id: compact.id || "esp32-unknown" },
      sensors: {
        temperature: {
          motorC: compact.m,
          batteryC: compact.b,
          referenceC: compact.r ?? 0,
        },
        accelerometer: {
          x: compact.ax ?? 0,
          y: compact.ay ?? 0,
          z: compact.az ?? 0,
        },
      },
      sample: {
        id: compact.s || 0,
        timestamp: {
          type: "uptime",
          valueMs: Date.now(),
        },
      },
    };
  } catch (error) {
    console.error("[BLE] Erro parse BLE:", error);
    console.error("[BLE] Valor recebido:", base64Value);
    return null;
  }
}

/**
 * Verifica se um dispositivo BLE é um ESP32 válido
 * @param deviceName - Nome do dispositivo
 * @param serviceUUIDs - Lista de UUIDs de serviço anunciados
 */
export function isValidESP32Device(
  deviceName: string | null,
  serviceUUIDs: string[] | null
): boolean {
  // Verifica se anuncia o SERVICE_UUID
  if (serviceUUIDs?.some((uuid) => uuid.toLowerCase() === SERVICE_UUID.toLowerCase())) {
    return true;
  }

  // Verifica se o nome contém "esp32" (case-insensitive)
  if (deviceName?.toLowerCase().includes("esp32")) {
    return true;
  }

  return false;
}

/**
 * Formata timestamp para exibição
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
