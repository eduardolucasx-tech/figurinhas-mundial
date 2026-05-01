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


## v0.11.1
- Corrigido o topo horizontal de cada seleção: bandeira, código/nome, porcentagem e contadores foram movidos para dentro do banner colorido.
- Restaurado visual do banner com cores inspiradas na bandeira de cada seleção.
- Ajustado o layout interno das figurinhas para melhor centralização no desktop e no mobile.
- O contador principal do álbum volta a usar o total real de 994 figurinhas.


## v0.11.2
- Banner desktop de cada seleção reorganizado para um visual mais horizontal.
- Refinada a centralização interna das figurinhas no desktop e no mobile.
- Mantido o banner mobile que já estava aprovado.


## v0.11.3
- Banner desktop reorganizado para ficar mais equilibrado e horizontal.
- Contador X/20 movido para junto do grupo, acima do nome da seleção.
- Bandeira centralizada verticalmente no banner.
- Figurinhas com placas internas mais uniformes e conteúdo centralizado.
