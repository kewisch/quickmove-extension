export const DEFAULT_PREFERENCES = {
  layout: "auto",
  markAsRead: true,
  maxRecentFolders: 15,
  showFolderPath: false,
  useLegacyShortcuts: false,
  skipArchive: true,
  defaultFolderSetting: "recent"
};

export async function getValidatedDefaultFolders(rootNode) {
  let prefs = await browser.storage.local.get({ defaultFolders: [] });
  let { missing, folderNodes } = rootNode.fromList(prefs.defaultFolders);

  if (missing.length) {
    let defaultFolders = folderNodes.map(node => ({ accountId: node.accountId, path: node.path }));
    await browser.storage.local.set({ defaultFolders });
  }

  return folderNodes;
}
