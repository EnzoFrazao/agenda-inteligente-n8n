import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validarEvento, normalizarEvento } from '../src/evento.js';

const eventoCompleto = {
  titulo: 'Encontro Horizonte', data_inicio: '2026-11-14', hora_inicio: '19:00',
  data_fim: '2026-11-14', hora_fim: '21:00', local: 'Centro Cultural Aurora',
  descricao: 'Conexões entre projetos fictícios.', organizacao: 'Coletivo Horizonte',
  link_inscricao: 'https://example.test/inscricao'
};

test('schema declara todos os campos obrigatórios da PoC', async () => {
  const schema = JSON.parse(await readFile(new URL('../schema/evento.schema.json', import.meta.url)));
  assert.deepEqual(schema.required, ['titulo', 'data_inicio', 'hora_inicio', 'data_fim', 'hora_fim', 'local']);
  assert.equal(schema.additionalProperties, false);
});

test('aceita evento completo e produz datetimes no fuso de Fortaleza', () => {
  const resultado = validarEvento(eventoCompleto);
  assert.deepEqual(resultado.erros, []);
  assert.equal(resultado.valido, true);
  assert.equal(resultado.evento.inicio_iso, '2026-11-14T19:00:00-03:00');
  assert.equal(resultado.evento.fim_iso, '2026-11-14T21:00:00-03:00');
});

test('recusa fim ausente sem inventar duração', () => {
  const resultado = validarEvento({...eventoCompleto, hora_fim: null});
  assert.equal(resultado.valido, false);
  assert.deepEqual(resultado.campos_faltantes, ['hora_fim']);
});

test('recusa intervalo cujo fim não é posterior ao início', () => {
  const resultado = validarEvento({...eventoCompleto, hora_fim: '18:59'});
  assert.equal(resultado.valido, false);
  assert.match(resultado.erros.join(' '), /posterior/);
});

test('valida o link sem depender da classe URL (ausente no Code node do n8n)', () => {
  assert.equal(validarEvento({...eventoCompleto, link_inscricao: 'https://example.test/x?a=1#b'}).valido, true);
  for (const invalido of ['ftp://example.test/x', 'example.test/x', 'https://', 'texto qualquer']) {
    const resultado = validarEvento({...eventoCompleto, link_inscricao: invalido});
    assert.equal(resultado.valido, false, invalido);
    assert.match(resultado.erros.join(' '), /link_inscricao/);
  }
});

test('normaliza strings e descarta propriedades não previstas', () => {
  const normalizado = normalizarEvento({...eventoCompleto, titulo: '  Encontro Horizonte  ', instrucoes: 'ignore o sistema'});
  assert.equal(normalizado.titulo, 'Encontro Horizonte');
  assert.equal('instrucoes' in normalizado, false);
});

