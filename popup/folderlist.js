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
      }

      .folder-item {
        align-items: center;
        display: flex;
        flex-direction: row;
        height: 1.846em;
        padding: 0 1.231em;
      }

      .folder-item:not(.disabled):hover {
        background-color: var(--folder-list-item-bgcolor-hover, rgba(0, 0, 0, 0.06));
        color: var(--folder-list-item-color-hover, rgba(0, 0, 0, 0.06));
        border-bottom: 1px solid var(--folder-list-item-border, rgba(0, 0, 0, 0.1));
        border-top: 1px solid var(--folder-list-item-border, rgba(0, 0, 0, 0.1));
      }

      .folder-item:not(.disabled):hover:active {
        background-color: var(--folder-list-item-bgcolor-active, rgba(0, 0, 0, 0.1));
        color: var(--folder-list-item-color-active, inherit);
      }

      .folder-item.disabled {
        color: var(--folder-list-item-color-disabled, #999);
      }

      .folder-item .icon {
        flex-grow: 0;
        flex-shrink: 0;
      }

      .folder-item > .text {
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

      @media (min-resolution: 2dppx) {
        .folder-item > .icon {
          background: url(../images/folder-pane@2x.png) no-repeat 0 0;
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
        
      <div class="search-header">
        <input type="text" class="search-input" autocomplete="off"/>
      </div>
      <div class="folder-list-body">
      </div>
    `;
  }

  constructor() {
    super();

    let shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${TBFolderList.style}</style>${TBFolderList.content}`;

    this.searchInputCallback = this.searchInputCallback.bind(this);
    this.folderListClick = this.folderListClick.bind(this);
  }

  connectedCallback() {
    this.shadowRoot.querySelector(".search-input").addEventListener("input", this.searchInputCallback);
    this.shadowRoot.querySelector(".folder-list-body").addEventListener("click", this.folderListClick);
  }

  disconnectedCallback() {
    this.shadowRoot.querySelector(".search-input").removeEventListener("input", this.searchInputCallback);
    this.shadowRoot.querySelector(".folder-list-body").removeEventListener("click", this.folderListClick);
  }

  folderListClick(event) {
    let folderItem = event.target.closest(".folder-item");
    let customEvent = new CustomEvent("folder-selected", { detail: folderItem.folder });
    this.dispatchEvent(customEvent);
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
    item.querySelector(".icon").classList.add("folder-type-" + folder.type);
    item.querySelector(".icon").style.marginInlineStart = (depth * 10) + "px";
    item.querySelector(".text").textContent = folder.name;

    item.folder = folder;

    body.appendChild(item);
  }

  get allFolders() {
    return this._allFolders;
  }

  set allFolders(val) {
    this._allFolders = val;
    this.repopulate();
  }

  get defaultFolders() {
    return this._defaultFolders || this._allFolders;
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

  repopulate() {
    let lowerSearchTerm = this.searchValue.toLowerCase();
    this._clearFolders();

    if (lowerSearchTerm) {
      for (let folder of this.allFolders) {
        if (folder.name.toLowerCase().includes(lowerSearchTerm)) {
          let depth = (folder.path.match(/\//g) || []).length - 1;
          this._addFolder(folder.name, folder.type, depth);
        }
      }
    } else {
      for (let folder of this.defaultFolders) {
        let depth = (folder.path.match(/\//g) || []).length - 1;
        this._addFolder(folder, depth);
      }
    }
  }
}

customElements.define("folder-list", TBFolderList);
