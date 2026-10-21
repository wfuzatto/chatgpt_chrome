"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { buildSessionConfig, createHandler, extensionOrigin, secureEqual } = require("../lib");
const validOrigin = "chrome-extension://" + "a".repeat(32);
const key = "pareamento-super-seguro-0123456789";

test("origem segura e comparacao constante", () => {
  assert.equal(extensionOrigin(validOrigin), true);
  assert.equal(extensionOrigin("https://meet.google.com"), false);
  assert.equal(secureEqual(key, key), true);
  assert.equal(secureEqual(key, "errado"), false);
});

test("sessao manual evita respostas involuntarias", () => {
  const session = buildSessionConfig({ model: "modelo-invalido", voice: "invalida", mode: "manual" });
  assert.equal(session.model, "gpt-realtime-2.1-mini");
  assert.equal(session.audio.output.voice, "marin");
  assert.equal(session.audio.input.turn_detection.create_response, false);
  assert.equal(buildSessionConfig({ mode: "auto" }).audio.input.turn_detection.create_response, true);
});

test("servidor bloqueia acessos e entrega apenas token efemero", async () => {
  let calls = 0;
  const handler = createHandler({
    apiKey: "sk-teste-nao-real",
    bridgeKey: key,
    logger: { error() {} },
    fetchFn: async (url, opts) => {
      calls++;
      assert.match(url, /client_secrets$/);
      assert.equal(opts.headers.Authorization, "Bearer sk-teste-nao-real");
      const body = JSON.parse(opts.body);
      assert.equal(body.session.type, "realtime");
      assert.equal(body.session.audio.input.turn_detection.create_response, false);
      return { ok: true, json: async () => ({ value: "ek-temporario", expires_at: 123, session: { id: "not-exposed" } }) };
    }
  });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  try {
    const denied = await fetch(url + "/token", {
      method: "POST", headers: { "Content-Type": "application/json", "Origin": "https://attacker.example", "X-Bridge-Key": key }, body: "{}"
    });
    assert.equal(denied.status, 403);
    const unauth = await fetch(url + "/token", {
      method: "POST", headers: { "Content-Type": "application/json", "Origin": validOrigin, "X-Bridge-Key": "errado" }, body: "{}"
    });
    assert.equal(unauth.status, 401);
    const good = await fetch(url + "/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": validOrigin, "X-Bridge-Key": key },
      body: JSON.stringify({ mode: "manual" })
    });
    assert.equal(good.status, 200);
    assert.equal(good.headers.get("access-control-allow-origin"), validOrigin);
    assert.deepEqual(await good.json(), { value: "ek-temporario", expires_at: 123 });
    assert.equal(calls, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
