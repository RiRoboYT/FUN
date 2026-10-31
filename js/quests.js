/* StudyForge — Quests (v3.2).
 * Daily and weekly quests, worked out from the session history so nothing has to be
 * tracked as it happens. Each day (and each week) gets its own set, picked from a seeded
 * shuffle so it's stable across reloads. Only timed sessions count — quests are about
 * forging, not logging. Pure functions; also loads in Node for tests. */
(function (root) {
  'use strict';

  var L = root.SF && root.SF.logic ? root.SF.logic : require('./logic.js');
  var MIN = 60000;
  var DAY = 86400000;

  // ---------- Seeded order ----------
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(list, seed) {
    var r = rng(hash(seed)), out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }
  function pick(list, seed) { return list[hash(seed) % list.length]; }

  // ---------- Measures ----------
  function timed(r) { return r.mode !== 'manual'; }
  function inWindow(sessions, from, to) {
    return sessions.filter(function (r) { return timed(r) && r.endedAt >= from && r.endedAt < to; });
  }
  function minutes(list) { return Math.floor(list.reduce(function (s, r) { return s + r.studied; }, 0) / MIN); }
  function clean(r) { return r.studied >= 25 * MIN && r.distracted < MIN; }

  // The subject that most needs attention: studied recently, but least this week.
  function focusSubject(sessions, now, seed) {
    var recent = {}, week = {};
    var ws = L.weekStart(now);
    sessions.forEach(function (r) {
      if (!timed(r) || !r.subject || r.subject === 'Other') return;
      if (r.endedAt > now - 30 * DAY) recent[r.subject] = true;
      if (r.endedAt >= ws) week[r.subject] = (week[r.subject] || 0) + r.studied;
    });
    var subs = Object.keys(recent).sort();
    if (!subs.length) return pick(L.SUBJECTS.slice(0, 6), seed);
    subs.sort(function (a, b) { return (week[a] || 0) - (week[b] || 0) || (a < b ? -1 : 1); });
    return subs[0];
  }

  // ---------- Templates ----------
  // make(ctx) → { title, goal, unit, reward, measure(list) }. ctx: { seed, sessions, now }.
  var DAILY = [
    { id: 'd_minutes', icon: '⏱', make: function (c) {
      var g = pick([45, 60, 90], c.seed + 'm');
      return { title: 'Study ' + g + ' minutes today', goal: g, unit: 'min', reward: g >= 90 ? 30 : g >= 60 ? 22 : 16,
        measure: minutes };
    } },
    { id: 'd_subject', icon: '📘', make: function (c) {
      var sub = focusSubject(c.sessions, c.now, c.seed);
      return { title: 'Study ' + sub + ' for 30 minutes', goal: 30, unit: 'min', reward: 22, subject: sub,
        measure: function (list) { return minutes(list.filter(function (r) { return r.subject === sub; })); } };
    } },
    { id: 'd_clean', icon: '🛡', make: function () {
      return { title: 'Finish a 25-min session with no distractions', goal: 1, unit: '', reward: 20,
        measure: function (list) { return list.filter(clean).length; } };
    } },
    { id: 'd_blazing', icon: '🔥', make: function () {
      return { title: 'Reach Blazing heat in a session', goal: 1, unit: '', reward: 22,
        measure: function (list) { return list.filter(function (r) { return r.peakStage >= 3; }).length; } };
    } },
    { id: 'd_two', icon: '⚒', make: function () {
      return { title: 'Complete 2 sessions of 15 minutes or more', goal: 2, unit: '', reward: 16,
        measure: function (list) { return list.filter(function (r) { return r.completed && r.studied >= 15 * MIN; }).length; } };
    } },
    { id: 'd_blocks', icon: '⏳', make: function () {
      return { title: 'Finish 2 Study Timer work blocks', goal: 2, unit: '', reward: 20,
        measure: function (list) { return list.reduce(function (s, r) { return s + (r.blocksDone || 0); }, 0); } };
    } },
    { id: 'd_morning', icon: '🌅', make: function (c) {
      var noon = new Date(c.now); noon.setHours(12, 0, 0, 0);
      return { title: 'Study 20 minutes before noon', goal: 20, unit: 'min', reward: 16,
        measure: function (list) { return minutes(list.filter(function (r) { return r.endedAt <= noon.getTime(); })); } };
    } }
  ];

  var WEEKLY = [
    { id: 'w_hours', icon: '⏱', make: function (c) {
      var h = pick([6, 8, 10], c.seed + 'h');
      return { title: 'Study ' + h + ' hours this week', goal: h * 60, unit: 'min', reward: h * 12, measure: minutes };
    } },
    { id: 'w_days', icon: '📅', make: function () {
      return { title: 'Study 20+ minutes on 5 different days', goal: 5, unit: 'days', reward: 90,
        measure: function (list) {
          var days = {};
          list.forEach(function (r) { var k = L.dayKey(r.endedAt); days[k] = (days[k] || 0) + r.studied; });
          return Object.keys(days).filter(function (k) { return days[k] >= 20 * MIN; }).length;
        } };
    } },
    { id: 'w_clean', icon: '🛡', make: function () {
      return { title: '3 distraction-free sessions of 25+ minutes', goal: 3, unit: '', reward: 80,
        measure: function (list) { return list.filter(clean).length; } };
    } },
    { id: 'w_subjects', icon: '📚', make: function () {
      return { title: 'Study 4 different subjects for 30+ minutes each', goal: 4, unit: '', reward: 85,
        measure: function (list) {
          var subs = {};
          list.forEach(function (r) { subs[r.subject] = (subs[r.subject] || 0) + r.studied; });
          return Object.keys(subs).filter(function (k) { return subs[k] >= 30 * MIN; }).length;
        } };
    } },
    { id: 'w_exam', icon: '📝', make: function () {
      return { title: 'Complete an Exam Timer session', goal: 1, unit: '', reward: 70,
        measure: function (list) { return list.filter(function (r) { return r.mode === 'exam' && r.completed; }).length; } };
    } },
    { id: 'w_legend', icon: '✦', make: function () {
      return { title: 'Reach Legendary heat in a session', goal: 1, unit: '', reward: 100,
        measure: function (list) { return list.filter(function (r) { return r.peakStage >= 4; }).length; } };
    } }
  ];

  var DAILY_COUNT = 3, WEEKLY_COUNT = 2;

  function store(state) {
    var q = state.quests || (state.quests = {});
    q.claimed = q.claimed || {};
    q.rerolls = q.rerolls || {};
    q.notified = q.notified || {};
    return q;
  }

  function dayBounds(now) {
    var d = new Date(now); d.setHours(0, 0, 0, 0);
    var start = d.getTime();
    d.setDate(d.getDate() + 1);
    return [start, d.getTime()];
  }
  function weekBounds(now) {
    var start = L.weekStart(now);
    var d = new Date(start); d.setDate(d.getDate() + 7);
    return [start, d.getTime()];
  }

  function build(kind, tpl, period, state, now, bounds) {
    var seed = kind + ':' + period + ':' + tpl.id;
    var q = tpl.make({ seed: seed, sessions: state.sessions, now: now });
    var value = Math.min(q.goal, q.measure(inWindow(state.sessions, bounds[0], bounds[1])));
    var key = kind[0] + ':' + period + ':' + tpl.id;
    return {
      key: key, id: tpl.id, kind: kind, icon: tpl.icon, title: q.title, subject: q.subject || null,
      goal: q.goal, unit: q.unit, reward: q.reward, value: value,
      done: value >= q.goal, claimed: !!store(state).claimed[key]
    };
  }

  function list(state, now) {
    var qs = store(state);
    var day = L.dayKey(now), db = dayBounds(now);
    var order = shuffled(DAILY, 'daily:' + day);
    var picks = order.slice(0, DAILY_COUNT);
    var swap = qs.rerolls[day];
    if (swap && swap.slot >= 0 && swap.slot < DAILY_COUNT) picks[swap.slot] = order[DAILY_COUNT];
    var daily = picks.map(function (t) { return build('daily', t, day, state, now, db); });

    var wb = weekBounds(now), week = L.dayKey(wb[0]);
    var weekly = shuffled(WEEKLY, 'weekly:' + week).slice(0, WEEKLY_COUNT)
      .map(function (t) { return build('weekly', t, week, state, now, wb); });

    return {
      daily: daily, weekly: weekly,
      dailyEndsAt: db[1], weeklyEndsAt: wb[1],
      canReroll: !swap
    };
  }

  function find(state, key, now) {
    var all = list(state, now);
    return all.daily.concat(all.weekly).filter(function (q) { return q.key === key; })[0] || null;
  }

  // Pay out a finished quest. Returns the reward, or 0 if it isn't claimable.
  function claim(state, key, now) {
    var q = find(state, key, now);
    if (!q || !q.done || q.claimed) return 0;
    store(state).claimed[key] = now;
    state.totalIngots += q.reward;
    return q.reward;
  }

  // Swap one unfinished daily quest for another, once per day.
  function reroll(state, slot, now) {
    var qs = store(state), day = L.dayKey(now);
    var all = list(state, now);
    var q = all.daily[slot];
    if (!all.canReroll || !q || q.done || q.claimed) return false;
    qs.rerolls[day] = { slot: slot };
    return true;
  }

  // Quests finished but not yet announced; marks them announced.
  function freshlyDone(state, now) {
    var qs = store(state), all = list(state, now), out = [];
    all.daily.concat(all.weekly).forEach(function (q) {
      if (q.done && !q.claimed && !qs.notified[q.key]) { qs.notified[q.key] = true; out.push(q); }
    });
    return out;
  }

  function claimableCount(state, now) {
    var all = list(state, now);
    return all.daily.concat(all.weekly).filter(function (q) { return q.done && !q.claimed; }).length;
  }

  // Keep the saved quest record small: forget periods older than five weeks.
  function prune(state, now) {
    var qs = store(state), cutoff = L.dayKey(now - 35 * DAY);
    ['claimed', 'notified'].forEach(function (k) {
      Object.keys(qs[k]).forEach(function (key) { if (key.split(':')[1] < cutoff) delete qs[k][key]; });
    });
    Object.keys(qs.rerolls).forEach(function (day) { if (day < cutoff) delete qs.rerolls[day]; });
  }

  var api = {
    DAILY: DAILY, WEEKLY: WEEKLY,
    list: list, claim: claim, reroll: reroll, freshlyDone: freshlyDone,
    claimableCount: claimableCount, prune: prune
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = root.SF || {};
  root.SF.quests = api;
})(typeof window !== 'undefined' ? window : globalThis);
