/** Shared world state for multiplayer zone */

export const ZONE = {
  id: 'vale_inicial',
  name: 'Vale de Astralon',
  size: 80,
  spawn: { x: 0, y: 0, z: 10 },
  npcs: [
    {
      id: 'npc_mestre',
      name: 'Mestre Kael',
      type: 'quest',
      x: 4,
      y: 0,
      z: -4,
      dialog: 'Bem-vindo a Astralon, aventureiro. Derrote goblins e reúna cristais!',
    },
    {
      id: 'npc_ferreiro',
      name: 'Ferreira Lyra',
      type: 'shop',
      x: -6,
      y: 0,
      z: -2,
      dialog: 'Posso melhorar suas armas… um dia. Por ora, mate goblins.',
    },
  ],
  mobs: [
    { id: 'mob_1', name: 'Goblin', x: 8, y: 0, z: -12, hp: 40, maxHp: 40, level: 1, aggro: 8 },
    { id: 'mob_2', name: 'Goblin', x: -10, y: 0, z: -14, hp: 40, maxHp: 40, level: 1, aggro: 8 },
    { id: 'mob_3', name: 'Goblin Guerreiro', x: 2, y: 0, z: -20, hp: 70, maxHp: 70, level: 2, aggro: 10 },
    { id: 'mob_4', name: 'Lobo Sombrio', x: 14, y: 0, z: -8, hp: 55, maxHp: 55, level: 2, aggro: 9 },
    { id: 'mob_5', name: 'Goblin', x: -14, y: 0, z: -6, hp: 40, maxHp: 40, level: 1, aggro: 8 },
  ],
  pickups: [
    { id: 'crystal_1', name: 'Cristal Azul', x: 6, y: 0.5, z: 2, taken: false },
    { id: 'crystal_2', name: 'Cristal Verde', x: -5, y: 0.5, z: -8, taken: false },
    { id: 'crystal_3', name: 'Cristal Roxo', x: 12, y: 0.5, z: -16, taken: false },
  ],
};

/** Live mob state (mutated in memory) */
export function createLiveWorld() {
  return {
    zone: ZONE,
    mobs: ZONE.mobs.map((m) => ({ ...m, alive: true, respawnAt: 0 })),
    pickups: ZONE.pickups.map((p) => ({ ...p })),
    players: new Map(), // socketId -> public player state
  };
}

export function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    classId: p.classId,
    level: p.level,
    x: p.x,
    y: p.y,
    z: p.z,
    ry: p.ry || 0,
    hp: p.hp,
    maxHp: p.maxHp,
    modelUrl: p.modelUrl,
    modelStatus: p.modelStatus,
  };
}

export function tickWorld(world, dt) {
  const now = Date.now();
  for (const m of world.mobs) {
    if (!m.alive && m.respawnAt && now >= m.respawnAt) {
      m.alive = true;
      m.hp = m.maxHp;
      m.respawnAt = 0;
    }
    // idle wander
    if (m.alive) {
      m._t = (m._t || 0) + dt;
      m.x += Math.sin(m._t * 0.4 + m.id.length) * 0.4 * dt;
      m.z += Math.cos(m._t * 0.35 + m.id.length) * 0.4 * dt;
    }
  }
}
