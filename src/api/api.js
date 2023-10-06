/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "BasePopup",
  "resource:///modules/ExtensionPopups.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "FolderUtils",
  "resource:///modules/FolderUtils.jsm"
);

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
    return {
      quickmove: {
        // bug 1840039 - messenger.folders.query API
        async query({ recent, limit, canFileMessages }) {
          function* allFolders(root) {
            if (
              !root.isServer &&
              (canFileMessages === null || root.canFileMessages === canFileMessages)
            ) {
              yield root;
            }
            if (root.hasSubFolders) {
              for (let folder of root.subFolders) {
                yield* allFolders(folder);
              }
            }
          }

          let folders = [];

          for (let acct of MailServices.accounts.accounts) {
            if (acct.incomingServer) {
              folders = folders.concat([...allFolders(acct.incomingServer.rootFolder)]);
            }
          }

          if (recent) {
            let recentFolders = FolderUtils.getMostRecentFolders(folders, limit || Infinity, "MRUTime");
            folders = recentFolders.map(folder => convertFolder(folder));
          }

          return folders;
        },

        // This sets the legacy shortcuts, will only keep this until the other bugs are fixed.
        setupLegacyShortcuts(enabled) {
          if (enabled) {
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
            context.extension.shortcuts.updateCommand({
              name: "tag",
              shortcut: "Shift+T"
            });
          } else {
            context.extension.shortcuts.resetCommand("move");
            context.extension.shortcuts.resetCommand("copy");
            context.extension.shortcuts.resetCommand("goto");
            context.extension.shortcuts.resetCommand("tag");
          }
        },

        // bug 1840072 - thread pane is not focused when returning from browserAction
        async focusThreadPane(windowId) {
          let window = Services.wm.getMostRecentWindow("mail:3pane");
          let tabmail = window.top.document.getElementById("tabmail");
          tabmail.currentAbout3Pane?.threadTree.table.body.focus();
        },

        // bug 1849476 - messages.move/copy() doesn't set mail.last_msg_movecopy_target_uri
        async setLastMoveCopyFolder({ accountId, path }, isMove) {
          /* eslint-disable */
          /* This is verbatim from ext-mail.js */
          function folderPathToURI(accountId, path) {
            let server = MailServices.accounts.getAccount(accountId).incomingServer;
            let rootURI = server.rootFolder.URI;
            if (path == "/") {
              return rootURI;
            }
            // The .URI property of an IMAP folder doesn't have %-encoded characters.
            // If encoded here, the folder lookup service won't find the folder.
            if (server.type == "imap") {
              return rootURI + path;
            }
            return (
              rootURI +
              path
                .split("/")
                .map(p =>
                  encodeURIComponent(p)
                    .replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16))
                    // We do not encode "+" chars in folder URIs. Manually convert them
                    // back to literal + chars, otherwise folder lookup will fail.
                    .replaceAll("%2B", "+")
                )
                .join("/")
            );
          }
          /* eslint-enable */

          let targetFolderUri = folderPathToURI(accountId, path);
          if (targetFolderUri) {
            Services.prefs.setStringPref("mail.last_msg_movecopy_target_uri", targetFolderUri);
            Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);
          }
        }
      }
    };
  }
};
