#!/usr/bin/env python3
"""
Script para converter arquivos JSON de testes do datalogger para CSV.
Lê arquivos test_*_10_min_07_01.json e cria CSVs correspondentes.
"""

import json
import csv
import glob
from pathlib import Path


def flatten_record(record: dict) -> dict:
    """Extrai os campos relevantes de um registro JSON para um dicionário plano."""
    data = record.get("data", {})
    location = data.get("location", {})
    temps = data.get("temps", {})
    accelerometer = data.get("accelerometer", {})
    raw_sample = data.get("raw", {}).get("sample", {})
    
    return {
        "id": record.get("_id", {}).get("$oid", ""),
        "deviceId": data.get("deviceId", ""),
        "testCase": data.get("testCase", ""),
        "receivedAtMs": data.get("receivedAtMs", ""),
        "lat": location.get("lat", ""),
        "lng": location.get("lng", ""),
        "accuracyM": location.get("accuracyM", ""),
        "speedMps": location.get("speedMps", ""),
        "headingDeg": location.get("headingDeg", ""),
        "motorC": temps.get("motorC", ""),
        "batteryC": temps.get("batteryC", ""),
        "referenceC": temps.get("referenceC", ""),
        "accel_x": accelerometer.get("x", ""),
        "accel_y": accelerometer.get("y", ""),
        "accel_z": accelerometer.get("z", ""),
        "sampleId": raw_sample.get("id", ""),
        "receivedAt": record.get("receivedAt", {}).get("$date", ""),
    }


def convert_json_to_csv(json_path: Path, output_dir: Path) -> None:
    """Converte um arquivo JSON para CSV."""
    csv_path = output_dir / json_path.with_suffix(".csv").name
    
    print(f"Lendo: {json_path.name}")
    
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    if not data:
        print(f"  Arquivo vazio, pulando...")
        return
    
    # Flatten todos os registros
    rows = [flatten_record(record) for record in data]
    
    # Obter os headers do primeiro registro
    headers = list(rows[0].keys())
    
    # Escrever CSV
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"  Criado: {csv_path.name} ({len(rows)} registros)")


def main():
    # Diretório do projeto
    project_dir = Path(__file__).parent.parent
    raw_dir = project_dir / "data" / "raw"
    processed_dir = project_dir / "data" / "processed"
    
    # Encontrar todos os arquivos que correspondem ao padrão
    pattern = str(raw_dir / "teste_eco_10_01_4.json")
    json_files = glob.glob(pattern)
    
    if not json_files:
        print("Nenhum arquivo encontrado com o padrão 'teste_eco_10_01_4.json'")
        return
    
    print(f"Encontrados {len(json_files)} arquivo(s) JSON\n")
    
    for json_file in sorted(json_files):
        convert_json_to_csv(Path(json_file), processed_dir)
    
    print("\nConversão concluída!")


if __name__ == "__main__":
    main()
