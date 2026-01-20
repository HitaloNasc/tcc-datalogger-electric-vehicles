# Estrutura Ideal do Artigo

## Title

Deve deixar explícitos:

- o objeto (battery / thermal behavior)
- o método (external sensors, time series models)
- o contexto (electric vehicles / motorcycles)

📌 Exemplo:

Thermal Anomaly Detection in Electric Vehicle Batteries Using External Sensors and Time Series Forecasting

## Abstract

- Contexto do problema
- Objetivo do trabalho
- Metodologia (sensores + modelo)
- Resultados principais (1–2 números)
- Contribuição prática

(150–200 palavras)

### Keywords

Exemplo:

- Battery monitoring
- Thermal anomaly detection
- Time series forecasting
- Electric vehicles
- IoT sensors

## 1. Introduction

Função: contextualizar e justificar o estudo.

Estrutura interna recomendada:
1. Contexto: baterias e risco térmico em veículos elétricos
2. Limitação de acesso a BMS / CAN
3. Lacuna: poucos trabalhos usando sensores externos não intrusivos
4. Objetivo do artigo
5. Contribuições principais (bullet points)

## 2. Related Work

Função: mostrar que você conhece o estado da arte.

Organização sugerida:

1. Battery Thermal Monitoring
2. Anomaly Detection in EV Batteries
3. Time Series Forecasting for Thermal Systems
4. Research Gap Summary

📌 Termine com uma tabela comparativa (opcional, mas forte).

## 3. System Architecture and Methodology

Função: explicar como você fez.

Subseções ideais:

1. System Architecture Overview
2. Hardware and Sensors
3. Data Acquisition and Transmission
4. Data Preprocessing
5. Forecasting and Anomaly Detection Method

✔️ Aqui entra:

- ESP32
- Sensores de temperatura
- IMU
- GPS
- Backend + MongoDB

Modelos LSTM / GRU / TCN

## 4. Results

Função: mostrar o que foi observado, sem interpretar profundamente.

Subestrutura recomendada:

1. Dataset Description
2. Battery Thermal Behavior
3. Influence of Operating Conditions
4. Observed Thermal Anomalies
5. Temperature Forecasting Performance
6. Early Overheating Detection

👉 Essa seção é o coração do artigo.

## 5. Discussion

Função: interpretar os resultados.

Aqui você:

- Compara com a literatura
- Justifica o uso de sensores externos
- Analisa vantagens e limitações
- Discute aplicabilidade real

📌 Evite repetir números; foque em significado.

## 6. Threats to Validity (opcional, mas recomendado)

Especialmente forte para banca e periódicos.

Exemplos:

- Posição do sensor externo
- Condições ambientais específicas
- Volume limitado de dados
- Generalização para outros veículos

## 7. Conclusion and Future Work

Função: fechar o artigo.

Inclua:
- Síntese dos resultados
- Contribuição científica
- Contribuição prática
- Próximos passos (ex: mais veículos, sensores adicionais, edge AI)

References
- Formato ABNT (para TCC)
- Fácil adaptação para IEEE / Elsevier

Visão Geral (Resumo Visual)

```
Title
Abstract
Keywords
1. Introduction
2. Related Work
3. Methodology
4. Results
5. Discussion
6. Threats to Validity
7. Conclusion
References
````

Observação importante para o seu caso

👉 Bateria é o eixo central do artigo
Motor aparece apenas como:
- contexto
- variável auxiliar
- comparação secundária (se existir)

Isso aumenta:
- clareza
- chance de publicação
- força do TCC