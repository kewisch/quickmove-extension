/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

import { DEFAULT_PREFERENCES, showNotification, prettyDestination } from "./common/util.js";

const DEFAULT_ACTION_URL = "/popup/popup.html?action=move&allowed=move,copy,goto,tag";

// Manifest v3: this needs to go into state memory or be queried for
let gLastWindowId = null;
let gSpinLevel = 0;

async function* selectedMessagePages() {
  let page = await browser.mailTabs.getSelectedMessages();
  if (page.messages.length) {
    yield page.messages;
  }

  while (page.id) {
    page = await browser.messages.continueList(page.id);
    yield page.messages;
  }
}


async function spinWith(func, ...args) {
  let rv;
  try {
    gSpinLevel++;
    browser.browserAction.setIcon({ path: "/images/spinner.svg" });
    browser.messageDisplayAction.setIcon({ path: "/images/spinner.svg" });
    rv = await func(...args);
  } finally {
    gSpinLevel--;

    if (gSpinLevel == 0) {
      browser.browserAction.setIcon({ path: "/images/addon.svg" });
      browser.messageDisplayAction.setIcon({ path: "/images/addon.svg" });
    }
  }

  return rv;
}

async function processSelectedMessages(folder, operation = "move", goToFolder = false) {
  let { markAsRead, notificationActive, operationCounters } = await browser.storage.local.get({ markAsRead: DEFAULT_PREFERENCES.markAsRead, notificationActive: DEFAULT_PREFERENCES.notificationActive, operationCounters: DEFAULT_PREFERENCES.operationCounters });

  let ops = [];

  let [tab] = await browser.tabs.query({ currentWindow: true, active: true });
  if (!tab) {
    return;
  }

  let folderId = folder.id;
  let messagePages;
  let numMessages = 0;
  if (tab.type == "messageDisplay") {
    messagePages = [browser.messageDisplay.getDisplayedMessages(tab.id)];
  } else if (tab.type == "mail") {
    messagePages = selectedMessagePages();
  } else {
    console.error("Quickmove acting on unknown tab type: " + tab.type);
    return;
  }

  let browserInfo = await browser.runtime.getBrowserInfo();
  let majorVersion = parseInt(browserInfo.version.split(".")[0], 10);

  for await (let messages of messagePages) {
    let ids = messages.map(message => message.id);
    numMessages += messages.length;
    operationCounters[operation] += messages.length;
    let op = Promise.resolve();
    if (markAsRead) {
      op = op.then(() => Promise.all(ids.map(id => browser.messages.update(id, { read: true }))));
    }

    if (majorVersion < 137) {
      // TB136 COMPAT
      op = op.then(() => browser.messages[operation](ids, folderId));
    } else {
      op = op.then(() => browser.messages[operation](ids, folderId, { isUserAction: true }));
    }
    ops.push(op);
  }

  await browser.storage.local.set({ operationCounters });
  await Promise.all(ops);

  if (majorVersion < 137) {
    // TB136 COMPAT
    await browser.quickmove.setLastMoveCopyFolder(folder, operation == "move");
  }

  if (goToFolder) {
    await browser.mailTabs.update(tab.id, { displayedFolder: folderId }).catch(() => {});
  }

  if (operation != "goto" && notificationActive) {
    showNotification(operation, numMessages, await prettyDestination(folderId));
  }
}
async function applyTags(tag, name) {
  let { markAsRead, notificationActive, operationCounters } = await browser.storage.local.get({ markAsRead: DEFAULT_PREFERENCES.markAsRead, notificationActive: DEFAULT_PREFERENCES.notificationActive, operationCounters: DEFAULT_PREFERENCES.operationCounters });
  let ops = [];
  let numMessages = 0;

  for await (let messages of selectedMessagePages()) {
    let ids = messages.map(message => message.id);
    numMessages += messages.length;
    operationCounters.tag += messages.length;
    ops.push(Promise.all(ids.map(async (id) => {
      let msg = await browser.messages.get(id);
      let tagset = new Set(msg.tags);
      let operation = "tag";

      if (tagset.has(tag)) {
        tagset.delete(tag);
        operation = "tag.remove";
      } else {
        tagset.add(tag);
      }

      let data = { tags: [...tagset] };

      if (markAsRead) {
        data.read = true;
      }
      if (notificationActive) {
        showNotification(operation, numMessages, name);
      }

      return browser.messages.update(id, data);
    })));
  }

  await browser.storage.local.set({ operationCounters });
  await Promise.all(ops);
}

async function updateSpecificFolders(origFolder, newFolder) {
  let { defaultFolders } = await browser.storage.local.get({ defaultFolders: [] });

  let foundFolder = defaultFolders.find((folder) => {
    return folder.accountId == origFolder.accountId && folder.path == origFolder.path;
  });

  if (foundFolder) {
    foundFolder.accountId = newFolder.accountId;
    foundFolder.path = newFolder.path;
    await browser.storage.local.set({ defaultFolders });
  }
}

browser.folders.onRenamed.addListener(updateSpecificFolders);
browser.folders.onMoved.addListener(updateSpecificFolders);

browser.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (previousVersion && previousVersion.startsWith("1.")) {
    browser.quickmove.migrateShortcut();
  }
});

browser.commands.onCommand.addListener(async (name) => {
  let popupOrder = [browser.messageDisplayAction, browser.browserAction];
  let popupUrl = `/popup/popup.html?action=${name}&allowed=move,copy,goto,tag`;
  if (name == "goto") {
    popupOrder = popupOrder.reverse();
  }

  let success = false;
  for (let action of popupOrder) {
    action.setPopup({ popup: popupUrl });
    success = await action.openPopup();
    action.setPopup({ popup: DEFAULT_ACTION_URL });

    if (success) {
      break;
    }
  }

  if (!success) {
    if (gLastWindowId) {
      await browser.windows.remove(gLastWindowId);
      gLastWindowId = null;
    }

    let wnd = await browser.windows.create({ allowScriptsToClose: true, type: "popup", url: popupUrl + "&window=true" });
    gLastWindowId = wnd.id;
  }
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action == "focusThreadPane") {
    return browser.quickmove.focusThreadPane();
  } else if (message.action == "processSelectedMessages") {
    if (message.operation == "tag") {
      spinWith(applyTags, message.tag, message.tagName);
    } else {
      spinWith(processSelectedMessages, message.folder, message.operation, message.goToFolder);
    }
  } else if (message.action == "setupShortcuts") {
    browser.quickmove.setupLegacyShortcuts(message.enable);
  } else {
    console.error("Unexpected message", message);
  }
  return null;
});


browser.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (reason == "update" && previousVersion == "2.0.1") {
    browser.tabs.create({ url: "/onboarding/changes-new-shortcuts.html" });
  } else if (reason == "update" && previousVersion?.startsWith("2.")) {
    browser.tabs.create({ url: "/onboarding/changes-3.0.html" });
  } else if (reason == "update" && previousVersion?.startsWith("1.")) {
    browser.tabs.create({ url: "/onboarding/changes.html" });
  } else if (reason == "install") {
    browser.tabs.create({ url: "/onboarding/onboarding.html" });
  }
});
