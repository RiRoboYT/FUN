/* StudyForge — pure game logic (no DOM). Shared by the app and the Node tests. */
(function (root) {
  'use strict';

  var MIN = 60000;

  var HEAT_STAGES = [
    { id: 'cold', name: 'Cold', min: 0, mult: 1.0 },
    { id: 'warm', name: 'Warm', min: 5, mult: 1.0 },
    { id: 'hot', name: 'Hot', min: 15, mult: 1.1 },
    { id: 'blazing', name: 'Blazing', min: 40, mult: 1.25 },
    { id: 'legendary', name: 'Legendary', min: 70, mult: 1.5 }
  ];

  // Minutes of heat at which the bar is drawn full.
  var HEAT_BAR_MAX = 90;

  // Distracted time cools the forge twice as fast as studying heats it.
  var DISTRACTION_COOLING = 2;

  // 1 Ingot per 5 minutes of clean Studied time (before multipliers).
  var MS_PER_INGOT = 5 * MIN;

  // A single distracted chunk this long cracks the current work.
  var CRACK_THRESHOLD_MS = 2 * MIN;
  var MAX_CRACKS = 3;

  var ALLOYS = [
    { id: 'bronze', name: 'Bronze', ingots: 0, desc: 'Every smith starts here.' },
    { id: 'silver', name: 'Silver', ingots: 100, desc: 'Forge 100 Ingots.' },
    { id: 'gold', name: 'Gold', ingots: 300, longSessionMin: 40, desc: 'Forge 300 Ingots and finish a session with 40+ min Studied.' },
    { id: 'platinum', name: 'Platinum', ingots: 750, streak: 7, desc: 'Forge 750 Ingots and reach a 7-day streak.' },
    { id: 'mythril', name: 'Mythril', ingots: 1500, streak: 14, desc: 'Forge 1500 Ingots and reach a 14-day streak.' }
  ];

  var TITLES = [
    { id: 'novice', name: 'Novice Smith', alloy: 0 },
    { id: 'apprentice', name: 'Apprentice Smith', alloy: 1 },
    { id: 'journeyman', name: 'Journeyman', alloy: 2 },
    { id: 'master', name: 'Master Smith', alloy: 3 },
    { id: 'legend', name: 'Legend of the Forge', alloy: 4 }
  ];

  var SUBJECTS = [
    'Physics', 'Mathematics', 'Chemistry', 'Biology', 'History & Civics', 'Geography',
    'English Language', 'English Literature', 'Hindi', 'Computer Applications', 'Economics', 'Other'
  ];

  // Return-popup choices. `bucket: null` means the user picks the bucket.
  var CATEGORIES = [
    { id: 'allowed', label: 'WhatsApp / AI / Google', bucket: 'studied' },
    { id: 'office', label: 'PDF / Office / Explorer', bucket: 'intentional' },
    { id: 'youtube', label: 'YouTube', bucket: 'distracted' },
    { id: 'instagram', label: 'Instagram', bucket: 'distracted' },
    { id: 'roblox', label: 'Roblox', bucket: 'distracted' },
    { id: 'other', label: 'Other', bucket: null }
  ];

  var BUCKETS = ['studied', 'intentional', 'distracted'];

  function heatMinutes(studiedMs, distractedMs) {
    return Math.max(0, studiedMs - DISTRACTION_COOLING * distractedMs) / MIN;
  }

  function heatStageIndex(heatMin) {
    for (var i = HEAT_STAGES.length - 1; i >= 0; i--) {
      if (heatMin >= HEAT_STAGES[i].min) return i;
    }
    return 0;
  }

  function heatFill(heatMin) {
    return Math.min(1, Math.max(0, heatMin / HEAT_BAR_MAX));
  }

  // Ingots (fractional) earned for `ms` of Studied time at a given heat stage.
  function ingotsFor(ms, stageIdx) {
    return (ms / MS_PER_INGOT) * HEAT_STAGES[stageIdx].mult;
  }

  function streakMultiplier(days) {
    if (days >= 14) return 1.6;
    if (days >= 7) return 1.4;
    if (days >= 3) return 1.2;
    return 1.0;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Local-time YYYY-MM-DD.
  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function dayDiff(fromKey, toKey) {
    var a = fromKey.split('-').map(Number);
    var b = toKey.split('-').map(Number);
    var ua = Date.UTC(a[0], a[1] - 1, a[2]);
    var ub = Date.UTC(b[0], b[1] - 1, b[2]);
    return Math.round((ub - ua) / 86400000);
  }

  // Streak shown today: alive if the last qualifying day was today or yesterday.
  function currentStreak(streak, todayKey) {
    if (!streak || !streak.lastDay) return 0;
    var diff = dayDiff(streak.lastDay, todayKey);
    return diff <= 1 ? streak.count : 0;
  }

  // Apply a qualifying session on `todayKey`. Returns a new streak object.
  function advanceStreak(streak, todayKey) {
    streak = streak || { count: 0, lastDay: null, best: 0 };
    var count;
    if (!streak.lastDay) count = 1;
    else {
      var diff = dayDiff(streak.lastDay, todayKey);
      if (diff <= 0) count = streak.count;
      else if (diff === 1) count = streak.count + 1;
      else count = 1;
    }
    return { count: count, lastDay: todayKey, best: Math.max(streak.best || 0, count) };
  }

  // Highest alloy whose requirements (and all previous ones) are met.
  function alloyIndex(stats) {
    var idx = 0;
    for (var i = 1; i < ALLOYS.length; i++) {
      var a = ALLOYS[i];
      if (stats.totalIngots < a.ingots) break;
      if (a.longSessionMin && stats.longestStudiedMin < a.longSessionMin) break;
      if (a.streak && stats.bestStreak < a.streak) break;
      idx = i;
    }
    return idx;
  }

  function unlockedTitles(alloyIdx) {
    return TITLES.filter(function (t) { return t.alloy <= alloyIdx; });
  }

  // Study Timer bonus: a full work block with distracted under 10% of it.
  var BLOCK_BONUS = 3;
  function blockBonus(blockMs, blockDistractedMs) {
    return blockMs > 0 && blockDistractedMs < 0.1 * blockMs ? BLOCK_BONUS : 0;
  }

  // Exam "Legendary Attempt": completed with under 1 minute distracted.
  var LEGENDARY_ATTEMPT_BONUS = 10;
  function isLegendaryAttempt(session) {
    return session.mode === 'exam' && session.completed && session.distracted < MIN;
  }

  // Final ingot count for a finished session.
  function sessionIngots(session, streakDays) {
    var mult = streakMultiplier(streakDays);
    var base = Math.floor(session.ingotAccum * mult);
    var bonus = session.bonusIngots || 0;
    if (isLegendaryAttempt(session)) bonus += LEGENDARY_ATTEMPT_BONUS;
    return { base: base, bonus: bonus, total: base + bonus, mult: mult };
  }

  // Does a finished session count toward the daily streak?
  function qualifiesForStreak(session, minStudiedMin) {
    return !!session.completed && session.studied >= minStudiedMin * MIN;
  }

  var ACHIEVEMENTS = [
    { id: 'first_ingot', name: 'First Ingot', desc: 'Forge your very first Ingot.',
      check: function (c) { return c.stats.totalIngots >= 1; } },
    { id: 'warm_forge', name: 'Warm Forge', desc: 'Heat the forge to Warm in a session.',
      check: function (c) { return c.session.peakStage >= 1; } },
    { id: 'blazing_session', name: 'Blazing Session', desc: '40+ min Studied with under 5 min Distracted.',
      check: function (c) { return c.session.studied >= 40 * MIN && c.session.distracted < 5 * MIN; } },
    { id: 'distraction_slayer', name: 'Distraction Slayer', desc: '0 Distracted minutes in a session of 25+ min.',
      check: function (c) {
        var s = c.session;
        return s.studied + s.intentional + s.distracted >= 25 * MIN && s.distracted < MIN;
      } },
    { id: 'office_dweller', name: 'Office Dweller', desc: 'Log 60 min of Intentional time (Office / Explorer / PDF).',
      check: function (c) { return c.stats.totalIntentional >= 60 * MIN; } },
    { id: 'exam_warrior', name: 'Exam Warrior', desc: 'Complete an Exam Timer at Blazing heat or higher.',
      check: function (c) { return c.session.mode === 'exam' && c.session.completed && c.session.peakStage >= 3; } },
    { id: 'streak_7', name: '7-Day Streak', desc: 'Study 7 days in a row.',
      check: function (c) { return c.stats.bestStreak >= 7; } },
    { id: 'mythril_smith', name: 'Mythril Smith', desc: 'Reach the Mythril alloy.',
      check: function (c) { return c.alloyIdx >= 4; } }
  ];

  // Returns ids of achievements newly unlocked by this context.
  function newAchievements(unlocked, ctx) {
    return ACHIEVEMENTS.filter(function (a) {
      return !unlocked[a.id] && a.check(ctx);
    }).map(function (a) { return a.id; });
  }

  // Studied ms per subject for sessions ending at or after `sinceTs`.
  function subjectTotals(sessions, sinceTs) {
    var totals = {};
    sessions.forEach(function (s) {
      if (s.endedAt >= sinceTs) totals[s.subject] = (totals[s.subject] || 0) + s.studied;
    });
    return totals;
  }

  function topSubject(totals) {
    var best = null, bestMs = 0;
    Object.keys(totals).forEach(function (k) {
      if (totals[k] > bestMs) { best = k; bestMs = totals[k]; }
    });
    return best;
  }

  function formatClock(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return (h > 0 ? h + ':' + pad(m) : pad(m)) + ':' + pad(s);
  }

  function formatMinutes(ms) {
    var m = Math.round(ms / MIN);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }

  var api = {
    MIN: MIN,
    HEAT_STAGES: HEAT_STAGES,
    HEAT_BAR_MAX: HEAT_BAR_MAX,
    CRACK_THRESHOLD_MS: CRACK_THRESHOLD_MS,
    MAX_CRACKS: MAX_CRACKS,
    ALLOYS: ALLOYS,
    TITLES: TITLES,
    SUBJECTS: SUBJECTS,
    CATEGORIES: CATEGORIES,
    BUCKETS: BUCKETS,
    ACHIEVEMENTS: ACHIEVEMENTS,
    BLOCK_BONUS: BLOCK_BONUS,
    LEGENDARY_ATTEMPT_BONUS: LEGENDARY_ATTEMPT_BONUS,
    heatMinutes: heatMinutes,
    heatStageIndex: heatStageIndex,
    heatFill: heatFill,
    ingotsFor: ingotsFor,
    streakMultiplier: streakMultiplier,
    dayKey: dayKey,
    dayDiff: dayDiff,
    currentStreak: currentStreak,
    advanceStreak: advanceStreak,
    alloyIndex: alloyIndex,
    unlockedTitles: unlockedTitles,
    blockBonus: blockBonus,
    isLegendaryAttempt: isLegendaryAttempt,
    sessionIngots: sessionIngots,
    qualifiesForStreak: qualifiesForStreak,
    newAchievements: newAchievements,
    subjectTotals: subjectTotals,
    topSubject: topSubject,
    formatClock: formatClock,
    formatMinutes: formatMinutes
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = root.SF || {};
  root.SF.logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
