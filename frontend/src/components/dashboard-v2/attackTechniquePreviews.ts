import type { AttackCardContent } from "../../types/v2";

export type AttackTechniqueView = AttackCardContent["techniques"][number];

/**
 * Index (dans questions[]) de la question qui demande QUELLE action est visee,
 * par technique. Quand la carte est liee a une action du plan, cette question
 * n'a aucun sens ("Pour l'action X, quelle action tu veux..."): elle est
 * retiree du formulaire et le backend recoit deja l'action via action_context.
 * null = aucune question d'ancrage action (technique situationnelle).
 */
export const ATTACK_TECHNIQUE_ACTION_QUESTION_INDEX: Record<
  string,
  number | null
> = {
  texte_recadrage: 0,
  mantra_force: 0,
  ancre_visuelle: 0,
  visualisation_matinale: 0,
  preparer_terrain: 0,
  pre_engagement: null,
};

export const ATTACK_TECHNIQUE_PREVIEWS: AttackTechniqueView[] = [
  {
    technique_key: "texte_recadrage",
    title: "Le texte magique",
    pour_quoi:
      "Faire disparaitre le combat interieur quand tu commences a te trouver des excuses ou a negocier avec toi-meme.",
    objet_genere:
      "Un texte a ecrire jusqu'a ce que le combat baisse et que l'action redevienne evidente.",
    questions: [
      "Quelle action tu negocies souvent avec toi-meme ?",
      "Qu'est-ce que tu te racontes pour ne pas la faire ? Ecris l'excuse avec tes mots.",
      "Qu'est-ce qui est vrai et important pour toi, en face de cette excuse ?",
    ],
    mode_emploi:
      "Ecris-le au moment ou tu sens la resistance monter, jusqu'a ce que ce soit moins un combat.",
    generated_result: null,
  },
  {
    technique_key: "mantra_force",
    title: "Mantra de force",
    pour_quoi:
      "Installer doucement plus de force interieure face a ce que tu as a faire, au lieu d'attendre d'etre fort sur le moment.",
    objet_genere:
      "Une phrase a te repeter pour faire evoluer peu a peu ton rapport a l'action.",
    questions: [
      "Face a quelle action ou quel effort tu veux devenir plus solide ?",
      "Pourquoi c'est important pour toi de tenir la-dessus ?",
      "Tu le veux plutot calme, noble ou percutant ?",
    ],
    mode_emploi:
      "Repete-le trois fois le matin, ou matin midi et soir si tu veux l'ancrer plus fort.",
    generated_result: null,
  },
  {
    technique_key: "ancre_visuelle",
    title: "Ancre visuelle",
    pour_quoi:
      "Utiliser ton environnement consciemment pour qu'il te rappelle les engagements que tu as pris envers toi-meme.",
    objet_genere:
      "Un repere visuel simple a utiliser, avec une phrase a te dire quand tu le vois.",
    questions: [
      "Quel engagement envers toi-meme tu veux garder sous les yeux ?",
      "Ou est-ce que tu vas le placer pour le voir au bon moment ? (frigo, miroir, bureau, fond d'ecran...)",
      "Quand tu le verras, qu'est-ce que tu veux te dire ? Une phrase courte.",
    ],
    mode_emploi:
      "Place-la dans ton environnement pour qu'elle te recadre naturellement quand ton regard tombe dessus.",
    generated_result: null,
  },
  {
    technique_key: "visualisation_matinale",
    title: "Meditation de 5 minutes",
    pour_quoi:
      "Rendre le demarrage tellement simple que tu passes a l'action avant que la resistance ait le temps de grossir.",
    objet_genere:
      "Une courte meditation guidee pour te visualiser en train de faire l'action, au moment que Sophia te proposera.",
    questions: [
      "Quelle action tu veux rendre plus naturelle ?",
      "Qu'est-ce qui bloque ou te retient aujourd'hui quand le moment arrive ?",
    ],
    mode_emploi:
      "Sophia choisit le meilleur moment pour la faire (en general au reveil ou juste avant l'action) et te guide pendant 5 minutes.",
    generated_result: null,
  },
  {
    technique_key: "preparer_terrain",
    title: "Preparer le terrain",
    pour_quoi:
      "Installer les bonnes conditions avant que la friction n'arrive.",
    objet_genere:
      "Un environnement qui t'invite a faire la bonne chose quand le moment arrive.",
    questions: [
      "Pour quelle action tu veux te simplifier la vie ?",
      "Qu'est-ce qui te ralentit ou te gene au moment de t'y mettre ?",
      "Qu'est-ce qui devrait deja etre pret quand le moment arrive ?",
    ],
    mode_emploi:
      "Prepare le terrain suffisamment tot pour que le bon geste devienne plus simple.",
    generated_result: null,
  },
  {
    technique_key: "pre_engagement",
    title: "Mot de bascule",
    pour_quoi:
      "Avoir un mot simple a envoyer pour que Sophia comprenne tout de suite que tu es dans un moment ou tu peux craquer et t'aide a tenir.",
    objet_genere:
      "Un mot-cle memorisable et un mini protocole de bascule a envoyer seul quand la tension monte.",
    questions: [
      "Dans quelle situation precise tu risques de craquer ?",
      "Quand tu tiens bon a ce moment-la, qu'est-ce que tu proteges d'important ?",
    ],
    mode_emploi:
      "Des que tu sens que ca devient tendu, envoie seulement le mot-cle. Sophia recupere le contexte et t'aide immediatement a tenir.",
    generated_result: null,
  },
];
