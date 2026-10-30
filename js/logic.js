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

  // v3: reaching an alloy makes it "ready to forge"; it only counts (title, alloy
  // achievements, the look on the dashboard) once it has been forged in the Vault.
  // Bronze is the starter alloy and is always forged.
  function forgedIndex(state) {
    var forged = (state && state.forged) || {};
    var idx = 0;
    for (var i = 1; i < ALLOYS.length; i++) {
      if (!forged[ALLOYS[i].id]) break;
      idx = i;
    }
    return idx;
  }

  // Alloys reached but not yet forged, in order.
  function readyToForge(state, reachedIdx) {
    var list = [];
    for (var i = forgedIndex(state) + 1; i <= reachedIdx; i++) list.push(i);
    return list;
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

  // ---------- Achievements ----------
  // Tiers work like Xbox Gamerscore: points for bragging rights, Ingots as the reward.
  var TIERS = {
    common: { name: 'Common', points: 10, ingots: 5 },
    rare: { name: 'Rare', points: 25, ingots: 15 },
    epic: { name: 'Epic', points: 50, ingots: 30 },
    legendary: { name: 'Legendary', points: 100, ingots: 60 }
  };

  var HOUR = 60 * MIN;

  function hourOf(ts) { return new Date(ts).getHours(); }
  function timed(r) { return r.mode !== 'manual'; }

  // `session` achievements are earned by any single logged session (record).
  // `stat` achievements are earned from lifetime totals and may show progress.
  var ACHIEVEMENTS = [
    // Common
    { id: 'first_ingot', name: 'First Ingot', icon: '🔨', tier: 'common', desc: 'Forge your very first Ingot.',
      stat: function (t) { return t.totalIngots >= 1; } },
    { id: 'warm_forge', name: 'Warm Forge', icon: '🔥', tier: 'common', desc: 'Heat the forge to Warm in a session.',
      session: function (r) { return r.peakStage >= 1; } },
    { id: 'exam_ready', name: 'Exam Ready', icon: '📝', tier: 'common', desc: 'Complete an Exam Timer.',
      session: function (r) { return r.mode === 'exam' && r.completed; } },
    { id: 'kindling', name: 'Kindling', icon: '🪵', tier: 'common', desc: 'Reach a 3-day streak.',
      stat: function (t) { return t.bestStreak >= 3; }, progress: function (t) { return [t.bestStreak, 3, 'days']; } },
    { id: 'field_study', name: 'Field Study', icon: '🎒', tier: 'common', desc: 'Log study you did away from the timer.',
      stat: function (t) { return t.manualCount >= 1; } },
    { id: 'scribe', name: 'Scribe', icon: '🪶', tier: 'common', desc: 'Write notes for 5 sessions.',
      stat: function (t) { return t.notesCount >= 5; }, progress: function (t) { return [t.notesCount, 5, 'notes']; } },
    { id: 'detour', name: 'Disciplined Detour', icon: '📖', tier: 'common', desc: 'Return from an Open for Study window on time.',
      session: function (r) { return !!r.ofsOnTime; } },

    // Rare
    { id: 'blazing_session', name: 'Blazing Session', icon: '☄️', tier: 'rare', desc: '40+ min Studied with under 5 min Distracted.',
      session: function (r) { return timed(r) && r.studied >= 40 * MIN && r.distracted < 5 * MIN; } },
    { id: 'distraction_slayer', name: 'Distraction Slayer', icon: '⚔️', tier: 'rare', desc: '0 Distracted minutes in a session of 25+ min.',
      session: function (r) { return timed(r) && r.studied + r.intentional + r.distracted >= 25 * MIN && r.distracted < MIN; } },
    { id: 'office_dweller', name: 'Office Dweller', icon: '🗂️', tier: 'rare', desc: 'Log 60 min of Intentional time (Office / Explorer / PDF).',
      stat: function (t) { return t.totalIntentional >= HOUR; }, progress: function (t) { return [t.totalIntentional / MIN, 60, 'min']; } },
    { id: 'pomodoro_pro', name: 'Pomodoro Pro', icon: '🍅', tier: 'rare', desc: 'Finish 4 work blocks in one Study Timer session.',
      session: function (r) { return r.mode === 'timer' && r.blocksDone >= 4; } },
    { id: 'blue_flame', name: 'Blue Flame', icon: '💠', tier: 'rare', desc: 'Reach Legendary heat in a session.',
      session: function (r) { return r.peakStage >= 4; } },
    { id: 'early_bird', name: 'Early Bird', icon: '🌅', tier: 'rare', desc: 'Start a 20+ min session before 7 AM.',
      session: function (r) { return timed(r) && r.studied >= 20 * MIN && hourOf(r.startedAt) < 7 && hourOf(r.startedAt) >= 4; } },
    { id: 'night_owl', name: 'Night Owl', icon: '🦉', tier: 'rare', desc: 'Finish a 30+ min session after 10 PM.',
      session: function (r) { return timed(r) && r.studied >= 30 * MIN && hourOf(r.endedAt) >= 22; } },
    { id: 'silver_lining', name: 'Silver Lining', icon: '🥈', tier: 'rare', desc: 'Forge the Silver alloy in the Vault.',
      stat: function (t) { return t.alloyIdx >= 1; }, progress: function (t) { return [t.totalIngots, 100, 'Ingots']; } },
    { id: 'polymath', name: 'Polymath', icon: '🧠', tier: 'rare', desc: 'Study 5 different subjects in one week.',
      stat: function (t) { return t.maxSubjectsInWeek >= 5; }, progress: function (t) { return [t.maxSubjectsInWeek, 5, 'subjects']; } },
    { id: 'ten_hours', name: 'Ten Hours In', icon: '⏳', tier: 'rare', desc: 'Study 10 hours in total.',
      stat: function (t) { return t.totalStudied >= 10 * HOUR; }, progress: function (t) { return [t.totalStudied / HOUR, 10, 'h']; } },

    // Epic
    { id: 'exam_warrior', name: 'Exam Warrior', icon: '🛡️', tier: 'epic', desc: 'Complete an Exam Timer at Blazing heat or higher.',
      session: function (r) { return r.mode === 'exam' && r.completed && r.peakStage >= 3; } },
    { id: 'streak_7', name: '7-Day Streak', icon: '📅', tier: 'epic', desc: 'Study 7 days in a row.',
      stat: function (t) { return t.bestStreak >= 7; }, progress: function (t) { return [t.bestStreak, 7, 'days']; } },
    { id: 'marathon', name: 'Marathon Smith', icon: '🏃', tier: 'epic', desc: 'Study 2+ hours in a single session.',
      session: function (r) { return timed(r) && r.studied >= 2 * HOUR; } },
    { id: 'flawless_hour', name: 'Flawless Hour', icon: '💎', tier: 'epic', desc: '60+ min Studied with zero Distracted time.',
      session: function (r) { return timed(r) && r.studied >= HOUR && r.distracted === 0; } },
    { id: 'double_shift', name: 'Double Shift', icon: '⚒️', tier: 'epic', desc: 'Study 4+ hours in one day.',
      stat: function (t) { return t.bestDay >= 4 * HOUR; }, progress: function (t) { return [t.bestDay / HOUR, 4, 'h']; } },
    { id: 'iron_will', name: 'Iron Will', icon: '🔒', tier: 'epic', desc: 'Complete an exam in Strict Mode.',
      session: function (r) { return r.mode === 'exam' && r.completed && !!r.strict; } },
    { id: 'legendary_attempt', name: 'Legendary Attempt', icon: '🌟', tier: 'epic', desc: 'Finish an exam with under 1 min Distracted.',
      session: function (r) { return !!r.legendary; } },
    { id: 'golden_touch', name: 'Golden Touch', icon: '🥇', tier: 'epic', desc: 'Forge the Gold alloy in the Vault.',
      stat: function (t) { return t.alloyIdx >= 2; }, progress: function (t) { return [t.totalIngots, 300, 'Ingots']; } },
    { id: 'fifty_hours', name: 'Fifty Hours', icon: '📚', tier: 'epic', desc: 'Study 50 hours in total.',
      stat: function (t) { return t.totalStudied >= 50 * HOUR; }, progress: function (t) { return [t.totalStudied / HOUR, 50, 'h']; } },

    // Legendary
    { id: 'eternal_flame', name: 'Eternal Flame', icon: '🕯️', tier: 'legendary', desc: 'Reach a 30-day streak.',
      stat: function (t) { return t.bestStreak >= 30; }, progress: function (t) { return [t.bestStreak, 30, 'days']; } },
    { id: 'mythril_smith', name: 'Mythril Smith', icon: '👑', tier: 'legendary', desc: 'Forge the Mythril alloy in the Vault.',
      stat: function (t) { return t.alloyIdx >= 4; }, progress: function (t) { return [t.totalIngots, 1500, 'Ingots']; } },
    { id: 'centurion', name: 'Centurion', icon: '🏛️', tier: 'legendary', desc: 'Study 100 hours in total.',
      stat: function (t) { return t.totalStudied >= 100 * HOUR; }, progress: function (t) { return [t.totalStudied / HOUR, 100, 'h']; } },

    // Secret — hidden in the Forge Hall until earned
    { id: 'midnight_oil', name: 'Midnight Oil', icon: '🌙', tier: 'rare', secret: true, desc: 'Finish a 20+ min session between midnight and 4 AM.',
      session: function (r) { return timed(r) && r.studied >= 20 * MIN && hourOf(r.endedAt) < 4; } },
    { id: 'phoenix', name: 'Phoenix', icon: '🐦‍🔥', tier: 'epic', secret: true, desc: 'Crack your work 3 times and still finish with 45+ min Studied.',
      session: function (r) { return timed(r) && r.cracks >= 3 && r.studied >= 45 * MIN && r.completed; } }
  ];

  function achievementById(id) {
    return ACHIEVEMENTS.filter(function (a) { return a.id === id; })[0];
  }

  // Lifetime numbers the stat achievements are judged on.
  function achievementStats(state) {
    var t = {
      totalIngots: state.totalIngots,
      totalIntentional: state.totalIntentional || 0,
      totalStudied: 0, bestDay: 0, maxSubjectsInWeek: 0,
      manualCount: 0, notesCount: 0, longestStudiedMin: 0,
      bestStreak: (state.streak && state.streak.best) || 0
    };
    var perDay = {}, perWeek = {};
    state.sessions.forEach(function (r) {
      t.totalStudied += r.studied;
      t.longestStudiedMin = Math.max(t.longestStudiedMin, r.studied / MIN);
      if (r.mode === 'manual') t.manualCount++;
      if (r.note) t.notesCount++;
      var k = dayKey(r.endedAt);
      perDay[k] = (perDay[k] || 0) + r.studied;
      if (r.studied > 0) {
        var w = weekStart(r.endedAt);
        (perWeek[w] = perWeek[w] || {})[r.subject] = true;
      }
    });
    Object.keys(perDay).forEach(function (k) { t.bestDay = Math.max(t.bestDay, perDay[k]); });
    Object.keys(perWeek).forEach(function (w) {
      t.maxSubjectsInWeek = Math.max(t.maxSubjectsInWeek, Object.keys(perWeek[w]).length);
    });
    t.reachedIdx = alloyIndex(t);
    t.alloyIdx = Math.min(t.reachedIdx, forgedIndex(state));
    return t;
  }

  function isEarned(a, t, sessions) {
    return a.session ? sessions.some(a.session) : a.stat(t);
  }

  // Unlocks everything newly earned, pays its Ingot reward, and pays rewards owed for
  // achievements unlocked before rewards existed. Repeats because rewards can unlock alloys.
  function unlockAchievements(state, now) {
    state.achievements = state.achievements || {};
    state.achievementsPaid = state.achievementsPaid || {};
    var ids = [], ingots = 0, backPay = 0;
    Object.keys(state.achievements).forEach(function (id) {
      var a = achievementById(id);
      if (a && !state.achievementsPaid[id]) {
        state.achievementsPaid[id] = true;
        backPay += TIERS[a.tier].ingots;
      }
    });
    state.totalIngots += backPay;
    for (var pass = 0; pass < 5; pass++) {
      var t = achievementStats(state);
      var fresh = ACHIEVEMENTS.filter(function (a) {
        return !state.achievements[a.id] && isEarned(a, t, state.sessions);
      });
      if (!fresh.length) break;
      fresh.forEach(function (a) {
        state.achievements[a.id] = now;
        state.achievementsPaid[a.id] = true;
        state.totalIngots += TIERS[a.tier].ingots;
        ingots += TIERS[a.tier].ingots;
        ids.push(a.id);
      });
    }
    return { ids: ids, ingots: ingots, backPay: backPay };
  }

  // ---------- Alloy journey (for the Vault) ----------
  // Replays history to find when each alloy was first reached, and what it took.
  function alloyJourney(state) {
    var recs = state.sessions.slice().sort(function (a, b) { return a.endedAt - b.endedAt; });
    var events = recs.map(function (r) { return { t: r.endedAt, rec: r, ingots: r.ingots || 0 }; });
    Object.keys(state.achievements || {}).forEach(function (id) {
      var a = achievementById(id);
      if (a) events.push({ t: state.achievements[id], ingots: TIERS[a.tier].ingots });
    });
    events.sort(function (a, b) { return a.t - b.t; });

    var forged = ALLOYS.map(function () { return null; });
    forged[0] = recs.length ? recs[0].startedAt || recs[0].endedAt : null;
    var ingots = 0, longest = 0, prefix = [], best = 0;
    var bestAt = ALLOYS.map(function () { return 0; });
    events.forEach(function (e) {
      ingots += e.ingots;
      if (e.rec) {
        prefix.push(e.rec);
        longest = Math.max(longest, e.rec.studied / MIN);
        best = computeStreak(prefix, state.settings.streakMinMin).best;
      }
      var idx = alloyIndex({ totalIngots: ingots, longestStudiedMin: longest, bestStreak: best });
      for (var i = 1; i <= idx; i++) {
        if (!forged[i]) { forged[i] = e.t; bestAt[i] = best; }
      }
    });

    return ALLOYS.map(function (a, i) {
      if (!forged[i]) return { forgedAt: null };
      var from = i > 0 && forged[i - 1] ? forged[i - 1] : -Infinity;
      var to = forged[i];
      var span = recs.filter(function (r) { return r.endedAt > from && r.endedAt <= to; });
      var subjects = {};
      var studied = 0;
      span.forEach(function (r) {
        studied += r.studied;
        subjects[r.subject] = (subjects[r.subject] || 0) + r.studied;
      });
      var start = isFinite(from) ? from : (span[0] ? span[0].startedAt || span[0].endedAt : to);
      return {
        forgedAt: to,
        days: i === 0 ? 0 : Math.max(1, Math.ceil((to - start) / 86400000)),
        sessions: span.length,
        studied: studied,
        topSubject: topSubject(subjects),
        bestStreak: i === 0 ? 0 : bestAt[i]
      };
    });
  }

  // Requirement checklist for alloy `i`, judged against the smith's current totals.
  function alloyRequirements(state, i) {
    var a = ALLOYS[i];
    var t = achievementStats(state);
    var list = [{ label: 'Forge ' + a.ingots + ' Ingots', cur: t.totalIngots, goal: a.ingots, unit: 'Ingots' }];
    if (a.longSessionMin) list.push({ label: 'One session with ' + a.longSessionMin + '+ min Studied', cur: Math.floor(t.longestStudiedMin), goal: a.longSessionMin, unit: 'min best' });
    if (a.streak) list.push({ label: 'Reach a ' + a.streak + '-day streak', cur: t.bestStreak, goal: a.streak, unit: 'days best' });
    list.forEach(function (r) { r.done = r.cur >= r.goal; r.frac = Math.min(1, r.cur / r.goal); });
    return list;
  }

  // How full the next alloy's mould is: Ingot progress from the previous alloy's threshold.
  function mouldFill(state, i) {
    if (i <= 0) return 1;
    var lo = ALLOYS[i - 1].ingots, hi = ALLOYS[i].ingots;
    return Math.max(0, Math.min(1, (state.totalIngots - lo) / (hi - lo)));
  }

  function forgeScore(state) {
    return ACHIEVEMENTS.reduce(function (sum, a) {
      return sum + (state.achievements[a.id] ? TIERS[a.tier].points : 0);
    }, 0);
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

  // Rebuild the streak from scratch, so entries logged for past days count correctly.
  function computeStreak(sessions, minStudiedMin, todayKey) {
    var days = {};
    sessions.forEach(function (r) {
      if (qualifiesForStreak(r, minStudiedMin)) days[dayKey(r.endedAt)] = true;
    });
    var keys = Object.keys(days).sort();
    var best = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      run = prev && dayDiff(prev, k) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    });
    var last = keys[keys.length - 1] || null;
    if (todayKey && last && dayDiff(last, todayKey) < 0) last = todayKey;
    return { count: run, lastDay: last, best: best };
  }

  // Local midnight on the Monday of the week containing `ts`.
  function weekStart(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }

  function addDays(ts, n) {
    var d = new Date(ts);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }

  // Totals for the 7 days starting at `startTs` (a weekStart value).
  function weekStats(sessions, startTs) {
    var endTs = addDays(startTs, 7);
    var days = [];
    for (var i = 0; i < 7; i++) {
      var ts = addDays(startTs, i);
      days.push({ ts: ts, key: dayKey(ts), studied: 0, intentional: 0, distracted: 0 });
    }
    var byKey = {};
    days.forEach(function (d) { byKey[d.key] = d; });
    var subjects = {}, distractions = {};
    var totals = { studied: 0, intentional: 0, distracted: 0, sessions: 0, logged: 0 };
    sessions.forEach(function (r) {
      if (r.endedAt < startTs || r.endedAt >= endTs) return;
      var d = byKey[dayKey(r.endedAt)];
      if (!d) return;
      d.studied += r.studied;
      d.intentional += r.intentional;
      d.distracted += r.distracted;
      totals.studied += r.studied;
      totals.intentional += r.intentional;
      totals.distracted += r.distracted;
      totals.sessions++;
      if (r.mode === 'manual') totals.logged += r.studied;
      subjects[r.subject] = (subjects[r.subject] || 0) + r.studied;
      Object.keys(r.distractions || {}).forEach(function (k) {
        distractions[k] = (distractions[k] || 0) + r.distractions[k];
      });
    });
    return { days: days, subjects: subjects, distractions: distractions, totals: totals };
  }

  // ---------- Forge temperature ----------
  // Heat minutes -> metal temperature in °C. Calibrated so the stages read like real
  // forging colours: Warm is a dull red glow, Hot orange, Blazing yellow, Legendary near white.
  var TEMP_CURVE = [[0, 20], [5, 560], [15, 880], [40, 1120], [70, 1380], [90, 1538]];
  var MAX_TEMP = 1538; // iron melts here
  var TEMP_MARKS = [{ label: 'Ag', name: 'Silver melts', c: 962 }, { label: 'Au', name: 'Gold melts', c: 1064 }];

  function tempFromHeat(heatMin) {
    var c = TEMP_CURVE;
    if (heatMin <= 0) return c[0][1];
    for (var i = 1; i < c.length; i++) {
      if (heatMin <= c[i][0]) {
        var t = (heatMin - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
        return c[i - 1][1] + t * (c[i][1] - c[i - 1][1]);
      }
    }
    return MAX_TEMP;
  }

  // Approximate blackbody colour (Tanner Helland's fit), returns [r, g, b] in 0..1.
  function blackbody(celsius) {
    var k = (celsius + 273.15) / 100;
    var r, g, b;
    if (k <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(k) - 161.1195681661;
      b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
    } else {
      r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
      b = 255;
    }
    function c(v) { return Math.max(0, Math.min(255, v)) / 255; }
    return [c(r), c(g), c(b)];
  }

  // The colour people *read* as that heat (dull red -> orange -> yellow -> white -> blue-white).
  // Pure blackbody is still orange at 1500 °C; brightness is what makes it look white.
  var HEAT_PALETTE = [[20, [0.42, 0.40, 0.38]], [480, [0.45, 0.12, 0.05]], [700, [0.78, 0.2, 0.06]],
    [900, [1.0, 0.42, 0.1]], [1100, [1.0, 0.7, 0.28]], [1300, [1.0, 0.9, 0.66]], [1450, [0.86, 0.93, 1.0]], [1538, [0.74, 0.86, 1.0]]];
  function heatColor(celsius) {
    var p = HEAT_PALETTE;
    if (celsius <= p[0][0]) return p[0][1].slice();
    for (var i = 1; i < p.length; i++) {
      if (celsius <= p[i][0]) {
        var t = (celsius - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
        return [0, 1, 2].map(function (k) { return p[i - 1][1][k] + t * (p[i][1][k] - p[i - 1][1][k]); });
      }
    }
    return p[p.length - 1][1].slice();
  }

  // How visibly the metal glows at this temperature (0 below ~500 °C, 1 near white heat).
  function glowAmount(celsius) {
    var t = Math.max(0, Math.min(1, (celsius - 480) / (1450 - 480)));
    return t * t * (3 - 2 * t);
  }

  // ---------- Calendar ----------
  // Per-day totals keyed by local YYYY-MM-DD.
  function dailyTotals(sessions) {
    var days = {};
    sessions.forEach(function (r) {
      var k = dayKey(r.endedAt);
      var d = days[k] || (days[k] = { studied: 0, intentional: 0, distracted: 0, sessions: [] });
      d.studied += r.studied;
      d.intentional += r.intentional;
      d.distracted += r.distracted;
      d.sessions.push(r);
    });
    return days;
  }

  // How brightly a day glows: 0 for no study, rising quickly for the first hour and
  // reaching full white heat at 4 hours.
  var DAY_FULL_MS = 4 * 60 * MIN;
  function dayGlow(studiedMs) {
    if (studiedMs <= 0) return 0;
    return Math.min(1, Math.pow(studiedMs / DAY_FULL_MS, 0.65));
  }
  function dayColor(t) {
    return heatColor(480 + t * 1020);
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
    forgedIndex: forgedIndex,
    readyToForge: readyToForge,
    blockBonus: blockBonus,
    isLegendaryAttempt: isLegendaryAttempt,
    sessionIngots: sessionIngots,
    qualifiesForStreak: qualifiesForStreak,
    TIERS: TIERS,
    achievementById: achievementById,
    achievementStats: achievementStats,
    unlockAchievements: unlockAchievements,
    forgeScore: forgeScore,
    alloyJourney: alloyJourney,
    alloyRequirements: alloyRequirements,
    mouldFill: mouldFill,
    computeStreak: computeStreak,
    weekStart: weekStart,
    addDays: addDays,
    weekStats: weekStats,
    subjectTotals: subjectTotals,
    topSubject: topSubject,
    formatClock: formatClock,
    MAX_TEMP: MAX_TEMP,
    TEMP_MARKS: TEMP_MARKS,
    tempFromHeat: tempFromHeat,
    blackbody: blackbody,
    heatColor: heatColor,
    dailyTotals: dailyTotals,
    dayGlow: dayGlow,
    dayColor: dayColor,
    glowAmount: glowAmount,
    formatMinutes: formatMinutes
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = root.SF || {};
  root.SF.logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
