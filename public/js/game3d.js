/**
 * High-quality third-person 3D world for MeshyMMO
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEG = Math.PI / 180;

export class Game3D {
  constructor(mount, hooks = {}) {
    this.mount = mount;
    this.hooks = hooks;
    this.keys = {};
    this.clock = new THREE.Clock();
    this.gltfLoader = new GLTFLoader();

    this.player = {
      x: 0,
      y: 0,
      z: 10,
      ry: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      onGround: true,
      speed: 9,
      sprint: 1.45,
    };

    // Third-person camera rig
    this.cam = {
      yaw: 0,
      pitch: 0.35,
      dist: 7.5,
      minDist: 3,
      maxDist: 14,
      height: 1.55,
      smooth: 12,
    };

    this.mouse = { down: false, lx: 0, ly: 0, sens: 0.0035 };
    this.attackCd = 0;
    this.remote = new Map();
    this.mobs = new Map();
    this.pickups = new Map();
    this.npcs = new Map();
    this.selfMesh = null;
    this.selfModelUrl = null;

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._initEnvironment();
    this._initPlayerVisual();
    this._bindInput();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._animate();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x87b7ff, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    if ('outputColorSpace' in this.renderer) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    this.mount.innerHTML = '';
    this.mount.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#7eb6ff');
    this.scene.fog = new THREE.FogExp2(0x9ec5ff, 0.012);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.08, 300);
    this.camera.position.set(0, 5, 15);

    this.world = new THREE.Group();
    this.entities = new THREE.Group();
    this.scene.add(this.world, this.entities);
  }

  _initLights() {
    this.hemi = new THREE.HemisphereLight(0xc8e0ff, 0x3d2b1a, 0.55);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d6, 1.55);
    this.sun.position.set(40, 55, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.camera.left = -55;
    this.sun.shadow.camera.right = 55;
    this.sun.shadow.camera.top = 55;
    this.sun.shadow.camera.bottom = -55;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(new THREE.AmbientLight(0xb0c4ff, 0.22));
    // fill rim
    const fill = new THREE.DirectionalLight(0xaaccff, 0.25);
    fill.position.set(-20, 10, -15);
    this.scene.add(fill);
  }

  _initEnvironment() {
    // Ground with subtle vertex colors
    const gSize = 100;
    const segs = 80;
    const geo = new THREE.PlaneGeometry(gSize, gSize, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const c1 = new THREE.Color('#3f7a3a');
    const c2 = new THREE.Color('#2f5f32');
    const c3 = new THREE.Color('#4a8a42');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = Math.sin(x * 0.15) * Math.cos(z * 0.12) * 0.5 + 0.5;
      const c = c1.clone().lerp(c2, n).lerp(c3, Math.sin(x * 0.05 + z * 0.07) * 0.3 + 0.3);
      // micro height
      pos.setY(i, Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.15);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    ground.receiveShadow = true;
    this.world.add(ground);

    // Sky dome gradient
    const skyGeo = new THREE.SphereGeometry(180, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#3d7fd6') },
        mid: { value: new THREE.Color('#87b7ff') },
        bot: { value: new THREE.Color('#dcecff') },
      },
      vertexShader: `
        varying vec3 vP;
        void main(){
          vP = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 top, mid, bot;
        varying vec3 vP;
        void main(){
          float h = vP.y * 0.5 + 0.5;
          vec3 col = mix(bot, mid, smoothstep(0.0, 0.45, h));
          col = mix(col, top, smoothstep(0.4, 1.0, h));
          // sun glow
          col += vec3(1.0, 0.85, 0.5) * pow(max(dot(normalize(vP), normalize(vec3(0.35,0.55,0.2))),0.0), 32.0) * 0.55;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.world.add(new THREE.Mesh(skyGeo, skyMat));

    // Distant hills (low poly rings)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 42 + (i % 3) * 3;
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(8 + (i % 3), 4 + (i % 2), 6),
        new THREE.MeshStandardMaterial({ color: i % 2 ? '#2d5a32' : '#355f38', roughness: 0.95, flatShading: true })
      );
      hill.position.set(Math.cos(a) * r, 1.2, Math.sin(a) * r);
      hill.receiveShadow = true;
      hill.castShadow = true;
      this.world.add(hill);
    }

    // Trees
    const treeSpots = [
      [-10, -8], [12, -14], [-16, 2], [8, 10], [-6, 14], [18, -4], [-14, -16], [4, -20],
      [15, 8], [-18, -10], [20, -18], [-8, -22], [10, 16], [-20, 8],
    ];
    for (const [x, z] of treeSpots) this._addTree(x, z);

    // Rocks
    for (const [x, z] of [[3, -6], [-5, -12], [14, -9], [-12, 6], [7, -18]]) {
      this._addRock(x, z);
    }

    // Ruins / landmarks
    this._addRuin(0, -8);
    this._addCampfire(2, 4);
  }

  _addTree(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.32, 1.8, 7),
      new THREE.MeshStandardMaterial({ color: '#5c3a1e', roughness: 0.95 })
    );
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    const leafMat = new THREE.MeshStandardMaterial({ color: '#1f7a34', roughness: 0.85, flatShading: true });
    const l1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 0), leafMat);
    l1.position.y = 2.3;
    l1.castShadow = true;
    const l2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: '#25963f', roughness: 0.85, flatShading: true }));
    l2.position.set(0.35, 2.9, -0.15);
    l2.castShadow = true;
    g.add(trunk, l1, l2);
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI;
    g.scale.setScalar(0.85 + Math.random() * 0.45);
    this.world.add(g);
  }

  _addRock(x, z) {
    const m = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.55 + Math.random() * 0.4, 0),
      new THREE.MeshStandardMaterial({ color: '#7a746c', roughness: 0.97, flatShading: true })
    );
    m.position.set(x, 0.35, z);
    m.rotation.set(Math.random(), Math.random(), Math.random());
    m.castShadow = true;
    m.receiveShadow = true;
    this.world.add(m);
  }

  _addRuin(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: '#8b8680', roughness: 0.9, flatShading: true });
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2 + i * 0.15, 0.7), mat);
      p.position.set(x + Math.cos(i) * 2.2, p.geometry.parameters.height / 2, z + Math.sin(i) * 2.2);
      p.castShadow = true;
      p.receiveShadow = true;
      this.world.add(p);
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 5), mat);
    slab.position.set(x, 0.12, z);
    slab.receiveShadow = true;
    this.world.add(slab);
  }

  _addCampfire(x, z) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.12, 6, 12),
      new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 1 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.7, 6),
      new THREE.MeshStandardMaterial({
        color: '#fb923c',
        emissive: '#ea580c',
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.9,
      })
    );
    flame.position.y = 0.5;
    const light = new THREE.PointLight(0xff8a3d, 1.3, 12, 2);
    light.position.y = 0.7;
    g.add(ring, flame, light);
    g.position.set(x, 0, z);
    g.userData.flame = flame;
    this.campfire = g;
    this.world.add(g);
  }

  _initPlayerVisual() {
    this.playerRoot = new THREE.Group();
    this.playerRoot.position.set(this.player.x, 0, this.player.z);

    // High-quality placeholder hero (until Meshy GLB)
    this.heroMesh = this._buildHeroMesh('#60a5fa');
    this.playerRoot.add(this.heroMesh);

    // shadow disc
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    this.playerRoot.add(shadow);

    this.entities.add(this.playerRoot);
  }

  _buildHeroMesh(color) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 });
    const armor = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.35, metalness: 0.55 });
    const skin = new THREE.MeshStandardMaterial({ color: '#f0c7a0', roughness: 0.7 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 6, 12), bodyMat);
    torso.position.y = 1.05;
    torso.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), skin);
    head.position.y = 1.72;
    head.castShadow = true;

    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), armor);
    helm.position.y = 1.78;
    helm.castShadow = true;

    const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), armor);
    shoulderL.position.set(-0.42, 1.35, 0);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = 0.42;

    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.45, 4, 8), bodyMat);
    legL.position.set(-0.16, 0.45, 0);
    legL.castShadow = true;
    const legR = legL.clone();
    legR.position.x = 0.16;

    const sword = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.9, 0.08),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.85, roughness: 0.25 })
    );
    sword.position.set(0.55, 1.1, 0.1);
    sword.rotation.z = -0.25;
    sword.castShadow = true;

    g.add(torso, head, helm, shoulderL, shoulderR, legL, legR, sword);
    g.userData.parts = { legL, legR, torso };
    return g;
  }

  _bindInput() {
    const el = this.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyE') this.hooks.onInteract?.();
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    el.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        this.hooks.onAttack?.();
      }
      if (e.button === 0 || e.button === 2) {
        this.mouse.down = true;
        this.mouse.lx = e.clientX;
        this.mouse.ly = e.clientY;
        el.setPointerCapture(e.pointerId);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.mouse.down) return;
      const dx = e.clientX - this.mouse.lx;
      const dy = e.clientY - this.mouse.ly;
      this.mouse.lx = e.clientX;
      this.mouse.ly = e.clientY;
      this.cam.yaw -= dx * this.mouse.sens;
      this.cam.pitch += dy * this.mouse.sens;
      this.cam.pitch = Math.max(-0.15, Math.min(1.15, this.cam.pitch));
    });
    el.addEventListener('pointerup', (e) => {
      this.mouse.down = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {}
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.dist += e.deltaY * 0.008;
      this.cam.dist = Math.max(this.cam.minDist, Math.min(this.cam.maxDist, this.cam.dist));
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _resize() {
    const w = Math.max(1, this.mount.clientWidth || window.innerWidth);
    const h = Math.max(1, this.mount.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /* ---------- public API for network ---------- */
  setSelf(self) {
    this.player.x = self.x ?? 0;
    this.player.z = self.z ?? 10;
    this.playerRoot.position.set(this.player.x, 0, this.player.z);
    if (self.modelUrl && self.modelUrl !== this.selfModelUrl) {
      this.selfModelUrl = self.modelUrl;
      this._loadPlayerModel(self.modelUrl);
    }
  }

  _loadPlayerModel(url) {
    this.gltfLoader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const s = 1.75 / Math.max(size.y, 0.01);
        root.scale.setScalar(s);
        box.setFromObject(root);
        root.position.y -= box.min.y;
        root.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        // replace placeholder
        this.playerRoot.remove(this.heroMesh);
        this.heroMesh = root;
        this.playerRoot.add(root);
      },
      undefined,
      (err) => console.warn('player model load fail', err)
    );
  }

  spawnOther(p) {
    if (this.remote.has(p.id)) return;
    const root = new THREE.Group();
    const mesh = this._buildHeroMesh(this._classColor(p.classId));
    root.add(mesh);
    root.position.set(p.x, 0, p.z);
    root.userData = { ...p, target: root.position.clone() };
    this.entities.add(root);
    this.remote.set(p.id, root);
    if (p.modelUrl) this._loadOnto(root, p.modelUrl);
  }

  removeOther(id) {
    const m = this.remote.get(id);
    if (m) this.entities.remove(m);
    this.remote.delete(id);
  }

  moveOther(p) {
    let m = this.remote.get(p.id);
    if (!m) {
      this.spawnOther(p);
      m = this.remote.get(p.id);
    }
    if (!m) return;
    m.userData.target = new THREE.Vector3(p.x, 0, p.z);
    m.userData.ry = p.ry || 0;
  }

  syncMobs(list) {
    for (const m of list) {
      let mesh = this.mobs.get(m.id);
      if (!mesh) {
        mesh = this._buildMob(m);
        this.entities.add(mesh);
        this.mobs.set(m.id, mesh);
      }
      mesh.position.set(m.x, 0, m.z);
      mesh.visible = !!m.alive;
      Object.assign(mesh.userData, m, { kind: 'mob' });
      // face movement
      if (mesh.userData._lx != null) {
        const dx = m.x - mesh.userData._lx;
        const dz = m.z - mesh.userData._lz;
        if (Math.hypot(dx, dz) > 0.001) mesh.rotation.y = Math.atan2(dx, dz);
      }
      mesh.userData._lx = m.x;
      mesh.userData._lz = m.z;
    }
  }

  _buildMob(m) {
    const g = new THREE.Group();
    const isWolf = (m.name || '').toLowerCase().includes('lobo');
    const body = new THREE.Mesh(
      isWolf ? new THREE.CapsuleGeometry(0.35, 0.5, 4, 8) : new THREE.CapsuleGeometry(0.32, 0.55, 4, 8),
      new THREE.MeshStandardMaterial({
        color: isWolf ? '#57534e' : '#3f9c45',
        roughness: 0.65,
        metalness: 0.1,
      })
    );
    body.position.y = isWolf ? 0.55 : 0.75;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 10),
      new THREE.MeshStandardMaterial({ color: isWolf ? '#44403c' : '#166534', roughness: 0.6 })
    );
    head.position.set(0, isWolf ? 0.75 : 1.25, 0.25);
    head.castShadow = true;
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#eab308', emissiveIntensity: 0.8 })
    );
    eye.position.set(-0.1, head.position.y + 0.05, 0.48);
    const eye2 = eye.clone();
    eye2.position.x = 0.1;
    g.add(body, head, eye, eye2);
    g.userData = { ...m, kind: 'mob' };
    return g;
  }

  spawnPickup(p) {
    if (p.taken) return;
    if (this.pickups.has(p.id)) return;
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.38, 0),
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0284c7',
        emissiveIntensity: 0.55,
        metalness: 0.7,
        roughness: 0.18,
      })
    );
    mesh.position.set(p.x, 0.7, p.z);
    mesh.castShadow = true;
    mesh.userData = { ...p, kind: 'pickup' };
    // glow light
    const light = new THREE.PointLight(0x38bdf8, 0.6, 4);
    light.position.y = 0.2;
    mesh.add(light);
    this.entities.add(mesh);
    this.pickups.set(p.id, mesh);
  }

  takePickup(id) {
    const m = this.pickups.get(id);
    if (m) {
      m.visible = false;
      m.userData.taken = true;
    }
  }

  spawnNpc(n) {
    if (this.npcs.has(n.id)) return;
    const g = new THREE.Group();
    const mesh = this._buildHeroMesh(n.type === 'shop' ? '#f59e0b' : '#eab308');
    g.add(mesh);
    // name plate vibe - ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.04, 6, 20),
      new THREE.MeshBasicMaterial({ color: '#fbbf24' })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    g.position.set(n.x, 0, n.z);
    g.userData = { ...n, kind: 'npc' };
    this.entities.add(g);
    this.npcs.set(n.id, g);
  }

  _loadOnto(group, url) {
    this.gltfLoader.load(url, (gltf) => {
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      root.scale.setScalar(1.7 / Math.max(size.y, 0.01));
      box.setFromObject(root);
      root.position.y -= box.min.y;
      root.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      while (group.children.length) group.remove(group.children[0]);
      group.add(root);
    });
  }

  _classColor(c) {
    if (c === 'mage') return '#a78bfa';
    if (c === 'rogue') return '#34d399';
    return '#60a5fa';
  }

  getNearestMobInFront(maxDist = 3.4) {
    let best = null;
    let bestD = maxDist;
    const origin = new THREE.Vector3(this.player.x, 1.2, this.player.z);
    const dir = new THREE.Vector3(Math.sin(this.player.ry), 0, Math.cos(this.player.ry));
    for (const [id, mesh] of this.mobs) {
      if (!mesh.visible || mesh.userData.alive === false) continue;
      const to = mesh.position.clone().sub(origin);
      const dist = to.length();
      if (dist > bestD) continue;
      to.normalize();
      if (dir.dot(to) < 0.25) continue;
      best = id;
      bestD = dist;
    }
    return best;
  }

  getPlayerPos() {
    return { x: this.player.x, y: this.player.y, z: this.player.z, ry: this.player.ry };
  }

  findNearbyNpc(maxDist = 3.5) {
    for (const [id, mesh] of this.npcs) {
      const d = Math.hypot(mesh.position.x - this.player.x, mesh.position.z - this.player.z);
      if (d < maxDist) return id;
    }
    return null;
  }

  findNearbyPickup(maxDist = 2.4) {
    for (const [id, mesh] of this.pickups) {
      if (!mesh.visible) continue;
      const d = mesh.position.distanceTo(new THREE.Vector3(this.player.x, 0.7, this.player.z));
      if (d < maxDist) return id;
    }
    return null;
  }

  /* ---------- update loop ---------- */
  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(0.05, this.clock.getDelta());
    this._updatePlayer(dt);
    this._updateCamera(dt);
    this._updateWorldFx(dt);
    this._updateRemotes(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _updatePlayer(dt) {
    const p = this.player;
    const sprint = this.keys.ShiftLeft || this.keys.ShiftRight ? p.sprint : 1;
    const speed = p.speed * sprint;

    // movement relative to camera yaw
    const forward = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
    const right = new THREE.Vector3(Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw));

    const wish = new THREE.Vector3();
    if (this.keys.KeyW || this.keys.ArrowUp) wish.add(forward);
    if (this.keys.KeyS || this.keys.ArrowDown) wish.sub(forward);
    if (this.keys.KeyA || this.keys.ArrowLeft) wish.sub(right);
    if (this.keys.KeyD || this.keys.ArrowRight) wish.add(right);

    const moving = wish.lengthSq() > 0;
    if (moving) {
      wish.normalize().multiplyScalar(speed);
      // face move direction
      p.ry = Math.atan2(wish.x, wish.z);
    }

    p.vx = THREE.MathUtils.damp(p.vx, wish.x, 14, dt);
    p.vz = THREE.MathUtils.damp(p.vz, wish.z, 14, dt);
    p.vy -= 28 * dt;
    if ((this.keys.Space) && p.onGround) {
      p.vy = 9.5;
      p.onGround = false;
    }

    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
    }

    const lim = 42;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));

    this.playerRoot.position.set(p.x, p.y, p.z);
    // smooth rotate body
    const cur = this.playerRoot.rotation.y;
    let diff = p.ry - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.playerRoot.rotation.y = cur + diff * Math.min(1, dt * 12);

    // walk anim simple
    const parts = this.heroMesh?.userData?.parts;
    if (parts) {
      const t = performance.now() * 0.012;
      const a = moving ? Math.sin(t) * 0.55 : 0;
      parts.legL.rotation.x = a;
      parts.legR.rotation.x = -a;
      parts.torso.position.y = 1.05 + (moving ? Math.abs(Math.sin(t)) * 0.03 : 0);
    }

    // network callback
    this.hooks.onMove?.(this.getPlayerPos());
  }

  _updateCamera(dt) {
    const p = this.player;
    const target = new THREE.Vector3(p.x, p.y + this.cam.height, p.z);
    const ox = Math.sin(this.cam.yaw) * this.cam.dist * Math.cos(this.cam.pitch);
    const oy = Math.sin(this.cam.pitch) * this.cam.dist + 1.2;
    const oz = Math.cos(this.cam.yaw) * this.cam.dist * Math.cos(this.cam.pitch);
    const desired = new THREE.Vector3(p.x + ox, p.y + oy, p.z + oz);

    // soft collision with ground
    if (desired.y < 0.8) desired.y = 0.8;

    this.camera.position.lerp(desired, 1 - Math.exp(-this.cam.smooth * dt));
    this.camera.lookAt(target);
  }

  _updateWorldFx(dt) {
    if (this.campfire?.userData?.flame) {
      const f = this.campfire.userData.flame;
      f.scale.y = 1 + Math.sin(performance.now() * 0.012) * 0.15;
      f.rotation.y += dt * 2;
    }
    for (const [, mesh] of this.pickups) {
      if (!mesh.visible) continue;
      mesh.rotation.y += dt * 2.2;
      mesh.position.y = 0.7 + Math.sin(performance.now() * 0.005 + mesh.position.x) * 0.12;
    }
  }

  _updateRemotes(dt) {
    for (const [, mesh] of this.remote) {
      if (mesh.userData.target) {
        mesh.position.lerp(mesh.userData.target, 1 - Math.exp(-10 * dt));
        if (mesh.userData.ry != null) {
          mesh.rotation.y = THREE.MathUtils.damp(mesh.rotation.y, mesh.userData.ry, 10, dt);
        }
      }
    }
  }
}
