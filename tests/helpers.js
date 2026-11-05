/** Gerador determinístico: devolve os valores na ordem e registra os dados pedidos. */
export function fixedRng(values) {
  const queue = [...values];
  const rng = (sides) => {
    rng.calls.push(sides);
    if (queue.length === 0) throw new Error('fixedRng: sem valores restantes');
    return queue.shift();
  };
  rng.calls = [];
  return rng;
}
