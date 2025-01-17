/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

class BaseNode {
  _childClass = BaseNode;

  constructor(parent, item) {
    this.parent = parent;
    this._children = Object.create(null);
    this.item = item;
  }

  get name() {
    return this.item.name;
  }

  child(x, create=true, item=null) {
    if (!x) {
      return this;
    }
    if (!(x in this._children) && create) {
      let childClass = this._childClass;
      this._children[x] = new childClass(this, item);
    }

    return this._children[x];
  }

  expandFolders(subFolders) {
    let skipArchive = this.root.skipArchive;
    let folderMap = this.root.folderMap;

    this._children = Object.create(null);

    for (let subFolder of subFolders || []) {
      let specialUse = new Set(subFolder.specialUse);

      if (skipArchive && specialUse.has("archives")) {
        continue;
      }

      let node = this.child(subFolder.id, true, subFolder);
      folderMap.set(FolderNode.folderKey(subFolder.accountId, subFolder.path), node);
      this._children[subFolder.id] = node;

      if (subFolder.subFolders && !specialUse.has("trash")) {
        node.expandFolders(subFolder.subFolders);
      }
    }
  }

  * walk(includeSelf=true, yieldNodes=true) {
    if (includeSelf) {
      yield (yieldNodes ? this : this.item);
    }
    for (let child of Object.values(this._children)) {
      yield* child.walk(true, yieldNodes);
    }
  }

  [Symbol.iterator]() {
    return this.walk();
  }

  get fullNameParts() {
    let parts = [];
    let node = this; // eslint-disable-line consistent-this
    while (node && !(node instanceof AccountNode)) {
      parts.unshift(node.item.name);
      node = node.parent;
    }

    return parts;
  }
}

export class FolderNode extends BaseNode {
  _childClass = FolderNode;
  #fullSearchString = null;

  static folderKey(accountId, path) {
    return `${accountId}://${path}`;
  }

  get id() {
    return this.item.id;
  }

  get canFileMessages() {
    return !this.item.isTag && !this.item.isVirtual && !this.item.isUnified;
  }

  get root() {
    return this.parent.root;
  }

  get account() {
    return this.parent.account;
  }

  get accountId() {
    return this.item.accountId;
  }

  get path() {
    return this.item.path;
  }

  get type() {
    if (this.item.isTag) {
      return "tag";
    }
    return this.item.specialUse?.[0];
  }

  get fullSearchString() {
    if (!this.#fullSearchString) {
      this.#fullSearchString = this.fullNameParts.join("/");
    }
    return this.#fullSearchString;
  }
}

export class VirtualNode extends FolderNode {
  get canFileMessages() {
    return false;
  }

  get accountId() {
    return this.account.item.id;
  }
}

export class AccountNode extends BaseNode {
  _childClass = FolderNode;

  [Symbol.iterator]() {
    return this.walk(null, false);
  }

  get root() {
    return this.parent;
  }

  get account() {
    return this;
  }

  get type() {
    return this.item.type;
  }
}

export class VirtualAccountNode extends AccountNode {
  _childClass = VirtualNode;
}

export class RootNode extends BaseNode {
  _childClass = AccountNode;

  constructor({ accounts, skipArchive=false, tagFolders=null, unifiedFolders=null }) {
    super(null, null);
    this.skipArchive = skipArchive;
    this.folderMap = new Map();
    this.accounts = accounts;
    this.tagFolders = tagFolders;
    this.unifiedFolders = unifiedFolders;

    this.expandAccounts();
  }

  get name() {
    return "Root";
  }

  get root() {
    return this;
  }

  reindex() {
    this.expandAccounts();
  }

  expandAccounts() {
    this._children = Object.create(null);

    for (let account of this.accounts) {
      let node = this.child(account.id, true, account);
      this._children[account.id] = node;

      node.expandFolders(account.rootFolder.subFolders);
    }

    if (this.tagFolders) {
      let tagAccount = new VirtualAccountNode(this, {
        id: "##tags",
        name: "Tags",
        type: "tags",
        rootFolder: {
          name: "Root",
          subFolders: this.tagFolders
        }
      });
      this._children["##tags"] = tagAccount;
      tagAccount.expandFolders(this.tagFolders);
    }

    if (this.unifiedFolders) {
      let unifiedAccount = new VirtualAccountNode(this, {
        id: "##unified",
        name: "Unified Folders",
        type: "unified",
        rootFolder: {
          name: "Root",
          subFolders: this.unifiedFolders
        }
      });
      this._children["##unified"] = unifiedAccount;
      unifiedAccount.expandFolders(this.unifiedFolders);
    }
  }

  get accountNodes() {
    return Object.values(this._children);
  }

  get folderNodes() {
    return [...this.walkFolders()];
  }

  * walkFolders() {
    for (let child of Object.values(this._children)) {
      yield* child.walk(false);
    }
  }

  fromList(folders) {
    let missing = [];
    let folderNodes = folders.reduce((acc, folder) => {
      let node = this.folderMap.get(FolderNode.folderKey(folder.accountId, folder.path));
      if (node) {
        acc.push(node);
      } else {
        missing.push(folder);
      }
      return acc;
    }, []);

    return { missing, folderNodes };
  }

  findFolder(item) {
    return this.folderMap.get(FolderNode.folderKey(item.accountId, item.path));
  }
}
