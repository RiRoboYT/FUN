/* StudyForge — tiny synthesized sound effects (WebAudio, no files needed offline). */
(function (root) {
  'use strict';

  var ctx = null;
  var enabled = true;

  function audio() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Play a sequence of [frequency, startOffset, duration] notes.
  function notes(list, type, volume) {
    if (!enabled) return;
    var a = audio();
    if (!a) return;
    var t0 = a.currentTime;
    list.forEach(function (n) {
      var osc = a.createOscillator();
      var gain = a.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = n[0];
      gain.gain.setValueAtTime(0.0001, t0 + n[1]);
      gain.gain.exponentialRampToValueAtTime(volume || 0.15, t0 + n[1] + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + n[2]);
      osc.connect(gain).connect(a.destination);
      osc.start(t0 + n[1]);
      osc.stop(t0 + n[1] + n[2] + 0.05);
    });
  }

  var sounds = {
    start: function () { notes([[392, 0, 0.15], [523, 0.12, 0.25]], 'triangle'); },
    pause: function () { notes([[330, 0, 0.18]], 'triangle', 0.1); },
    // Anvil strike: bright metallic ping.
    anvil: function () { notes([[1320, 0, 0.35], [1980, 0, 0.25], [2640, 0.01, 0.15]], 'square', 0.05); },
    stageUp: function () { notes([[523, 0, 0.15], [659, 0.1, 0.15], [784, 0.2, 0.35]], 'triangle'); },
    crack: function () { notes([[140, 0, 0.3], [95, 0.08, 0.35]], 'sawtooth', 0.08); },
    chime: function () { notes([[880, 0, 0.4], [1175, 0.2, 0.5], [880, 0.5, 0.4]], 'sine', 0.2); },
    reward: function () { notes([[523, 0, 0.2], [659, 0.15, 0.2], [784, 0.3, 0.2], [1047, 0.45, 0.6]], 'triangle', 0.18); },
    fail: function () { notes([[392, 0, 0.25], [311, 0.2, 0.25], [233, 0.4, 0.5]], 'sawtooth', 0.08); }
  };

  root.SF = root.SF || {};
  root.SF.sound = {
    play: function (name) {
      try { if (sounds[name]) sounds[name](); } catch (e) { /* audio is optional */ }
    },
    setEnabled: function (on) { enabled = !!on; },
    unlock: function () { if (enabled) audio(); }
  };
})(window);
