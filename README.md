# MeshyMMO — Astralon Online

**MMO RPG no navegador** com multiplayer em tempo real e geração de personagens 3D via **Meshy AI**.

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

## Stack (linguagens necessárias)

| Camada | Tecnologia |
|--------|------------|
| Cliente 3D | **JavaScript + Three.js (WebGL)** |
| UI | **HTML5 + CSS3** |
| Multiplayer | **Node.js + Socket.IO (WebSocket)** |
| API HTTP | **Express** |
| Auth | **bcryptjs** |
| Persistência | **JSON** (arquivo local) |
| Personagens 3D | **Meshy AI API** |
| Modelos | **GLB** via **GLTFLoader** |

## APIs Meshy usadas

Documentação: https://docs.meshy.ai/en/api/text-to-3d

| Método | Endpoint | Uso no jogo |
|--------|----------|-------------|
| `POST` | `https://api.meshy.ai/openapi/v2/text-to-3d` | `mode: "preview"` — mesh do personagem (A-pose) |
| `POST` | `https://api.meshy.ai/openapi/v2/text-to-3d` | `mode: "refine"` — texturas PBR |
| `GET` | `https://api.meshy.ai/openapi/v2/text-to-3d/:id` | Polling de status / progresso |
| Download | `model_urls.glb` | Arquivo 3D salvo em `/models` e usado no jogo |

### Key

1. Crie em https://www.meshy.ai/settings/api  
2. Cole na criação de personagem **ou** no `.env`:

```env
MESHY_API_KEY=msy-sua-chave
```

**Key de teste (sem créditos):**

```text
msy_dummy_api_key_for_test_mode_12345678
```

(retorna modelos de amostra da Meshy — ideal para integrar sem gastar)

### Opcional (próximos passos Meshy)

- Image-to-3D: `POST /openapi/v1/image-to-3d`
- Auto-rig / animação (planos Pro) — walk/run no personagem

## Como jogar

1. **Criar conta** / entrar  
2. **Criar herói** com nome, classe e prompt Meshy  
3. Aguarde status `ready` (se gerou 3D)  
4. **Entrar no mundo**  
5. Clique para capturar mouse  

| Controle | Ação |
|----------|------|
| WASD | Mover |
| Mouse | Olhar |
| Espaço | Pular |
| Clique esquerdo | Atacar (perto do inimigo) |
| E | Falar com NPC / pegar cristal |
| Enter | Chat |
| Esc | Liberar mouse |

### Conteúdo do Vale de Astralon

- NPCs (quest / ferreiro)  
- Goblins / lobo (combate + XP + ouro + respawn)  
- Cristais coletáveis  
- Outros jogadores online (mesmo servidor)  
- Chat da zona  

## Estrutura

```
MeshyMMO/
├── server/
│   ├── index.js      # Express + Socket.IO + rotas
│   ├── meshy.js      # Cliente Text-to-3D Meshy
│   ├── db.js         # users/characters JSON
│   └── world.js      # zona, mobs, pickups
├── public/
│   ├── index.html
│   ├── css/game.css
│   ├── js/app.js     # cliente 3D + UI + rede
│   └── lib/          # Three.js offline
├── data/             # persistência local
├── package.json
├── start.bat
└── .env
```

## Foco do MVP (intencional)

Feito para **funcionar de verdade** primeiro:

- Conta + personagens  
- Mundo 3D multiplayer  
- Combate / loot / chat  
- Pipeline Meshy completo no servidor  

Próximas evoluções naturais: inventário UI, quests, mais mapas, skill bar, party, banco.
