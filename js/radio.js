/* StudyForge v2 — Forge Radio: the gooey player. Plays the built-in ambient sounds,
   or a YouTube Music / YouTube playlist through YouTube's official embedded player. */
(function (root) {
  'use strict';

  var doc = root.document;
  var sound = root.SF.sound;
  var amb = sound.ambient;

  var el = {
    radio: doc.getElementById('radio'),
    name: doc.getElementById('radio-name'),
    panel: doc.getElementById('radio-panel'),
    prev: doc.querySelector('#radio .r-prev'),
    toggle: doc.querySelector('#radio .r-toggle'),
    next: doc.querySelector('#radio .r-next'),
    tracks: doc.getElementById('track-list'),
    volume: doc.getElementById('amb-volume'),
    ytForm: doc.getElementById('yt-form'),
    ytUrl: doc.getElementById('yt-url'),
    ytStatus: doc.getElementById('yt-status'),
    ytFrame: doc.getElementById('yt-frame')
  };

  var settings = null;   // the app's state.settings
  var persist = function () {};
  var yt = { player: null, ready: false, loading: false, playing: false, pendingSource: null };

  // ---------- YouTube link parsing ----------
  // Accepts music.youtube.com / youtube.com / youtu.be links and returns { list, video }.
  function parseYouTube(text) {
    var url;
    try { url = new URL(text.trim()); } catch (e) { return null; }
    var host = url.hostname.replace(/^www\.|^m\./, '');
    var list = url.searchParams.get('list');
    var video = url.searchParams.get('v');
    if (host === 'youtu.be') video = url.pathname.slice(1).split('/')[0] || null;
    else if (host !== 'youtube.com' && host !== 'music.youtube.com') return null;
    if (!video && /^\/(embed|shorts|live)\//.test(url.pathname)) video = url.pathname.split('/')[2];
    var ok = /^[\w-]{6,}$/;
    if (list && !ok.test(list)) list = null;
    if (video && !ok.test(video)) video = null;
    return list || video ? { list: list, video: video } : null;
  }

  function ytAvailable() {
    if (location.protocol === 'file:') {
      return 'YouTube only plays when StudyForge is opened from a web address. ' +
        'Close this tab and double-click "Start StudyForge.bat" (Windows) instead of index.html.';
    }
    if (!navigator.onLine) return 'You are offline. YouTube Music needs an internet connection.';
    return null;
  }

  function loadApi(cb) {
    if (root.YT && root.YT.Player) return cb();
    var prev = root.onYouTubeIframeAPIReady;
    root.onYouTubeIframeAPIReady = function () {
      if (prev) prev();
      cb();
    };
    if (!doc.getElementById('yt-api')) {
      var s = doc.createElement('script');
      s.id = 'yt-api';
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = function () { status('Could not reach YouTube. Check your internet connection.'); yt.loading = false; };
      doc.head.appendChild(s);
    }
  }

  function status(msg) { el.ytStatus.textContent = msg; }

  function loadYouTube(src, autoplay) {
    var problem = ytAvailable();
    if (problem) { status(problem); return; }
    status('Loading YouTube player…');
    yt.loading = true;
    loadApi(function () {
      var playerVars = { autoplay: autoplay ? 1 : 0, rel: 0, modestbranding: 1, playsinline: 1, origin: location.origin };
      if (src.list) { playerVars.listType = 'playlist'; playerVars.list = src.list; }
      if (yt.player && yt.ready) {
        if (src.list) yt.player[autoplay ? 'loadPlaylist' : 'cuePlaylist']({ list: src.list, listType: 'playlist', index: 0 });
        else yt.player[autoplay ? 'loadVideoById' : 'cueVideoById'](src.video);
        yt.loading = false;
        return;
      }
      el.ytFrame.classList.add('ready');
      yt.player = new root.YT.Player('yt-player', {
        width: '100%', height: '100%',
        videoId: src.video || undefined,
        playerVars: playerVars,
        events: {
          onReady: function () {
            yt.ready = true;
            yt.loading = false;
            status('Ready. Use ⏮ ⏯ ⏭ on the radio to control it.');
            render();
          },
          onStateChange: function (e) {
            yt.playing = e.data === root.YT.PlayerState.PLAYING;
            if (yt.playing) amb.stop();
            render();
          },
          onError: function (e) {
            var msgs = { 2: 'That link is not valid.', 5: 'This video can\'t play in an embedded player.',
              100: 'Video not found or private.', 101: 'The owner doesn\'t allow this video to play outside YouTube.',
              150: 'The owner doesn\'t allow this video to play outside YouTube.', 153: 'YouTube refused to load here. Open StudyForge from its web address.' };
            status(msgs[e.data] || 'YouTube error ' + e.data + '.');
            if (yt.player && src.list && (e.data === 101 || e.data === 150)) yt.player.nextVideo();
          }
        }
      });
    });
  }

  function ytTitle() {
    try {
      var d = yt.player.getVideoData();
      return d && d.title ? d.title : null;
    } catch (e) { return null; }
  }

  // ---------- Controls ----------
  function source() { return settings.radioSource === 'youtube' ? 'youtube' : 'ambient'; }

  function isPlaying() {
    return source() === 'youtube' ? yt.playing : amb.playing() >= 0;
  }

  function toggle() {
    if (source() === 'youtube') {
      if (!yt.ready) {
        var src = parseYouTube(settings.ytUrl || '');
        if (src) loadYouTube(src, true);
        else openPanel(true);
        return;
      }
      if (yt.playing) yt.player.pauseVideo();
      else yt.player.playVideo();
    } else if (amb.playing() >= 0) {
      amb.stop();
    } else {
      amb.setVolume(settings.ambientVolume / 100);
      amb.start(settings.ambientTrack || 0);
    }
    render();
  }

  function step(dir) {
    if (source() === 'youtube') {
      if (!yt.ready) return;
      if (dir < 0) yt.player.previousVideo();
      else yt.player.nextVideo();
      return;
    }
    var n = amb.TRACKS.length;
    settings.ambientTrack = ((settings.ambientTrack || 0) + dir + n) % n;
    persist();
    if (amb.playing() >= 0) amb.start(settings.ambientTrack);
    render();
  }

  // ---------- Panel ----------
  function openPanel(open) {
    el.panel.hidden = !open;
    el.name.setAttribute('aria-expanded', String(open));
    el.radio.classList.toggle('open', open || el.radio.matches(':hover'));
    if (open) render();
  }

  function setSource(src) {
    if (src === source()) return;
    if (src === 'youtube') amb.stop();
    else if (yt.ready && yt.playing) yt.player.pauseVideo();
    settings.radioSource = src;
    persist();
    render();
    if (src === 'youtube') {
      var problem = ytAvailable();
      if (problem) status(problem);
    }
  }

  function render() {
    var src = source();
    var playing = isPlaying();
    el.radio.classList.toggle('playing', playing);
    var label;
    if (src === 'youtube') label = (yt.ready && ytTitle()) || 'YouTube Music';
    else label = amb.TRACKS[settings.ambientTrack || 0].name;
    el.name.textContent = (playing ? '♪ ' : '') + label;
    el.toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play ' + label);

    doc.querySelectorAll('.radio-tab').forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.source === src));
    });
    doc.querySelectorAll('.radio-src').forEach(function (p) { p.hidden = p.dataset.for !== src; });

    if (!el.tracks.childNodes.length) {
      amb.TRACKS.forEach(function (t, i) {
        var li = doc.createElement('li');
        var b = doc.createElement('button');
        b.type = 'button';
        b.textContent = t.name;
        b.addEventListener('click', function () {
          settings.ambientTrack = i;
          persist();
          amb.setVolume(settings.ambientVolume / 100);
          amb.start(i);
          render();
        });
        li.appendChild(b);
        el.tracks.appendChild(li);
      });
    }
    el.tracks.querySelectorAll('button').forEach(function (b, i) {
      b.setAttribute('aria-pressed', String(i === (settings.ambientTrack || 0)));
    });
  }

  // YouTube doesn't tell us when the title changes mid-playlist, so refresh it occasionally.
  setInterval(function () { if (yt.ready && settings && source() === 'youtube') render(); }, 3000);

  function init(opts) {
    settings = opts.settings;
    persist = opts.save;
    el.volume.value = settings.ambientVolume;
    el.ytUrl.value = settings.ytUrl || '';

    el.radio.addEventListener('mouseenter', function () { el.radio.classList.add('open'); });
    el.radio.addEventListener('mouseleave', function () { if (el.panel.hidden) el.radio.classList.remove('open'); });
    el.radio.addEventListener('focusin', function () { el.radio.classList.add('open'); });
    el.toggle.addEventListener('click', function () { sound.unlock(); toggle(); });
    el.prev.addEventListener('click', function () { step(-1); });
    el.next.addEventListener('click', function () { step(1); });
    el.name.addEventListener('click', function () { openPanel(el.panel.hidden); });
    doc.querySelectorAll('.radio-tab').forEach(function (t) {
      t.addEventListener('click', function () { setSource(t.dataset.source); });
    });
    el.volume.addEventListener('input', function () {
      settings.ambientVolume = +el.volume.value;
      amb.setVolume(settings.ambientVolume / 100);
    });
    el.volume.addEventListener('change', persist);
    el.ytForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var src = parseYouTube(el.ytUrl.value);
      if (!src) {
        status('That doesn\'t look like a YouTube Music or YouTube link. Tip: in YT Music use Share → Copy link.');
        return;
      }
      settings.ytUrl = el.ytUrl.value.trim();
      persist();
      loadYouTube(src, true);
    });
    // Close the panel when clicking elsewhere.
    doc.addEventListener('mousedown', function (e) {
      if (!el.panel.hidden && !el.radio.contains(e.target)) openPanel(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.panel.hidden) { e.stopPropagation(); openPanel(false); }
    }, true);
    render();
  }

  function setEnabled(on) {
    el.radio.hidden = !on;
    if (!on) {
      amb.stop();
      if (yt.ready && yt.playing) yt.player.pauseVideo();
      openPanel(false);
    }
  }

  root.SF = root.SF || {};
  root.SF.radio = { init: init, setEnabled: setEnabled, parseYouTube: parseYouTube };
})(window);
