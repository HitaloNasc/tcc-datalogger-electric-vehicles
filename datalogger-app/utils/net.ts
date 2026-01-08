/**
 * Network Utilities - POST com timeout e retry
 */

import type { ESP32Payload } from "./ble";

// URL do servidor de telemetria
export const TELEMETRY_URL =
  "http://datalogger.srv603687.hstgr.cloud/api/telemetry";

// Timeout para requisições (ms)
const REQUEST_TIMEOUT = 10000;

// Interface do payload de telemetria a enviar
export interface TelemetryPayload {
  deviceId: string;
  testCase: string;
  receivedAtMs: number;
  location: {
    lat: number | null;
    lng: number | null;
    accuracyM: number | null;
    speedMps: number | null;
    headingDeg: number | null;
  };
  temps: {
    motorC: number;
    batteryC: number;
    referenceC: number;
  };
  accelerometer: {
    x: number;
    y: number;
    z: number;
  };
  raw: ESP32Payload;
}

// Interface de localização
export interface LocationData {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
}

// Resultado do POST
export interface PostResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Realiza POST com timeout
 */
export async function postTelemetry(
  payload: TelemetryPayload
): Promise<PostResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(TELEMETRY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return {
        success: true,
        statusCode: response.status,
      };
    } else {
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: "Timeout - servidor não respondeu em 10s",
        };
      }
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: "Erro desconhecido",
    };
  }
}

/**
 * Cria o payload de telemetria combinando dados BLE e GPS
 */
export function createTelemetryPayload(
  bleData: ESP32Payload,
  location: LocationData,
  testCase: string = ""
): TelemetryPayload {
  return {
    deviceId: bleData.device.id,
    testCase: testCase,
    receivedAtMs: Date.now(),
    location: {
      lat: location.lat,
      lng: location.lng,
      accuracyM: location.accuracyM,
      speedMps: location.speedMps,
      headingDeg: location.headingDeg,
    },
    temps: {
      motorC: bleData.sensors.temperature.motorC,
      batteryC: bleData.sensors.temperature.batteryC,
      referenceC: bleData.sensors.temperature.referenceC,
    },
    accelerometer: {
      x: bleData.sensors.accelerometer.x,
      y: bleData.sensors.accelerometer.y,
      z: bleData.sensors.accelerometer.z,
    },
    raw: bleData,
  };
}

/**
 * Classe para gerenciar retry de envios falhos
 */
export class TelemetryQueue {
  private pendingPayload: TelemetryPayload | null = null;
  private lastSendTime: number = 0;
  private minIntervalMs: number = 1000; // Rate limit: 1 envio por segundo

  /**
   * Tenta enviar um payload, respeitando rate limit
   * @returns Resultado do POST ou null se rate-limited
   */
  async send(payload: TelemetryPayload): Promise<PostResult | null> {
    const now = Date.now();

    // Rate limit: ignora se muito rápido
    if (now - this.lastSendTime < this.minIntervalMs) {
      return null; // Rate-limited, ignorado
    }

    this.lastSendTime = now;

    // Se há payload pendente (retry), tenta ele primeiro
    const payloadToSend = this.pendingPayload ?? payload;

    const result = await postTelemetry(payloadToSend);

    if (result.success) {
      // Sucesso: limpa pendente
      this.pendingPayload = null;
    } else {
      // Falha: guarda para retry no próximo ciclo
      this.pendingPayload = payload;
    }

    return result;
  }

  /**
   * Retorna se há payload pendente para retry
   */
  hasPending(): boolean {
    return this.pendingPayload !== null;
  }

  /**
   * Limpa a fila
   */
  clear(): void {
    this.pendingPayload = null;
  }
}
