# 🚀 GUIA DE DEPLOY DO BACKEND - OBRIGATÓRIO

## ⚠️ IMPORTANTE

O backend no Render **NÃO está atualizado**. Você precisa fazer o redeploy para aplicar as correções:

- ✅ CORS do GitHub Pages
- ✅ Response correta da API (`visitas` ao invés de `data`)
- ✅ Tabela de visitas sem FOREIGN KEY

---

## 📋 PASSO A PASSO

### 1. Acesse o Render Dashboard
```
https://dashboard.render.com
```

### 2. Entre no Serviço
- Clique em **repositor-backend** (ou nome que você deu)

### 3. Faça o Deploy
- Procure o botão **"Manual Deploy"** no canto superior direito
- Clique em **"Deploy latest commit"**
- Aguarde 2-3 minutos

### 4. Verifique os Logs
Durante o deploy, você verá:
```
==> Cloning from https://github.com/EquipeGF2/Germani_Repositores...
==> Running 'npm install'
==> Running 'npm start'
✅ Conectado ao Turso
✅ Tabela cc_registro_visita criada/verificada
✅ Servidor rodando na porta 3001
```

### 5. Teste a API
Após o deploy terminar, teste:
```
https://repositor-backend.onrender.com/health
```

Deve retornar:
```json
{
  "status": "OK",
  "timestamp": "2025-12-18T...",
  "environment": "production"
}
```

---

## ❌ ERROS QUE SERÃO CORRIGIDOS

### Antes do deploy:
```
❌ GET /api/registro-rota/visitas → 500 (Internal Server Error)
❌ POST /api/registro-rota/visitas → 500 (Unexpected status code 400)
❌ CORS blocked from GitHub Pages
```

### Depois do deploy:
```
✅ GET /api/registro-rota/visitas → 200 (OK)
✅ POST /api/registro-rota/visitas → 200 (OK)
✅ CORS permitido para GitHub Pages
```

---

## 📱 SOBRE O CELULAR NÃO ABRIR

Se após fazer o deploy do backend o celular ainda não abrir:

### 1. Limpe o Cache
**Android (Chrome):**
- Menu (3 pontos) → Configurações
- Privacidade → Limpar dados de navegação
- Marcar "Imagens e arquivos em cache"
- Limpar

**iOS (Safari):**
- Ajustes → Safari
- Limpar Histórico e Dados de Sites

### 2. Forçar Atualização
- Segure e arraste para baixo (pull to refresh)
- Ou feche e abra o navegador novamente

### 3. Teste em Modo Anônimo
- Abra uma aba anônima/privada
- Acesse: `https://equipegf2.github.io/Germani_Repositores`
- Se funcionar, o problema era cache

### 4. Verifique o Console (Mobile)
**Android (Chrome):**
- Conecte o celular no PC via USB
- Abra Chrome no PC
- Vá em `chrome://inspect`
- Clique em "Inspect" no dispositivo

**iOS (Safari):**
- iPhone: Ajustes → Safari → Avançado → Web Inspector (ativar)
- Mac: Safari → Desenvolver → [Seu iPhone] → [Página]

### 5. Teste de Conectividade
```
https://equipegf2.github.io/Germani_Repositores/
```

Se não carregar nada:
- Problema de rede/DNS
- Teste em outro WiFi ou 4G

Se carregar mas ficar em branco:
- Erro de JavaScript (veja console)
- Cache antigo (limpe o cache)

---

## ✅ CHECKLIST FINAL

- [ ] Fiz o redeploy no Render
- [ ] Aguardei 2-3 minutos
- [ ] Testei `/health` e retornou OK
- [ ] Limpei cache do navegador (desktop e mobile)
- [ ] Testei em modo anônimo
- [ ] Testei registrar uma visita
- [ ] Testei consultar visitas

---

## 🆘 SE AINDA NÃO FUNCIONAR

Entre em contato e forneça:
- URL do backend Render
- Logs do deploy no Render
- Screenshot do erro no console (F12)
- Dispositivo e navegador (ex: iPhone 12, Safari 17)
