[![Active Users](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Faddons.thunderbird.net%2Fapi%2Fv4%2Faddons%2Faddon%2Fquick-folder-move%2F&query=%24.average_daily_users&label=Active%20Users)](https://addons.thunderbird.net/thunderbird/addon/quick-folder-move/)

Quick Folder Move
=================

This is the source code for [Quick Folder
Move](https://addons.mozilla.org/thunderbird/addon/quick-folder-move/), an add-on to quickly move
emails into other folders in Thunderbird. There are many emails to triage, and it takes time to read
and reply to each. Quick Folder Move is meant to reduce the time between emails. Those few extra
clicks to move the message in a folder might not seem much, but with the amount of emails you
receive every day it can add up.

1. Use **Control+Shift+M** (or Ctrl+Shift+N on Windows/Linux) opens a popup menu that allows you to move
the selected messages.

![Quickmove Toolbar](src/onboarding/images/toolbar.png)

2. In the popup, you can use the following to navigate:
    * **⌘/Ctrl + Arrow Keys**: Switch between 'move', 'copy' and other modes.
    * **Search box**: Use this to search for part of the folder name. You might only need 1-2 letters!
    * **Down/Up Arrow**: Move between the search box and the folder items.
3. When you've picked the folder you'd like:
    * **Enter**: Move the message.
    * **⌘+Enter**: Move the message, and directly go to the folder you moved the message to.


A few more tips and tricks:
* If you want to move to the first folder in the search results, you can press Enter directly. No need to move down to select the folder.
* You can also assign keyboard shortcuts to copy, go to a folder, or apply tags
via Thunderbird's [shortcut manager](https://support.mozilla.org/en-US/kb/manage-extension-shortcuts-firefox).


![Shortcut options](src/onboarding/images/shortcuts.png)


Development
-----------

As for versioning, please go ahead and bump the version number in each pull request. After 1.9 comes 2.0, even if it not a major change.

When testing, please keep in mind:
* The popup can be opened in the message display action, or the main toolbar.
* The popup can also be opened from a single message view, where the selected message is different.
* It is possible the user removed the toolbar button.
* There are different popup layouts to test on.
* Keyboard behavior between Windows and Linux and macOS is wildly different.

Translation
-----------

This project uses Weblate for its translations, you can contribute by visiting https://hosted.weblate.org/engage/quick-folder-move/

Weblate is a continuous localization platform used by over 2,500 libre software projects. Learn more about Weblate at https://weblate.org/
