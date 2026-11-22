import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newEffect,
  newStepEffect,
  attributeStep,
  addEffect,
  removeEffect,
  updateEffect,
  effectStepMods,
  conditionStepMods,
  attributeStepNet,
  stepTestMatches,
  isLegacyEffect,
  migrateLegacyEffect,
  normalizeSheetEffect,
  normalizeSheetEffects,
  isBridgeable,
  effectView,
  keepAfterScene,
  endsAtScene,
} from '../scripts/rolls/effects.js';
import { normalizeEffect } from '../scripts/rolls/ability-effects.js';
import { migrateConditionEffects } from '../scripts/data/migrations.js';

/** Efeito com passos no atributo (atalho dos testes). */
const step = (atributo, passos, extra = {}) => ({
  ...newStepEffect({ nome: 'x', atributo, passos, duracao: 'manual' }),
  ...extra,
});

/** Efeito com um `passo` qualquer do catálogo. */
const withStep = (params) => ({
  ...newEffect('a'),
  efeitos: [normalizeEffect({ id: 'p0', tipo: 'passo', params })],
});

// ---------- Formato novo ----------

test('newEffect: efeito vazio feito à mão, sem passos e sem fim automático', () => {
  assert.deepEqual(newEffect('id1'), {
    id: 'id1',
    nome: '',
    descricao: '',
    chave: '',
    origem: '',
    duracao: 'manual',
    efeitos: [],
  });
});

test('newStepEffect: um passo simples no atributo; sem atributo válido, nenhum passo', () => {
  const effect = newStepEffect({ id: 'z', nome: 'Tônico', atributo: 'fisico', passos: 9 });
  assert.equal(effect.duracao, 'cena');
  assert.deepEqual(effect.efeitos, [
    {
      id: 'p0',
      tipo: 'passo',
      params: { alvo: 'atributo', atributo: 'fisico', pericia: '', passos: 3, teste: 'qualquer' },
    },
  ]);
  assert.deepEqual(newStepEffect({ nome: 'x', atributo: 'forca', passos: 1 }).efeitos, []);
  assert.equal(newStepEffect({ nome: 'x', atributo: 'todos', passos: 1 }).efeitos.length, 1);
  assert.equal(
    newStepEffect({ nome: 'x', atributo: 'mente', passos: 1, duracao: '?' }).duracao,
    'manual',
  );
});

// ---------- Formato antigo (até a v0.21.x) ----------

test('isLegacyEffect: só o formato fixo antigo (sem a lista de efeitos)', () => {
  assert.equal(
    isLegacyEffect({ nome: 'A', atributo: 'fisico', passos: 1, fimDeCena: false }),
    true,
  );
  assert.equal(isLegacyEffect({ nome: 'A', fimDeCena: true }), true);
  assert.equal(isLegacyEffect(newEffect()), false);
  assert.equal(isLegacyEffect({ nome: 'A' }), false);
  assert.equal(isLegacyEffect(null), false);
});

test('migrateLegacyEffect: atributo e passos viram um passo; fim de cena vira a duração cena', () => {
  const old = {
    nome: 'Preparado',
    descricao: 'd',
    atributo: 'mente',
    passos: -2,
    fimDeCena: true,
    origem: 'item',
  };
  const effect = migrateLegacyEffect(old, 'ef3');
  assert.equal(effect.id, 'ef3');
  assert.equal(effect.nome, 'Preparado');
  assert.equal(effect.descricao, 'd');
  assert.equal(effect.origem, 'item');
  assert.equal(effect.duracao, 'cena');
  assert.deepEqual(effectView(effect), { atributo: 'mente', passos: -2 });
  // Sem atributo: só o texto; sem «fim de cena»: manual
  const plain = migrateLegacyEffect({ nome: 'Nota', atributo: '', passos: 2, fimDeCena: false });
  assert.deepEqual(plain.efeitos, []);
  assert.equal(plain.duracao, 'manual');
  // «todos os atributos» (passo condicional) é mantido
  assert.equal(effectView(migrateLegacyEffect({ atributo: 'todos', passos: 1 })).atributo, 'todos');
});

test('migrateConditionEffects: converte só os antigos, com ids estáveis, e repete sem estragar', () => {
  const novo = newStepEffect({ id: 'n1', nome: 'Novo', atributo: 'fisico', passos: 1 });
  const source = {
    efeitos: [{ nome: 'Velho', atributo: 'emocao', passos: 1, fimDeCena: false, origem: '' }, novo],
  };
  migrateConditionEffects(source);
  assert.equal(source.efeitos[0].id, 'ef0');
  assert.equal(source.efeitos[0].duracao, 'manual');
  assert.deepEqual(effectView(source.efeitos[0]), { atributo: 'emocao', passos: 1 });
  assert.equal(source.efeitos[1], novo); // o já convertido fica como está (mesmo objeto)
  const again = structuredClone(source);
  migrateConditionEffects(again);
  assert.deepEqual(again, source);
  // Sem efeitos, ou só mudanças de outra parte da ficha: nada muda
  assert.deepEqual(migrateConditionEffects({ pv: { value: 3 } }), { pv: { value: 3 } });
  assert.deepEqual(migrateConditionEffects({ efeitos: [] }), { efeitos: [] });
});

test('normalizeSheetEffect: limpa textos, duração e tipos de efeito fora da aba Condição', () => {
  const effect = normalizeSheetEffect(
    {
      id: 7,
      nome: 'A',
      duracao: 'eterna',
      efeitos: [
        { id: 'p', tipo: 'passo', params: { passos: 2 } },
        { id: 'd', tipo: 'dadoExtra', params: {} },
        { id: 'q', tipo: 'nada' },
      ],
    },
    'fb',
  );
  assert.equal(effect.id, 'fb');
  assert.equal(effect.descricao, '');
  assert.equal(effect.duracao, 'manual');
  assert.deepEqual(
    effect.efeitos.map((e) => e.tipo),
    ['passo'],
  );
  assert.deepEqual(
    normalizeSheetEffects([{ nome: 'x', atributo: 'fisico', passos: 1 }, {}]).map((e) => e.id),
    ['ef0', 'ef1'],
  );
  assert.deepEqual(normalizeSheetEffects(undefined), []);
});

// ---------- Edição pela linha da ficha ----------

test('addEffect e removeEffect devolvem listas novas', () => {
  const original = [{ ...newEffect('a'), nome: 'A' }];
  const added = addEffect(original, 'b');
  assert.equal(added.length, 2);
  assert.equal(original.length, 1);
  assert.deepEqual(added[1], newEffect('b'));
  assert.deepEqual(removeEffect(added, 0), [newEffect('b')]);
});

test('updateEffect limita passos, valida o atributo e ignora campos desconhecidos', () => {
  const list = [newEffect('a')];
  const named = updateEffect(list, 0, { nome: 'Tônico', atributo: 'fisico', x: 1 });
  assert.equal(named[0].nome, 'Tônico');
  assert.equal('x' in named[0], false);
  assert.deepEqual(effectView(named[0]), { atributo: 'fisico', passos: 0 });
  assert.equal(effectView(updateEffect(named, 0, { passos: 9 })[0]).passos, 3);
  assert.equal(effectView(updateEffect(named, 0, { passos: -8 })[0]).passos, -3);
  assert.equal(effectView(updateEffect(named, 0, { passos: 'abc' })[0]).passos, 0);
  // Atributo inválido ou vazio tira o passo
  assert.deepEqual(updateEffect(named, 0, { atributo: 'forca' })[0].efeitos, []);
  assert.deepEqual(updateEffect(named, 0, { atributo: '' })[0].efeitos, []);
  // Passos sem atributo: nada a gravar
  assert.deepEqual(updateEffect(list, 0, { passos: 2 })[0].efeitos, []);
  // Trocar o atributo mantém os passos
  const two = updateEffect(named, 0, { passos: 2 });
  assert.deepEqual(effectView(updateEffect(two, 0, { atributo: 'mente' })[0]), {
    atributo: 'mente',
    passos: 2,
  });
  assert.deepEqual(updateEffect(list, 3, { nome: 'Z' }), list);
});

test('updateEffect: «fim de cena» liga a duração cena; desligar volta a manual (permanente fica)', () => {
  const list = [newEffect('a')];
  assert.equal(updateEffect(list, 0, { fimDeCena: true })[0].duracao, 'cena');
  assert.equal(updateEffect(list, 0, { fimDeCena: 'true' })[0].duracao, 'cena');
  const scene = updateEffect(list, 0, { fimDeCena: true });
  assert.equal(updateEffect(scene, 0, { fimDeCena: false })[0].duracao, 'manual');
  const permanent = [{ ...newEffect('p'), duracao: 'permanente' }];
  assert.equal(updateEffect(permanent, 0, { fimDeCena: false })[0].duracao, 'permanente');
  assert.equal(updateEffect(list, 0, { duracao: 'permanente' })[0].duracao, 'permanente');
  assert.equal(updateEffect(list, 0, { duracao: 'x' })[0].duracao, 'manual');
});

test('updateEffect não mexe nos passos de um efeito que a linha simples não mostra', () => {
  const skillStep = withStep({ alvo: 'pericia', pericia: 'luta', passos: -1 });
  assert.equal(isBridgeable(skillStep), false);
  const [next] = updateEffect([skillStep], 0, { atributo: 'fisico', passos: 2, nome: 'Agarrado' });
  assert.equal(next.nome, 'Agarrado');
  assert.deepEqual(next.efeitos, skillStep.efeitos);
  // Passo de atributo só em ataques também não é «simples»
  assert.equal(
    isBridgeable(withStep({ alvo: 'atributo', atributo: 'fisico', teste: 'ataque' })),
    false,
  );
  assert.deepEqual(effectView(skillStep), { atributo: '', passos: 0 });
  // Sem passos, ou um passo simples: a linha mostra
  assert.equal(isBridgeable(newEffect()), true);
  assert.equal(isBridgeable(step('fisico', 1)), true);
});

// ---------- Fim de cena ----------

test('keepAfterScene tira só os de duração cena (antigos com «fim de cena» também)', () => {
  const list = [
    step('fisico', 1, { duracao: 'cena' }),
    step('mente', 1, { duracao: 'manual' }),
    { ...newEffect('l'), duracao: 'permanente' },
    { nome: 'Velho', atributo: 'fisico', passos: 1, fimDeCena: true },
  ];
  assert.deepEqual(
    keepAfterScene(list).map((e) => e.duracao),
    ['manual', 'permanente'],
  );
  assert.equal(endsAtScene(list[0]), true);
  assert.equal(endsAtScene(list[3]), true);
});

// ---------- Passos nos testes ----------

test('effectStepMods devolve só os efeitos do atributo do teste', () => {
  const effects = [
    step('fisico', 1),
    step('mente', -1),
    step('fisico', 0),
    { ...newEffect(), nome: 'só texto' },
  ];
  assert.deepEqual(effectStepMods(effects, 'fisico'), [{ target: 'attribute', steps: 1 }]);
  assert.deepEqual(effectStepMods(effects, 'mente'), [{ target: 'attribute', steps: -1 }]);
  assert.deepEqual(effectStepMods(effects, 'emocao'), []);
});

test('effectStepMods também lê efeitos ainda no formato antigo', () => {
  assert.deepEqual(
    effectStepMods([{ atributo: 'fisico', passos: -1, fimDeCena: false }], 'fisico'),
    [{ target: 'attribute', steps: -1 }],
  );
});

test('stepTestMatches: qualquer vale sempre; ataque vale nos dois ataques', () => {
  assert.equal(stepTestMatches('qualquer', 'defesa'), true);
  assert.equal(stepTestMatches('ataque', 'ataqueCorpo'), true);
  assert.equal(stepTestMatches('ataque', 'ataqueDistancia'), true);
  assert.equal(stepTestMatches('ataque', 'qualquer'), false);
  assert.equal(stepTestMatches('ataqueCorpo', 'ataqueDistancia'), false);
  assert.equal(stepTestMatches('defesa', 'defesa'), true);
  assert.equal(stepTestMatches('defesa'), false);
});

test('conditionStepMods: passos numa perícia só, em qualquer perícia e por tipo de teste', () => {
  const effects = [
    withStep({ alvo: 'pericia', pericia: 'luta', passos: -1 }),
    withStep({ alvo: 'pericias', passos: 1 }),
    withStep({ alvo: 'atributo', atributo: 'fisico', passos: -1, teste: 'ataque' }),
    withStep({ alvo: 'pericia', pericia: '', passos: 2 }),
  ];
  // Teste de Luta comum: o da Luta e o de qualquer perícia (o de ataque não)
  assert.deepEqual(conditionStepMods(effects, { attrKey: 'fisico', skillKey: 'luta' }), [
    { target: 'skill', steps: -1 },
    { target: 'skill', steps: 1 },
  ]);
  // Ataque corpo a corpo com Luta: entra também o passo de atributo dos ataques
  assert.deepEqual(
    conditionStepMods(effects, { attrKey: 'fisico', skillKey: 'luta', testKind: 'ataqueCorpo' }),
    [
      { target: 'skill', steps: -1 },
      { target: 'skill', steps: 1 },
      { target: 'attribute', steps: -1 },
    ],
  );
  // Outra perícia: só o de qualquer perícia (a perícia vazia não vale em nenhuma)
  assert.deepEqual(conditionStepMods(effects, { attrKey: 'mente', skillKey: 'ocultismo' }), [
    { target: 'skill', steps: 1 },
  ]);
});

test('attributeStepNet soma só os passos de atributo que valem em qualquer teste', () => {
  const effects = [
    step('fisico', 1),
    step('todos', 1),
    withStep({ alvo: 'atributo', atributo: 'fisico', passos: -3, teste: 'defesa' }),
    withStep({ alvo: 'pericias', passos: 2 }),
  ];
  assert.equal(attributeStepNet(effects, 'fisico'), 2);
  assert.equal(attributeStepNet(effects, 'mente'), 1);
});

test('attributeStep: passo simples já limpo pelo catálogo', () => {
  assert.deepEqual(attributeStep('emocao', -5, 'k').params, {
    alvo: 'atributo',
    atributo: 'emocao',
    pericia: '',
    passos: -3,
    teste: 'qualquer',
  });
});
