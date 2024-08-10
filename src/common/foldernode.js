/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

class BaseNode {
  constructor(parent, skipArchive=false) {
    this.parent = parent;
    this.skipArchive = skipArchive;
    this._children = Object.create(null);
  }

  sorter(a, b) {
    return 0;
  }

  child(x, create=true) {
    if (!x) {
      return this;
    }
    if (!(x in this._children) && create) {
      this._children[x] = new FolderNode(this, this.skipArchive);
    }

    return this._children[x];
  }

  * walk(sorter, includeSelf=true, yieldNodes=true) {
    if (includeSelf) {
      yield (yieldNodes ? this : this.item);
    }
    let children = Object.values(this._children);
    let sortFunc = sorter || this.sorter.bind(this);
    if (sortFunc) {
      children.sort(sortFunc);
    }

    for (let child of children) {
      yield* child.walk(sorter, true, yieldNodes);
    }
  }

  [Symbol.iterator]() {
    return this.walk();
  }
}

export class FolderNode extends BaseNode {
  static fromList(folders, accounts) {
    let accountMap = {};
    for (let account of accounts) {
      accountMap[account.item.id] = account;
    }

    let folderNodes = {};

    for (let folder of folders) {
      let folderNode = accountMap[folder.accountId]?.lookup(folder.path);
      if (folderNode) {
        if (!(folder.accountId in folderNodes)) {
          folderNodes[folder.accountId] = [];
        }
        folderNodes[folder.accountId].push(folderNode);
      }
    }

    return accounts.reduce((nodes, account) => nodes.concat(folderNodes[account.item.id] ?? []), []);
  }
  static getSortKey(folder) {
    const folderTypes = {
      inbox: 1,
      drafts: 2,
      templates: 3,
      sent: 4,
      archives: 5,
      junk: 6,
      trash: 7,
      outbox: 8,
    };

    return (folderTypes[folder.type] || 9);
  }

  get name() {
    return this.item.name;
  }

  get accountId() {
    return this.item.accountId;
  }

  get path() {
    return this.item.path;
  }

  get type() {
    return this.item.type;
  }

  sorter(a, b) {
    let sortA = FolderNode.getSortKey(a.item);
    let sortB = FolderNode.getSortKey(b.item);
    let sort = (sortA > sortB) - (sortB > sortA);
    if (sort != 0) {
      return sort;
    }

    return a.item.name.toLocaleLowerCase().localeCompare(b.item.name.toLocaleLowerCase());
  }

  add(item) {
    let node = this.lookup(item.path, true);
    node.item = item;

    if (item.type != "trash") {
      // Include the trash folder, but not folders placed within
      this.lookupSubfolders(item.subFolders);
    }
    return node;
  }

  lookupSubfolders(subFolders) {
    for (let subFolder of subFolders) {
      if (this.skipArchive && subFolder.type == "archives") {
        continue;
      }

      this.add(subFolder);
    }
  }

  lookup(path, create=false) {
    let parts = path.split("/");
    let node = this; // eslint-disable-line consistent-this
    for (let part of parts) {
      if (!node) {
        break;
      }
      node = node.child(part, create);
    }
    return node;
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

export class AccountNode extends FolderNode {
  constructor(account, skipArchive=false) {
    super(account, skipArchive);
    this.item = account;
    this.lookupSubfolders(account.folders);
  }

  [Symbol.iterator]() {
    return this.walk(null, false);
  }
}
