/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019 */

async function* selectedMessages() {
  let page = await browser.mailTabs.getSelectedMessages();
  if (page.messages.length) {
    yield page.messages;
  }

  while (page.id) {
    page = await browser.messages.continueList(page.id);
    yield page.messages;
  }
}

async function moveSelectedMessages(folder) {
  let ops = [];

  for await (let messages of selectedMessages()) {
    let messageIds = messages.map(message => message.id);
    ops.push(browser.messages.move(messageIds, folder));
  }
  await Promise.all(ops);
}

async function load() {
  let accounts = await browser.accounts.list();
  let folderList = document.getElementById("folderList");

  let folders = accounts.reduce((acc, cur) => {
    return acc.concat(cur.folders);
  }, []);
  folderList.allFolders = folders;

  folderList.addEventListener("ifolder-selected", (event) => {
    moveSelectedMessages(event.detail).then(() => window.close());
  });
}

window.addEventListener("DOMContentLoaded", load, { once: true });
