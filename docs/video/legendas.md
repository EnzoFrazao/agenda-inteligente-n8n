# Transcrição do vídeo

O vídeo do Agenda Inteligente tem narração em português do Brasil, com voz sintética (gerada por texto), e legendas em português gravadas na imagem; esta é a transcrição.

Os dados (cartazes, eventos e organizações) foram criados para o desenvolvimento do projeto.

## Capítulos

| Tempo | Capítulo |
|---|---|
| 0:00 | O problema e a solução |
| 0:22 | Como foi criada |
| 1:05 | Na prática: caso 1 |
| 1:29 | Quando não sai como o esperado |
| 2:07 | Impacto previsto |
| 2:17 | Fecho |

## Narração e legendas

| Tempo | Narração e legenda |
|---|---|
| 0:00 | Todo evento começa num cartaz. Alguém abre cada um, copia data, hora e local e confere a agenda à mão. |
| 0:07 | Numa conta de exemplo: cinco minutos por cartaz, em cem cartazes, dão mais de oito horas de trabalho repetitivo. |
| 0:14 | Esta automação faz isso sozinha: o cartaz chega por e-mail e vira evento na agenda. E se faltar um dado, ela não inventa. |
| 0:22 | Montei no n8n, em quatro etapas. Primeira: o cartaz chega por e-mail, como imagem anexada. |
| 0:29 | Segunda: a IA lê a imagem e devolve os campos: título, data, horário e local. |
| 0:35 | Terceira: regras em código verificam esses campos e checam se há choque com outro evento. |
| 0:41 | Quarta: o desfecho. Cada e-mail termina em um de quatro resultados: aprovado, conflito, incompleto ou erro. |
| 0:49 | Só depois a automação age: cria o evento quando cabe, registra na planilha e responde a quem enviou. |
| 0:55 | A IA entende. O código confere. Foi a decisão central do projeto: a IA nunca decide sozinha o que entra na agenda. |
| 1:05 | Primeiro caso: um cartaz difícil de ler, com fundo colorido, texto inclinado e data e hora soltas na imagem. |
| 1:12 | A IA lê e devolve título, início, fim e local. As regras confirmam: nada falta e não há choque de horário. |
| 1:20 | O evento entra na Google Agenda, a planilha registra como aprovado, e a resposta volta na mesma conversa. |
| 1:29 | E quando o cartaz não é perfeito? Testei mais três situações. |
| 1:33 | Faltou um dado, como o horário de término? A IA não chuta. Nada é criado, e quem enviou recebe um pedido de novo envio. |
| 1:41 | O horário bate com outro evento? A automação não bloqueia: cria como a confirmar e avisa quem enviou. |
| 1:48 | Esse mesmo cartaz trazia um texto escondido, mandando criar um evento chamado Admin. |
| 1:53 | Isso é prompt injection. O texto é tratado como dado, não como ordem, e o evento Admin não é criado. |
| 1:59 | E o anexo corrompido? Vira erro: nada é criado, e quem enviou é avisado para reenviar. |
| 2:07 | O impacto previsto: na conta de exemplo, mais de oito horas voltam para a pessoa. |
| 2:13 | Só sobra decidir o que ficou a confirmar. |
| 2:17 | Esse foi o Agenda Inteligente, do Enzo Frazão. Você encontra o projeto completo no portfólio e no GitHub. |
