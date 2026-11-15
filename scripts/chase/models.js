/**
 * Modelos de dados da perseguição (Foundry). O encontro (Combat do tipo `perseguicao`) guarda a
 * configuração e a rodada; cada participante (Combatant do tipo `participante`) guarda a sua
 * situação. `carregadoPor` ainda não é usado (carregar outro chega numa versão futura).
 */

/** Dados do encontro de perseguição. */
export class PerseguicaoModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      // false = em preparação (o mestre monta a lista); true = em andamento
      ativa: new f.BooleanField({ required: true, initial: false }),
      rodadaAtual: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    };
  }
}

/** Dados de cada participante da perseguição. */
export class ParticipanteModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      // Pontos de avanço acumulados
      pa: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // Dados de fôlego (d6) disponíveis
      folego: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // Quantas vezes já usou esforço extra (define quantos d4 de PV o próximo custa)
      esforcoExtra: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // Rodada em que já avançou (0 = ainda não agiu); uma ação por rodada
      ultimaRodada: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // Perícias (além de Atletismo) já usadas para avançar: cada uma só vale uma vez
      periciasUsadas: new f.ArrayField(new f.StringField({ required: true, blank: false })),
      // Id do participante que está carregando este (vazio = ninguém; ainda não usado)
      carregadoPor: new f.StringField({ required: true, blank: true, initial: '' }),
    };
  }
}
