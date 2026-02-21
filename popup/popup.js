/* Harmony Alchemist popup script */
"use strict";

const btnColtranize  = document.getElementById("btnColtranize");
const btnRestore     = document.getElementById("btnRestore");
const chkMaj7        = document.getElementById("chkMaj7");
const chkAddPassing  = document.getElementById("chkAddPassing");
const chkExpandMajor = document.getElementById("chkExpandMajor");
const rngIntensity   = document.getElementById("rngIntensity");
const statusEl       = document.getElementById("status");
const statsEl        = document.getElementById("stats");
const statChords     = document.getElementById("statChords");
const statProgressions = document.getElementById("statProgressions");
const statReplaced   = document.getElementById("statReplaced");

// ── Persist settings ──────────────────────────────────────────────────────────

function loadSettings() {
  browser.storage.local.get({
    strategy:    "COLTRANE_CLASSIC",
    useMaj7:     true,
    addPassing:  false,
    expandMajor: false,
    intensity:   50,
  }).then((s) => {
    const radio = document.querySelector(`input[name="strategy"][value="${s.strategy}"]`);
    if (radio) radio.checked = true;
    chkMaj7.checked        = s.useMaj7;
    chkAddPassing.checked  = s.addPassing;
    chkExpandMajor.checked = s.expandMajor;
    rngIntensity.value     = s.intensity;
  });
}

function saveSettings() {
  const strategyRadio = document.querySelector('input[name="strategy"]:checked');
  browser.storage.local.set({
    strategy:    strategyRadio ? strategyRadio.value : "COLTRANE_CLASSIC",
    useMaj7:     chkMaj7.checked,
    addPassing:  chkAddPassing.checked,
    expandMajor: chkExpandMajor.checked,
    intensity:   parseInt(rngIntensity.value, 10),
  });
}

document.querySelectorAll('input[name="strategy"]').forEach(r => r.addEventListener("change", saveSettings));
chkMaj7.addEventListener("change", saveSettings);
chkAddPassing.addEventListener("change", saveSettings);
chkExpandMajor.addEventListener("change", saveSettings);
rngIntensity.addEventListener("input", saveSettings);

// ── Status helpers ─────────────────────────────────────────────────────────────

function showStatus(text, type = "info") {
  statusEl.textContent = text;
  statusEl.className   = `status ${type}`;
}

function hideStatus() {
  statusEl.className = "status hidden";
}

function showStats(totalChords, progressions, replaced) {
  statChords.textContent      = totalChords;
  statProgressions.textContent = progressions;
  statReplaced.textContent    = replaced;
  statsEl.classList.remove("hidden");
}

function hideStats() {
  statsEl.classList.add("hidden");
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
  hideStats();

  const strategyRadio = document.querySelector('input[name="strategy"]:checked');

  sendToTab({
    action:      "coltranize",
    strategy:    strategyRadio ? strategyRadio.value : "COLTRANE_CLASSIC",
    useMaj7:     chkMaj7.checked,
    addPassing:  chkAddPassing.checked,
    expandMajor: chkExpandMajor.checked,
    intensity:   parseInt(rngIntensity.value, 10),
  })
    .then((response) => {
      if (response && typeof response.count === "number") {
        showStats(
          response.totalChords  || 0,
          response.progressions || 0,
          response.count
        );
        if (response.count === 0) {
          showStatus("No transformable progressions found on the page.", "info");
        } else {
          showStatus(
            `✓ Transformed ${response.count} progression${response.count === 1 ? "" : "s"}!`,
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
      hideStats();
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
