Testing plan
============

This is the testing plan I go through for each release. If something is not working that should be
checked before an update goes out, let's add it to this list.

* Operations
  * Move and copy a message to a different folder
  * Go to a different folder
  * Tag a message, untag a message

* Keyboard
  * Input text and press enter to move to first folder
  * Left/Right arrows to switch between modes
  * Keyboard focus must return to folder pane after operation

* Prefs
  * Test different folder layouts
  * Make sure messages are marked as read when moving (as per option)
  * Make sure archive folders are not matched (as per option, just the ones with the archive icon)
  * Test legacy shortcuts
  * Test default folders, specific folders, all folders
