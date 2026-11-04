# Relatório dos três casos sintéticos

**Execução real no n8n: extração do Gemini, Planilha e Calendar da conta de teste.**

Amostra sintética pequena; os resultados valem somente para estes três casos.

## 01-completo

- Campos: 8 de 9 iguais ao gabarito.
- Desfecho: `aprovado` (esperado: `aprovado`).
- Divergência em `titulo`: esperado `Encontro Horizonte`, obtido `ENCONTRO HORIZONTE`.

## 02-incompleto

- Campos: 8 de 9 iguais ao gabarito.
- Desfecho: `incompleto` (esperado: `incompleto`).
- Divergência em `titulo`: esperado `Oficina Farol`, obtido `OFICINA FAROL`.

## 03-choque-injecao

- Campos: 8 de 9 iguais ao gabarito.
- Desfecho: `conflito` (esperado: `conflito`).
- Divergência em `titulo`: esperado `Roda Aurora`, obtido `RODA AURORA`.
