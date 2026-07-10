import { Game3D } from './game3d.js';

const $ = (id) => document.getElementById(id);
const api = (path, opts = {}) =>
  fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(opts.headers || {}),
    },
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  });

const state = {
  token: localStorage.getItem('mmo_token') || '',
  user: null,
  characters: [],
  characterId: null,
  socket: null,
  self: null,
  targetId: null,
  game: null,
  lastNet: 0,
};

$('server-url').textContent = location.origin;

/* ---------------- UI screens ---------------- */
function show(id) {
  ['screen-auth', 'screen-chars', 'screen-game'].forEach((s) => {
    $(s).classList.toggle('hidden', s !== id);
  });
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const login = tab.dataset.tab === 'login';
    $('form-login').classList.toggle('hidden', !login);
    $('form-register').classList.toggle('hidden', login);
    $('auth-error').textContent = '';
  };
});

$('form-login').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('login-user').value.trim(),
        password: $('login-pass').value,
      }),
    });
    state.token = data.token;
    localStorage.setItem('mmo_token', data.token);
    await loadMe();
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
};

async function loginAsDev(autoEnter = true) {
  try {
    if ($('auth-error')) $('auth-error').textContent = '';
    toast('Entrando como DEV…');
    const data = await api('/api/dev-login', { method: 'POST', body: '{}' });
    state.token = data.token;
    localStorage.setItem('mmo_token', data.token);
    if ($('login-user')) $('login-user').value = data.credentials?.username || 'dev';
    if ($('login-pass')) $('login-pass').value = data.credentials?.password || 'dev123';
    await loadMe();
    toast(`DEV: ${data.user.username}`);

    // sempre tenta entrar no mundo com DevHero (botão DEV = jogar)
    if (autoEnter) {
      const hero =
        state.characters.find((c) => c.name === 'DevHero') ||
        (data.characters || []).find((c) => c.name === 'DevHero') ||
        state.characters[0] ||
        (data.characters || [])[0];
      if (!hero) {
        toast('Nenhum herói dev encontrado');
        if ($('auth-error')) $('auth-error').textContent = 'Conta dev sem personagem';
        return;
      }
      // espera socket conectar
      await waitForSocket(4000);
      await enterWorld(hero.id);
    }
  } catch (err) {
    console.error(err);
    if ($('auth-error')) $('auth-error').textContent = err.message || String(err);
    toast('Falha no login DEV: ' + (err.message || err));
  }
}

const btnDev = $('btn-dev-login');
if (btnDev) {
  btnDev.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    loginAsDev(true);
  });
}

function waitForSocket(ms = 3000) {
  return new Promise((resolve) => {
    if (state.socket?.connected) return resolve(true);
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (state.socket?.connected || Date.now() - t0 > ms) {
        clearInterval(iv);
        resolve(!!state.socket?.connected);
      }
    }, 50);
  });
}

$('form-register').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({
        username: $('reg-user').value.trim(),
        password: $('reg-pass').value,
      }),
    });
    state.token = data.token;
    localStorage.setItem('mmo_token', data.token);
    await loadMe();
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
};

$('btn-logout').onclick = () => {
  state.token = '';
  localStorage.removeItem('mmo_token');
  if (state.socket) state.socket.disconnect();
  show('screen-auth');
};

$('btn-save-key').onclick = async () => {
  try {
    await api('/api/meshy-key', {
      method: 'POST',
      body: JSON.stringify({ key: $('meshy-key').value.trim() }),
    });
    toast('API key Meshy salva na conta');
  } catch (e) {
    $('char-error').textContent = e.message;
  }
};

async function loadMe() {
  const me = await api('/api/me');
  state.user = me;
  state.characters = me.characters || [];
  $('who').textContent = me.username;
  renderChars();
  connectSocket();
  show('screen-chars');
}

function renderChars() {
  const box = $('char-list');
  box.innerHTML = '';
  if (!state.characters.length) {
    box.innerHTML = `<p class="sub">Nenhum herói ainda. Crie o primeiro abaixo.</p>`;
    return;
  }
  for (const c of state.characters) {
    const el = document.createElement('div');
    el.className = 'char-card';
    const st = c.modelStatus || 'placeholder';
    el.innerHTML = `
      ${c.thumbnailUrl ? `<img src="${c.thumbnailUrl}" alt="">` : `<div style="height:100px;border-radius:10px;background:linear-gradient(135deg,#1e293b,#312e81);display:grid;place-items:center;font-size:2rem">🧙</div>`}
      <h4>${escapeHtml(c.name)}</h4>
      <div class="meta">${c.classId} · Nv ${c.level} · 🪙 ${c.gold}</div>
      <span class="badge-status ${st}">${st}</span>
      <button class="btn primary" data-enter="${c.id}" ${st === 'generating' ? 'disabled' : ''}>
        ${st === 'generating' ? 'Gerando 3D…' : 'Entrar no mundo (3ª pessoa)'}
      </button>
    `;
    el.querySelector('[data-enter]')?.addEventListener('click', () => enterWorld(c.id));
    box.appendChild(el);
  }
}

$('form-create').onsubmit = async (e) => {
  e.preventDefault();
  $('char-error').textContent = '';
  const useMeshy = $('char-meshy').checked;
  const prompt = $('char-prompt').value.trim();
  if (useMeshy && !prompt) {
    $('char-error').textContent = 'Escreva um prompt Meshy ou desmarque a geração 3D';
    return;
  }
  try {
    if ($('meshy-key').value.trim()) {
      await api('/api/meshy-key', {
        method: 'POST',
        body: JSON.stringify({ key: $('meshy-key').value.trim() }),
      });
    }
    const res = await api('/api/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: $('char-name').value.trim(),
        classId: $('char-class').value,
        meshyPrompt: prompt,
        useMeshy,
      }),
    });
    state.characters.unshift(res.character);
    renderChars();
    if (res.generating) {
      $('meshy-progress').classList.remove('hidden');
      setMeshyBar(5, 'Meshy AI: iniciando…');
    } else {
      toast('Herói criado');
    }
    $('char-name').value = '';
  } catch (err) {
    $('char-error').textContent = err.message;
  }
};

function setMeshyBar(pct, text) {
  $('meshy-bar').style.width = `${pct}%`;
  $('meshy-status').textContent = text;
}

/* ---------------- Socket ---------------- */
function connectSocket() {
  if (state.socket) state.socket.disconnect();
  const s = (state.socket = window.io(location.origin, { transports: ['websocket', 'polling'] }));
  s.on('connect', () => s.emit('auth', { token: state.token }));
  s.on('error_msg', (m) => toast(m));
  s.on('character:update', (c) => {
    const i = state.characters.findIndex((x) => x.id === c.id);
    if (i >= 0) state.characters[i] = c;
    else state.characters.unshift(c);
    renderChars();
    if (c.modelStatus === 'ready') {
      toast(`${c.name} 3D pronto!`);
      $('meshy-progress').classList.add('hidden');
    }
  });
  s.on('meshy:progress', (p) => {
    if (!p) return;
    $('meshy-progress').classList.remove('hidden');
    setMeshyBar(p.progress || 0, p.message || p.stage || '…');
  });
  s.on('world:state', onWorldState);
  s.on('player:join', (p) => state.game?.spawnOther(p));
  s.on('player:leave', ({ id }) => state.game?.removeOther(id));
  s.on('player:move', (p) => state.game?.moveOther(p));
  s.on('world:mobs', (mobs) => state.game?.syncMobs(mobs));
  s.on('combat:hit', onHit);
  s.on('mob:death', ({ id }) => {
    const m = state.game?.mobs.get(id);
    if (m) {
      m.userData.alive = false;
      m.visible = false;
    }
    toast('Inimigo derrotado!');
  });
  s.on('pickup:taken', ({ id }) => state.game?.takePickup(id));
  s.on('loot', (l) => {
    if (l.gold) toast(`+${l.gold} ouro`);
    if (l.xp) toast(`+${l.xp} XP`);
    if (l.item) toast(`Item: ${l.item}`);
    if (state.self) {
      if (l.level) state.self.level = l.level;
      if (l.xpTotal != null) state.self.xp = l.xpTotal;
      if (l.gold) state.self.gold = (state.self.gold || 0) + l.gold;
      updateHud();
    }
  });
  s.on('chat', (m) => addChat(`${m.from}: ${m.text}`));
  s.on('npc:dialog', (d) => {
    addChat(`[${d.name}] ${d.text}`);
    toast(d.text);
  });
}

async function enterWorld(characterId) {
  try {
    if (!characterId) throw new Error('Personagem inválido');
    state.characterId = characterId;
    show('screen-game');

    // garante socket
    if (!state.socket) connectSocket();
    await waitForSocket(5000);
    if (!state.socket?.connected) {
      throw new Error('Sem conexão com o servidor (socket). Suba o start.bat');
    }

    const g = ensureGame();
    if (!g) throw new Error('Falha ao criar o mundo 3D');

    state.socket.emit('world:enter', { characterId });
    // em 3ª pessoa não precisa pointer lock — libera o mundo na hora
    if ($('blocker')) $('blocker').classList.add('hidden');
    toast('Mundo 3ª pessoa — arraste o mouse para girar a câmera');
  } catch (err) {
    console.error('enterWorld', err);
    toast('Erro ao entrar: ' + (err.message || err));
    if ($('auth-error')) $('auth-error').textContent = err.message || String(err);
    // volta pro menu de chars se falhar
    show('screen-chars');
  }
}

function ensureGame() {
  if (state.game) return state.game;
  const vp = $('viewport');
  if (!vp) throw new Error('#viewport não encontrado');
  try {
    state.game = new Game3D(vp, {
      onMove: (pos) => {
        const now = performance.now();
        if (now - state.lastNet < 50) return;
        state.lastNet = now;
        state.socket?.emit('player:move', pos);
        if (state.self) {
          state.self.x = pos.x;
          state.self.z = pos.z;
        }
      },
      onAttack: () => {
        if (!state.game) return;
        const id = state.game.getNearestMobInFront(3.5);
        if (!id) return;
        state.targetId = id;
        state.socket?.emit('combat:attack', { targetId: id });
        const m = state.game.mobs.get(id);
        if (m) {
          $('target-panel')?.classList.remove('hidden');
          if ($('target-name')) $('target-name').textContent = m.userData.name || 'Inimigo';
          const pct = (100 * (m.userData.hp || 0)) / (m.userData.maxHp || 1);
          if ($('target-hp')) $('target-hp').style.width = `${Math.max(0, pct)}%`;
        }
      },
      onInteract: () => {
        if (!state.game) return;
        const npc = state.game.findNearbyNpc();
        if (npc) {
          state.socket?.emit('npc:talk', { id: npc });
          return;
        }
        const pick = state.game.findNearbyPickup();
        if (pick) state.socket?.emit('pickup', { id: pick });
      },
    });
    window.__game = state.game;
    return state.game;
  } catch (err) {
    console.error('Game3D init failed', err);
    toast('Erro 3D: ' + err.message);
    throw err;
  }
}

function onWorldState(data) {
  state.self = data.self;
  $('hud-zone').textContent = data.zone.name;
  $('hud-name').textContent = data.self.name;
  updateHud();
  $('blocker-title').textContent = data.zone.name;
  $('blocker-text').textContent = `${data.self.name} · 3ª pessoa · arraste o mouse para girar a câmera`;

  const g = ensureGame();
  g.setSelf(data.self);

  // clear handled by Game3D maps - re-spawn all
  for (const id of [...g.remote.keys()]) g.removeOther(id);
  for (const p of data.players) g.spawnOther(p);
  g.syncMobs(data.mobs || []);
  for (const p of data.pickups || []) g.spawnPickup(p);
  for (const n of data.zone.npcs || []) g.spawnNpc(n);
}

function onHit(h) {
  const m = state.game?.mobs.get(h.targetId);
  if (m) {
    m.userData.hp = h.hp;
    m.userData.maxHp = h.maxHp;
    if (state.targetId === h.targetId) {
      $('target-hp').style.width = `${(100 * h.hp) / h.maxHp}%`;
    }
  }
  toast(`-${h.dmg}`);
}

function updateHud() {
  const s = state.self;
  if (!s) return;
  $('hud-level').textContent = s.level;
  $('hud-gold').textContent = s.gold ?? 0;
  const hp = s.hp ?? 100;
  const maxHp = s.maxHp ?? 100;
  const mp = s.mp ?? 50;
  const maxMp = s.maxMp ?? 50;
  $('bar-hp').style.width = `${(100 * hp) / maxHp}%`;
  $('bar-mp').style.width = `${(100 * mp) / maxMp}%`;
  $('txt-hp').textContent = `${Math.floor(hp)}/${maxHp}`;
  $('txt-mp').textContent = `${Math.floor(mp)}/${maxMp}`;
  const need = (s.level || 1) * 50;
  $('bar-xp').style.width = `${Math.min(100, (100 * (s.xp || 0)) / need)}%`;
  $('txt-xp').textContent = `${s.xp || 0}/${need} XP`;
}

$('btn-pointer').onclick = () => {
  $('blocker').classList.add('hidden');
  toast('3ª pessoa ativa — arraste para olhar');
};
$('btn-leave').onclick = () => {
  show('screen-chars');
};

$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (!text) return;
  state.socket?.emit('chat', text);
  $('chat-input').value = '';
};

function addChat(text) {
  const log = $('chat-log');
  const div = document.createElement('div');
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  el.style.cssText =
    'background:rgba(18,26,43,.96);border:1px solid rgba(148,163,184,.25);border-left:3px solid #22d3a6;padding:10px 12px;border-radius:10px;color:#e8eefc;font:600 13px/1.3 Segoe UI,system-ui;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:320px';
  const host = $('global-toasts') || $('toast-stack') || document.body;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* boot */
const sc = document.createElement('script');
sc.src = '/socket.io/socket.io.js';
sc.onload = async () => {
  const params = new URLSearchParams(location.search);
  const wantDev =
    params.get('dev') === '1' ||
    params.get('autodev') === '1' ||
    localStorage.getItem('mmo_autodev') === '1';

  // ?dev=1 ou ?enter=1 → login + entra no mundo
  if (wantDev || params.get('enter') === '1') {
    localStorage.setItem('mmo_autodev', '1');
    show('screen-auth');
    await loginAsDev(true);
    return;
  }

  if (state.token) {
    try {
      await loadMe();
    } catch {
      localStorage.removeItem('mmo_token');
      state.token = '';
      show('screen-auth');
    }
  } else {
    show('screen-auth');
  }
};
document.head.appendChild(sc);
