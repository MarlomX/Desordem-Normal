/**
 * Modelos de dados da cena de furtividade (Foundry). O encontro (Combat do tipo `furtividade`)
 * guarda a situação da cena; cada participante (Combatant do tipo `furtivo`) guarda os próprios
 * dados de esconderijo.
 *
 * Observação: os documentos de encontro vão para todos os clientes do Foundry, então os valores
 * dos dados ficam escondidos pela interface (janela e ficha), não por sigilo técnico.
 */

/** Dados do encontro de furtividade. */
export class FurtividadeModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      // false = em preparação (o mestre monta a lista); true = em andamento
      ativa: new f.BooleanField({ required: true, initial: false }),
      rodadaAtual: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    };
  }
}

/** Dados de cada participante da cena de furtividade. */
export class FurtivoModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      // Dados de esconderijo: cada um guarda os lados do dado e o valor que saiu
      esconderijo: new f.ArrayField(
        new f.SchemaField({
          lados: new f.NumberField({ required: true, integer: true, min: 4, max: 20 }),
          valor: new f.NumberField({ required: true, integer: true, min: 1, max: 20 }),
        }),
      ),
      // Já registrou dados nesta cena? Separa "ainda não se escondeu" de "encontrado" (0 dados)
      escondeu: new f.BooleanField({ required: true, initial: false }),
    };
  }
}
