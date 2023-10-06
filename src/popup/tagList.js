/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch */

import BaseItemList from "./baseItemList.js";

class TBTagList extends BaseItemList {
  getItemText(item) {
    return item.tag;
  }

  _addItem(tag) {
    let template = this.shadowRoot.querySelector(".item-template");
    let body = this.shadowRoot.querySelector(".list-body");

    let item = this.shadowRoot.ownerDocument.importNode(template.content, true);
    item.querySelector(".icon").style.backgroundColor = tag.color;
    item.querySelector(".text").textContent = tag.tag;
    item.querySelector(".item").item = tag;

    body.appendChild(item);
  }
}

customElements.define("tag-list", TBTagList);
