export function verificarIdempotencia(messageId, registros = []) {
  const id = String(messageId ?? '').trim();
  if (!id) throw new Error('message_id é obrigatório');
  const registro = registros.find((item) => String(item.message_id ?? '').trim() === id) ?? null;
  return {duplicado: registro !== null, registro};
}

export function criarCalendarEventId(messageId) {
  const id = String(messageId ?? '').trim();
  if (!id) throw new Error('message_id é obrigatório');

  // FNV-1a de 64 bits: determinístico e composto apenas por caracteres
  // aceitos pelo campo id da Google Calendar API (base32hex: a-v e 0-9).
  let hash = 0xcbf29ce484222325n;
  for (const caractere of id) {
    hash ^= BigInt(caractere.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `ai${hash.toString(16).padStart(16, '0')}`;
}

