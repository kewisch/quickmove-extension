/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

async function load() {
  let legacyShortcutsForm = document.getElementById("legacy-shortcuts-form");
  if (legacyShortcutsForm) {
    legacyShortcutsForm.addEventListener("change", (event) => {
      browser.runtime.sendMessage({ action: "setupShortcuts", enable: (event.target.value == "legacy") });
    });
  }

  let openShortcuts = document.getElementById("openShortcuts");
  if (openShortcuts && browser.commands.openShortcutSettings) {
    // TB136 COMPAT
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1946978
    // Don't forget to remove the link in the html files
    openShortcuts.addEventListener("click", (event) => {
      browser.commands.openShortcutSettings();
      event.preventDefault();
    });
  }

  let openOptions = document.getElementById("openOptions");
  if (openOptions) {
    openOptions.addEventListener("click", (event) => {
      browser.runtime.openOptionsPage();
      event.preventDefault();
    });
  }

  if (navigator.platform.includes("Mac")) {
    document.body.classList.add("platform-mac");
  } else {
    document.body.classList.add("platform-default");
  }

  let shortcutList = document.getElementById("shortcut-list");

  if (shortcutList) {
    let translateShortcut = (shortcut) => {
      return platform.os == "mac"
        ? shortcut?.replace("MacCtrl", "Control").replace("Ctrl", "Control").replace("Cmd", "Command").replace("Alt", "Option")
        : shortcut;
    };

    let commands = await browser.commands.getAll();
    let platform = await browser.runtime.getPlatformInfo();
    for (let command of commands) {
      let item = shortcutList.appendChild(document.createElement("li"));
      let shortcutText = item.appendChild(document.createElement("b"));
      shortcutText.textContent = translateShortcut(command.shortcut) || "No shortcut assigned";
      item.appendChild(document.createTextNode(`: ${command.description}`));
    }
  }
}

window.addEventListener("DOMContentLoaded", load, { once: true });
