/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019-2020 */

const { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const { ExtensionAPI } = ExtensionCommon;

const { ExtensionSupport } = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");

function initScript(window, document) {
  Services.scriptloader.loadSubScript("chrome://quickmove/content/quickmove.js", window);
  window.quickmove.cleanup.push(() => {
    delete window.quickmove;
  });
}

function initCSS(window, document) {
  let link = document.createElement("link");

  link.setAttribute("id", "quickmove-styles");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("type", "text/css");
  link.setAttribute("href", "chrome://quickmove/content/quickmove.css");

  document.documentElement.appendChild(link);
  window.quickmove.cleanup.push(() => {
    document.getElementById("quickmove-styles").remove();
  });
}

function initKeys(window, document) {
  document.getElementById("mainPopupSet").appendChild(
    window.MozXULElement.parseXULToFragment(`
      <menupopup id="quickmove-menupopup"
             ignorekeys="true"
             onpopupshowing="quickmove.popupshowing(event)"
             onpopupshown="quickmove.popupshown(event)"
             onpopuphidden="quickmove.hide(event.target)"
             oncommand="quickmove.command(event, quickmove.executeMove)">
        <html:input class="quickmove-textbox"
                    onfocus="quickmove.focus(event)"
                    onkeypress="quickmove.keypress(event, quickmove.executeMove)"
                    oninput="quickmove.searchDelayed(event.target); event.stopPropagation();"/>
        <menuseparator class="quickmove-separator"/>
      </menupopup>
      <menupopup id="quickmove-goto-menupopup"
                 ignorekeys="true"
                 onpopupshowing="quickmove.popupshowing(event)"
                 onpopupshown="quickmove.popupshown(event)"
                 onpopuphidden="quickmove.hide(event.target)"
                 oncommand="quickmove.command(event, quickmove.executeGoto)">
        <html:input class="quickmove-textbox"
                    onfocus="quickmove.focus(event)"
                    onkeypress="quickmove.keypress(event, quickmove.executeGoto)"
                    oninput="quickmove.searchDelayed(event.target); event.stopPropagation();"/>
        <menuseparator id="quickmove-goto-separator" class="quickmove-separator"/>
      </menupopup>
      <menupopup id="quickmove-copy-menupopup"
                 ignorekeys="true"
                 onpopupshowing="quickmove.popupshowing(event)"
                 onpopupshown="quickmove.popupshown(event)"
                 onpopuphidden="quickmove.hide(event.target)"
                 oncommand="quickmove.command(event, quickmove.executeCopy)">
        <html:input class="quickmove-textbox"
                    onfocus="quickmove.focus(event)"
                    onkeypress="quickmove.keypress(event, quickmove.executeCopy)"
                    oninput="quickmove.searchDelayed(event.target); event.stopPropagation();"/>
        <menuseparator id="quickmove-copy-separator" class="quickmove-separator"/>
      </menupopup>
    `)
  );

  document.getElementById("mailKeys").appendChild(
    window.MozXULElement.parseXULToFragment(`
      <keyset id="quickmove-keyset">
        <key id="quickmove-file" key="M" modifiers="shift" oncommand="quickmove.openFile()"/>
        <key id="quickmove-goto" key="G" modifiers="shift" oncommand="quickmove.openGoto()"/>
        <key id="quickmove-copy" key="Y" modifiers="shift" oncommand="quickmove.openCopy()"/>
      </keyset>
    `)
  );

  window.quickmove.cleanup.push(() => {
    document.getElementById("quickmove-keyset").remove();
    document.getElementById("quickmove-menupopup").remove();
    document.getElementById("quickmove-copy-menupopup").remove();
    document.getElementById("quickmove-goto-menupopup").remove();
  });
}

function initButtonFile(window, document) {
  let buttonFile =
    document.getElementById("button-file") ||
    document.getElementById("mail-toolbox").palette.querySelector("#button-file");

  let buttonFilePopup = window.MozXULElement.parseXULToFragment(`
    <menupopup id="quickmove-filebutton-menupopup"
               ignorekeys="true"
               onpopupshowing="quickmove.popupshowing(event)"
               onpopupshown="quickmove.popupshown(event)"
               onpopuphidden="quickmove.hide(event.target)">
      <html:input class="quickmove-textbox"
                  onfocus="quickmove.focus(event)"
                  onkeypress="quickmove.keypress(event, quickmove.executeMove)"
                  oninput="quickmove.searchDelayed(event.target); event.stopPropagation();"/>
      <menuseparator id="quickmove-filebutton-separator" class="quickmove-separator"/>
    </menupopup>
  `);

  let menupopup = buttonFile.querySelector("#button-filePopup") || buttonFile.children[0];
  buttonFilePopup.oldPopup = buttonFile.replaceChild(buttonFilePopup, menupopup);

  window.quickmove.cleanup.push(() => {
    buttonFile =
      document.getElementById("button-file") ||
      document.getElementById("mail-toolbox").palette.querySelector("#button-file");

    let popup = buttonFile.querySelector("#quickmove-filebutton-menupopup");
    popup.parentNode.replaceChild(popup.oldPopup, popup);
  });
}

function initContextMenus(window, document) {
  let moveMenu = document.getElementById("mailContext-moveMenu");
  let quickMoveFileHere = window.MozXULElement.parseXULToFragment(`
    <menupopup id="quickmove-context-menupopup"
               ignorekeys="true"
               onpopupshowing="quickmove.popupshowing(event)"
               onpopupshown="quickmove.popupshown(event)"
               onpopuphidden="quickmove.hide(event.target)"
               oncommand="quickmove.command(event, quickmove.executeMove, true)">
      <html:input class="quickmove-textbox"
                  onfocus="quickmove.focus(event)"
                  onkeypress="quickmove.keypress(event, quickmove.executeMove)"
                  oninput="quickmove.searchDelayed(event.target); event.stopPropagation();"/>
      <menuseparator class="quickmove-separator"/>
    </menupopup>
  `);

  let oldMovePopup = moveMenu.replaceChild(quickMoveFileHere, moveMenu.menupopup);

  let copyMenu = document.getElementById("mailContext-copyMenu");
  let quickMoveCopyHere = window.MozXULElement.parseXULToFragment(`
    <menupopup id="quickmove-context-copy-menupopup"
               ignorekeys="true"
               onpopupshowing="quickmove.popupshowing(event)"
               onpopupshown="quickmove.popupshown(event)"
               onpopuphidden="quickmove.hide(event.target)"
               oncommand="quickmove.command(event, quickmove.executeCopy, true)">
      <html:input class="quickmove-textbox"
                  onfocus="quickmove.focus(event)"
                  onkeypress="quickmove.keypress(event, quickmove.executeCopy)"
                  oninput="quickmove.searchDelayed(event.target); event.stopPropagation();"/>
      <menuseparator class="quickmove-separator"/>
    </menupopup>
  `);

  let oldCopyPopup = copyMenu.replaceChild(quickMoveCopyHere, copyMenu.menupopup);

  window.quickmove.cleanup.push(() => {
    quickMoveFileHere = document.getElementById("quickmove-context-menupopup");
    quickMoveFileHere.parentNode.replaceChild(oldMovePopup, quickMoveFileHere);

    quickMoveCopyHere = document.getElementById("quickmove-context-copy-menupopup");
    quickMoveCopyHere.parentNode.replaceChild(oldCopyPopup, quickMoveCopyHere);
  });
}

function initFolderLocation(window, document) {
  let quickmoveLocationPopup = window.MozXULElement.parseXULToFragment(`
    <menupopup id="quickmove-folderlocation-menupopup"
               ignorekeys="true"
               onpopupshowing="quickmove.popupshowing(event)"
               onpopupshown="quickmove.popupshown(event)"
               onpopuphidden="quickmove.hide(event.target)"
               oncommand="quickmove.command(event, quickmove.executeGoto)">
      <html:input class="quickmove-textbox"
                  onfocus="quickmove.focus(event)"
                  onkeypress="quickmove.keypress(event, quickmove.executeGoto)"
                  oninput="quickmove.searchDelayed(event.target); event.stopPropagation();"/>
      <menuseparator id="quickmove-location-separator" class="quickmove-separator"/>
    </menupopup>
  `);

  let palette = document.getElementById("mail-toolbox").palette;

  let folderLocationPopup =
    document.getElementById("folderLocationPopup") || palette.querySelector("#folderLocationPopup");
  folderLocationPopup.setAttribute("hidden", "true");

  let locationFolders =
    document.getElementById("locationFolders") || palette.querySelector("#locationFolders");
  locationFolders.appendChild(quickmoveLocationPopup);

  window.quickmove.cleanup.push(() => {
    folderLocationPopup =
      document.getElementById("folderLocationPopup") ||
      palette.querySelector("#folderLocationPopup");
    folderLocationPopup.removeAttribute("hidden");

    quickmoveLocationPopup =
      document.getElementById("quickmove-folderlocation-menupopup") ||
      palette.querySelector("#quickmove-folderlocation-menupopup");
    quickmoveLocationPopup.remove();
  });
}

this.quickmove = class extends ExtensionAPI {
  onStartup() {
    let aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(
      Ci.amIAddonManagerStartup
    );
    let manifestURI = Services.io.newURI("manifest.json", null, this.extension.rootURI);

    this.chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "quickmove", "content/"],
    ]);

    ExtensionSupport.registerWindowListener("quickmove", {
      chromeURLs: [
        "chrome://messenger/content/messageWindow.xhtml",
        "chrome://messenger/content/messenger.xhtml",
      ],
      onLoadWindow: async function(window) {
        let document = window.document;

        initScript(window, document);
        initCSS(window, document);
        initKeys(window, document);

        initButtonFile(window, document);
        initContextMenus(window, document);

        if (window.location.href.startsWith("chrome://messenger/content/messageWindow.")) {
          document.getElementById("quickmove-goto").remove();
        } else if (window.location.href.startsWith("chrome://messenger/content/messenger.")) {
          initFolderLocation(window, document);
        }
      },
    });
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    this.chromeHandle.destruct();
    this.chromeHandle = null;

    ExtensionSupport.unregisterWindowListener("quickmove");

    for (let window of ExtensionSupport.openWindows) {
      if (window.quickmove && window.quickmove.cleanup) {
        for (let func of window.quickmove.cleanup.reverse()) {
          try {
            func();
          } catch (e) {
            Cu.reportError(e);
          }
        }
      }
    }

    // if (this.extension.addonData.temporarilyInstalled) {
    Services.obs.notifyObservers(null, "startupcache-invalidate");
    // }
  }

  getAPI(context) {
    return {
      quickmove: {},
    };
  }
};
