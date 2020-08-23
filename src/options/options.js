/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2018-2019 */

(async function() {
  let prefs = await browser.storage.local.get({
    markAsRead: true,
    maxRecentFolders: 15,
  });

  for (let [name, value] of Object.entries(prefs)) {
    let node = document.getElementById(name);
    if (!node) {
      continue;
    }

    if (typeof value == "boolean") {
      node.checked = value;
    } else {
      node.value = value;
    }
  }

  for (let node of document.querySelectorAll("[data-l10n-id]")) {
    let l10nid = node.getAttribute("data-l10n-id");
    node.textContent = browser.i18n.getMessage(l10nid);

    // Set the title attribute
    if (node.localName == "label") {
      node = node.parentNode;
    }
    node.title = browser.i18n.getMessage(l10nid + ".title");
  }

  document.body.addEventListener("change", () => {
    browser.storage.local.set({
      maxRecentFolders: parseInt(document.getElementById("maxRecentFolders").value, 10),
      markAsRead: document.getElementById("markAsRead").checked,
    });
  });
})();
