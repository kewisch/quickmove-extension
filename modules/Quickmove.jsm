/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2018 */

ChromeUtils.import("resource://gre/modules/LegacyExtensionsUtils.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/AddonManager.jsm");

this.EXPORTED_SYMBOLS = ["Quickmove"];


var Quickmove = {
  getString: function(aStringName, aParams) {
    let propName = "chrome://quickmove/locale/quickmove.properties";
    try {
        let props = Services.strings.createBundle(propName);

        if (aParams && aParams.length) {
            return props.formatStringFromName(aStringName, aParams, aParams.length);
        } else {
            return props.GetStringFromName(aStringName);
        }
    } catch (ex) {
        let s = `Failed to read ${aStringName} from ${propName}.`;
        Components.utils.reportError(s + " Error: " + ex);
        return s;
    }
  },

  getFullName: function(aFolder) {
    let folder = aFolder;
    let fullPath = [];

    while (folder && folder.parent) {
      fullPath.unshift(folder.prettyName);
      folder = folder.parent;
    }

    return fullPath.join("/");
  },

  /**
   * Clear all items except the menuseparator and the search box
   */
  clearItems: function(popup) {
    while (popup.lastChild.className != "quickmove-separator") {
      popup.removeChild(popup.lastChild);
    }
  },

};

function webExtensionMessageHandler(msg, sender, sendReply) {
  if (msg.action == "get-prefs") {
    sendReply({
      maxRecentFolders: Preferences.get("extensions.quickmove.maxRecentFolders", 15),
      markAsRead: Preferences.get("extensions.quickmove.markAsRead", true)
    });
  } else if (msg.action == "set-prefs") {
    Preferences.set("extensions.quickmove.maxRecentFolders", msg.prefs.maxRecentFolders);
    Preferences.set("extensions.quickmove.markAsRead", msg.prefs.markAsRead);
  }
}

/**
 * WebExtension startup code
 */
(async function() {
  let id = "quickmove@mozilla.kewis.ch";
  let addon = await AddonManager.getAddonByID(id);

  let res = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler)
  let resourceURI = Services.io.newURI(res.resolveURI(Services.io.newURI("resource://quickmove/")));

  let webex = LegacyExtensionsUtils.getEmbeddedExtensionFor({
    id: id,
    version: addon.version,
    resourceURI: resourceURI
  });

  if (webex.started) {
    return;
  }

  let { browser } = await webex.startup(1);

  browser.runtime.onMessage.addListener(webExtensionMessageHandler);
})().catch(Components.utils.reportError.bind(Components.utils));
