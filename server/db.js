import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');
const USERS = path.join(DATA, 'users.json');
const CHARS = path.join(DATA, 'characters.json');
const MODELS = path.join(DATA, 'models');

function ensure() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(MODELS, { recursive: true });
  if (!fs.existsSync(USERS)) fs.writeFileSync(USERS, '{}');
  if (!fs.existsSync(CHARS)) fs.writeFileSync(CHARS, '{}');
}

function read(file) {
  ensure();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function write(file, data) {
  ensure();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function getUserByName(username) {
  const users = read(USERS);
  return Object.values(users).find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
}

export function getUserById(id) {
  return read(USERS)[id] || null;
}

export function createUser(username, passwordHash, extra = {}) {
  const users = read(USERS);
  if (Object.values(users).some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('Usuário já existe');
  }
  const id = randomUUID();
  users[id] = {
    id,
    username,
    passwordHash,
    createdAt: Date.now(),
    meshyKey: null,
    isDev: !!extra.isDev,
    ...extra,
  };
  write(USERS, users);
  return users[id];
}

/** Conta de desenvolvimento fixa (criada no boot se não existir). */
export const DEV_ACCOUNT = {
  username: 'dev',
  password: 'dev123',
  characterName: 'DevHero',
};

/**
 * Garante usuário + personagem de dev.
 * @param {(password: string) => Promise<string>} hashFn bcrypt.hash
 */
export async function ensureDevAccount(hashFn) {
  ensure();
  let user = getUserByName(DEV_ACCOUNT.username);
  if (!user) {
    const passwordHash = await hashFn(DEV_ACCOUNT.password, 10);
    user = createUser(DEV_ACCOUNT.username, passwordHash, {
      isDev: true,
      meshyKey: process.env.MESHY_API_KEY || null,
    });
    console.log(`[DB] Conta DEV criada: ${DEV_ACCOUNT.username} / ${DEV_ACCOUNT.password}`);
  } else {
    // reforça flag isDev
    const users = read(USERS);
    if (users[user.id] && !users[user.id].isDev) {
      users[user.id].isDev = true;
      write(USERS, users);
      user = users[user.id];
    }
  }

  const chars = listCharacters(user.id);
  let hero = chars.find((c) => c.name === DEV_ACCOUNT.characterName);
  if (!hero) {
    hero = createCharacter(user.id, {
      name: DEV_ACCOUNT.characterName,
      classId: 'warrior',
      meshyPrompt: 'epic fantasy warrior hero, full body, A-pose, game character',
      modelStatus: 'placeholder',
    });
    // buffs de dev
    updateCharacter(hero.id, {
      level: 10,
      gold: 9999,
      xp: 0,
      hp: 500,
      maxHp: 500,
      mp: 200,
      maxMp: 200,
      stats: { str: 30, agi: 20, int: 15, vit: 25 },
      inventory: [
        { id: 'potion_hp', name: 'Poção de Vida', qty: 99 },
        { id: 'sword_dev', name: 'Lâmina do Dev', qty: 1 },
        { id: 'debug_gem', name: 'Gema Debug', qty: 10 },
      ],
    });
    hero = getCharacter(hero.id);
    console.log(`[DB] Personagem DEV criado: ${DEV_ACCOUNT.characterName}`);
  }
  return { user, character: hero, credentials: DEV_ACCOUNT };
}

export function setUserMeshyKey(userId, key) {
  const users = read(USERS);
  if (!users[userId]) throw new Error('User not found');
  users[userId].meshyKey = key || null;
  write(USERS, users);
  return users[userId];
}

export function listCharacters(userId) {
  const all = read(CHARS);
  return Object.values(all).filter((c) => c.userId === userId);
}

export function getCharacter(id) {
  return read(CHARS)[id] || null;
}

export function createCharacter(userId, data) {
  const all = read(CHARS);
  const id = randomUUID();
  const char = {
    id,
    userId,
    name: data.name,
    classId: data.classId || 'warrior',
    level: 1,
    xp: 0,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    gold: 25,
    stats: { str: 10, agi: 10, int: 10, vit: 10 },
    inventory: [
      { id: 'potion_hp', name: 'Poção de Vida', qty: 3 },
      { id: 'sword_wood', name: 'Espada de Madeira', qty: 1 },
    ],
    meshyPrompt: data.meshyPrompt || '',
    modelUrl: data.modelUrl || null,
    modelLocal: data.modelLocal || null,
    modelStatus: data.modelStatus || 'pending', // pending | generating | ready | failed | placeholder
    meshyTaskId: data.meshyTaskId || null,
    thumbnailUrl: data.thumbnailUrl || null,
    pos: { x: 0, y: 0, z: 8 },
    createdAt: Date.now(),
  };
  // class bonuses
  if (char.classId === 'mage') {
    char.stats.int = 14;
    char.stats.str = 7;
    char.mp = 80;
    char.maxMp = 80;
  } else if (char.classId === 'rogue') {
    char.stats.agi = 14;
    char.stats.str = 9;
  } else {
    char.stats.str = 14;
    char.stats.vit = 12;
    char.hp = 120;
    char.maxHp = 120;
  }
  all[id] = char;
  write(CHARS, all);
  return char;
}

export function updateCharacter(id, patch) {
  const all = read(CHARS);
  if (!all[id]) return null;
  Object.assign(all[id], patch, { updatedAt: Date.now() });
  write(CHARS, all);
  return all[id];
}

export function modelsDir() {
  ensure();
  return MODELS;
}

export { DATA, MODELS };
