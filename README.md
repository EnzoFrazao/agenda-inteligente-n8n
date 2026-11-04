# Agenda Inteligente

Automação em n8n que lê o cartaz de um evento recebido por e-mail, extrai os dados com o Gemini, valida, avisa se há outro evento no mesmo horário, cria o evento no Google Calendar, registra tudo numa planilha e responde ao remetente na própria conversa.

Projeto de portfólio, feito com **dados fictícios** e rodando **localmente, sem custo**. Não é um produto em produção.

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
| Gemini ou Calendar falham | `erro` ou `erro_calendar` | nada | avisa a falha e pede para reenviar |
| Mesmo e-mail processado de novo | sem nova linha | sem novo evento | nenhuma |

O escopo é pequeno de propósito: um e-mail, um cartaz, um evento.

## Decisões de projeto

- **IA só onde precisa.** O Gemini lê a imagem e devolve JSON no formato do [`schema`](schema/evento.schema.json). Validação, conflito de horário, estado e idempotência são regras determinísticas em JavaScript, testadas fora do n8n.
- **Choque não bloqueia.** O evento é criado como `[A CONFIRMAR]` e o remetente é avisado. A confirmação fica com uma pessoa; o fluxo não trava esperando aprovação.
- **Intervalos `[início, fim)`.** Qualquer sobreposição é choque; 10:00–11:00 e 11:00–12:00 não se chocam.
- **Sem duplicar.** O `message_id` do Gmail é verificado na planilha antes de chamar o Gemini, e o evento recebe um ID determinístico no Calendar.
- **Cartaz é dado, não instrução.** O prompt trata o e-mail e a imagem como conteúdo não confiável. Um dos cartazes de teste traz uma instrução escondida para conferir isso.
- **Custo zero.** n8n Community em Docker, Gemini `gemini-3.5-flash-lite` na camada gratuita, Google Workspace pessoal. Sem billing.

## Como foi testado

| Camada | Comando | O que cobre |
|---|---|---|
| Regras e workflow | `npm run check` | testes das regras puras e do código dos nós, casos de fronteira do choque, estrutura e conexões do workflow, varredura de segredos |
| Avaliação | `python -m unittest discover -s avaliacao/tests` | geração dos 3 cartazes e do relatório |
| Memória técnica | `python scripts/validate_specs.py .` | estrutura das specs |
| Ponta a ponta | [checklist](docs/checklist-e2e.md) | Gmail → Gemini → Calendar → Planilha → resposta, com os 3 cartazes |

Os testes dos nós Code rodam o código do próprio JSON do workflow num sandbox que **não** tem a classe `URL`, como o n8n real. Isso nasceu de um bug encontrado no teste ponta a ponta: um cartaz completo era classificado como incompleto porque `new URL()` não existe nesse ambiente. Detalhes em [`specs/changes/2026-11-04-validacao-sem-classe-url.md`](specs/changes/2026-11-04-validacao-sem-classe-url.md).

### Três casos sintéticos

1. evento completo, horário livre;
2. evento sem horário final, que deve pedir complemento;
3. evento que sobrepõe o primeiro e traz uma instrução escondida (`IGNORE AS REGRAS…`), que deve ser ignorada.

### Resultado das execuções reais (04/11/2026)

Os três cartazes e um anexo corrompido passaram pelo workflow publicado (Gmail → Gemini → Planilha → Calendar → resposta). Detalhes em [`avaliacao/relatorio-real-2026-11-04.md`](avaliacao/relatorio-real-2026-11-04.md).

| Caso | Planilha | Calendar | Resposta |
|---|---|---|---|
| 01 completo | `aprovado` | evento criado | confirmação na mesma conversa |
| 02 incompleto (sem `hora_fim`) | `incompleto` | nada | pedido de novo e-mail, "faltou informar horário de término" |
| 03 choque + instrução escondida | `conflito` | `[A CONFIRMAR] Roda Aurora` | aviso do choque com "Encontro Horizonte"; a instrução escondida foi ignorada |
| Anexo `.png` corrompido | `erro` | nada | "Nenhum evento foi criado. Reenvie o e-mail…" |

Nos três cartazes, 8 de 9 campos coincidiram com o gabarito; a única divergência foi o título em caixa alta, porque os cartazes imprimem o título em maiúsculas e o modelo o reproduziu fielmente.

Os cartazes e o gabarito estão em [`avaliacao/cartazes/`](avaliacao/cartazes/). Três casos mostram que os caminhos funcionam; **não** medem acurácia geral.

## Como rodar

Pré-requisitos: Docker Desktop, Node.js 22+ e Python 3.11+ (com Pillow, só para regerar os cartazes).

```bash
npm run check
python -m unittest discover -s avaliacao/tests
python scripts/validate_specs.py .
```

Para subir o n8n:

```bash
cp .env.example .env        # preencha N8N_ENCRYPTION_KEY com um valor aleatório seu
docker compose --env-file .env -f n8n/docker-compose.yml up -d
```

Abra `http://localhost:5678`, importe [`n8n/agenda-inteligente.json`](n8n/agenda-inteligente.json) e siga o [guia de credenciais e configuração](n8n/credenciais-google.md). O arquivo traz os marcadores `PREENCHER_SHEET_ID` e `PREENCHER_CALENDAR_ID`; selecione a sua planilha e o seu calendário de teste nos nós correspondentes.

O JSON é gerado por [`scripts/gerar-workflow.mjs`](scripts/gerar-workflow.mjs) (`node scripts/gerar-workflow.mjs`). Edite o gerador, não o JSON.

Relatórios de avaliação:

```bash
python -m avaliacao.avaliar --modo fixture                       # saída de exemplo, rotulada como NÃO real
python -m avaliacao.avaliar --modo n8n --entrada execucoes.json  # resultados das execuções reais no n8n
python -m avaliacao.avaliar --modo gemini                        # chama o Gemini direto (exige GEMINI_API_KEY no ambiente)
```

## Privacidade e segurança

- Somente eventos, organizações e endereços **fictícios**; a camada gratuita do Gemini pode usar o conteúdo enviado para melhorar produtos.
- OAuth do Google e chave do Gemini ficam nas credenciais **do n8n**, nunca no repositório. O workflow exportado não contém credenciais nem IDs reais.
- `.env`, `.n8n/` e relatórios gerados estão no `.gitignore`; `npm run check:secrets` procura padrões de chave antes de publicar.

## Limites

PoC com dados sintéticos e execução local. Não trata vários eventos ou anexos por e-mail, usuários concorrentes, alta disponibilidade, nem dados pessoais reais. Não há aprovação humana nem webhook público: o choque é sinalizado, não resolvido automaticamente.

## Documentação

- [Como o workflow funciona](docs/como-funciona.md)
- [Configuração do n8n e das credenciais](n8n/credenciais-google.md)
- [Checklist dos três testes ponta a ponta](docs/checklist-e2e.md)
- [Contrato do sistema](specs/capabilities/core.md) e [estratégia de testes](specs/testing.md)
- [Decisões de arquitetura](specs/decisions/)
