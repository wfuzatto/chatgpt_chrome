"use strict";
const DEFAULTS = {
  bridgeKey: "", model: "gpt-realtime-2.1-mini", voice: "marin", mode: "manual",
  outputDeviceId: "", includeMic: false, monitorAi: false, consentConfirmed: false,
  instructions: ""
};
const MEETING_HOSTS = new Set([
  "meet.google.com", "teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"
]);
let creatingOffscreen = null;

async function exists() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL("offscreen.html")]
  });
  return contexts.length > 0;
}
async function ensureOffscreen() {
  if (await exists()) return;
  if (!creatingOffscreen) creatingOffscreen = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK", "WEB_RTC"],
    justification: "Capturar audio da reuniao e conectar audio bidirecional por WebRTC."
  }).finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}
async function getState() {
  const data = await chrome.storage.session.get("bridgeState");
  return data.bridgeState || { running: false, status: "parado", error: "" };
}
async function setState(partial) {
  const next = { ...(await getState()), ...partial };
  await chrome.storage.session.set({ bridgeState: next });
  const badge = next.running ? "ON" : (next.error ? "!" : "");
  await chrome.action.setBadgeText({ text: badge });
  await chrome.action.setBadgeBackgroundColor({ color: next.error ? "#bd3636" : "#168754" });
  return next;
}
async function stop() {
  if (await exists()) {
    try { await chrome.runtime.sendMessage({ target: "offscreen", type: "STOP" }); }
    catch { /* offscreen ja encerrou */ }
  }
  return setState({ running: false, status: "parado", error: "", lastText: "" });
}
async function showControl() {
  await chrome.windows.create({
    url: chrome.runtime.getURL("options.html"), type: "popup", width: 500, height: 720
  });
}
chrome.action.onClicked.addListener(async tab => {
  try {
    const current = await getState();
    if (current.running) { await stop(); return; }
    if (!tab || !tab.id || !MEETING_HOSTS.has(new URL(tab.url).hostname)) {
      await setState({ error: "Abra uma reuniao Google Meet ou Teams no Chrome antes de clicar.", status: "erro" });
      await showControl(); return;
    }
    const settings = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
    if (!settings.bridgeKey || !settings.outputDeviceId || !settings.consentConfirmed) {
      await setState({ error: "Configure pareamento, saida VB-CABLE e consentimento antes de iniciar.", status: "configuracao pendente" });
      await showControl(); return;
    }
    await ensureOffscreen();
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    await setState({ running: false, status: "conectando", error: "", lastText: "", meeting: tab.title || tab.url });
    const reply = await chrome.runtime.sendMessage({ target: "offscreen", type: "START", streamId, settings });
    if (!reply || !reply.ok) throw new Error(reply && reply.error || "Nao foi possivel iniciar a captura.");
    await setState({ running: true, status: "conectado", error: "" });
    await showControl();
  } catch (error) {
    await setState({ running: false, status: "erro", error: error.message || String(error) });
    await showControl();
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "worker") return false;
  (async () => {
    if (message.type === "GET_STATE") return { ok: true, state: await getState() };
    if (message.type === "STOP") { await stop(); return { ok: true }; }
    if (message.type === "RESPOND") {
      if (!(await exists())) throw new Error("Nenhuma reuniao capturada.");
      return chrome.runtime.sendMessage({ target: "offscreen", type: "RESPOND", text: String(message.text || "").slice(0, 1000) });
    }
    if (message.type === "OFFSCREEN_EVENT") {
      const e = message.payload || {};
      await setState(e);
      return { ok: true };
    }
    return { ok: false, error: "Comando desconhecido." };
  })().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
  return true;
});
