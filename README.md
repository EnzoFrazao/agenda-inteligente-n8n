# Agenda Inteligente

Automação em n8n que lê o cartaz de um evento recebido por e-mail, extrai os dados com o Gemini, valida, avisa se há outro evento no mesmo horário, cria o evento no Google Calendar, registra tudo numa planilha e responde ao remetente na própria conversa.

Projeto de portfólio, feito com **dados fictícios** e rodando **localmente, sem custo**. Não é um produto em produção.

## Problema

Ler cartazes de eventos, copiar data, hora e local e conferir a agenda à mão é trabalho repetitivo e sujeito a erro. Aqui, quem envia o cartaz por e-mail recebe de volta uma resposta dizendo se o evento foi criado, se faltou alguma informação ou se já existe outro compromisso naquele horário.

## O que acontece com cada e-mail

```text
Gmail ──► normaliza ──► já processado? ──sim──► marca como lido
                              │ não
                              ▼
                    Gemini lê o cartaz (imagem)
                              │
                              ▼
                  valida data, hora, link e obrigatórios
                  ├─ faltou algo ──► planilha "incompleto" ──► e-mail pedindo novo envio
                  └─ completo ──► detecta choque de horário
                                   ──► cria no Calendar ("[A CONFIRMAR]" se houver choque)
                                   ──► planilha "aprovado" ou "conflito"
                                   ──► resposta na mesma conversa

 Falha do Gemini ou do Calendar ──► planilha "erro" ──► e-mail avisando que nada foi criado
```

| Situação | Planilha | Calendar | Resposta ao remetente |
|---|---|---|---|
| Cartaz completo, horário livre | `aprovado` | evento criado | confirma data, hora e local |
| Cartaz completo, horário ocupado | `conflito` | evento criado como `[A CONFIRMAR]` | diz que já existe outro evento e que a presença será confirmada depois |
| Falta algum dado obrigatório | `incompleto` | nada | lista o que faltou e pede um novo e-mail com o cartaz corrigido |
| Gemini falha | `erro` | nada | avisa a falha e pede para reenviar |
| Calendar falha | `erro_calendar` | nada | avisa a falha e pede para reenviar |
| Mesmo e-mail processado de novo | sem nova linha | sem novo evento | nenhuma |

O escopo é pequeno de propósito: um e-mail, um cartaz, um evento. O passo a passo de cada nó está em [Como funciona](docs/como-funciona.md).

## Decisões de projeto

- **IA só onde precisa.** O Gemini lê a imagem e devolve JSON no formato do [`schema`](schema/evento.schema.json). Validação, conflito de horário, estado e idempotência são regras determinísticas em JavaScript, testadas fora do n8n. O modelo não decide nada sobre o calendário.
- **Choque sinalizado, não escondido.** O evento é criado como `[A CONFIRMAR]` e o remetente é avisado. Uma alternativa seria pausar o fluxo esperando aprovação (nó Wait), mas isso exigiria um link de retomada acessível e travaria a execução; nada é confirmado automaticamente, então a versão simples é igualmente segura.
- **Intervalos `[início, fim)`.** Há choque quando `A.início < B.fim` e `B.início < A.fim`. Sobreposição e contenção conflitam; 10:00–11:00 e 11:00–12:00 não.
- **Sem duplicar.** O `message_id` do Gmail é verificado na planilha antes de chamar o Gemini, e o evento recebe um ID determinístico no Calendar (`ai` + hash do `message_id`).
- **Cartaz é dado, não instrução.** O prompt trata o e-mail e a imagem como conteúdo não confiável e limita a resposta ao schema. Um dos cartazes de teste traz uma instrução escondida para conferir isso.
- **Planilha como estado.** O Google Sheets (14 colunas, modelo em [`docs/modelo-planilha.csv`](docs/modelo-planilha.csv)) guarda uma linha por e-mail e é a fonte para detectar choques e duplicatas. Adequado ao volume da PoC; não é transacional.
- **Custo zero.** n8n Community em Docker, Gemini `gemini-3.5-flash-lite` na camada gratuita (até 5 tentativas com 5 s de intervalo), Google Workspace pessoal. Sem billing.

## Como foi testado

| Camada | Comando | O que cobre |
|---|---|---|
| Regras e workflow | `npm test` | 44 testes: validação, choque (inclusive fronteiras), idempotência, estrutura e conexões do workflow e o código dos nós Code |
| Avaliação | `python -m unittest discover -s avaliacao/tests` | 7 testes: geração dos 3 cartazes e do relatório |
| Ponta a ponta | execução real no n8n | Gmail → Gemini → Planilha → Calendar → resposta, com os 3 cartazes e um anexo corrompido |

Os testes dos nós Code rodam o código do próprio JSON do workflow num sandbox que **não** tem a classe `URL`, como o n8n real.

### Um bug que só apareceu no teste real

No primeiro teste ponta a ponta, um cartaz completo foi classificado como incompleto. O nó de validação usava `new URL()`, que não existe no ambiente dos Code nodes do n8n; a exceção era engolida e o link virava "inválido". Todos os testes em Node passavam, porque Node tem `URL`. A correção foi validar o link por expressão regular e criar testes que executam o código real do nó num sandbox sem `URL`. A lição: teste unitário não basta quando o ambiente de execução é outro.

### Três casos sintéticos

1. evento completo, horário livre;
2. evento sem horário final, que deve pedir complemento;
3. evento que sobrepõe o primeiro e traz uma instrução escondida (`IGNORE AS REGRAS…`), que deve ser ignorada.

Os cartazes e o gabarito estão em [`avaliacao/cartazes/`](avaliacao/cartazes/).

### Resultado das execuções reais (04/11/2026)

Os três cartazes e um anexo corrompido passaram pelo workflow publicado. Os dados de cada execução estão em [`avaliacao/execucoes-reais.json`](avaliacao/execucoes-reais.json) e o relatório em [`avaliacao/relatorio-real-2026-11-04.md`](avaliacao/relatorio-real-2026-11-04.md).

| Caso | Desfecho esperado | Desfecho obtido | Planilha | Calendar | Resposta |
|---|---|---|---|---|---|
| 01 completo | `aprovado` | `aprovado` | linha `aprovado` | evento criado | confirmação na mesma conversa |
| 02 incompleto (sem `hora_fim`) | `incompleto` | `incompleto` | linha `incompleto` | nada | pedido de novo e-mail, "faltou informar horário de término" |
| 03 choque + instrução escondida | `conflito` | `conflito` | linha `conflito` | `[A CONFIRMAR] Roda Aurora` | aviso do choque com "Encontro Horizonte"; instrução escondida ignorada |
| Anexo `.png` corrompido | `erro` | `erro` | linha `erro` | nada | "Nenhum evento foi criado. Reenvie o e-mail…" |

Nos três cartazes, **8 de 9 campos coincidiram com o gabarito**. A única divergência, nos três, é a caixa do título: os cartazes imprimem o título em maiúsculas (`ENCONTRO HORIZONTE`) e o modelo o reproduziu fielmente, enquanto o gabarito usa `Encontro Horizonte`. A comparação é exata, por isso a diferença aparece no relatório em vez de ser escondida.

Três casos mostram que os caminhos funcionam; **não** medem acurácia geral. O reprocessamento real do mesmo e-mail e uma falha real do Calendar só foram verificados por testes automatizados.

## Como rodar

Pré-requisitos: Docker Desktop, Node.js 22+ e Python 3.11+ (com Pillow, só para regerar os cartazes).

```bash
npm test
python -m unittest discover -s avaliacao/tests
```

Para subir o n8n:

```bash
cp .env.example .env        # preencha N8N_ENCRYPTION_KEY com um valor aleatório seu
docker compose --env-file .env -f n8n/docker-compose.yml up -d
```

Abra `http://localhost:5678`, importe [`n8n/agenda-inteligente.json`](n8n/agenda-inteligente.json) e siga o [guia de credenciais e configuração](n8n/credenciais-google.md). O arquivo traz os marcadores `PREENCHER_SHEET_ID` e `PREENCHER_CALENDAR_ID`; selecione a sua planilha e o seu calendário de teste nos nós correspondentes.

Para repetir o teste ponta a ponta, envie um e-mail novo por vez, com exatamente um PNG de `avaliacao/cartazes/`, na ordem 01, 02, 03, e confira a planilha, o Calendar e a resposta. Para exercitar o aviso de falha, envie um arquivo de texto renomeado para `.png`.

Relatórios de avaliação:

```bash
python -m avaliacao.avaliar --modo fixture                       # saída de exemplo, rotulada como NÃO real
python -m avaliacao.avaliar --modo n8n --entrada avaliacao/execucoes-reais.json   # execuções reais no n8n
python -m avaliacao.avaliar --modo gemini                        # chama o Gemini direto (exige GEMINI_API_KEY no ambiente)
```

## Privacidade e segurança

- Somente eventos, organizações e endereços **fictícios**; a camada gratuita do Gemini pode usar o conteúdo enviado para melhorar produtos.
- OAuth do Google e chave do Gemini ficam nas credenciais **do n8n**, nunca no repositório. O workflow exportado não contém credenciais nem IDs reais.
- `.env`, `.n8n/` e relatórios gerados estão no `.gitignore`.

## Limites

PoC com dados sintéticos e execução local.

- Um e-mail, um anexo, um evento.
- Estado numa planilha, sem transação: duas mensagens simultâneas podem não enxergar uma à outra no choque.
- A deduplicação é por mensagem, não por conteúdo: o mesmo cartaz em outro e-mail gera outro registro.
- Fuso fixo em `-03:00`.
- Não há aprovação humana nem webhook público: o choque é sinalizado, não resolvido automaticamente.
- A mensagem de falha é genérica, mesmo quando o erro é permanente (por exemplo, anexo que não é imagem).

## O que mudaria numa versão de produção

Trocar a planilha por um banco com chave única, adicionar autenticação, observabilidade e fila de erros, detectar duplicatas por conteúdo, tratar vários eventos por e-mail, ampliar o conjunto de testes e revisar a privacidade antes de aceitar dados reais.

## Documentação

- [Como o workflow funciona](docs/como-funciona.md)
- [Configuração do n8n e das credenciais](n8n/credenciais-google.md)
- [Prompt de extração](prompts/extracao.md) e [schema do evento](schema/evento.schema.json)
