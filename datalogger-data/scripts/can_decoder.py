#!/usr/bin/env python3
"""
Script para decodificar dados CAN do arquivo CSV.
Baseado no canDecoder.js - decodifica frames de bateria (0x120) e motor controller (0x300).
"""

import csv
from pathlib import Path

# IDs base (em decimal)
BASE_BATTERY_ID = 0x120      # 288
BASE_CONTROLLER_ID = 0x300   # 768


def decode_battery_data(data: list[int]) -> dict:
    """
    Decodifica dados da bateria a partir de um frame CAN.
    
    Args:
        data: Array de 8 bytes do frame CAN
    
    Returns:
        Dados decodificados da bateria
    """
    return {
        "current": (data[2] * 256 + data[3]) * 0.1,
        "voltage": (data[0] * 256 + data[1]) * 0.1,
        "soc": data[6],
        "soh": data[7],
        "temperature": data[4]
    }


def decode_motor_controller_data(data: list[int]) -> dict:
    """
    Decodifica dados do controlador de motor a partir de um frame CAN.
    
    Args:
        data: Array de 8 bytes do frame CAN
    
    Returns:
        Dados decodificados do motor
    """
    return {
        "motorSpeedRpm": data[0] * 256 + data[1],
        "motorTorque": (data[2] * 256 + data[3]) * 0.1,
        "motorTemperature": data[7] - 40,
        "controllerTemperature": data[6] - 40
    }


def parse_can_id(can_id_str: str) -> int:
    """Converte string hexadecimal para inteiro."""
    return int(can_id_str, 16)


def parse_data_bytes(data_str: str) -> list[int]:
    """Converte string de bytes separados por espaço para lista de inteiros."""
    return [int(b) for b in data_str.split()]


def decode_can_frame(can_id: int, data: list[int]) -> tuple[str, dict] | None:
    """
    Decodifica um frame CAN.
    
    Args:
        can_id: ID do frame CAN
        data: Array de bytes do frame
    
    Returns:
        Tupla (tipo, dados) ou None se ID desconhecido
    """
    if can_id == BASE_BATTERY_ID:
        return ("battery", decode_battery_data(data))
    
    if can_id == BASE_CONTROLLER_ID:
        return ("motorController", decode_motor_controller_data(data))
    
    return None


def main():
    # Caminhos dos arquivos
    project_dir = Path(__file__).parent.parent
    input_file = project_dir / "data" / "raw" / "can-data-1767815662827.csv"
    output_file = project_dir / "data" / "processed" / "can-data-decoded.csv"
    
    print(f"Lendo: {input_file.name}")
    
    # Contadores
    battery_count = 0
    motor_count = 0
    unknown_count = 0
    total_rows = 0
    
    # Ler dados e decodificar - uma linha de entrada = uma linha de saída
    decoded_rows = []
    
    # Manter último valor conhecido de cada tipo para preencher campos vazios
    last_battery = {
        "voltage": "",
        "current": "",
        "soc": "",
        "soh": "",
        "batteryTemperature": ""
    }
    last_motor = {
        "motorSpeedRpm": "",
        "motorTorque": "",
        "motorTemperature": "",
        "controllerTemperature": ""
    }
    
    with open(input_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            total_rows += 1
            timestamp = row["timestamp"]
            can_id_str = row["canId"]
            data_str = row["data"]
            
            can_id = parse_can_id(can_id_str)
            data = parse_data_bytes(data_str)
            
            result = decode_can_frame(can_id, data)
            
            if result is None:
                unknown_count += 1
                continue
            
            frame_type, decoded = result
            
            # Atualizar último valor conhecido
            if frame_type == "battery":
                battery_count += 1
                last_battery = {
                    "voltage": decoded["voltage"],
                    "current": decoded["current"],
                    "soc": decoded["soc"],
                    "soh": decoded["soh"],
                    "batteryTemperature": decoded["temperature"]
                }
            else:  # motorController
                motor_count += 1
                last_motor = {
                    "motorSpeedRpm": decoded["motorSpeedRpm"],
                    "motorTorque": decoded["motorTorque"],
                    "motorTemperature": decoded["motorTemperature"],
                    "controllerTemperature": decoded["controllerTemperature"]
                }
            
            # Criar linha com todos os dados (último conhecido de cada tipo)
            decoded_row = {
                "timestamp": timestamp,
                **last_battery,
                **last_motor
            }
            
            decoded_rows.append(decoded_row)
    
    # Escrever CSV de saída
    if decoded_rows:
        headers = list(decoded_rows[0].keys())
        
        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            writer.writerows(decoded_rows)
    
    print(f"\nResultado:")
    print(f"  Linhas de entrada:         {total_rows}")
    print(f"  Frames de bateria (0x120): {battery_count}")
    print(f"  Frames de motor (0x300):   {motor_count}")
    print(f"  Frames ignorados:          {unknown_count}")
    print(f"  Linhas de saída:           {len(decoded_rows)}")
    print(f"\nArquivo criado: {output_file.name}")


if __name__ == "__main__":
    main()
