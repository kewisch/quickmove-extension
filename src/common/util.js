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
  notificationFirstRunDone: false,
  notificationActive: false,
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

export function createNotificationText(operation, numMessages, destination, firstRunDone = true) {
  let notificationMessage = browser.i18n.getMessage("operation_action_" + operation) + " " + numMessages + " " + browser.i18n.getMessage("operation_message_" + (numMessages>1?"plural":"single"))+".";
  if (firstRunDone == false) {
    notificationMessage = browser.i18n.getMessage("notification_first_run") + " " + notificationMessage;
    browser.storage.local.set({ notificationFirstRunDone: true });
  }
  switch (operation) {
    case "copy":
    case "move":
      notificationMessage += " Folder: " + destination;
      break;
    case "tag":
      notificationMessage += " Tag: " + destination;
      break;
  }
  return notificationMessage;
}
