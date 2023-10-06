import BaseItemList from "./baseItemList.js";

class TBFolderList extends BaseItemList {
  #showFolderPath = false;
  #accounts = {};

  static get style() {
    return super.style + `
      .item > .icon {
        background: url("../images/folder/folder.svg") no-repeat 0 0;
      }

      .item > .icon.folder-type-inbox {
        background-image: url("../images/folder/inbox.svg");
      }

      .item > .icon.folder-type-sent {
        background-image: url("../images/folder/sent.svg");
      }

      .item > .icon.folder-type-outbox {
        background-image: url("../images/folder/outbox.svg");
      }

      .item > .icon.folder-type-drafts {
        background-image: url("../images/folder/draft.svg");
      }

      .item > .icon.folder-type-templates {
        background-image: url("../images/folder/template.svg");
      }

      .item > .icon.folder-type-junk {
        background-image: url("../images/folder/spam.svg");
      }

      .item > .icon.folder-type-trash {
        background-image: url("../images/folder/trash.svg");
      }

      .item > .icon.folder-type-virtual {
        background-image: url("../images/folder/folder-filter.svg");
      }

      .item > .icon.folder-type-archives {
        background-image: url("../images/folder/archive.svg");
      }

      .header-item > .icon {
        background: url("../images/account/local.svg") no-repeat 0 0;
      }

      .header-item .icon.account-type-rss {
        background-image: url("../images/account/rss.svg");

      }

      .header-item .icon.account-type-imap,
      .header-item .icon.account-type-pop3 {
        background-image: url("../images/account/mail.svg");
      }

      .header-item .icon.account-type-nntp {
        background-image: url("../images/account/globe.svg");
      }
    `;
  }

  getItemText(folderNode) {
    return folderNode.item.name;
  }

  _addItem(folderNode, mode) {
    // let depth = mode == BaseItemList.MODE_ALL ? (folderNode.path.match(/\//g) || []).length - 1 : 0;
    let depth = 0;
    let template = this.shadowRoot.querySelector(".item-template");
    let body = this.shadowRoot.querySelector(".list-body");

    let item = this.shadowRoot.ownerDocument.importNode(template.content, true);
    item.querySelector(".icon").classList.add("folder-type-" + (folderNode.type || "folder"));
    item.querySelector(".icon").style.marginInlineStart = (depth * 10) + "px";

    let prettyFolderPathComponents = folderNode.fullNameParts.filter((val) => {
      // Filter out [Gmail] and empty path components.
      return val !== "" && !val.includes("[");
    });

    let compact = this.hasAttribute("compact");

    if (compact) {
      if (this.#showFolderPath) {
        item.querySelector(".text").textContent = prettyFolderPathComponents.join("→");
      } else {
        item.querySelector(".text").textContent = folderNode.name;
        item.querySelector(".item").setAttribute("title", prettyFolderPathComponents.join(" → "));
      }
    } else {
      if (this.#showFolderPath) {
        item.querySelector(".text-shortcut").textContent = prettyFolderPathComponents.slice(0, -1).join(" → ");
      }
      item.querySelector(".text").textContent = folderNode.name;
      item.querySelector(".item").setAttribute("title", prettyFolderPathComponents.join(" → "));
    }

    item.querySelector(".item").item = folderNode.item;

    if (!body.lastElementChild || body.lastElementChild.item.accountId != folderNode.accountId) {
      let accountTemplate = this.shadowRoot.querySelector(".header-item-template");
      let accountItem = this.shadowRoot.ownerDocument.importNode(accountTemplate.content, true);
      let account = this.#accounts[folderNode.accountId];

      if (account) {
        accountItem.querySelector(".text").textContent = account.name;
        accountItem.querySelector(".icon").classList.add("account-type-" + account.type);

        accountItem.querySelector(".header-item").account = account;
        body.appendChild(accountItem);
      }
    }

    body.appendChild(item);
  }

  get accounts() {
    return Object.values(this.#accounts);
  }

  set accounts(val) {
    this.#accounts = Object.fromEntries(val.map(account => [account.id, account]));
  }

  initItems(allItems, defaultItems, showFolderPath) {
    this._allItems = allItems;
    this._defaultItems = defaultItems;
    this.#showFolderPath = showFolderPath;
    this.repopulate();
  }

  get showFolderPath() {
    return this.#showFolderPath;
  }

  set showFolderPath(val) {
    this.#showFolderPath = val;
    this.repopulate();
  }
}
customElements.define("folder-list", TBFolderList);
