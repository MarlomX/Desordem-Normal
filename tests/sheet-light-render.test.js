/**
 * Redesenho leve da ficha de personagem (v0.28.6): quando só os cartões da perseguição, da
 * furtividade e dos desafios (e a aba Condição) se redesenham, o contexto não monta o resto da
 * ficha (notas enriquecidas, perícias, itens, habilidades).
 */
import { resetFoundry } from './foundry-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import PersonagemSheet from '../scripts/sheets/personagem-sheet.js';

function makeSheet() {
  const calls = { toObject: 0, enrich: 0, items: 0 };
  foundry.applications.ux.TextEditor.implementation.enrichHTML = async (html) => {
    calls.enrich++;
    return html;
  };
  const document = {
    id: 'a1',
    name: 'Ana',
    isOwner: true,
    system: { estado: { pavor: 0 }, efeitos: [], cena: {} },
    toObject: () => {
      calls.toObject++;
      return { system: {} };
    },
    get items() {
      calls.items++;
      return [];
    },
  };
  const sheet = new PersonagemSheet({ document });
  sheet.document = document;
  return { sheet, calls };
}

test('redesenho só dos cartões: monta os cartões, as abas e a aba Condição, e nada mais', async () => {
  resetFoundry();
  const { sheet, calls } = makeSheet();
  for (const parts of [['desafios'], ['perseguicao'], ['furtividade', 'condicao']]) {
    const context = await sheet._prepareContext({ parts });
    for (const key of ['perseguicao', 'furtividade', 'desafios', 'sheetTabs', 'tabState']) {
      assert.ok(key in context, `${parts}: ${key}`);
    }
    assert.deepEqual(context.effects, []);
    assert.ok(Array.isArray(context.fearChoices));
    assert.equal(context.system, sheet.document.system);
    assert.equal('skills' in context || 'notes' in context || 'abilities' in context, false);
  }
  assert.deepEqual(calls, { toObject: 0, enrich: 0, items: 0 });
});
