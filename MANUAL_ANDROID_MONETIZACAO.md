# Manual: do Dashboard Pessoal ao Android com monetização

Análise realizada em 13/10/2026. Este documento é um plano de implementação; o aplicativo Android ainda não foi criado. Regras e preços devem ser conferidos novamente antes da publicação.

## 1. Parecer

O projeto é uma base aproveitável para um pequeno aplicativo de produtividade. Recomendo manter React e TypeScript e adicionar Capacitor para empacotar a interface no Android e acessar recursos nativos. Não vejo motivo, neste estágio, para reescrever tudo em Kotlin ou Flutter.

A maior mudança será transformar um painel pessoal de uso ambiente em um produto móvel confiável. Publicar e inserir anúncios é a parte final: antes disso, é preciso resolver experiência no celular, persistência offline, acesso público e regras dos serviços utilizados.

Para anúncios em aplicativos, o produto apropriado é **Google AdMob**. AdSense é voltado à monetização de sites. [Comparação oficial](https://support.google.com/admob/answer/9234653?hl=en).

Minha proposta inicial: “tarefas e hábitos para organizar o dia, com visual de centro de comando”. Primeira versão sem conta obrigatória, com dados locais, backup e lembretes opcionais. Google Calendar, Google Tasks e sincronização ficam para uma segunda etapa. Isso reduz custo e dependências sem eliminar as funcionalidades principais.

## 2. O que existe e como funciona

| Área | Funcionamento observado | Implicação para Android |
| --- | --- | --- |
| Interface | React, TypeScript, Vite, CSS/Tailwind e Lucide | Reutilizável com Capacitor |
| Painel | Relógio, clima, próximo evento, agenda, tarefas e hábitos semanais | Reorganizar prioridades para uso rápido no celular |
| Tarefas | Criar, editar, concluir e persistir tarefas; integração opcional com Google Tasks | Boa base do produto |
| Hábitos | Marcação por dia e acompanhamento semanal | Boa base para uso recorrente |
| Agenda sem Google | Eventos de demonstração em `src/data/demo.ts` | Não equivale a uma agenda local editável pelo usuário |
| Preferências | Localização, fuso, integrações, visual e controles | Criar primeiro acesso simples |
| Modo ambiente | Oculta controles após inatividade e alterna listas | Manter como opção para tablets, revisar no celular |
| Dados locais | `localStorage`, com validação e formato versionado | Evoluir persistência e migrações |
| Dados na nuvem | Express, Neon/Postgres e sincronização de estado | Backend continua remoto; não é embarcado no APK |
| Login cloud | Conta Google limitada por `ALLOWED_GOOGLE_EMAIL` | Hoje não atende usuários públicos |
| Segurança | Sessões HttpOnly, CSRF, PKCE e tokens Google criptografados | Aproveitar princípios e adaptar transporte móvel |
| Offline cloud | Edição bloqueada; pendências de gravação ficam em memória | Inadequado para um app que o Android pode encerrar |
| Backup | Exportação e importação JSON | Adaptar para seletor de arquivos e compartilhamento Android |
| Android/PWA/anúncios | Não encontrei projeto Android, configuração Capacitor, manifest PWA, service worker ou SDK de anúncios | Essas camadas precisam ser construídas |

No modo local, o frontend consulta a API Express para integrações Google; tarefas e hábitos ficam no navegador. No cloud, uma sessão Google libera o painel e os dados são persistidos por proprietário no banco. A estrutura já contém `owner_id`, o que facilita a evolução, mas o login ainda impõe a conta única.

Arquivos principais para a transformação:

- `src/App.tsx`, `src/styles.css` e `src/settings.css`: experiência móvel.
- `src/components/PanelAccess.tsx`: acesso sem conta e fluxo de login.
- `src/services/storageService.ts` e `src/hooks/usePersistentState.ts`: persistência.
- `src/services/cloudDashboard.ts`: sessão, transporte, sincronização e fila de alterações.
- `src/services/googleApiService.ts`, `src/services/googleAuthService.ts` e `src/hooks/useGoogleConnection.tsx`: integração móvel com Google.
- `server/config.mjs`, `server/cloud-auth.mjs`, `server/cloud-store.mjs` e `server/google-auth.mjs`: acesso público, autorização e dados por usuário.
- `server/migrations/`: evolução do banco e exclusão de conta.
- `src/services/weatherService.ts`: fornecedor e licença do clima.
- `src/components/BackgroundMedia.tsx`: consumo de bateria e mídia.

### Verificação realizada

- `npm run build`: passou, incluindo TypeScript.
- `npm run lint`: passou.
- `npm test -- --no-cache --no-file-parallelism`: 73 testes passaram em 10 arquivos.
- `npm run test:browser`: passou para tarefas, hábitos, persistência, configurações, teclado, movimento reduzido e layout.
- Chrome testado entre 390 × 844 e 1920 × 1080 px, sem transbordamento horizontal. No celular, o conteúdo ficou com 1.486 px de altura: funcional, mas exige bastante rolagem.

A primeira execução dos testes encontrou limitações do sandbox em arquivos temporários e conexões locais; a repetição fora dele passou. Não validei login real no Google, ambiente publicado, Android físico, consumo de bateria ou anúncios reais. O teste de clima não comprova disponibilidade nem licença comercial do fornecedor.

## 3. Escolha da tecnologia

| Caminho | Vantagem | Limitação | Avaliação |
| --- | --- | --- | --- |
| React + Capacitor | Reaproveita interface e serviços; permite plugins e código Android | Login, armazenamento, anúncios e ciclo de vida precisam de adaptação | Recomendo |
| PWA | Distribuição simples por link; bom para validar interesse | Play exige caminho adicional; monetização nativa menos direta | Alternativa de validação |
| TWA | Leva uma experiência web/PWA à Play usando navegador | Exige PWA adequada, associação de domínio e adaptação da monetização | Não priorizaria neste caso |
| React Native, Flutter ou Kotlin | Mais controle da experiência nativa | Reescrita substancial da interface | Considerar após validar demanda |

Capacitor executa os arquivos web no aplicativo e permite comunicação com Android. O projeto Android é administrado pelo Android Studio. [Documentação](https://capacitorjs.com/docs/android).

Arquitetura pretendida:

```text
Aplicativo Android
  React empacotado no Capacitor
  ├─ armazenamento local e backup
  ├─ lembretes e ciclo de vida Android
  ├─ SDK nativo de anúncios + consentimento
  └─ HTTPS → API remota → Postgres e APIs Google (fase posterior)
```

O Node/Express atual não passa a funcionar dentro do celular ao instalar Capacitor. O APK leva o frontend; integrações que dependem do servidor continuam exigindo backend remoto.

## 4. Roteiro de implementação

### Etapa A — Definir e simplificar o produto

1. Escolher nome, identidade, público e identificador Android definitivo, como `com.suamarca.centrocomando` — exemplo a verificar, não um identificador já registrado.
2. Organizar três áreas: Hoje, Tarefas e Hábitos. Configurações e backup ficam acessíveis à parte.
3. Abrir o app sem login obrigatório na primeira versão.
4. Começar com dados vazios ou tutorial explicitamente identificado; retirar eventos fictícios do uso normal.
5. Manter o modo ambiente como diferencial opcional para tablet. Evitar esconder ações automaticamente no uso comum de celular.
6. Decidir se a agenda local será removida do MVP ou ganhará criação/edição de eventos. Hoje ela é demonstrativa.

Critério de conclusão: uma pessoa nova consegue criar uma tarefa e marcar um hábito em menos de um minuto, sem configurar serviços externos.

### Etapa B — Tornar o uso local confiável

1. Criar uma camada de armazenamento que permita trocar `localStorage` sem reescrever os componentes.
2. Usar armazenamento apropriado: Preferences para pequenas configurações; banco local, como SQLite por integração compatível, para entidades e uma eventual fila de sincronização.
3. Versionar o esquema e implementar migrações, importação e recuperação de backup.
4. Garantir que criar ou concluir uma tarefa grave no dispositivo antes de indicar sucesso.
5. Se houver nuvem, persistir operações pendentes, identificadores únicos e estado de conflitos; reaproveitar a lógica existente de revisão e operações idempotentes.
6. Tratar pausa, encerramento do processo, retomada e troca de conectividade. Timers JavaScript não garantem execução com o app fechado.
7. Implementar exportação/importação por APIs de arquivos e compartilhamento; esclarecer que desinstalar pode remover dados locais.

Critério de conclusão: tarefas e hábitos continuam corretos após modo avião, reinício, encerramento forçado e atualização do app. Sincronização posterior não duplica nem perde alterações.

### Etapa C — Adaptar a interface móvel

- Priorizar tarefas e hábitos; reduzir o espaço inicial tomado pelo relógio e clima.
- Usar navegação simples e áreas de toque confortáveis, próximas de 48 dp.
- Tratar botão Voltar, teclado virtual, barras do sistema, recortes de tela e orientação.
- Verificar fontes ampliadas, leitor de tela, contraste e movimento reduzido.
- Testar larguras de 320, 360, 390 e 412 px, tablets e paisagem.
- Desabilitar o vídeo por padrão no celular e oferecer fundo estático. O MP4 atual tem aproximadamente 9,52 MB e a imagem 0,88 MB. Conferir origem e direitos de ambos antes de uso comercial.
- Reservar espaço para o anúncio sem cobrir conteúdo, ações, teclado ou navegação.

### Etapa D — Criar o projeto Android

Instalar Android Studio, SDK e JDK nas versões compatíveis com a versão de Capacitor adotada. Manter os pacotes Capacitor na mesma versão principal e revisar requisitos antes de instalar.

Exemplo de comandos futuros, ainda não executados:

```powershell
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
npx cap init
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Configurar `webDir: 'dist'`, nome e `appId`. Empacotar os arquivos locais no aplicativo. Após cada mudança web, reconstruir e sincronizar. Ajustar ícone adaptativo, splash, permissões, versões e SDK alvo.

**Atenção:** as chamadas atuais usam URLs relativas `/api` e `credentials: 'same-origin'`. No frontend empacotado, isso não aponta automaticamente para a API remota. Criar configuração de endereço HTTPS e adaptar autenticação/transporte. Também tratar a inicialização do modo local para não depender de uma API inexistente no dispositivo.

Para o primeiro MVP sem nuvem, isolar completamente as consultas de sessão/integrações remotas. Não depender de um erro de `/api` como estratégia permanente para iniciar offline.

### Etapa E — Google e nuvem, se entrarem no escopo

Esta é uma etapa própria, não apenas a remoção de `ALLOWED_GOOGLE_EMAIL`.

1. Substituir conta única por cadastro e autorização por usuário; manter `sub` como identidade estável.
2. Revisar sessão, credenciais, consultas, backups, operações e integrações para impedir acesso cruzado.
3. Adicionar testes com pelo menos duas contas e tentativas de acessar identificadores de outra conta.
4. Implementar limites de requisição, tratamento de abuso, limpeza de sessões/solicitações expiradas e monitoramento sem conteúdo pessoal.
5. Fazer login/autorização Google no navegador do sistema ou solução nativa apropriada. Google não permite esse OAuth em navegador embutido controlado pelo app. [Regra oficial](https://developers.google.com/identity/protocols/oauth2/native-app).
6. Projetar o retorno ao app por Android App Links e um mecanismo de troca de código descartável validado pelo backend, ou adotar SDK apropriado. O cookie criado no navegador externo não aparece automaticamente na WebView.
7. Não colocar tokens em URLs nem client secret no APK. Preservar validação de estado/PKCE, escopos mínimos e armazenamento seguro da sessão móvel.
8. Escolher o transporte autenticado. Se usar cookies entre origens, revisar CORS, credenciais, SameSite e CSRF; liberar uma origem não resolve sozinho a sessão. Se usar tokens de sessão, proteger armazenamento, expiração, renovação e revogação.
9. Solicitar Calendar/Tasks apenas quando o usuário ativar cada integração. Preparar domínio verificado, política de privacidade e processo de verificação dos escopos aplicáveis. [Verificação OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).
10. Implementar exclusão da conta e dos dados associados, revogação Google e política de retenção de backups. Sair do painel e desconectar Google atualmente não equivalem a excluir conta.

Critério de conclusão: login e reconexão funcionam no Android físico; duas contas não enxergam dados entre si; exclusão remove o que foi prometido; alterações offline sobrevivem ao encerramento do app.

### Etapa F — Lembretes úteis

Implementar notificações locais opcionais para tarefas/hábitos. Pedir permissão no contexto em que a pessoa ativa lembretes, respeitar recusa e explicar horários. Testar após reinício e sob restrições de bateria. Usar agendamento compatível com Android; não basear lembretes em `setInterval`. Não solicitar acesso a alarmes exatos sem necessidade justificada.

## 5. Anúncios leves com AdMob

Para começar, recomendo **um banner adaptativo em uma área definida**, visível no uso normal, afastado de checkboxes e botões. O modo ambiente pode ficar sem anúncio para preservar sua utilidade; medir receita considerando essa escolha.

Evitaria intersticiais ao abrir o app, ao concluir tarefas ou ao marcar hábitos. Essas são ações rápidas e frequentes; interrupções prejudicam o motivo para voltar. A Play restringe anúncios inesperados e interferência no uso. [Política de anúncios](https://support.google.com/googleplay/android-developer/answer/9857753?hl=en).

Implementação:

1. Criar conta AdMob e cadastrar o pacote Android.
2. Escolher integração Capacitor mantida e compatível com o SDK vigente, ou construir uma ponte nativa. Capacitor não inclui anúncios automaticamente.
3. Integrar Google Mobile Ads SDK; configurar App ID e unidade de banner.
4. Integrar consentimento com UMP, respeitando o resultado antes de solicitar anúncios e oferecendo acesso às opções de privacidade quando exigido. [UMP Android](https://developers.google.com/admob/android/privacy).
5. Usar unidades de teste e dispositivos de teste durante desenvolvimento e QA. Nunca clicar nos próprios anúncios nem pedir cliques a amigos/testadores. [Tráfego inválido](https://support.google.com/admob/answer/3342099?hl=en).
6. Mostrar o app normalmente se não houver anúncio, rede ou consentimento aplicável.
7. Publicar `app-ads.txt` com a linha fornecida pelo AdMob no domínio de desenvolvedor informado na loja. Validar acesso público e rastreamento. [Configuração](https://support.google.com/admob/answer/9363762?hl=en-GB).
8. Associar a ficha da loja ao AdMob, concluir verificação e aguardar análise de prontidão. Publicação na Play não garante liberação imediata dos anúncios. [Prontidão](https://support.google.com/admob/answer/10564477?hl=en-GB).
9. Declarar anúncios e dados coletados pelo SDK na Play Console; manter versões e formulários coerentes.

Não enviar títulos de tarefas, hábitos, agenda ou conteúdo Google para publicidade ou eventos analíticos. Métricas podem contar ações e erros sem registrar esses conteúdos. Anúncios não personalizados também exigem avaliação de privacidade e consentimento aplicável.

Uma compra para remover anúncios pode ser uma etapa posterior. Ela exige integração de cobrança, restauração e validação de compras; não faz parte do MVP recomendado.

## 6. Publicação na Google Play

1. Abrir a conta de desenvolvedor e concluir verificações de identidade e dispositivo solicitadas. A taxa de inscrição informada é **US$ 25, uma vez**. [Cadastro](https://support.google.com/googleplay/android-developer/answer/6112435).
2. Criar o app, escolher nome, idioma, categoria e público real.
3. Preparar ícone, capturas reais do Android, arte de destaque, descrição, e-mail de suporte e site de desenvolvedor.
4. Publicar política de privacidade em página pública. Mapear dados locais, login, Google, clima, anúncios, diagnósticos e fornecedores antes de preencher Segurança dos dados.
5. Preencher classificação indicativa, presença de anúncios, público-alvo, acesso ao aplicativo e demais declarações aplicáveis.
6. Se existir criação de conta, disponibilizar caminho de exclusão dentro do app e recurso web externo para solicitação. [Exclusão de conta](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-EN).
7. Gerar **Android App Bundle assinado (`.aab`)**, configurar Play App Signing e guardar a chave de upload com backup seguro. Incrementar `versionCode` em novas versões. [App Bundle](https://developer.android.com/guide/app-bundle).
8. Em 13/10/2026, novos aplicativos Android comuns devem mirar **Android 16/API 36 ou superior**. Isso não obriga o app a rodar somente em Android 16: `minSdk` é outra configuração. [SDK alvo](https://developer.android.com/google/play/requirements/target-sdk).
9. Testar primeiro na faixa interna. Conferir relatório de pré-lançamento e problemas em dispositivos reais.
10. Para contas pessoais criadas depois de 13/11/2023, cumprir teste fechado com **ao menos 12 participantes inscritos continuamente por 14 dias**, depois solicitar acesso à produção. Documentar feedback, uso e correções; o prazo não implica aprovação automática. [Requisitos](https://support.google.com/googleplay/android-developer/answer/14151465).
11. Permitir revisão de todas as funcionalidades. Se login for obrigatório, fornecer acesso e instruções apropriadas; um aplicativo disponível apenas para a sua conta impede a avaliação normal.
12. Publicar gradualmente e acompanhar falhas, ANRs, comentários, desinstalações e receita.

Não há garantia de aprovação por utilizar Capacitor. O resultado precisa oferecer funcionalidades úteis, estabilidade e conformidade, além de abrir uma página web.

## 7. Custos que precisam entrar na conta

| Item | Decisão necessária |
| --- | --- |
| Google Play | US$ 25 de inscrição; considerar conversão e encargos do pagamento |
| Backend | O projeto prevê Vercel; Hobby restringe uso a pessoal não comercial. Escolher plano comercial ou hospedagem alternativa antes de monetizar |
| Banco | Neon: verificar plano, limites, backups e orçamento para o uso previsto |
| Clima | Open-Meteo gratuito é não comercial. Contratar licença, trocar por fornecedor que permita uso comercial ou retirar clima do MVP |
| Domínio/site | Ter páginas públicas de suporte, privacidade e `app-ads.txt` |
| Desenvolvimento | Adaptação, QA em aparelhos, revisão e manutenção têm custo mesmo feitos por você |
| Operação | Atualização de Android/SDKs, suporte, dependências, segurança e correções |

Fontes: [Vercel Hobby](https://vercel.com/docs/plans/hobby) e [licença/preços do Open-Meteo](https://open-meteo.com/en/pricing). Não confirmei qual plano sua conta de hospedagem utiliza. Para clima pago, manter chave no servidor e aproveitar cache quando permitido pelo fornecedor. Preservar a atribuição exigida pela licença dos dados.

Um MVP local sem Google e sem clima pode evitar custos recorrentes de banco/API para as funcionalidades principais. Ainda precisará do site público e da manutenção do aplicativo.

## 8. Quanto isso poderia render?

É possível gerar renda, mas instalar o app não gera receita por si só. O que importa é uso recorrente, impressões efetivamente exibidas e eCPM observado. Um utilitário rápido, com anúncios leves, tende a ter poucas oportunidades de exibição por pessoa.

Modelo de planejamento:

```text
Receita mensal ≈ DAU × 30 × impressões exibidas por usuário/dia × eCPM / 1.000
```

DAU = usuários ativos por dia. eCPM = receita por mil impressões. Usar impressões efetivamente exibidas, não apenas solicitações; se partir de solicitações, considerar preenchimento e taxa de exibição.

**Exemplos puramente hipotéticos**, com 2 impressões por usuário/dia; os eCPMs abaixo não são cotações, médias de mercado nem promessa:

| DAU | Impressões/mês | eCPM R$ 1 | eCPM R$ 3 | eCPM R$ 6 |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 6.000 | R$ 6 | R$ 18 | R$ 36 |
| 500 | 30.000 | R$ 30 | R$ 90 | R$ 180 |
| 1.000 | 60.000 | R$ 60 | R$ 180 | R$ 360 |
| 5.000 | 300.000 | R$ 300 | R$ 900 | R$ 1.800 |

Na hipótese de eCPM R$ 3 e duas impressões diárias, R$ 300/mês brutos exigiriam aproximadamente 1.667 usuários ativos por dia. Se a infraestrutura custar R$ 100/mês, seriam cerca de 556 DAU apenas para cobrir esse custo na mesma hipótese. Valores não descontam tributos, divulgação, manutenção nem seu tempo.

Para planejar renda básica, medir dados reais antes de assumir receita. Mais anúncios podem aumentar receita imediata e reduzir retenção; compras de anúncios para captar usuários podem custar mais do que esses usuários rendem.

Validação sugerida: reunir 15–20 pessoas do público pretendido, observar uso por duas semanas, registrar problemas e verificar quantas voltam espontaneamente. Acompanhar retenção no dia 1/7/30, usuários ativos, tarefas/hábitos usados, falhas e receita por usuário. Fazer divulgação inicialmente com demonstrações curtas e descrição clara do diferencial; ampliar investimento somente com dados.

## 9. Prazo e ordem recomendada

Estimativa técnica minha para alguém familiarizado com React, sem contratação externa; não é orçamento fechado:

| Entrega | Esforço aproximado |
| --- | --- |
| Produto móvel, primeiro acesso e simplificação | 3–6 dias úteis |
| Capacitor, persistência, backup e testes de ciclo de vida | 5–10 dias úteis |
| Lembretes, anúncios de teste e consentimento | 3–6 dias úteis |
| Documentação pública, ficha da loja e QA | 3–5 dias úteis |
| Nuvem pública, sessão móvel e integrações Google, se incluídas | mais 10–20 dias úteis, além de eventuais verificações externas |

MVP local: aproximadamente 3–6 semanas de trabalho concentrado. A janela de teste fechado e as análises externas acrescentam tempo de calendário, com algum trabalho em paralelo. OAuth, revisões ou incompatibilidades de SDK podem ampliar o prazo. Trabalho à noite/fins de semana leva mais semanas.

Ordem que eu adotaria:

1. Tarefas/hábitos locais, visual móvel e backup.
2. Capacitor e validação em Android físico.
3. Lembretes opcionais e correções com testadores.
4. AdMob com banner e consentimento, usando anúncios de teste.
5. Publicação, análise de retenção e custos reais.
6. Google e sincronização somente se forem valorizados pelos usuários.

## 10. Checklist de pronto para lançamento

- [ ] Primeiro uso sem dados falsos confundidos com dados reais.
- [ ] Criação/conclusão de tarefas e hábitos funciona sem internet.
- [ ] Encerramento forçado e atualização não perdem dados.
- [ ] Backup exporta e restaura no Android.
- [ ] Botão Voltar, teclado, fontes ampliadas e leitor de tela testados.
- [ ] Mídias com direitos conferidos e vídeo opcional.
- [ ] Serviços contratados permitem uso comercial.
- [ ] Anúncios de teste em desenvolvimento; produção configurada separadamente.
- [ ] Consentimento, privacidade e Segurança dos dados correspondem aos SDKs usados.
- [ ] `app-ads.txt` acessível e validação AdMob concluída.
- [ ] AAB assinado, API alvo vigente e chave de upload protegida.
- [ ] Teste fechado e acesso à produção concluídos quando exigidos.
- [ ] Revisores conseguem testar todas as funcionalidades.
- [ ] Se houver contas: isolamento, exclusão e reconexão Google validados.
- [ ] Custos, retenção e receita acompanhados após lançamento.

**Decisão recomendada:** avançar com um MVP local em Capacitor, mantendo o investimento inicial baixo. O projeto tem uma base funcional; o próximo marco deve ser provar que outras pessoas querem usá-lo regularmente. A renda por anúncios será consequência dessa frequência de uso e do alcance, com os custos comerciais já considerados.
