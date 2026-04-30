# Checklist Mundial — PWA com contas e nuvem

App web/PWA para controle de cromos, com dashboard, mapa visual, listas de faltantes/repetidas, backup JSON e sincronização por usuário usando Firebase.

## Como publicar na Vercel

Caminho simples com terminal:

```bash
npm install
npx vercel login
npx vercel --prod
```

A Vercel vai devolver um link público no fim do deploy.

Caminho com GitHub:

1. Crie um repositório no GitHub.
2. Envie todos os arquivos desta pasta.
3. Acesse https://vercel.com/new
4. Importe o repositório.
5. Framework preset: `Other`.
6. Build command: deixe vazio.
7. Output directory: deixe vazio ou `.`.
8. Deploy.

## Como ativar conta por usuário

Veja `PASSO_A_PASSO_PUBLICAR.md`.

## Segurança

Use as regras do arquivo `FIREBASE_RULES.txt` no Firestore. Elas fazem cada usuário ler e gravar apenas o próprio documento.
DEPLOY INICIAL
