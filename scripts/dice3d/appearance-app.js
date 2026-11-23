/**
 * Janela «Aparência do dado de pavor» (v0.25.5), aberta pelo botão nas Configurações do sistema
 * (só com o Dice So Nice ativo). Cada jogador escolhe as cores, a textura, o material e a fonte do
 * seu dado de pavor; a escolha fica numa configuração do usuário (vale no PC e no celular) e é
 * aplicada por `markFearDice` (dice3d.js) a cada rolagem. A aura de pavor não é escolha: vai sempre.
 *
 * A prévia 2D muda a cada campo (variáveis CSS na raiz da janela); «Ver em 3D» joga um dado de
 * teste só nesta tela, com o que está nos campos, mesmo sem salvar.
 */
import { SYSTEM_ID } from '../config.js';
import { FEAR_STYLE_SETTING, decorateFearRolls, fearAppearance } from './fear-dice.js';
import {
  FEAR_MATERIALS,
  PREVIEW_DEFAULT_SIDES,
  PREVIEW_SIDES,
  STYLE_COLOR_FIELDS,
  STYLE_FIELDS,
  effectiveFearStyle,
  fontOptions,
  previewShape,
  previewSides,
  sanitizeFearStyle,
  selectOptions,
  styleOverrides,
} from './fear-style.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Variável CSS da prévia para cada campo de cor (lida em styles/main.css). */
const PREVIEW_VARS = Object.freeze({
  background: '--dn-ap-dado',
  foreground: '--dn-ap-numero',
  outline: '--dn-ap-contorno',
  edge: '--dn-ap-arestas',
});

/** Texturas do Dice So Nice (incluindo as de módulos extras), com o nome traduzido. */
function textureOptions() {
  const list = game.dice3d?.exports?.TEXTURELIST ?? {};
  return Object.entries(list).map(([key, entry]) => ({
    key,
    label: entry?.name ? game.i18n.localize(entry.name) : key,
  }));
}

/** Fontes do Foundry (nomes), pela API do v13, com a antiga como reserva. */
function foundryFonts() {
  const FontConfig =
    foundry.applications.settings?.menus?.FontConfig ?? globalThis.FontConfig ?? null;
  return Object.keys(FontConfig?.getAvailableFontChoices?.() ?? {});
}

/** Materiais com os nomes do próprio Dice So Nice (DICESONICE.MaterialPlastic...). */
function materialOptions() {
  return FEAR_MATERIALS.map((key) => ({
    key,
    label: game.i18n.localize(`DICESONICE.Material${key[0].toUpperCase()}${key.slice(1)}`),
  }));
}

/** Listas aceitas na validação (textura e fonte precisam existir). */
const knownLists = () => ({
  textures: textureOptions().map((option) => option.key),
  fonts: fontOptions(foundryFonts()).map((option) => option.key),
});

/** A escolha guardada deste usuário, já com o padrão por baixo. */
export function savedFearStyle() {
  return effectiveFearStyle(game.settings.get(SYSTEM_ID, FEAR_STYLE_SETTING));
}

export default class FearAppearanceApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'desordem-aparencia-pavor',
    classes: ['desordem-normal', 'desordem-aparencia-janela'],
    position: { width: 460, height: 'auto' },
    window: {
      title: 'DESORDEM.Dados3D.Aparencia.Titulo',
      icon: 'fa-solid fa-dice-d20',
      resizable: true,
    },
    actions: {
      restore: FearAppearanceApp.#onRestore,
      preview3d: FearAppearanceApp.#onPreview3d,
      save: FearAppearanceApp.#onSave,
    },
  };

  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/settings/aparencia-pavor.hbs` },
  };

  /**
   * Escolha mostrada nos campos. `null` = a guardada; «Restaurar padrão» põe o padrão aqui sem
   * salvar (só vale depois de «Salvar»).
   */
  #draft = null;

  /** Os ouvintes da prévia vão na raiz da janela, que continua a mesma entre redesenhos. */
  #wired = false;

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const style = this.#draft ?? savedFearStyle();
    return {
      ...context,
      style,
      colors: STYLE_COLOR_FIELDS.map((field) => ({
        field,
        value: style[field],
        label: t(`DESORDEM.Dados3D.Aparencia.Campo.${field}`),
      })),
      textures: selectOptions(textureOptions(), style.texture),
      materials: selectOptions(materialOptions(), style.material),
      fonts: selectOptions(fontOptions(foundryFonts()), style.font),
      sides: PREVIEW_SIDES.map((value) => ({
        value,
        selected: value === PREVIEW_DEFAULT_SIDES,
      })),
      shape: previewShape(PREVIEW_DEFAULT_SIDES),
      previewNumber: PREVIEW_DEFAULT_SIDES,
    };
  }

  /** Depois de desenhar: a prévia acompanha cada mudança nos campos. */
  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.#wired) {
      this.element.addEventListener('input', () => this.#updatePreview());
      this.element.addEventListener('change', () => this.#updatePreview());
      this.#wired = true;
    }
    this.#updatePreview();
  }

  /** Valores dos campos agora (sem validar). */
  #readFields() {
    const raw = {};
    for (const field of STYLE_FIELDS) {
      const input = this.element.querySelector(`[name="${field}"]`);
      if (input) raw[field] = input.value;
    }
    return raw;
  }

  /** Lados escolhidos para a prévia. */
  #previewSides() {
    return previewSides(this.element.querySelector('[name="previewSides"]')?.value);
  }

  /** Atualiza as cores, a fonte, a silhueta e o número da prévia 2D. */
  #updatePreview() {
    const root = this.element.querySelector('.desordem-aparencia');
    if (!root) return;
    const style = effectiveFearStyle(this.#readFields());
    for (const [field, variable] of Object.entries(PREVIEW_VARS)) {
      root.style.setProperty(variable, style[field]);
    }
    root.style.setProperty('--dn-ap-fonte', `"${style.font.replace(/"/g, '')}", sans-serif`);
    const sides = this.#previewSides();
    root.querySelector('.desordem-aparencia__forma')?.setAttribute('points', previewShape(sides));
    const number = root.querySelector('.desordem-aparencia__numero');
    if (number) number.textContent = String(sides);
  }

  /** «Restaurar padrão»: os campos voltam ao padrão do sistema (só é guardado ao salvar). */
  static async #onRestore() {
    this.#draft = effectiveFearStyle({});
    await this.render();
  }

  /** «Ver em 3D»: um dado de pavor de teste, só nesta tela (sem mensagem e sem sincronizar). */
  static async #onPreview3d() {
    if (!game.dice3d) return;
    const style = effectiveFearStyle(sanitizeFearStyle(this.#readFields(), knownLists()));
    const roll = await new Roll(`1d${this.#previewSides()}`).evaluate();
    decorateFearRolls([roll], { fear: 0, embraced: null }, fearAppearance(style));
    // Terceiro argumento `false`: não mostra aos outros jogadores
    await game.dice3d.showForRoll(roll, game.user, false);
  }

  /** «Salvar»: guarda só o que difere do padrão e fecha. */
  static async #onSave() {
    const style = effectiveFearStyle(sanitizeFearStyle(this.#readFields(), knownLists()));
    await game.settings.set(SYSTEM_ID, FEAR_STYLE_SETTING, styleOverrides(style));
    ui.notifications.info(t('DESORDEM.Dados3D.Aparencia.Salvo'));
    await this.close();
  }
}
