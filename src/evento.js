const CAMPOS = [
  'titulo', 'data_inicio', 'hora_inicio', 'data_fim', 'hora_fim',
  'local', 'descricao', 'organizacao', 'link_inscricao'
];
const OBRIGATORIOS = ['titulo', 'data_inicio', 'hora_inicio', 'data_fim', 'hora_fim', 'local'];
const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const PADRAO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const PADRAO_URL = /^https?:\/\/[^\s/?#]+[^\s]*$/i;

function textoOuNulo(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string') return valor;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

function dataReal(valor) {
  if (!PADRAO_DATA.test(valor ?? '')) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

export function normalizarEvento(entrada = {}) {
  return Object.fromEntries(CAMPOS.map((campo) => [campo, textoOuNulo(entrada[campo])]));
}

export function validarEvento(entrada = {}) {
  const evento = normalizarEvento(entrada);
  const campos_faltantes = OBRIGATORIOS.filter((campo) => evento[campo] === null);
  const erros = [];

  for (const campo of ['data_inicio', 'data_fim']) {
    if (evento[campo] !== null && !dataReal(evento[campo])) erros.push(`${campo} deve ser uma data real em YYYY-MM-DD`);
  }
  for (const campo of ['hora_inicio', 'hora_fim']) {
    if (evento[campo] !== null && !PADRAO_HORA.test(evento[campo])) erros.push(`${campo} deve usar HH:MM`);
  }
  // Sem `new URL()`: a classe não existe no Code node do n8n e esta regra deve se comportar igual lá.
  if (evento.link_inscricao !== null && !PADRAO_URL.test(evento.link_inscricao)) {
    erros.push('link_inscricao deve ser uma URL HTTP ou HTTPS válida');
  }

  if (campos_faltantes.length === 0 && erros.length === 0) {
    evento.inicio_iso = `${evento.data_inicio}T${evento.hora_inicio}:00-03:00`;
    evento.fim_iso = `${evento.data_fim}T${evento.hora_fim}:00-03:00`;
    if (Date.parse(evento.fim_iso) <= Date.parse(evento.inicio_iso)) erros.push('fim deve ser posterior ao início');
  }

  return {valido: campos_faltantes.length === 0 && erros.length === 0, campos_faltantes, erros, evento};
}

