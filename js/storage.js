/* StudyForge — localStorage persistence. */
(function (root) {
  'use strict';

  var KEY = 'studyforge.v1';
  var VERSION = 1;

  function defaults() {
    return {
      version: VERSION,
      totalIngots: 0,
      totalIntentional: 0,
      streak: { count: 0, lastDay: null, best: 0 },
      sessions: [],
      achievements: {},
      achievementsPaid: {},
      forged: { bronze: Date.now() },
      equippedTitle: 'novice',
      lastSubject: 'Physics',
      lastMode: 'stopwatch',
      settings: {
        workMin: 25,
        breakMin: 5,
        examMin: 60,
        strictExam: false,
        streakMinMin: 20,
        sound: true,
        notifications: true,
        fxCursor: true,
        fxRadio: true,
        calmForge: false,
        radioSource: 'ambient',
        ambientTrack: 0,
        ambientVolume: 40,
        ytUrl: '',
        smithName: ''
      },
      active: null
    };
  }

  // Fill any fields missing from older saves with defaults.
  function migrate(data) {
    var d = defaults();
    if (!data || typeof data !== 'object') return d;
    Object.keys(d).forEach(function (k) {
      if (data[k] === undefined) data[k] = d[k];
    });
    Object.keys(d.settings).forEach(function (k) {
      if (data.settings[k] === undefined) data.settings[k] = d.settings[k];
    });
    // v3: alloys must be forged. Bronze is the starter; anything already reached
    // waits as "ready to forge".
    if (!data.forged) data.forged = { bronze: Date.now() };
    data.version = VERSION;
    return data;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return migrate(raw ? JSON.parse(raw) : null);
    } catch (e) {
      console.warn('StudyForge: could not read saved data', e);
      return defaults();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('StudyForge: could not save data', e);
      return false;
    }
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    return defaults();
  }

  root.SF = root.SF || {};
  root.SF.storage = { load: load, save: save, reset: reset, defaults: defaults, migrate: migrate, KEY: KEY };
})(window);
