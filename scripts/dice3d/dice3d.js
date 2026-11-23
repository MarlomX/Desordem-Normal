/* global document, requestAnimationFrame, performance */
/**
 * Ligação opcional com o módulo Dice So Nice (v0.25.2). Só faz algo se o módulo estiver ativo:
 * no hook `diceSoNiceReady` registra o conjunto de cores do dado de pavor, o efeito especial
 * «Aura de pavor» e (v0.25.6) o sistema de dados do pavor, com os números em brilho. Também
 * (v0.25.6) liga a aura já no lançamento: no hook `diceSoNiceRollStart`, procura na mesa os dados
 * marcados com a aura. `markFearDice` é chamada por `executeTest` (scripts/rolls/chat.js) logo depois
 * de rolar, antes da mensagem ir ao chat, para todos os testes do sistema.
 * As decisões ficam em funções puras (`fear-dice.js`); aqui só a conversa com o Foundry e com o
 * Dice So Nice.
 */
import { SYSTEM_ID } from '../config.js';
import FearAppearanceApp, { savedFearStyle } from './appearance-app.js';
import {
  AURA_OUTLINE_FIELDS,
  DSN_MODULE_ID,
  FEAR_AURA_OUTLINE,
  FEAR_AURA_SFX,
  FEAR_FONT,
  FEAR_DICE_SYSTEM,
  FEAR_STYLE_SETTING,
  decorateFearRolls,
  fearAppearance,
  fearColorsetData,
  fearDicePresets,
  fearRollIndexes,
  wantsAura,
} from './fear-dice.js';

/** Por quanto tempo (ms), depois do início de uma rolagem, procurar os dados com aura na mesa. */
const AURA_WATCH_MS = 5000;

/** Se o Dice So Nice está ativo neste mundo (sem ele, o sistema não mexe nos Rolls). */
export const diceSoNiceActive = () => Boolean(game.modules.get(DSN_MODULE_ID)?.active);

/**
 * Valores originais do contorno do Dice So Nice, guardados na primeira aura e devolvidos quando a
 * última aura termina. `WeakMap`: a chave é o próprio objeto do contorno (um por mesa de dados).
 */
const savedOutline = new WeakMap();

/** Dados com aura ligada em cada contorno (o mesmo objeto do contorno serve a todos os dados). */
const auraMeshes = new WeakMap();

/** Guarda os valores do contorno (cores copiadas, números como estão). */
function saveOutline(pass) {
  const saved = {};
  for (const field of AURA_OUTLINE_FIELDS) {
    const value = pass[field];
    saved[field] = value?.clone ? value.clone() : value;
  }
  savedOutline.set(pass, saved);
}

/** Aplica (ou devolve) valores ao contorno: cores pelo `set` do three.js, números direto. */
function applyOutline(pass, values) {
  for (const field of AURA_OUTLINE_FIELDS) {
    const value = values[field];
    if (value === undefined) continue;
    if (pass[field]?.set) pass[field].set(value);
    else pass[field] = value;
  }
}

/**
 * Tira da lista de auras os dados que já saíram da mesa (o Dice So Nice limpa a mesa entre
 * rolagens). Assim uma aura que ficou para trás não segura o contorno mudado.
 * @param {object} box Mesa de dados do Dice So Nice.
 * @param {Set<object>} set
 */
function pruneAuras(box, set) {
  const alive = new Set([...(box?.diceList ?? []), ...(box?.deadDiceList ?? [])]);
  for (const mesh of set) {
    if (alive.has(mesh)) continue;
    set.delete(mesh);
    if (box?.outlinePass) {
      box.outlinePass.selectedObjects = box.outlinePass.selectedObjects.filter((m) => m !== mesh);
    }
  }
}

/**
 * Liga a aura num dado (pode ser chamada de novo para o mesmo dado: nada muda). Na primeira aura
 * do contorno, guarda os valores dele e aplica os da aura.
 * @param {object} box Mesa de dados do Dice So Nice.
 * @param {object} mesh O dado (malha 3D).
 * @returns {boolean} false se não há contorno (iluminação realista desligada).
 */
function auraOn(box, mesh) {
  const pass = box?.outlinePass;
  if (!pass?.selectedObjects || !mesh) return false;
  let set = auraMeshes.get(pass);
  if (!set) auraMeshes.set(pass, (set = new Set()));
  pruneAuras(box, set);
  if (set.has(mesh)) return true;
  if (set.size === 0) saveOutline(pass);
  set.add(mesh);
  applyOutline(pass, FEAR_AURA_OUTLINE);
  if (!pass.selectedObjects.includes(mesh)) pass.selectedObjects.push(mesh);
  return true;
}

/**
 * Desliga a aura de um dado. Quando a última termina, o contorno volta como era (para o efeito
 * «contorno» do próprio módulo).
 * @param {object} box
 * @param {object} mesh
 */
function auraOff(box, mesh) {
  const pass = box?.outlinePass;
  if (!pass?.selectedObjects) return;
  pass.selectedObjects = pass.selectedObjects.filter((m) => m !== mesh);
  const set = auraMeshes.get(pass);
  if (!set) return;
  set.delete(mesh);
  pruneAuras(box, set);
  if (set.size === 0 && savedOutline.has(pass)) applyOutline(pass, savedOutline.get(pass));
}

/**
 * Aura desde o lançamento (v0.25.6): o Dice So Nice só toca efeitos quando o dado para, então,
 * a cada quadro, por alguns segundos depois do início da rolagem, o sistema procura na mesa os
 * dados marcados com a aura e a liga neles. Quando o dado para, o efeito «Aura de pavor» encontra
 * a aura já ligada e só cuida de desligá-la no fim. Se algo mudar no Dice So Nice e a busca não
 * achar os dados, a aura continua aparecendo no fim, como antes.
 */
function watchAuraDice() {
  const box = game.dice3d?.box;
  if (!box?.outlinePass) return;
  const until = performance.now() + AURA_WATCH_MS;
  const step = () => {
    for (const mesh of box.diceList ?? []) {
      if (wantsAura(mesh.options)) auraOn(box, mesh);
    }
    if (performance.now() < until) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Efeito especial «Aura de pavor» no formato que o Dice So Nice espera de um efeito (como os dele,
 * em module/sfx/): `id` e nome estáticos, `init`, construtor com a mesa (`box`) e o dado
 * (`dicemesh`), `play` e `destroy`. Faz o mesmo que o efeito «contorno» do módulo, mas com a cor e
 * o brilho da aura de pavor.
 *
 * O contorno (`box.outlinePass`) só existe com a iluminação realista ligada nas configurações do
 * Dice So Nice de quem assiste; sem ele, `play` devolve `false` e nada acontece.
 */
class FearAuraSfx {
  static id = FEAR_AURA_SFX;
  // Aparece na lista de efeitos das configurações do Dice So Nice (chave traduzida por ele)
  static specialEffectName = 'DESORDEM.Dados3D.Aura';

  static async init() {
    return true;
  }

  /** Opções extras na janela de efeitos do Dice So Nice: nenhuma. */
  static getDialogContent() {
    return { content: '', data: {} };
  }

  constructor(box, dicemesh, options = {}) {
    this.box = box;
    this.dicemesh = dicemesh;
    this.options = options;
    this.destroyed = false;
    // `enableGC`: o Dice So Nice chama `destroy` quando tira os dados da tela
    this.enableGC = true;
  }

  async play() {
    return auraOn(this.box, this.dicemesh);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    auraOff(this.box, this.dicemesh);
  }
}

/**
 * Hook `diceSoNiceReady`: carrega a fonte dos números (o Dice So Nice desenha as faces num canvas,
 * e a fonte precisa estar pronta), registra o conjunto de cores e o efeito da aura.
 * @param {object} dice3d `game.dice3d`.
 */
async function onDiceSoNiceReady(dice3d) {
  try {
    await document.fonts.load(`600 32px "${FEAR_FONT}"`);
  } catch {
    // Sem a fonte, o Dice So Nice usa a dele
  }
  dice3d.addSFXMode(FearAuraSfx);
  await dice3d.addColorset(fearColorsetData((key) => game.i18n.localize(key)));
  // Sistema de dados do pavor (v0.25.6): números em brilho durante toda a animação
  dice3d.addSystem(
    {
      id: FEAR_DICE_SYSTEM,
      name: game.i18n.localize('DESORDEM.Dados3D.Sistema'),
      group: game.i18n.localize('DESORDEM.Dados3D.Categoria'),
    },
    'default',
  );
  for (const preset of fearDicePresets()) dice3d.addDicePreset(preset);
  // Aura já no lançamento (v0.25.6)
  Hooks.on('diceSoNiceRollStart', watchAuraDice);
}

/**
 * Registra a integração (chamada no `init` do sistema). Sem o Dice So Nice, o hook nunca roda.
 * A configuração da aparência (v0.25.5) é sempre registrada (ler nunca falha); o botão
 * «Aparência do dado de pavor» só aparece nas Configurações com o módulo ativo.
 */
export function registerDiceSoNice() {
  // `scope: 'user'`: guardada no mundo, uma por usuário (a mesma no PC e no celular)
  game.settings.register(SYSTEM_ID, FEAR_STYLE_SETTING, {
    scope: 'user',
    config: false,
    type: Object,
    default: {},
  });
  if (diceSoNiceActive()) {
    game.settings.registerMenu(SYSTEM_ID, `${FEAR_STYLE_SETTING}Menu`, {
      name: 'DESORDEM.Dados3D.Aparencia.MenuNome',
      label: 'DESORDEM.Dados3D.Aparencia.MenuBotao',
      hint: 'DESORDEM.Dados3D.Aparencia.MenuDica',
      icon: 'fa-solid fa-dice-d20',
      type: FearAppearanceApp,
      // Todos podem abrir: cada um muda só o próprio dado
      restricted: false,
    });
  }
  Hooks.once('diceSoNiceReady', onDiceSoNiceReady);
}

/**
 * Marca nos Rolls de um teste o dado de pavor (a aparência escolhida pelo jogador e a aura) e o pavor abraçado (só a
 * aura). Sem o Dice So Nice, não faz nada.
 * @param {Roll[]} rolls Rolls do teste, na ordem de `executeTest` (o pavor por último).
 * @param {{rolledCount: number, hasFear: boolean, embracedExtraIndex?: number|null}} info
 * @returns {number} Quantos dados foram marcados.
 */
export function markFearDice(rolls, info) {
  if (!diceSoNiceActive()) return 0;
  // A aparência escolhida por quem rola (v0.25.5); os outros veem a mesma, gravada na rolagem
  return decorateFearRolls(rolls, fearRollIndexes(info), fearAppearance(savedFearStyle()));
}
