import PluralForm from "./pluralform.js";

export const DEFAULT_PREFERENCES = {
  layout: "auto",
  markAsRead: true,
  maxRecentFolders: 15,
  showFolderPath: true,
  useLegacyShortcuts: false,
  skipArchive: true,
  defaultFolderSetting: "recent",
  migratedShiftArrow: false,
  recentStrategy: "accessed",
  partialMatchFullPath: false,
  searchAccountName: false,
  notificationActive: false,
  operationCounters: { move: 0, copy: 0, tag: 0 },
  operationMenuItemsMove: true,
  operationMenuItemsCopy: true,
  operationMenuItemsGoto: true,
  operationMenuItemsTag: true,
};

export async function getValidatedFolders(rootNode, prefName) {
  let prefs = await browser.storage.local.get({ [prefName]: [] });
  let { missing, folderNodes } = rootNode.fromList(prefs[prefName]);

  if (missing.length) {
    let folders = folderNodes.map(node => ({ accountId: node.accountId, path: node.path }));
    await browser.storage.local.set({ [prefName]: folders });
  }

  return folderNodes;
}

export function isAltMode(event) {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const keyAltMode = isMac ? event.metaKey : event.ctrlKey;
  const mouseAltMode = event instanceof MouseEvent ? event.button == 1 : false;

  return keyAltMode || mouseAltMode;
}

export async function showNotification(operation, numMessages, destination, dismissTime = 10000) {
  let operationAction = browser.i18n.getMessage("operationAction." + operation, ["#num_messages#", "#destination#"]);
  let notificationMessage = PluralForm.get(numMessages, operationAction);
  let replacements = {
    num_messages: numMessages,
    destination: destination
  };
  notificationMessage = notificationMessage.replace(/#([^#]+)#/g, (match, key) => {
    return replacements[key] || match;
  });

  if (!browser.notifications) {
    // We lost the permission somehow, disable the pref
    await browser.storage.local.set({ notificationActive: false });
    return;
  }

  let notificationID = await browser.notifications.create(null, {
    type: "basic",
    title: browser.i18n.getMessage("extensionName"),
    // Some platforms don't do well with SVG images in notifications
    iconUrl: browser.runtime.getURL("images/addon-atn.png"),
    message: notificationMessage
  });

  if (dismissTime > 0) {
    setTimeout(() => {
      browser.notifications.clear(notificationID);
    }, dismissTime);
  }
}

export async function prettyDestination(folderId, doReverse = false) {
  // Split the folderId into accountId and path
  const [accountId, path] = folderId.split("://");

  const folders = path.split("/");
  const account = await browser.accounts.get(accountId);
  const accountName = account ? account.name : accountId;

  let fullPath = [];
  let divider = "";
  if (doReverse) {
    fullPath = [...folders.reverse(), accountName];
    divider = "\u200B←";
  } else {
    fullPath = [accountName, ...folders];
    divider = "→\u200B";
  }

  return fullPath.join(divider);
}
