export const DEFAULT_PREFERENCES = {
  layout: "auto",
  markAsRead: true,
  maxRecentFolders: 15,
  showFolderPath: false,
  useLegacyShortcuts: false,
  skipArchive: true,
  defaultFolderSetting: "recent"
};

export async function getValidatedDefaultFolders(accountNodes) {
  let prefs = await browser.storage.local.get({ defaultFolders: [] });
  let accountMap = Object.fromEntries(accountNodes.map(node => [node.item.id, node]));
  let defaultFolders = [];

  for (let folder of prefs.defaultFolders) {
    let node = accountMap[folder.accountId].lookup(folder.path, false);
    if (node) {
      defaultFolders.push(node.item);
    }
  }

  if (defaultFolders.length < prefs.defaultFolders.length) {
    await browser.storage.local.set({ defaultFolders });
  }

  return defaultFolders;
}
