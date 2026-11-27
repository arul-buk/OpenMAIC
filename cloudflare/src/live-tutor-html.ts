export const LIVE_TUTOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>Notebook Camera Tutor · Gemini Live</title>
<style>
  :root {
    --bg: #0f1115;
    --panel: #171a21;
    --border: #2a2f3a;
    --text: #f3f5f8;
    --muted: #98a2b3;
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --ok: #10b981;
    --danger: #ef4444;
    --warn: #f59e0b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    gap: 10px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 15px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--muted);
    transition: background 0.2s;
  }
  .dot.live { background: var(--ok); box-shadow: 0 0 10px rgba(16,185,129,0.7); }
  .dot.connecting { background: var(--warn); }
  .dot.error { background: var(--danger); }
  .status-text { font-size: 12px; color: var(--muted); }

  .stage {
    position: relative;
    flex: 1;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    background: radial-gradient(circle at center, #1b202b 0%, #0f1115 70%);
  }
  .placeholder h2 { margin: 0 0 8px; font-size: 18px; }
  .placeholder p { margin: 0 0 16px; color: var(--muted); max-width: 340px; }

  .lock-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 20px;
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lock-card input, .topic-input {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: #0c0e12;
    color: var(--text);
    font-size: 14px;
    outline: none;
  }
  .lock-card input:focus, .topic-input:focus { border-color: var(--accent); }

  .captions {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    background: rgba(15, 17, 21, 0.78);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 13px;
    color: #eef2ff;
    max-height: 110px;
    overflow-y: auto;
    display: none;
  }
  .captions.show { display: block; }

  .controls {
    background: var(--panel);
    border-top: 1px solid var(--border);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  button {
    appearance: none;
    border: 1px solid var(--border);
    background: #222631;
    color: var(--text);
    padding: 9px 14px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background 0.15s, border-color 0.15s;
  }
  button:hover { background: #2c3240; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    flex: 1;
  }
  button.primary:hover { background: var(--accent-hover); }
  button.danger {
    background: var(--danger);
    border-color: var(--danger);
    color: #fff;
    flex: 1;
  }
  button.active-off {
    background: rgba(239, 68, 68, 0.18);
    border-color: rgba(239, 68, 68, 0.5);
    color: #fca5a5;
  }
  .err { color: #fca5a5; font-size: 12px; min-height: 16px; }
</style>
</head>
<body>
  <header>
    <div class="brand">
      <span id="dot" class="dot"></span>
      <span>Notebook Camera Tutor</span>
    </div>
    <span id="status" class="status-text">Ready</span>
  </header>

  <div class="stage">
    <video id="video" autoplay playsinline muted></video>
    <canvas id="canvas" style="display:none"></canvas>

    <div id="placeholder" class="placeholder">
      <h2>Point Camera at Your Notebook</h2>
      <p>The AI tutor watches your work live and guides you step by step with voice — without giving away the answer.</p>
      <div id="lockBox" class="lock-card" style="display:none">
        <input id="codeInput" type="password" placeholder="Enter Access Code" autocomplete="off" />
        <button id="unlockBtn" class="primary">Unlock Camera Tutor</button>
        <div id="lockErr" class="err"></div>
      </div>
    </div>

    <div id="captions" class="captions"></div>
  </div>

  <div class="controls">
    <input id="topicInput" class="topic-input" type="text" placeholder="Optional topic (e.g., Fractions, Long Division, Science)" />
    <div class="btn-row">
      <button id="startBtn" class="primary">Start Live Session</button>
      <button id="stopBtn" class="danger" style="display:none">Stop Session</button>
      <button id="micBtn" disabled>Mic On</button>
      <button id="camBtn" disabled>Cam On</button>
      <button id="flipBtn" disabled>Flip</button>
    </div>
  </div>

<script>
(() => {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const placeholder = document.getElementById("placeholder");
  const lockBox = document.getElementById("lockBox");
  const codeInput = document.getElementById("codeInput");
  const unlockBtn = document.getElementById("unlockBtn");
  const lockErr = document.getElementById("lockErr");
  const topicInput = document.getElementById("topicInput");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const micBtn = document.getElementById("micBtn");
  const camBtn = document.getElementById("camBtn");
  const flipBtn = document.getElementById("flipBtn");
  const dot = document.getElementById("dot");
  const statusEl = document.getElementById("status");
  const captionsEl = document.getElementById("captions");

  let ws = null;
  let mediaStream = null;
  let audioCtx = null;
  let playCtx = null;
  let nextPlayTime = 0;
  let activeSources = [];
  let frameTimer = null;
  let micMuted = false;
  let camPaused = false;
  let facingMode = "environment";
  let unlocked = false;

  function setStatus(text, state) {
    statusEl.textContent = text;
    dot.className = "dot" + (state ? " " + state : "");
  }

  function addCaption(text) {
    if (!text) return;
    captionsEl.classList.add("show");
    captionsEl.textContent = text;
    captionsEl.scrollTop = captionsEl.scrollHeight;
  }

  async function checkAuth() {
    try {
      const r = await fetch("/live-tutor/auth", { method: "GET" });
      if (r.ok) {
        unlocked = true;
        lockBox.style.display = "none";
      } else {
        unlocked = false;
        lockBox.style.display = "flex";
      }
    } catch {
      lockBox.style.display = "flex";
    }
  }

  unlockBtn.addEventListener("click", async () => {
    lockErr.textContent = "";
    const code = codeInput.value.trim();
    if (!code) { lockErr.textContent = "Please enter the access code."; return; }
    const r = await fetch("/live-tutor/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    if (r.ok) {
      unlocked = true;
      lockBox.style.display = "none";
      codeInput.value = "";
    } else {
      lockErr.textContent = "Invalid access code.";
    }
  });

  function floatTo16BitPCM(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return new Uint8Array(out.buffer);
  }

  function downsample(buffer, fromRate, toRate) {
    if (fromRate === toRate) return buffer;
    const ratio = fromRate / toRate;
    const len = Math.round(buffer.length / ratio);
    const res = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      res[i] = buffer[Math.min(buffer.length - 1, Math.round(i * ratio))];
    }
    return res;
  }

  function bytesToBase64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function stopPlayback() {
    for (const s of activeSources) {
      try { s.stop(); } catch {}
    }
    activeSources = [];
    if (playCtx) nextPlayTime = playCtx.currentTime;
  }

  function playPcm24k(base64) {
    if (!playCtx) playCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    if (playCtx.state === "suspended") playCtx.resume();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const audioBuf = playCtx.createBuffer(1, float32.length, 24000);
    audioBuf.copyToChannel(float32, 0);
    const src = playCtx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(playCtx.destination);

    const now = playCtx.currentTime;
    const startAt = Math.max(now, nextPlayTime);
    src.start(startAt);
    nextPlayTime = startAt + audioBuf.duration;
    activeSources.push(src);
    src.onended = () => {
      activeSources = activeSources.filter(x => x !== src);
    };
  }

  async function startCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
    video.srcObject = mediaStream;
    placeholder.style.display = "none";
  }

  function startFrameLoop() {
    if (frameTimer) clearInterval(frameTimer);
    frameTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN || camPaused) return;
      if (!video.videoWidth || !video.videoHeight) return;
      const maxDim = 768;
      const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const b64 = dataUrl.split(",")[1];
      ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ mimeType: "image/jpeg", data: b64 }]
        }
      }));
    }, 1000);
  }

  function startMicLoop() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(mediaStream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || micMuted) return;
      const input = e.inputBuffer.getChannelData(0);
      const down = downsample(input, audioCtx.sampleRate, 16000);
      const pcmBytes = floatTo16BitPCM(down);
      ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: bytesToBase64(pcmBytes) }]
        }
      }));
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);
  }

  async function startSession() {
    if (!unlocked) {
      await checkAuth();
      if (!unlocked) { lockBox.style.display = "flex"; return; }
    }
    setStatus("Starting camera...", "connecting");
    startBtn.disabled = true;

    try {
      await startCamera();
    } catch (err) {
      setStatus("Camera/Mic blocked", "error");
      startBtn.disabled = false;
      addCaption("Please allow camera and microphone permissions to use the Notebook Camera Tutor.");
      return;
    }

    setStatus("Connecting to Gemini Live...", "connecting");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(proto + "//" + location.host + "/live-tutor/ws");

    ws.onopen = () => {
      const topic = topicInput.value.trim();
      const systemPrompt = [
        "You are a warm, patient, encouraging tutor watching a student's physical notebook through their camera.",
        "Observe what they write and draw in real time. Praise what they got right first.",
        "Never just blurt out the final answer: instead, point to the specific line or step where they can improve and ask one gentle guiding question.",
        "Keep every spoken reply short (1 to 3 sentences) and clear, like sitting beside them at the study desk.",
        topic ? ("Current study topic: " + topic + ".") : ""
      ].filter(Boolean).join(" ");

      ws.send(JSON.stringify({
        setup: {
          model: "models/gemini-3.8-live",
          generationConfig: {
            responseModalities: ["AUDIO"]
          },
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          }
        }
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : await event.data.text();
        const msg = JSON.parse(raw);

        if (msg.setupComplete) {
          setStatus("Live · Watching Notebook", "live");
          startBtn.style.display = "none";
          stopBtn.style.display = "inline-flex";
          micBtn.disabled = false;
          camBtn.disabled = false;
          flipBtn.disabled = false;
          startFrameLoop();
          startMicLoop();
          addCaption("Connected! Show your notebook to the camera and speak whenever you'd like a hint.");
          return;
        }

        if (msg.serverContent?.interrupted) {
          stopPlayback();
        }

        const parts = msg.serverContent?.modelTurn?.parts || [];
        for (const p of parts) {
          if (p.inlineData?.mimeType?.startsWith("audio/pcm") && p.inlineData?.data) {
            playPcm24k(p.inlineData.data);
          }
          if (p.text) {
            addCaption(p.text);
          }
        }
        if (msg.serverContent?.outputTranscription?.text) {
          addCaption(msg.serverContent.outputTranscription.text);
        }
      } catch {}
    };

    ws.onerror = () => {
      setStatus("Connection error", "error");
    };

    ws.onclose = (e) => {
      if (e.code === 4401) {
        unlocked = false;
        lockBox.style.display = "flex";
      }
      stopSession(e.code === 4401 ? "Locked — enter access code" : "Disconnected");
    };
  }

  function stopSession(reason) {
    if (frameTimer) { clearInterval(frameTimer); frameTimer = null; }
    if (ws) { try { ws.close(); } catch {} ws = null; }
    if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
    stopPlayback();
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    video.srcObject = null;
    placeholder.style.display = "flex";
    startBtn.style.display = "inline-flex";
    startBtn.disabled = false;
    stopBtn.style.display = "none";
    micBtn.disabled = true;
    camBtn.disabled = true;
    flipBtn.disabled = true;
    micMuted = false;
    camPaused = false;
    micBtn.textContent = "Mic On";
    micBtn.classList.remove("active-off");
    camBtn.textContent = "Cam On";
    camBtn.classList.remove("active-off");
    setStatus(reason || "Ready", "");
  }

  startBtn.addEventListener("click", startSession);
  stopBtn.addEventListener("click", () => stopSession("Stopped"));

  micBtn.addEventListener("click", () => {
    micMuted = !micMuted;
    micBtn.textContent = micMuted ? "Mic Muted" : "Mic On";
    micBtn.classList.toggle("active-off", micMuted);
  });

  camBtn.addEventListener("click", () => {
    camPaused = !camPaused;
    camBtn.textContent = camPaused ? "Cam Paused" : "Cam On";
    camBtn.classList.toggle("active-off", camPaused);
  });

  flipBtn.addEventListener("click", async () => {
    facingMode = facingMode === "environment" ? "user" : "environment";
    if (mediaStream) {
      await startCamera();
    }
  });

  checkAuth();
})();
</script>
</body>
</html>`;
