# Como funciona

O workflow tem 22 nós. Ele é gerado por `scripts/gerar-workflow.mjs`; o contrato está em [`specs/capabilities/core.md`](../specs/capabilities/core.md).

## Entrada e deduplicação

O Gmail Trigger busca mensagens **não lidas com anexo** (`has:attachment`), uma vez por minuto. `Normalizar mensagem` exige exatamente um anexo e guarda o identificador do Gmail como `message_id`. `Ler agenda` e `Analisar agenda` procuram esse `message_id` na planilha **antes** de chamar o Gemini: se já existe, o e-mail só é marcado como lido.

## Extração

`Preparar Gemini` junta o prompt versionado (`prompts/extracao.md`), o corpo do e-mail e a imagem. `Chamar Gemini` usa saída JSON estruturada conforme `schema/evento.schema.json`, com até 5 tentativas espaçadas de 5 s (erro temporário, como o 503, não gera cobrança na camada gratuita). O prompt define e-mail e cartaz como dados não confiáveis e pede ao modelo para converter datas `DD/MM/AAAA` em `AAAA-MM-DD` e horários `15h` em `15:00`.

## Validação

`Validar evento` normaliza datas, horas e o link (por expressão regular, porque a classe `URL` não existe no Code node do n8n) e confere os campos obrigatórios: título, data e hora de início, data e hora de fim e local. Fim igual ou anterior ao início também reprova. Quando algo falta, `resumo_pendencias` descreve o problema em português para o e-mail.

- **incompleto:** grava `incompleto` na planilha e responde pedindo um **novo e-mail** com o cartaz corrigido (uma resposta sem anexo seria ignorada pelo filtro do trigger). Nenhum evento é criado.
- **completo:** segue para a detecção de choque.

## Choque e Calendar

Os intervalos são semiabertos:

```text
A conflita com B quando A.início < B.fim e B.início < A.fim
```

Entram na comparação as linhas da planilha com status `aprovado` ou `conflito`. O choque **não bloqueia**: `Criar no Calendar` cria o evento com título `[A CONFIRMAR] <título>` e descrição indicando com quem se sobrepõe. Sem choque, o título é o do cartaz. O ID do evento é determinístico (`ai` + hash do `message_id`), então uma recuperação não cria um segundo evento.

## Registro e resposta

`Registrar aprovado` faz um `append` com o status `aprovado` (ou `conflito`, se houve sobreposição), os campos do evento, os títulos em conflito e o ID do Calendar. `Responder sucesso` responde na mesma conversa do Gmail: no caso normal, confirma data, hora e local; no choque, avisa que já havia outro evento naquele dia e horário, que o evento ficou como "a confirmar" e que a presença será confirmada depois. Em seguida, `Marcar como lido` impede que o trigger reprocesse a mensagem.

## Falhas

- Gemini com erro após as tentativas, resposta inválida ou falha ao preparar a chamada: `Preparar erro Gemini` → `Registrar erro` (status `erro`) → `Avisar falha`.
- Calendar com erro: `Preparar erro Calendar` → `Registrar erro Calendar` (status `erro_calendar`) → `Avisar falha`.
- `Avisar falha` responde: "Não consegui processar o seu cartaz agora… Nenhum evento foi criado. Reenvie o e-mail em alguns minutos". O reenvio é um e-mail novo, com outro `message_id`.

Todos os ramos terminam em `Marcar como lido` e `Finalizar`.

## Estados

| Status | Significado |
|---|---|
| `aprovado` | evento criado, sem choque |
| `conflito` | evento criado como `[A CONFIRMAR]` porque se sobrepõe a outro |
| `incompleto` | falta pelo menos um campo obrigatório; nada foi criado |
| `erro` | falha na extração ou na preparação; nada foi criado |
| `erro_calendar` | extração e validação passaram, mas o Calendar falhou |

## Limitações

- Um e-mail, um anexo, um evento.
- O estado fica numa planilha (adequado ao volume da PoC, sem transação). Duas mensagens simultâneas podem não enxergar uma à outra no choque.
- Reenviar o mesmo cartaz em outro e-mail gera outro registro: a deduplicação é por mensagem, não por conteúdo.
- O fuso é fixo em `-03:00` (América/Fortaleza).
