/* global document */
/**
 * Ligação opcional com o módulo Dice So Nice (v0.25.2). Só faz algo se o módulo estiver ativo:
 * no hook `diceSoNiceReady` registra o conjunto de cores do dado de pavor e o efeito especial
 * «Aura de pavor». `markFearDice` é chamada por `executeTest` (scripts/rolls/chat.js) logo depois
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
  FEAR_STYLE_SETTING,
  decorateFearRolls,
  fearAppearance,
  fearColorsetData,
  fearRollIndexes,
} from './fear-dice.js';

/** Se o Dice So Nice está ativo neste mundo (sem ele, o sistema não mexe nos Rolls). */
export const diceSoNiceActive = () => Boolean(game.modules.get(DSN_MODULE_ID)?.active);

/**
 * Valores originais do contorno do Dice So Nice, guardados na primeira aura e devolvidos quando a
 * última aura termina. `WeakMap`: a chave é o próprio objeto do contorno (um por mesa de dados).
 */
const savedOutline = new WeakMap();

/** Quantas auras estão ligadas em cada contorno (o mesmo objeto serve a todos os dados). */
const activeAuras = new WeakMap();

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
    const pass = this.box?.outlinePass;
    if (!pass?.selectedObjects) return false;
    const count = activeAuras.get(pass) ?? 0;
    if (count === 0) saveOutline(pass);
    activeAuras.set(pass, count + 1);
    applyOutline(pass, FEAR_AURA_OUTLINE);
    pass.selectedObjects.push(this.dicemesh);
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const pass = this.box?.outlinePass;
    if (!pass?.selectedObjects) return;
    pass.selectedObjects = pass.selectedObjects.filter((mesh) => mesh !== this.dicemesh);
    const count = Math.max(0, (activeAuras.get(pass) ?? 1) - 1);
    activeAuras.set(pass, count);
    // A última aura terminou: o contorno volta como era (para o efeito «contorno» do módulo)
    if (count === 0 && savedOutline.has(pass)) applyOutline(pass, savedOutline.get(pass));
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
