export default [
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        game: 'readonly',
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
      },
    },
    rules: {
      // `{ itemName, ...rest }` serve para tirar um campo antes de comparar
      'no-unused-vars': ['warn', { ignoreRestSiblings: true }],
      'no-undef': 'error',
    },
  },
];
