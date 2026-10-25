const status = document.querySelector("#status");

async function refresh() {
  const { approvedTabId, approvedTabUrl, bridgeToken } = await chrome.storage.local.get(["approvedTabId", "approvedTabUrl", "bridgeToken"]);
  document.querySelector("#token").value = bridgeToken || "";
  status.textContent = approvedTabId ? `Approved tab ${approvedTabId}: ${approvedTabUrl || "URL unavailable"}` : "No tab is approved.";
}

document.querySelector("#token").addEventListener("change", async event => {
  await chrome.storage.local.set({ bridgeToken: event.target.value.trim() });
});

document.querySelector("#approve").addEventListener("click", async () => {
  const bridgeToken = document.querySelector("#token").value.trim();
  if (!bridgeToken) {
    status.textContent = "Enter the bridge token first.";
    return;
  }
  await chrome.storage.local.set({ bridgeToken });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    status.textContent = "Could not find the active tab.";
    return;
  }
  await chrome.storage.local.set({ approvedTabId: tab.id, approvedTabUrl: tab.url || "" });
  await chrome.runtime.sendMessage({ type: "start-bridge" });
  status.textContent = `Pi can now use tab ${tab.id}. This tab will not be activated by the bridge.`;
});

document.querySelector("#grant-all").addEventListener("click", async () => {
  const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
  status.textContent = granted ? "Pi now has host permission for all websites. Page control remains limited to the approved tab." : "All-sites access was not granted.";
});

document.querySelector("#revoke").addEventListener("click", async () => {
  await chrome.storage.local.remove(["approvedTabId", "approvedTabUrl"]);
  await chrome.runtime.sendMessage({ type: "stop-bridge" });
  status.textContent = "Access revoked.";
});

refresh();