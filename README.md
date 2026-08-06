# VoltES

Sistema PWA de orçamentos elétricos (residencial/comercial) com preços de referência para o Espírito Santo.

**Stack:** Vite + TypeScript · domínio (NBR 5410 / circuitos) separado da UI · temas claro e escuro (paleta da logo).

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra o endereço local indicado (não use `file://`).

```bash
npm run build    # gera dist/
npm run preview  # serve o build
```

## Arquitetura

```
src/
  domain/     # cálculos e regras (sem DOM)
  data/       # catálogo e helpers de preço
  store/      # cache + Firebase
  ui/         # shell, temas, editor de planta
  pdf/        # geração de PDF
  styles/     # tokens da marca + temas
  pwa/        # service worker (vite-plugin-pwa)
```

Legado JS (pré-migração) fica em `_legacy/` só para referência.

## Temas

Botão sol/lua na sidebar. Preferência em `localStorage` (`voltes-theme`). Tokens em `src/styles/tokens.css` e `themes.css` (laranja do raio, azul ES, prata).

## GitHub Pages

URL: https://infinityprojetos0-star.github.io/Eletrica/

O site público serve a pasta **`docs/`** da branch `main` (build Vite com `VITE_BASE=/Eletrica/`).

Para republicar após mudanças:

```powershell
$env:VITE_BASE="/Eletrica/"; npm run build
Remove-Item -Recurse -Force docs -ErrorAction SilentlyContinue
Copy-Item -Recurse dist docs
Set-Content docs\.nojekyll ""
git add docs
git commit -m "Update GitHub Pages build"
git push origin main
```

## Firebase

Sync otimizado para o plano **Spark (grátis)** no projeto `eletrica-86ed1`:

- **Cache em 3 camadas:** memória → localStorage → IndexedDB
- Catálogo base no código; a nuvem só guarda **patches**
- Salvamento por **item/path**; conflito: `updatedAt` mais recente
- Fila offline + listeners `child_*`
- Aba em segundo plano: `goOffline`

No Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "voltes": {
      ".read": true,
      ".write": true
    }
  }
}
```

> Em produção, use autenticação (não deixe write público).
