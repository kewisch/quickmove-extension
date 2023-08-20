/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

import { AccountNode } from "./foldernode.js";

const ALL_ACTIONS = ["move", "copy", "goto"];

function setup_localization() {
  for (let node of document.querySelectorAll("[data-l10n-id]")) {
    let l10nid = node.getAttribute("data-l10n-id");
    node.textContent = browser.i18n.getMessage(l10nid);
  }
}

async function load() {
  let { maxRecentFolders, showFolderPath, layout } = await browser.storage.local.get({ maxRecentFolders: 15, showFolderPath: true, layout: "auto" });

  if (layout == "wide" || (layout == "auto" && window.outerWidth > 1400)) {
    document.documentElement.removeAttribute("compact");
    document.getElementById("folder-list").removeAttribute("compact");
  }
  document.body.style.display = "block";

  setup_localization();

  let params = new URLSearchParams(window.location.search);


  let action = params.get("action") || "move";
  document.querySelector(`.action-buttons input[value="${action}"]`).checked = true;

  let actions = new Set(ALL_ACTIONS);

  for (let allowedAction of (params.get("allowed") || "move,copy").split(",")) {
    actions.delete(allowedAction);
  }

  for (let hideaction of actions.values()) {
    document.querySelector(`label[for='action-${hideaction}']`).remove();
    document.querySelector(`#action-${hideaction}`).remove();
  }

  if (ALL_ACTIONS.length - actions.size == 1) {
    document.querySelector(".action-buttons").classList.add("hide");
  }

  let accounts = await browser.accounts.list();
  let accountNodes = accounts.map(account => new AccountNode(account));
  let folders = accountNodes.reduce((acc, node) => acc.concat([...node]), []);

  let recent = await browser.quickmove.query({ recent: true, limit: maxRecentFolders, canFileMessages: true });

  let folderList = document.getElementById("folder-list");
  folderList.accounts = accounts;
  folderList.accountNodes = accountNodes;
  folderList.allFolders = folders;
  folderList.defaultFolders = recent;
  folderList.showFolderPath = showFolderPath;
  folderList.ignoreFocus = true;

  folderList.addEventListener("folder-selected", async (event) => {
    let operation = document.querySelector("input[name='action']:checked").value;

    if (operation == "move" || operation == "copy") {
      await browser.runtime.sendMessage({ action: "processSelectedMessages", folder: event.detail, operation: operation });
    } else {
      let [tab, ...rest] = await browser.tabs.query({ currentWindow: true, active: true });
      await browser.mailTabs.update(tab.id, { displayedFolder: event.detail });
    }
    window.close();
  });

  folderList.focusSearch();

  document.querySelector(".action-buttons").addEventListener("click", () => {
    folderList.focusSearch();
  });

  document.body.addEventListener("mousemove", () => {
    folderList.ignoreFocus = false;
  }, { once: true });
}

function unload(event) {
  browser.runtime.sendMessage({ action: "focusThreadPane" }).catch(() => {});
}

function keydown(event) {
  if (event.key == "Escape") {
    window.close();
  } else if (event.key == "ArrowLeft" || event.key == "ArrowRight") {
    let sequence = ["move", "copy", "goto"];
    let direction = event.key == "ArrowLeft" ? -1 : 1;
    if (getComputedStyle(document.documentElement).direction == "rtl") {
      direction *= -1;
    }

    let checked = document.querySelector(".action-buttons input:checked");
    let nextIdx = sequence.indexOf(checked.value) + direction;
    let action = sequence[Math.max(0, Math.min(nextIdx, sequence.length - 1))];
    document.querySelector(`.action-buttons input[value="${action}"]`).checked = true;
  }
}

window.addEventListener("keydown", keydown);
window.addEventListener("DOMContentLoaded", load, { once: true });
window.addEventListener("unload", unload, { once: true, capture: true });
