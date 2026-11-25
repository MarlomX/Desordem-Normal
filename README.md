# Desordem-Normal

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

Sistema gratuito para Foundry VTT v13 com regras de rolagem para mesa. Não contém
missões, artes, logos nem textos de publicações oficiais, e não possui parceria,
aprovação ou endosso dos detentores dos direitos.

## Instalação

No Setup do Foundry, em _Game Systems > Install System_, cole a URL do manifesto:

`https://github.com/MarlomX/desordem-normal/releases/latest/download/system.json`

## Guia de uso

O compêndio **Guias** traz um diário que explica como usar o sistema no Foundry: ficha, janela
pré-teste, cartões do chat, condição, combate por fases, perseguição, furtividade, desafios,
pontos de interesse e criaturas.

Os outros compêndios: **Habilidades básicas**, **Itens básicos**, **Efeitos básicos**,
**Macros do mestre**, **Macros do jogador** e **Exemplos de investigação**.

## Jogar pelo celular (Swipe)

No Swipe, o chat do Foundry só fica disponível para assinantes. O compêndio **Macros do jogador**
tem duas macros que resolvem isso pela barra de macros:

- **Abrir chat**: as últimas mensagens numa janela que se atualiza sozinha, com os botões dos
  cartões e os detalhes das rolagens funcionando.
- **Abrir ficha**: abre (ou traz para a frente) a ficha do seu personagem.

Arraste as duas do compêndio para a barra de macros e toque nelas pela aba de macros do Swipe.

## Dice So Nice (opcional)

Com o módulo Dice So Nice ativo, o dado de pavor ganha um estilo próprio na animação 3D e a
aura de pavor (um contorno branco levemente azulado). Sem o módulo, nada muda.

## Desenvolvimento

Precisa do Node 22. Depois de clonar, `npm install` instala o ESLint e o Prettier.

```sh
npm test       # testes (Node, sem o Foundry)
npx eslint .   # código, testes e ferramentas
npx prettier --check "scripts/**/*.js" "tests/**/*.js" "tools/**/*.mjs" "styles/*.css" "lang/*.json" system.json README.md
```

Os templates `.hbs` ficam fora do Prettier. A formatação segue o `.prettierrc` (aspas simples,
ponto e vírgula, 100 colunas).

### Como o código está organizado

- `scripts/main.js`: ponto de entrada; registra modelos, fichas, configurações, ganchos e a API
  em `game.desordem`.
- `scripts/rolls/`: as regras (testes, dano, lesão, trauma, efeitos, habilidades, desafios,
  perseguição, furtividade) em funções puras, testadas em Node. Os arquivos `*-chat.js` fazem a
  ponte com o Foundry (cartões do chat, janelas, gravação).
- `scripts/shared/`: peças comuns: tradução (`t`), templates, socket do mestre ativo, configuração
  do mundo com fila de gravação, trava local, encontros e proteção de quem está digitando.
- `scripts/sheets/`: fichas do personagem, da criatura e dos itens, e o contexto que elas mostram.
- `scripts/data/`: modelos de dados (`system.*`) e as migrações dos dados antigos.
- `scripts/chase/`, `scripts/stealth/`, `scripts/challenges/`, `scripts/combat/`,
  `scripts/opposed/`, `scripts/journal/`: perseguição, furtividade, desafios, fases do combate,
  teste oposto e pontos de interesse do diário.
- `scripts/dice3d/` (Dice So Nice) e `scripts/mobile/` (macros do celular).
- `templates/`: as telas em Handlebars. Cada parte de uma janela (PARTS) tem um único elemento
  raiz.
- `styles/`: um arquivo por tema (`base`, `dados`, `chat`, `ficha`, `item`, `janelas`,
  `perseguicao`, `furtividade`, `desafios`, `combate`, `oposto`, `diario`). A ordem de carga está
  em `system.json` e importa: `base.css` define as variáveis de cor que os outros usam.
- `lang/`: textos em `pt-BR.json` e `en.json`, com as mesmas chaves (conferido em
  `tests/lang.test.js`).
- `packs-src/`: as fontes dos compêndios, um JSON por documento.
- `tools/`: `pack.mjs` compila os compêndios; `gerar-efeitos.mjs` refaz as fontes de «Efeitos
  básicos» a partir do código; `extrair-dados-pavor.mjs` gera o desenho dos dados de pavor.

Os arquivos que viraram pastas (`rolls/ability-effects.js`, `rolls/challenge.js`,
`journal/point.js`, `sheets/context.js`, `opposed/opposed-chat.js`) continuam existindo e só
reexportam as partes, para que os imports de fora não mudem.

### Publicar

Uma tag `v*` enviada ao GitHub roda o workflow `.github/workflows/release.yml`: ele põe a versão da
tag no `system.json`, compila os compêndios e anexa `system.json` e `system.zip` ao release.

### Licença

Só as regras, escritas com palavras próprias: nada copiado dos livros ou do playtest. Veja
`LICENSE-NOTICE.md`.
