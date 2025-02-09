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
