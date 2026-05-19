export type AttackCardDraftV1 = {
  operation_type: "prepare_attack_card";
  output_schema: "attack_card_draft_v1";
  draft: {
    title: string;
    target_label: string;
    technique: AttackTechniqueKey;
    technique_title: string;
    instruction: string;
    generated_asset: string;
    activation_keyword?: string | null;
    supporting_points: string[];
    mode_emploi: string;
    why_it_helps: string;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};

export type AttackTechniqueKey =
  | "texte_recadrage"
  | "mantra_force"
  | "ancre_visuelle"
  | "visualisation_matinale"
  | "preparer_terrain"
  | "pre_engagement";

export const ATTACK_TECHNIQUES: Record<
  AttackTechniqueKey,
  {
    title: string;
    pour_quoi: string;
    objet_genere: string;
    mode_emploi: string;
    example: string;
  }
> = {
  texte_recadrage: {
    title: "Le texte magique",
    pour_quoi:
      "Faire baisser le combat interieur quand l'utilisateur commence a negocier avec lui-meme.",
    objet_genere:
      "Un texte court a relire ou recopier quand la resistance monte.",
    mode_emploi:
      "Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.",
    example:
      "Exemple: un texte de 3 lignes a relire quand tu commences a negocier.",
  },
  mantra_force: {
    title: "Mantra de force",
    pour_quoi:
      "Installer plus de force interieure face a l'action, avant le moment difficile.",
    objet_genere:
      "Une phrase courte a repeter pour renforcer le rapport a l'action.",
    mode_emploi:
      "Repete-le trois fois avant le moment vise, sans chercher a te convaincre plus que ca.",
    example: "Exemple: une phrase courte qui te remet dans ton axe.",
  },
  ancre_visuelle: {
    title: "Ancre visuelle",
    pour_quoi: "Utiliser l'environnement comme rappel concret de l'engagement.",
    objet_genere: "Un repere visuel simple, avec une phrase associee.",
    mode_emploi:
      "Place l'ancre dans ton environnement et utilise-la comme signal de depart.",
    example: "Exemple: un carnet visible avec une phrase de depart.",
  },
  visualisation_matinale: {
    title: "Meditation de 5 minutes",
    pour_quoi:
      "Rendre le comportement plus familier avant que la resistance apparaisse.",
    objet_genere:
      "Une courte visualisation guidee de l'action deja en train de se faire.",
    mode_emploi:
      "Prends 5 minutes pour te voir faire l'action de facon calme et concrete.",
    example:
      "Exemple: une visualisation rapide du moment ou tu fais l'action sans debat.",
  },
  preparer_terrain: {
    title: "Preparer le terrain",
    pour_quoi: "Retirer de la friction avant que le moment d'action arrive.",
    objet_genere: "Un micro-setup qui rend le bon geste plus facile.",
    mode_emploi:
      "Prepare le terrain avant le moment vise, puis laisse l'environnement t'aider a demarrer.",
    example: "Exemple: telephone loin, carnet pret, premier geste visible.",
  },
  pre_engagement: {
    title: "Mot de bascule",
    pour_quoi: "Avoir un mot simple a envoyer quand le moment devient fragile.",
    objet_genere: "Un mot-cle memorisable et un mini protocole de bascule.",
    mode_emploi:
      "Envoie seulement ce mot quand tu sens que tu peux craquer; Sophia reprend le contexte.",
    example: "Exemple: envoyer BASCULE quand tu sens que tu vas esquiver.",
  },
};
