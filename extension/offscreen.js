"use strict";
let session = null;

function notify(payload) {
  chrome.runtime.sendMessage({ target: "worker", type: "OFFSCREEN_EVENT", payload }).catch(() => {});
}
async function stopSession() {
  const s = session;
  session = null;
  if (!s) return;
  try { if (s.channel) s.channel.close(); } catch {}
  try { if (s.pc) s.pc.close(); } catch {}
  try { if (s.virtualPlayer) { s.virtualPlayer.pause(); s.virtualPlayer.srcObject = null; } } catch {}
  try { if (s.tabStream) s.tabStream.getTracks().forEach(track => track.stop()); } catch {}
  try { if (s.micStream) s.micStream.getTracks().forEach(track => track.stop()); } catch {}
  try { if (s.audioContext) await s.audioContext.close(); } catch {}
  notify({ running: false, status: "parado" });
}
async function startSession(streamId, settings) {
  if (session) await stopSession();
  const s = {};
  session = s;
  try {
    s.tabStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
      video: false
    });
    s.audioContext = new AudioContext({ latencyHint: "interactive" });
    await s.audioContext.resume();
    const ctx = s.audioContext;
    const fromTab = ctx.createMediaStreamSource(s.tabStream);
    // tabCapture suprime som original da guia: encaminhar novamente ao falante.
    fromTab.connect(ctx.destination);
    const toModel = ctx.createMediaStreamDestination();
    const toMeeting = ctx.createMediaStreamDestination();
    fromTab.connect(toModel);
    if (settings.includeMic) {
      s.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const mic = ctx.createMediaStreamSource(s.micStream);
      mic.connect(toModel);
      mic.connect(toMeeting);
    }

    // CABLE Input (saida de audio) -> CABLE Output (microfone no Meet/Teams).
    s.virtualPlayer = new Audio();
    s.virtualPlayer.autoplay = true;
    s.virtualPlayer.srcObject = toMeeting.stream;
    if (typeof s.virtualPlayer.setSinkId !== "function") throw new Error("Chrome nao permite selecionar a saida de audio neste dispositivo.");
    await s.virtualPlayer.setSinkId(settings.outputDeviceId);
    await s.virtualPlayer.play();

    s.pc = new RTCPeerConnection();
    s.pc.addTrack(toModel.stream.getAudioTracks()[0], toModel.stream);
    s.pc.ontrack = event => {
      if (session !== s) return;
      try {
        const remote = new MediaStream([event.track]);
        const source = ctx.createMediaStreamSource(remote);
        source.connect(toMeeting);
        if (settings.monitorAi) source.connect(ctx.destination);
      } catch (error) {
        notify({ error: "Falha ao reproduzir voz da IA: " + error.message });
      }
    };
    s.pc.onconnectionstatechange = () => {
      if (session !== s) return;
      if (s.pc.connectionState === "failed" || s.pc.connectionState === "closed") {
        notify({ error: "Conexao WebRTC perdida.", status: "erro", running: false });
        stopSession();
      }
    };
    s.channel = s.pc.createDataChannel("oai-events");
    s.channel.onmessage = event => {
      try {
        const item = JSON.parse(event.data);
        if (item.type === "error") notify({ error: item.error && item.error.message || "Erro na sessao Realtime." });
        if (item.type === "response.output_audio_transcript.delta" && item.delta) {
          s.lastText = (s.lastText || "") + item.delta;
          notify({ lastText: s.lastText.slice(-400) });
        }
        if (item.type === "response.created") {
          s.lastText = "";
          notify({ lastText: "" });
        }
      } catch {}
    };

    const tokenResponse = await fetch("http://127.0.0.1:8787/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Key": settings.bridgeKey },
      body: JSON.stringify({
        model: settings.model, voice: settings.voice,
        mode: settings.mode, instructions: settings.instructions
      })
    });
    const data = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !data.value) {
      throw new Error(data.error || "Servico local nao respondeu. Inicie start-windows.bat.");
    }
    const offer = await s.pc.createOffer();
    await s.pc.setLocalDescription(offer);
    const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + data.value,
        "Content-Type": "application/sdp"
      },
      body: offer.sdp
    });
    const answerSdp = await answer.text();
    if (!answer.ok) throw new Error("Handshake Realtime falhou: HTTP " + answer.status);
    await s.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    s.tabStream.getAudioTracks()[0].onended = () => {
      notify({ running: false, status: "a guia de reuniao foi fechada", error: "" });
      stopSession();
    };
    notify({ running: true, status: "conectado", error: "" });
    return { ok: true };
  } catch (error) {
    await stopSession();
    notify({ running: false, status: "erro", error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}
function respond(text) {
  if (!session || !session.channel || session.channel.readyState !== "open") {
    return { ok: false, error: "Conexao de eventos ainda nao esta pronta." };
  }
  if (text && text.trim()) {
    session.channel.send(JSON.stringify({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: text.trim() }] }
    }));
  }
  session.channel.send(JSON.stringify({ type: "response.create" }));
  return { ok: true };
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "offscreen") return false;
  (async () => {
    if (message.type === "START") return startSession(message.streamId, message.settings);
    if (message.type === "STOP") { await stopSession(); return { ok: true }; }
    if (message.type === "RESPOND") return respond(message.text);
    if (message.type === "STATUS") return { ok: true, running: !!session };
    return { ok: false, error: "Comando desconhecido." };
  })().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
  return true;
});
