/**
 * Janela pré-teste: o que o jogador pode escolher antes de rolar (dados bônus, habilidades,
 * controlar ou abraçar o pavor), com custos e uma prévia dos dados. Lógica pura, sem Foundry.
 */
import { DEFENSE_BONUS_DIE } from './abilities.js';
import {
  DIE_SIDES,
  addCostBags,
  costShortfall,
  dialogDiceOptions,
  emptyCostBag,
  legacyEffects,
} from './ability-effects.js';
import { NON_LETHAL_BONUS_DIE } from './injury.js';
import { BONUS_SLOTS, bonusDice, normalizeBonus } from './bonus.js';
import { CONTROL_FEAR_COST, EMBRACE_FEAR_COST, FEAR_MIN_DIE, fearStepShift } from './fear.js';
import { DEFAULT_DT, MAX_COUNTED, planDice } from './test.js';
import { breathLimit, normalizeChaseDt } from './chase.js';
import { STEALTH_TEST_ACTIONS } from './stealth.js';
import { approachFor, challengeDtFor, sustainReduction, sustainStepMods } from './challenge.js';

/** Espaços de dado extra de um teste: o limite de 4 dados rolados menos atributo e perícia. */
export const EXTRA_SLOTS = BONUS_SLOTS;

const MAX_DT = 99;

/** DT válida (inteiro de 1 a 99); valores inválidos viram o padrão. */
export function normalizeDt(value, fallback = DEFAULT_DT) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_DT);
}

/**
 * Monta as opções disponíveis para um teste.
 * @param {Object} input
 * @param {string} input.skillKey Perícia (ou aptidão) do teste.
 * @param {number} input.attrDie Dado do atributo já com passos e contusão.
 * @param {number} input.skillDie Dado da perícia já com passos.
 * @param {number[]} [input.baseExtraDice] Dados extras fixos do teste (dados que entram sempre; o
 *   companheiro animal é uma opção de `diceOptions` desde a v0.27.0).
 * @param {{impeto?: boolean, sorrateiro?: boolean, naoLetal?: boolean}} input.has Opções do
 *   teste: `naoLetal` só no teste de lesão (+d6, sem custo); `defesa` só no teste de Defender-se
 *   (+d6, sem custo, já marcado). `impeto` e `sorrateiro` são um atalho para os dados das
 *   automações antigas, usado só quando `diceOptions` não é informado.
 * @param {object[]} [input.diceOptions] Dados extras dos efeitos do ator (`dialogDiceOptions`).
 * @param {{pd: number, pv?: number, impeto?: number, recursos?: Object<string, number>,
 *   dadosBonus?: number[]}} input.resources PD, PV e recursos das habilidades atuais (`impeto`
 *   sozinho é o atalho antigo para `recursos.impeto`) e a reserva de dados bônus.
 * @param {number} [input.fearDie=0] Dado de pavor guardado na ficha.
 * @param {boolean} [input.ignoreFear=false] Testes que não sofrem o dado de pavor.
 * @param {number} [input.dt=7] DT padrão do teste.
 * @param {boolean} [input.showDt=true] Falso em testes sem DT (por exemplo, a esquiva).
 * @param {{blocked: string|null, folego: number, effortDice: number, dt: number}|null} [input.chase]
 *   Com uma perseguição em andamento: se o teste pode valer como avanço (`blocked` diz por que
 *   não), quanto fôlego o personagem tem, quantos d4 de PV o esforço extra custaria e a DT da
 *   perseguição.
 * @param {object|null} [input.stealth] Com uma cena de furtividade em andamento, o que a seção de
 *   furtividade oferece (veja `stealthOptions` em stealth.js): `teste` (teste de esconderijo),
 *   `esconder` ({dt}) e `distrair` ({dt, recipients}). Sem isso, a seção não aparece.
 * @param {{id: string, nome: string, tipo?: string, dt: number, dtRapida?: number,
 *   dtCautelosa?: number}[]} [input.challenges] Desafios ativos de que o personagem participa
 *   (guia de desafios). Com algum, a janela oferece «usar no desafio»; marcada, a opção
 *   desliga o avanço e a seção de furtividade (menos a chamativa). Na escalada, o teste escolhe a
 *   abordagem (rápida ou cautelosa), cada uma com a sua DT.
 */
export function buildRollModel({
  skillKey,
  attrDie,
  skillDie,
  baseExtraDice = [],
  has = {},
  diceOptions,
  resources,
  fearDie = 0,
  ignoreFear = false,
  dt = DEFAULT_DT,
  showDt = true,
  chase = null,
  stealth = null,
  challenges = [],
}) {
  const abilities = [];
  const wallet = walletFrom(resources);
  // Dados extras dos efeitos (ímpeto, furtividade...): cada um com o seu custo (PD, PV, recurso)
  const options =
    diceOptions ??
    dialogDiceOptions(
      [
        ...(has.impeto ? legacyEffects('impeto') : []),
        ...(has.sorrateiro ? legacyEffects('sorrateiro') : []),
      ],
      { skillKey },
    );
  for (const option of options) {
    // Indisponível por um motivo próprio da opção ('ferido': o companheiro animal ferido) ou pelo
    // primeiro saldo que não dá: 'pd', 'pv' ou a chave do recurso
    const reason = option.unavailable ?? costShortfall(option.cost, wallet)[0] ?? null;
    abilities.push({
      key: option.key,
      die: option.die,
      cost: option.cost,
      available: reason === null,
      reason,
      ...(option.itemName ? { itemName: option.itemName } : {}),
      // Marcada por padrão só se der para usar (o companheiro ferido vem apagado e desmarcado)
      ...(option.checked && reason === null ? { checked: true } : {}),
      // Seção da janela: efeitos de itens vão para «Itens» (mesmo com grupo «Ação»); as ações das
      // habilidades, para «Ações»; o resto, para «Habilidades»
      ...(option.source === 'item'
        ? { group: 'item' }
        : option.group === 'acao'
          ? { group: 'acao' }
          : {}),
    });
  }
  // Defender-se: +d6 já marcado (desmarcar = esquiva sem o dado)
  if (has.defesa) {
    abilities.push({
      key: 'defesa',
      die: DEFENSE_BONUS_DIE,
      cost: emptyCostBag(),
      available: true,
      reason: null,
      checked: true,
      // Mostrada na seção «Ações» da janela, não em «Habilidades»
      group: 'acao',
    });
  }
  if (has.naoLetal) {
    abilities.push({
      key: 'naoLetal',
      die: NON_LETHAL_BONUS_DIE,
      cost: emptyCostBag(),
      available: true,
      reason: null,
    });
  }
  const fear =
    fearDie && !ignoreFear
      ? {
          die: fearDie,
          controlPossible: fearDie > FEAR_MIN_DIE,
          controlledDie: fearDie > FEAR_MIN_DIE ? fearStepShift(fearDie, -1) : fearDie,
          controlCost: CONTROL_FEAR_COST,
          embraceCost: EMBRACE_FEAR_COST,
        }
      : null;
  const avanco = chase
    ? {
        blocked: chase.blocked ?? null,
        warning: chase.warning ?? null,
        breathMax: breathLimit(chase.folego),
        effortDice: chase.effortDice,
        dt: normalizeChaseDt(chase.dt),
      }
    : null;
  return {
    skillKey,
    attrDie,
    skillDie,
    baseExtraDice,
    abilities,
    fear,
    resources,
    wallet,
    // Reserva de dados bônus (os maiores primeiro, que são os usados antes)
    reserva: wallet.dadosBonus.length ? { dice: wallet.dadosBonus } : null,
    dt,
    showDt,
    avanco,
    // Teste de esconderijo: sem DT, sem pavor, rolagem privada (veja a ficha e stealth.js)
    esconderijo: stealth?.teste ? {} : null,
    // Esconder-se e distrair: testes com DT própria, rolagem privada e pavor normal
    furtiva:
      stealth && (stealth.esconder || stealth.distrair)
        ? { esconder: stealth.esconder ?? null, distrair: stealth.distrair ?? null }
        : null,
    // Ação chamativa: sacrificar um dado de esconderijo escolhido (veja `flashyOption`)
    chamativa: stealth?.chamativa ?? null,
    // Teste estendido (guia de desafios): o teste soma pontos a um desafio escolhido
    estendido:
      Array.isArray(challenges) && challenges.length
        ? {
            desafios: challenges.map((entry) => ({
              id: entry.id,
              nome: entry.nome,
              tipo: entry.tipo ?? 'estendido',
              dt: normalizeDt(entry.dt),
              dtRapida: normalizeDt(entry.dtRapida, 8),
              dtCautelosa: normalizeDt(entry.dtCautelosa, 6),
              // Sustentar: reduções de passo nos dois dados (rodadas já sustentadas)
              passos: Math.max(0, Math.trunc(Number(entry.passos) || 0)),
            })),
          }
        : null,
  };
}

/**
 * Saldos da janela a partir dos recursos informados: PD, PV, recursos das habilidades (com o
 * atalho antigo `impeto`) e a reserva de dados bônus válida, em ordem decrescente.
 */
function walletFrom(resources = {}) {
  return {
    pd: resources.pd ?? 0,
    pv: resources.pv ?? 0,
    recursos: { impeto: resources.impeto ?? 0, ...(resources.recursos ?? {}) },
    dadosBonus: (resources.dadosBonus ?? [])
      .filter((die) => DIE_SIDES.includes(die))
      .sort((a, b) => b - a),
  };
}

/** Escolha inicial: nada marcado e a DT padrão do teste. */
export function emptySelection(dt) {
  return {
    bonus: normalizeBonus([]),
    active: [],
    reserva: 0,
    controlFear: false,
    embraceFear: false,
    dt,
    avanco: { on: false, breath: 0, effort: false },
    esconderijo: { on: false },
    furtiva: { acao: '', destino: '' },
    chamativa: { on: false, index: null },
    estendido: { on: false, id: '', abordagem: 'rapida', alcance: 'segura' },
  };
}

/**
 * Efeito de uma escolha: custos, dado de pavor resultante, espaços de dado extra e erros.
 *
 * Todo dado extra ocupa um dos dois espaços (limite de 4 dados rolados com atributo e perícia),
 * nesta ordem: dados fixos do teste, fôlego do avanço, habilidades (o companheiro animal primeiro)
 * marcadas, dados da reserva de bônus, pavor abraçado e, por último, os bônus escolhidos à mão. O
 * que não cabe é ignorado. O dado de pavor normal não ocupa espaço.
 * @returns {{
 *   selection: object, dt: number|null, pdCost: number, pvCost: number, impetoCost: number,
 *   resourceCosts: Object<string, number>, pdLeft: number, pvLeft: number, impetoLeft: number,
 *   resourceLeft: Object<string, number>, reserva: number[], fear: {die: number|null, bonusDie: number|null}|null,
 *   slots: {kind: string, sides: number, locked: boolean}[], blocked: {abilities: string[],
 *   embrace: boolean}, rolledSides: number[], summedDice: number, errors: string[], valid: boolean
 * }}
 */
/**
 * Chave da variante da prévia dos dados: a munição marcada (vazio = nenhuma) e a caixa «contra
 * quem ainda não me atacou». A janela calcula os dados de cada combinação ao abrir e troca a
 * prévia quando essas caixas mudam.
 * @param {string|null} ammoId
 * @param {boolean} notAttacked
 */
export function diceVariantKey(ammoId, notAttacked) {
  return `${ammoId ?? ''}|${notAttacked ? 1 : 0}`;
}

export function evaluateSelection(model, selection = emptySelection(model.dt)) {
  const usable = new Map(model.abilities.filter((a) => a.available).map((a) => [a.key, a]));
  const wanted = new Set(selection.active ?? []);
  const control = Boolean(selection.controlFear) && Boolean(model.fear?.controlPossible);

  // Dados que ocupam espaço sem escolha manual, em ordem
  const locked = model.baseExtraDice.map((sides) => ({ kind: 'base', sides, locked: true }));
  // Ação chamativa: sacrifica um dado; com ela marcada, esconder-se e distrair não valem
  const flashyDice = model.chamativa?.dice ?? [];
  const flashyOn = Boolean(model.chamativa && selection.chamativa?.on);
  const flashyDie = flashyOn
    ? (flashyDice.find((die) => die.index === Number(selection.chamativa?.index)) ?? flashyDice[0])
    : null;
  const chamativa = flashyDie
    ? { on: true, index: flashyDie.index, lados: flashyDie.lados, valor: flashyDie.valor }
    : { on: false, index: null };
  // Teste estendido: marcado, o teste não vale como avanço, esconderijo, esconder-se ou distrair
  const extendedList = model.estendido?.desafios ?? [];
  const extendedChoice = Boolean(model.estendido && selection.estendido?.on)
    ? (extendedList.find((entry) => entry.id === selection.estendido?.id) ?? extendedList[0])
    : null;
  // Esconder-se ou distrair (só se a opção existe para o personagem)
  const wantedAction = chamativa.on || extendedChoice ? '' : selection.furtiva?.acao;
  const action =
    model.furtiva && STEALTH_TEST_ACTIONS.includes(wantedAction) && model.furtiva[wantedAction]
      ? wantedAction
      : '';
  const recipients = model.furtiva?.distrair?.recipients ?? [];
  const destino =
    action === 'distrair'
      ? ((recipients.find((r) => r.id === selection.furtiva?.destino) ?? recipients[0])?.id ?? '')
      : '';
  // Teste de esconderijo: o teste não tem DT nem sofre pavor, e não vale ao mesmo tempo como avanço
  const hide =
    !action &&
    !chamativa.on &&
    !extendedChoice &&
    Boolean(model.esconderijo && selection.esconderijo?.on);
  // Avanço na perseguição: o fôlego gasto vira dados d6 fixos e o esforço extra sobe um passo
  const advance =
    !hide &&
    !action &&
    !extendedChoice &&
    model.avanco &&
    !model.avanco.blocked &&
    selection.avanco?.on;
  let breath = 0;
  if (advance) {
    breath = Math.max(
      0,
      Math.min(
        Math.trunc(Number(selection.avanco.breath) || 0),
        model.avanco.breathMax,
        EXTRA_SLOTS - locked.length,
      ),
    );
    for (let i = 0; i < breath; i++) locked.push({ kind: 'folego', sides: 6, locked: true });
  }
  const effort = Boolean(advance && selection.avanco.effort);
  // A DT do avanço é a do campo da janela; sem campo (teste oposto), a DT da perseguição
  const advanceDt = advance
    ? normalizeChaseDt(model.showDt ? normalizeDt(selection.dt, model.dt) : model.avanco.dt)
    : null;
  const active = [];
  for (const [key, ability] of usable) {
    if (!wanted.has(key) || locked.length >= EXTRA_SLOTS) continue;
    active.push(key);
    locked.push({ kind: key, sides: ability.die, locked: true });
  }
  // Dados bônus da reserva: os maiores primeiro, até onde couber
  const reserve = model.reserva?.dice ?? [];
  const reserveCount = Math.max(
    0,
    Math.min(
      Math.trunc(Number(selection.reserva) || 0),
      reserve.length,
      EXTRA_SLOTS - locked.length,
    ),
  );
  const reserveDice = reserve.slice(0, reserveCount);
  for (const sides of reserveDice) locked.push({ kind: 'reserva', sides, locked: true });
  let fear = null;
  let embrace = false;
  if (model.fear && !hide) {
    const die = control ? model.fear.controlledDie : model.fear.die;
    embrace = Boolean(selection.embraceFear) && locked.length < EXTRA_SLOTS;
    fear = embrace ? { die: null, bonusDie: die } : { die, bonusDie: null };
    if (embrace) locked.push({ kind: 'pavor', sides: die, locked: true });
  }

  // O que sobra de espaço é dos bônus escolhidos à mão
  const free = Math.max(0, EXTRA_SLOTS - locked.length);
  const manual = bonusDice(selection.bonus).slice(0, free);
  const slots = [
    ...locked,
    ...manual.map((sides) => ({ kind: 'manual', sides, locked: false })),
    ...Array.from({ length: free - manual.length }, () => ({
      kind: 'vazio',
      sides: 0,
      locked: false,
    })),
  ].slice(0, Math.max(EXTRA_SLOTS, locked.length));
  const roomLeft = free - manual.length > 0;

  let total = emptyCostBag();
  for (const key of active) total = addCostBags(total, usable.get(key).cost);
  if (model.fear && !hide) {
    if (control) total.pd += model.fear.controlCost;
    if (embrace) total.pd += model.fear.embraceCost;
  }
  const wallet = model.wallet ?? walletFrom(model.resources);
  const resourceLeft = Object.fromEntries(
    Object.entries(total.recursos).map(([key, value]) => [
      key,
      (wallet.recursos[key] ?? 0) - value,
    ]),
  );

  const lockedSides = (kinds) => locked.filter((d) => kinds(d.kind)).map((d) => d.sides);
  // Sustentar: como as rodadas já sustentadas se dividem entre o atributo e a perícia
  const reduction =
    extendedChoice?.tipo === 'sustentar' && extendedChoice.passos > 0
      ? sustainReduction(model.attrDie, model.skillDie, extendedChoice.passos)
      : null;
  const plan = planDice({
    attrDie: model.attrDie,
    skillDie: model.skillDie,
    extraDice: [
      ...lockedSides((kind) => kind === 'base' || kind === 'folego'),
      ...manual,
      ...lockedSides((kind) => kind !== 'base' && kind !== 'folego'),
    ],
    stepMods: [
      ...(effort ? [{ target: 'skill', steps: 1 }] : []),
      // Sustentar: reduz o dado mais forte a cada rodada já sustentada (veja `sustainReduction`)
      ...sustainStepMods(reduction),
    ],
  });
  // Saldos que não dão: 'pd', 'pv' e as chaves dos recursos
  const errors = costShortfall(total, wallet);

  // Sem DT no teste de esconderijo (o campo some da janela enquanto a opção está marcada); no
  // esconder-se e no distrair, a DT é a da ação (7 + 3 por uso), e não a do campo
  const testDt = action
    ? model.furtiva[action].dt
    : model.showDt && !hide
      ? normalizeDt(selection.dt, model.dt)
      : null;
  const furtiva = { acao: action, destino, dt: action ? model.furtiva[action].dt : null };
  // DT do teste estendido: a do campo da janela; sem campo (teste oposto), a do desafio (na
  // escalada, a da abordagem escolhida)
  // Escalada: rápida ou cautelosa; alcançar: segura ou arriscada (cada um com o seu grupo de botões)
  const abordagem = extendedChoice
    ? approachFor(
        extendedChoice.tipo,
        extendedChoice.tipo === 'alcancar'
          ? selection.estendido?.alcance
          : selection.estendido?.abordagem,
      )
    : null;
  const estendido = extendedChoice
    ? {
        on: true,
        id: extendedChoice.id,
        dt: model.showDt
          ? normalizeDt(selection.dt, model.dt)
          : challengeDtFor(extendedChoice, abordagem),
        abordagem,
        passos: extendedChoice.tipo === 'sustentar' ? extendedChoice.passos : 0,
        // A ficha aplica estas reduções na rolagem (as mesmas da prévia)
        ...(reduction ? { reducao: reduction } : {}),
      }
    : { on: false, id: '', dt: null, abordagem: null, passos: 0 };
  return {
    selection: {
      bonus: normalizeBonus(manual),
      active,
      reserva: reserveCount,
      controlFear: control && !hide,
      embraceFear: embrace,
      dt: testDt,
      avanco: { on: Boolean(advance), breath, effort, dt: advanceDt },
      esconderijo: { on: hide },
      furtiva: { acao: action, destino },
      chamativa: { on: chamativa.on, index: chamativa.index },
      estendido: {
        on: estendido.on,
        id: estendido.id,
        abordagem: selection.estendido?.abordagem ?? 'rapida',
        alcance: selection.estendido?.alcance ?? 'segura',
      },
    },
    dt: testDt,
    pdCost: total.pd,
    pvCost: total.pv,
    impetoCost: total.recursos.impeto ?? 0,
    resourceCosts: total.recursos,
    pdLeft: wallet.pd - total.pd,
    pvLeft: wallet.pv - total.pv,
    impetoLeft: wallet.recursos.impeto - (total.recursos.impeto ?? 0),
    resourceLeft,
    reserva: reserveDice,
    fear,
    slots,
    blocked: {
      abilities: [...usable.keys()].filter((key) => !active.includes(key) && !roomLeft),
      embrace: Boolean(model.fear) && !embrace && !roomLeft,
    },
    rolledSides: plan.rolledSides,
    avanco: { on: Boolean(advance), breath, effort, dt: advanceDt },
    esconderijo: { on: hide },
    furtiva,
    chamativa,
    estendido,
    summedDice: Math.min(plan.rolledSides.length, MAX_COUNTED),
    errors,
    valid: errors.length === 0,
  };
}

/**
 * Converte a escolha nas opções que as rolagens já aceitam: `extraDice` (só os bônus manuais),
 * `active` (habilidades), `controlFear`, `embraceFear` e, se o teste tem DT, `dt`.
 */
export function selectionToOptions(model, selection) {
  const evaluated = evaluateSelection(model, selection);
  const options = {
    extraDice: bonusDice(evaluated.selection.bonus),
    active: evaluated.selection.active,
    // Dados da reserva de bônus: a ficha tira estes da reserva quando o teste rola
    ...(evaluated.reserva.length ? { useBonusDice: evaluated.reserva.length } : {}),
    controlFear: evaluated.selection.controlFear,
    embraceFear: evaluated.selection.embraceFear,
  };
  if (evaluated.dt !== null) options.dt = evaluated.dt;
  // Avanço na perseguição: quem chama (a ficha) transforma isto em dados, passo e gravação
  if (evaluated.avanco.on) options.avanco = evaluated.avanco;
  // Teste de esconderijo: quem chama (a ficha) tira o pavor, a DT e torna a rolagem privada
  if (evaluated.esconderijo.on) options.esconderijo = true;
  // Esconder-se ou distrair: quem chama (a ficha) torna a rolagem privada e guarda a ação
  if (evaluated.furtiva.acao) options.furtiva = evaluated.furtiva;
  // Ação chamativa: a ficha descarta o dado escolhido quando o teste é rolado
  if (evaluated.chamativa.on) options.chamativa = evaluated.chamativa;
  // Teste estendido: a ficha guarda na mensagem o registro do botão «somar pontos»
  if (evaluated.estendido.on) options.estendido = evaluated.estendido;
  return options;
}
