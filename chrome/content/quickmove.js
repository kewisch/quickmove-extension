/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2009-2013 */

"use strict";

Components.utils.import("resource://gre/modules/Services.jsm");

Components.utils.import("resource:///modules/gloda/suffixtree.js");
Components.utils.import("resource:///modules/iteratorUtils.jsm");
Components.utils.import("resource:///modules/mailServices.js");

Components.utils.import("resource://quickmove/modules/Quickmove.jsm");

var quickmove = {
  /** An array of recent folders, to be shown when no search term is entered */
  recentFolders: [],

  /** A gloda suffix tree to provide quick search access to the folders */
  suffixTree: null,

  /** True when something was typed but the search has not completed */
  dirty: false,

  /** Function to call when the seach completes. Used by the dirty logic */
  searchCompleteFunc: null,

  /** Element last focused when the popup was initiated */
  initiator: null,

  /**
   * Event listener method to be called when the 'move to' or 'copy to'
   * context menu is shown.
   */
  popupshowing: function(event) {
    if (event.target.getAttribute("ignorekeys") != "true") {
      // If we are showing the menuitems, then don't set up the folders but
      // keep the old list.
      return;
    }

    let focusedElement = document.commandDispatcher.focusedElement;
    if (focusedElement && focusedElement.id) {
      quickmove.initiator = document.commandDispatcher.focusedElement;
    }
    Quickmove.clearItems(event.target);
    quickmove.prepareFolders();

    let initialText = "";
    if (typeof GetMessagePaneFrame != "undefined") {
      let selection = GetMessagePaneFrame().getSelection() || "";
      initialText = selection.toString() || "";
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

  popupshown: function(event) {
    // focus the textbox
    event.target.setAttribute("ignorekeys", "true");
    event.target.firstChild.focus();
  },

  /**
   * Add a set of folders to the context menu.
   *
   * @param folders     An array of folders to add
   * @param popup       The popup to add to
   * @param targetValue The searched text
   */
  addFolders: function(folders, popup, targetValue) {
    let dupeMap = {};
    let serverMap = {};
    let fullPathMap = {};

    // First create a map of pretty names to find possible duplicates.
    for (let folder of folders) {
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
    for (let folder of folders) {
      let node = document.createElement("menuitem");
      let label = folder.prettyName;
      let lowerLabel = label.toLowerCase();

      if (lowerLabel in fullPathMap) {
        label = Quickmove.getFullName(folder);
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
  prepareFolders: function() {
    function sorter(a, b) {
      let atime = Number(a.getStringProperty("MRUTime")) || 0;
      let btime = Number(b.getStringProperty("MRUTime")) || 0;
      return atime < btime;
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
          processFolder(myenum.getNext().QueryInterface(Components.interfaces.nsIMsgFolder));
        }
      }
    }

    function addIfRecent(aFolder) {
      if (!aFolder.canFileMessages) {
        return;
      }

      let time = 0;
      try {
        time = Number(aFolder.getStringProperty("MRUTime")) || 0;
      } catch (ex) {
        // If MRUTime is NaN, assume 0
      }

      if (time <= oldestTime) {
        return;
      }

      if (recentFolders.length == maxRecent) {
        recentFolders.sort(sorter);
        recentFolders.pop();
        oldestTime = Number(recentFolders[recentFolders.length-1].getStringProperty("MRUTime")) || 0;
      }
      recentFolders.push(aFolder);
    }

    let allFolders = [];
    let allNames = [];
    let recentFolders = quickmove.recentFolders = [];
    let oldestTime = 0;

    let maxRecent = Services.prefs.getIntPref("extensions.quickmove.maxRecentFolders", 15);

    for (let acct of fixIterator(MailServices.accounts.accounts, Components.interfaces.nsIMsgAccount)) {
      if (acct.incomingServer) {
        processFolder(acct.incomingServer.rootFolder);
      }
    }

    quickmove.suffixTree = new MultiSuffixTree(allNames, allFolders);

    recentFolders.sort(sorter);
  },

  /**
   * Perform a search. If no search term is entered, the recent folders are
   * shown, otherwise folders which match the search term are shown.
   */
  search: function(textboxNode) {
    let popup = textboxNode.parentNode;
    Quickmove.clearItems(popup);
    if (textboxNode.value.length == 0) {
      quickmove.addFolders(quickmove.recentFolders, popup, textboxNode.value);
    } else {
      let folders = quickmove.suffixTree
        .findMatches(textboxNode.value.toLowerCase())
        .filter(x => x.canFileMessages);
      if (folders.length) {
        quickmove.addFolders(folders, popup, textboxNode.value);
      } else {
        let node = document.createElement("menuitem");
        node.setAttribute("disabled", "true");
        node.style.textAlign = "center";
        node.setAttribute("label", Quickmove.getString("noResults"));
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

  executeCopy: function(folder) {
    quickmove.executeMove(folder, true);
  },

  executeMove: function(folder, copyNotMove) {
    if (copyNotMove) {
      MsgCopyMessage(folder);
    } else {
      if (Services.prefs.getBoolPref("extensions.quickmove.markAsRead", true)) {
        MsgMarkMsgAsRead(true);
      }
      MsgMoveMessage(folder);
    }
  },

  executeGoto: function(folder) {
    gFolderTreeView.selectFolder(folder, true);
  },

  focus: function(event) {
    let popup = event.target.parentNode;
    popup.setAttribute("ignorekeys", "true");
  },

  keypress: function(event, executeFunc) {
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
    } else if (event.keyCode == event.DOM_VK_DOWN && !popup.lastChild.disabled) {
      popup.removeAttribute("ignorekeys");
      popup.firstChild.blur();

      // Synthesize another keydown/up cycle, this ensures the first menuitem
      // is actually focused.
      let keyEvent = document.createEvent("KeyboardEvent");
      keyEvent.initKeyEvent("keydown", true, true, null, false, false,
        false, false, keyEvent.DOM_VK_DOWN, 0);
      popup.dispatchEvent(keyEvent);
      keyEvent.initKeyEvent("keyup", true, true, null, false, false,
        false, false, keyEvent.DOM_VK_DOWN, 0);
      popup.dispatchEvent(keyEvent);
    } else {
      // If something was typed, then remember that we haven't searched yet.
      quickmove.dirty = true;

      // Don't stop propagation for normal keypresses.
      return;
    }
    event.stopPropagation();
    event.preventDefault();
  },

  command: function(event, executeFunc, isContext=false) {
    let popup = event.target.parentNode;
    executeFunc(event.target._folder);
    event.stopPropagation();
    quickmove.hide(popup, isContext);
  },

  openFile: function() {
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
      filepopup.openPopup(threadTree, "overlap", 0, rowOffset);
    } else if (messagepane) {
      let filepopup = document.getElementById("quickmove-compose-menupopup");
      filepopup.openPopup(messagepane, "overlap");
    } else {
      Components.utils.reportError("Couldn't find a node to open the panel on");
    }
  },

  openGoto: function() {
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

  openCopy: function() {
    let threadTree = document.getElementById("threadTree");
    let messagepane = document.getElementById("messagepane");
    if (threadTree) {
      // If there is a thread tree (i.e mail 3pane), then use it
      let filepopup = document.getElementById("quickmove-copy-menupopup");
      let threadTreeCols = document.getElementById("threadCols");
      let treeBO = threadTree.treeBoxObject;
      let selection = threadTree.view.selection;
      let rowOffset = treeBO.rowHeight *
                    (selection.currentIndex - treeBO.getFirstVisibleRow() + 1) +
                    threadTreeCols.boxObject.height;
      filepopup.openPopup(threadTree, "overlap", 0, rowOffset);
    } else if (messagepane) {
      let filepopup = document.getElementById("quickmove-compose-copy-menupopup");
      filepopup.openPopup(messagepane, "overlap");
    } else {
      Components.utils.reportError("Couldn't find a node to open the panel on");
    }
  },

  hide: function(popup, isContext=false) {
    if (!isContext) {
      popup.hidePopup();
    }

    // Hiding the menupopup should clear the search text and reset ignorekeys
    // to be able to use the textbox.
    popup.firstChild.value = "";
    popup.setAttribute("ignorekeys", "true");

    // Now reference the previous node, so the user can continue filing or
    // searching
    if (quickmove.initiator) {
      quickmove.initiator.focus();
      quickmove.initiator = null;
    }
  }
};
