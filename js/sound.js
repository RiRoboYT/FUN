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
    // Short two-tone "bloop" with a shimmer, in the spirit of a console achievement.
    achievement: function () {
      notes([[784, 0, 0.12], [1175, 0.1, 0.55]], 'sine', 0.22);
      notes([[2349, 0.12, 0.45], [3136, 0.2, 0.35]], 'triangle', 0.04);
    },
    fail: function () { notes([[392, 0, 0.25], [311, 0.2, 0.25], [233, 0.4, 0.5]], 'sawtooth', 0.08); }
  };

  // ---------- Ambient soundscapes (generated, so they work offline) ----------
  var TRACKS = [
    { id: 'fire', name: 'Forge fire' },
    { id: 'rain', name: 'Rain on the workshop roof' },
    { id: 'brown', name: 'Deep focus (brown noise)' }
  ];
  var amb = { nodes: [], gain: null, crackle: null, volume: 0.4, index: -1 };

  function noiseBuffer(a, brown) {
    var len = a.sampleRate * 4;
    var buf = a.createBuffer(1, len, a.sampleRate);
    var data = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buf;
  }

  function loopSource(a, buf) {
    var src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    amb.nodes.push(src);
    return src;
  }

  function chain(a, nodes) {
    for (var i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  }

  function filter(a, type, freq, q) {
    var f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    return f;
  }

  function gainNode(a, v) {
    var g = a.createGain();
    g.gain.value = v;
    return g;
  }

  // Short, bright pops on top of the fire's rumble.
  function scheduleCrackles(a, out, white) {
    amb.crackle = setInterval(function () {
      if (Math.random() > 0.45) return;
      var src = a.createBufferSource();
      src.buffer = white;
      var g = a.createGain();
      var t = a.currentTime + Math.random() * 0.1;
      var peak = 0.08 + Math.random() * 0.25;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.06);
      chain(a, [src, filter(a, 'bandpass', 1800 + Math.random() * 3000, 1.2), g, out]);
      src.start(t, Math.random() * 3);
      src.stop(t + 0.15);
    }, 90);
  }

  function startAmbient(index) {
    stopAmbient(true);
    var a = audio();
    if (!a) return false;
    var t = TRACKS[index].id;
    amb.index = index;
    amb.gain = a.createGain();
    amb.gain.gain.setValueAtTime(0.0001, a.currentTime);
    amb.gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, amb.volume), a.currentTime + 1.2);
    amb.gain.connect(a.destination);
    var white = noiseBuffer(a, false);
    var brown = noiseBuffer(a, true);

    if (t === 'fire') {
      chain(a, [loopSource(a, brown), filter(a, 'lowpass', 420), gainNode(a, 0.9), amb.gain]);
      chain(a, [loopSource(a, white), filter(a, 'bandpass', 900, 0.6), gainNode(a, 0.025), amb.gain]);
      scheduleCrackles(a, amb.gain, white);
    } else if (t === 'rain') {
      chain(a, [loopSource(a, white), filter(a, 'highpass', 900), filter(a, 'lowpass', 7000), gainNode(a, 0.22), amb.gain]);
      chain(a, [loopSource(a, brown), filter(a, 'lowpass', 500), gainNode(a, 0.5), amb.gain]);
    } else {
      chain(a, [loopSource(a, brown), filter(a, 'lowpass', 900), gainNode(a, 0.9), amb.gain]);
    }
    return true;
  }

  function stopAmbient(immediate) {
    if (amb.crackle) clearInterval(amb.crackle);
    amb.crackle = null;
    var nodes = amb.nodes, g = amb.gain;
    amb.nodes = [];
    amb.gain = null;
    amb.index = -1;
    if (!g || !ctx) return;
    var t = ctx.currentTime;
    var fade = immediate ? 0.05 : 0.6;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    nodes.forEach(function (n) { try { n.stop(t + fade + 0.05); } catch (e) { /* already stopped */ } });
  }

  function setAmbientVolume(v) {
    amb.volume = Math.max(0, Math.min(1, v));
    if (amb.gain && ctx) amb.gain.gain.setTargetAtTime(Math.max(0.0001, amb.volume), ctx.currentTime, 0.1);
  }

  root.SF = root.SF || {};
  root.SF.sound = {
    ambient: {
      TRACKS: TRACKS,
      start: startAmbient,
      stop: stopAmbient,
      setVolume: setAmbientVolume,
      playing: function () { return amb.index; }
    },
    play: function (name) {
      // Browsers block audio until the person has interacted with the page.
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      try { if (sounds[name]) sounds[name](); } catch (e) { /* audio is optional */ }
    },
    setEnabled: function (on) { enabled = !!on; },
    unlock: function () { if (enabled) audio(); }
  };
})(window);
