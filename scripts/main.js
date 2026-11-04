const MODULE_ID = 'desordem-normal';

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | inicializando`);
});

Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | pronto`);
});
