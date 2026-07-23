# VoltES

Sistema PWA de orçamentos elétricos (residencial/comercial) com preços de referência para o Espírito Santo.

## GitHub Pages

URL: https://infinityprojetos0-star.github.io/Eletrica/

## Firebase

Sync otimizado para o plano **Spark (grátis)** no projeto `eletrica-86ed1`:

- Catálogo base de preços fica no código (não sobe o catálogo inteiro a cada save)
- Nuvem guarda só: clientes, orçamentos, contratos, financeiro, empresa e **patches** de itens que você alterou
- Escrita por diff + debounce; listener leve em `meta/rev` (não na árvore inteira)
- Aba em segundo plano desconecta (`goOffline`) para poupar conexões simultâneas

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

> Em produção, troque por autenticação (não deixe write público).
