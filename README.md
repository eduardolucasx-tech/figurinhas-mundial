# Meu Álbum da Copa v0.10.4

Atualização visual focada no layout das figurinhas.

## O que mudou

- Figurinhas nº 1 de cada seleção com visual prata.
- Figurinhas nº 13 com visual dourado.
- Demais figurinhas em tons de cinza.
- Figurinhas faltantes ficam mais apagadas.
- Figurinhas coladas ganham borda verde.
- Figurinhas repetidas ganham destaque dourado.
- Mantidos os nomes dos jogadores, códigos e controles + / -.
- Resumo mantido:
  - `x/994` = figurinhas únicas/coladas.
  - `total no acervo` = coladas + repetidas.

## Deploy

Substitua os arquivos no GitHub, faça commit na `main`, aguarde a Vercel publicar e teste com Ctrl + F5.


## v0.11.0
- Correção importante de sincronização: se o Google deslogar e você marcar figurinhas no modo local, ao entrar novamente o app agora mescla local + nuvem.
- A mesclagem preserva a maior quantidade de cada figurinha para evitar perda de figurinhas marcadas offline.
- Se a coleção da nuvem ainda não existir, o estado local é enviado automaticamente no login.
- Mantido layout horizontal no desktop e ajuste mobile.


## v0.11.2
- Layout das figurinhas refeito com base cinza/branca uniforme, como um PNG, mas com textos editáveis por HTML.
- Corrigida a deformação das figurinhas repetidas: repetida, faltante, tenho, prata e dourada usam a mesma estrutura.
- Centralização dos textos internos da figurinha reforçada.
- Banner das seleções ajustado para evitar nome desalinhado e sobreposição com as informações.
