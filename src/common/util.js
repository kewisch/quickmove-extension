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
  notificationActive: false,
  operationCounters: { move: 0, copy: 0, tag: 0 },
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

export async function showNotification(title, message, dismissTime = 10000) {
  let notificationID = await browser.notifications.create(null, {
    type: "basic",
    title: title,
    iconUrl: browser.runtime.getURL("images/addon-atn.png"),
    message: message
  });
  if (dismissTime > 0) {
    setTimeout(() => {
      browser.notifications.clear(notificationID);
    }, dismissTime);
  }
}

export function createNotificationText(operation, numMessages, destination) {
  let pluralFunc = PluralForm.makeGetter(PluralForm.ruleNum)[0];
  let notificationMessage = browser.i18n.getMessage("operation_action_" + operation) + " " + numMessages + " " + pluralFunc(numMessages, browser.i18n.getMessage("operation_message_pluralforms"));
  switch (operation) {
    case "copy":
    case "move":
      notificationMessage += " " + browser.i18n.getMessage("Folder") + ": " + destination;
      break;
    case "tag":
      notificationMessage += " " + browser.i18n.getMessage("actionTag") + ": " + destination;
      break;
  }
  showNotification(browser.i18n.getMessage("extensionName"), notificationMessage, 10000);
}
