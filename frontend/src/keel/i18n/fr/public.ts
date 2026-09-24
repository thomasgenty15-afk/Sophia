// Pack français — le namespace `public`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `public.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frPublic = {
  // ── Chrome public ────────────────────────────────────────────────────────
  "public.header.sign_in": "Se connecter",
  "public.header.start_trial": "Essai gratuit",
  // Le geste du foyer. « Commencer » et pas « Essai gratuit »: l'essai est une
  // notion du monde pro (14 jours, 3 élèves), et côté foyer on ne promet
  // AUCUNE durée — le tunnel de paiement n'est pas encaissable aujourd'hui.
  "public.header.start_household": "Commencer",
  "public.header.legal": "Mentions légales",
  "public.locale.label": "Langue",
  // Les deux ÉTIQUETTES ne se traduisent pas: un sélecteur de langue nomme
  // chaque langue DANS cette langue. « Anglais » écrit en français ne sert que
  // celui qui lit déjà le français — c'est-à-dire celui qui n'en a pas besoin.
  "public.locale.en": "EN",
  "public.locale.fr": "FR",
  "public.locale.switch_to_en": "Read this site in English",
  "public.language.en":
    "English",
  "public.language.fr":
    "Français",
  "public.locale.switch_to_fr": "Lire ce site en français",
  "public.header.back_to_app": "Retour à mon espace",
  "public.nav.worlds_label": "À qui s'adresse Sophia",
  "public.nav.doors_label": "Trouvez votre situation",

  // ── LES ANCRES DU HALL ───────────────────────────────────────────────
  // Les trois sections de `/`, portées par l'EN-TÊTE depuis le 2026-09-08.
  // ⚠️ SOUS `public.*` ET PAS `home.*`, ET C'EST UNE CONTRAINTE MÉCANIQUE:
  // `PublicHeader` est le chrome de toutes les pages publiques, et
  // `pageSeams.int.test.ts` n'y tolère que `public` et `brand`. Une clé
  // `home.*` lue par l'en-tête ferait « atteindre » le namespace du hall à
  // `/legal`, `/start` et `/join`.
  // ⚠️ Ces liens ne se rendent QUE sur le hall — ailleurs, une ancre vers
  // `#offre` ne mène nulle part.
  "public.nav.sections_label": "Sections de cette page",
  "public.nav.experience": "Exemple",
  "public.nav.household": "À plusieurs",
  "public.nav.offer": "Tarifs",
  // « Chez vous » et non « Pour votre foyer »: le mot foyer est administratif,
  // et l'en-tête a 71 px sur un téléphone. « Chez vous » dit la même chose,
  // plus court, et c'est ce qu'on dirait à voix haute.
  "public.nav.world_household": "Chez vous",
  "public.nav.world_pro": "Pour les pros",
  // « Batch cooking » est le terme que ce public emploie en français — la
  // recherche du segment le confirme. « Préparation de repas » décrirait la
  // même chose sans que personne ne s'y reconnaisse.
  // ⚠️ ON NOMME LA SITUATION, PAS LE SEGMENT (refonte du 2026-08-13).
  // « Meal prep », « Couples », « Families » nommaient nos TRIS. Personne ne
  // se dit « je suis un solo »; tout le monde se reconnaît dans une phrase qui
  // décrit sa cuisine. Le mot de segment reste dans le code, où il désigne une
  // branche réelle du parcours (`FunnelBranch = solo | pair | family`).
  //
  // ⚠️ CES TROIS VALEURS SONT LES MÊMES QUE `home.door.*.label`, et ce n’est pas
  // une duplication qu’on peut « factoriser »: un namespace par page, jamais de
  // clé partagée. Ce qui les tient ensemble est qu’elles se lisent À DEUX
  // CENTIMÈTRES l’une de l’autre — l’onglet de l’en-tête et la porte de la
  // clôture du hall. Les faire diverger se voit sur un seul écran.
  "public.nav.coaches": "Formations",
  "public.nav.gyms": "Salles de sport",
  "public.nav.communities": "Communautés",
  // ⚠️ AUCUNE ADRESSE AU LECTEUR — voir la note du bloc anglais. Cette ligne
  // tutoyait (« Ta méthode, qui répond en ton absence ») sous six pages qui
  // vouvoient, et vendait une méthode à des foyers qui n’en ont pas. Ni
  // « vous » ni « tu » ne peut convenir aux huit: le registre se règle donc
  // par l’absence.
  "public.footer.legal": "Mentions légales & confidentialité",
  "public.footer.contact": "Contact",
  "public.footer.contact_email": "sophia@sophia-coach.ai",
  // ⚠️ « LOGICIEL DE COACHING » EST TOMBÉ LE 2026-09-01. La ligne ne violait
  // pas la règle du registre — elle n'adresse personne —, elle violait l'AUTRE
  // moitié: elle ne nommait qu'un seul des deux mondes. Sous les quatre pages
  // du foyer, dont aucune copie ne prononce le mot « coach », le pied de page
  // le prononçait sur les quatre. Celle-ci reprend le titre du hall
  // (`home.hero.title`) et reste vraie des deux côtés: une semaine de repas
  // décidée d'avance est ce que composent le foyer ET la méthode d'un pro.
  // ⚠️ SUIT LE POSITIONNEMENT DU 2026-09-08 (brief landing): la signature
  // de la page unique, reprise ici pour que le pied ne vende pas autre chose.
  "public.footer.copyright": "Sophia — ton objectif, à table",

  // ── LE BANDEAU DE CONSENTEMENT PUBLICITAIRE ──────────────────────────────
  //
  // ⚠️ DEUX BOUTONS DE MÊME POIDS, ET AUCUNE CROIX. La CNIL (délibération
  // 2020-091) demande que refuser coûte le MÊME nombre de clics qu'accepter;
  // une croix de fermeture n'est ni un oui ni un non, et la compter comme un
  // oui est précisément ce qui est sanctionné. Les deux étiquettes sont donc
  // symétriques dans la forme comme dans le texte.
  //
  // ⚠️ « MESURER » ET PAS « AMÉLIORER VOTRE EXPÉRIENCE ». On demande la
  // permission de compter d'où vient un visiteur pour savoir quelle annonce a
  // marché. Le dire autrement serait faux, et un consentement obtenu sur une
  // description fausse n'est pas un consentement.
  "public.consent.title": "Mesurer d’où vous venez",
  "public.consent.body":
    "Nous aimerions savoir quelle annonce vous a amené ici, pour arrêter de payer celles qui ne servent à rien. Ça demande un cookie publicitaire, et donc votre accord. Le refus ne change rien à ce que vous pouvez faire sur le site.",
  "public.consent.accept": "Accepter",
  "public.consent.refuse": "Refuser",
  "public.consent.learn_more": "Ce que nous collectons",
} satisfies TranslatedMessagesOf<"public">;
