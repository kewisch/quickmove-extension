/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

class TBFolderList extends HTMLElement {
  #pendingSearch;
  #pendingSearchTimeout;
  #enterPending;
  #showFolderPath = false;
  #accounts = {};
  #defaultFolders;
  #allFolders = [];

  static get style() {
    /*
     * CSS variables available
     *
     * --folder-list-background
     * --folder-list-color
     */
    return `
      * {
        box-sizing: border-box;
        text-align: start;
      }

      :host {
        all: initial;
        font: inherit;
        background-color: inherit;
        color: inherit;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .search-header {
        display: flex;
        flex-direction: column;
        border-bottom: 1px solid color-mix(in srgb, currentcolor 30%, transparent);
        padding: 5px 0;
      }

      .search-header:focus-within {
        padding: 5px 2px;
      }

      :host(:not([search])) .search-header {
        display: none;
      }


      .search-input {
        background-color: var(--folder-list-background);
        color: var(--folder-list-color);
        border: 1px solid color-mix(in srgb, currentcolor 30%, transparent);
        box-shadow: 0 0 0 0 color-mix(in srgb, currentcolor 30%, transparent);
        font: caption;
        padding: 6px;
        transition-duration: 250ms;
        transition-property: box-shadow;
        border-radius: 3px;
      }

      .folder-list-body {
        display: flex;
        flex-direction: column;
        padding: 5px 0;
        overflow-y: auto;
      }

      .folder-list-body:focus {
        outline: none;
      }


      .folder-item, .account-item {
        cursor: default;
        align-items: center;
        display: flex;
        flex-direction: row;
        line-height: 1.5em;
        border: 1px solid transparent;
        border-radius: 3px;
        padding: 2px 10px;
        margin: 1px 0;
        color: var(--folder-list-color);
      }
      .folder-item.selected {
        background-color: color-mix(in srgb, currentcolor 10%, transparent);
      }

      .account-item {
        background-color: color-mix(in srgb, currentcolor 6%, transparent);
        border: 1px solid color-mix(in srgb, currentcolor 30%, transparent);
      }

      .folder-item .icon, .account-item .icon {
        flex-grow: 0;
        flex-shrink: 0;
      }

      .folder-item > .text, .accoint-item > .text {
        flex-grow: 10;
      }

      .folder-item > .text-shortcut {
        justify-content: flex-end;
        margin-inline-start: 5px;
        font-size: 0.874em;
      }

      .folder-item > .icon {
        background: url("../images/folder/folder.svg") no-repeat 0 0;
        width: 16px;
        height: 16px;
        margin-inline-end: 5px;
      }

      .folder-item > .icon.folder-type-inbox {
        background-image: url("../images/folder/inbox.svg");
      }

      .folder-item > .icon.folder-type-sent {
        background-image: url("../images/folder/sent.svg");
      }

      .folder-item > .icon.folder-type-outbox {
        background-image: url("../images/folder/outbox.svg");
      }

      .folder-item > .icon.folder-type-drafts {
        background-image: url("../images/folder/draft.svg");
      }

      .folder-item > .icon.folder-type-templates {
        background-image: url("../images/folder/template.svg");
      }

      .folder-item > .icon.folder-type-junk {
        background-image: url("../images/folder/spam.svg");
      }

      .folder-item > .icon.folder-type-trash {
        background-image: url("../images/folder/trash.svg");
      }

      .folder-item > .icon.folder-type-virtual {
        background-image: url("../images/folder/folder-filter.svg");
      }

      .folder-item > .icon.folder-type-archives {
        background-image: url("../images/folder/archive.svg");
      }

      .account-item > .icon {
        background: url("../images/account/local.svg") no-repeat 0 0;
        width: 16px;
        height: 16px;
        margin-inline-end: 5px;
      }

      .account-item .icon.account-type-rss {
        background-image: url("../images/account/rss.svg");

      }

      .account-item .icon.account-type-imap,
      .account-item .icon.account-type-pop3 {
        background-image: url("../images/account/mail.svg");
      }

      .account-item .icon.account-type-nntp {
        background-image: url("../images/account/globe.svg");
      }
    `;
  }

  static get content() {
    return `
      <template class="folder-item-template">
        <div class="folder-item" part="folder-item">
          <div class="icon"></div>
          <div class="text"></div>
          <div class="text-shortcut"></div>
        </div>
      </template>
      <template class="account-item-template">
        <div class="account-item" part="account-item">
          <div class="icon"></div>
          <div class="text"></div>
        </div>
      </template>

      <div class="search-header" part="search-header">
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

    this.searchInputCallbackRaw = this.searchInputCallbackRaw.bind(this);
    this.folderListClick = this.folderListClick.bind(this);
    this.folderListSelect = this.folderListSelect.bind(this);
    this.folderListKeyDown = this.folderListKeyDown.bind(this);
    this.folderListSelectLeave = this.folderListSelectLeave.bind(this);
    this.searchKeyDownCallback = this.searchKeyDownCallback.bind(this);
    this.searchKeyUpCallback = this.searchKeyUpCallback.bind(this);
  }

  connectedCallback() {
    this.shadowRoot.querySelector(".search-input").addEventListener("input", this.searchInputCallbackRaw);
    this.shadowRoot.querySelector(".search-input").addEventListener("keydown", this.searchKeyDownCallback);
    this.shadowRoot.querySelector(".search-input").addEventListener("keyup", this.searchKeyUpCallback);
    this.shadowRoot.querySelector(".folder-list-body").addEventListener("click", this.folderListClick);
    this.shadowRoot.querySelector(".folder-list-body").addEventListener("keydown", this.folderListKeyDown);
    this.shadowRoot.querySelector(".folder-list-body").addEventListener("mouseover", this.folderListSelect);
    this.shadowRoot.querySelector(".folder-list-body").addEventListener("mouseleave", this.folderListSelectLeave);
  }

  disconnectedCallback() {
    this.shadowRoot.querySelector(".search-input").removeEventListener("input", this.searchInputCallbackRaw);
    this.shadowRoot.querySelector(".search-input").removeEventListener("keydown", this.searchKeyDownCallback);
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

  #ensureFolder(origin, direction) {
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
      let target = this.#ensureFolder(folderItem && folderItem[direction], direction);
      if (target) {
        this.selected = target;
        this.shadowRoot.querySelector(".folder-list-body").focus();
      } else if (event.key == "ArrowUp") {
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

  async searchKeyUpCallback(event) {
    if (event.key == "Enter") {
      if (this.#enterPending) {
        return;
      }

      if (this.#pendingSearch) {
        this.#enterPending = true;
        await this.#pendingSearch.promise;
      }
      let selected = this.selected || this.nthFolder(1);

      if (selected) {
        let customEvent = new CustomEvent("folder-selected", { detail: selected.folder });
        this.dispatchEvent(customEvent);
      }
      this.#enterPending = false;
      event.preventDefault();
    }
  }

  searchKeyDownCallback(event) {
    if (event.key == "ArrowDown") {
      this.selected = this.nthFolder(1);
      this.shadowRoot.querySelector(".folder-list-body").focus();
      event.preventDefault();
    }
  }

  searchInputCallbackRaw(event) {
    if (this.#pendingSearch) {
      clearTimeout(this.#pendingSearchTimeout);
    } else {
      this.#pendingSearch = {};
      this.#pendingSearch.promise = new Promise((resolve) => { this.#pendingSearch.resolve = resolve; });
    }

    this.#pendingSearchTimeout = setTimeout(() => {
      this.searchInputCallback();
      this.#pendingSearch.resolve();
      this.#pendingSearch = null;
    }, 200);
  }

  searchInputCallback() {
    this.repopulate();
  }

  #clearFolders() {
    let folderList = this.shadowRoot.querySelector(".folder-list-body");

    while (folderList.lastElementChild) {
      folderList.lastElementChild.remove();
    }
  }

  #addFolder(folder, depth=0) {
    let template = this.shadowRoot.querySelector(".folder-item-template");
    let body = this.shadowRoot.querySelector(".folder-list-body");

    let item = this.shadowRoot.ownerDocument.importNode(template.content, true);
    item.querySelector(".icon").classList.add("folder-type-" + (folder.type || "folder"));
    item.querySelector(".icon").style.marginInlineStart = (depth * 10) + "px";
    item.querySelector(".text").textContent = folder.name;

    let prettyFolderPathComponents = folder.path.split("/").filter((val) => {
      // Filter out [Gmail] and empty path components.
      return val !== "" && !val.includes("[");
    });

    if (this.#showFolderPath) {
      item.querySelector(".text-shortcut").textContent = prettyFolderPathComponents.slice(0, -1).join(" → ");
    }

    item.querySelector(".folder-item").folder = folder;
    item.querySelector(".folder-item").setAttribute("title", prettyFolderPathComponents.join(" → "));

    if (!body.lastElementChild || body.lastElementChild.folder.accountId != folder.accountId) {
      let accountTemplate = this.shadowRoot.querySelector(".account-item-template");
      let accountItem = this.shadowRoot.ownerDocument.importNode(accountTemplate.content, true);
      let account = this.#accounts[folder.accountId];

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
    return Object.values(this.#accounts);
  }

  set accounts(val) {
    this.#accounts = Object.fromEntries(val.map(account => [account.id, account]));
  }

  get allFolders() {
    return this.#allFolders;
  }

  set allFolders(val) {
    this.#allFolders = val;
    this.repopulate();
  }

  get defaultFolders() {
    return this.#defaultFolders;
  }

  set defaultFolders(val) {
    this.#defaultFolders = val;
    this.repopulate();
  }

  get searchValue() {
    return this.shadowRoot.querySelector(".search-input").value;
  }

  set searchValue(val) {
    this.shadowRoot.querySelector(".search-input").value = val;
    this.repopulate();
  }

  get showFolderPath() {
    return this.#showFolderPath;
  }

  set showFolderPath(val) {
    this.#showFolderPath = val;
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
    this.#clearFolders();

    if (lowerSearchTerm) {
      for (let folder of this.allFolders) {
        if (folder.name.toLowerCase().includes(lowerSearchTerm)) {
          this.#addFolder(folder, 0);
        }
      }
    } else if (this.defaultFolders) {
      for (let folder of this.defaultFolders) {
        this.#addFolder(folder, 0);
      }
    } else {
      for (let folder of this.allFolders) {
        let depth = (folder.path.match(/\//g) || []).length - 1;
        this.#addFolder(folder, depth);
      }
    }
  }
}

customElements.define("folder-list", TBFolderList);
