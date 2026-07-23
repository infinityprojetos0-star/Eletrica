# VoltES

Sistema PWA de orçamentos elétricos (residencial/comercial) com preços de referência para o Espírito Santo.

## GitHub Pages

URL: https://infinityprojetos0-star.github.io/Eletrica/

## Firebase

Sync otimizado para o plano **Spark (grátis)** no projeto `eletrica-86ed1`:

- **Cache em 3 camadas:** memória → localStorage → IndexedDB (menos leitura no Firebase)
- Catálogo base fica no código; a nuvem só guarda **patches** do que você alterou
- Salvamento por **item/path** (dispositivo A edita item X e B edita item Y → os dois ficam salvos)
- Conflito no mesmo item: vence o `updatedAt` mais recente
- Fila de patches pendentes (offline) + listeners `child_*` (não baixa a árvore inteira)
- Aba em segundo plano desconecta (`goOffline`)

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
