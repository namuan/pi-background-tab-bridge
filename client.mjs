import { readFileSync } from "node:fs";

const token = readFileSync(new URL("./.pi-bridge-token", import.meta.url), "utf8").trim();
const input = process.argv[2];
const url = input === "status" ? "http://127.0.0.1:43127/status" : "http://127.0.0.1:43127/command";
const options = {
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }
};

if (url.endsWith("/command")) {
  if (!input) throw new Error("Pass a JSON command, for example {\"type\":\"snapshot\"}");
  options.method = "POST";
  options.body = input;
}

const response = await fetch(url, options);
process.stdout.write(`${await response.text()}\n`);
if (!response.ok) process.exitCode = 1;
