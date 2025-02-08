/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

import { RootNode } from "../common/foldernode.js";
import { DEFAULT_PREFERENCES, getValidatedFolders } from "../common/util.js";

async function restoreOptions() {
  let prefs = await browser.storage.local.get(DEFAULT_PREFERENCES);

  for (let key of Object.keys(prefs)) {
    let elem = document.getElementById(key);
    if (!elem) {
      continue;
    }

    if (!elem.type && elem.dataset.type == "radio") {
      let item = document.querySelector(`input[type='radio'][name='${key}'][value='${prefs[key]}']`);
      item.checked = true;
    } else if (elem.type == "checkbox") {
      elem.checked = prefs[key];
    } else {
      elem.value = prefs[key];
    }
  }
}

function changeOptions(event) {
  let node = event.target;
  let defaultPrefs = Object.keys(DEFAULT_PREFERENCES);
  let isPreference = defaultPrefs.includes(node.id) || defaultPrefs.includes(node.name);
  if (!node.id || (node.localName != "select" && node.localName != "input") || !isPreference) {
    return;
  }

  if (node.getAttribute("type") == "checkbox") {
    browser.storage.local.set({ [node.id]: node.checked });
  } else if (node.getAttribute("type") == "number") {
    browser.storage.local.set({ [node.id]: parseInt(node.value, 10) });
  } else if (node.getAttribute("type") == "text" || node.localName == "select") {
    browser.storage.local.set({ [node.id]: node.value });
  } else if (node.getAttribute("type") == "radio") {
    browser.storage.local.set({ [node.name]: node.value });
  }

  if (node.id == "useLegacyShortcuts") {
    browser.runtime.sendMessage({ action: "setupShortcuts", enable: node.checked });
  }
}

async function setupListeners() {
  let { skipArchive } = await browser.storage.local.get({ skipArchive: DEFAULT_PREFERENCES.skipArchive });
  let accounts = await browser.accounts.list(true);
  let rootNode = new RootNode({ accounts, skipArchive });

  let fontSize = await messenger.quickmove.getUIFontSize();
  window.document.documentElement.style.setProperty("font-size", `${fontSize}px`);

  document.body.addEventListener("change", changeOptions);

  document.getElementById("onboarding").addEventListener("click", () => {
    browser.tabs.create({ url: "/onboarding/onboarding.html" });
  });

  if (browser.commands.openShortcutSettings) {
    // TB136 COMPAT
    document.getElementById("shortcuts").addEventListener("click", () => {
      browser.commands.openShortcutSettings();
    });
  } else {
    document.getElementById("shortcuts").style.display = "none";
  }

  document.getElementById("translate").addEventListener("click", () => {
    browser.windows.openDefaultBrowser("https://hosted.weblate.org/engage/quick-folder-move/");
  });

  await setupFolderChooser({
    rootNode,
    folderPickerId: "default-folder-picker",
    folderListId: "default-folders",
    prefName: "defaultFolders"
  });
  await setupFolderChooser({
    rootNode,
    folderPickerId: "excluded-folder-picker",
    folderListId: "excluded-folders",
    prefName: "excludedFolders"
  });

  document.getElementById("skipArchive").addEventListener("change", async (event) => {
    rootNode.skipArchive = event.target.checked;
    rootNode.reindex();
  });

  document.getElementById("defaultFolderSetting").addEventListener("change", (event) => {
    document.querySelector(".panel.selected")?.classList.remove("selected");
    document.querySelector(`.panel[data-value="${event.target.value}"]`).classList.add("selected");
  });

  let currentValue = document.querySelector("#defaultFolderSetting input:checked")?.value;
  if (currentValue) {
    document.querySelector(`.panel[data-value="${currentValue}"]`).classList.add("selected");
  }
}

function setupLocalization() {
  for (let node of document.querySelectorAll("[data-l10n-id]")) {
    let l10nId = node.getAttribute("data-l10n-id");
    node.textContent = browser.i18n.getMessage(l10nId);
  }
  for (let node of document.querySelectorAll("[data-l10n-attr-placeholder]")) {
    let l10nId = node.getAttribute("data-l10n-attr-placeholder");
    node.setAttribute("placeholder", browser.i18n.getMessage(l10nId));
  }
  for (let node of document.querySelectorAll("[data-l10n-attr-title]")) {
    let l10nId = node.getAttribute("data-l10n-attr-title");
    node.setAttribute("title", browser.i18n.getMessage(l10nId));
  }
}

async function setupFolderChooser({ rootNode, folderPickerId, folderListId, prefName }) {
  let folderPicker = document.getElementById(folderPickerId);
  folderPicker.initItems(rootNode.folderNodes, []);

  let folders = await getValidatedFolders(rootNode, prefName);
  let folderSet = new Set(folders);

  let folderList = document.getElementById(folderListId);
  folderList.initItems(folders, null, true);

  let { partialMatchFullPath } = await browser.storage.local.get({ partialMatchFullPath: DEFAULT_PREFERENCES.partialMatchFullPath });

  folderPicker.addEventListener("item-selected", (event) => {
    let newNode = rootNode.findFolder(event.detail.folder);

    folderSet.add(newNode);
    let allItems = [...folderSet];

    folderList.allItems = allItems;
    folderList.partialMatchFullPath = partialMatchFullPath;
    folderList.repopulate();
    folderPicker.searchValue = "";

    let storageData = allItems.map(item => ({ accountId: item.accountId, path: item.path }));
    browser.storage.local.set({ [prefName]: storageData });
  });

  folderList.addEventListener("item-deleted", (event) => {
    let oldNode = rootNode.findFolder(event.detail);

    folderSet.delete(oldNode);
    let allItems = [...folderSet];

    folderList.allItems = allItems;
    folderList.partialMatchFullPath = partialMatchFullPath;
    folderList.repopulate();

    let storageData = allItems.map(item => ({ accountId: item.accountId, path: item.path }));
    browser.storage.local.set({ [prefName]: storageData });
  });
}

document.addEventListener("DOMContentLoaded", setupLocalization, { once: true });
document.addEventListener("DOMContentLoaded", setupListeners, { once: true });
document.addEventListener("DOMContentLoaded", restoreOptions, { once: true });
