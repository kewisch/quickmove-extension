/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */


export default class BaseItemList extends HTMLElement {
  #pendingSearch;
  #pendingSearchTimeout;
  #enterPending;

  _defaultItems;
  _allItems = [];

  ignoreFocus = false;

  static get style() {
    /*
     * CSS variables available
     *
     * --item-list-background
     * --item-list-color
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

      :host([compact]) .search-header {
        padding: 0;
        border-bottom: 0;
      }
      :host([compact]) .list-body {
        padding: 2px 0;
      }
      :host([compact]) .item, :host([compact]) .header-item {
        padding: 0;
        margin: 0;
        line-height: 1.3em;
      }

      :host([compact]) .search-input:focus-visible {
        outline: none !important;
        border-color: #7AACFE;
      }

      :host(:not([delete])) .item > .delete {
        display: none;
      }

      :host([popup]) .list-body {
        box-shadow: 0px 2px 8px 0px rgba(0,0,0,0.75);
        margin: 0 10px 10px;
      }

      @media (prefers-color-scheme: dark) {
        :host([popup]) .list-body {
          box-shadow: 0px 2px 8px 0px rgba(179, 179, 179, 0.6);
        }
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
        background-color: var(--item-list-background);
        color: var(--item-list-color);
        border: 1px solid color-mix(in srgb, currentcolor 30%, transparent);
        box-shadow: 0 0 0 0 color-mix(in srgb, currentcolor 30%, transparent);
        font: caption;
        padding: 6px;
        transition-duration: 250ms;
        transition-property: box-shadow;
        border-radius: 3px;
      }

      .list-body {
        display: flex;
        flex-direction: column;
        padding: 2px;
        overflow-y: auto;
        border-radius: 3px;
      }
      .list-body:-moz-only-whitespace {
        display: none;
      }

      .list-body:focus {
        outline: none;
      }


      .item, .header-item {
        cursor: default;
        align-items: center;
        display: flex;
        flex-direction: row;
        line-height: 1.5em;
        border: 1px solid transparent;
        border-radius: 3px;
        padding: 2px 10px;
        margin: 1px 0;
        color: var(--item-list-color);
      }
      .item.selected {
        background-color: var(--item-list-focus, color-mix(in srgb, currentcolor 10%, transparent));
      }

      .header-item {
        background-color: color-mix(in srgb, currentcolor 6%, transparent);
        border: 1px solid color-mix(in srgb, currentcolor 30%, transparent);
      }

      .item .icon, .header-item .icon {
        flex-grow: 0;
        flex-shrink: 0;
      }

      .item > .text, .header-item > .text {
        flex-grow: 10;
      }

      .item > .text-shortcut {
        justify-content: flex-end;
        margin-inline-start: 5px;
        font-size: 0.874em;
      }

      .item > .icon {
        width: 16px;
        height: 16px;
        margin-inline-end: 5px;
      }

      .header-item > .icon {
        width: 16px;
        height: 16px;
        margin-inline-end: 5px;
      }

      .item > .delete {
        margin: 0 5px;
      }
    `;
  }
  static get headerItemTemplateContent() {
    return `
        <template class="header-item-template">
          <div class="header-item" part="header-item">
            <div class="icon"></div>
            <div class="text"></div>
          </div>
        </template>
      `;
  }

  static get itemTemplateContent() {
    return `
      <template class="item-template">
        <div class="item" part="item">
          <div class="icon"></div>
          <div class="text"></div>
          <div class="text-shortcut"></div>
          <button class="delete">&times;</button>
        </div>
      </template>
    `;
  }

  static get content() {
    return `
      ${this.itemTemplateContent}
      ${this.headerItemTemplateContent}

      <div class="search-header" part="search-header">
        <input type="text" class="search-input" autocomplete="off"/>
      </div>
      <div class="list-body" tabindex="0">
      </div>
    `;
  }

  constructor() {
    super();

    let shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${this.constructor.style}</style>${this.constructor.content}`;

    this.searchInputCallbackRaw = this.searchInputCallbackRaw.bind(this);
    this.itemListClick = this.itemListClick.bind(this);
    this.itemListSelect = this.itemListSelect.bind(this);
    this.itemListKeyDown = this.itemListKeyDown.bind(this);
    this.itemListSelectLeave = this.itemListSelectLeave.bind(this);
    this.searchKeyDownCallback = this.searchKeyDownCallback.bind(this);
    this.searchKeyUpCallback = this.searchKeyUpCallback.bind(this);
  }

  connectedCallback() {
    let searchInput = this.search;
    let listBody = this.shadowRoot.querySelector(".list-body");

    searchInput.placeholder = this.getAttribute("placeholder") || "";

    searchInput.addEventListener("input", this.searchInputCallbackRaw);
    listBody.addEventListener("click", this.itemListClick);
    if (!this.getAttribute("readonly")) {
      searchInput.addEventListener("keydown", this.searchKeyDownCallback);
      searchInput.addEventListener("keyup", this.searchKeyUpCallback);
      listBody.addEventListener("keydown", this.itemListKeyDown);
      listBody.addEventListener("mouseover", this.itemListSelect);
      listBody.addEventListener("mouseleave", this.itemListSelectLeave);
    }
  }

  disconnectedCallback() {
    let searchInput = this.search;
    let listBody = this.shadowRoot.querySelector(".list-body");

    searchInput.removeEventListener("input", this.searchInputCallbackRaw);
    listBody.removeEventListener("click", this.itemListClick);
    if (!this.getAttribute("readonly")) {
      searchInput.removeEventListener("keydown", this.searchKeyDownCallback);
      searchInput.removeEventListener("keyup", this.searchKeyUpCallback);
      listBody.removeEventListener("keydown", this.itemListKeyDown);
      listBody.removeEventListener("mouseover", this.itemListSelect);
      listBody.removeEventListener("mouseleave", this.itemListSelectLeave);
    }
  }

  get search() {
    return this.shadowRoot.querySelector(".search-input");
  }

  get selected() {
    return this.shadowRoot.querySelector(".list-body .item.selected");
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

  nthItem(n) {
    let itemList = this.shadowRoot.querySelector(".list-body");
    let listItem = itemList.firstElementChild;
    let direction = "nextElementSibling";

    if (n < 0) {
      listItem = itemList.lastElementChild;
      direction = "previousElementSibling";
      n = -n - 1;
    }

    for (; n > 0; n--) {
      while (listItem && !listItem.classList.contains("item")) {
        listItem = listItem[direction];
      }
    }
    return listItem;
  }

  itemListSelectLeave(event) {
    this.selected = null;
  }

  itemListSelect(event) {
    let item = event.target.closest(".item");
    if (!item || this.ignoreFocus) {
      return;
    }

    this.selected = item;
    this.shadowRoot.querySelector(".list-body").focus();
  }

  #ensureListItem(origin, direction) {
    let target = origin;
    while (target && !target.classList.contains("item")) {
      target = target[direction];
    }
    return target;
  }

  itemListKeyDown(event) {
    if (event.isComposing || event.keyCode == 229) {
      return;
    }
    if (event.key == "ArrowDown" || event.key == "ArrowUp" || event.key == "Tab") {
      let direction;
      if (event.key == "ArrowDown" || (event.key == "Tab" && !event.shiftKey)) {
        direction = "nextElementSibling";
      } else {
        direction = "previousElementSibling";
      }

      let listItem = this.selected;
      let target = this.#ensureListItem(listItem && listItem[direction], direction);
      if (target) {
        this.selected = target;
        this.shadowRoot.querySelector(".list-body").focus();
      } else {
        this.focusSearch();
      }
      event.preventDefault();
    } else if (event.key == "Enter") {
      this.dispatchSelect(this.selected);
    }
  }

  itemListClick(event) {
    if (this.getAttribute("delete") && event.target.classList.contains("delete")) {
      let listItem = event.target.closest(".item");
      let customEvent = new CustomEvent("item-deleted", { detail: listItem.item });
      this.dispatchEvent(customEvent);
    } else if (!this.getAttribute("readonly")) {
      this.dispatchSelect(event.target.closest(".item"));
    }
  }

  dispatchSelect(item) {
    let listItem = item || this.selected;
    if (listItem) {
      let customEvent = new CustomEvent("item-selected", { detail: listItem.item });
      this.dispatchEvent(customEvent);
    }
  }

  async searchKeyUpCallback(event) {
    if (event.isComposing || event.keyCode == 229) {
      return;
    }

    if (event.key == "Enter") {
      if (this.#enterPending) {
        return;
      }

      if (this.#pendingSearch) {
        this.#enterPending = true;
        await this.#pendingSearch.promise;
      }
      let selected = this.selected || this.nthItem(1);

      if (selected) {
        let customEvent = new CustomEvent("item-selected", { detail: selected.item });
        this.dispatchEvent(customEvent);
      }
      this.#enterPending = false;
      event.preventDefault();
    }
  }

  searchKeyDownCallback(event) {
    if (event.isComposing || event.keyCode == 229) {
      return;
    }

    if (event.key == "ArrowDown" || (event.key == "Tab" && !event.shiftKey)) {
      this.selected = this.nthItem(1);
      this.shadowRoot.querySelector(".list-body").focus();
      event.preventDefault();
    } else if (event.key == "ArrowUp" || (event.key == "Tab" && event.shiftKey)) {
      this.selected = this.nthItem(-1);
      this.shadowRoot.querySelector(".list-body").focus();
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

  #clearItems() {
    let itemList = this.shadowRoot.querySelector(".list-body");

    while (itemList.lastElementChild) {
      itemList.lastElementChild.remove();
    }
  }

  _addItem(item) {
    let template = this.shadowRoot.querySelector(".item-template");
    let body = this.shadowRoot.querySelector(".list-body");

    let itemNode = this.shadowRoot.ownerDocument.importNode(template.content, true);
    itemNode.querySelector(".text").textContent = item.name;
    itemNode.querySelector(".item").item = item;

    return body.appendChild(item);
  }


  get allItems() {
    return this._allItems;
  }

  set allItems(val) {
    this._allItems = val;
    this.repopulate();
  }

  get defaultItems() {
    return this._defaultItems;
  }

  set defaultItems(val) {
    this._defaultItems = val;
    this.repopulate();
  }

  initItems(allItems, defaultItems) {
    this._allItems = allItems;
    this._defaultItems = defaultItems;
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
    let selected = this.shadowRoot.querySelector(".list-body .item.selected");
    if (selected) {
      selected.classList.remove("selected");
    }
  }

  repopulate() {
    let lowerSearchTerm = this.searchValue.toLowerCase();
    this.#clearItems();

    if (lowerSearchTerm) {
      let searchWords = lowerSearchTerm.split(/\s+/);

      for (let item of this.allItems) {
        let itemText = this.getItemText(item).toLowerCase();
        let mismatch = false;
        for (let word of searchWords) {
          if (word && !itemText.includes(word)) {
            mismatch = true;
            break;
          }
        }

        if (!mismatch) {
          this._addItem(item, BaseItemList.MODE_SEARCH);
        }
      }
    } else if (this.defaultItems) {
      for (let item of this.defaultItems) {
        this._addItem(item, BaseItemList.MODE_DEFAULT);
      }
    } else {
      for (let item of this.allItems) {
        this._addItem(item, BaseItemList.MODE_ALL);
      }
    }
  }
}

BaseItemList.MODE_SEARCH = 1;
BaseItemList.MODE_DEFAULT = 2;
BaseItemList.MODE_ALL = 3;
