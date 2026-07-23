# VoltES

Sistema PWA de orçamentos elétricos (residencial/comercial) com preços de referência para o Espírito Santo.

## GitHub Pages

URL: https://infinityprojetos0-star.github.io/Eletrica/

## Firebase

Dados (clientes, orçamentos, serviços, materiais, financeiro, contratos) sincronizam no **Realtime Database** do projeto `eletrica-86ed1`.

No Firebase Console → Realtime Database → Rules, use pelo menos:

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
