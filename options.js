"use strict";

const DEFAULTS = {
  runAfterCreation: false,
  useLocalFolders:  false,
  parentFolderName: "",
};

async function loadSettings() {
  const settings = await browser.storage.local.get(DEFAULTS);
  document.getElementById("runAfterCreation").checked  = settings.runAfterCreation;
  document.getElementById("useLocalFolders").checked    = settings.useLocalFolders;
  document.getElementById("parentFolderName").value     = settings.parentFolderName;
}

async function saveSettings() {
  const settings = {
    runAfterCreation: document.getElementById("runAfterCreation").checked,
    useLocalFolders:  document.getElementById("useLocalFolders").checked,
    parentFolderName: document.getElementById("parentFolderName").value.trim(),
  };
  await browser.storage.local.set(settings);

  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => { status.textContent = ""; }, 1500);
}

document.getElementById("runAfterCreation").addEventListener("change", saveSettings);
document.getElementById("useLocalFolders").addEventListener("change", saveSettings);
document.getElementById("parentFolderName").addEventListener("change", saveSettings);

loadSettings();
