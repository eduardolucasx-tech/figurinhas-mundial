# Checklist Mundial v0.3

App/PWA para controlar álbum de figurinhas com login Google e sincronização via Firebase/Firestore.

## Novidades da v0.3
- O app agora abre direto na aba **Álbum**.
- O antigo Dashboard virou **Resumo**.
- Navegação mais simples: Álbum, Buscar, Trocas, Mapa, Resumo e Conta.
- Cabeçalho do álbum com progresso rápido, faltantes, repetidas e total físico.
- Filtros rápidos por status: todas, faltantes, tenho, repetidas e trocas.
- Cards de seleção mais visuais, com progresso, faltantes, repetidas e quantidade física.
- Botão flutuante de marcação rápida no celular.
- Ajustes de layout mobile-first.
- Mantém sync automático por padrão, quantidades ilimitadas e controle de repetidas.

## Deploy
Suba os arquivos na branch `main` do GitHub. A Vercel publica automaticamente.

## Firebase
A configuração fica em `firebase-config.js`. A segurança fica nas regras do Firestore.

## v0.5 - Scanner mobile

Esta versão une a v0.3 com uma tela **Escanear**:

- usa a câmera por no máximo 10 segundos;
- tenta ler códigos como `BRA 10` e `ARG 07` via OCR no navegador;
- não salva fotos nem vídeos;
- não envia imagens para Firebase, Vercel ou qualquer nuvem;
- só salva o código confirmado pelo usuário e a quantidade da figurinha;
- mantém digitação manual como fallback caso a câmera/OCR falhe.

Observação: a leitura por câmera depende de luz, foco, reflexo e da qualidade do texto impresso na figurinha. A confirmação manual é obrigatória antes de adicionar.


## v0.5

- Corrige a tela Álbum para voltar a mostrar os cards das seleções diretamente.
- Adiciona gabarito visual do scanner com moldura fina e área de leitura no canto superior direito.
- Scanner tenta primeiro a região do código para melhorar a leitura OCR.
- Mantém limite de câmera em 10 segundos e sem armazenamento de imagens/vídeos.
