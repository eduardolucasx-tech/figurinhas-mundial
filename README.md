# Checklist Mundial v0.2

App/PWA para controle de figurinhas do álbum, com login Google e sincronização por usuário via Firebase/Firestore.

## Novidades da v0.2

- Sincronização automática por padrão.
- Remoção da confusão entre “Salvar na nuvem” e “Carregar da nuvem”.
- Botão único: **Sincronizar agora**.
- Status visual de sincronização no topo.
- “Cromo” trocado por **figurinha** no app.
- Quantidade ilimitada por figurinha.
- Repetidas calculadas como `quantidade - 1`.
- Cards coloridos por status: falta, tenho, repetida e troca/reserva.
- Botões `+` e `-` para controle rápido do acervo.
- Tela de trocas com cópia de faltantes e repetidas.
- Histórico de alterações e botão desfazer.
- Layout mais mobile-first com navegação inferior no celular.

## Firestore Rules recomendadas

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /checklist_mundial_users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
