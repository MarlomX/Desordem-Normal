/**
 * Proteção da digitação nas janelas (v0.28.5): perseguição, pontos de PA, furtividade e tabelas
 * das criaturas. Quando o estado muda (outro jogador, o mestre), a janela é redesenhada; se alguém
 * está digitando num campo, redesenhar agora apagaria o que está sendo digitado. A janela espera a
 * pessoa terminar (confirmar ou sair do campo) e só então se redesenha.
 */
export class TypingGuard {
  /** A pessoa está digitando num campo e ainda não confirmou (Enter ou sair do campo)? */
  #typing = false;

  /** Chegou uma atualização enquanto ela digitava: a janela é redesenhada quando terminar. */
  #renderPending = false;

  /** @param {ApplicationV2} app Janela protegida. */
  constructor(app) {
    this.app = app;
  }

  /** Redesenha a janela se ela estiver aberta; com alguém digitando, deixa para depois. */
  refresh() {
    if (!this.app?.rendered) return;
    if (this.#typing) {
      this.#renderPending = true;
      return;
    }
    this.app.render();
  }

  /** Começou a digitar (evento `input`). */
  typing() {
    this.#typing = true;
  }

  /** O valor foi confirmado e vai ser gravado (a janela se redesenha em seguida de qualquer jeito). */
  done() {
    this.#typing = false;
    this.#renderPending = false;
  }

  /**
   * Saiu do campo: se chegou atualização enquanto digitava, redesenha. Pequeno atraso: não troca a
   * tela debaixo do clique no botão que veio logo depois.
   */
  left() {
    this.#typing = false;
    if (!this.#renderPending) return;
    this.#renderPending = false;
    globalThis.setTimeout(() => this.app.render(), 250);
  }

  /** Liga os eventos de um campo (`input` e `blur`). */
  watch(field) {
    field.addEventListener('input', () => this.typing());
    field.addEventListener('blur', () => this.left());
  }
}
