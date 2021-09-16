/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2009-2019 */

/* global Services, GetMessagePaneFrame, fixIterator, MailServices, MsgCopyMessage,
 *        MsgMarkMsgAsRead, MsgMoveMessage, gFolderTreeView */

"use strict";

var quickmove = (function() {
  const ADDON_ID = "quickmove@mozilla.kewis.ch";

  let { MultiSuffixTree } = ChromeUtils.import("resource:///modules/gloda/SuffixTree.jsm");
  let { ExtensionParent } = ChromeUtils.import("resource://gre/modules/ExtensionParent.jsm");

  let Quickmove = {
    getWXAPI(name, sync = false) {
      function implementation(api) {
        let impl = api.getAPI({ extension })[name];

        if (name == "storage") {
          impl.local.get = (...args) => impl.local.callMethodInParentProcess("get", args);
          impl.local.set = (...args) => impl.local.callMethodInParentProcess("set", args);
          impl.local.remove = (...args) => impl.local.callMethodInParentProcess("remove", args);
          impl.local.clear = (...args) => impl.local.callMethodInParentProcess("clear", args);
        }
        return impl;
      }

      let extension = ExtensionParent.GlobalManager.getExtension(ADDON_ID);
      if (sync) {
        let api = extension.apiManager.getAPI(name, extension, "addon_parent");
        return implementation(api);
      } else {
        return extension.apiManager.asyncGetAPI(name, extension, "addon_parent").then(api => {
          return implementation(api);
        });
      }
    },

    getString: function(aName) {
      return this.getWXAPI("i18n", true).getMessage(aName);
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

    getPref: async function(name, defaultValue = null) {
      let storage = await this.getWXAPI("storage");
      let prefs = await storage.local.get({ [name]: defaultValue });

      return prefs[name];
    },

    migrateStorage: async function() {
      let storage = await this.getWXAPI("storage");

      await storage.local.set({
        maxRecentFolders: Services.prefs.getIntPref("extensions.quickmove.maxRecentFolders", 15),
        markAsRead: Services.prefs.getBoolPref("extensions.quickmove.markAsRead", true),
        excludeArchives: Services.prefs.getBoolPref("extensions.quickmove.excludeArchives", false),
      });

      Services.prefs.clearUserPref("extensions.quickmove.maxRecentFolders");
      Services.prefs.clearUserPref("extensions.quickmove.markAsRead");
      Services.prefs.clearUserPref("extensions.quickmove.excludeArchives");
    },

    debounce: function(func, wait, immediate) {
      // https://davidwalsh.name/javascript-debounce-function (MIT license from underscore)
      // Some adaptions to be more ES6-like and satisfy eslint
      let timeout;
      return function(...args) {
        let callNow = immediate && !timeout;
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          timeout = null;
          if (!immediate) {
            func.apply(this, args);
          }
        }, wait);

        if (callNow) {
          func.apply(this, args);
        }
      };
      // End MIT license code
    },
  };

  return {
    /** Cleanup functions for this window **/
    cleanup: [],

    /** An array of recent folders, to be shown when no search term is entered */
    recentFolders: [],

    /** An array of all tags, to be shown when no search term is entered */
    allTags: [],

    /** A gloda suffix tree to provide quick search access to the folders */
    foldersSuffixTree: null,

    /** A gloda suffix tree to provide quick search access to the tags */
    tagsSuffixTree: null,

    /** True when something was typed but the search has not completed */
    dirty: false,

    /** Function to call when the seach completes. Used by the dirty logic */
    searchCompleteFunc: null,

    /** Element last focused when the popup was initiated */
    initiator: null,

    /**
     * Event listener method to be called when the 'move to', 'copy to', 'go to', or 'tag'
     * context menus are shown.
     */
    popupshowing: function(event, popupOptions) {
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
      popupOptions.prepare().then(() => {
        let initialText = "";
        if (typeof GetMessagePaneFrame != "undefined") {
          let selection = GetMessagePaneFrame().getSelection() || "";
          initialText = selection.toString() || "";
        }

        event.target.firstChild.value = initialText;
        quickmove.dirty = false;
        if (initialText) {
          popupOptions.search(event.target.firstChild);
        } else {
          popupOptions.addMenuItems(
            popupOptions.defaults(),
            event.target,
            event.target.firstChild.value
          );
        }
      });
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
    addFolders: async function(folders, popup, targetValue) {
      let dupeMap = {};
      let serverMap = {};
      let fullPathMap = {};
      let alwaysShowFullPath = await Quickmove.getPref("alwaysShowFullPath", false);
      let alwaysShowMailbox = await Quickmove.getPref("alwaysShowMailbox", false);
      let doNotCrop = await Quickmove.getPref("doNotCrop", false);

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

        if (
          lowerName in serverMap &&
          serverLowerName in serverMap[lowerName] &&
          serverMap[lowerName][serverLowerName]
        ) {
          // Already in the server map, this folder needs the full path
          fullPathMap[lowerName] = true;
        }

        serverMap[lowerName][serverLowerName] = true;
        dupeMap[lowerName]++;
      }

      // Now add each folder, appending the server name if the folder name
      // itself would appear more than once.
      for (let folder of folders) {
        let node = document.createXULElement("menuitem");
        if (doNotCrop) {
          node.setAttribute("crop", "none");
        }
        let label = folder.prettyName;
        let lowerLabel = label.toLowerCase();

        if (lowerLabel in fullPathMap || alwaysShowFullPath) {
          label = Quickmove.getFullName(folder);
        }

        if ((lowerLabel in dupeMap && dupeMap[lowerLabel] > 1) || alwaysShowMailbox) {
          label += " - " + folder.server.prettyName;
        }
        node.setAttribute("label", label);
        node._payload = folder;

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
     * Add a set of tags to the context menu.
     *
     * @param tags        An array of tags to add
     * @param popup       The popup to add to
     * @param targetValue The searched text
     */
    addTags: async function(tags, popup, targetValue) {
      for (let tag of tags) {
        let node = document.createXULElement("menuitem");
        let label = tag.tag;

        node.setAttribute("label", label);
        node.setAttribute("class", "menuitem-iconic");
        node.setAttribute("style", `color: ${tag.color}`)
        node._payload = tag;

        if (label.toLowerCase() == targetValue.toLowerCase()) {
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
    prepareFolders: async function() {
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
       * @param excludeArchives  if Archives folder must be excluded
       */
      function processFolder(aFolder, excludeArchives) {
        if (excludeArchives && aFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Archive, false)) {
          return;
        }
        addIfRecent(aFolder);
        allFolders.push(aFolder);
        allNames.push(aFolder.prettyName.toLowerCase());

        if (aFolder.hasSubFolders) {
          for (let xFolder of aFolder.subFolders) {
            processFolder(xFolder, excludeArchives);
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
          oldestTime =
            Number(recentFolders[recentFolders.length - 1].getStringProperty("MRUTime")) || 0;
        }
        recentFolders.push(aFolder);
      }

      let allFolders = [];
      let allNames = [];

      let recentFolders = quickmove.recentFolders;
      recentFolders.length = 0;
      let oldestTime = 0;

      let maxRecent = await Quickmove.getPref("maxRecentFolders", 15);
      let excludeArchives = await Quickmove.getPref("excludeArchives", false);

      for (let acct of MailServices.accounts.accounts) {
        if (acct.incomingServer) {
          processFolder(acct.incomingServer.rootFolder, excludeArchives);
        }
      }

      quickmove.foldersSuffixTree = new MultiSuffixTree(allNames, allFolders);

      recentFolders.sort(sorter);
    },

    /**
     * Prepare the tags and the suffix tree with all available tags.
     */
    prepareTags: async function() {
      let allTags = quickmove.allTags;
      allTags.length = 0;
      let allNames = [];

      for (let tag of MailServices.tags.getAllTags()) {
        allTags.push(tag);
        allNames.push(tag.tag.toLowerCase());
      }

      quickmove.tagsSuffixTree = new MultiSuffixTree(allNames, allTags);
    },

    /**
     * Perform a search. If no search term is entered, the recent folders are
     * shown, otherwise folders which match the search term are shown.
     */
    searchFolders: function(textboxNode) {
      let popup = textboxNode.parentNode;
      Quickmove.clearItems(popup);
      dump(`=== text |${textboxNode.value}|\n`);
      if (textboxNode.value.length) {
        let folders = quickmove.foldersSuffixTree
          .findMatches(textboxNode.value.toLowerCase())
          .filter(x => x.canFileMessages);
        if (folders.length) {
          quickmove.addFolders(folders, popup, textboxNode.value);
        } else {
          let node = document.createXULElement("menuitem");
          node.setAttribute("disabled", "true");
          node.style.textAlign = "center";
          node.setAttribute("label", Quickmove.getString("noResults"));
          popup.appendChild(node);
        }
      } else {
        quickmove.addFolders(quickmove.recentFolders, popup, textboxNode.value);
      }

      // The search is done, reset the dirty count and call the search complete
      // func if it is defined.
      quickmove.dirty = false;
      if (quickmove.searchCompleteFunc) {
        quickmove.searchCompleteFunc();
        quickmove.searchCompleteFunc = null;
      }
    },

    searchTags: function(textboxNode) {
      let popup = textboxNode.parentNode;
      Quickmove.clearItems(popup);
      if (textboxNode.value.length) {
        let tags = quickmove.tagsSuffixTree.findMatches(textboxNode.value.toLowerCase())
        if (tags.length) {
          quickmove.addTags(tags, popup, textboxNode.value);
        } else {
          let node = document.createXULElement("menuitem");
          node.setAttribute("disabled", "true");
          node.style.textAlign = "center";
          node.setAttribute("label", Quickmove.getString("noResults"));
          popup.appendChild(node);
        }
      } else {
        quickmove.addTags(quickmove.allTags, popup, textboxNode.value);
      }

      // The search is done, reset the dirty count and call the search complete
      // func if it is defined.
      quickmove.dirty = false;
      if (quickmove.searchCompleteFunc) {
        quickmove.searchCompleteFunc();
        quickmove.searchCompleteFunc = null;
      }
    },

    searchFoldersDelayed: Quickmove.debounce(textboxNode => {
      quickmove.searchFolders(textboxNode);
    }, 500),

    searchTagsDelayed: Quickmove.debounce(textboxNode => {
      quickmove.searchTags(textboxNode);
    }, 500),

    executeCopy: function(folder) {
      quickmove.executeMove(folder, true);
    },

    executeMove: async function(folder, copyNotMove) {
      if (copyNotMove) {
        MsgCopyMessage(folder);
      } else {
        if (await Quickmove.getPref("markAsRead", true)) {
          MsgMarkMsgAsRead(true);
        }
        console.log(folder);
        MsgMoveMessage(folder);
      }
    },

    executeGoto: function(folder) {
      gFolderTreeView.selectFolder(folder, true);
    },

    executeTag: function(tag) {
      ToggleMessageTag(tag.key, true);
    },

    focus: function(event) {
      let popup = event.target.parentNode;
      popup.setAttribute("ignorekeys", "true");
    },

    keypress: function(event, executeFunc) {
      let popup = event.target.parentNode;

      // Executor function used later to execute the actual action
      function executor() {
        let firstItem =
          event.target.nextSibling &&
          event.target.nextSibling.nextSibling &&
          event.target.nextSibling.nextSibling._payload;
        if (firstItem) {
          executeFunc(firstItem);
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
          // We haven't finished searching, wait until the search completes and then execute.
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
        keyEvent.initKeyEvent(
          "keydown",
          true,
          true,
          null,
          false,
          false,
          false,
          false,
          keyEvent.DOM_VK_DOWN,
          0
        );
        popup.dispatchEvent(keyEvent);
        keyEvent.initKeyEvent(
          "keyup",
          true,
          true,
          null,
          false,
          false,
          false,
          false,
          keyEvent.DOM_VK_DOWN,
          0
        );
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

    command: function(event, executeFunc, isContext = false) {
      let popup = event.target.parentNode;
      executeFunc(event.target._payload);
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
        let selection = threadTree.view.selection;
        let rowOffset =
          threadTree.rowHeight * (selection.currentIndex - threadTree.getFirstVisibleRow() + 1) +
          threadTreeCols.clientHeight;
        filepopup.openPopup(threadTree, "overlap", threadTreeCols.clientHeight, rowOffset);
      } else if (messagepane) {
        let filepopup = document.getElementById("quickmove-menupopup");
        filepopup.openPopup(messagepane, "overlap");
      } else {
        Cu.reportError("Couldn't find a node to open the panel on");
      }
    },

    openGoto: function() {
      let folderLocation = document.getElementById("locationFolders");
      let folderTree = document.getElementById("folderTree");

      if (folderLocation) {
        // There is a folder location popup, open its popup
        let menupopup = document.getElementById("quickmove-folderlocation-menupopup");
        menupopup.openPopup(folderLocation, "after_start");
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
        let selection = threadTree.view.selection;
        let rowOffset =
          threadTree.rowHeight * (selection.currentIndex - threadTree.getFirstVisibleRow() + 1) +
          threadTreeCols.clientHeight;
        filepopup.openPopup(threadTree, "overlap", threadTreeCols.clientHeight, rowOffset);
      } else if (messagepane) {
        let filepopup = document.getElementById("quickmove-copy-menupopup");
        filepopup.openPopup(messagepane, "overlap");
      } else {
        Cu.reportError("Couldn't find a node to open the panel on");
      }
    },

    openTag: function() {
      let threadTree = document.getElementById("threadTree");
      let messagepane = document.getElementById("messagepane");
      if (threadTree) {
        // If there is a thread tree (i.e mail 3pane), then use it
        let filepopup = document.getElementById("quickmove-tag-menupopup");
        let threadTreeCols = document.getElementById("threadCols");
        let selection = threadTree.view.selection;
        let rowOffset =
          threadTree.rowHeight * (selection.currentIndex - threadTree.getFirstVisibleRow() + 1) +
          threadTreeCols.clientHeight;
        filepopup.openPopup(threadTree, "overlap", threadTreeCols.clientHeight, rowOffset);
      } else if (messagepane) {
        let filepopup = document.getElementById("quickmove-tag-menupopup");
        filepopup.openPopup(messagepane, "overlap");
      } else {
        Cu.reportError("Couldn't find a node to open the panel on");
      }
    },

    hide: function(popup, isContext = false) {
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
    },

    folderMenuOptions: {
      prepare: () => quickmove.prepareFolders(),
      search: (textboxNode) => quickmove.searchFolders(textboxNode),
      addMenuItems: (folders, popup, targetValue) => quickmove.addFolders(folders, popup, targetValue),
      defaults: () => quickmove.recentFolders
    },

    tagMenuOptions: {
      prepare: () => quickmove.prepareTags(),
      search: (textboxNode) => quickmove.searchTags(textboxNode),
      addMenuItems: (tags, popup, targetValue) => quickmove.addTags(tags, popup, targetValue),
      defaults: () => quickmove.allTags
    },
  };
})();
