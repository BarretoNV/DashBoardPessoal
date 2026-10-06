# Publicação do painel

Repositório: https://github.com/BarretoNV/DashBoardPessoal

Domínio de produção previsto: https://dashboardpessoal.vercel.app

## Configurar Vercel e Neon

1. Importar o repositório na Vercel, com preset **Vite**, Node **24.x** e raiz do projeto. `vercel.json` define `npm ci`, `npm run build`, saída `dist` e encaminhamento da API.
2. Pelo Marketplace, conectar **Neon Postgres** ao projeto. Escolher o plano gratuito se disponível; não é necessário Redis. A integração deve fornecer `DATABASE_URL`.
3. Criar banco/branch independente para desenvolvimento e homologação. Credenciais de produção não devem ser habilitadas para previews automáticos.
4. Configurar as variáveis abaixo para **Production**, no painel da Vercel. Não prefixar segredos com `VITE_`.

| Variável                      | Valor de produção                                        |
| ----------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`                | Conexão SSL fornecida pelo Neon                          |
| `GOOGLE_CLIENT_ID`            | Client ID OAuth Web do Google Cloud                      |
| `GOOGLE_CLIENT_SECRET`        | Client secret OAuth, somente no servidor                 |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Chave base64 de 32 bytes; gerar com `npm run auth:key`   |
| `ALLOWED_GOOGLE_EMAIL`        | `barretonovaes.vilas@gmail.com`                          |
| `APP_ORIGIN`                  | `https://dashboardpessoal.vercel.app`                    |
| `APP_ORIGINS`                 | `https://dashboardpessoal.vercel.app`                    |
| `GOOGLE_LOGIN_REDIRECT_URI`   | `https://dashboardpessoal.vercel.app/api/login/callback` |
| `GOOGLE_REDIRECT_URI`         | `https://dashboardpessoal.vercel.app/api/auth/callback`  |

A Vercel ativa o modo cloud automaticamente. `APP_MODE=local` não desativa a proteção em produção. O cliente recebe erro controlado quando falta configuração. Não trocar a chave de criptografia sem reconectar as integrações; sessões OAuth pendentes também ficam inválidas.

## Configurar Google Cloud

No mesmo client OAuth Web, cadastrar **os dois callbacks exatos** da tabela acima e a origem HTTPS. Manter os callbacks locais se quiser continuar executando localmente. Ativar Calendar API e Tasks API. Revisar a tela de consentimento/público e a validade de refresh tokens de aplicativos em Testing.

O login solicita somente identidade (`openid`, `email`, `profile`). Calendar e Tasks pedem permissões depois, nas configurações do painel. A identidade do Google é verificada no servidor e uma conta diferente da autorizada não pode entrar nem ser conectada às integrações.

## Aplicar migrações antes do deploy

Usar um terminal com `DATABASE_URL` do **ambiente de destino**, sem colocar a URL em comando ou arquivo versionado. Também é possível colocar a conexão no `.env.local` ignorado pelo Git. Não executar contra produção durante testes locais.

```sh
npm ci
npm run db:migrate
npm run lint
npm test -- --no-cache
npm run build
```

O migrador registra versões em `dashboard_migrations` e aplica cada arquivo em uma transação. Não há criação de tabelas durante requisições. Executar uma instância do migrador por ambiente de cada vez. As migrações são aditivas e não removem dados para rollback do frontend.

Depois, publicar o commit pela integração GitHub/Vercel. Homologação deve usar URL estável, origem/callbacks próprios e banco independente. Previews sem segredos mostram indisponibilidade controlada; não reutilizam produção.

## Migrar dados do localhost

1. Executar a versão atualizada no navegador que contém os dados locais.
2. Abrir **Configurações → Preferências → Backup dos dados → Exportar backup JSON**.
3. Entrar no domínio publicado com a conta autorizada.
4. Importar o JSON, conferir as quantidades e confirmar a substituição. Antes da gravação será baixado um backup do estado atual. Se o banco mudar em outro dispositivo, a substituição é rejeitada para não sobrescrever alterações recentes.
5. Reconectar Calendar/Tasks no domínio publicado. O arquivo `.data/google-session.enc` e credenciais OAuth nunca fazem parte do backup.

O backup aceita até 1 MB e inclui configurações, hábitos, tarefas locais, preferências de integração e lista Google selecionada. Não inclui os eventos/tarefas vindos do Google. O painel cloud começa com listas vazias. Importar substitui o estado sincronizado; não mescla automaticamente dados de navegadores diferentes.

## Funcionamento e limites

- Frontend e API ficam no mesmo domínio. Cookies da sessão são HttpOnly, Secure em produção e SameSite=Lax, com validade absoluta de 30 dias. O banco guarda apenas o hash da sessão.
- Todas as APIs de dados exigem sessão; mutações também exigem origem autorizada e CSRF. `/api/session`, login e `/api/health` não expõem dados do painel.
- Tokens e PKCE ficam criptografados no Neon. O estado OAuth expira em 10 minutos e é consumido uma única vez, mesmo entre instâncias diferentes.
- **Sair do painel** fecha apenas a sessão deste navegador. **Desconectar Google** revoga as integrações sem apagar hábitos, tarefas ou preferências.
- O estado sincroniza a cada 30 segundos quando a aba está visível e ao recuperar foco. Mudanças locais são serializadas, reaplicadas por campo/item em conflitos e identificadas para impedir duplicação. Após três retries, a alteração permanece pendente e o painel oferece **Tentar novamente**.
- Edição offline é bloqueada. Falhas de gravação mantêm a alteração pendente em memória; não recarregar/fechar a aba antes de sincronizar ou exportar backup. Não existe fila persistente offline.
- Tela cheia, caches Google, listas não lidas e rotação temporária permanecem por dispositivo. As tarefas/eventos Google continuam nas APIs Google.
- Consultas usam `Cache-Control: no-store`. Logs de erro não contêm tokens, credenciais nem conteúdo pessoal.

## Verificação após publicar

Consultar `/api/health` (200 com `ok:true` quando configurado e banco/migração acessíveis). Em seguida verificar login permitido/negado, bloqueio de APIs sem sessão, criação/conclusão de tarefas, Calendar, hábitos e preferências em dois navegadores, F5, logout e reconexão. Conferir logs Vercel sem copiar segredos.

Os testes automatizados executam as migrações em PostgreSQL embarcado, além de testes HTTP e de sincronização. Eles não substituem o teste real de consentimento Google e de integração Neon/Vercel.

## Desenvolvimento local

Sem `APP_MODE=cloud`, o servidor continua em 8787, com Vite em 5173, dados no navegador e sessão Google no arquivo local criptografado. A API local permanece vinculada a `127.0.0.1`.

Para testar login e sincronização, definir `APP_MODE=cloud`, `DATABASE_URL` de desenvolvimento, e-mail autorizado e ambos os callbacks locais de `.env.example`. Aplicar as migrações e executar `npm run dev`. Nunca usar o banco de produção para esse modo de desenvolvimento.
