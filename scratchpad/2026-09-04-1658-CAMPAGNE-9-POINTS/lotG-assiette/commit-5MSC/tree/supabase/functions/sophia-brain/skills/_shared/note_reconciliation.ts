/**
 * Doctrine de réconciliation de la note global→local, partagée par les
 * dispatchers locaux entrés à froid depuis le dispatcher global.
 *
 * Empêche deux sources de vérité entre (a) la note/le signal du dispatcher
 * global et (b) la lecture locale du fil — divergence rendue possible depuis
 * que la fenêtre d'entrée élargie (`flowEntryWindow`) donne au flow sa propre
 * vue du contexte. La conversation reste la source unique de vérité ; la note
 * est un briefing à confirmer / étoffer / infirmer, jamais une vérité figée.
 *
 * @param onContradiction phrase spécifique au flow décrivant COMMENT corriger
 *   la cible quand la conversation contredit la note. Défaut générique = rendre
 *   la main au dispatcher global si le message courant porte une intention
 *   autonome, sinon corriger la cible en place.
 */
export function noteReconciliationPromptLines(
  onContradiction =
    "rends la main au dispatcher global via le note_information de sortie si le message courant introduit une intention autonome, sinon corrige la cible en place",
): string[] {
  return [
    "Source unique de verite = la conversation reelle (recent_messages + current_user_message). La note du dispatcher global (inbound_note_information.handoff_context_for_next_dispatcher, user_words, structured_context) et dispatcher_signal_context sont un BRIEFING a verifier, jamais une verite figee. A l'entree du flow, confronte-les au fil et tranche en UNE seule cible: (a) CONFIRME — la note colle: avance sur elle, ne re-clarifie pas ce qu'elle resout deja; (b) ETOFFE — la note est juste mais incomplete et la conversation fournit le detail manquant (l'objet concret, le declencheur, le moment): enrichis silencieusement et avance, ne redemande jamais ce que le fil dit deja; (c) INFIRME — la conversation contredit clairement la note: la conversation gagne, " +
    onContradiction +
    ", et signale la correction dans le note_information de sortie. Ne maintiens jamais deux lectures paralleles: une seule cible tranchee par tour.",
  ];
}
