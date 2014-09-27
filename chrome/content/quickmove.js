/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Quickmove Extension code.
 *
 * The Initial Developer of the Original Code is
 *   Philipp Kewisch <mozilla@kewis.ch>
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

Components.utils.import("resource:///modules/gloda/suffixtree.js");

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
    quickmove.clearItems(event.target);
    quickmove.prepareFolders();

    event.target.firstChild.value = "";
    quickmove.dirty = false;
    quickmove.addFolders(quickmove.recentFolders, event.target, event.target.firstChild.value);
    event.stopPropagation();
  },

  popupshown: function popupshown(event) {
    // focus the textbox
    event.target.firstChild.focus();
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
        while (myenum.hasMoreElements()) {
          processFolder(myenum.getNext().QueryInterface(Ci.nsIMsgFolder));
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


    let acctMgr = Cc["@mozilla.org/messenger/account-manager;1"].
                  getService(Ci.nsIMsgAccountManager);
    let count = acctMgr.accounts.Count();
    for (let i = 0; i < count; i++) {
      let acct = acctMgr.accounts.GetElementAt(i)
                        .QueryInterface(Components.interfaces.nsIMsgAccount);
      processFolder(acct.incomingServer.rootFolder);
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
  search: function Search(event) {
    let popup = event.target.parentNode;
    quickmove.clearItems(popup);
    if (event.target.value.length == 0) {
      quickmove.addFolders(quickmove.recentFolders, popup, event.target.value);
    } else {
      let folders = quickmove.suffixTree
                             .findMatches(event.target.value.toLowerCase())
                             .filter(function(x) x.canFileMessages);
      if (folders.length) {
        quickmove.addFolders(folders, popup, event.target.value);
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

    // No further processing needed.
    event.stopPropagation();
  },

  keypress: function keypress(event, copyNotMove) {
    let popup = event.target.parentNode;
    if (event.keyCode == event.DOM_VK_ESCAPE) {
      // On escape, cancel and close the popup.
      quickmove.hide(popup);
    } else if (event.keyCode == event.DOM_VK_ENTER ||
               event.keyCode == event.DOM_VK_RETURN) {
      // If the user presses enter, move to the first folder in the list and
      // close the popup.
      let target = event.target;

      // Since this is called once directly and once indirectly, the actual
      // moving needs to happen in a function.
      function mover() { 
        let firstFolder = target.nextSibling &&
                          target.nextSibling.nextSibling &&
                          target.nextSibling.nextSibling._folder;
        if (firstFolder) { 
          if (copyNotMove) {
            MsgCopyMessage(firstFolder);
          } else {
            MsgMoveMessage(firstFolder);
          }
        }
      }

      if (quickmove.dirty) {
        // We haven't finished searching for folders, wait until the search
        // completes and then move.
        quickmove.searchCompleteFunc = mover;
      } else {
        // Otherwise go ahead and do so directly.
        mover();
      }
      quickmove.hide(popup);
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
