/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

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

async function processSelectedMessages(folder, operation="move") {
  let { markAsRead } = await browser.storage.local.get({ markAsRead: true });

  let ops = [];

  for await (let messages of selectedMessagePages()) {
    let ids = messages.map(message => message.id);
    let op = Promise.resolve();
    if (markAsRead) {
      op = op.then(() => Promise.all(ids.map(id => browser.messages.update(id, { read: true }))));
    }
    op = op.then(() => browser.messages[operation](ids, folder));
    ops.push(op);
  }

  await Promise.all(ops);

  await browser.quickmove.setLastMoveCopyFolder(folder);
}

browser.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (previousVersion && previousVersion.startsWith("1.")) {
    browser.quickmove.migrateShortcut();
  }
});

browser.commands.onCommand.addListener(async (name) => {
  let mailTab = await browser.mailTabs.getCurrent();
  let displayedMessages = await browser.messageDisplay.getDisplayedMessages(mailTab.id);
  if (name == "goto" || !mailTab?.messagePaneVisible || displayedMessages.length > 1) {
    browser.browserAction.setPopup({ popup: `/popup/popup.html?action=${name}&allowed=move,copy,goto` });
    browser.browserAction.openPopup();
    browser.browserAction.setPopup({ popup: "/popup/popup.html?action=move&allowed=move,copy,goto" });
  } else {
    browser.messageDisplayAction.setPopup({ popup: `/popup/popup.html?action=${name}&allowed=move,copy` });
    browser.messageDisplayAction.openPopup();
    browser.messageDisplayAction.setPopup({ popup: "/popup/popup.html?action=move&allowed=move,copy" });
  }
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action == "focusThreadPane") {
    return browser.quickmove.focusThreadPane();
  } else if (message.action == "processSelectedMessages") {
    return processSelectedMessages(message.folder, message.operation);
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
  } else if (reason == "install") {
    browser.tabs.create({ url: "/onboarding/onboarding.html" });
  }
});
