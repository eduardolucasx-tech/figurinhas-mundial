# Checklist Mundial v0.6

App/PWA para controlar álbum de figurinhas com login Google e sincronização via Firebase/Firestore.

## Novidades da v0.6

- Remove completamente a experiência de câmera/scanner por enquanto.
- Mantém o app abrindo direto na aba **Álbum**.
- Adiciona a aba **Adicionar**, focada em lançamento rápido por código.
- Modo pacotinho: digite códigos como `HAI 8`, `HAI08` ou `HAI-08` e confirme com **+1**.
- Lista temporária de últimas figurinhas adicionadas no pacotinho.
- Mantém quantidades ilimitadas por figurinha.
- Repetidas continuam sendo calculadas como quantidade acima de 1.
- Mantém sincronização automática por padrão.
- Mantém controle direto pelo álbum com botões **+** e **-**.
- Mantém Buscar, Trocas, Mapa, Resumo e Conta.

## Deploy

Suba os arquivos na branch `main` do GitHub. A Vercel publica automaticamente.

## Firebase

A configuração fica em `firebase-config.js`. A segurança fica nas regras do Firestore.

## v0.7.1 - limpeza visual

- Remove botões duplicados do topo e do card principal do Álbum.
- Mantém apenas status de modo/sync e o botão Sincronizar agora no topo.
- Move a instalação do app para a aba Conta.
- Mantém os filtros do Álbum como principal forma de navegação.
- Adiciona acesso ao Mapa como opção de visualização dentro do Álbum.
