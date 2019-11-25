/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019 */

class TBFolderList extends HTMLElement {
  /**
   * Variables available for styling:
   *
   * --folder-list-search-bgcolor
   * --folder-list-search-color
   *
   * --folder-list-item-bgcolor-hover
   * --folder-list-item-color-hover
   * --folder-list-item-border
   * --folder-list-item-bgcolor-active
   * --folder-list-item-color-active

   * --folder-list-item-color-disabled
   * --folder-list-item-shortcut-color
   */
  static get style() {
    return `
      * {
        box-sizing: border-box;
        text-align: start;
      }

      :host {
        all: initial;
        font: inherit;
        background-color: inherit;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .search-header {
        display: flex;
        flex-direction: column;
        border-bottom: 1px solid rgba(0, 0, 0, 0.15);
        padding: 5px;
      }

      :host(:not([search])) .search-header {
        display: none;
      }


      .search-input {
        background-color: var(--folder-list-search-bgcolor, #fff);
        color: var(--folder-list-search-color, #000);
        border: 1px solid var(--folder-list-search-border, #b1b1b1);
        box-shadow: 0 0 0 0 rgba(97, 181, 255, 0);
        font: caption;
        padding: 1px 6px;
        transition-duration: 250ms;
        transition-property: box-shadow;
      }

      .folder-list-body {
        display: flex;
        flex-direction: column;
        padding: 5px 0;
        overflow: auto;
      }

      .folder-item, .account-item {
        cursor: default;
        align-items: center;
        display: flex;
        flex-direction: row;
        line-height: 1.5em;
        border-bottom: 1px solid transparent;
        border-top: 1px solid transparent;
        padding: 0 10px;
      }

      .account-item {
        background-color: rgba(0, 0, 0, 0.06);
        color: var(--folder-list-item-color);
        border-top: 1px solid #999;
        border-bottom: 1px solid #999;
      }

      .folder-item {
        color: var(--folder-list-item-color);
      }

      .folder-item:not(.disabled).selected {
        background-color: var(--folder-list-item-bgcolor-hover, rgba(0, 0, 0, 0.06));
        color: var(--folder-list-item-color-hover, rgba(0, 0, 0, 0.06));
        border-bottom: 1px solid var(--folder-list-item-border, rgba(0, 0, 0, 0.1));
        border-top: 1px solid var(--folder-list-item-border, rgba(0, 0, 0, 0.1));
      }

      .folder-item:not(.disabled).selected:active {
        background-color: var(--folder-list-item-bgcolor-active, rgba(0, 0, 0, 0.1));
        color: var(--folder-list-item-color-active, inherit);
      }

      .folder-item.disabled {
        color: var(--folder-list-item-color-disabled, #999);
      }

      .folder-item .icon, .account-item .icon {
        flex-grow: 0;
        flex-shrink: 0;
      }

      .folder-item > .text, .accoint-item > .text {
        flex-grow: 10;
      }

      .folder-item > .text-shortcut {
        color: var(--folder-list-item-shortcut-color, #808080);
        font-family: "Lucida Grande", caption;
        font-size: .847em;
        justify-content: flex-end;
      }

      .folder-item > .icon {
        background: url(../images/folder-pane.png) no-repeat 0 0;
        width: 16px;
        height: 16px;
        margin-inline-end: 5px;
      }

      .folder-item > .icon.folder-type-inbox {
        background-position: -32px;
      }
      .folder-item > .icon.folder-type-sent {
        background-position: -48px;
      }
      .folder-item > .icon.folder-type-outbox {
        background-position: -64px;
      }
      .folder-item > .icon.folder-type-drafts {
        background-position: -80px;
      }
      .folder-item > .icon.folder-type-templates {
        background-position: -96px;
      }
      .folder-item > .icon.folder-type-junk {
        background-position: -112px;
      }
      .folder-item > .icon.folder-type-trash {
        background-position: -128px;
      }
      .folder-item > .icon.folder-type-virtual {
        background-position: -160px;
      }
      .folder-item > .icon.folder-type-archive {
        background-position: -192px;
      }

      .account-item > .icon {
        background: url(../images/server.png) no-repeat 0 0;
        width: 16px;
        height: 16px;
        margin-inline-end: 5px;
      }
      .account-item .icon.account-type-rss {
        background-position: -80px;

      }
      .account-item .icon.account-type-imap,
      .account-item .icon.account-type-pop3 {
        background-position: -16px;
      }
      .account-item .icon.account-type-nntp {
        background-position: -48px;
      }
      .account-item .icon.account-type-none {
        background-position: -32px;
      }

      @media (min-resolution: 2dppx) {
        .folder-item > .icon {
          background: url(../images/folder-pane@2x.png) no-repeat 0 0;
          background-size: cover;
        }
        .account-item > .icon {
          background: url(../images/server@2x.png) no-repeat 0 0;
          background-size: cover;
        }
      }
    `;
  }

  static get content() {
    return `
      <template class="folder-item-template">
        <div class="folder-item">
          <div class="icon"></div>
          <div class="text"></div>
          <div class="text-shortcut"></div>
        </div>
      </template>
      <template class="account-item-template">
        <div class="account-item">
          <div class="icon"></div>
          <div class="text"></div>
        </div>
      </template>

      <div class="search-header">
        <input type="text" class="search-input" autocomplete="off"/>
      </div>
      <div class="folder-list-body" tabindex="0">
      </div>
    `;
  }

  constructor() {
    super();

    let shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${TBFolderList.style}</style>${TBFolderList.content}`;

    function debounce(callback, wait) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(callback.bind(this, ...args), wait);
      };
    }

    this.searchInputCallback = debounce(this.searchInputCallback.bind(this), 200);
    this.folderListClick = this.folderListClick.bind(this);
    this.folderListSelect = this.folderListSelect.bind(this);
    this.folderListKeyDown = this.folderListKeyDown.bind(this);
    this.folderListSelectLeave = this.folderListSelectLeave.bind(this);
    this.searchKeyCallback = this.searchKeyCallback.bind(this);

    this._accounts = {};
    this._defaultFolders = null;
  }

  connectedCallback() {
    this.shadowRoot.querySelector(".search-input").addEventListener("input", this.searchInputCallback);
    this.shadowRoot.querySelector(".search-input").addEventListener("keyup", this.searchKeyCallback);
    this.shadowRoot.querySelector(".folder-list-body").addEventListener("click", this.folderListClick);
    this.shadowRoot.querySelector(".folder-list-body").addEventListener("keydown", this.folderListKeyDown);
    this.shadowRoot.querySelector(".folder-list-body").addEventListener("mouseover", this.folderListSelect);
    this.shadowRoot.querySelector(".folder-list-body").addEventListener("mouseleave", this.folderListSelectLeave);
  }

  disconnectedCallback() {
    this.shadowRoot.querySelector(".search-input").removeEventListener("input", this.searchInputCallback);
    this.shadowRoot.querySelector(".search-input").removeEventListener("keyup", this.searchKeyCallback);
    this.shadowRoot.querySelector(".folder-list-body").removeEventListener("click", this.folderListClick);
    this.shadowRoot.querySelector(".folder-list-body").removeEventListener("keydown", this.folderListKeyDown);
    this.shadowRoot.querySelector(".folder-list-body").removeEventListener("mouseover", this.folderListSelect);
    this.shadowRoot.querySelector(".folder-list-body").removeEventListener("mouseleave", this.folderListSelectLeave);
  }

  get search() {
    return this.shadowRoot.querySelector(".search-input");
  }

  get selected() {
    return this.shadowRoot.querySelector(".folder-list-body .folder-item.selected");
  }
  set selected(item) {
    let selected = this.selected;
    if (selected) {
      selected.classList.remove("selected");
    }

    if (item) {
      item.classList.add("selected");
      item.scrollIntoView({ block: "nearest", inline: "start" });
    }
  }

  nthFolder(n) {
    let folderList = this.shadowRoot.querySelector(".folder-list-body");
    let topFolderItem = folderList.firstElementChild;
    for (; n > 0; n--) {
      while (topFolderItem && !topFolderItem.classList.contains("folder-item")) {
        topFolderItem = topFolderItem.nextElementSibling;
      }
    }
    return topFolderItem;
  }

  folderListSelectLeave(event) {
    this.selected = null;
  }

  folderListSelect(event) {
    let item = event.target.closest(".folder-item");
    if (!item) {
      return;
    }

    this.selected = item;
    this.shadowRoot.querySelector(".folder-list-body").focus();
  }

  _ensureFolder(origin, direction) {
    let target = origin;
    while (target && !target.classList.contains("folder-item")) {
      target = target[direction];
    }
    return target;
  }

  folderListKeyDown(event) {
    if (event.key == "ArrowDown" || event.key == "ArrowUp") {
      let direction = event.key == "ArrowDown" ? "nextElementSibling" : "previousElementSibling";
      let folderItem = this.selected;
      let target = this._ensureFolder(folderItem && folderItem[direction], direction);
      if (target) {
        this.selected = target;
        this.shadowRoot.querySelector(".folder-list-body").focus();
      } else {
        this.focusSearch();
      }
      event.preventDefault();
    } else if (event.key == "Enter") {
      this.dispatchSelect(this.selected);
    }
  }

  folderListClick(event) {
    this.dispatchSelect(event.target.closest(".folder-item"));
  }

  dispatchSelect(item) {
    let folderItem = item || this.selected;
    if (folderItem) {
      let customEvent = new CustomEvent("folder-selected", { detail: folderItem.folder });
      this.dispatchEvent(customEvent);
    }
  }

  searchKeyCallback(event) {
    if (event.key == "Enter") {
      let selected = this.selected || this.nthFolder(1);

      if (selected) {
        let customEvent = new CustomEvent("folder-selected", { detail: selected.folder });
        this.dispatchEvent(customEvent);
      }
    } else if (event.key == "ArrowDown") {
      this.selected = this.nthFolder(1);
      this.shadowRoot.querySelector(".folder-list-body").focus();
    }
  }

  searchInputCallback() {
    this.repopulate();
  }

  _clearFolders() {
    let folderList = this.shadowRoot.querySelector(".folder-list-body");

    while (folderList.lastElementChild) {
      folderList.lastElementChild.remove();
    }
  }

  _addFolder(folder, depth=0) {
    let template = this.shadowRoot.querySelector(".folder-item-template");
    let body = this.shadowRoot.querySelector(".folder-list-body");

    let item = this.shadowRoot.ownerDocument.importNode(template.content, true);
    item.querySelector(".icon").classList.add("folder-type-" + (folder.type || "folder"));
    item.querySelector(".icon").style.marginInlineStart = (depth * 10) + "px";
    item.querySelector(".text").textContent = folder.name;

    item.querySelector(".folder-item").folder = folder;
    item.querySelector(".folder-item").setAttribute("title", folder.path);

    if (!body.lastElementChild || body.lastElementChild.folder.accountId != folder.accountId) {
      let accountTemplate = this.shadowRoot.querySelector(".account-item-template");
      let accountItem = this.shadowRoot.ownerDocument.importNode(accountTemplate.content, true);
      let account = this._accounts[folder.accountId];

      if (account) {
        accountItem.querySelector(".text").textContent = account.name;
        accountItem.querySelector(".icon").classList.add("account-type-" + account.type);

        accountItem.querySelector(".account-item").account = account;
        body.appendChild(accountItem);
      }
    }

    body.appendChild(item);
  }

  get accounts() {
    return Object.values(this._accounts);
  }

  set accounts(val) {
    this._accounts = Object.fromEntries(val.map(account => [account.id, account]));
  }

  get allFolders() {
    return this._allFolders;
  }

  set allFolders(val) {
    this._allFolders = val;
    this.repopulate();
  }

  get defaultFolders() {
    return this._defaultFolders;
  }

  set defaultFolders(val) {
    this._defaultFolders = val;
    this.repopulate();
  }

  get searchValue() {
    return this.shadowRoot.querySelector(".search-input").value;
  }

  set searchValue(val) {
    this.shadowRoot.querySelector(".search-input").value = val;
    this.repopulate();
  }

  focusSearch() {
    this.search.focus();
    let selected = this.shadowRoot.querySelector(".folder-list-body .folder-item.selected");
    if (selected) {
      selected.classList.remove("selected");
    }
  }

  repopulate() {
    let lowerSearchTerm = this.searchValue.toLowerCase();
    this._clearFolders();

    if (lowerSearchTerm) {
      for (let folder of this.allFolders) {
        if (folder.name.toLowerCase().includes(lowerSearchTerm)) {
          this._addFolder(folder, 0);
        }
      }
    } else if (this.defaultFolders) {
      for (let folder of this.defaultFolders) {
        this._addFolder(folder, 0);
      }
    } else {
      for (let folder of this.allFolders) {
        let depth = (folder.path.match(/\//g) || []).length - 1;
        this._addFolder(folder, depth);
      }
    }
  }
}

customElements.define("folder-list", TBFolderList);
