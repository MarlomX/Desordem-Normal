// Editor da lista de efeitos: acrescentar, remover, mover e editar parâmetros.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MAX_EFFECTS,
  addEffect,
  describeEffect,
  editorEffects,
  editorRows,
  effectSupported,
  hiddenByValue,
  moveEffect,
  removeEffect,
  resourceKeys,
  setEffectParam,
  templateEffects,
  toggleEffectSkill,
} from '../scripts/rolls/ability-effects-editor.js';
import { EFFECT_TYPES, legacyEffects, normalizeEffect } from '../scripts/rolls/ability-effects.js';
import { AUTOMATIONS } from '../scripts/rolls/abilities.js';

const pt = JSON.parse(fs.readFileSync(new URL('../lang/pt-BR.json', import.meta.url)));
const en = JSON.parse(fs.readFileSync(new URL('../lang/en.json', import.meta.url)));

/** Tradução como a do Foundry: procura a chave (aninhada) e troca os {marcadores}. */
const translator =
  (dict) =>
  (key, data = {}) => {
    let node = dict;
    for (const part of key.split('.')) node = node?.[part];
    if (typeof node !== 'string') throw new Error(`chave ausente: ${key}`);
    return node.replace(/\{(\w+)\}/g, (_, name) => {
      if (!(name in data)) throw new Error(`marcador sem valor: ${name} em ${key}`);
      return String(data[name]);
    });
  };
const t = translator(pt);
const skills = [
  { key: 'crime', label: 'Crime' },
  { key: 'furtividade', label: 'Furtividade' },
  { key: 'medicina', label: 'Medicina' },
  { key: 'acrobacia', label: 'Acrobacia' },
];
const skill = (key) => skills.find((s) => s.key === key)?.label ?? key;
const one = (tipo, params = {}) => normalizeEffect({ id: 'x', tipo, params });

// ---------- Lista ----------

test('editorEffects: lista própria; vazia, a da automação antiga marcada como legado', () => {
  const own = editorEffects({ automacao: 'impeto', efeitos: [{ id: 'a', tipo: 'acaoNota' }] });
  assert.equal(own.legacy, false);
  assert.equal(own.effects.length, 1);
  const legacy = editorEffects({ automacao: 'prontidao', efeitos: [] });
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.effects[0].tipo, 'rerrolar');
  assert.deepEqual(editorEffects({ automacao: '', efeitos: [] }), { effects: [], legacy: false });
});

test('addEffect acrescenta com os padrões; tipo desconhecido ou lista cheia não muda nada', () => {
  const list = addEffect([], 'dadoExtra', 'n1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'n1');
  assert.equal(list[0].params.dado, 6);
  assert.equal(addEffect(list, 'magia', 'n2').length, 1);
  let full = [];
  for (let i = 0; i < MAX_EFFECTS + 3; i++) full = addEffect(full, 'acaoNota', `e${i}`);
  assert.equal(full.length, MAX_EFFECTS);
});

test('removeEffect e moveEffect devolvem listas novas sem mexer na recebida', () => {
  const list = [one('acaoNota'), one('rerrolar'), one('companheiro')].map((e, i) => ({
    ...e,
    id: `e${i}`,
  }));
  const ids = (l) => l.map((e) => e.id);
  assert.deepEqual(ids(moveEffect(list, 0, 1)), ['e1', 'e0', 'e2']);
  assert.deepEqual(ids(moveEffect(list, 2, -1)), ['e0', 'e2', 'e1']);
  assert.deepEqual(ids(moveEffect(list, 0, -1)), ['e0', 'e1', 'e2']);
  assert.deepEqual(ids(moveEffect(list, 2, 1)), ['e0', 'e1', 'e2']);
  assert.deepEqual(ids(removeEffect(list, 1)), ['e0', 'e2']);
  assert.deepEqual(ids(list), ['e0', 'e1', 'e2']);
});

test('setEffectParam converte o valor do formulário e muda campos do custo', () => {
  let list = [one('dadoExtra')];
  list = setEffectParam(list, 0, 'dado', '8');
  assert.equal(list[0].params.dado, 8);
  list = setEffectParam(list, 0, 'custo.tipo', 'recurso');
  list = setEffectParam(list, 0, 'custo.valor', '2');
  list = setEffectParam(list, 0, 'custo.recurso', 'impeto');
  assert.deepEqual(list[0].params.custo, { tipo: 'recurso', valor: 2, recurso: 'impeto' });
  // Trocar para PD apaga o recurso; voltar a «sem custo» zera o valor
  list = setEffectParam(list, 0, 'custo.tipo', 'pd');
  assert.deepEqual(list[0].params.custo, { tipo: 'pd', valor: 2, recurso: '' });
  list = setEffectParam(list, 0, 'custo.tipo', 'nenhum');
  assert.deepEqual(list[0].params.custo, { tipo: 'nenhum', valor: 0, recurso: '' });
  // Valores inválidos voltam ao padrão; checkbox chega como booleano
  list = setEffectParam(list, 0, 'dado', '7');
  assert.equal(list[0].params.dado, 6);
  list = setEffectParam(list, 0, 'marcado', true);
  assert.equal(list[0].params.marcado, true);
});

test('toggleEffectSkill liga e desliga perícias sem repetir', () => {
  let list = [one('dadoExtra')];
  list = toggleEffectSkill(list, 0, 'crime', true);
  list = toggleEffectSkill(list, 0, 'crime', true);
  list = toggleEffectSkill(list, 0, 'furtividade', true);
  assert.deepEqual(list[0].params.pericias, ['crime', 'furtividade']);
  list = toggleEffectSkill(list, 0, 'crime', false);
  assert.deepEqual(list[0].params.pericias, ['furtividade']);
});

test('templateEffects: cada modelo é a automação antiga equivalente', () => {
  for (const key of AUTOMATIONS) assert.deepEqual(templateEffects(key), legacyEffects(key), key);
});

// ---------- Uso automático ----------

test('effectSupported: os efeitos das automações antigas têm todos uso automático', () => {
  for (const key of AUTOMATIONS) {
    const list = legacyEffects(key);
    for (const effect of list) assert.equal(effectSupported(effect), true, `${key}/${effect.id}`);
  }
});

test('effectSupported marca o que ainda não tem uso nesta versão', () => {
  assert.equal(effectSupported(one('recurso', { chave: 'furia' })), true);
  assert.equal(effectSupported(one('passoCena')), true);
  assert.equal(effectSupported(one('acaoNota')), true);
  assert.equal(effectSupported(one('testeAcao', { resultado: 'concederDados' })), true);
  assert.equal(effectSupported(one('ganharRecurso', { recurso: 'furia', gatilho: 'acao' })), true);
  assert.equal(effectSupported(one('ganharRecurso', { gatilho: 'defender' })), true);
  assert.equal(effectSupported(one('ganharRecurso', { gatilho: 'inicioCombate' })), true);
  assert.equal(effectSupported(one('dadoExtra', { custo: { tipo: 'pv', valor: 1 } })), true);
  assert.equal(effectSupported(one('dadoExtra', { teste: 'ataqueCorpo' })), true);
  assert.equal(effectSupported(one('dadoExtra', { custo: { tipo: 'pd', valor: 2 } })), true);
  assert.equal(effectSupported(one('passoCondicional')), true);
  assert.equal(effectSupported(one('interceptar')), true);
  assert.equal(effectSupported(one('companheiro', { teste: 'defesa' })), true);
});

// ---------- Textos ----------

test('describeEffect: resumos das automações antigas', () => {
  const text = (key, id) =>
    describeEffect(
      legacyEffects(key).find((e) => e.id === id),
      { t, skill },
    );
  assert.equal(text('sorrateiro', 'sorrateiro'), '+d8 em Crime, Furtividade — custa 3 PD');
  assert.equal(text('impeto', 'impetoDado'), '+d4 em qualquer perícia — custa 1 de impeto');
  assert.equal(text('impeto', 'impetoFalha'), '+1 em impeto ao falhar um teste com DT');
  assert.equal(
    text('prontidao', 'prontidao'),
    'Rola de novo um dado que não tirou 1 — custa 2 PD (1×/rodada em combate)',
  );
  assert.equal(
    text('curandeiro', 'curandeiro'),
    'Teste de Medicina (DT 7) — custa 2 PD: cura PV igual à RA (1× por alvo na cena)',
  );
  assert.equal(
    text('impeto', 'impetoBarra'),
    '«impeto» (chave impeto): até 5, esvazia no fim da cena',
  );
});

test('describeEffect: todo tipo do catálogo tem resumo nos dois idiomas', () => {
  for (const dict of [pt, en]) {
    const tr = translator(dict);
    for (const tipo of Object.keys(EFFECT_TYPES)) {
      const variants = [one(tipo)];
      if (tipo === 'testeAcao') variants.push(one(tipo, { resultado: 'concederDados' }));
      if (tipo === 'passoCena') variants.push(one(tipo, { atributo: 'mente' }));
      if (tipo === 'acaoNota') variants.push(one(tipo, { texto: 'Olá' }));
      for (const effect of variants) {
        const summary = describeEffect(effect, { t: tr, skill });
        assert.ok(summary.length > 0, `${tipo} sem resumo`);
      }
    }
  }
});

test('editorRows: só a linha aberta traz campos, cada um com o controle certo', () => {
  const list = [
    { ...one('dadoExtra'), id: 'a' },
    { ...one('passoCena'), id: 'b' },
    { ...one('testeAcao'), id: 'c' },
  ];
  const rows = editorRows(list, { t, skills, openId: 'a' });
  assert.deepEqual(
    rows.map((r) => [r.id, r.open, r.first, r.last, r.fields.length > 0]),
    [
      ['a', true, true, false, true],
      ['b', false, false, false, false],
      ['c', false, false, true, false],
    ],
  );
  const fields = Object.fromEntries(rows[0].fields.map((f) => [f.key, f]));
  assert.equal(fields.dado.isDie, true);
  assert.equal(fields.dado.choices.find((c) => c.selected).value, '6');
  assert.equal(fields.pericias.isSkills, true);
  assert.equal(fields.pericias.skills.length, skills.length);
  assert.equal(fields.custo.isCost, true);
  assert.equal(fields.custo.paid, false);
  assert.equal(fields.teste.isChoice, true);
  assert.equal(fields.marcado.isBool, true);
  assert.equal(fields.teste.choices[0].label, 'Qualquer teste');

  const open = (id) =>
    Object.fromEntries(
      editorRows(list, { t, skills, openId: id })
        .find((r) => r.id === id)
        .fields.map((f) => [f.key, f]),
    );
  assert.equal(open('b').atributo.choices[0].label, 'À escolha');
  assert.equal(open('b').passos.isInt, true);
  assert.deepEqual([open('b').passos.min, open('b').passos.max], [1, 3]);
  assert.equal(open('c').pericia.isSkill, true);
  assert.equal(open('c').pericia.choices.find((c) => c.selected).value, 'medicina');
});

test('editorRows: todo campo de todo tipo tem rótulo e opções traduzidas nos dois idiomas', () => {
  for (const dict of [pt, en]) {
    const tr = translator(dict);
    const list = Object.keys(EFFECT_TYPES).map((tipo, i) => ({ ...one(tipo), id: `e${i}` }));
    for (const effect of list) {
      const row = editorRows(list, { t: tr, skills, openId: effect.id })[list.indexOf(effect)];
      for (const field of row.fields) {
        assert.ok(field.label, `${effect.tipo}.${field.key}`);
        for (const choice of [...(field.choices ?? []), ...(field.kinds ?? [])]) {
          assert.ok(choice.label, `${effect.tipo}.${field.key}=${choice.value}`);
        }
      }
    }
  }
});

test('resourceKeys junta as chaves de recursos definidos e usados, sem repetir', () => {
  const ability = [one('recurso', { chave: 'furia' }), one('ganharRecurso', { recurso: 'impeto' })];
  const actor = [one('dadoExtra', { custo: { tipo: 'recurso', valor: 1, recurso: 'furia' } })];
  assert.deepEqual(resourceKeys(ability, actor), ['furia', 'impeto']);
  assert.deepEqual(resourceKeys([], []), []);
});

test('passo da aba Condição: «Atributo» e «Perícia» aparecem conforme o alvo', () => {
  const passo = (params) => normalizeEffect({ id: 'p', tipo: 'passo', params });
  const keys = (params) =>
    editorRows([passo(params)], { t, skills, openId: 'p', itemType: 'efeito' })[0].fields.map(
      (f) => f.key,
    );
  assert.deepEqual(keys({ alvo: 'atributo' }), ['alvo', 'atributo', 'passos', 'teste']);
  assert.deepEqual(keys({ alvo: 'pericia' }), ['alvo', 'pericia', 'passos', 'teste']);
  assert.deepEqual(keys({ alvo: 'pericias' }), ['alvo', 'passos', 'teste']);
  assert.equal(hiddenByValue(passo({ alvo: 'pericias' }), 'pericia'), true);
  // Outros tipos não mudam
  assert.equal(hiddenByValue(one('dadoExtra'), 'dado'), false);
  // O passo é aceito (sem aviso de «sem uso») no efeito da aba Condição
  assert.equal(effectSupported(passo({}), 'efeito'), true);
});

test('modificador da aba Condição: «Atributo» e «Perícia» aparecem conforme «Vale em»', () => {
  const mod = (params) => normalizeEffect({ id: 'm', tipo: 'modificador', params });
  const keys = (params) =>
    editorRows([mod(params)], { t, skills, openId: 'm', itemType: 'efeito' })[0].fields.map(
      (f) => f.key,
    );
  assert.deepEqual(keys({ sobre: 'atributo' }), ['sobre', 'atributo', 'mod']);
  assert.deepEqual(keys({ sobre: 'pericia' }), ['sobre', 'pericia', 'mod']);
  assert.equal(effectSupported(mod({}), 'efeito'), true);
});
