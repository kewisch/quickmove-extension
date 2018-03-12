Quick Folder Move
=================

This is the source code for [Quick Folder Move](https://addons.mozilla.org/thunderbird/addon/quick-folder-move/), an add-on to quickly move emails into other folders in Thunderbird. The main purpose is to use the keyboard for triaging emails, but of course you can also click on things.


* **Shift+M** opens a context menu that allows you to move the currently selected messages to another folder
* **Shift+Y** opens a context menu that allows you to copy the currently selected messages to another folder
* **Shift+G** opens a context menu that allows you to navigate to the folder you've entered


As for versioning, please go ahead and bump the version number in each changeset. Going forward I would like to use semver, with the exception that version parts should be single digit (after 1.9 comes 2.0). Reminder:

1) MAJOR version when you make incompatible API changes,
2) MINOR version when you add functionality in a backwards-compatible manner, and
3) PATCH version when you make backwards-compatible bug fixes.
