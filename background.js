/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019 */

var lastBrowserActionCommand = null;

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
  let { markAsRead } = browser.storage.local.get({ markAsRead: true });

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
}

browser.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (previousVersion && previousVersion.startsWith("1.")) {
    browser.quickmove.migrateShortcut();
  }
});

browser.commands.onCommand.addListener((name) => {
  lastBrowserActionCommand = name;
  browser.quickmove.openPopup();
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action == "focusThreadTree") {
    let [tab, ...rest] = await browser.tabs.query({ currentWindow: true, active: true });
    browser.quickmove.focusThreadTree(tab.id);
  } else if (message.action == "lastBrowserActionCommand") {
    let command = lastBrowserActionCommand;
    lastBrowserActionCommand = null;
    return command;
  } else if (message.action == "processSelectedMessages") {
    return processSelectedMessages(message.folder, message.operation);
  } else if (message.action == "setupShortcuts") {
    browser.quickmove.migrateShortcut();
  } else {
    console.error("Unexpected message", message);
  }
  return null;
});
