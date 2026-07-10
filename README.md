# MeshyMMO — Astralon Online

**GitHub (código seguro):** https://github.com/rdzindu7/MeshyMMO  

**Deploy:** veja [DEPLOY.md](./DEPLOY.md) (Render grátis)

**MMO RPG no navegador** com multiplayer em tempo real e geraÃ§Ã£o de personagens 3D via **Meshy AI**.

## Iniciar

```bat
start.bat
```

Ou:

```bat
npm install
npm start
```

Abra: **http://127.0.0.1:3000**

## Stack (linguagens necessÃ¡rias)

| Camada | Tecnologia |
|--------|------------|
| Cliente 3D | **JavaScript + Three.js (WebGL)** |
| UI | **HTML5 + CSS3** |
| Multiplayer | **Node.js + Socket.IO (WebSocket)** |
| API HTTP | **Express** |
| Auth | **bcryptjs** |
| PersistÃªncia | **JSON** (arquivo local) |
| Personagens 3D | **Meshy AI API** |
| Modelos | **GLB** via **GLTFLoader** |

## APIs Meshy usadas

DocumentaÃ§Ã£o: https://docs.meshy.ai/en/api/text-to-3d

| MÃ©todo | Endpoint | Uso no jogo |
|--------|----------|-------------|
| `POST` | `https://api.meshy.ai/openapi/v2/text-to-3d` | `mode: "preview"` â€” mesh do personagem (A-pose) |
| `POST` | `https://api.meshy.ai/openapi/v2/text-to-3d` | `mode: "refine"` â€” texturas PBR |
| `GET` | `https://api.meshy.ai/openapi/v2/text-to-3d/:id` | Polling de status / progresso |
| Download | `model_urls.glb` | Arquivo 3D salvo em `/models` e usado no jogo |

### Key

1. Crie em https://www.meshy.ai/settings/api  
2. Cole na criaÃ§Ã£o de personagem **ou** no `.env`:

```env
MESHY_API_KEY=msy-sua-chave
```

**Key de teste (sem crÃ©ditos):**

```text
msy_dummy_api_key_for_test_mode_12345678
```

(retorna modelos de amostra da Meshy â€” ideal para integrar sem gastar)

### Opcional (prÃ³ximos passos Meshy)

- Image-to-3D: `POST /openapi/v1/image-to-3d`
- Auto-rig / animaÃ§Ã£o (planos Pro) â€” walk/run no personagem

## Como jogar

1. **Criar conta** / entrar  
2. **Criar herÃ³i** com nome, classe e prompt Meshy  
3. Aguarde status `ready` (se gerou 3D)  
4. **Entrar no mundo**  
5. Clique para capturar mouse  

| Controle | AÃ§Ã£o |
|----------|------|
| WASD | Mover |
| Mouse | Olhar |
| EspaÃ§o | Pular |
| Clique esquerdo | Atacar (perto do inimigo) |
| E | Falar com NPC / pegar cristal |
| Enter | Chat |
| Esc | Liberar mouse |

### ConteÃºdo do Vale de Astralon

- NPCs (quest / ferreiro)  
- Goblins / lobo (combate + XP + ouro + respawn)  
- Cristais coletÃ¡veis  
- Outros jogadores online (mesmo servidor)  
- Chat da zona  

## Estrutura

```
MeshyMMO/
â”œâ”€â”€ server/
â”‚   â”œâ”€â”€ index.js      # Express + Socket.IO + rotas
â”‚   â”œâ”€â”€ meshy.js      # Cliente Text-to-3D Meshy
â”‚   â”œâ”€â”€ db.js         # users/characters JSON
â”‚   â””â”€â”€ world.js      # zona, mobs, pickups
â”œâ”€â”€ public/
â”‚   â”œâ”€â”€ index.html
â”‚   â”œâ”€â”€ css/game.css
â”‚   â”œâ”€â”€ js/app.js     # cliente 3D + UI + rede
â”‚   â””â”€â”€ lib/          # Three.js offline
â”œâ”€â”€ data/             # persistÃªncia local
â”œâ”€â”€ package.json
â”œâ”€â”€ start.bat
â””â”€â”€ .env
```

## Foco do MVP (intencional)

Feito para **funcionar de verdade** primeiro:

- Conta + personagens  
- Mundo 3D multiplayer  
- Combate / loot / chat  
- Pipeline Meshy completo no servidor  

PrÃ³ximas evoluÃ§Ãµes naturais: inventÃ¡rio UI, quests, mais mapas, skill bar, party, banco.

