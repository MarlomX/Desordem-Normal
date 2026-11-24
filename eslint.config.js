export default [
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        game: 'readonly',
        foundry: 'readonly',
        ChatMessage: 'readonly',
        Handlebars: 'readonly',
        Hooks: 'readonly',
        CONFIG: 'readonly',
        foundry: 'readonly',
        ui: 'readonly',
        Roll: 'readonly',
        ChatMessage: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },
  // Testes (Node) e ferramentas de build (v0.28.0): os mesmos cuidados, com os globais do Node
  {
    files: ['tests/**/*.js', 'tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        structuredClone: 'readonly',
        setTimeout: 'readonly',
        // Globais do Foundry de mentira (tests/foundry-stub.js)
        game: 'readonly',
        foundry: 'readonly',
        ChatMessage: 'readonly',
      },
    },
    rules: {
      // `{ itemName, ...rest }` serve para tirar um campo antes de comparar
      'no-unused-vars': ['warn', { ignoreRestSiblings: true }],
      'no-undef': 'error',
    },
  },
];
