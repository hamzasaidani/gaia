'use strict';

(function(exports) {

  /**
   * InputFrameManager manages all the iframe-related operations that
   * has to do with keyboard layouts. It receives a layout from KeyboardManager
   * and performs operations on the iframe associated with the layout, such that
   * KeyboardManager does not have to be concerned about the inner mechanisms
   * of a keyboard iframe.
   */
  var InputFrameManager = function(keyboardManager) {
    this._keyboardManager = keyboardManager;

    // The set of running keyboards.
    // This is a map from keyboard manifestURL to an object like this:
    // 'keyboard.gaiamobile.org/manifest.webapp' : {
    //   'English': aIframe
    // }
    this.runningLayouts = {};

    this._onDebug = false;
    this._activeFrame = null;
  };

  InputFrameManager.prototype._debug = function ifm__debug(msg) {
    if (this._onDebug) {
      console.log('[InputFrameManager] ' + msg);
    }
  };

  InputFrameManager.prototype.start = function ifm_start() {

  };

  InputFrameManager.prototype.stop = function ifm_stop() {

  };

  InputFrameManager.prototype.handleEvent = function ifm_handleEvent(evt) {
    this._keyboardManager.resizeKeyboard(evt);
  };

  InputFrameManager.prototype.setupFrame = function ifm_setupFrame(layout) {
    var frame = this.runningLayouts[layout.manifestURL][layout.id];
    frame.classList.remove('hide');
    this._setFrameActive(frame, true);
    frame.addEventListener('mozbrowserresize', this, true);
  };

  InputFrameManager.prototype.resetFrame = function ifm_resetFrame(layout) {
    if (!layout) {
      return;
    }

    var frame = this.runningLayouts[layout.manifestURL][layout.id];

    if (!frame) {
      return;
    }

    frame.classList.add('hide');
    this._setFrameActive(frame, false);
    frame.removeEventListener('mozbrowserresize', this, true);
  };

  InputFrameManager.prototype.pauseTemporarily =
    function ifm_pauseTemporarily(value) {
    // This method is to deactivate the currently-active input frame for a while
    // without dismissing the whole keyboard app. It's designed for the remote
    // control input function to grant system app the ability to become another
    // input frame temporarily.
    if (this._activeFrame) {
      this._activeFrame.setInputMethodActive(!value);
    }
  };

  InputFrameManager.prototype._setFrameActive =
    function ifm_setFrameActive(frame, active) {
    this._debug('setFrameActive: ' +
                frame.dataset.frameManifestURL +
                frame.dataset.framePath + ', active: ' + active);

    if (frame.setVisible) {
      frame.setVisible(active);
    }
    if (frame.setInputMethodActive) {
      frame.setInputMethodActive(active);
      this._activeFrame = active ? frame : null;
    }

    this._keyboardManager.setHasActiveKeyboard(active);
  };

  InputFrameManager.prototype.launchFrame =
    function ifm_launchFrame(layout, keepInactive) {
    if (this._isRunningLayout(layout)) {
      this._debug('this layout is running');
      return;
    }

    var frame = null;
    // The layout is in a keyboard app that has been launched.
    if (this._isRunningKeyboard(layout)) {
      // Re-use the iframe by changing its src.
      frame = this._getFrameFromExistingKeyboard(layout);
    }

    // Can't reuse, so create a new frame to load this new layout.
    if (!frame) {
      frame = this._loadKeyboardLayoutToFrame(layout, keepInactive);
      frame.dataset.frameManifestURL = layout.manifestURL;
    }

    frame.dataset.frameName = layout.id;
    frame.dataset.framePath = layout.path;

    this._insertFrameRef(layout, frame);
  };

  InputFrameManager.prototype._loadKeyboardLayoutToFrame =
    function ifm__loadKeyboardLayoutToFrame(layout, keepInactive) {
    var frame = this._constructFrame(layout);
    this._keyboardManager.keyboardFrameContainer.appendChild(frame);
    if (keepInactive) {
      frame.setVisible(false);
      frame.classList.add('hide');
    }
    return frame;
  };

  InputFrameManager.prototype._constructFrame =
    function ifm__constructFrame(layout) {

    // Generate a <iframe mozbrowser> containing the keyboard.
    var frame = document.createElement('iframe');
    frame.src = layout.origin + layout.path;
    frame.setAttribute('mozapptype', 'inputmethod');
    frame.setAttribute('mozbrowser', 'true');
    frame.setAttribute('mozpasspointerevents', 'true');
    frame.setAttribute('mozapp', layout.manifestURL);

    var manifest =
      window.applications.getByManifestURL(layout.manifestURL).manifest;
    var isCertifiedApp = (manifest.type === 'certified');

    // oop is always enabled for non-certified app,
    // and optionally enabled to certified apps if
    // available memory is more than 512MB.
    if (this._keyboardManager.isOutOfProcessEnabled &&
        (!isCertifiedApp || this._keyboardManager.totalMemory >= 512)) {
      this._debug('=== Enable keyboard: ' + layout.origin + ' run as OOP ===');
      frame.setAttribute('remote', 'true');
      frame.setAttribute('ignoreuserfocus', 'true');
    }

    return frame;
  };

  InputFrameManager.prototype._getFrameFromExistingKeyboard =
    function ifm__getFrameFromExistingKeyboard(layout) {
    var frame = null;
    var runningKeybaord = this.runningLayouts[layout.manifestURL];
    for (var id in runningKeybaord) {
      var oldPath = runningKeybaord[id].dataset.framePath;
      var newPath = layout.path;
      if (oldPath.substring(0, oldPath.indexOf('#')) ===
          newPath.substring(0, newPath.indexOf('#'))) {
        frame = runningKeybaord[id];
        frame.src = layout.origin + newPath;
        this._debug(id + ' is overwritten: ' + frame.src);
        this._deleteRunningFrameRef(layout.manifestURL, id);
        break;
      }
    }
    return frame;
  };

  InputFrameManager.prototype._destroyFrame =
    function ifm__destroyFrame(kbManifestURL, layoutID) {
    var frame = this.runningLayouts[kbManifestURL][layoutID];
    try {
      frame.parentNode.removeChild(frame);
    } catch (e) {
      // if it doesn't work, noone cares
    }
  };

  InputFrameManager.prototype._insertFrameRef =
    function ifm__insertFrameRef(layout, frame) {
    if (!(layout.manifestURL in this.runningLayouts)) {
      this.runningLayouts[layout.manifestURL] = {};
    }

    this.runningLayouts[layout.manifestURL][layout.id] = frame;
  };

  InputFrameManager.prototype._deleteRunningFrameRef =
    function ifm__deleteRunningLayoutRef(kbManifestURL, layoutID) {
    delete this.runningLayouts[kbManifestURL][layoutID];
  };

  InputFrameManager.prototype.removeKeyboard =
    function ifm_removeKeyboard(kbManifestURL) {
    for (var id in this.runningLayouts[kbManifestURL]) {
      this._destroyFrame(kbManifestURL, id);
      this._deleteRunningFrameRef(kbManifestURL, id);
    }

    delete this.runningLayouts[kbManifestURL];
  };

  InputFrameManager.prototype._isRunningKeyboard =
    function ifm__isRunningKeyboard(layout) {
    return this.runningLayouts.hasOwnProperty(layout.manifestURL);
  };

  InputFrameManager.prototype._isRunningLayout =
    function ifm__isRunningLayout(layout) {
    if (!this._isRunningKeyboard(layout)) {
      return false;
   }
    return this.runningLayouts[layout.manifestURL].hasOwnProperty(layout.id);
  };

  exports.InputFrameManager = InputFrameManager;

})(window);
