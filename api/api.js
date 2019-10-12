/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019 */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "BasePopup",
  "resource:///modules/ExtensionPopups.jsm"
);

var { fixIterator } = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");

var { getMostRecentFolders } = ChromeUtils.import("resource:///modules/folderUtils.jsm");

const folderTypeMap = new Map([
  [Ci.nsMsgFolderFlags.Inbox, "inbox"],
  [Ci.nsMsgFolderFlags.Drafts, "drafts"],
  [Ci.nsMsgFolderFlags.SentMail, "sent"],
  [Ci.nsMsgFolderFlags.Trash, "trash"],
  [Ci.nsMsgFolderFlags.Templates, "templates"],
  [Ci.nsMsgFolderFlags.Archive, "archives"],
  [Ci.nsMsgFolderFlags.Junk, "junk"],
  [Ci.nsMsgFolderFlags.Queue, "outbox"],
]);

function convertFolder(folder, accountId) {
  if (!folder) {
    return null;
  }
  if (!accountId) {
    let server = folder.server;
    let account = MailServices.accounts.FindAccountForServer(server);
    accountId = account.key;
  }

  let folderObject = {
    accountId,
    name: folder.prettyName,
    path: folderURIToPath(folder.URI),
  };

  for (let [flag, typeName] of folderTypeMap.entries()) {
    if (folder.flags & flag) {
      folderObject.type = typeName;
    }
  }

  return folderObject;
}

function folderURIToPath(uri) {
  let path = Services.io.newURI(uri).filePath;
  return path
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}

this.quickmove = class extends ExtensionAPI {
  getAPI(context) {
    let { apiManager, tabManager } = context.extension;

    return {
      quickmove: {
        async sortAccounts(accounts) {
          function getServerSortOrder(server) {
            return server ? MailServices.accounts.getSortOrder(server) : 999999999;
          }

          return accounts.sort((a, b) => {
            let nativeA = MailServices.accounts.getAccount(a.id);
            let nativeB = MailServices.accounts.getAccount(b.id);

            return getServerSortOrder(nativeA.incomingServer) - getServerSortOrder(nativeB.incomingServer);
          });
        },

        async query({ recent, limit, canFileMessages }) {
          function* allFolders(root) {
            if (
              !root.isServer &&
              (canFileMessages === null || root.canFileMessages === canFileMessages)
            ) {
              yield root;
            }
            if (root.hasSubFolders) {
              for (let folder of fixIterator(root.subFolders, Components.interfaces.nsIMsgFolder)) {
                yield* allFolders(folder);
              }
            }
          }

          let folders = [];

          for (let acct of fixIterator(MailServices.accounts.accounts, Components.interfaces.nsIMsgAccount)) {
            if (acct.incomingServer) {
              folders = folders.concat([...allFolders(acct.incomingServer.rootFolder)]);
            }
          }

          if (recent) {
            let recentFolders = getMostRecentFolders(folders, limit || Infinity, "MRUTime");
            folders = recentFolders.map(folder => convertFolder(folder));
          }

          return folders;
        },

        // This sets the legacy shortcuts, won't be able to use this forever.
        migrateShortcut() {
          context.extension.shortcuts.updateCommand({
            name: "move",
            shortcut: "Shift+M"
          });
          context.extension.shortcuts.updateCommand({
            name: "copy",
            shortcut: "Shift+Y"
          });
          context.extension.shortcuts.updateCommand({
            name: "goto",
            shortcut: "Shift+G"
          });
        },

        // Bug 1545932 - Opening a browserAction button should return focus to the previous location when closed
        focusThreadTree(tabId) {
          let tabmail = tabManager.get(tabId).tabmail;
          if (!tabmail) {
            throw new ExtensionError("Not a Tabmail Tab");
          }
          tabmail.ownerGlobal.document.getElementById("threadTree").focus();
        },

        // Bug 1579031 - Implement browserAction.openPopup
        async openPopup() {
          let window = Cu.getGlobalForObject(tabManager).windowTracker.topWindow;
          let browserAction = await apiManager.getAPI("browserAction", context.extension);
          await browserAction.triggerAction(window);
        }
      }
    };
  }
};
