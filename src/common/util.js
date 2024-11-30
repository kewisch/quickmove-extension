export const DEFAULT_PREFERENCES = {
  layout: "auto",
  markAsRead: true,
  maxRecentFolders: 15,
  showFolderPath: false,
  useLegacyShortcuts: false,
  skipArchive: true,
  defaultFolderSetting: "recent"
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
