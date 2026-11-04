import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarChoques, intervalosSeSobrepoem } from '../src/choque.js';

const base = {message_id: 'msg-1', titulo: 'Evento base', inicio_iso: '2026-11-14T19:00:00-03:00', fim_iso: '2026-11-14T21:00:00-03:00', status: 'aprovado'};

test('detecta sobreposição parcial', () => {
  assert.equal(intervalosSeSobrepoem(base, {inicio_iso: '2026-11-14T20:30:00-03:00', fim_iso: '2026-11-14T22:00:00-03:00'}), true);
});

test('detecta intervalo contido em outro', () => {
  assert.equal(intervalosSeSobrepoem(base, {inicio_iso: '2026-11-14T19:30:00-03:00', fim_iso: '2026-11-14T20:00:00-03:00'}), true);
});

test('horários adjacentes não se chocam', () => {
  assert.equal(intervalosSeSobrepoem(base, {inicio_iso: '2026-11-14T21:00:00-03:00', fim_iso: '2026-11-14T22:00:00-03:00'}), false);
});

test('ignora registros rejeitados, incompletos e com o mesmo message_id', () => {
  const candidato = {message_id: 'msg-2', inicio_iso: '2026-11-14T19:30:00-03:00', fim_iso: '2026-11-14T20:00:00-03:00'};
  const conflitos = detectarChoques(candidato, [
    {...base, status: 'rejeitado'}, {...base, message_id: 'msg-2'}, {...base, message_id: 'msg-3', status: 'incompleto'}
  ]);
  assert.deepEqual(conflitos, []);
});

test('retorna somente aprovados e a confirmar (conflito) conflitantes', () => {
  const candidato = {message_id: 'msg-9', inicio_iso: '2026-11-14T20:30:00-03:00', fim_iso: '2026-11-14T22:00:00-03:00'};
  const conflitos = detectarChoques(candidato, [base, {...base, message_id: 'msg-2', status: 'conflito'}]);
  assert.deepEqual(conflitos.map((item) => item.message_id), ['msg-1', 'msg-2']);
});

