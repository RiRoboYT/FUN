/* StudyForge v2.3 — The Vault: a 3D showroom of forged alloys (three.js r158, loaded on demand).
   Forged alloys are physically-based metal ingots under studio lighting; locked alloys are stone
   moulds, and the next one fills with molten metal as Ingots are earned. */
(function (root) {
  'use strict';

  var L = root.SF.logic;
  var doc = root.document;
  var reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var THREE = null;
  var V = {
    mounted: false, loading: false, failed: false, visible: false, onScreen: true, running: false,
    state: null, key: '', selected: 0, inspect: false, time: 0
  };

  var RADIUS = 3.4;
  var STEP = (Math.PI * 2) / 5;
  var PEDESTAL_TOP = 0.5;

  // Per-alloy metal recipes for MeshPhysicalMaterial.
  var METALS = {
    bronze: { color: 0xc98552, roughness: 0.34, mark: 'CU·SN', fine: 'BRONZE ALLOY' },
    silver: { color: 0xdfe3e8, roughness: 0.22, mark: 'AG', fine: '999 FINE SILVER' },
    gold: { color: 0xffc25e, roughness: 0.2, mark: 'AU', fine: '999.9 FINE GOLD' },
    platinum: { color: 0xd3dceb, roughness: 0.15, mark: 'PT', fine: '950 PLATINUM', clearcoat: 0.6 },
    mythril: { color: 0x9eeedd, roughness: 0.16, mark: 'MI', fine: 'TRUE MYTHRIL', iridescence: 1 }
  };

  var renderer, scene, camera, turntable, cursorLight, keyLight, raycaster, pointerNdc;
  var slots = [];
  var lava = null;
  var embers = null;
  var camPos, camLook, camLookNow;
  var rot = 0, rotTarget = 0;
  var drag = null;
  var spin = { yaw: 0, pitch: 0 };
  var el = {};

  // ---------- Loading ----------
  function webglAvailable() {
    try {
      var c = doc.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }

  function loadThree(cb) {
    if (root.THREE) return cb(true);
    var s = doc.createElement('script');
    s.src = 'vendor/three.min.js';
    s.onload = function () { cb(!!root.THREE); };
    s.onerror = function () { cb(false); };
    doc.head.appendChild(s);
  }

  function fallback(reason) {
    V.failed = true;
    el.vault.classList.add('no3d');
    el.loading.hidden = true;
    if (reason) console.info('StudyForge Vault: showing 2D alloys (' + reason + ')');
  }

  // ---------- Scene ----------
  function studioEnvironment() {
    // A dark room with soft-box panels; PMREM turns it into image-based lighting for the metals.
    var env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24),
      new THREE.MeshBasicMaterial({ color: 0x0c0907, side: THREE.BackSide })));
    function panel(w, h, color, power, x, y, z) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    }
    panel(9, 2.2, 0xffffff, 3.2, 0, 5.5, 1);     // overhead soft box
    panel(3, 6, 0xfff0dc, 3.2, -9, 2.5, 3);      // warm key strip
    panel(3, 6, 0xdce9ff, 2.6, 9, 2.5, -1);      // cool fill strip
    panel(10, 1.5, 0xff6a1a, 3.5, 0, 0.6, -10);  // forge glow behind the shelf
    panel(4, 1, 0xffffff, 2, 0, 1.2, 10);        // catch-light in front
    var pm = new THREE.PMREMGenerator(renderer);
    var tex = pm.fromScene(env, 0.035).texture;
    pm.dispose();
    return tex;
  }

  function radialTexture(inner, outer) {
    var c = doc.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildScene() {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x120e0b, 1);
    var canvas = renderer.domElement;
    canvas.className = 'vault-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    el.stage.insertBefore(canvas, el.stage.firstChild);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x120e0b, 11, 20);
    scene.environment = studioEnvironment();

    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    camPos = new THREE.Vector3(0, 2.55, RADIUS + 5.6);
    camLook = new THREE.Vector3(0, 0.62, RADIUS - 0.3);
    camLookNow = camLook.clone();
    camera.position.copy(camPos);

    scene.add(new THREE.HemisphereLight(0xffe8d0, 0x1a1008, 0.35));

    keyLight = new THREE.SpotLight(0xfff1e2, 140, 16, Math.PI / 7, 0.55, 2);
    keyLight.position.set(0.6, 7, RADIUS + 2.4);
    keyLight.target.position.set(0, PEDESTAL_TOP, RADIUS);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.radius = 4;
    scene.add(keyLight, keyLight.target);

    var rim = new THREE.DirectionalLight(0xff8a3d, 1.1);
    rim.position.set(-4, 3, -6);
    scene.add(rim);

    // Follows the mouse so highlights glide across the metal.
    cursorLight = new THREE.PointLight(0xfff3e6, 9, 7, 2);
    cursorLight.position.set(0, 2.2, RADIUS + 2);
    scene.add(cursorLight);

    var floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64),
      new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.55, metalness: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    turntable = new THREE.Group();
    scene.add(turntable);

    var stone = new THREE.MeshStandardMaterial({ color: 0x26211d, roughness: 0.78, metalness: 0.08 });
    var pedGeo = new THREE.CylinderGeometry(1.3, 1.42, PEDESTAL_TOP, 64);
    for (var i = 0; i < L.ALLOYS.length; i++) {
      var g = new THREE.Group();
      var ang = i * STEP;
      g.position.set(Math.sin(ang) * RADIUS, 0, Math.cos(ang) * RADIUS);
      g.rotation.y = ang;
      var ped = new THREE.Mesh(pedGeo, stone);
      ped.position.y = PEDESTAL_TOP / 2;
      ped.castShadow = ped.receiveShadow = true;
      g.add(ped);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(1.31, 0.022, 12, 96),
        new THREE.MeshPhysicalMaterial({ color: METALS[L.ALLOYS[i].id].color, metalness: 1, roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = PEDESTAL_TOP;
      g.add(ring);
      var content = new THREE.Group();
      content.position.y = PEDESTAL_TOP;
      g.add(content);
      turntable.add(g);
      slots.push({ group: g, content: content, item: null, kind: null, anchor: new THREE.Vector3(), lift: 0 });
    }

    raycaster = new THREE.Raycaster();
    pointerNdc = new THREE.Vector2(0, 0);
  }

  // ---------- Ingots ----------
  function ingotGeometry() {
    // A tapered bar: the top face is narrower than the base, like a cast ingot.
    var g = new THREE.BoxGeometry(1.7, 0.46, 0.86, 1, 1, 1);
    var p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        p.setX(i, p.getX(i) * 0.82);
        p.setZ(i, p.getZ(i) * 0.72);
      }
    }
    g.computeVertexNormals();
    g.translate(0, 0.23, 0);
    return g;
  }

  // Engraved lettering: a bump map pushes the letters in, a roughness map makes them matte.
  function stampTextures(lines, baseRough) {
    var W = 1024, H = 480;
    function draw(bg, ink) {
      var c = doc.createElement('canvas');
      c.width = W; c.height = H;
      var g = c.getContext('2d');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = ink;
      g.lineWidth = 10;
      g.strokeRect(70, 70, W - 140, H - 140);
      g.fillStyle = ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      var y = H / 2 - (lines.length - 1) * 52;
      lines.forEach(function (ln) {
        g.font = (ln.weight || 700) + ' ' + ln.size + 'px Georgia, "Times New Roman", serif';
        g.fillText(ln.text, W / 2, y);
        y += ln.gap || 104;
      });
      var t = new THREE.CanvasTexture(c);
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    }
    var r = Math.round(baseRough * 255), r2 = Math.min(255, Math.round((baseRough + 0.4) * 255));
    return {
      bump: draw('#9a9a9a', '#2a2a2a'),
      rough: draw('rgb(' + r + ',' + r + ',' + r + ')', 'rgb(' + r2 + ',' + r2 + ',' + r2 + ')')
    };
  }

  // The name stamped on hallmarks: the smith's chosen name, or their equipped title.
  function displayName(state) {
    var name = (state.settings.smithName || '').trim();
    if (name) return name;
    var t = L.TITLES.filter(function (x) { return x.id === state.equippedTitle; })[0];
    return t ? t.name : 'A Smith';
  }

  function smithName(state) { return displayName(state).toUpperCase(); }

  function fmtDate(ts) {
    return ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase() : '';
  }

  function makeIngot(i, state, journey) {
    var alloy = L.ALLOYS[i];
    var m = METALS[alloy.id];
    var base = {
      color: m.color, metalness: 1, roughness: m.roughness, envMapIntensity: 1.25,
      clearcoat: m.clearcoat || 0, clearcoatRoughness: 0.15
    };
    if (m.iridescence) {
      base.iridescence = m.iridescence;
      base.iridescenceIOR = 1.75;
      base.iridescenceThicknessRange = [250, 900];
    }
    function stamped(lines) {
      var tx = stampTextures(lines, m.roughness);
      return new THREE.MeshPhysicalMaterial(Object.assign({}, base, {
        bumpMap: tx.bump, bumpScale: 2.2, roughnessMap: tx.rough, roughness: 1
      }));
    }
    var plain = new THREE.MeshPhysicalMaterial(base);
    var top = stamped([{ text: alloy.name.toUpperCase(), size: 150 }, { text: m.fine, size: 62, weight: 600 }]);
    var front = stamped([{ text: m.mark, size: 210 }]);
    var back = stamped([
      { text: 'FORGED BY', size: 54, weight: 600, gap: 92 },
      { text: smithName(state), size: 92, gap: 100 },
      { text: fmtDate(journey.forgedAt), size: 56, weight: 600 }
    ]);
    // BoxGeometry face order: +x, -x, +y (top), -y, +z (front), -z (back).
    var mesh = new THREE.Mesh(ingotGeometry(), [plain, plain, top, plain, front, back]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------- Moulds & molten metal ----------
  function mouldGeometry() {
    var s = new THREE.Shape();
    s.moveTo(-1.1, -0.62); s.lineTo(1.1, -0.62); s.lineTo(1.1, 0.62); s.lineTo(-1.1, 0.62); s.lineTo(-1.1, -0.62);
    var hole = new THREE.Path();
    hole.moveTo(-0.86, -0.43); hole.lineTo(-0.86, 0.43); hole.lineTo(0.86, 0.43); hole.lineTo(0.86, -0.43); hole.lineTo(-0.86, -0.43);
    s.holes.push(hole);
    var g = new THREE.ExtrudeGeometry(s, { depth: 0.46, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  var LAVA_VERT = [
    'varying vec2 vUv;',
    'void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
  ].join('\n');

  // Flowing value-noise: bright molten metal with a darker cooling crust drifting across it.
  var LAVA_FRAG = [
    'uniform float uTime;',
    'varying vec2 vUv;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }',
    'float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }',
    'void main() {',
    '  vec2 p = vUv * vec2(7.0, 3.6);',
    '  float t = uTime * 0.18;',
    '  float n = fbm(p + vec2(t, -t * 0.6) + fbm(p * 0.7 - t) * 1.4);',
    '  float hot = smoothstep(0.25, 0.85, n);',
    '  vec3 col = mix(vec3(0.75, 0.16, 0.02), vec3(1.0, 0.62, 0.12), hot);',
    '  col = mix(col, vec3(1.0, 0.93, 0.62), pow(hot, 6.0));',
    '  float crust = smoothstep(0.52, 0.62, fbm(p * 1.6 - vec2(t * 0.4, t)));',
    '  col = mix(col, vec3(0.16, 0.05, 0.02), crust * 0.7);',
    '  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);',
    '  col *= mix(1.35, 1.0, edge);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function makeMould(i, fill, isNext) {
    var g = new THREE.Group();
    var stone = new THREE.MeshStandardMaterial({ color: isNext ? 0x2f2823 : 0x221d19, roughness: 0.92, metalness: 0.05 });
    var mould = new THREE.Mesh(mouldGeometry(), stone);
    mould.castShadow = mould.receiveShadow = true;
    g.add(mould);
    var floor = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.04, 0.88), new THREE.MeshStandardMaterial({ color: 0x0e0b09, roughness: 1 }));
    floor.position.y = 0.02;
    g.add(floor);
    g.userData.lava = null;
    if (isNext && fill > 0.005) {
      var level = 0.05 + fill * 0.38;
      var mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG, toneMapped: false });
      var surface = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.86), mat);
      surface.rotation.x = -Math.PI / 2;
      surface.position.y = level;
      g.add(surface);
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: radialTexture('rgba(255,140,40,0.85)', 'rgba(255,80,0,0)'),
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
      }));
      glow.scale.set(3.4, 2.2, 1);
      glow.position.y = level + 0.35;
      g.add(glow);
      var light = new THREE.PointLight(0xff6a1a, 4 + fill * 6, 4.5, 2);
      light.position.y = level + 0.5;
      g.add(light);
      var bubbles = [];
      var bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false });
      for (var b = 0; b < 7; b++) {
        var bub = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), bubbleMat);
        bub.userData = { phase: Math.random(), speed: 0.35 + Math.random() * 0.4, size: 0.025 + Math.random() * 0.03 };
        bub.position.set((Math.random() - 0.5) * 1.5, level, (Math.random() - 0.5) * 0.7);
        g.add(bub);
        bubbles.push(bub);
      }
      g.userData.lava = { mat: mat, glow: glow, light: light, bubbles: bubbles, level: level, fill: fill };
    }
    return g;
  }

  function makeEmbers() {
    var n = 70;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3);
    var meta = [];
    for (var i = 0; i < n; i++) {
      meta.push({ x: (Math.random() - 0.5) * 1.8, z: (Math.random() - 0.5) * 0.9, y: Math.random() * 1.6, v: 0.25 + Math.random() * 0.45, w: Math.random() * 6.28 });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffa040, size: 0.045, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    pts.userData.meta = meta;
    return pts;
  }

  function disposeTree(obj) {
    obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      var mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach(function (m) {
        ['map', 'bumpMap', 'roughnessMap'].forEach(function (k) { if (m[k]) m[k].dispose(); });
        m.dispose();
      });
    });
  }

  // ---------- Data → scene ----------
  function statusOf(state) {
    var alloyIdx = L.alloyIndex(L.achievementStats(state));
    var journey = L.alloyJourney(state);
    return L.ALLOYS.map(function (a, i) {
      var kind = i <= alloyIdx ? 'forged' : i === alloyIdx + 1 ? 'next' : 'locked';
      return { kind: kind, journey: journey[i], fill: kind === 'next' ? L.mouldFill(state, i) : 0 };
    });
  }

  function rebuild(state) {
    var status = statusOf(state);
    var key = JSON.stringify([status.map(function (s) { return s.kind + ':' + (s.journey.forgedAt || '') + ':' + s.fill.toFixed(2); }), smithName(state)]);
    V.status = status;
    if (key === V.key) return;
    V.key = key;
    lava = null;
    if (embers) { turntable.remove(embers); disposeTree(embers); embers = null; }
    slots.forEach(function (slot, i) {
      if (slot.item) { slot.content.remove(slot.item); disposeTree(slot.item); }
      var s = status[i];
      slot.kind = s.kind;
      slot.item = s.kind === 'forged' ? makeIngot(i, state, s.journey) : makeMould(i, s.fill, s.kind === 'next');
      slot.item.userData.slot = i;
      slot.content.add(slot.item);
      if (s.kind === 'next') {
        lava = slot.item.userData.lava;
        embers = makeEmbers();
        embers.position.copy(slot.group.position);
        embers.position.y = PEDESTAL_TOP + 0.2;
        embers.rotation.y = slot.group.rotation.y;
        turntable.add(embers);
      }
    });
  }

  // ---------- Selection & camera ----------
  function nearestAngle(target, current) {
    var d = ((target - current) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return current + d;
  }

  function select(i, opts) {
    opts = opts || {};
    V.selected = (i + slots.length) % slots.length;
    rotTarget = nearestAngle(-V.selected * STEP, rot);
    if (opts.inspect != null) setInspect(opts.inspect);
    renderPanel();
    renderLabels(true);
    if (reducedMotion) rot = rotTarget;
    wake();
  }

  function setInspect(on) {
    V.inspect = !!on;
    spin.yaw = 0;
    spin.pitch = 0;
    el.vault.classList.toggle('inspecting', V.inspect);
    el.exit.hidden = !V.inspect;
    if (V.inspect) {
      camPos.set(0, 1.5, RADIUS + 3.1);
      camLook.set(0, 0.9, RADIUS);
    } else {
      camPos.set(0, 2.55, RADIUS + 5.6);
      camLook.set(0, 0.62, RADIUS - 0.3);
    }
    if (reducedMotion) { camera.position.copy(camPos); camLookNow.copy(camLook); }
    wake();
  }

  // ---------- Pointer ----------
  function ndc(e) {
    var r = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  function pickSlot() {
    raycaster.setFromCamera(pointerNdc, camera);
    var hits = raycaster.intersectObjects(slots.map(function (s) { return s.group; }), true);
    for (var h = 0; h < hits.length; h++) {
      var o = hits[h].object;
      while (o && o.userData.slot == null) o = o.parent;
      if (o) return o.userData.slot;
    }
    return -1;
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    renderer.domElement.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, rot: rot, yaw: spin.yaw, pitch: spin.pitch, moved: 0, lastX: e.clientX, vel: 0 };
    wake();
  }

  function onPointerMove(e) {
    ndc(e);
    if (drag) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (V.inspect) {
        spin.yaw = drag.yaw + dx * 0.012;
        spin.pitch = Math.max(-0.7, Math.min(0.9, drag.pitch + dy * 0.008));
      } else {
        rot = drag.rot + dx * 0.0065;
        rotTarget = rot;
        drag.vel = (e.clientX - drag.lastX) * 0.0065;
        drag.lastX = e.clientX;
      }
    }
    wake();
  }

  function onPointerUp(e) {
    if (!drag) return;
    var d = drag;
    drag = null;
    if (d.moved < 6) {
      ndc(e);
      var i = pickSlot();
      if (i >= 0) select(i, { inspect: i === V.selected ? !V.inspect : V.inspect });
      else if (V.inspect) setInspect(false);
      return;
    }
    if (!V.inspect) {
      // Fling: carry a little momentum, then settle on the nearest pedestal.
      var projected = rot + d.vel * 8;
      select(Math.round(-projected / STEP));
    }
  }

  function onPointerLeave() {
    pointerNdc.set(0, 0.2);
    wake();
  }

  // ---------- Loop ----------
  var clock = null;
  var settleFrames = 0;

  function wake() {
    settleFrames = 90;
    updateRunning();
  }

  function shouldRun() {
    return V.mounted && !V.failed && V.visible && V.onScreen && !doc.hidden;
  }

  function updateRunning() {
    var run = shouldRun();
    if (run === V.running) return;
    V.running = run;
    renderer.setAnimationLoop(run ? frame : null);
    if (run) clock.getDelta();
  }

  function frame() {
    var dt = Math.min(0.05, clock.getDelta());
    if (!reducedMotion) V.time += dt;
    var k = reducedMotion ? 1 : 1 - Math.pow(0.0015, dt);

    if (!drag) rot += (rotTarget - rot) * k;
    turntable.rotation.y = rot;

    camera.position.lerp(camPos, k);
    camLookNow.lerp(camLook, k);
    camera.lookAt(camLookNow);

    // Cursor light: project the pointer onto a plane just in front of the shelf.
    raycaster.setFromCamera(pointerNdc, camera);
    var ray = raycaster.ray;
    var tPlane = (RADIUS + 1.3 - ray.origin.z) / ray.direction.z;
    if (isFinite(tPlane) && tPlane > 0) {
      var target = ray.origin.clone().addScaledVector(ray.direction, tPlane);
      target.y = Math.max(0.9, Math.min(3.2, target.y + 0.5));
      cursorLight.position.lerp(target, reducedMotion ? 1 : 0.2);
    }

    // Selected item: lift and, when inspecting, follow the drag.
    slots.forEach(function (slot, i) {
      var sel = i === V.selected;
      var wantLift = sel && V.inspect && slot.kind === 'forged' ? 0.42 : 0;
      slot.lift += (wantLift - slot.lift) * k;
      if (!slot.item) return;
      slot.item.position.y = slot.lift + (sel && !reducedMotion && slot.kind === 'forged' ? Math.sin(V.time * 1.6) * 0.015 : 0);
      if (sel && V.inspect && slot.kind === 'forged') {
        slot.item.rotation.y += (spin.yaw - slot.item.rotation.y) * k;
        slot.item.rotation.x += (spin.pitch - slot.item.rotation.x) * k;
      } else {
        slot.item.rotation.y += (0 - slot.item.rotation.y) * k;
        slot.item.rotation.x += (0 - slot.item.rotation.x) * k;
      }
    });

    animateLava(dt);
    renderer.render(scene, camera);
    renderLabels(false);

    // Idle detection: stop drawing once nothing is moving (lava keeps the loop alive when visible).
    if (settleFrames > 0) settleFrames--;
    if (!lava && !drag && settleFrames === 0 && !embers) {
      renderer.setAnimationLoop(null);
      V.running = false;
    }
  }

  function animateLava(dt) {
    if (lava) {
      lava.mat.uniforms.uTime.value = V.time;
      var flick = reducedMotion ? 0 : Math.sin(V.time * 7.3) * 0.5 + Math.sin(V.time * 13.1) * 0.3;
      lava.light.intensity = 4 + lava.fill * 6 + flick;
      lava.glow.material.opacity = 0.55 + 0.1 * Math.sin(V.time * 2.1);
      lava.bubbles.forEach(function (b) {
        var u = b.userData;
        if (reducedMotion) { b.visible = false; return; }
        u.phase += dt * u.speed;
        if (u.phase > 1) {
          u.phase = 0;
          b.position.x = (Math.random() - 0.5) * 1.5;
          b.position.z = (Math.random() - 0.5) * 0.7;
        }
        var s = u.phase < 0.8 ? u.size * (u.phase / 0.8) : u.size * (1 - (u.phase - 0.8) / 0.2) * 1.4;
        b.scale.setScalar(Math.max(0.0001, s));
        b.position.y = lava.level - 0.01 + u.phase * 0.02;
      });
    }
    if (embers) {
      var meta = embers.userData.meta;
      var pos = embers.geometry.attributes.position;
      embers.visible = !reducedMotion;
      for (var i = 0; i < meta.length; i++) {
        var m = meta[i];
        m.y += dt * m.v;
        if (m.y > 1.8) { m.y = 0; m.x = (Math.random() - 0.5) * 1.8; m.z = (Math.random() - 0.5) * 0.9; }
        pos.setXYZ(i, m.x + Math.sin(V.time * 1.3 + m.w) * 0.08 * m.y, m.y, m.z);
      }
      pos.needsUpdate = true;
      embers.material.opacity = 0.85;
    }
  }

  // ---------- HTML overlay: labels (also the keyboard-accessible controls) ----------
  var labelVec = null;

  function renderLabels(force) {
    if (!labelVec) labelVec = new THREE.Vector3();
    var w = el.stage.clientWidth, h = el.stage.clientHeight;
    slots.forEach(function (slot, i) {
      var b = slot.label;
      if (!b) return;
      slot.group.getWorldPosition(labelVec);
      var depth = labelVec.z;
      labelVec.y = PEDESTAL_TOP + (slot.kind === 'forged' ? 1.05 : 0.95) + slot.lift;
      labelVec.project(camera);
      var x = (labelVec.x * 0.5 + 0.5) * w, y = (-labelVec.y * 0.5 + 0.5) * h;
      var front = depth > RADIUS * 0.15;
      b.style.transform = 'translate(-50%, -100%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      b.classList.toggle('back', !front);
      b.classList.toggle('sel', i === V.selected);
      b.style.opacity = V.inspect && i !== V.selected ? '0' : front ? '1' : '0.35';
    });
    if (force) {
      slots.forEach(function (slot, i) {
        var s = V.status[i];
        var a = L.ALLOYS[i];
        var sub = s.kind === 'forged' ? 'Forged' : s.kind === 'next' ? Math.round(s.fill * 100) + '% in the mould' : 'Locked';
        slot.label.querySelector('b').textContent = a.name;
        slot.label.querySelector('small').textContent = sub;
        slot.label.setAttribute('aria-label', a.name + ', ' + sub + (i === V.selected ? ', selected' : ''));
        slot.label.setAttribute('aria-pressed', String(i === V.selected));
        slot.label.dataset.kind = s.kind;
      });
    }
  }

  function buildLabels() {
    el.labels.textContent = '';
    slots.forEach(function (slot, i) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'vault-label';
      b.dataset.alloy = L.ALLOYS[i].id;
      b.innerHTML = '<b></b><small></small>';
      b.addEventListener('click', function () { select(i, { inspect: i === V.selected ? !V.inspect : false }); });
      el.labels.appendChild(b);
      slot.label = b;
    });
  }

  // ---------- Side panel ----------
  function h(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function hours(ms) {
    var m = Math.round(ms / L.MIN);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }

  function renderPanel() {
    var state = V.state;
    if (!state || !V.status) return;
    var i = V.selected;
    var a = L.ALLOYS[i];
    var s = V.status[i];
    var p = el.panel;
    p.textContent = '';
    p.dataset.alloy = a.id;

    var head = h('div', 'vp-head');
    head.appendChild(h('span', 'vp-swatch'));
    var titles = h('div');
    titles.appendChild(h('h3', 'vp-name', a.name));
    titles.appendChild(h('span', 'vp-status ' + s.kind,
      s.kind === 'forged' ? (s.journey.forgedAt ? 'Forged ' + new Date(s.journey.forgedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Forged')
        : s.kind === 'next' ? 'In the mould · ' + Math.round(s.fill * 100) + '%' : 'Locked'));
    head.appendChild(titles);
    p.appendChild(head);

    var title = L.TITLES.filter(function (t) { return t.alloy === i; })[0];

    if (s.kind === 'forged') {
      var j = s.journey;
      if (j.forgedAt && i > 0) {
        p.appendChild(h('p', 'vp-lede', 'The road to ' + a.name));
        var grid = h('dl', 'vp-grid');
        [
          ['Took', j.days + (j.days === 1 ? ' day' : ' days')],
          ['Sessions', String(j.sessions)],
          ['Studied', hours(j.studied)],
          ['Top subject', j.topSubject || '—'],
          ['Best streak', j.bestStreak + (j.bestStreak === 1 ? ' day' : ' days')]
        ].forEach(function (r) {
          var d = h('div');
          d.appendChild(h('dt', null, r[0]));
          d.appendChild(h('dd', null, r[1]));
          grid.appendChild(d);
        });
        p.appendChild(grid);
      } else {
        p.appendChild(h('p', 'vp-lede', i === 0 ? 'Every smith starts with bronze. Your first ingot.' : 'Forged before your history began.'));
      }
      p.appendChild(h('p', 'vp-hallmark', 'Hallmark: “Forged by ' + displayName(state) + '”'));
      if (title) p.appendChild(h('p', 'vp-perk', 'Unlocked the title ' + title.name));
      var btn = h('button', 'btn vp-inspect', V.inspect ? 'Back to the shelf' : 'Inspect up close');
      btn.type = 'button';
      btn.addEventListener('click', function () { setInspect(!V.inspect); renderPanel(); });
      p.appendChild(btn);
      if (V.inspect) p.appendChild(h('p', 'muted small', 'Drag to turn the ingot. The engraving on the back carries your hallmark.'));
    } else {
      p.appendChild(h('p', 'vp-lede', s.kind === 'next' ? 'Molten ' + a.name.toLowerCase() + ' is filling the mould. Keep forging.' : 'An empty mould, waiting for its metal.'));
      var list = h('ul', 'vp-reqs');
      L.alloyRequirements(state, i).forEach(function (r) {
        var li = h('li', r.done ? 'done' : '');
        li.appendChild(h('span', 'vp-check', r.done ? '✓' : ''));
        var body = h('div');
        body.appendChild(h('span', 'vp-req-label', r.label));
        var bar = h('div', 'progress');
        var fill = h('div', 'progress-fill');
        fill.style.width = (r.frac * 100) + '%';
        bar.appendChild(fill);
        body.appendChild(bar);
        body.appendChild(h('small', 'muted', Math.min(r.cur, r.goal) + ' / ' + r.goal + ' ' + r.unit));
        li.appendChild(body);
        list.appendChild(li);
      });
      p.appendChild(list);
      if (title) p.appendChild(h('p', 'vp-perk', 'Reward: the title ' + title.name));
    }

    var nav = h('div', 'vp-nav');
    var prev = h('button', 'btn', '‹ ' + L.ALLOYS[(i + 4) % 5].name);
    var next = h('button', 'btn', L.ALLOYS[(i + 1) % 5].name + ' ›');
    prev.type = next.type = 'button';
    prev.addEventListener('click', function () { select(i - 1, { inspect: false }); });
    next.addEventListener('click', function () { select(i + 1, { inspect: false }); });
    nav.appendChild(prev);
    nav.appendChild(next);
    p.appendChild(nav);
  }

  // ---------- Mount ----------
  function resize() {
    if (!renderer) return;
    var w = el.stage.clientWidth, hgt = el.stage.clientHeight;
    if (!w || !hgt) return;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    // Pull back on narrow stages so all pedestals stay in frame.
    camera.fov = w / hgt < 1.3 ? 44 : 34;
    camera.updateProjectionMatrix();
    wake();
  }

  function observeVisibility() {
    // Pause rendering when the stage is scrolled away (content-visibility event, IO fallback).
    var supported = 'contentVisibility' in doc.documentElement.style;
    if (supported) {
      el.stage.addEventListener('contentvisibilityautostatechange', function (e) {
        V.onScreen = !e.skipped;
        updateRunning();
      });
    } else if ('IntersectionObserver' in root) {
      new IntersectionObserver(function (entries) {
        V.onScreen = entries[0].isIntersecting;
        updateRunning();
      }, { rootMargin: '200px' }).observe(el.stage);
    }
    doc.addEventListener('visibilitychange', updateRunning);
  }

  function mount() {
    if (V.mounted || V.loading || V.failed) return;
    el.vault = doc.getElementById('vault');
    el.stage = doc.getElementById('vault-stage');
    el.labels = doc.getElementById('vault-labels');
    el.panel = doc.getElementById('vault-panel');
    el.loading = doc.getElementById('vault-loading');
    el.exit = doc.getElementById('vault-exit');
    if (!webglAvailable()) return fallback('WebGL unavailable');
    V.loading = true;
    loadThree(function (ok) {
      V.loading = false;
      if (!ok) return fallback('three.js failed to load');
      THREE = root.THREE;
      try {
        buildScene();
      } catch (e) {
        console.error(e);
        return fallback('scene error');
      }
      clock = new THREE.Clock();
      buildLabels();
      V.mounted = true;
      el.loading.hidden = true;
      el.vault.classList.add('ready');

      var canvas = renderer.domElement;
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', function () { drag = null; });
      canvas.addEventListener('pointerleave', onPointerLeave);
      el.exit.addEventListener('click', function () { setInspect(false); renderPanel(); });
      el.stage.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); select(V.selected - 1, { inspect: false }); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); select(V.selected + 1, { inspect: false }); }
        else if (e.key === 'Enter' && V.status[V.selected].kind === 'forged') { e.preventDefault(); setInspect(!V.inspect); renderPanel(); }
        else if (e.key === 'Escape' && V.inspect) { e.preventDefault(); e.stopPropagation(); setInspect(false); renderPanel(); }
      });
      new ResizeObserver(resize).observe(el.stage);
      observeVisibility();

      if (V.state) update(V.state, true);
      resize();
    });
  }

  function update(state, first) {
    V.state = state;
    if (!V.mounted) return;
    rebuild(state);
    if (first || V.selectedFor !== V.key) {
      // Open on the current alloy.
      var cur = 0;
      V.status.forEach(function (s, i) { if (s.kind === 'forged') cur = i; });
      if (first) { V.selected = cur; rot = rotTarget = -cur * STEP; }
      V.selectedFor = V.key;
    }
    renderPanel();
    renderLabels(true);
    wake();
  }

  function setVisible(on) {
    V.visible = on;
    if (on) mount();
    if (!on && V.inspect) setInspect(false);
    if (V.mounted) updateRunning();
  }

  root.SF = root.SF || {};
  root.SF.vault = { setVisible: setVisible, update: update };
})(window);
