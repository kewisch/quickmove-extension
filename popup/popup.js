/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019 */

import { AccountNode } from "./foldernode.js";

function setup_localization() {
  for (let node of document.querySelectorAll("[data-l10n-id]")) {
    let l10nid = node.getAttribute("data-l10n-id");
    node.textContent = browser.i18n.getMessage(l10nid);
  }
}

async function load() {
  setup_localization();

  let action = await browser.runtime.sendMessage({ action: "lastBrowserActionCommand" }) || "move";
  document.querySelector(`.action-buttons input[value="${action}"]`).checked = true;

  let accounts = await browser.accounts.list();
  accounts = await browser.quickmove.sortAccounts(accounts);

  let accountNodes = accounts.map(account => new AccountNode(account));
  let folders = accountNodes.reduce((acc, node) => acc.concat([...node]), []);

  let { maxRecentFolders } = await browser.storage.local.get({ maxRecentFolders: 15 });
  let recent = await browser.quickmove.query({ recent: true, limit: maxRecentFolders, canFileMessages: true });

  let folderList = document.getElementById("folderList");
  folderList.accounts = accounts;
  folderList.accountNodes = accountNodes;
  folderList.allFolders = folders;
  folderList.defaultFolders = recent;

  folderList.addEventListener("folder-selected", async (event) => {
    let operation = document.querySelector("input[name='action']:checked").value;

    if (operation == "move" || operation == "copy") {
      // Not waiting for this to complete, it can happen in the background
      browser.runtime.sendMessage({ action: "processSelectedMessages", folder: event.detail, operation: operation });
    } else {
      let [tab, ...rest] = await browser.tabs.query({ currentWindow: true, active: true });
      await browser.mailTabs.update(tab.id, { displayedFolder: event.detail });
    }
    window.close();
  });

  folderList.focusSearch();
}

function keydown(event) {
  if (event.key == "ArrowLeft" || event.key == "ArrowRight") {
    let sequence = ["move", "copy", "goto"];
    let direction = event.key == "ArrowLeft" ? -1 : 1;
    if (getComputedStyle(document.documentElement).direction == "rtl") {
      direction *= -1;
    }

    let checked = document.querySelector(".action-buttons input:checked");
    let length = sequence.length;
    let nextIdx = length + sequence.indexOf(checked.value) + direction;
    let action = sequence[nextIdx % length];
    document.querySelector(`.action-buttons input[value="${action}"]`).checked = true;
  }
}

window.addEventListener("unload", () => {
  browser.runtime.sendMessage({ action: "focusThreadTree" });
});

window.addEventListener("keydown", keydown);
window.addEventListener("DOMContentLoaded", load, { once: true });
