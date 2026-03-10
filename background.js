"use strict";

const SETTING_DEFAULTS = {
  runAfterCreation:  false,
  useLocalFolders:   false,
  parentFolderName:  "",
};

browser.messageDisplayAction.onClicked.addListener(async (tab) => {
  let message;
  try {
    message = await browser.messageDisplay.getDisplayedMessage(tab.id);
  } catch (e) {
    console.error("move-this-email: could not get displayed message", e);
    return;
  }

  if (!message) {
    console.warn("move-this-email: no message is currently displayed");
    return;
  }

  // Parse "Display Name <user@example.com>" or plain "user@example.com"
  const author = (message.author || "").trim();
  let senderName  = "";
  let senderEmail = "";

  const match = author.match(/^"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    senderName  = match[1].trim();
    senderEmail = match[2].trim().toLowerCase();
  } else {
    senderEmail = author.toLowerCase();
    senderName  = senderEmail.split("@")[0];
  }

  if (!senderEmail) {
    console.error("move-this-email: could not parse sender from:", author);
    return;
  }

  if (!senderName) {
    senderName = senderEmail.split("@")[0];
  }

  const accountId = message.folder?.accountId ?? null;
  if (!accountId) {
    console.error("move-this-email: message has no folder/accountId");
    return;
  }

  const settings = await browser.storage.local.get(SETTING_DEFAULTS);

  try {
    const result = await browser.filterCreator.openFilterEditor({
      senderName,
      senderEmail,
      accountId,
      runAfterCreation:  settings.runAfterCreation,
      useLocalFolders:   settings.useLocalFolders,
      parentFolderName:  settings.parentFolderName,
    });

    browser.notifications.create({
      type:    "basic",
      title:   _notificationTitle(result),
      message: _notificationMessage(result, settings),
    });
  } catch (e) {
    console.error("move-this-email: experiment error", e);
    browser.notifications.create({
      type:    "basic",
      title:   "Filter creation failed",
      message: e.message || "An unexpected error occurred.",
    });
  }
});

function _notificationTitle(result) {
  if (result.alreadyExisted) {
    if (result.conditionAdded) {
      return result.filterRun ? "Filter updated and applied" : "Filter updated";
    }
    return result.filterRun ? "Filter applied" : "Filter already up to date";
  }
  return result.filterRun ? "Filter created and applied" : "Filter created";
}

function _notificationMessage(result, settings) {
  const folder = result.folderUri
    ? decodeURIComponent(result.folderUri.split("/").pop())
    : result.filterName;

  if (result.alreadyExisted && result.conditionAdded && result.filterRun) {
    return `Added new display name to filter "${result.filterName}" and ran it on inbox — matching messages moved to "${folder}".`;
  }
  if (result.alreadyExisted && result.conditionAdded) {
    return `Added new display name to filter "${result.filterName}". Enable "Run filter after creation" to apply it to your inbox.`;
  }
  if (result.alreadyExisted && result.filterRun) {
    return `Ran existing filter "${result.filterName}" on inbox — matching messages moved to "${folder}".`;
  }
  if (result.alreadyExisted) {
    return `Filter "${result.filterName}" already covers this sender. Enable "Run filter after creation" to apply it to your inbox.`;
  }
  if (result.filterRun) {
    return `Filter "${result.filterName}" saved and run on inbox — matching messages moved to "${folder}".`;
  }
  return `Filter "${result.filterName}" saved — future mail will be moved to "${folder}".`;
}
