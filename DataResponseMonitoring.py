import time
import threading
from datetime import datetime
import os

# ============================
#  RTU Data Response Simulator
# ============================

devices = {
    "INVERTER": "data/hybrid_sim_2000.txt",
    "BMS": "data/bms_sim_2000.txt",
    "SENSOR": "data/sensor_sim_2000.txt"
}

logIntervalTime = 3.0        # 각 사이클 간격 (s)
responseDelayMin = 0.2       # RX 최소 지연 (s)
responseDelayMax = 0.5       # RX 최대 지연 (s)

# ============================
#  로그 출력 함수
# ============================

def log(device, direction, payload):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    label = "Request" if direction == "RX" else "Response"
    print(f"{direction} [{now}][DEBUG][TCP_Client.py:171] >> {device}({label}): {payload}")


# ============================
#  파일 읽기 함수
# ============================

def load_file_lines(path):
    if not os.path.exists(path):
        print(f"⚠️ 파일을 찾을 수 없습니다: {path}")
        return []
    with open(path, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]
    return lines


# ============================
#  장치별 시뮬레이션
# ============================

def simulate_device(device, filepath):
    lines = load_file_lines(filepath)
    if not lines:
        return

    i = 0
    while True:
        # 파일이 끝나면 처음부터 반복
        rx_line = lines[i % len(lines)]
        tx_line = lines[(i + 1) % len(lines)]

        # Rx = Request
        log(device, "RX", rx_line)

        # Rx 이후 Response (0.2~0.7초 후)
        time.sleep(responseDelayMin + (responseDelayMax - responseDelayMin) * 0.5)
        log(device, "TX", tx_line)

        i += 2  # 다음 쌍으로 이동
        time.sleep(logIntervalTime)


# ============================
#  메인 실행 (병렬 스레드)
# ============================

threads = []
for dev, path in devices.items():
    t = threading.Thread(target=simulate_device, args=(dev, path))
    threads.append(t)
    t.start()

for t in threads:
    t.join()
