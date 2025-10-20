// ===============================
// Data Monitoring Dashboard Logic
// ===============================

let currentDevice = "inverter";
let logRunning = false;
let logInterval = null;
let logIndex = 0;

let logIntervalTime = 500;        // 각 사이클 간격 (ms)
let responseDelayMin = 100;        // RX 최소 지연 (ms)
let responseDelayMax = 200;        // RX 최대 지연 (ms)
let maxLoopCount = 100;     // 한 바퀴 100세트

let lastRequestTime = { inverter: null, bms: null, sensor: null };
let lastResponseTime = { inverter: null, bms: null, sensor: null };
let lastReceivedTime = { inverter: null, bms: null, sensor: null };
let lastInterval = { inverter: "-", bms: "-", sensor: "-" };

const basePath = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}/data`;

let summaryCount = {
  inverter: { rx: 0, tx: 0 },
  bms: { rx: 0, tx: 0 },
  sensor: { rx: 0, tx: 0 }
};

let loopCount = { inverter: 0, bms: 0, sensor: 0 };
let logStorage = { inverter: [], bms: [], sensor: [] };
let logData = { inverter: [], bms: [], sensor: [] };

const logBox = document.querySelector(".log-window");

// =============== 시계 ===============
function updateClock() {
  const now = new Date();
  const formatted = now.toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  document.querySelector(".datetime").textContent = formatted;
}
setInterval(updateClock, 1000);
updateClock();

// =============== 초기 로그 (서버 연결) ===============
const logFilter = document.querySelector(".log-box");
function logFilterAppend(message) {
  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").slice(0, -1);
  logFilter.innerHTML += `[${timestamp}] ${message}<br>`;
  logFilter.scrollTop = logFilter.scrollHeight;
}
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => logFilterAppend("[INFO] Server Connection: SUCCESS"), 300);
  setTimeout(() => logFilterAppend("[INFO] Connected to Server: 192.168.0.105:5052"), 800);
});


function appendLog(device, rawLine, direction) {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().replace("T", " ").slice(0, -1);

  const isRequest = direction === "RX"; // Rx = Request
  const label = isRequest ? "Request" : "Response";
  const colorClass = isRequest ? "rx" : "tx";

  const formatted = `[${localTime}][DEBUG][TCP_Client.py:171] >> ${device.toUpperCase()}(${label}): ${rawLine}`;
  const html = `<span class="${colorClass}">${formatted}</span>`;
  logStorage[device].push(html);

  // ✅ 카운트 누적
  if (isRequest) summaryCount[device].rx++;
  else summaryCount[device].tx++;

  // ✅ 시간 기록 로직
  if (isRequest) {
    lastRequestTime[device] = now; // Request 발생 시각
  } else {
    lastResponseTime[device] = now; // Response 시각
    if (lastRequestTime[device]) {
      const diff = (lastResponseTime[device] - lastRequestTime[device]) / 1000;
      lastInterval[device] = `${diff.toFixed(2)}초`; // Response - Request
    }
    lastReceivedTime[device] = now; // ReceiveTime = Response 시각
    updateDeviceCard(device);
  }

  updateSummaryTable();

  if (device === currentDevice) {
    logBox.innerHTML += html + "<br>\n";
    logBox.scrollTop = logBox.scrollHeight;
  }
}


// =============== 장치별 시뮬레이션 루프 ===============
async function startDeviceLoop(device) {
  const lines = logData[device];
  if (!lines.length) return;

  loopCount[device] = 0;

  // ✅ Inverter, Sensor만 Tx 누락 발생 (100회당 0~1개)
  let dropCount = 0;
  if (device === "inverter" || device === "sensor") {
    dropCount = Math.floor(Math.random() * 2); // 0 또는 1
  }

  const dropIndices = new Set();
  while (dropIndices.size < dropCount) {
    dropIndices.add(Math.floor(Math.random() * maxLoopCount)); // 0~99 중 하나
  }
  console.log(`⚠️ ${device.toUpperCase()} Tx 누락 인덱스:`, [...dropIndices]);

  const loop = async () => {
    if (!logRunning) return;

    const i = loopCount[device];
    if (i >= maxLoopCount) {
      console.log(`🛑 ${device.toUpperCase()} ${maxLoopCount}회 도달`);
      checkAllDevicesDone();
      return;
    }

    // ✅ Request (Rx)
    const reqLine = lines[(i * 2) % lines.length];
    appendLog(device, reqLine, "RX");

    // ✅ Response (Tx)
    const dropThis = dropIndices.has(i);
    if (!dropThis) {
      const delay =
        Math.floor(Math.random() * (responseDelayMax - responseDelayMin + 1)) +
        responseDelayMin;

      setTimeout(() => {
        if (logRunning) {
          const resLine = lines[(i * 2 + 1) % lines.length];
          appendLog(device, resLine, "TX");
          updateSummaryTable();
        }
      }, delay);
    } else {
      console.log(`🚫 ${device} TX 누락 (index: ${i})`);
      summaryCount[device].error = (summaryCount[device].error || 0) + 1;
      updateSummaryTable();
    }

    loopCount[device]++;
    setTimeout(loop, logIntervalTime);
  };

  loop();
}


// =============== 전체 시뮬레이션 ===============
async function startSimulation() {
  if (logRunning) return;
  logRunning = true;

  await Promise.all([
    loadFile("inverter", `${basePath}/hybrid_sim_2000.txt`),
    loadFile("bms", `${basePath}/bms_sim_2000.txt`),
    loadFile("sensor", `${basePath}/sensor_sim_2000.txt`),
  ]);

  console.log("✅ 시뮬레이션 시작");
  logFilterAppend("[SYSTEM] Communication: START")
  setActiveButton("START");

  startDeviceLoop("inverter");
  startDeviceLoop("bms");
  startDeviceLoop("sensor");
}


// 파일 읽기
async function loadFile(device, path) {
  const res = await fetch(path);
  const text = await res.text();
  logData[device] = text.split("\n").filter(l => l.trim().length);
  console.log(`${device} 파일 로드 (${logData[device].length}줄)`);
}

// =============== STOP ===============
function stopSimulation() {
  logRunning = false;
  console.log("🛑 일시정지됨");
  logFilterAppend("[SYSTEM] Communication: STOP")
  setActiveButton("STOP");
}

// =============== CLEAR ===============
function clearLogs() {
  logRunning = false;
  logBox.innerHTML = "";

  Object.keys(logStorage).forEach(k => (logStorage[k] = []));
  Object.keys(summaryCount).forEach(k => (summaryCount[k] = { rx: 0, tx: 0 }));
  Object.keys(lastRequestTime).forEach(k => (lastRequestTime[k] = null));
  Object.keys(lastResponseTime).forEach(k => (lastResponseTime[k] = null));
  Object.keys(lastReceivedTime).forEach(k => (lastReceivedTime[k] = null));
  Object.keys(lastInterval).forEach(k => (lastInterval[k] = "-"));
  Object.keys(loopCount).forEach(k => (loopCount[k] = 0));

  updateSummaryTable();
  updateAllCards();

  // ✅ START 버튼 active 제거
  document.querySelectorAll(".button-row .btn.small").forEach(btn => {
    btn.classList.remove("active");
  });

  console.log("🧹 초기화 완료 (START 버튼 비활성화)");
  
  logFilterAppend("[SYSTEM] Communication: CLEAR")
}

// =============== 요약표 업데이트 ===============
function updateSummaryTable() {
  const tbody = document.querySelector("table tbody");
  if (!tbody) return;

  let totalRequest = 0;
  let totalResponse = 0;
  let totalError = 0;

  ["inverter", "bms", "sensor"].forEach(device => {
    const row = tbody.querySelector(`tr[data-device='${device}']`);
    if (!row) return;

    const request = summaryCount[device].rx;
    const response = summaryCount[device].tx;
    const err = summaryCount[device].error || (request > response ? request - response : 0);
    const rate = request ? ((response / request) * 100).toFixed(1) : 0;

    let dotColor = "green";
    if (rate < 80) dotColor = "red";
    else if (rate < 90) dotColor = "yellow";

    row.children[1].textContent = request;
    row.children[2].textContent = response;
    row.children[3].textContent = err;
    row.children[4].innerHTML = `<span class="dot ${dotColor}"></span>${rate}`;

    totalRequest += request;
    totalResponse += response;
    totalError += err;
  });

  const totalRow = tbody.querySelector("tr[style*='font-weight: 900']");
  if (totalRow) {
    const totalRate = totalRequest
      ? ((totalResponse / totalRequest) * 100).toFixed(1)
      : 0;

    let totalDot = "green";
    if (totalRate < 80) totalDot = "red";
    else if (totalRate < 90) totalDot = "yellow";

    totalRow.children[1].textContent = totalRequest;
    totalRow.children[2].textContent = totalResponse;
    totalRow.children[3].textContent = totalError;
    totalRow.children[4].innerHTML = `<span class="dot ${totalDot}"></span>${totalRate}`;
  }
}

// =============== 카드 업데이트 ===============
function updateDeviceCard(device) {
  const card = document.getElementById(`${device}-card`);
  if (!card) return;

    const time = lastReceivedTime[device]
    ? lastReceivedTime[device].toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
        hour12: false    // ✅ 24시간제 설정
        })
    : "-";

  const status = lastInterval[device] || "-";

  card.querySelector("p:nth-of-type(1)").textContent = time;
  card.querySelector("p:nth-of-type(2)").textContent = status;
}

function updateAllCards() {
  ["inverter", "bms", "sensor"].forEach(updateDeviceCard);
}

// =============== 버튼 상태 관리 ===============
function setActiveButton(label) {
  document.querySelectorAll(".button-row .btn.small").forEach(b => b.classList.remove("active"));
  const btn = [...document.querySelectorAll(".button-row .btn.small")]
    .find(b => b.textContent.trim().toUpperCase() === label);
  if (btn) btn.classList.add("active");
}

// =============== 100회 도달 확인 ===============
function checkAllDevicesDone() {
  if (Object.values(loopCount).every(c => c >= maxLoopCount)) {
    stopSimulation();
    console.log("✅ 모든 장치 100회 완료");
  }
}

// =============== 라디오 버튼 ===============
document.querySelectorAll("input[name='device']").forEach(radio => {
  radio.addEventListener("change", e => {
    currentDevice = e.target.value;
    renderLogsFor(currentDevice);
  });
});

function renderLogsFor(device) {
  const logs = logStorage[device];
  logBox.innerHTML = logs.join("<br>\n");
  logBox.scrollTop = logBox.scrollHeight;
}

// =============== 버튼 이벤트 ===============
document.querySelectorAll(".button-row .btn.small").forEach(btn => {
  btn.addEventListener("click", e => {
    const action = e.target.textContent.trim().toUpperCase();
    if (action === "START") startSimulation();
    else if (action === "STOP") stopSimulation();
    else if (action === "CLEAR") clearLogs();
  });

});
