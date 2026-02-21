/* Coltranizer popup script */
"use strict";

const btnColtranize  = document.getElementById("btnColtranize");
const btnRestore     = document.getElementById("btnRestore");
const chkAutoDetect  = document.getElementById("chkAutoDetect");
const chkMaj7        = document.getElementById("chkMaj7");
const statusEl       = document.getElementById("status");

// ── Persist settings ──────────────────────────────────────────────────────────

function loadSettings() {
  browser.storage.local.get({ autoDetect: true, useMaj7: true }).then((settings) => {
    chkAutoDetect.checked = settings.autoDetect;
    chkMaj7.checked       = settings.useMaj7;
  });
}

function saveSettings() {
  browser.storage.local.set({
    autoDetect: chkAutoDetect.checked,
    useMaj7:    chkMaj7.checked,
  });
}

chkAutoDetect.addEventListener("change", saveSettings);
chkMaj7.addEventListener("change", saveSettings);

// ── Status helpers ─────────────────────────────────────────────────────────────

function showStatus(text, type = "info") {
  statusEl.textContent = text;
  statusEl.className   = `status ${type}`;
}

function hideStatus() {
  statusEl.className = "status hidden";
}

// ── Send message to active tab's content script ────────────────────────────────

function sendToTab(message) {
  return browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (!tabs.length) return Promise.reject(new Error("No active tab found."));
    return browser.tabs.sendMessage(tabs[0].id, message);
  });
}

// ── Button handlers ────────────────────────────────────────────────────────────

btnColtranize.addEventListener("click", () => {
  btnColtranize.disabled = true;

  sendToTab({
    action:     "coltranize",
    autoDetect: chkAutoDetect.checked,
    useMaj7:    chkMaj7.checked,
  })
    .then((response) => {
      if (response && response.noSelection) {
        showStatus("Select chord text on the page first, then click Coltranize!", "info");
      } else if (response && typeof response.count === "number") {
        if (response.count === 0) {
          showStatus("No II–V–I progressions found in the selected text.", "info");
        } else {
          showStatus(
            `✓ Replaced ${response.count} progression${response.count === 1 ? "" : "s"}!`,
            "success"
          );
        }
      }
    })
    .catch((err) => {
      showStatus(`Error: ${err.message}`, "error");
    })
    .finally(() => {
      btnColtranize.disabled = false;
    });
});

btnRestore.addEventListener("click", () => {
  btnRestore.disabled = true;

  sendToTab({ action: "restore" })
    .then(() => {
      hideStatus();
    })
    .catch((err) => {
      showStatus(`Error: ${err.message}`, "error");
    })
    .finally(() => {
      btnRestore.disabled = false;
    });
});

// ── Init ──────────────────────────────────────────────────────────────────────

loadSettings();
