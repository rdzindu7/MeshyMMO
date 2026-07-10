import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import fs from 'fs';
import crypto from 'crypto';
import {
  createUser,
  getUserByName,
  getUserById,
  listCharacters,
  createCharacter,
  getCharacter,
  updateCharacter,
  setUserMeshyKey,
  modelsDir,
  ensureDevAccount,
  DEV_ACCOUNT,
} from './db.js';
import { generateCharacterModel, downloadGlb, resolveApiKey, TEST_KEY } from './meshy.js';
import { createLiveWorld, publicPlayer, tickWorld, ZONE } from './world.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);

// load .env manually (no dotenv dep)
try {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/models', express.static(modelsDir()));

const sessions = new Map(); // token -> userId
const world = createLiveWorld();

function token() {
  return crypto.randomBytes(24).toString('hex');
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  const userId = sessions.get(t);
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  req.userId = userId;
  req.token = t;
  next();
}

/* ---------- REST API ---------- */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'MeshyMMO',
    zone: ZONE.name,
    devAccount: {
      username: DEV_ACCOUNT.username,
      password: DEV_ACCOUNT.password,
      character: DEV_ACCOUNT.characterName,
    },
    meshy: {
      configured: !!(process.env.MESHY_API_KEY || true),
      testKey: TEST_KEY,
      endpoints: [
        'POST /openapi/v2/text-to-3d (preview)',
        'POST /openapi/v2/text-to-3d (refine)',
        'GET  /openapi/v2/text-to-3d/:id',
      ],
    },
  });
});

/** Login automático da conta dev (só para desenvolvimento local). */
app.post('/api/dev-login', async (req, res) => {
  try {
    await ensureDevAccount(bcrypt.hash.bind(bcrypt));
    const user = getUserByName(DEV_ACCOUNT.username);
    if (!user) return res.status(500).json({ error: 'Falha ao criar conta dev' });
    const t = token();
    sessions.set(t, user.id);
    res.json({
      token: t,
      user: { id: user.id, username: user.username, isDev: true },
      credentials: DEV_ACCOUNT,
      characters: listCharacters(user.id),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password || username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'Usuário (min 3) e senha (min 4) obrigatórios' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = createUser(username.trim(), hash);
    const t = token();
    sessions.set(t, user.id);
    res.json({ token: t, user: { id: user.id, username: user.username } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = getUserByName(username || '');
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return res.status(401).json({ error: 'Login inválido' });
    }
    const t = token();
    sessions.set(t, user.id);
    res.json({ token: t, user: { id: user.id, username: user.username, hasMeshyKey: !!user.meshyKey } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/me', auth, (req, res) => {
  const user = getUserById(req.userId);
  res.json({
    id: user.id,
    username: user.username,
    hasMeshyKey: !!user.meshyKey,
    characters: listCharacters(user.id),
  });
});

app.post('/api/meshy-key', auth, (req, res) => {
  const key = (req.body?.key || '').trim();
  setUserMeshyKey(req.userId, key || null);
  res.json({ ok: true, hasMeshyKey: !!key });
});

app.get('/api/characters', auth, (req, res) => {
  res.json(listCharacters(req.userId));
});

app.post('/api/characters', auth, async (req, res) => {
  try {
    const { name, classId, meshyPrompt, useMeshy } = req.body || {};
    if (!name || name.length < 2) return res.status(400).json({ error: 'Nome inválido' });
    const existing = listCharacters(req.userId);
    if (existing.length >= 5) return res.status(400).json({ error: 'Máximo 5 personagens' });

    let char = createCharacter(req.userId, {
      name: name.trim().slice(0, 20),
      classId: ['warrior', 'mage', 'rogue'].includes(classId) ? classId : 'warrior',
      meshyPrompt: (meshyPrompt || '').slice(0, 500),
      modelStatus: useMeshy ? 'generating' : 'placeholder',
    });

    res.json({ character: char, generating: !!useMeshy });

    // async Meshy generation
    if (useMeshy && meshyPrompt) {
      generateInBackground(char.id, req.userId, meshyPrompt).catch((e) => {
        console.error('[Meshy]', e.message);
        updateCharacter(char.id, { modelStatus: 'failed', modelError: e.message });
        io.to(`user:${req.userId}`).emit('character:update', getCharacter(char.id));
      });
    }
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/characters/:id', auth, (req, res) => {
  const c = getCharacter(req.params.id);
  if (!c || c.userId !== req.userId) return res.status(404).json({ error: 'Não encontrado' });
  res.json(c);
});

async function generateInBackground(charId, userId, prompt) {
  const user = getUserById(userId);
  const key = resolveApiKey(user?.meshyKey);
  io.to(`user:${userId}`).emit('meshy:progress', {
    characterId: charId,
    stage: 'start',
    progress: 0,
    message: 'Enviando para Meshy AI…',
  });

  const result = await generateCharacterModel(prompt, key, {
    onProgress: (p) => {
      io.to(`user:${userId}`).emit('meshy:progress', {
        characterId: charId,
        ...p,
      });
    },
  });

  // download GLB locally
  const localName = `${charId}.glb`;
  const dest = path.join(modelsDir(), localName);
  try {
    await downloadGlb(result.glbUrl, dest);
  } catch (e) {
    console.warn('download glb failed, using remote url', e.message);
  }

  const localUrl = fs.existsSync(dest) ? `/models/${localName}` : null;
  const updated = updateCharacter(charId, {
    modelStatus: 'ready',
    modelUrl: localUrl || result.glbUrl,
    modelRemote: result.glbUrl,
    thumbnailUrl: result.thumbnailUrl,
    meshyTaskId: result.refineTaskId || result.previewTaskId,
    modelError: null,
  });
  io.to(`user:${userId}`).emit('character:update', updated);
  io.to(`user:${userId}`).emit('meshy:progress', {
    characterId: charId,
    stage: 'done',
    progress: 100,
    message: 'Personagem 3D pronto!',
  });
}

/* ---------- SOCKET.IO MMO ---------- */
io.on('connection', (socket) => {
  let player = null;

  socket.on('auth', ({ token: t }) => {
    const userId = sessions.get(t);
    if (!userId) return socket.emit('error_msg', 'Token inválido');
    socket.userId = userId;
    socket.join(`user:${userId}`);
    socket.emit('auth:ok', { userId, characters: listCharacters(userId) });
  });

  socket.on('world:enter', ({ characterId }) => {
    if (!socket.userId) return socket.emit('error_msg', 'Faça login');
    const char = getCharacter(characterId);
    if (!char || char.userId !== socket.userId) return socket.emit('error_msg', 'Personagem inválido');

    player = {
      socketId: socket.id,
      id: char.id,
      userId: char.userId,
      name: char.name,
      classId: char.classId,
      level: char.level,
      x: char.pos?.x ?? ZONE.spawn.x,
      y: 0,
      z: char.pos?.z ?? ZONE.spawn.z,
      ry: 0,
      hp: char.hp,
      maxHp: char.maxHp,
      mp: char.mp,
      maxMp: char.maxMp,
      gold: char.gold,
      xp: char.xp,
      inventory: char.inventory,
      modelUrl: char.modelUrl,
      modelStatus: char.modelStatus,
      attackCd: 0,
    };
    world.players.set(socket.id, player);
    socket.join('zone:' + ZONE.id);

    socket.emit('world:state', {
      zone: {
        id: ZONE.id,
        name: ZONE.name,
        size: ZONE.size,
        npcs: ZONE.npcs,
      },
      self: {
        ...publicPlayer(player),
        gold: player.gold,
        xp: player.xp,
        mp: player.mp,
        maxMp: player.maxMp,
        inventory: player.inventory,
      },
      players: [...world.players.values()].filter((p) => p.socketId !== socket.id).map(publicPlayer),
      mobs: world.mobs.map((m) => ({ ...m })),
      pickups: world.pickups.map((p) => ({ ...p })),
    });

    socket.to('zone:' + ZONE.id).emit('player:join', publicPlayer(player));
  });

  socket.on('player:move', (data) => {
    if (!player) return;
    const x = Number(data.x) || 0;
    const z = Number(data.z) || 0;
    const ry = Number(data.ry) || 0;
    const lim = ZONE.size / 2;
    player.x = Math.max(-lim, Math.min(lim, x));
    player.z = Math.max(-lim, Math.min(lim, z));
    player.ry = ry;
    socket.to('zone:' + ZONE.id).emit('player:move', {
      id: player.id,
      x: player.x,
      y: player.y,
      z: player.z,
      ry: player.ry,
    });
  });

  socket.on('chat', (msg) => {
    if (!player) return;
    const text = String(msg || '').slice(0, 160).trim();
    if (!text) return;
    io.to('zone:' + ZONE.id).emit('chat', {
      from: player.name,
      text,
      t: Date.now(),
    });
  });

  socket.on('combat:attack', ({ targetId }) => {
    if (!player) return;
    const now = Date.now();
    if (player.attackCd > now) return;
    player.attackCd = now + 600;

    const mob = world.mobs.find((m) => m.id === targetId && m.alive);
    if (!mob) return;
    const dx = mob.x - player.x;
    const dz = mob.z - player.z;
    if (Math.hypot(dx, dz) > 3.2) return;

    const dmg = 8 + Math.floor(Math.random() * 8) + (player.classId === 'warrior' ? 4 : 0);
    mob.hp -= dmg;
    io.to('zone:' + ZONE.id).emit('combat:hit', {
      attackerId: player.id,
      targetId: mob.id,
      dmg,
      hp: Math.max(0, mob.hp),
      maxHp: mob.maxHp,
    });

    if (mob.hp <= 0) {
      mob.alive = false;
      mob.respawnAt = Date.now() + 12000;
      const xpGain = 15 * (mob.level || 1);
      const goldGain = 3 + Math.floor(Math.random() * 6);
      player.xp += xpGain;
      player.gold += goldGain;
      // level up
      while (player.xp >= player.level * 50) {
        player.xp -= player.level * 50;
        player.level += 1;
        player.maxHp += 10;
        player.hp = player.maxHp;
      }
      updateCharacter(player.id, {
        xp: player.xp,
        gold: player.gold,
        level: player.level,
        hp: player.hp,
        maxHp: player.maxHp,
      });
      io.to('zone:' + ZONE.id).emit('mob:death', { id: mob.id });
      socket.emit('loot', { xp: xpGain, gold: goldGain, level: player.level, xpTotal: player.xp });
    }
  });

  socket.on('pickup', ({ id }) => {
    if (!player) return;
    const p = world.pickups.find((x) => x.id === id && !x.taken);
    if (!p) return;
    if (Math.hypot(p.x - player.x, p.z - player.z) > 2.5) return;
    p.taken = true;
    player.gold += 5;
    player.inventory.push({ id: 'crystal', name: p.name, qty: 1 });
    updateCharacter(player.id, { gold: player.gold, inventory: player.inventory });
    io.to('zone:' + ZONE.id).emit('pickup:taken', { id });
    socket.emit('loot', { gold: 5, item: p.name });
  });

  socket.on('npc:talk', ({ id }) => {
    if (!player) return;
    const npc = ZONE.npcs.find((n) => n.id === id);
    if (!npc) return;
    if (Math.hypot(npc.x - player.x, npc.z - player.z) > 4) return;
    socket.emit('npc:dialog', { id: npc.id, name: npc.name, text: npc.dialog });
  });

  socket.on('disconnect', () => {
    if (player) {
      updateCharacter(player.id, {
        pos: { x: player.x, y: 0, z: player.z },
        hp: player.hp,
        gold: player.gold,
        xp: player.xp,
        level: player.level,
      });
      world.players.delete(socket.id);
      socket.to('zone:' + ZONE.id).emit('player:leave', { id: player.id });
      player = null;
    }
  });
});

// world tick + broadcast mobs
setInterval(() => {
  tickWorld(world, 0.1);
  io.to('zone:' + ZONE.id).emit('world:mobs', world.mobs.map((m) => ({
    id: m.id,
    name: m.name,
    x: m.x,
    z: m.z,
    hp: m.hp,
    maxHp: m.maxHp,
    alive: m.alive,
    level: m.level,
  })));
}, 100);

server.listen(PORT, '0.0.0.0', async () => {
  try {
    await ensureDevAccount(bcrypt.hash.bind(bcrypt));
  } catch (e) {
    console.error('[DB] ensureDevAccount failed', e);
  }
  console.log('================================================');
  console.log('  MeshyMMO — Web MMO RPG + Meshy AI');
  console.log('================================================');
  console.log(`  http://127.0.0.1:${PORT}`);
  console.log(`  DEV login: ${DEV_ACCOUNT.username} / ${DEV_ACCOUNT.password}`);
  console.log(`  DEV hero : ${DEV_ACCOUNT.characterName}`);
  console.log(`  Meshy key env: ${process.env.MESHY_API_KEY ? 'set' : 'using test key fallback'}`);
  console.log(`  Test key: ${TEST_KEY}`);
  console.log('================================================');
});
