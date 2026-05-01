# Meu Álbum da Copa v0.10.1

PWA para controlar álbum de figurinhas com login Google, sincronização pessoal/família e controle por quantidade.

## Novidades da v0.10.1

- Base completa de nomes e tipos importada de `NOMES E TAGS.txt`.
- Total oficial mantido em **994 figurinhas**:
  - 48 seleções x 20 = 960
  - FWC 01–20 = 20
  - CC 01–14 = 14
- Cards mostram código, nome, tipo e status.
- Busca encontra por código, seleção, nome, tipo e status.
- Resumo corrigido:
  - `x/994` mostra apenas as figurinhas únicas que você tem.
  - `Total de figurinhas` mostra o acervo físico real: únicas + repetidas.
- Mantém sync automático, modo família bidirecional, quantidades ilimitadas e repetidas como `quantidade - 1`.

## Deploy

Substitua os arquivos no GitHub, faça commit na `main`, aguarde a Vercel publicar e teste com Ctrl + F5 se o visual antigo aparecer.
