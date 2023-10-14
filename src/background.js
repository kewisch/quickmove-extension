/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

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
    await browser.browserAction.setIcon({ path: "/images/spinner.svg" });
    await browser.messageDisplayAction.setIcon({ path: "/images/spinner.svg" });
    rv = await func(...args);
  } finally {
    gSpinLevel--;

    if (gSpinLevel == 0) {
      await browser.browserAction.setIcon({ path: "/images/addon.svg" });
      await browser.messageDisplayAction.setIcon({ path: "/images/addon.svg" });
    }
  }

  return rv;
}

async function processSelectedMessages(folder, operation="move") {
  let { markAsRead } = await browser.storage.local.get({ markAsRead: true });

  let ops = [];

  let [tab] = await browser.tabs.query({ currentWindow: true, active: true });
  if (!tab) {
    return;
  }

  let messagePages;
  if (tab.type == "messageDisplay") {
    messagePages = [browser.messageDisplay.getDisplayedMessages(tab.id)];
  } else if (tab.type == "mail") {
    messagePages = selectedMessagePages();
  } else {
    console.error("Quickmove acting on unknown tab type: " + tab.type);
    return;
  }

  for await (let messages of messagePages) {
    let ids = messages.map(message => message.id);
    let op = Promise.resolve();
    if (markAsRead) {
      op = op.then(() => Promise.all(ids.map(id => browser.messages.update(id, { read: true }))));
    }
    op = op.then(() => browser.messages[operation](ids, folder));
    ops.push(op);
  }

  await Promise.all(ops);

  await browser.quickmove.setLastMoveCopyFolder(folder, operation == "move");
}
async function applyTags(tag) {
  let { markAsRead } = await browser.storage.local.get({ markAsRead: true });

  let ops = [];

  for await (let messages of selectedMessagePages()) {
    let ids = messages.map(message => message.id);
    ops.push(Promise.all(ids.map(async (id) => {
      let msg = await browser.messages.get(id);
      let tagset = new Set(msg.tags);

      if (tagset.has(tag)) {
        tagset.delete(tag);
      } else {
        tagset.add(tag);
      }

      let data = { tags: [...tagset] };

      if (markAsRead) {
        data.read = true;
      }
      return browser.messages.update(id, data);
    })));
  }

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
  let popupUrl =`/popup/popup.html?action=${name}&allowed=move,copy,goto,tag`;
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
      spinWith(applyTags, message.tag);
    } else {
      spinWith(processSelectedMessages, message.folder, message.operation);
    }
  } else if (message.action == "setupShortcuts") {
    browser.quickmove.setupLegacyShortcuts(message.enable);
  } else {
    console.error("Unexpected message", message);
  }
  return null;
});


browser.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (reason == "update" && previousVersion?.startsWith("1.")) {
    browser.tabs.create({ url: "/onboarding/changes.html" });
  } else if (reason == "update" && previousVersion == "2.0.1") {
    browser.tabs.create({ url: "/onboarding/changes-new-shortcuts.html" });
  } else if (reason == "install") {
    browser.tabs.create({ url: "/onboarding/onboarding.html" });
  }
});
