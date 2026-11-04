import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const carregar = async () => JSON.parse(await readFile(new URL('../n8n/agenda-inteligente.json', import.meta.url)));

test('workflow possui id estável exigido pelo importador atual do n8n', async () => {
  const workflow = await carregar();
  assert.match(workflow.id, /^[A-Za-z0-9_-]{8,}$/);
});

test('workflow contém o caminho completo aprovado', async () => {
  const workflow = await carregar();
  assert.equal(workflow.nodes.length, 22);
  const nomes = new Set(workflow.nodes.map((node) => node.name));
  for (const nome of [
    'Receber cartaz', 'Normalizar mensagem', 'Preparar Gemini', 'Chamar Gemini',
    'Validar evento', 'Evento completo?', 'Ler agenda', 'Analisar agenda',
    'Mensagem nova?', 'Criar no Calendar', 'Registrar aprovado', 'Finalizar'
  ]) assert.equal(nomes.has(nome), true, `nó ausente: ${nome}`);
});

test('todas as conexões apontam para nós existentes', async () => {
  const workflow = await carregar();
  const nomes = new Set(workflow.nodes.map((node) => node.name));
  for (const [origem, grupos] of Object.entries(workflow.connections)) {
    assert.equal(nomes.has(origem), true, `origem inexistente: ${origem}`);
    for (const saidas of Object.values(grupos)) {
      for (const ramo of saidas) for (const conexao of ramo ?? []) {
        assert.equal(nomes.has(conexao.node), true, `destino inexistente: ${conexao.node}`);
      }
    }
  }
});

test('workflow não incorpora credenciais ou segredos', async () => {
  const workflow = await carregar();
  const texto = JSON.stringify(workflow);
  assert.equal(texto.includes('"credentials"'), false);
  assert.doesNotMatch(texto, /AIza[0-9A-Za-z_-]{20,}/);
  assert.match(texto, /PREENCHER_SHEET_ID/);
  assert.match(texto, /PREENCHER_CALENDAR_ID/);
});

test('prompt e schema do workflow são as fontes versionadas', async () => {
  const workflow = await carregar();
  const prompt = await readFile(new URL('../prompts/extracao.md', import.meta.url), 'utf8');
  const schema = JSON.parse(await readFile(new URL('../schema/evento.schema.json', import.meta.url), 'utf8'));
  const preparar = workflow.nodes.find((node) => node.name === 'Preparar Gemini');
  assert.match(preparar.parameters.jsCode, new RegExp(JSON.stringify(prompt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(preparar.parameters.jsCode, new RegExp(JSON.stringify(schema).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('falhas de Gemini e Calendar têm saídas explícitas', async () => {
  const workflow = await carregar();
  const gemini = workflow.nodes.find((node) => node.name === 'Chamar Gemini');
  const calendar = workflow.nodes.find((node) => node.name === 'Criar no Calendar');
  assert.equal(gemini.onError, 'continueErrorOutput');
  assert.equal(calendar.onError, 'continueErrorOutput');
  assert.equal(workflow.connections['Chamar Gemini'].main.length, 2);
  assert.equal(workflow.connections['Criar no Calendar'].main.length, 2);
});

test('chamada ao Gemini repete falhas transitórias de forma limitada', async () => {
  const workflow = await carregar();
  const gemini = workflow.nodes.find((node) => node.name === 'Chamar Gemini');
  assert.equal(gemini.retryOnFail, true);
  assert.equal(gemini.maxTries, 5);
  assert.equal(gemini.waitBetweenTries, 5000);
  assert.equal(gemini.parameters.options.timeout, 120000);
});

test('preparação usa modelo multimodal estável de menor latência', async () => {
  const workflow = await carregar();
  const preparar = workflow.nodes.find((node) => node.name === 'Preparar Gemini');
  assert.match(preparar.parameters.jsCode, /modelo: 'gemini-3\.5-flash-lite'/);
});

test('deduplicação acontece antes de qualquer chamada ao Gemini', async () => {
  const workflow = await carregar();
  assert.equal(workflow.connections['Normalizar mensagem'].main[0][0].node, 'Ler agenda');
  assert.equal(workflow.connections['Ler agenda'].main[0][0].node, 'Analisar agenda');
  assert.equal(workflow.connections['Analisar agenda'].main[0][0].node, 'Mensagem nova?');
  assert.equal(workflow.connections['Mensagem nova?'].main[0][0].node, 'Preparar Gemini');
  assert.equal(workflow.connections['Mensagem nova?'].main[1][0].node, 'Marcar como lido');
});

test('planilha vazia ainda permite analisar a primeira mensagem', async () => {
  const workflow = await carregar();
  const lerAgenda = workflow.nodes.find((node) => node.name === 'Ler agenda');
  assert.equal(lerAgenda.alwaysOutputData, true);
});

test('deduplicação preserva o binário do cartaz para a preparação do Gemini', async () => {
  const workflow = await carregar();
  const analisar = workflow.nodes.find((node) => node.name === 'Analisar agenda');
  assert.match(analisar.parameters.jsCode, /const original = \$\('Normalizar mensagem'\)\.first\(\);/);
  assert.match(analisar.parameters.jsCode, /binary:\s*original\.binary/);
});

test('nós de escrita no Sheets preservam schema e valores mapeados', async () => {
  const workflow = await carregar();
  const escritores = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.googleSheets' && node.parameters.operation !== 'read');
  for (const node of escritores) {
    assert.equal(node.parameters.columns.schema.length, 14, `schema incompleto em ${node.name}`);
    assert.ok(Object.keys(node.parameters.columns.value).length > 0, `mapeamento vazio em ${node.name}`);
  }
});

test('binário do cartaz é lido pelo helper compatível com todos os modos de armazenamento', async () => {
  const workflow = await carregar();
  const preparar = workflow.nodes.find((node) => node.name === 'Preparar Gemini');
  assert.match(preparar.parameters.jsCode, /this\.helpers\.getBinaryDataBuffer/);
  assert.doesNotMatch(preparar.parameters.jsCode, /\$helpers\.getBinaryDataBuffer/);
});

test('payload do Gemini usa apenas opções atuais e remove palavras não suportadas do schema', async () => {
  const workflow = await carregar();
  const preparar = workflow.nodes.find((node) => node.name === 'Preparar Gemini');
  assert.doesNotMatch(preparar.parameters.jsCode, /temperature\s*:/);
  assert.match(preparar.parameters.jsCode, /\$schema/);
  assert.match(preparar.parameters.jsCode, /pattern/);
  assert.match(preparar.parameters.jsCode, /schemaGemini/);
});

test('validação embutida recusa datas impossíveis e possui saída de erro explícita', async () => {
  const workflow = await carregar();
  const validar = workflow.nodes.find((node) => node.name === 'Validar evento');
  assert.match(validar.parameters.jsCode, /getUTCFullYear/);
  assert.equal(validar.onError, 'continueErrorOutput');
  assert.equal(workflow.connections['Validar evento'].main.length, 2);
});

test('evento completo é registrado por append após criar no Calendar', async () => {
  const workflow = await carregar();
  assert.equal(workflow.connections['Detectar choque'].main[0][0].node, 'Criar no Calendar');
  const aprovado = workflow.nodes.find((node) => node.name === 'Registrar aprovado');
  assert.equal(aprovado.parameters.operation, 'append');
  assert.deepEqual(aprovado.parameters.columns.matchingColumns, []);
  assert.equal(Object.keys(aprovado.parameters.columns.value).length, 14);
  assert.match(aprovado.parameters.columns.value.message_id, /Detectar choque/);
  assert.match(aprovado.parameters.columns.value.titulo, /Detectar choque/);
  assert.equal(workflow.connections['Registrar aprovado'].main[0][0].node, 'Responder sucesso');
  const erroCalendar = workflow.nodes.find((node) => node.name === 'Preparar erro Calendar');
  assert.match(erroCalendar.parameters.jsCode, /Detectar choque/);
  const registrarErro = workflow.nodes.find((node) => node.name === 'Registrar erro Calendar');
  assert.equal(registrarErro.parameters.operation, 'append');
  assert.deepEqual(registrarErro.parameters.columns.matchingColumns, []);
  assert.equal(Object.keys(registrarErro.parameters.columns.value).length, 14);
});

test('respostas ficam na conversa e todos os ramos terminais marcam a mensagem como lida', async () => {
  const workflow = await carregar();
  const nomes = new Set(workflow.nodes.map((node) => node.name));
  for (const nome of ['Responder sucesso', 'Marcar como lido']) assert.equal(nomes.has(nome), true, `nó ausente: ${nome}`);

  const complemento = workflow.nodes.find((node) => node.name === 'Pedir complemento');
  const sucesso = workflow.nodes.find((node) => node.name === 'Responder sucesso');
  for (const resposta of [complemento, sucesso]) {
    assert.equal(resposta.parameters.resource, 'message');
    assert.equal(resposta.parameters.operation, 'reply');
    assert.match(resposta.parameters.messageId, /Normalizar mensagem/);
    assert.equal(resposta.parameters.options.replyToSenderOnly, true);
  }

  const marcarLido = workflow.nodes.find((node) => node.name === 'Marcar como lido');
  assert.equal(marcarLido.parameters.resource, 'message');
  assert.equal(marcarLido.parameters.operation, 'markAsRead');
  assert.match(marcarLido.parameters.messageId, /Normalizar mensagem/);
  for (const origem of ['Mensagem nova?', 'Pedir complemento', 'Responder sucesso', 'Avisar falha']) {
    const ramo = origem === 'Mensagem nova?' ? workflow.connections[origem].main[1] : workflow.connections[origem].main[0];
    assert.equal(ramo[0].node, 'Marcar como lido', `ramo sem leitura concluída: ${origem}`);
  }
  assert.equal(workflow.connections['Marcar como lido'].main[0][0].node, 'Finalizar');
});

test('filtro do Gmail exige anexo e não há etapa de aprovação manual', async () => {
  const workflow = await carregar();
  const trigger = workflow.nodes.find((node) => node.name === 'Receber cartaz');
  const nomes = new Set(workflow.nodes.map((node) => node.name));
  assert.match(trigger.parameters.filters.q, /has:attachment/);
  for (const nome of ['Registrar pendente', 'Enviar aprovação', 'Aguardar decisão', 'Interpretar decisão', 'Decisão válida?', 'Aprovado?', 'Registrar rejeitado', 'Registrar decisão inválida']) {
    assert.equal(nomes.has(nome), false, `nó legado ainda presente: ${nome}`);
  }
});

test('Calendar recebe ID determinístico para tornar nova tentativa idempotente', async () => {
  const workflow = await carregar();
  const calendar = workflow.nodes.find((node) => node.name === 'Criar no Calendar');
  assert.equal(calendar.parameters.additionalFields.id, '={{$json.calendar_event_id_planejado}}');
});

test('todas as referências de nós em expressões apontam para nomes existentes', async () => {
  const workflow = await carregar();
  const nomes = new Set(workflow.nodes.map((node) => node.name));
  const texto = JSON.stringify(workflow);
  const referencias = [...texto.matchAll(/\$\(["']([^"']+)["']\)/g)].map((match) => match[1]);
  for (const referencia of referencias) assert.equal(nomes.has(referencia), true, `referência ausente: ${referencia}`);
});

test('todo nó é alcançável e somente Finalizar é terminal', async () => {
  const workflow = await carregar();
  const visitados = new Set();
  const fila = ['Receber cartaz'];
  while (fila.length) {
    const atual = fila.shift();
    if (visitados.has(atual)) continue;
    visitados.add(atual);
    const grupos = workflow.connections[atual] ?? {};
    for (const saidas of Object.values(grupos)) {
      for (const ramo of saidas) for (const conexao of ramo ?? []) fila.push(conexao.node);
    }
  }
  assert.deepEqual([...new Set(workflow.nodes.map((node) => node.name).filter((nome) => !visitados.has(nome)))], []);
  const terminais = workflow.nodes.map((node) => node.name).filter((nome) => !workflow.connections[nome]);
  assert.deepEqual(terminais, ['Finalizar']);
});


// Regressão da execução 1147: o Code node do n8n não expõe a classe URL, então
// new URL() lançava erro e todo link válido virava "link_inscricao inválido".
const validarNoSandbox = async (eventoGemini) => {
  const { runInNewContext } = await import('node:vm');
  const workflow = await carregar();
  const codigo = workflow.nodes.find((node) => node.name === 'Validar evento').parameters.jsCode;
  const contexto = {
    $: () => ({ first: () => ({ json: { message_id: 'abc123', remetente: 'x@example.test' } }) }),
    $input: { first: () => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(eventoGemini) }] } }] } }) }
  };
  assert.equal(runInNewContext('typeof URL', contexto), 'undefined', 'o sandbox do teste não pode ter URL');
  const [saida] = runInNewContext(`(() => { ${codigo} })()`, contexto);
  return JSON.parse(JSON.stringify(saida.json));
};
const eventoBase = {
  titulo: 'ENCONTRO HORIZONTE', data_inicio: '2026-11-14', hora_inicio: '19:00', data_fim: '2026-11-14',
  hora_fim: '21:00', local: 'Centro Cultural Aurora', descricao: null, organizacao: 'Coletivo Horizonte',
  link_inscricao: 'https://example.test/horizonte'
};

test('Validar evento aceita link HTTPS válido sem depender da classe URL', async () => {
  const saida = await validarNoSandbox(eventoBase);
  assert.deepEqual(saida.pendencias, []);
  assert.equal(saida.completo, true);
  assert.match(saida.calendar_event_id_planejado, /^ai[0-9a-f]{16}$/);
});

test('Validar evento limpa Markdown e pontuação, converte datas e horas brasileiras e rejeita link sem http(s)', async () => {
  const limpo = await validarNoSandbox({ ...eventoBase, data_inicio: '14/11/2026', data_fim: '14/11/2026', hora_inicio: '19h', hora_fim: '21h00', link_inscricao: '[inscrição](https://example.test/horizonte).' });
  assert.equal(limpo.completo, true);
  assert.equal(limpo.evento.link_inscricao, 'https://example.test/horizonte');
  assert.equal(limpo.evento.inicio_iso, '2026-11-14T19:00:00-03:00');
  const semLink = await validarNoSandbox({ ...eventoBase, link_inscricao: null });
  assert.equal(semLink.completo, true);
  const invalido = await validarNoSandbox({ ...eventoBase, link_inscricao: 'ftp://example.test/x' });
  assert.deepEqual(invalido.pendencias, ['link_inscricao inválido']);
  const faltando = await validarNoSandbox({ ...eventoBase, local: null });
  assert.deepEqual(faltando.campos_faltantes, ['local']);
});

// ---- Mensagens, nomes legíveis, choque "a confirmar" e aviso de falha ----
const renderizar = async (mensagem, ctx) => {
  const { runInNewContext } = await import('node:vm');
  assert.equal(mensagem[0], '=');
  return mensagem.slice(1).replace(/\{\{([\s\S]+?)\}\}/g, (_, expressao) => runInNewContext(expressao, ctx));
};
const noDe = async (nome) => (await carregar()).nodes.find((node) => node.name === nome);
const contextoDeChoque = (choque) => ({
  $: (nome) => ({ first: () => ({ json: nome === 'Detectar choque'
    ? { choque, conflitos: choque ? [{ titulo: 'ENCONTRO HORIZONTE' }] : [], evento: { titulo: 'RODA AURORA', data_inicio: '2026-11-14', hora_inicio: '20:30', local: 'Casa Inventiva' } }
    : {} }) })
});

test('sem choque a resposta confirma data, hora e local em formato legível', async () => {
  const texto = await renderizar((await noDe('Responder sucesso')).parameters.message, contextoDeChoque(false));
  assert.equal(texto, 'Olá! O evento "RODA AURORA" foi cadastrado no calendário para 14/11/2026 às 20:30, em Casa Inventiva.');
});

test('com choque o evento é cadastrado como "a confirmar" e a resposta avisa do outro evento', async () => {
  const texto = await renderizar((await noDe('Responder sucesso')).parameters.message, contextoDeChoque(true));
  assert.match(texto, /nesse dia e horário já temos outro evento \(ENCONTRO HORIZONTE\)/);
  assert.match(texto, /irei confirmar a presença e te retorno assim que possível/);
  const calendar = await noDe('Criar no Calendar');
  assert.match(calendar.parameters.additionalFields.summary, /\[A CONFIRMAR\]/);
  assert.match(calendar.parameters.additionalFields.description, /sobrepõe/);
  const registrar = await noDe('Registrar aprovado');
  assert.match(registrar.parameters.columns.value.status, /conflito/);
  assert.match(registrar.parameters.columns.value.status, /aprovado/);
});

test('Detectar choque trata eventos "a confirmar" como ativos', async () => {
  const { runInNewContext } = await import('node:vm');
  const codigo = (await noDe('Detectar choque')).parameters.jsCode;
  const linhas = [{ message_id: 'm1', status: 'conflito', titulo: 'Outro', inicio_iso: '2026-11-14T19:00:00-03:00', fim_iso: '2026-11-14T21:00:00-03:00' },
    { message_id: 'm2', status: 'incompleto', titulo: 'Incompleto', inicio_iso: '2026-11-14T19:00:00-03:00', fim_iso: '2026-11-14T21:00:00-03:00' }];
  const contexto = {
    $: () => ({ all: () => linhas.map((json) => ({ json })) }),
    $input: { first: () => ({ json: { message_id: 'novo', evento: { inicio_iso: '2026-11-14T20:30:00-03:00', fim_iso: '2026-11-14T22:00:00-03:00' } } }) }
  };
  const [saida] = runInNewContext(`(() => { ${codigo} })()`, contexto);
  assert.equal(saida.json.choque, true);
  assert.deepEqual(JSON.parse(JSON.stringify(saida.json.conflitos.map((c) => c.message_id))), ['m1']);
});

test('pedido de complemento usa nomes legíveis e manda enviar um novo e-mail com o cartaz', async () => {
  const validar = await noDe('Validar evento');
  const { runInNewContext } = await import('node:vm');
  const rodar = (evento) => JSON.parse(JSON.stringify(runInNewContext(`(() => { ${validar.parameters.jsCode} })()`, {
    $: () => ({ first: () => ({ json: { message_id: 'abc' } }) }),
    $input: { first: () => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(evento) }] } }] } }) }
  })[0].json));
  assert.equal(rodar({ ...eventoBase, hora_fim: null }).resumo_pendencias, 'faltou informar horário de término');
  assert.equal(rodar({ ...eventoBase, hora_fim: null, local: null }).resumo_pendencias, 'faltou informar horário de término, local');
  assert.equal(rodar({ ...eventoBase, data_inicio: '31/02/2026' }).resumo_pendencias, 'o campo "data de início" não está num formato válido');
  assert.equal(rodar({ ...eventoBase, hora_inicio: '21:00', hora_fim: '19:00' }).resumo_pendencias, 'o término precisa ser depois do início');
  const complemento = await renderizar((await noDe('Pedir complemento')).parameters.message, { $: () => ({ first: () => ({ json: { resumo_pendencias: 'faltou informar horário de término' } }) }) });
  assert.equal(complemento, 'Olá! Recebi o seu cartaz, mas não consegui cadastrar o evento: faltou informar horário de término. Nenhum evento foi criado. Envie um novo e-mail com o cartaz corrigido que eu tento de novo.');
  assert.doesNotMatch(complemento, /hora_fim|responda/);
});

test('falhas do Gemini e do Calendar avisam o remetente na conversa antes de marcar como lido', async () => {
  const workflow = await carregar();
  for (const origem of ['Registrar erro', 'Registrar erro Calendar']) assert.equal(workflow.connections[origem].main[0][0].node, 'Avisar falha');
  const aviso = await noDe('Avisar falha');
  assert.equal(aviso.parameters.operation, 'reply');
  assert.match(aviso.parameters.messageId, /Normalizar mensagem/);
  assert.equal(aviso.parameters.options.replyToSenderOnly, true);
  assert.match(aviso.parameters.message, /Nenhum evento foi criado\. Reenvie o e-mail em alguns minutos/);
});

test('títulos repetidos entre os conflitos aparecem uma só vez na resposta', async () => {
  const ctx = { $: () => ({ first: () => ({ json: { choque: true, evento: { titulo: 'RODA AURORA', data_inicio: '2026-11-14', hora_inicio: '20:30', local: 'Casa' },
    conflitos: [{ titulo: 'ENCONTRO HORIZONTE' }, { titulo: 'RODA AURORA' }, { titulo: 'ENCONTRO HORIZONTE' }] } }) }) };
  const texto = await renderizar((await noDe('Responder sucesso')).parameters.message, ctx);
  assert.match(texto, /\(ENCONTRO HORIZONTE, RODA AURORA\)\./);
});
