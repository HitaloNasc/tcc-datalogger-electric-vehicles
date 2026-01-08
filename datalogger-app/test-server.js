/**
 * Servidor Express simples para testar o app DataLogger Gateway
 * 
 * Uso:
 *   npm install express
 *   node test-server.js
 * 
 * O servidor irá:
 * - Escutar na porta 3000
 * - Aceitar POST em /api/telemetry
 * - Logar todos os dados recebidos
 */

const express = require('express');
const app = express();

const PORT = 3000;

// Middleware para parsear JSON
app.use(express.json({ limit: '1mb' }));

// Middleware para logar todas as requisições
app.use((req, res, next) => {
  console.log(`\n📨 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Endpoint de telemetria
app.post('/api/telemetry', (req, res) => {
  const data = req.body;
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📥 TELEMETRIA RECEBIDA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (data.deviceId) {
    console.log(`🔧 Device ID: ${data.deviceId}`);
  }
  
  if (data.receivedAtMs) {
    console.log(`⏰ Recebido em: ${new Date(data.receivedAtMs).toISOString()}`);
  }
  
  if (data.location) {
    const loc = data.location;
    console.log(`📍 Localização:`);
    console.log(`   Lat/Lng: ${loc.lat?.toFixed(6)}, ${loc.lng?.toFixed(6)}`);
    console.log(`   Precisão: ${loc.accuracyM?.toFixed(1)}m`);
    console.log(`   Velocidade: ${loc.speedMps?.toFixed(2)} m/s`);
    console.log(`   Direção: ${loc.headingDeg?.toFixed(0)}°`);
  }
  
  if (data.temps) {
    console.log(`🌡️ Temperaturas:`);
    console.log(`   Motor: ${data.temps.motorC?.toFixed(2)}°C`);
    console.log(`   Bateria: ${data.temps.batteryC?.toFixed(2)}°C`);
  }
  
  if (data.raw) {
    console.log(`📦 Raw data:`);
    console.log(JSON.stringify(data.raw, null, 2));
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Resposta de sucesso
  res.status(200).json({
    success: true,
    message: 'Telemetria recebida com sucesso',
    timestamp: Date.now(),
    deviceId: data.deviceId || 'unknown'
  });
});

// Handler para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Handler de erros
app.use((err, req, res, next) => {
  console.error('❌ Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Inicia o servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        🚀 SERVIDOR DE TESTE - DATALOGGER            ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Porta: ${PORT}                                          ║`);
  console.log('║  Endpoint: POST /api/telemetry                      ║');
  console.log('║  Health: GET /health                                ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Para usar no app, altere TELEMETRY_URL em:         ║');
  console.log('║  utils/net.ts para o IP desta máquina               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  
  // Mostra IPs disponíveis
  const os = require('os');
  const interfaces = os.networkInterfaces();
  console.log('\n📡 IPs disponíveis nesta máquina:');
  
  Object.keys(interfaces).forEach(name => {
    interfaces[name].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`   ${name}: http://${iface.address}:${PORT}/api/telemetry`);
      }
    });
  });
  
  console.log('\n⏳ Aguardando dados de telemetria...\n');
});
