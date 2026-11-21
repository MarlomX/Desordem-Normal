/* global document */
/**
 * Janela pré-teste (Foundry): o jogador escolhe dados bônus, habilidades e o que fazer com o
 * pavor antes de rolar. A lógica (opções, custos, prévia) está em `roll-dialog.js`.
 */
import { SYSTEM_ID } from '../config.js';
import {
  dialogDiceOptions,
  firstWeaponAttack,
  groupBonusDice,
  weaponAttackEffects,
} from './ability-effects.js';
import { actorEffects, actorResources } from './ability-effects-actor.js';
import { resourceName } from '../sheets/ability-controls.js';
import { advanceDtField } from './chase.js';
import { render, testDicePreview } from './chat.js';
import { buildFearDie } from '../sheets/dado-pavor.js';
import { testResources } from './threat.js';
import { armorPenaltyLine, armorSkillPenalties } from './equipment.js';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from './roll-dialog.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/dialog/pre-teste.hbs`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Opções da janela com rótulo e origem próprios no idioma; as outras usam os genéricos. */
const KNOWN_OPTIONS = ['impetoDado', 'sorrateiro', 'naoLetal', 'defesa'];
const KNOWN_ORIGINS = [...KNOWN_OPTIONS, 'base', 'pavor', 'folego', 'manual', 'vazio', 'reserva'];

/** Opção marcada na seção de furtividade ('' = teste comum). */
const stealthChoice = (form) =>
  form.querySelector('input[name="furtivaAcao"]:checked')?.value ?? '';

/** Lê a escolha atual dos campos da janela. */
function readSelection(form) {
  const fields = form.elements;
  return {
    bonus: [Number(fields.bonus0?.value), Number(fields.bonus1?.value)],
    active: [...form.querySelectorAll('input[name="active"]:checked')].map((box) => box.value),
    // Dados da reserva de bônus a usar (quantidade)
    reserva: Number(fields.reserva?.value ?? 0),
    controlFear: Boolean(fields.controlFear?.checked),
    embraceFear: Boolean(fields.embraceFear?.checked),
    dt: fields.dt?.value,
    avanco: {
      on: Boolean(fields.avancoOn?.checked),
      breath: Number(fields.avancoBreath?.value ?? 0),
      effort: Boolean(fields.avancoEffort?.checked),
    },
    // Seção de furtividade: uma opção por vez (rádio): '', 'teste', 'esconder' ou 'distrair'
    esconderijo: { on: stealthChoice(form) === 'teste' },
    furtiva: {
      acao: ['esconder', 'distrair'].includes(stealthChoice(form)) ? stealthChoice(form) : '',
      destino: fields.furtivaDestino?.value ?? '',
    },
    chamativa: {
      on: Boolean(fields.chamativaOn?.checked),
      index: fields.chamativaDado?.value ?? null,
    },
    // Teste estendido (guia de desafios): a caixa e o desafio escolhido
    estendido: {
      on: Boolean(fields.estendidoOn?.checked),
      id: fields.estendidoId?.value ?? '',
      // Escalada: rápida ou cautelosa (dois botões que se excluem)
      abordagem: form.querySelector('input[name="estendidoAbordagem"]:checked')?.value ?? 'rapida',
      // Alcançar: segura ou arriscada (outro par de botões)
      alcance: form.querySelector('input[name="estendidoAlcance"]:checked')?.value ?? 'segura',
    },
  };
}

/** Cria o desenho de um dado para a prévia (o dado de pavor usa o desenho neon em SVG). */
function previewDie(sides, { fear = false } = {}) {
  const el = document.createElement('span');
  if (fear) {
    // buildFearDie só deixa dígitos no SVG, então é seguro usar como HTML
    el.className = 'desordem-previa-pavor';
    el.innerHTML = buildFearDie({ sides });
    return el;
  }
  el.className = `desordem-forma desordem-forma--grande desordem-d-${sides}`;
  const value = document.createElement('span');
  value.className = 'desordem-forma__valor';
  value.textContent = String(sides);
  el.append(value);
  return el;
}

/**
 * Cria um espaço de dado extra. Espaços travados (habilidade, pavor, dado fixo) mostram a origem e
 * não têm menu; espaços livres têm o menu de dado e valem como bônus manual.
 */
function slotElement(slot, manualIndex) {
  const wrapper = document.createElement('span');
  wrapper.className = 'desordem-pre__slot';
  wrapper.classList.toggle('is-travado', slot.locked);

  const die = document.createElement('span');
  die.className = `desordem-forma desordem-forma--grande desordem-d-${slot.sides}`;
  die.classList.toggle('is-vazio', slot.sides === 0);
  const value = document.createElement('span');
  value.className = 'desordem-forma__valor';
  value.textContent = slot.sides === 0 ? '✕' : String(slot.sides);
  die.append(value);

  if (!slot.locked) {
    const select = document.createElement('select');
    select.className = 'desordem-forma__select';
    select.name = `bonus${manualIndex}`;
    for (const sides of [0, 4, 6, 8, 10, 12]) {
      const option = document.createElement('option');
      option.value = String(sides);
      option.textContent = sides === 0 ? t('DESORDEM.Ficha.Bonus.Vazio') : `d${sides}`;
      option.selected = sides === slot.sides;
      select.append(option);
    }
    die.append(select);
  }

  const origin = document.createElement('small');
  origin.className = 'desordem-pre__origem';
  const kind = KNOWN_ORIGINS.includes(slot.kind) ? slot.kind : 'habilidade';
  origin.textContent = t(`DESORDEM.Teste.Pre.Origem.${kind}`);
  wrapper.append(die, origin);
  return wrapper;
}

/**
 * Bloco de custo com número grande (PD, PV, ímpeto ou outro recurso): "−3 PD · restam 7".
 * @param {string} kind 'pd', 'pv', 'impeto' ou a chave de outro recurso.
 * @param {number} spent
 * @param {number} left
 * @param {string} [unitText] Nome do recurso (para os que não têm unidade própria no idioma).
 */
function costBlock(kind, spent, left, unitText = '') {
  const known = ['pd', 'pv', 'impeto'].includes(kind);
  const block = document.createElement('div');
  block.className = `desordem-custo desordem-custo--${known ? kind : 'recurso'}`;
  block.classList.toggle('is-negativo', left < 0);
  const amount = document.createElement('strong');
  amount.textContent = `−${spent}`;
  const unit = document.createElement('span');
  unit.className = 'desordem-custo__unidade';
  unit.textContent = known ? t(`DESORDEM.Teste.Pre.Unidade.${kind}`) : unitText;
  const remaining = document.createElement('small');
  remaining.textContent = t('DESORDEM.Teste.Pre.Restam', { n: left });
  block.append(amount, unit, remaining);
  return block;
}

/**
 * Marcar "usar como teste de avanço" muda a DT do campo para a da perseguição (padrão 10, o mestre
 * pode mudar); desmarcar volta à DT de antes. Depois de marcar, a DT continua editável e é ela que
 * vale para o avanço. Em testes sem campo de DT (como a esquiva) não há o que trocar.
 */
function syncAdvanceDt(form, on) {
  const field = form.elements.dt;
  if (!field) return;
  const saved = field.dataset.dtAntes ? Number(field.dataset.dtAntes) : null;
  const chaseDt = Number(form.querySelector('[data-avanco]')?.dataset.dt);
  const next = advanceDtField({
    on,
    current: Number(field.value),
    saved,
    dt: Number.isFinite(chaseDt) && chaseDt > 0 ? chaseDt : undefined,
  });
  field.value = String(next.value);
  if (next.saved === null) delete field.dataset.dtAntes;
  else field.dataset.dtAntes = String(next.saved);
}

/**
 * DT do desafio escolhido na seção do teste estendido: na escalada, a da abordagem marcada
 * (rápida ou cautelosa); nos demais, a DT do desafio. `NaN` se não houver desafio.
 */
function selectedChallengeDt(form) {
  const option = form.elements.estendidoId?.selectedOptions?.[0];
  if (!option) return Number.NaN;
  if (option.dataset.tipo === 'alcancar') {
    // Arriscada: a DT da segura (do ambiente) +3
    const risky = form.querySelector('input[name="estendidoAlcance"]:checked')?.value === 'arriscada';
    return Math.min(40, Number(option.dataset.dt) + (risky ? 3 : 0));
  }
  if (option.dataset.tipo !== 'escalar') return Number(option.dataset.dt);
  const approach = form.querySelector('input[name="estendidoAbordagem"]:checked')?.value;
  return Number(approach === 'cautelosa' ? option.dataset.dtCautelosa : option.dataset.dtRapida);
}

/**
 * Marcar «usar no desafio» muda a DT do campo para a do desafio escolhido; trocar de
 * desafio com a caixa marcada troca a DT; desmarcar volta à DT de antes. Usa o mesmo lugar de
 * guardar a DT anterior que o avanço (por isso o avanço é desmarcado antes, veja o `change`).
 */
function syncExtendedDt(form, on) {
  const field = form.elements.dt;
  if (!field) return;
  const saved = field.dataset.dtAntes ? Number(field.dataset.dtAntes) : null;
  const challengeDt = selectedChallengeDt(form);
  const next = advanceDtField({
    on,
    current: Number(field.value),
    saved,
    dt: Number.isFinite(challengeDt) && challengeDt > 0 ? challengeDt : undefined,
  });
  field.value = String(next.value);
  if (next.saved === null) delete field.dataset.dtAntes;
  else field.dataset.dtAntes = String(next.saved);
}

/** Atualiza prévia, espaços, bloqueios, custos e o botão de rolar conforme as escolhas. */
function refresh(form, root, model) {
  const evaluation = evaluateSelection(model, readSelection(form));

  // Espaços de dado extra (refeitos a cada mudança; os bônus manuais mantêm seus valores)
  let manualIndex = 0;
  root
    .querySelector('[data-slots]')
    .replaceChildren(
      ...evaluation.slots.map((slot) => slotElement(slot, slot.locked ? -1 : manualIndex++)),
    );

  // Habilidades e pavor abraçado sem espaço livre ficam bloqueados (menos as já marcadas)
  const noRoom = t('DESORDEM.Teste.Pre.SemEspaco');
  for (const option of root.querySelectorAll('[data-opcao]')) {
    const key = option.dataset.opcao;
    const input = option.querySelector('input');
    const blocked =
      key === 'embrace' ? evaluation.blocked.embrace : evaluation.blocked.abilities.includes(key);
    const unavailable = model.abilities.some((a) => a.key === key && !a.available);
    input.disabled = unavailable || blocked;
    option.classList.toggle('is-indisponivel', unavailable || blocked);
    option.querySelector('[data-motivo]').textContent = blocked ? noRoom : '';
  }

  // Avanço na perseguição: mostra fôlego e esforço extra só com a opção marcada. O fôlego ocupa os
  // espaços de dado extra, então a quantidade pode ser reduzida para caber.
  const advance = root.querySelector('[data-avanco]');
  if (advance) {
    advance
      .querySelector('[data-avanco-detalhes]')
      ?.classList.toggle('is-oculta', !evaluation.avanco.on);
    const breathField = form.elements.avancoBreath;
    if (breathField && evaluation.avanco.on) {
      if (Number(breathField.value) !== evaluation.avanco.breath) {
        breathField.value = String(evaluation.avanco.breath);
      }
    }
  }

  // Teste de esconderijo: sem DT e sem pavor enquanto a opção está marcada; não vale como avanço.
  // Esconder-se e distrair: a DT é a da ação (o campo some), o pavor continua valendo.
  const hiding = evaluation.esconderijo.on || Boolean(evaluation.furtiva.acao);
  root.querySelector('[data-dt-bloco]')?.classList.toggle('is-oculta', hiding);
  root
    .querySelector('[data-pavor-bloco]')
    ?.classList.toggle('is-oculta', evaluation.esconderijo.on);
  root
    .querySelector('[data-furtiva-destino]')
    ?.classList.toggle('is-oculta', evaluation.furtiva.acao !== 'distrair');
  // Ação chamativa: mostra a escolha do dado e desliga esconder-se e distrair (volta ao comum)
  const flashy = evaluation.chamativa.on;
  root.querySelector('[data-chamativa-dado]')?.classList.toggle('is-oculta', !flashy);
  for (const radio of root.querySelectorAll('input[name="furtivaAcao"]')) {
    if (radio.value === 'esconder' || radio.value === 'distrair') {
      radio.disabled = flashy;
      if (flashy && radio.checked) {
        radio.checked = false;
        const plain = root.querySelector('input[name="furtivaAcao"][value=""]');
        if (plain) plain.checked = true;
      }
    }
  }
  // Teste estendido marcado: o teste não pode valer como esconderijo, esconder-se, distrair ou
  // avanço (a ação chamativa continua valendo). Mostra a escolha do desafio só com a caixa marcada.
  const extended = evaluation.estendido.on;
  root.querySelector('[data-estendido-detalhes]')?.classList.toggle('is-oculta', !extended);
  // Escalada: rápida ou cautelosa só aparece com um desafio de escalada escolhido
  const kind = form.elements.estendidoId?.selectedOptions?.[0]?.dataset.tipo;
  root.querySelector('[data-estendido-escalar]')?.classList.toggle('is-oculta', kind !== 'escalar');
  // Alcançar: segura ou arriscada; sustentar: o aviso das reduções de passo
  root.querySelector('[data-estendido-alcancar]')?.classList.toggle('is-oculta', kind !== 'alcancar');
  root.querySelector('[data-estendido-sustentar]')?.classList.toggle('is-oculta', kind !== 'sustentar');
  for (const radio of root.querySelectorAll('input[name="furtivaAcao"]')) {
    if (radio.value === '') continue;
    // A ação chamativa já desliga esconder-se e distrair (acima); aqui desliga todas as três
    radio.disabled = extended || (flashy && radio.value !== 'teste');
    if (extended && radio.checked) {
      radio.checked = false;
      const plain = root.querySelector('input[name="furtivaAcao"][value=""]');
      if (plain) plain.checked = true;
    }
  }
  const advanceBox = form.elements.avancoOn;
  if (advanceBox && !root.querySelector('[data-avanco]')?.dataset.bloqueado) {
    advanceBox.disabled = hiding || extended;
    if (hiding && advanceBox.checked) {
      // Desmarcar o avanço devolve a DT que estava no campo antes dele
      advanceBox.checked = false;
      syncAdvanceDt(form, false);
    }
  }

  // Prévia dos dados rolados (o dado de pavor normal aparece por último, fora do limite)
  root
    .querySelector('[data-previa]')
    .replaceChildren(
      ...evaluation.rolledSides.map((sides) => previewDie(sides)),
      ...(evaluation.fear?.die ? [previewDie(evaluation.fear.die, { fear: true })] : []),
    );

  // Custos em destaque
  const costs = root.querySelector('[data-custos]');
  const blocks = [];
  if (evaluation.pdCost) blocks.push(costBlock('pd', evaluation.pdCost, evaluation.pdLeft));
  if (evaluation.pvCost) blocks.push(costBlock('pv', evaluation.pvCost, evaluation.pvLeft));
  for (const [key, spent] of Object.entries(evaluation.resourceCosts)) {
    if (!spent) continue;
    blocks.push(
      costBlock(key, spent, evaluation.resourceLeft[key], model.resourceNames?.[key] ?? key),
    );
  }
  if (blocks.length) {
    costs.replaceChildren(...blocks);
  } else {
    const none = document.createElement('span');
    none.className = 'desordem-custo__nenhum';
    none.textContent = t('DESORDEM.Teste.Pre.SemCusto');
    costs.replaceChildren(none);
  }
  root.querySelector('[data-erro]').textContent = evaluation.errors
    .map((key) =>
      ['pd', 'pv', 'impeto'].includes(key)
        ? t(`DESORDEM.Teste.Pre.Erro.${key}`)
        : t('DESORDEM.Teste.Pre.Erro.recurso', { nome: model.resourceNames?.[key] ?? key }),
    )
    .join(' ');

  // Dados bônus: a quantidade escolhida pode cair para caber nos espaços livres
  const reserveField = form.elements.reserva;
  if (reserveField && Number(reserveField.value) !== evaluation.reserva.length) {
    reserveField.value = String(evaluation.reserva.length);
  }
  root.classList.toggle('tem-erro', !evaluation.valid);

  const roll = root.closest('.application')?.querySelector('[data-action="roll"]');
  if (roll) roll.disabled = !evaluation.valid;
}

/**
 * Abre a janela pré-teste e devolve as opções para a rolagem (`extraDice`, `active`, `controlFear`,
 * `embraceFear`), ou `null` se o jogador cancelar. Com Shift, rola direto, sem janela.
 * @param {Actor} actor
 * @param {Object} config
 * @param {string} config.skillKey Perícia ou aptidão do teste.
 * @param {string} [config.attribute] Atributo, se não for o padrão da perícia.
 * @param {number[]} [config.baseExtraDice] Dados extras fixos do teste (companheiro, não letal).
 * @param {boolean} [config.ignoreFear] Testes que não sofrem o dado de pavor.
 * @param {number} [config.dt=7] DT padrão do teste (editável na janela).
 * @param {boolean} [config.showDt=true] Falso em testes sem DT (esquiva).
 * @param {boolean} [config.allowNonLethal=false] Oferece "dano não letal" (só no teste de lesão).
 * @param {object|null} [config.chase] Com perseguição em andamento, os dados do participante para
 *   oferecer "usar como teste de avanço" (veja `buildRollModel`). Sem isso, a opção não aparece.
 * @param {object|null} [config.stealth] Com cena de furtividade, o que a seção oferece (teste de
 *   esconderijo, esconder-se, distrair; veja `stealthOptions`). Sem isso, a seção não aparece.
 * @param {{id: string, nome: string, dt: number}[]} [config.challenges] Testes estendidos ativos
 *   de que o personagem participa: com algum, a janela oferece «usar no desafio».
 * @param {boolean} [config.allowDefense] Teste de Defender-se: oferece o +d6 já marcado.
 * @param {string} [config.testKind] Tipo do teste para os filtros dos dados extras: qualquer,
 *   ataqueCorpo ou ataqueDistancia (a defesa vem de `allowDefense`). Volta nas escolhas.
 * @param {string|null} [config.weaponId] Ataque com uma arma: o id dela, para os efeitos da arma
 *   entrarem na janela. Volta nas escolhas (a rolagem usa o mesmo).
 * @param {object[]} [config.stepMods] Passos próprios deste teste, só para a prévia dos dados
 *   (quem rola precisa passar os mesmos passos ao teste).
 * @param {boolean} [config.shift] Pular a janela (Shift+clique).
 */
export async function askRollChoices(
  actor,
  {
    skillKey,
    attribute,
    baseExtraDice = [],
    ignoreFear = false,
    dt = 7,
    showDt = true,
    allowNonLethal = false,
    chase = null,
    stealth = null,
    challenges = [],
    allowDefense = false,
    testKind = 'qualquer',
    weaponId = null,
    stepMods = [],
    shift = false,
  },
) {
  // O tipo do teste (e a arma do ataque) voltam nas escolhas, para a rolagem filtrar os dados
  // extras do mesmo jeito
  const kind = {
    ...(testKind === 'qualquer' ? {} : { testKind }),
    ...(weaponId ? { weaponId } : {}),
  };
  // Pular a janela usa as escolhas padrão: na defesa, o +d6 (que vem marcado)
  if (shift) return allowDefense ? { active: ['defesa'], ...kind } : { ...kind };
  // Efeitos da arma do ataque (só com `weaponId`): os automáticos já entram na prévia dos dados
  // (o passo no dado da perícia), e a caixa «quem ainda não me atacou» vira uma opção da janela
  const entries = actorEffects(actor, { weaponId });
  const attack = weaponId
    ? weaponAttackEffects(entries, {
        firstAttack: firstWeaponAttack(actor.system.cena, weaponId),
      })
    : { steps: 0, lines: [] };
  // Penalidade das armaduras em uso nesta perícia (a prévia já a inclui, por `testDicePreview`)
  const penalty = armorPenaltyLine(armorSkillPenalties(actor.items), skillKey);
  const penaltyLines = penalty ? [penalty] : [];
  const dice = testDicePreview(actor, skillKey, attribute, [
    ...stepMods,
    ...(attack.steps ? [{ target: 'skill', steps: attack.steps }] : []),
  ]);
  // PD, ímpeto e pavor (0 numa criatura: a janela não mostra pavor nem custos)
  const resources = testResources(actor.system);
  // Recursos das habilidades (valores e nomes) e reserva de dados bônus
  const abilityResources = actorResources(actor, entries);
  const model = buildRollModel({
    skillKey,
    attrDie: dice.attrDie,
    skillDie: dice.skillDie,
    baseExtraDice,
    has: { naoLetal: allowNonLethal, defesa: allowDefense },
    // Dados extras dos efeitos das habilidades (ímpeto, furtivo...), filtrados pela perícia
    diceOptions: dialogDiceOptions(entries, {
      skillKey,
      testKind: allowDefense ? 'defesa' : testKind,
    }),
    resources: {
      pd: resources.pd,
      pv: actor.system.pv?.value ?? 0,
      recursos: abilityResources.values,
      dadosBonus: actor.system.dadosBonus ?? [],
    },
    fearDie: resources.fearDie,
    ignoreFear,
    dt,
    showDt,
    chase,
    stealth,
    challenges,
  });

  // Nomes dos recursos (custos, erros e motivos de indisponível)
  model.resourceNames = Object.fromEntries(
    Object.values(abilityResources.defs).map((def) => [def.chave, resourceName(def, t)]),
  );
  const resourceText = (key, n) =>
    key === 'impeto'
      ? t('DESORDEM.Teste.Pre.CustoImpeto', { n })
      : t('DESORDEM.Teste.Pre.CustoRecurso', { n, nome: model.resourceNames[key] ?? key });
  const costText = (cost) =>
    [
      cost.pd ? t('DESORDEM.Teste.Pre.CustoPD', { n: cost.pd }) : '',
      cost.pv ? t('DESORDEM.Teste.Pre.CustoPV', { n: cost.pv }) : '',
      ...Object.entries(cost.recursos ?? {}).map(([key, n]) => (n ? resourceText(key, n) : '')),
    ]
      .filter(Boolean)
      .join(' · ');
  const reasonText = (reason) =>
    ['pd', 'pv', 'impeto'].includes(reason)
      ? t(`DESORDEM.Teste.Pre.Indisponivel.${reason}`)
      : t('DESORDEM.Teste.Pre.Indisponivel.recurso', {
          nome: model.resourceNames[reason] ?? reason,
        });
  const abilityRows = model.abilities.map((ability) => ({
    ...ability,
    // As opções conhecidas têm rótulo próprio; as outras, o nome da habilidade e o dado
    label: KNOWN_OPTIONS.includes(ability.key)
      ? t(`DESORDEM.Teste.Pre.Hab.${ability.key}`, { die: ability.die })
      : t('DESORDEM.Teste.Pre.HabEfeito', { nome: ability.itemName ?? '', die: ability.die }),
    costText: costText(ability.cost),
    reasonText: ability.reason ? reasonText(ability.reason) : '',
  }));
  const content = await render(TEMPLATE, {
    titulo: `${dice.attrLabel} + ${dice.skillLabel}`,
    showDt,
    dt,
    esconderijo: Boolean(model.esconderijo),
    temFurtividade: Boolean(model.esconderijo || model.furtiva || model.chamativa),
    chamativa: model.chamativa && {
      dados: model.chamativa.dice.map((die) => ({
        index: die.index,
        label: `d${die.lados} = ${die.valor}`,
      })),
    },
    furtiva: model.furtiva && {
      esconderTexto: model.furtiva.esconder
        ? t('DESORDEM.Furtividade.Pre.Esconder', { dt: model.furtiva.esconder.dt })
        : '',
      distrairTexto: model.furtiva.distrair
        ? t('DESORDEM.Furtividade.Pre.Distrair', { dt: model.furtiva.distrair.dt })
        : '',
      destinos: (model.furtiva.distrair?.recipients ?? []).map((r) => ({
        id: r.id,
        name: r.self ? t('DESORDEM.Furtividade.Pre.Voce', { nome: r.name }) : r.name,
      })),
    },
    avanco: model.avanco && {
      motivo: model.avanco.blocked
        ? t(`DESORDEM.Perseguicao.Pre.Bloqueio.${model.avanco.blocked}`, {
            pericia: dice.skillLabel,
          })
        : '',
      // Lembrete pequeno (não bloqueia): perícia já usada para avançar
      aviso: model.avanco.warning
        ? t(`DESORDEM.Perseguicao.Pre.Aviso.${model.avanco.warning}`)
        : '',
      dt: model.avanco.dt,
      hasBreath: model.avanco.breathMax > 0,
      folego: chase.folego,
      breathOptions: Array.from({ length: model.avanco.breathMax + 1 }, (_, n) => ({ n })),
      esforcoTexto: t('DESORDEM.Perseguicao.Pre.Esforco', { dados: model.avanco.effortDice }),
    },
    // Teste estendido: os desafios do personagem, com a DT de cada um (lida ao marcar a caixa)
    estendido: model.estendido && {
      desafios: model.estendido.desafios.map((entry) => ({
        id: entry.id,
        tipo: entry.tipo,
        dt: entry.dt,
        dtRapida: entry.dtRapida,
        dtCautelosa: entry.dtCautelosa,
        passos: entry.passos,
        // Na escalada e no alcançar a DT depende da abordagem (mostrada nos botões)
        label: ['escalar', 'alcancar'].includes(entry.tipo)
          ? entry.nome
          : t('DESORDEM.Desafio.Pre.Opcao', { nome: entry.nome, dt: entry.dt }),
      })),
    },
    // Reserva de dados bônus: escolher quantos usar (os maiores primeiro)
    reserva: model.reserva && {
      texto: t('DESORDEM.Teste.Pre.ReservaTexto', {
        dados: groupBonusDice(model.reserva.dice)
          .map(({ die, count }) => `${count}d${die}`)
          .join(' + '),
      }),
      options: Array.from({ length: model.reserva.dice.length + 1 }, (_, n) => ({ n })),
    },
    // Habilidades, ações (ex.: Defender-se) e itens usam o mesmo campo `active`; só a seção muda
    abilities: abilityRows.filter((ability) => !['acao', 'item'].includes(ability.group)),
    actions: abilityRows.filter((ability) => ability.group === 'acao'),
    // Seção «Itens»: dados extras de itens e as linhas dos efeitos da arma do ataque
    items: abilityRows.filter((ability) => ability.group === 'item'),
    // Linhas automáticas: efeitos da arma e penalidade das armaduras nesta perícia
    weaponLines: [...attack.lines, ...penaltyLines].map((line) => ({
      ...line,
      label: t(`DESORDEM.Teste.Pre.Arma.${line.kind}`, {
        nome: line.itemName,
        valor: line.value,
        quando: line.quando ? t(`DESORDEM.Efeito.QuandoAtaque.${line.quando}`).toLowerCase() : '',
      }),
    })),
    hasItems:
      abilityRows.some((ability) => ability.group === 'item') ||
      attack.lines.length + penaltyLines.length > 0,
    fear: model.fear && {
      ...model.fear,
      title: t('DESORDEM.Teste.Pre.Pavor', { die: model.fear.die }),
      controlText: model.fear.controlPossible
        ? t('DESORDEM.Teste.Pre.ControlarEfeito', {
            custo: model.fear.controlCost,
            die: model.fear.controlledDie,
          })
        : t('DESORDEM.Teste.Pre.ControlarNaoDesce'),
      embraceText: t('DESORDEM.Teste.Pre.AbracarEfeito', { custo: model.fear.embraceCost }),
    },
  });

  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: t('DESORDEM.Teste.Pre.Titulo') },
    classes: ['desordem-normal', 'desordem-pre-teste'],
    content,
    modal: true,
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element.querySelector('.desordem-pre');
      const form = root.closest('form') ?? dialog.element.querySelector('form');
      form.addEventListener('change', (event) => {
        if (event.target.name === 'avancoOn') syncAdvanceDt(form, event.target.checked);
        if (event.target.name === 'estendidoOn') {
          // Desmarca o avanço antes (devolve a DT dele), para as duas não guardarem a DT juntas
          if (event.target.checked && form.elements.avancoOn?.checked) {
            form.elements.avancoOn.checked = false;
            syncAdvanceDt(form, false);
          }
          syncExtendedDt(form, event.target.checked);
        }
        const changesDt = ['estendidoId', 'estendidoAbordagem', 'estendidoAlcance'].includes(
          event.target.name,
        );
        if (changesDt && form.elements.estendidoOn?.checked) {
          // Troca de desafio ou de abordagem: a DT passa a ser a nova (a de antes fica guardada)
          const field = form.elements.dt;
          const challengeDt = selectedChallengeDt(form);
          if (field && Number.isFinite(challengeDt) && challengeDt > 0) {
            field.value = String(challengeDt);
          }
        }
        refresh(form, root, model);
      });
      form.addEventListener('input', (event) => {
        if (event.target.name === 'dt') refresh(form, root, model);
      });
      for (const button of root.querySelectorAll('[data-dt-passo]')) {
        button.addEventListener('click', () => {
          const field = form.elements.dt;
          field.value = String(
            Math.max(1, Number(field.value || dt) + Number(button.dataset.dtPasso)),
          );
          refresh(form, root, model);
        });
      }
      refresh(form, root, model);
    },
    buttons: [
      {
        action: 'roll',
        label: t('DESORDEM.Teste.Pre.Rolar'),
        icon: 'fa-solid fa-dice-d20',
        default: true,
        callback: (event, button) => ({
          confirmed: true,
          selection: readSelection(button.form),
          // Passo da arma contra quem ainda não atacou: a caixa da seção «Itens»
          naoAtacou: Boolean(button.form.querySelector('input[name="naoAtacou"]:checked')),
        }),
      },
      { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
    ],
  });
  // Só o botão Rolar confirma. Cancelar e fechar a janela devolvem outra coisa (o nome da ação
  // ou null) e não podem rolar.
  if (answer?.confirmed !== true) return null;
  return {
    ...selectionToOptions(model, answer.selection),
    ...kind,
    ...(answer.naoAtacou ? { naoAtacou: true } : {}),
  };
}

export { emptySelection };
