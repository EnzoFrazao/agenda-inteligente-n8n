const STATUS_ATIVOS = new Set(['aprovado', 'conflito']);

export function intervalosSeSobrepoem(a, b) {
  const inicioA = Date.parse(a.inicio_iso);
  const fimA = Date.parse(a.fim_iso);
  const inicioB = Date.parse(b.inicio_iso);
  const fimB = Date.parse(b.fim_iso);
  if ([inicioA, fimA, inicioB, fimB].some(Number.isNaN)) return false;
  return inicioA < fimB && inicioB < fimA;
}

export function detectarChoques(candidato, registros = []) {
  return registros.filter((registro) =>
    registro.message_id !== candidato.message_id &&
    STATUS_ATIVOS.has(registro.status) &&
    intervalosSeSobrepoem(candidato, registro)
  );
}

