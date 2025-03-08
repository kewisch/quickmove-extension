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

export function cmdOrCtrlKey(event) {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  return isMac ? event.metaKey : event.ctrlKey;
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
