# Configuração gratuita do workflow (22 nós)

Este guia parte do workflow recém-importado e termina com todos os nós prontos para o primeiro teste real. Use somente uma conta Google dedicada e os cartazes fictícios do projeto.

## Regras de segurança antes de começar

- Não habilite billing, não cadastre cartão e não aceite teste pago. Se alguma tela exigir cobrança, pare.
- Não envie Client Secret, token OAuth ou chave do Gemini por chat, Git, print ou vídeo.
- Digite segredos apenas nos formulários de credenciais do n8n.
- A camada gratuita do Gemini pode usar o conteúdo para melhorar produtos; envie somente os dados fictícios do projeto.

## 1. Recursos de teste

1. Entre na conta Google dedicada.
2. Crie uma planilha `Agenda Inteligente — Estado` e renomeie a primeira aba para `eventos`.
3. Na célula A1, cole esta linha (mantenha a ordem e não acrescente colunas):

```text
message_id	titulo	inicio_iso	fim_iso	local	descricao	organizacao	link_inscricao	conflitos	status	erro	calendar_event_id	criado_em	atualizado_em
```

O mesmo cabeçalho está em [`docs/modelo-planilha.csv`](../docs/modelo-planilha.csv).

4. Crie no Google Calendar um calendário `Agenda Inteligente — Teste`. **Nunca use seu calendário pessoal.**

## 2. Projeto Google Cloud sem billing

1. No Google Cloud Console, crie um projeto separado (por exemplo `agenda-inteligente-poc`) e confirme que **não há conta de faturamento vinculada**.
2. Habilite exatamente: Gmail API, Google Sheets API, Google Drive API e Google Calendar API.
3. Em **Google Auth Platform**, configure o branding com um nome local e o e-mail da conta dedicada; em **Audience**, escolha **External** e deixe em **Testing**; adicione a conta dedicada em **Test users**.
4. Em **Clients**, crie um cliente **Web application**.
5. No n8n, comece a criar uma credencial Google OAuth2 e copie a **OAuth Redirect URL** (na instalação local: `http://localhost:5678/rest/oauth2-credential/callback`). Cole-a, sem alterações, em **Authorized redirect URIs**.
6. Guarde Client ID e Client Secret num gerenciador seguro, fora do projeto.

> Em modo Testing, a autorização pode expirar em sete dias. Se ocorrer, reconecte a credencial, sem habilitar billing.

## 3. Credenciais no n8n

Em `http://localhost:5678/home/credentials`, crie quatro credenciais separadas:

| Credencial | Nome sugerido | Observação |
|---|---|---|
| Gmail OAuth2 API | `Gmail — Agenda Inteligente` | Client ID/Secret do passo 2; entrar com a conta dedicada |
| Google Sheets OAuth2 API | `Sheets — Agenda Inteligente` | mesmo Client ID/Secret |
| Google Calendar OAuth2 API | `Calendar — Agenda Inteligente` | mesmo Client ID/Secret |
| Header Auth | `Gemini — Agenda Inteligente` | **Name:** `x-goog-api-key`; **Value:** chave criada no Google AI Studio, na camada gratuita |

Se o AI Studio pedir cartão ou billing, pare. Apague qualquer cópia temporária da chave.

## 4. Importar e conferir

1. Importe `n8n/agenda-inteligente.json`. O workflow deve mostrar **22 nós**.
2. Não altere código, expressões, nomes ou conexões; preencha somente credenciais e seletores.
3. Salve após cada grupo.

## 5. Nós que precisam de configuração

**Gmail (5 nós)** — credencial `Gmail — Agenda Inteligente`:

- `Receber cartaz`: poll a cada minuto; Simplify desligado; Read Status = unread; Search = `has:attachment`; Download Attachments ligado.
- `Pedir complemento`, `Responder sucesso`, `Avisar falha`: Message / Reply. Preserve as expressões.
- `Marcar como lido`: Message / Mark as Read.

**Google Sheets (5 nós)** — credencial `Sheets — Agenda Inteligente`; documento `Agenda Inteligente — Estado` e aba `eventos` (isso substitui `PREENCHER_SHEET_ID`):

- `Ler agenda`: Get Row(s), sem filtros; **Always Output Data** deve permanecer ligado (sem isso, a planilha vazia interrompe o fluxo).
- `Registrar incompleto`, `Registrar aprovado`, `Registrar erro`, `Registrar erro Calendar`: Append Row. Se o n8n pedir, recarregue o schema da planilha e preserve os mapeamentos.

**Google Calendar (1 nó)** — credencial `Calendar — Agenda Inteligente`:

- `Criar no Calendar`: Event / Create; selecione `Agenda Inteligente — Teste` (isso substitui `PREENCHER_CALENDAR_ID`). Preserve início, fim, título, descrição, local e o ID determinístico.

**HTTP (1 nó)** — `Chamar Gemini`: Generic Credential Type → Header Auth → `Gemini — Agenda Inteligente`. Método, URL, corpo, timeout (120 s) e tentativas (5, a cada 5 s) já estão definidos. Nunca cole a chave na URL ou no corpo.

**Sem configuração (10 nós)** — `Normalizar mensagem`, `Analisar agenda`, `Mensagem nova?`, `Preparar Gemini`, `Validar evento`, `Evento completo?`, `Detectar choque`, `Preparar erro Gemini`, `Preparar erro Calendar` e `Finalizar`. Não edite.

## 6. Checklist antes de ativar

- [ ] 22 nós, sem conexões soltas e sem triângulo vermelho.
- [ ] Os 5 nós Sheets apontam para a mesma planilha e aba `eventos`.
- [ ] Todos os nós Gmail usam a conta dedicada.
- [ ] `Chamar Gemini` usa Header Auth; a chave não aparece em URL ou corpo.
- [ ] O calendário selecionado é o de teste.
- [ ] A planilha tem as 14 colunas na ordem indicada.

## 7. Teste real

O Gmail Trigger não recebe upload manual pelo canvas. Para cada caso:

1. Publique o workflow e mantenha Docker/n8n abertos.
2. Envie **um novo e-mail** para a caixa dedicada com exatamente um PNG de `avaliacao/cartazes/`, na ordem `01-completo`, `02-incompleto`, `03-choque-injecao`.
3. Aguarde até um minuto pelo trigger.
4. Confira a linha na planilha, o evento no Calendar e a resposta na mesma conversa. Os resultados esperados estão na tabela de resultados do [README](../README.md#resultado-das-execuções-reais-04112026).

Para exercitar o aviso de falha sem custo, envie um anexo `.png` corrompido (um arquivo de texto renomeado).

## 8. Problemas comuns

- `redirect_uri_mismatch`: copie de novo a URL do n8n e compare protocolo, host, porta e caminho.
- `Access blocked`: confirme External/Testing e a conta em Test users.
- Autorização expirou: reconecte a credencial.
- Planilha não aparece: confirme Sheets API **e** Drive API, depois reconecte Sheets.
- Colunas não aparecem: confira a aba `eventos`, a linha A1 e use Refresh Fields.
- O primeiro evento não avança: confirme **Always Output Data** em `Ler agenda`.
- HTTP 429 ou 503 do Gemini: o fluxo tenta de novo até 5 vezes; se persistir, avisa o remetente. Não habilite billing.

## Referências oficiais

- [OAuth Google no n8n auto-hospedado](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/)
- [Tela de consentimento Google](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Structured output do Gemini](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- [Preços e camada gratuita do Gemini](https://ai.google.dev/gemini-api/docs/pricing)
