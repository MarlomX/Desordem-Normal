/**
 * Proteção da digitação das janelas (`shared/typing-guard.js`, v0.28.5).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingGuard } from '../scripts/shared/typing-guard.js';

const makeApp = (rendered = true) => ({
  rendered,
  renders: 0,
  render() {
    this.renders++;
  },
});

/** Troca o setTimeout para rodar na hora (e guardar o atraso pedido). */
function instantTimeout() {
  const delays = [];
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    delays.push(ms);
    fn();
  };
  return { delays, restore: () => (globalThis.setTimeout = original) };
}

test('sem ninguém digitando, refresh redesenha; janela fechada não redesenha', () => {
  const app = makeApp();
  new TypingGuard(app).refresh();
  assert.equal(app.renders, 1);
  const closed = makeApp(false);
  new TypingGuard(closed).refresh();
  assert.equal(closed.renders, 0);
});

test('digitando, refresh espera; ao sair do campo redesenha (250 ms depois)', () => {
  const app = makeApp();
  const guard = new TypingGuard(app);
  guard.typing();
  guard.refresh();
  guard.refresh();
  assert.equal(app.renders, 0);
  const timer = instantTimeout();
  try {
    guard.left();
    guard.left();
  } finally {
    timer.restore();
  }
  assert.equal(app.renders, 1);
  assert.deepEqual(timer.delays, [250]);
});

test('sair do campo sem atualização pendente não redesenha', () => {
  const app = makeApp();
  const guard = new TypingGuard(app);
  guard.typing();
  guard.left();
  assert.equal(app.renders, 0);
  guard.refresh();
  assert.equal(app.renders, 1);
});

test('confirmar o valor (done) descarta a espera: quem grava redesenha em seguida', () => {
  const app = makeApp();
  const guard = new TypingGuard(app);
  guard.typing();
  guard.refresh();
  guard.done();
  guard.left();
  assert.equal(app.renders, 0);
});

test('watch liga input e blur do campo', () => {
  const listeners = {};
  const field = { addEventListener: (name, fn) => (listeners[name] = fn) };
  const app = makeApp();
  const guard = new TypingGuard(app);
  guard.watch(field);
  assert.deepEqual(Object.keys(listeners).sort(), ['blur', 'input']);
  listeners.input();
  guard.refresh();
  assert.equal(app.renders, 0);
  const timer = instantTimeout();
  try {
    listeners.blur();
  } finally {
    timer.restore();
  }
  assert.equal(app.renders, 1);
});
