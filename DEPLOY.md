# Hospedar o MeshyMMO (grátis)

## 1. Código no GitHub (já feito)

**Repositório:** https://github.com/rdzindu7/MeshyMMO

Para enviar suas mudanças:

```bat
cd Desktop\MeshyMMO
git add -A
git commit -m "melhorias"
git push
```

---

## 2. Deploy grátis no Render (recomendado)

O jogo usa **Node.js + Socket.IO** (não roda em GitHub Pages sozinho).

### Passo a passo

1. Crie conta em https://render.com (pode logar com GitHub)
2. **New → Blueprint** (ou Web Service)
3. Conecte o repo **`rdzindu7/MeshyMMO`**
4. Use o `render.yaml` do projeto (plano **Free**)
5. Em **Environment**, adicione (opcional):
   - `MESHY_API_KEY` = sua chave `msy-...`
6. **Create Web Service** e espere o build (~2–5 min)
7. A URL fica tipo:  
   `https://meshy-mmo.onrender.com`

### Importante (plano free)

- No free, o app **dorme** após ~15 min sem acesso
- O **primeiro** acesso depois de dormir demora ~30–60s (cold start)
- Depois fica normal enquanto houver jogadores
- Dados de conta ficam no disco do container e **podem resetar** em redeploy (é free)

---

## 3. Local sem cair (PC ligado)

```bat
Desktop\MeshyMMO\start.bat
```

**Não feche** a janela preta do servidor.

---

## 4. Fluxo de trabalho (modificar com segurança)

1. Edite arquivos em `Desktop\MeshyMMO`
2. Teste local com `start.bat`
3. `git add` + `git commit` + `git push`
4. O Render **redeploya sozinho** se estiver conectado ao GitHub

Assim o código fica seguro no GitHub e o jogo fica online no Render.
