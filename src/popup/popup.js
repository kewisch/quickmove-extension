/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

import { AccountNode, FolderNode } from "../common/foldernode.js";
import { getValidatedDefaultFolders } from "../common/util.js";

const ALL_ACTIONS = ["move", "copy", "goto", "tag"];

function setup_localization() {
  for (let node of document.querySelectorAll("[data-l10n-id]")) {
    let l10nid = node.getAttribute("data-l10n-id");
    node.textContent = browser.i18n.getMessage(l10nid);
  }
}

function switchList(action) {
  let folderList = document.getElementById("folder-list");
  let tagList = document.getElementById("tag-list");

  if (action == "tag") {
    tagList.style.display = "revert-layer";
    folderList.style.display = "none";
    return tagList;
  } else {
    folderList.style.display = "revert-layer";
    tagList.style.display = "none";
    return folderList;
  }
}

async function load() {
  let fontSize = await messenger.quickmove.getUIFontSize();
  window.document.documentElement.style.setProperty("font-size", `${fontSize}px`);

  // TB120 COMPAT
  let majorVersion = parseInt((await browser.runtime.getBrowserInfo()).version.split(".")[0], 10);

  let { maxRecentFolders, showFolderPath, skipArchive, layout, defaultFolderSetting, migratedShiftArrow } = await browser.storage.local.get({ maxRecentFolders: 15, showFolderPath: true, layout: "auto", skipArchive: true, defaultFolderSetting: "recent", migratedShiftArrow: false });

  if (layout == "wide" || (layout == "auto" && window.outerWidth > 1400)) {
    document.documentElement.removeAttribute("compact");
    document.getElementById("folder-list").removeAttribute("compact");
    document.getElementById("tag-list").removeAttribute("compact");
  }
  document.body.style.display = "revert-layer";

  setup_localization();

  let params = new URLSearchParams(window.location.search);

  let action = params.get("action") || "move";
  document.querySelector(`.action-buttons input[value="${action}"]`).checked = true;

  let actions = new Set(ALL_ACTIONS);

  for (let allowedAction of (params.get("allowed") || "move,copy,goto,tag").split(",")) {
    actions.delete(allowedAction);
  }

  for (let hideaction of actions.values()) {
    document.querySelector(`label[for='action-${hideaction}']`).remove();
    document.querySelector(`#action-${hideaction}`).remove();
  }

  if (ALL_ACTIONS.length - actions.size == 1) {
    document.querySelector(".action-buttons").classList.add("hide");
  }


  // Setup folder list
  let accounts = await browser.accounts.list();

  let [currentTab] = await browser.tabs.query({ currentWindow: true, active: true });
  let currentAccountId, currentFolderPath;

  if (currentTab?.type == "messageDisplay") {
    let currentMessage = await browser.messageDisplay.getDisplayedMessage(currentTab.id);
    currentAccountId = currentMessage?.folder.accountId;
    currentFolderPath = currentMessage?.folder.path;
  } else if (currentTab?.type == "mail") {
    let currentMailTab = await browser.mailTabs.getCurrent();
    currentAccountId = currentMailTab?.displayedFolder?.accountId;
    currentFolderPath = currentMailTab?.displayedFolder?.path;
  }

  if (currentAccountId) {
    let currentAccountIndex = accounts.findIndex(account => account.id === currentAccountId);
    if (currentAccountIndex >= 0) {
      accounts.unshift(...accounts.splice(currentAccountIndex, 1));
    }
  }

  let exclude = currentFolderPath ? [currentFolderPath] : [];

  let accountNodes = accounts.map(account => new AccountNode(account, skipArchive, exclude));
  let folders = accountNodes.reduce((acc, node) => acc.concat([...node]), []);
  let defaultFolders;

  if (defaultFolderSetting == "recent") {
    let folderList;
    if (majorVersion < 121) {
      // TB120 COMPAT
      folderList = await browser.quickmove.query({ recent: true, limit: maxRecentFolders, canFileMessages: true });
    } else {
      folderList = await browser.folders.query({ recent: true, limit: maxRecentFolders, canAddMessages: true });
    }
    defaultFolders = FolderNode.fromList(folderList, accountNodes);
  } else if (defaultFolderSetting == "specific") {
    defaultFolders = FolderNode.fromList(await getValidatedDefaultFolders(accountNodes), accountNodes);
  } else {
    defaultFolders = null;
  }

  let folderList = document.getElementById("folder-list");
  folderList.accounts = accounts;
  folderList.initItems(folders, defaultFolders, showFolderPath);
  folderList.ignoreFocus = true;
  folderList.addEventListener("item-selected", async (event) => {
    let operation = document.querySelector("input[name='action']:checked").value;

    if (operation == "move" || operation == "copy") {
      await browser.runtime.sendMessage({ action: "processSelectedMessages", folder: event.detail, operation: operation });
    } else if (operation == "goto") {
      let [tab] = await browser.tabs.query({ currentWindow: true, active: true });

      // TB120 COMPAT
      let folderId = majorVersion < 121 ? event.detail : event.detail.id;
      await browser.mailTabs.update(tab.id, { displayedFolder: folderId });
    }
    window.close();
  });

  // Setup tag list
  // TB120 COMPAT
  let tags;
  if (majorVersion < 121) {
    tags = await browser.messages.listTags();
  } else {
    tags = await browser.messages.tags.list();
  }

  let tagList = document.getElementById("tag-list");
  tagList.ignoreFocus = true;
  tagList.initItems(tags, null);
  tagList.addEventListener("item-selected", async (event) => {
    await browser.runtime.sendMessage({ action: "processSelectedMessages", tag: event.detail.key, operation: "tag" });
    window.close();
  });

  document.querySelector(".action-buttons").addEventListener("click", (event) => {
    switchList(event.target.value).focusSearch();
  });

  if (migratedShiftArrow) {
    document.querySelector("#meta-action-warning").classList.add("migrated");
  } else {
    document.querySelector("#meta-action-warning .close").addEventListener("click", (event) => {
      browser.storage.local.set({ migratedShiftArrow: true });
      document.querySelector("#meta-action-warning").classList.add("migrated", "hidden");
    });
  }

  document.body.addEventListener("mousemove", () => {
    folderList.ignoreFocus = false;
    tagList.ignoreFocus = false;
  }, { once: true });

  if (params.get("window") == "true") {
    browser.windows.update(browser.windows.WINDOW_ID_CURRENT, { width: document.body.clientWidth });
    document.getElementById("window-warning").classList.remove("hidden");
  }

  switchList(action).focusSearch();
}

function unload(event) {
  browser.runtime.sendMessage({ action: "focusThreadPane" }).catch(() => {});
}

function cmdOrCtrlKey(event) {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  return isMac ? event.metaKey : event.ctrlKey;
}

function keydown(event) {
  if (event.key == "Escape") {
    window.close();
  } else if (event.key == "ArrowLeft" || event.key == "ArrowRight") {
    let direction = event.key == "ArrowLeft" ? -1 : 1;
    if (!cmdOrCtrlKey(event)) {
      let metaActionWarning = document.getElementById("meta-action-warning");
      if (!event.shiftKey && !metaActionWarning.classList.contains("migrated")) {
        metaActionWarning.classList.remove("hidden");
      }
      return;
    }
    document.getElementById("meta-action-warning").classList.add("hidden");

    event.preventDefault();
    event.stopPropagation();

    let params = new URLSearchParams(window.location.search);
    let sequence = (params.get("allowed") || "move,copy").split(",");
    if (getComputedStyle(document.documentElement).direction == "rtl") {
      direction *= -1;
    }

    let checked = document.querySelector(".action-buttons input:checked");
    let nextIdx = sequence.indexOf(checked.value) + direction;
    let action = sequence[Math.max(0, Math.min(nextIdx, sequence.length - 1))];
    document.querySelector(`.action-buttons input[value="${action}"]`).checked = true;

    let currentList = event.target;
    let targetList = switchList(action);

    if (currentList != targetList || event.originalTarget == currentList.search) {
      targetList.focusSearch();
    }
  }
}

function keypress(event) {
  if (!event.originalTarget.classList.contains("search-input")) {
    event.preventDefault();
  }
}

window.addEventListener("keypress", keypress);
window.addEventListener("keydown", keydown, { capture: true });
window.addEventListener("DOMContentLoaded", load, { once: true });
window.addEventListener("unload", unload, { once: true, capture: true });
