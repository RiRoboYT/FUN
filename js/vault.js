/* StudyForge — Vault loader. The 3D Vault (three.js + post-processing) lives in a bundle built
   from src/vault/ (npm run build:vault). It's loaded only when the Forge Hall is first opened,
   and falls back to the 2D alloy cards when WebGL isn't available. */
(function (root) {
  'use strict';

  var doc = root.document;
  var pending = { visible: false, state: null };
  var api = null, loading = false, failed = false;

  function els() {
    return {
      vault: doc.getElementById('vault'),
      stage: doc.getElementById('vault-stage'),
      labels: doc.getElementById('vault-labels'),
      panel: doc.getElementById('vault-panel'),
      loading: doc.getElementById('vault-loading'),
      exit: doc.getElementById('vault-exit')
    };
  }

  function webglAvailable() {
    try {
      var c = doc.createElement('canvas');
      return !!c.getContext('webgl2');
    } catch (e) { return false; }
  }

  function fail(reason) {
    failed = true;
    var e = els();
    e.vault.classList.add('no3d');
    e.loading.hidden = true;
    console.info('StudyForge Vault: showing 2D alloys (' + reason + ')');
  }

  function load() {
    if (api || loading || failed) return;
    if (!webglAvailable()) return fail('WebGL 2 unavailable');
    loading = true;
    var s = doc.createElement('script');
    s.src = 'vendor/vault3d.bundle.js';
    s.onload = function () {
      loading = false;
      if (!root.SF.vault3d) return fail('bundle did not register');
      try {
        root.SF.vault3d.mount(els());
      } catch (e) {
        console.error(e);
        return fail('scene error');
      }
      api = root.SF.vault3d;
      if (pending.state) api.update(pending.state, true);
      api.setVisible(pending.visible);
    };
    s.onerror = function () { loading = false; fail('bundle failed to load'); };
    doc.head.appendChild(s);
  }

  root.SF = root.SF || {};
  root.SF.vault = {
    setVisible: function (on) {
      pending.visible = on;
      if (on) load();
      if (api) api.setVisible(on);
    },
    update: function (state) {
      pending.state = state;
      if (api) api.update(state);
    }
  };
})(window);
