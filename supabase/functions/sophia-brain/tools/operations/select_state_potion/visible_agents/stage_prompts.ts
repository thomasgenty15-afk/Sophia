export function stageSpecificVisibleInstruction(
  stage: string,
): string {
  switch (stage) {
    case "potion_clarification":
      return "Prompt stage clarify_potion_need: distingue le besoin en langage naturel et pose une seule question courte. Ne liste pas des noms de potions comme un menu.";
    case "potion_selected":
      return "Prompt stage announce_selected_potion: annonce le nom canonique de la potion selectionnee et introduis la prochaine question sans remplir les champs a la place du dispatcher.";
    case "detail_field_intake":
      return "Prompt stage ask_missing_field: pose une seule question conversationnelle sur le champ manquant ou faible. N'utilise pas un format de formulaire.";
    case "field_confirmation":
      return "Prompt stage confirm_candidate: demande validation ou correction de la valeur proposee. Ne verrouille pas toi-meme la valeur.";
    case "handoff_ready":
    case "handoff_delivered":
      return "Prompt stage handoff_ready: donne le nom de la potion, le chemin Etat / Potions et les champs plateforme exacts avec leurs valeurs exactes. Ne cree rien depuis le chat.";
    case "platform_destination_followup":
      return "Prompt stage destination_followup: reponds court avec le chemin Etat / Potions et les champs deja prets si utiles.";
    case "apply_attempt":
      return "Prompt stage apply_attempt: dis que Sophia ne peut pas lancer la potion depuis le chat, puis redonne le chemin et les champs a saisir.";
    case "repeat_handoff":
      return "Prompt stage repeat_handoff: redis seulement quoi saisir dans la plateforme, sans refaire une longue justification.";
    case "cancel":
      return "Prompt stage stop_or_cancel: accuse reception court, sans question finale et sans relancer globalement le sujet.";
    case "blocked":
      return "Prompt stage safety_transition: ne pousse pas vers une potion; laisse la prise en charge safety ou le blocage reprendre.";
    case "clarte_task":
      return "Prompt stage clarte_task: suis la tache visible clarté deja decidee et n'ajoute aucune decision metier.";
    case "potion_subskill_task":
      return "Prompt stage potion_subskill_task: suis la tache visible du sous-skill potion deja decidee et n'ajoute aucune decision metier.";
    default:
      return "Prompt stage select_state_potion: suis strictement la tache visible fournie par le dispatcher local et n'ajoute aucune decision metier.";
  }
}
