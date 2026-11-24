/**
 * Teste oposto: as janelas de escolha e a proposta pela ficha (o cartão sem rolagem).
 * Parte de `opposed-chat.js` (v0.28.8).
 */
import { matchesName, pickerModel } from '../actor-picker.js';
import { postMessage, render, skillName } from '../../rolls/chat.js';
import { weaponSkill } from '../../rolls/equipment.js';
import { cardType, createOpposedState } from '../../rolls/opposed-card.js';
import { t } from '../../shared/i18n.js';
import { createLock } from '../../shared/lock.js';
import {
  TEMPLATE_DIALOG,
  TEMPLATE_PICKER,
  candidateActors,
  defenseSkillsFor,
  otherSide,
  renderCard,
  skillChoicesFor,
  targetedOpponent,
  weaponsFor,
} from './common.js';

/**
 * Janela de escolha (proposta ou resposta). Devolve os valores do formulário ou null.
 * @param {object} context Dados do template `dialog/oposto.hbs`.
 */
async function askChoices(title, context) {
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title },
    classes: ['desordem-normal', 'desordem-oposto-janela'],
    content: await render(TEMPLATE_DIALOG, context),
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'ok',
        label: context.confirmar,
        icon: 'fa-solid fa-check',
        default: true,
        callback: (event, button) => {
          const fields = button.form.elements;
          return {
            confirmed: true,
            skill: fields.skill?.value ?? '',
            weapon: fields.weapon?.value ?? '',
            descricao: fields.descricao?.value ?? '',
          };
        },
      },
      { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
    ],
  });
  // Cancelar ou fechar devolvem outra coisa (o nome da ação ou null): só {confirmed} confirma
  return answer?.confirmed === true ? answer : null;
}

/** Primeiro passo da proposta: o tipo de disputa (devolve o nome do botão, ou null). */
async function askMode(actor) {
  const mode = await foundry.applications.api.DialogV2.wait({
    window: { title: t('DESORDEM.Oposto.ProporTitulo') },
    classes: ['desordem-normal', 'desordem-oposto-janela', 'desordem-oposto-modos'],
    content: `<p class="desordem-ficha__dica">${t('DESORDEM.Oposto.EscolhaTipo', {
      nome: Handlebars.escapeExpression(actor.name),
    })}</p>`,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'simples',
        label: t('DESORDEM.Oposto.Modo.simples'),
        icon: 'fa-solid fa-scale-balanced',
      },
      { action: 'corpo', label: t('DESORDEM.Oposto.Modo.corpo'), icon: 'fa-solid fa-hand-fist' },
      { action: 'atacar', label: t('DESORDEM.Oposto.Modo.atacar'), icon: 'fa-solid fa-crosshairs' },
      { action: 'defender', label: t('DESORDEM.Oposto.Modo.defender'), icon: 'fa-solid fa-shield' },
    ],
  });
  return ['simples', 'corpo', 'atacar', 'defender'].includes(mode) ? mode : null;
}

/**
 * Botão «Teste oposto» da ficha: escolhe o tipo, o seu lado e uma descrição curta, e publica o
 * cartão. Com um token mirado de outro ator, ele vira o oponente.
 * @param {Actor} actor
 */
export async function proposeOpposed(actor) {
  const mode = await askMode(actor);
  if (!mode) return null;
  const tipo = mode === 'atacar' || mode === 'defender' ? 'defesa' : mode;
  const opponent = targetedOpponent(actor);
  const base = {
    showDescription: true,
    opponentName: opponent?.name ?? '',
    confirmar: t('DESORDEM.Oposto.Propor'),
  };
  let side;
  if (mode === 'simples') {
    const skills = skillChoicesFor(actor);
    const answer = await askChoices(t('DESORDEM.Oposto.Modo.simples'), {
      ...base,
      skills,
      showSkill: true,
    });
    if (!answer || !skills.some((choice) => choice.key === answer.skill)) return null;
    side = { papel: 'pericia', skill: answer.skill, descricao: answer.descricao };
  } else if (mode === 'defender') {
    const skills = defenseSkillsFor(null);
    const answer = await askChoices(t('DESORDEM.Oposto.Modo.defender'), {
      ...base,
      skills,
      showSkill: true,
      note: t('DESORDEM.Oposto.DicaDefesa'),
    });
    if (!answer || !skills.some((choice) => choice.key === answer.skill)) return null;
    side = { papel: 'defesa', skill: answer.skill, descricao: answer.descricao };
  } else {
    const weapons = weaponsFor(actor, tipo);
    if (!weapons.length) {
      ui.notifications.warn(
        t(tipo === 'corpo' ? 'DESORDEM.Oposto.SemArmaCorpo' : 'DESORDEM.Oposto.SemArma'),
      );
      return null;
    }
    const answer = await askChoices(t(`DESORDEM.Oposto.Modo.${mode}`), {
      ...base,
      weapons,
      showWeapon: true,
    });
    const arma = weapons.find((weapon) => weapon.id === answer?.weapon);
    if (!arma) return null;
    side = { papel: 'ataque', skill: weaponSkill(arma), arma, descricao: answer.descricao };
  }
  const state = createOpposedState({
    tipo,
    a: {
      actorUuid: actor.uuid,
      nome: actor.name,
      papel: side.papel,
      skill: side.skill,
      skillLabel: skillName(side.skill, actor),
      arma: side.arma ?? null,
    },
    b: opponent ? { actorUuid: opponent.uuid, nome: opponent.name } : {},
    descricao: side.descricao,
  });
  return postMessage({
    actor,
    content: await renderCard(state),
    flags: { oposto: state },
    rollMode: 'publicroll',
  });
}

/** Cliques em andamento neste navegador (mensagem + botão), contra o duplo clique. */
export const inFlight = createLock();

/** Escolhe o ator de um lado em aberto (pergunta só se houver mais de um candidato). */
export async function pickActor(state, side, filter = null) {
  const candidates = candidateActors(state[otherSide(side)].actorUuid).filter(
    (actor) => !filter || filter(actor),
  );
  if (!candidates.length) {
    ui.notifications.warn(t('DESORDEM.Oposto.SemCandidatos'));
    return null;
  }
  if (candidates.length === 1) return candidates[0];
  const opponent = state[otherSide(side)];
  const proposer = opponent.actorUuid ? foundry.utils.fromUuidSync(opponent.actorUuid) : null;
  const uuid = await askActor(candidates, {
    proposerType: proposer?.type ?? null,
    opponentName: opponent.nome,
  });
  return candidates.find((actor) => actor.uuid === uuid) ?? null;
}

/**
 * Liga a janela de escolha do ator (v0.25.4): troca de aba, busca por nome e a marcação, que fica
 * sempre num ator visível da aba aberta (o «Continuar» envia o marcado).
 * @param {HTMLElement} root Elemento da janela.
 */
function wireActorPicker(root) {
  const box = root.querySelector('.desordem-oposto-ator');
  if (!box) return;
  const search = box.querySelector('.desordem-oposto-ator__busca');
  const empty = box.querySelector('.desordem-oposto-ator__vazio');
  const activeList = () => box.querySelector('.desordem-oposto-ator__lista:not([hidden])');
  // Se o marcado sumiu (outra aba ou fora da busca), marca o primeiro visível da aba aberta
  const keepSelection = () => {
    const list = activeList();
    const visible = list
      ? [...list.querySelectorAll('.desordem-oposto-ator__linha:not([hidden])')]
      : [];
    const checked = box.querySelector('input[name="actor"]:checked');
    const checkedVisible = checked && visible.some((row) => row.contains(checked));
    if (!checkedVisible) {
      if (checked) checked.checked = false;
      const first = visible[0]?.querySelector('input[name="actor"]');
      if (first) first.checked = true;
    }
    if (empty) empty.hidden = visible.length > 0;
  };
  const applySearch = () => {
    const query = search?.value ?? '';
    for (const row of box.querySelectorAll('.desordem-oposto-ator__linha')) {
      row.hidden = !matchesName(row.dataset.busca ?? '', query);
    }
    keepSelection();
  };
  for (const tab of box.querySelectorAll('.desordem-oposto-ator__aba')) {
    tab.addEventListener('click', () => {
      for (const other of box.querySelectorAll('.desordem-oposto-ator__aba')) {
        const active = other === tab;
        other.classList.toggle('is-ativa', active);
        other.setAttribute('aria-selected', String(active));
      }
      for (const list of box.querySelectorAll('.desordem-oposto-ator__lista')) {
        list.hidden = list.dataset.lista !== tab.dataset.aba;
      }
      keepSelection();
    });
  }
  search?.addEventListener('input', applySearch);
}

/**
 * Janela «Responder ao teste oposto» com abas Personagens/Criaturas, lista com retrato e busca
 * (a partir de 10 atores). Marca-se um ator e clica em «Continuar».
 * @param {Actor[]} candidates
 * @param {{proposerType: string|null, opponentName: string}} info
 * @returns {Promise<string|null>} Uuid do ator escolhido, ou null.
 */
async function askActor(candidates, { proposerType, opponentName }) {
  const model = pickerModel(candidates, {
    proposerType,
    label: (type, n) =>
      t(type === 'criatura' ? 'DESORDEM.Oposto.AbaCriaturas' : 'DESORDEM.Oposto.AbaPersonagens', {
        n,
      }),
  });
  return foundry.applications.api.DialogV2.wait({
    window: { title: t('DESORDEM.Oposto.AceitarTitulo') },
    classes: ['desordem-normal', 'desordem-oposto-janela'],
    content: await render(TEMPLATE_PICKER, { ...model, opponentName }),
    modal: true,
    rejectClose: false,
    render: (event, dialog) => wireActorPicker((dialog ?? event.target).element),
    buttons: [
      {
        action: 'ok',
        label: t('DESORDEM.Oposto.Continuar'),
        icon: 'fa-solid fa-check',
        default: true,
        callback: (event, button) => {
          const uuid = button.form.querySelector('input[name="actor"]:checked')?.value ?? '';
          if (!uuid) ui.notifications.warn(t('DESORDEM.Oposto.EscolhaAlguem'));
          return uuid || null;
        },
      },
      { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar'), callback: () => null },
    ],
  });
}

/**
 * O que o lado vai usar no teste: a escolha já feita na proposta ou, se faltar, uma janela com a
 * perícia (simples), a arma (ataque) ou a defesa. Devolve {skill, arma} ou null.
 */
export async function pickChoice(state, side, actor) {
  const data = state[side];
  const opponent = state[otherSide(side)];
  const tipo = cardType(state);
  if (data.papel === 'ataque') {
    if (data.arma) {
      const item = actor.items.get(data.arma.id);
      return item ? { skill: data.skill, arma: data.arma } : null;
    }
    const weapons = weaponsFor(actor, tipo);
    if (!weapons.length) {
      ui.notifications.warn(
        t(tipo === 'corpo' ? 'DESORDEM.Oposto.SemArmaCorpo' : 'DESORDEM.Oposto.SemArma'),
      );
      return null;
    }
    const answer = await askChoices(t('DESORDEM.Oposto.AceitarTitulo'), {
      weapons,
      showWeapon: true,
      opponentName: opponent.nome,
      note:
        opponent.papel === 'defesa' && opponent.skill === 'luta'
          ? t('DESORDEM.Oposto.DicaLuta')
          : '',
      confirmar: t('DESORDEM.Oposto.Rolar'),
    });
    const arma = weapons.find((weapon) => weapon.id === answer?.weapon);
    return arma ? { skill: weaponSkill(arma), arma } : null;
  }
  if (data.skill) return { skill: data.skill, arma: null };
  const skills =
    data.papel === 'defesa'
      ? defenseSkillsFor(opponent.arma)
      : skillChoicesFor(actor).map((choice) => ({
          ...choice,
          selected: choice.key === opponent.skill,
        }));
  const answer = await askChoices(t('DESORDEM.Oposto.AceitarTitulo'), {
    skills,
    showSkill: true,
    opponentName: opponent.nome,
    confirmar: t('DESORDEM.Oposto.Rolar'),
  });
  if (!answer || !skills.some((choice) => choice.key === answer.skill)) return null;
  return { skill: answer.skill, arma: null };
}
