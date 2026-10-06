# Centro de Comando — Painel Pessoal

Dashboard noturna para permanecer aberta em uma TV. O projeto usa React, TypeScript, Vite, Tailwind CSS e uma API Node.js/Express local. O clima vem do Open-Meteo; Google Calendar e Google Tasks são integrações opcionais.

Sem uma conexão Google, a agenda de demonstração e as tarefas locais continuam funcionando. A interface identifica quando está mostrando **Google Calendar**, **Google Tasks** ou **Dados locais**.

## Executar

Use Node.js 24.15.0 ou superior dentro da versão 24.x.

```sh
npm install
npm run dev
```

Esse comando inicia os dois processos:

- dashboard React/Vite em `http://127.0.0.1:5173`;
- API local em `http://127.0.0.1:8787`.

A dashboard cabe sem rolagem a partir de 900 × 700 px. Em telas menores, ela empilha as seções e permite rolagem.

## Uso e dados locais

- A engrenagem abre preferências, integrações, tarefas e hábitos.
- O ícone de olho ativa **Ocultar controles**. Ele esconde controles administrativos e mantém tarefas e hábitos interativos.
- O título de **Essencial** permite alternar entre listas do Google Tasks; o botão `+` cria uma tarefa com título e data opcional na lista selecionada.
- Listas com pendências alternam automaticamente a cada 30 segundos sem interação, e o modo ambiente entra após 2 minutos. Clique, toque ou teclado revelam os controles novamente.
- Os sinais e bordas usam movimento discreto. A preferência `prefers-reduced-motion` do sistema desativa as animações não essenciais.
- O clima usa Open-Meteo e não requer chave.
- O fuso padrão é `America/Sao_Paulo` e pode ser alterado.
- Tarefas locais, hábitos, localização e preferências ficam no `localStorage`.
- A agenda local demonstrativa fica em `src/data/demo.ts`.

## Google Calendar e Google Tasks

A autenticação usa **OAuth 2.0 Authorization Code**, acesso offline, PKCE e proteção `state`. O navegador é redirecionado ao Google; o callback volta para a API local, que troca o código. O frontend nunca recebe access token, refresh token ou client secret.

A API guarda somente o refresh token e os scopes, criptografados com AES-256-GCM em `.data/google-session.enc`. A chave de criptografia e o client secret ficam em `.env.local`; ambos estão ignorados pelo Git. Access tokens existem apenas na memória do backend e a biblioteca oficial do Google os renova quando necessário.

### Configurar no Google Cloud

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) e crie ou selecione um projeto.
2. Em **APIs e serviços > Biblioteca**, habilite **Google Calendar API**.
3. Habilite também **Google Tasks API**.
4. Abra **Google Auth Platform** ou **Tela de consentimento OAuth** e configure nome, e-mail de suporte e contato do desenvolvedor.
5. Se o aplicativo estiver em modo de teste, adicione sua conta em **Usuários de teste**.
6. Em **Clientes**, crie um cliente OAuth do tipo **Aplicativo da Web**.
7. Em **URIs de redirecionamento autorizados**, adicione exatamente:

   ```text
   http://127.0.0.1:8787/api/auth/callback
   ```

8. Copie o **Client ID** e o **Client secret**.
9. Copie `.env.example` para `.env.local`.
10. Gere uma chave local:

    ```sh
    npm run auth:key
    ```

11. Copie a linha gerada e preencha `.env.local`:

    ```text
    GOOGLE_CLIENT_ID=
    GOOGLE_CLIENT_SECRET=
    GOOGLE_TOKEN_ENCRYPTION_KEY=
    GOOGLE_REDIRECT_URI=http://127.0.0.1:8787/api/auth/callback
    APP_ORIGIN=http://127.0.0.1:5173
    APP_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
    API_PORT=8787
    ```

12. Reinicie `npm run dev`.
13. Abra a engrenagem e conecte Calendar e/ou Tasks.

Não use valores de exemplo como credenciais. Não prefixe o client secret com `VITE_`: variáveis Vite são expostas ao navegador.

### Aplicativo em teste

Projetos OAuth externos com status **Testing** podem receber refresh tokens com validade limitada, frequentemente sete dias. Para uma conexão pessoal duradoura, revise as exigências do seu projeto no Google Auth Platform e use o status de publicação apropriado. Revogações feitas na Conta Google, mudança de senha, inatividade prolongada e limites de refresh tokens também podem exigir nova autorização.

### Escopos

- Calendar: `https://www.googleapis.com/auth/calendar.events.readonly`
- Tasks: `https://www.googleapis.com/auth/tasks`

O Calendar continua somente leitura. O Tasks precisa de escrita para criar, concluir e reabrir tarefas. As duas integrações compartilham a mesma sessão; ao habilitar a segunda, o Google apresenta apenas a autorização adicional necessária.

### Persistência e renovação

- F5: o React consulta `GET /api/auth/status` e recupera a sessão do backend.
- Fechar o navegador: a sessão permanece no arquivo criptografado.
- Reiniciar frontend ou backend: o refresh token é relido e um access token novo é solicitado.
- Token expirado: a biblioteca oficial renova automaticamente antes da chamada ao Google.
- Token revogado ou `invalid_grant`: a sessão inválida é removida e a interface volta aos dados locais.
- Desconectar: `POST /api/auth/logout` revoga o refresh token no Google quando possível e apaga a cópia local.

Não apague ou altere `GOOGLE_TOKEN_ENCRYPTION_KEY` enquanto quiser manter a sessão: sem a mesma chave, o arquivo não pode ser descriptografado.

### Endpoints locais

- `GET /api/auth/status`: retorna apenas estado e scopes; nunca retorna tokens.
- `GET /api/auth/start`: inicia Authorization Code + PKCE.
- `GET /api/auth/callback`: valida `state`, troca o código e volta à dashboard.
- `POST /api/auth/logout`: revoga e remove a sessão.
- `GET /api/calendar/events`: consulta o calendário principal.
- `GET /api/task-lists`: consulta todas as listas do Google Tasks.
- `GET /api/tasks?taskListId=...`: consulta as tarefas de uma lista.
- `POST /api/tasks`: cria uma tarefa na lista informada, com título e data opcional.
- `PATCH /api/tasks/:id`: conclui ou reabre uma tarefa na lista informada.

As mutações aceitam somente origens locais configuradas em `APP_ORIGINS`.

### Problemas comuns

- `redirect_uri_mismatch`: confirme que `http://127.0.0.1:8787/api/auth/callback` está cadastrado exatamente, sem barra final.
- `access_denied`: confirme que sua conta está em **Usuários de teste** ou revise o público/status do aplicativo.
- **Reconexão necessária após alguns dias**: verifique se o aplicativo ainda está em **Testing** e se o acesso não foi revogado na Conta Google.
- **API local não disponível**: inicie com `npm run dev`, não apenas `npm run dev:frontend`.
- **Sessão perdida após trocar a chave**: desconecte, remova `.data/google-session.enc` e conecte novamente com a nova chave.
- Mudou `.env.local`: reinicie os dois processos.

## Arquitetura

```text
React/Vite
   ↓ /api
Node.js/Express
   ↓ OAuth e APIs
Google Calendar / Google Tasks
```

`calendarService` continua como fachada e recua para `localCalendarService` quando a API local ou o Google falham. `googleCalendarService` e `googleTasksService` normalizam as respostas para os tipos internos. Clima, hábitos, layout e o modo sem controles não dependem da autenticação.

## Verificação

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Com `npm run dev` ativo e Google Chrome instalado:

```sh
npm run test:browser
npm run test:auth-browser
```

Os testes cobrem armazenamento criptografado, restauração após reiniciar o servidor, renovação de access token, `invalid_grant`, logout, proteção por origem, F5, fechamento/reabertura da dashboard, Calendar, Tasks, fallback local e o layout responsivo.

## Publicação na Vercel

A aplicação possui frontend Vite e API serverless no mesmo projeto Vercel, login exclusivo por conta Google e sincronização pelo Neon Postgres. Consulte [DEPLOYMENT.md](DEPLOYMENT.md) para configurar o banco, as variáveis, os callbacks Google, aplicar as migrações e importar os dados do localhost. O modo local continua disponível.

Documentação: [Google Identity Services — code model](https://developers.google.com/identity/oauth2/web/guides/use-code-model), [OAuth 2.0 para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Calendar API](https://developers.google.com/workspace/calendar/api/auth), [Google Tasks API](https://developers.google.com/workspace/tasks/auth) e [Open-Meteo](https://open-meteo.com/en/docs).

# DashBoardPessoal
