import test from 'node:test';
import assert from 'node:assert/strict';
import { verificarIdempotencia } from '../src/idempotencia.js';
import * as idempotencia from '../src/idempotencia.js';

test('permite uma mensagem ainda não registrada', () => {
  assert.deepEqual(verificarIdempotencia('msg-nova', []), {duplicado: false, registro: null});
});

test('impede reprocessar o mesmo message_id', () => {
  const linha = {message_id: 'msg-1', status: 'aprovado', calendar_event_id: 'cal-1'};
  assert.deepEqual(verificarIdempotencia('msg-1', [linha]), {duplicado: true, registro: linha});
});

test('não confunde mensagens diferentes com eventos parecidos', () => {
  const linhas = [{message_id: 'msg-1', titulo: 'Mesmo título'}];
  assert.equal(verificarIdempotencia('msg-2', linhas).duplicado, false);
});

test('gera ID estável e aceito pelo Calendar a partir do message_id', () => {
  assert.equal(typeof idempotencia.criarCalendarEventId, 'function');
  const primeiro = idempotencia.criarCalendarEventId('18fabcXYZ-123');
  const repetido = idempotencia.criarCalendarEventId('18fabcXYZ-123');
  const outro = idempotencia.criarCalendarEventId('18fabcXYZ-124');
  assert.equal(primeiro, repetido);
  assert.notEqual(primeiro, outro);
  assert.match(primeiro, /^[a-v0-9]{5,1024}$/);
});

