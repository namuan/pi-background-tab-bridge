let socket;
let reconnectTimer;
let heartbeatTimer;

async function connect() {
  const { approvedTabId, bridgeToken } = await chrome.storage.local.get(["approvedTabId", "bridgeToken"]);
  if (!approvedTabId || !bridgeToken) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  socket = new WebSocket(`ws://127.0.0.1:43127/extension?token=${encodeURIComponent(bridgeToken)}`);
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "register", tabId: approvedTabId }));
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "heartbeat" }));
    }, 20000);
  });
  socket.addEventListener("message", async event => {
    let command;
    try {
      command = JSON.parse(event.data);
      const { approvedTabId: currentTabId } = await chrome.storage.local.get("approvedTabId");
      if (!currentTabId || currentTabId !== approvedTabId || command.tabId !== currentTabId) throw new Error("Tab is no longer approved");
      if (command.action.type === "navigate") {
        const destination = new URL(command.action.url);
        if (destination.protocol !== "http:" && destination.protocol !== "https:") throw new Error("Only HTTP and HTTPS navigation is allowed");
        await chrome.tabs.update(currentTabId, { url: destination.href });
        socket?.send(JSON.stringify({ id: command.id, ok: true, result: { navigating: destination.href } }));
        return;
      }
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: async action => {
          if (action.type === "evaluate") return await (0, eval)(action.code);
          if (action.type === "snapshot") return { title: document.title, url: location.href, text: document.body?.innerText?.slice(0, 12000) || "" };
          if (action.type === "inspect") {
            return Array.from(document.querySelectorAll("button, [role=button], input, textarea, [contenteditable=true], [role=textbox], [role=checkbox], [role=switch]"))
              .map((element, index) => ({
                index,
                tag: element.tagName.toLowerCase(),
                role: element.getAttribute("role"),
                text: (element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim().slice(0, 160),
                ariaLabel: element.getAttribute("aria-label"),
                title: element.getAttribute("title"),
                placeholder: element.getAttribute("placeholder"),
                contenteditable: element.getAttribute("contenteditable"),
                pressed: element.getAttribute("aria-pressed"),
                checked: element.getAttribute("aria-checked"),
                selector: element.id ? `#${CSS.escape(element.id)}` : `${element.tagName.toLowerCase()}${element.classList.length ? `.${Array.from(element.classList).slice(0, 2).map(name => CSS.escape(name)).join(".")}` : ""}:nth-of-type(${index + 1})`
              }));
          }
          if (action.type === "clickText") {
            const matches = Array.from(document.querySelectorAll("button, [role=button], [role=checkbox], [role=switch]"))
              .filter(element => (element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim() === action.text);
            if (matches.length !== 1) throw new Error(`Expected one exact text match; found ${matches.length}`);
            matches[0].click();
            return { clickedText: action.text };
          }
          if (action.type === "click") {
            const element = document.querySelector(action.selector);
            if (!element) throw new Error("No element matches selector");
            element.click();
            return { clicked: action.selector };
          }
          if (action.type === "type") {
            const element = document.querySelector(action.selector);
            if (!element) throw new Error("No element matches selector");
            element.focus();
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
              const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
              setter?.call(element, action.text);
              element.dispatchEvent(new InputEvent("input", { bubbles: true, data: action.text, inputType: "insertText" }));
              element.dispatchEvent(new Event("change", { bubbles: true }));
            } else {
              element.textContent = action.text;
              element.dispatchEvent(new InputEvent("input", { bubbles: true, data: action.text, inputType: "insertText" }));
            }
            return { typed: action.selector };
          }
          if (action.type === "navigate") {
            location.href = action.url;
            return { navigating: action.url };
          }
          throw new Error("Unsupported action");
        },
        args: [command.action]
      });
      socket?.send(JSON.stringify({ id: command.id, ok: true, result: result.result }));
    } catch (error) {
      socket?.send(JSON.stringify({ id: command?.id, ok: false, error: String(error.message || error) }));
    }
  });
  socket.addEventListener("close", () => {
    clearInterval(heartbeatTimer);
    scheduleReconnect();
  });
  socket.addEventListener("error", () => socket.close());
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, 1500);
}

chrome.runtime.onMessage.addListener(message => {
  if (message.type === "start-bridge") {
    socket?.close();
    socket = undefined;
    connect();
  }
  if (message.type === "stop-bridge") {
    clearTimeout(reconnectTimer);
    clearInterval(heartbeatTimer);
    socket?.close();
    socket = undefined;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.approvedTabId || changes.bridgeToken)) {
    socket?.close();
    socket = undefined;
    connect();
  }
});

connect();