/**
 * Teste oposto iniciado pela ficha (Foundry). A lógica do cartão fica em `rolls/opposed-card.js`
 * e as regras de comparação em `rolls/opposed-rules.js`.
 *
 * 1. «Teste oposto» na ficha: a pessoa escolhe o tipo (perícia, corpo a corpo, atacar contra uma
 *    defesa ou defender-se) e o seu lado (perícia, arma ou defesa). Com um token mirado, ele é o
 *    oponente. Sai no chat um cartão sem rolagem.
 * 2. Cada lado clica em «Rolar» (ou «Aceitar», se o oponente ainda está em aberto), passa pela
 *    janela pré-teste e rola um teste comum, público, com a marca `respostaOposto`.
 * 3. O mestre ativo vê o teste chegar (hook `createChatMessage`), confere que quem rolou é dono do
 *    ator e registra o teste no cartão. Com os dois lados, compara e mostra o resultado. Se um dos
 *    testes mudar depois (análise, repetir dado), o cartão é recalculado (`updateChatMessage`).
 * 4. Nos cartões de combate, cada acerto ganha o botão «Aplicar dano», de uso único, para o dono
 *    do alvo (ou o mestre). O mestre reserva o botão para quem clicou e só então o dano é aplicado,
 *    no navegador de quem clicou (é lá que aparecem a pergunta da armadura e o teste de lesão).
 * 5. Enquanto o dano está pendente, quem tem o Assumir ataque pronto ganha o botão dele (veja
 *    `guardian-chat.js`); com o Guardião gravado, o dano daquele acerto vai para ele.
 */

// Desde a v0.28.8 o código mora em `chat/`; este arquivo só reexporta (os imports de
// fora continuam iguais):
//   - chat/common.js: templates, estado do módulo (pedidos em andamento, fila) e as escolhas;
//   - chat/propose.js: as janelas da ficha e a proposta (passo 1 e a escolha do ator);
//   - chat/card.js: os botões do cartão (rolar, cancelar, repetir, aplicar dano; passos 2 e 4);
//   - chat/gm.js: o que só o mestre ativo grava e os ganchos do chat (passo 3).
export { proposeOpposed } from './chat/propose.js';
export { renderOpposedCard } from './chat/card.js';
export { registerOpposedHooks } from './chat/gm.js';
