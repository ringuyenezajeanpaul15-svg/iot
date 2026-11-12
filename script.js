// Web Serial API State
let port = null;
let writer = null;
let reader = null;
let isConnected = false;

// Hardware State
let isLedOn = false;
let encoderPos = 0;
let motorSpeed = 0;
let motorDir = "CW";
let rotorAngle = 0;

// DOM Elements
const btnConnect = document.getElementById("btnConnect");
const connDot = document.getElementById("connDot");
const baudRateSelect = document.getElementById("baudRate");
const chkSimMode = document.getElementById("chkSimMode");
const serialLog = document.getElementById("serialLog");

// Log helper
function logMessage(text, type = "sys") {
  const line = document.createElement("div");
  line.className = `log-${type}`;
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${text}`;
  serialLog.appendChild(line);
  serialLog.scrollTop = serialLog.scrollHeight;
}

// ================= WEB SERIAL CONNECTION =================
btnConnect.addEventListener("click", async () => {
  if (!("serial" in navigator)) {
    alert("Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.");
    return;
  }

  if (!isConnected) {
    try {
      port = await navigator.serial.requestPort();
      const baudRate = parseInt(baudRateSelect.value, 10);
      await port.open({ baudRate });

      isConnected = true;
      chkSimMode.checked = false;
      connDot.classList.add("connected");
      btnConnect.textContent = "Disconnect";
      btnConnect.classList.replace("btn-primary", "btn-danger");
      logMessage(`Connected to Serial Port at ${baudRate} baud.`, "sys");

      // Setup Writer
      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(port.writable);
      writer = textEncoder.writable.getWriter();

      // Start Reading Incoming Data
      readSerialLoop();
    } catch (err) {
      logMessage(`Connection error: ${err.message}`, "sys");
    }
  } else {
    await disconnectSerial();
  }
});

async function disconnectSerial() {
  try {
    if (reader) {
      await reader.cancel();
      reader = null;
    }
    if (writer) {
      await writer.close();
      writer = null;
    }
    if (port) {
      await port.close();
      port = null;
    }
  } catch (e) {
    console.error(e);
  }
  isConnected = false;
  connDot.classList.remove("connected");
  btnConnect.textContent = "Connect Serial Port";
  btnConnect.classList.replace("btn-danger", "btn-primary");
  logMessage("Disconnected from Serial Port.", "sys");
}

async function readSerialLoop() {
  const textDecoder = new TextDecoderStream();
  port.readable.pipeTo(textDecoder.writable);
  reader = textDecoder.readable.getReader();

  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep incomplete line in buffer
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            logMessage(`RX: ${trimmed}`, "rx");
            parseIncomingTelemetry(trimmed);
          }
        }
      }
    }
  } catch (err) {
    logMessage(`Read error: ${err.message}`, "sys");
  }
}

async function sendCommand(cmd) {
  logMessage(`TX: ${cmd}`, "tx");
  if (isConnected && writer) {
    await writer.write(cmd + "\n");
  }
}

// Parse incoming string: "T:25.4,H:60.1,E:12"
function parseIncomingTelemetry(data) {
  const parts = data.split(",");
  parts.forEach((part) => {
    if (part.startsWith("T:")) {
      const temp = parseFloat(part.substring(2));
      if (!isNaN(temp)) updateTempUI(temp);
    } else if (part.startsWith("H:")) {
      const hum = parseFloat(part.substring(2));
      if (!isNaN(hum)) updateHumUI(hum);
    } else if (part.startsWith("E:")) {
      const enc = parseInt(part.substring(2), 10);
      if (!isNaN(enc)) updateEncoderUI(enc);
    }
  });
}

// ================= UI UPDATES & CONTROLS =================
function updateTempUI(temp) {
  document.getElementById("tempVal").textContent = `${temp.toFixed(1)} °C`;
  const clamped = Math.max(0, Math.min(100, temp));
  document.getElementById("tempBar").style.width = `${clamped}%`;
}

function updateHumUI(hum) {
  document.getElementById("humVal").textContent = `${hum.toFixed(1)} %`;
  const clamped = Math.max(0, Math.min(100, hum));
  document.getElementById("humBar").style.width = `${clamped}%`;
}

function updateEncoderUI(pos) {
  encoderPos = pos;
  document.getElementById("encVal").textContent = pos;
  const deg = (pos * 15) % 360;
  document.getElementById("encoderNeedle").style.transform = `rotate(${deg}deg)`;
}

// LED Control
const ledIndicator = document.getElementById("ledIndicator");
const btnToggleLed = document.getElementById("btnToggleLed");

btnToggleLed.addEventListener("click", () => {
  isLedOn = !isLedOn;
  ledIndicator.classList.toggle("on", isLedOn);
  btnToggleLed.textContent = isLedOn ? "TURN LED OFF" : "TURN LED ON";
  sendCommand(isLedOn ? "LED:1" : "LED:0");
});

// LCD Control
document.getElementById("btnSendLcd").addEventListener("click", () => {
  const l1 = document.getElementById("txtLcd1").value.padEnd(16, " ").slice(0, 16);
  const l2 = document.getElementById("txtLcd2").value.padEnd(16, " ").slice(0, 16);
  document.getElementById("lcdLine1Out").textContent = l1;
  document.getElementById("lcdLine2Out").textContent = l2;
  sendCommand(`LCD:${l1}|${l2}`);
});

// Encoder Reset
document.getElementById("btnResetEnc").addEventListener("click", () => {
  updateEncoderUI(0);
  sendCommand("ENC:0");
});

// Motor Control
const rngMotorSpeed = document.getElementById("rngMotorSpeed");
const btnMotorDir = document.getElementById("btnMotorDir");
const btnMotorStop = document.getElementById("btnMotorStop");
const motorLabel = document.getElementById("motorLabel");
const rotorIcon = document.getElementById("rotorIcon");

function updateMotor() {
  motorLabel.textContent = `Speed: ${motorSpeed}% (${motorDir})`;
  sendCommand(`MOT:${motorSpeed},${motorDir}`);
}

rngMotorSpeed.addEventListener("input", (e) => {
  motorSpeed = parseInt(e.target.value, 10);
  updateMotor();
});

btnMotorDir.addEventListener("click", () => {
  motorDir = motorDir === "CW" ? "CCW" : "CW";
  btnMotorDir.textContent = motorDir === "CW" ? "Direction: CW ↻" : "Direction: CCW ↺";
  updateMotor();
});

btnMotorStop.addEventListener("click", () => {
  motorSpeed = 0;
  rngMotorSpeed.value = 0;
  updateMotor();
});

// Clear Log
document.getElementById("btnClearLog").addEventListener("click", () => {
  serialLog.innerHTML = "";
});

// ================= SIMULATION LOOP & ANIMATION =================
setInterval(() => {
  if (chkSimMode.checked) {
    const simTemp = 23 + Math.random() * 4;
    const simHum = 48 + Math.random() * 10;
    updateTempUI(simTemp);
    updateHumUI(simHum);

    if (motorSpeed > 0) {
      const delta = motorDir === "CW" ? 1 : -1;
      updateEncoderUI(encoderPos + delta);
    }
  }
}, 1000);

// Smooth Rotor Spin Animation
function animateRotor() {
  if (motorSpeed > 0) {
    const step = (motorSpeed / 100) * 12 * (motorDir === "CW" ? 1 : -1);
    rotorAngle = (rotorAngle + step) % 360;
    rotorIcon.style.transform = `rotate(${rotorAngle}deg)`;
  }
  requestAnimationFrame(animateRotor);
}
animateRotor();

logMessage("Dashboard initialized. Enable Simulation Mode or connect a COM port.", "sys");