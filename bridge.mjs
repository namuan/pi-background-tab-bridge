import http from "node:http";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";

const tokenPath = new URL("./.pi-bridge-token", import.meta.url);
const savedToken = existsSync(tokenPath) ? readFileSync(tokenPath, "utf8").trim() : "";
const token = process.env.PI_BRIDGE_TOKEN || savedToken || randomBytes(16).toString("hex");

const expectedBuffer = Buffer.from(token);
writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
chmodSync(tokenPath, 0o600);
let extension;
let approvedTabId;
const pending = new Map();
const server = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();
  response.setHeader("content-type", "application/json");
  if (request.method === "GET" && request.url === "/health") {
    response.end(JSON.stringify({ connected: Boolean(extension?.readyState === 1) }));
    return;
  }
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const suppliedBuffer = Buffer.from(supplied);
  const authorized = expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  if (!authorized) {
    response.writeHead(401).end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  if (request.method === "GET" && request.url === "/status") {
    response.end(JSON.stringify({ connected: Boolean(extension?.readyState === 1), approvedTabId }));
    return;
  }
  if (request.method === "POST" && request.url === "/command") {
    if (!extension || extension.readyState !== 1 || approvedTabId === undefined) {
      response.writeHead(503).end(JSON.stringify({ error: "No approved tab is connected" }));
      return;
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      response.writeHead(400).end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    const id = randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      response.writeHead(504).end(JSON.stringify({ error: "Extension timed out" }));
    }, 20000);
    pending.set(id, { response, timeout });
    extension.send(JSON.stringify({ id, tabId: approvedTabId, action: payload }));
    return;
  }
  response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
});

const sockets = new WebSocketServer({
  server,
  path: "/extension",
  verifyClient: ({ req }, done) => {
    const supplied = new URL(req.url, "http://127.0.0.1").searchParams.get("token") || "";
    const suppliedBuffer = Buffer.from(supplied);
    const valid = suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
    done(valid, valid ? 101 : 401, valid ? "" : "Unauthorized");
  }
});
sockets.on("connection", socket => {
  socket.on("message", raw => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.type === "register" && Number.isInteger(message.tabId)) {
      extension = socket;
      approvedTabId = message.tabId;
      socket.send(JSON.stringify({ type: "registered" }));
      return;
    }
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timeout);
    pending.delete(message.id);
    item.response.end(JSON.stringify(message));
  });
  socket.on("close", () => {
    if (extension === socket) {
      extension = undefined;
      approvedTabId = undefined;
      for (const item of pending.values()) {
        clearTimeout(item.timeout);
        item.response.writeHead(503).end(JSON.stringify({ error: "Extension disconnected" }));
      }
      pending.clear();
    }
  });
});

server.listen(43127, "127.0.0.1", () => {
  const output = [`Pi tab bridge listening on http://127.0.0.1:43127`];
  if (process.env.PI_BRIDGE_HIDE_TOKEN !== "1") output.push(`Bridge token: ${token}`);
  process.stdout.write(`${output.join("\n")}\n`);
});