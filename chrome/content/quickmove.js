/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2009-2013 */

"use strict";

try {
    Components.utils.import("resource:///modules/gloda/suffixtree.js");
} catch (e) {
    // Postbox compat
    Components.utils.import("resource://quickmove/modules/suffixtree.js");
}

Components.utils.import("resource:///modules/iteratorUtils.jsm");

var quickmove = {
  /** An array of recent folders, to be shown when no search term is entered */
  recentFolders: [],

  /** A gloda suffix tree to provide quick search access to the folders */
  suffixTree: null,

  /** True when something was typed but the search has not completed */
  dirty: false, 

  /** Function to call when the seach completes. Used by the dirty logic */
  searchCompleteFunc: null,

  /**
   * Event listener method to be called when the 'move to' or 'copy to'
   * context menu is shown.
   */
  popupshowing: function popupshowing(event) {
    if (event.target.getAttribute("ignorekeys") != "true") {
      // If we are showing the menuitems, then don't set up the folders but
      // keep the old list.
      return;
    }

    quickmove.clearItems(event.target);
    quickmove.prepareFolders();

    let initialText = "";
    if (typeof GetMessagePaneFrame != "undefined") {
        initialText = GetMessagePaneFrame().getSelection().toString() || "";
    }

    event.target.firstChild.value = initialText;
    quickmove.dirty = false;
    if (initialText) {
        quickmove.search(event.target.firstChild);
    } else {
        quickmove.addFolders(quickmove.recentFolders, event.target, event.target.firstChild.value);
    }
    event.stopPropagation();
  },

  popupshown: function popupshown(event) {
    // focus the textbox
    if (event.target.getAttribute("ignorekeys") == "true") {
        event.target.firstChild.focus();
    } else {
        event.target.firstChild.blur();
        event.target.setAttribute("ignorekeys", "true");
    }
  },

  /**
   * Clear all items except the menuseparator and the search box
   */
  clearItems: function clearItems(popup) {
    while (popup.lastChild.className != "quickmove-separator") {
      popup.removeChild(popup.lastChild);
    }
  },

  /**
   * Add a set of folders to the context menu.
   *
   * @param folders     An array of folders to add
   * @param popup       The popup to add to
   * @param targetValue The searched text
   */
  addFolders: function addFolders(folders, popup, targetValue) {
      let dupeMap = {};
      let serverMap = {};
      let fullPathMap = {};

      // First create a map of pretty names to find possible duplicates.
      for each (let folder in folders) {
        let lowerName = folder.prettyName.toLowerCase();
        let serverLowerName = folder.server.prettyName.toLowerCase();

        if (!(lowerName in serverMap)) {
          serverMap[lowerName] = {};
        }

        if (!(lowerName in dupeMap)) {
          dupeMap[lowerName] = 0;
          serverMap[lowerName][serverLowerName] = 0;
        }

        if (lowerName in serverMap &&
            serverLowerName in serverMap[lowerName] &&
            serverMap[lowerName][serverLowerName]) {
          // Already in the server map, this folder needs the full path
          fullPathMap[lowerName] = true;
        }

        serverMap[lowerName][serverLowerName] = true;
        dupeMap[lowerName]++;
      }

      // Now add each folder, appending the server name if the folder name
      // itself would appear more than once.
      for each (let folder in folders) {
        let node = document.createElement("menuitem");
        let label = folder.prettyName;
        let lowerLabel = label.toLowerCase();

        if (lowerLabel in fullPathMap) {
            label = quickmove.getFullName(folder);
        }

        if ((lowerLabel in dupeMap) && dupeMap[lowerLabel] > 1) {
          label += " - " + folder.server.prettyName;
        }
        node.setAttribute("label", label);
        node._folder = folder;

        node.setAttribute("class", "folderMenuItem menuitem-iconic");
        if (lowerLabel == targetValue.toLowerCase()) {
          // An exact match, put this at the top after the separator
          let separator = popup.getElementsByClassName("quickmove-separator")[0];
          popup.insertBefore(node, separator.nextSibling);
        } else {
          // Otherwise append to the end
          popup.appendChild(node);
        }
      }
  },

  /**
   * Prepare the recent folders and the suffix tree with all available folders.
   */
  prepareFolders: function buildRecent() {
    quickmove.recentFolders =  [];

    let allFolders = [];
    let allNames = [];
    let recentFolders = quickmove.recentFolders;
    let oldestTime = 0;
    let maxRecent = 15;

    const Cc = Components.classes;
    const Ci = Components.interfaces;
    
    try {
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
                              .getService(Components.interfaces.nsIPrefBranch);
        maxRecent = prefs.getIntPref("extensions.quickmove.maxRecentFolders");
    } catch (e) {
        maxRecent = 15;
    }

    /**
     * This function will iterate through any existing sub-folders and
     * (1) check if they're recent and (2) recursively call this function
     * to iterate through any sub-sub-folders.
     *
     * @param aFolder  the folder to check
     */
    function processFolder(aFolder) {
      addIfRecent(aFolder);
      allFolders.push(aFolder);
      allNames.push(aFolder.prettyName.toLowerCase());

      if (aFolder.hasSubFolders) {
        let myenum = aFolder.subFolders;
        if (myenum) {
          // Newer Thunderbird & Seamonkey, nsISimpleEnumerator
          while (myenum.hasMoreElements()) {
            processFolder(myenum.getNext().QueryInterface(Ci.nsIMsgFolder));
          }
        } else {
          // Postbox 3, nsIEnumerator
          myenum = aFolder.GetSubFolders();
          try {
            for (myenum.first(); !myenum.isDone(); myenum.next()) {
              processFolder(myenum.currentItem().QueryInterface(Ci.nsIMsgFolder));
            }
          } catch (e if e.result == Components.results.NS_ERROR_FAILURE) {
            // swallow this exception, it usually means this broken enumerator
            // is done
          }
        }
      }
    }


    function addIfRecent(aFolder) {
      if (!aFolder.canFileMessages) {
        return;
      }

      let time = 0;
      try {
        time = aFolder.getStringProperty("MRUTime");
      } catch(ex) {}
      if (time <= oldestTime) {
        return;
      }

      if (recentFolders.length == maxRecent) {
        recentFolders.sort(sorter);
        recentFolders.pop();
        oldestTime = recentFolders[recentFolders.length-1].getStringProperty("MRUTime");
      }
      recentFolders.push(aFolder);
    }


    // Would use iteratorUtils but Postbox iteratorUtils doesn't support nsIArray
    let acctMgr = Cc["@mozilla.org/messenger/account-manager;1"].
                  getService(Ci.nsIMsgAccountManager);
    let accounts = acctMgr.accounts;

    for each (let acct in fixIterator(acctMgr.accounts, Components.interfaces.nsIMsgAccount)) {
      if (acct.incomingServer) {
        processFolder(acct.incomingServer.rootFolder);
      }
    }

    quickmove.suffixTree = new MultiSuffixTree(allNames, allFolders);

    function sorter(a, b) {
      return a.getStringProperty("MRUTime") < b.getStringProperty("MRUTime");
    }
    recentFolders.sort(sorter);
  },

  /**
   * Perform a search. If no search term is entered, the recent folders are
   * shown, otherwise folders which match the search term are shown.
   */
  search: function Search(textboxNode) {
    let popup = textboxNode.parentNode;
    quickmove.clearItems(popup);
    if (textboxNode.value.length == 0) {
      quickmove.addFolders(quickmove.recentFolders, popup, textboxNode.value);
    } else {
      let folders = quickmove.suffixTree
                             .findMatches(textboxNode.value.toLowerCase())
                             .filter(function(x) x.canFileMessages);
      if (folders.length) {
        quickmove.addFolders(folders, popup, textboxNode.value);
      } else {
        let node = document.createElement("menuitem");
        node.setAttribute("disabled", "true");
        node.style.textAlign = "center";
        node.setAttribute("label", quickmove.getString("noResults"));
        popup.appendChild(node);
      }
    }

    // The search is done, reset the dirty count and call the search complete
    // func if it is defined.
    quickmove.dirty = false;
    if (quickmove.searchCompleteFunc) {
      quickmove.searchCompleteFunc();
      quickmove.searchCompleteFunc = null;
    }
  },

  executeCopy: function executeCopy(folder) {
    quickmove.executeMove(folder, true);
  },

  executeMove: function executeMove(folder, copyNotMove) {

    if (quickmove.platformVersionLowerThan("8.0")) {
        // Postbox 3 compat
        folder = folder.folderURL;
    }

    if (copyNotMove) {
      MsgCopyMessage(folder);
    } else {
      MsgMoveMessage(folder);
    }
  },

  executeGoto: function executeGoto(folder) {
    if (typeof gFolderTreeView == "object") {
      // Newer Thunderbird and Seamonkey
      gFolderTreeView.selectFolder(folder, true);
    } else {
      let cmds = msgWindow.windowCommands;
      cmds.selectFolder(folder.folderURL);
    }
  },

  focus: function(event) {
    let popup = event.target.parentNode;
    popup.setAttribute("ignorekeys", "true");

    let x = popup.boxObject.screenX;
    let y = popup.boxObject.screenY;
    popup.hidePopup();
    popup.openPopupAtScreen(x, y, true);
  },

  keypress: function keypress(event, executeFunc) {
    let popup = event.target.parentNode;

    // Executor function used later to execute the actual action
    function executor() {
      let firstFolder = event.target.nextSibling &&
                        event.target.nextSibling.nextSibling &&
                        event.target.nextSibling.nextSibling._folder;
      if (firstFolder) {
          executeFunc(firstFolder);
      }
    }

    // Now check which key was pressed
    if (event.keyCode == event.DOM_VK_ESCAPE) {
      // On escape, cancel and close the popup.
      quickmove.hide(popup);
    } else if (event.keyCode == event.DOM_VK_RETURN) {
      // If the user presses enter, execute the passed action, either directly
      // or indirectly
      if (quickmove.dirty) {
        // We haven't finished searching for folders, wait until the search
        // completes and then move.
        quickmove.searchCompleteFunc = executor;
      } else {
        // Otherwise go ahead and do so directly.
        executor();
      }

      // Now hide the popup
      quickmove.hide(popup);
    } else if (event.keyCode == event.DOM_VK_DOWN) {
      popup.removeAttribute("ignorekeys");

      let x = popup.boxObject.screenX;
      let y = popup.boxObject.screenY;
      popup.hidePopup();
      popup.openPopupAtScreen(x, y, true);
    } else {
      // If something was typed, then remember that we haven't searched yet.
     quickmove.dirty = true;

     // Don't stop propagation for normal keypresses.
     return;
    }
    event.stopPropagation();
    event.preventDefault();
  },

  openFile: function openFile() {
    let filebutton = document.getElementById("button-file");
    let threadTree = document.getElementById("threadTree");
    let messagepane = document.getElementById("messagepane");
    if (filebutton) {
      // There is a file button, open its popup
      let filepopup = document.getElementById("quickmove-filebutton-menupopup");
      filepopup.openPopup(filebutton, "after_start");
    } else if (threadTree) {
      // If there is a thread tree (i.e mail 3pane), then use it
      let filepopup = document.getElementById("quickmove-menupopup");
      let threadTreeCols = document.getElementById("threadCols");
      let treeBO = threadTree.treeBoxObject;
      let selection = threadTree.view.selection;
      let rowOffset = treeBO.rowHeight *
                    (selection.currentIndex - treeBO.getFirstVisibleRow() + 1) +
                    threadTreeCols.boxObject.height; 
      filepopup.openPopup(threadTree, "overlap",
                          0, rowOffset);
    } else if (messagepane) {
      let filepopup = document.getElementById("quickmove-compose-menupopup");
      filepopup.openPopup(messagepane, "overlap");
    } else {
      Components.utils.reportError("Couldn't find a node to open the panel on");
    }
  },

  openGoto: function openGoto() {
    let folderLocation = document.getElementById("folder-location-container");
    let folderTree = document.getElementById("folderTree");
    
    if (folderLocation) {
      // There is a folder location popup, open its popup
      let menulist = folderLocation.firstChild;
      menulist.menupopup.openPopup(menulist);
    } else if (folderTree) {
      let popup = document.getElementById("quickmove-goto-menupopup");
      popup.openPopup(folderTree, "overlap");
    }
  },

  hide: function hide(popup) {
    popup.hidePopup();

    // Now refocus the thread pane, this way the user can continue filing
    // messages.
    document.getElementById("threadTree").focus();
  },

  getString: function getString(aStringName, aParams) {
    let service = Components.classes["@mozilla.org/intl/stringbundle;1"]
                            .getService(Components.interfaces.nsIStringBundleService);
    
    const propName = "chrome://quickmove/locale/quickmove.properties";
    try {
        let props = service.createBundle(propName);

        if (aParams && aParams.length) {
            return props.formatStringFromName(aStringName, aParams, aParams.length);
        } else {
            return props.GetStringFromName(aStringName);
        }
    } catch (ex) {
        var s = ("Failed to read '" + aStringName + "' from " + propName + ".");
        Components.utils.reportError(s + " Error: " + ex);
        return s;
    }
  },

  get platformVersion() {
    return Cc["@mozilla.org/xre/app-info;1"]
             .getService(Ci.nsIXULAppInfo).platformVersion;
  },

  platformVersionLowerThan: function(aVersion) {
    let vc = Cc["@mozilla.org/xpcom/version-comparator;1"]
                .getService(Ci.nsIVersionComparator);

    return vc.compare(quickmove.platformVersion, aVersion) < 0;
  },

  getFullName: function getFullName(aFolder) {
    let folder = aFolder;
    let fullPath = [];

    while (folder && folder.parent) {
      fullPath.unshift(folder.prettyName);
      folder = folder.parent;
    }

    return fullPath.join("/");
  }
};
