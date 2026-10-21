"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const { createHandler } = require("./lib");

const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const configPath = path.join(__dirname, ".local-config.json");
let bridgeKey = process.env.BRIDGE_KEY;
if (!bridgeKey) {
  if (fs.existsSync(configPath)) {
    bridgeKey = JSON.parse(fs.readFileSync(configPath, "utf8")).bridgeKey;
  } else {
    bridgeKey = crypto.randomBytes(24).toString("hex");
    fs.writeFileSync(configPath, JSON.stringify({ bridgeKey }, null, 2), { mode: 0o600, flag: "wx" });
  }
}
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PORT invalida.");
const server = http.createServer(createHandler({
  apiKey: process.env.OPENAI_API_KEY,
  bridgeKey
}));
server.listen(port, "127.0.0.1", () => {
  console.log("");
  console.log("CHATGPT VOICE BRIDGE - http://127.0.0.1:" + port);
  console.log("Chave de pareamento (copiar nas configuracoes da extensao):");
  console.log(bridgeKey);
  console.log("API OpenAI configurada: " + (!!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "sk-coloque-aqui"));
  console.log("Feche esta janela para encerrar o servidor.");
});
server.on("error", err => { console.error("Servidor nao iniciou:", err.message); process.exitCode = 1; });
