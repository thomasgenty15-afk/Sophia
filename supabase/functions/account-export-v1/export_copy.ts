// RGPD — CE QUE L'UTILISATEUR LIT QUAND IL DEMANDE SES DONNÉES.
//
// ── POURQUOI UN MODULE À PART, ET PAS DES BRANCHES DANS LE HANDLER ─────────
// Le motif de `send-welcome-email/welcome_email.ts`, pour les mêmes raisons:
// `sendResendEmail({to, subject, html})` et `sendLifecycleMessage` ne changent
// pas — un transport qui connaîtrait la langue serait un transport qui DÉCIDE.
// Ici la décision est rendue par des fonctions pures et testables, et
// `index.ts` (qui est en `@ts-nocheck`, donc sans relecteur automatique) se
// contente de poster ce qu'on lui rend.
//
// ── CE QUI N'EST PAS TRADUIT ICI, ET POURQUOI ──────────────────────────────
// Les NOMS DE FICHIERS de l'archive (`profil.json`, `mon_foyer.json`, …) et
// les clés des objets JSON. Ce sont des JETONS: ils désignent une entrée
// exacte du ZIP, et le README les CITE pour qu'on les retrouve. Les traduire
// produirait deux formes d'archive selon la langue du demandeur, et un README
// anglais qui nomme un fichier qui n'existe pas sous ce nom. R1: les jetons
// ne se traduisent jamais, y compris quand ils se lisent comme des mots.

import { isFrenchLocale } from "../_shared/keel/locale.ts";
import { formatAccountDate } from "../_shared/account_lifecycle.ts";

export interface RenderedNotice {
  /** Le corps commun à l'e-mail et au message in-app. Une seule phrase-source. */
  body: string;
  subject: string;
  html: string;
}

/**
 * L'ALERTE HORS BANDE — elle part AVANT la livraison de l'archive, pour qu'une
 * session détournée ne puisse pas siphonner les données en silence.
 *
 * `locale` REQUIS: c'est un message de sécurité, et un message de sécurité que
 * son destinataire ne lit pas ne protège personne.
 */
export function renderExportRequestedNotice(locale: string): RenderedNotice {
  if (isFrenchLocale(locale)) {
    const body =
      "Un export de tes données Sophia vient d'être demandé depuis ton compte. " +
      "Si ce n'est pas toi, change ton mot de passe immédiatement.";
    return {
      body,
      subject: "Sophia — un export de tes données vient d'être demandé",
      html: `<p>Bonjour,</p><p>${body}</p><p>— L'équipe Sophia</p>`,
    };
  }
  const body =
    "An export of your Sophia data has just been requested from your account. " +
    "If this was not you, change your password immediately.";
  return {
    body,
    subject: "Sophia — a data export was just requested",
    html: `<p>Hello,</p><p>${body}</p><p>— The Sophia team</p>`,
  };
}

/**
 * Le README de l'archive.
 *
 * Il était français en dur, y compris l'avertissement de sécurité — celui qui
 * dit que le fichier contient l'historique complet des conversations et qu'il
 * ne doit pas traîner dans un dossier synchronisé. Un avertissement que son
 * lecteur ne comprend pas est un avertissement absent.
 */
export function renderExportReadme(
  exportedAtIso: string,
  locale: string,
): string {
  return isFrenchLocale(locale)
    ? frenchReadme(exportedAtIso, locale)
    : englishReadme(exportedAtIso, locale);
}

/** GELÉ, mot pour mot, tel qu'il était en dur. */
function frenchReadme(exportedAtIso: string, locale: string): string {
  return [
    "EXPORT DE TES DONNÉES SOPHIA",
    "============================",
    "",
    `Export généré le : ${formatAccountDate(exportedAtIso, locale)}`,
    "",
    "Contenu de l'archive :",
    "  - profil.json          : tes informations de compte (nom, email, téléphone…).",
    "  - transformations.json : tes cycles et transformations tels que visibles dans l'app.",
    "  - plans.json           : tes plans et les actions qui les composent.",
    "  - suivi.json           : tes entrées de suivi (check-ins, progrès, blocages).",
    "  - souvenirs.json       : les souvenirs que Sophia a retenus de vos échanges.",
    "  - conversations.json   : l'historique de tes conversations avec Sophia.",
    "  - protocole.json       : le protocole écrit par ton coach (versions, engagements,",
    "                           relations entre engagements) et, si tu es coach, tes",
    "                           modèles, documents importés, doctrine, cohortes et",
    "                           l'agrégat de tes synthèses hebdomadaires.",
    "  - mon_foyer.json       : ta place dans un foyer (prénom, date de naissance,",
    "                           objectif, absences), la taille/le poids/le sexe saisis",
    "                           pour calculer ta part, et — c'est important — ce qui",
    "                           SURVIT à la suppression de ton compte, ce qui en est",
    "                           EFFACÉ, et comment effacer le reste.",
    "  - mon_plan.json        : ton objectif, les semaines que tu t'es fixées et tes",
    "                           points du soir.",
    "  - ma_memoire_alimentaire.json : tes repas récurrents, tes préférences et ton",
    "                           contexte, et les idées de repas reçues.",
    "  - mes_cartes.json      : tes cartes, quand elles ont été armées et ce que tu en",
    "                           as fait.",
    "  - protocole_suivi.json : ce que tu as déclaré (repas, prises, photos) et les",
    "                           évaluations qui en découlent, jour par jour.",
    "  - protocole_bilans.json: tes bilans hebdomadaires et tes demandes d'ajustement.",
    "  - securite.json        : tes contraintes de sécurité (allergies, intolérances,",
    "                           traitements) telles que déclarées.",
    "  - coaching.json        : tes liens avec un coach, les invitations reçues ou",
    "                           envoyées, les accès à ton dossier, et les notes",
    "                           que ton coach a écrites à ton sujet (ainsi que",
    "                           celles que tu as écrites, si tu es coach).",
    "  - fichiers.json        : la liste de tes fichiers, avec pour chacun s'il est",
    "                           inclus dans l'archive et, sinon, pourquoi. Si son",
    "                           champ « tables_indisponibles » n'est pas vide, une",
    "                           partie des données ci-dessus manque : écris-nous.",
    "  - fichiers/            : tes documents de plan et tes photos de repas.",
    "",
    "⚠ AVERTISSEMENT",
    "Ce fichier contient des données personnelles sensibles (dont l'historique de",
    "tes conversations). Conserve-le en lieu sûr, ne le partage pas et supprime-le",
    "des espaces partagés ou synchronisés si tu n'en as plus besoin.",
    "",
    "Format : JSON (UTF-8), lisible avec n'importe quel éditeur de texte.",
    "Pour toute question : sophia@sophia-coach.ai",
    "",
  ].join("\n");
}

/**
 * Le pack ANGLAIS.
 *
 * Les NOMS DE FICHIERS sont recopiés à l'identique — voir l'en-tête: ils
 * désignent une entrée réelle du ZIP. Seule la description change.
 */
function englishReadme(exportedAtIso: string, locale: string): string {
  return [
    "YOUR SOPHIA DATA EXPORT",
    "=======================",
    "",
    `Export generated on: ${formatAccountDate(exportedAtIso, locale)}`,
    "",
    "What is in this archive (file names are kept as they are stored):",
    "  - profil.json          : your account details (name, email, phone…).",
    "  - transformations.json : your cycles and transformations as shown in the app.",
    "  - plans.json           : your plans and the actions that make them up.",
    "  - suivi.json           : your tracking entries (check-ins, progress, blockers).",
    "  - souvenirs.json       : the memories Sophia kept from your exchanges.",
    "  - conversations.json   : the history of your conversations with Sophia.",
    "  - protocole.json       : the protocol written by your coach (versions,",
    "                           commitments, relations between commitments) and, if",
    "                           you are a coach, your templates, imported documents,",
    "                           doctrine, cohorts and the aggregate of your weekly",
    "                           syntheses.",
    "  - mon_foyer.json       : your place in a household (first name, date of birth,",
    "                           goal, days away), the height/weight/sex entered to",
    "                           compute your share, and — this matters — what",
    "                           SURVIVES the deletion of your account, what is",
    "                           ERASED with it, and how to erase the rest.",
    "  - mon_plan.json        : your goal, the weeks you set yourself, and your",
    "                           evening check-ins.",
    "  - ma_memoire_alimentaire.json : your recurring meals, your preferences and",
    "                           your context, and the meal ideas you received.",
    "  - mes_cartes.json      : your cards, when they were armed, and what you did",
    "                           with them.",
    "  - protocole_suivi.json : what you declared (meals, intakes, photos) and the",
    "                           evaluations that follow from it, day by day.",
    "  - protocole_bilans.json: your weekly reviews and your adjustment requests.",
    "  - securite.json        : your safety constraints (allergies, intolerances,",
    "                           medication) as you declared them.",
    "  - coaching.json        : your links with a coach, invitations received or",
    "                           sent, accesses to your file, and the notes your coach",
    "                           wrote about you (as well as the ones you wrote, if",
    "                           you are a coach).",
    "  - fichiers.json        : the list of your files, each with whether it is",
    "                           included in the archive and, if not, why. If its",
    '                           "tables_indisponibles" field is not empty, part of',
    "                           the data above is missing: write to us.",
    "  - fichiers/            : your plan documents and your meal photos.",
    "",
    "⚠ WARNING",
    "This file contains sensitive personal data (including the history of your",
    "conversations). Keep it somewhere safe, do not share it, and delete it from",
    "shared or synced folders once you no longer need it.",
    "",
    "Format: JSON (UTF-8), readable with any text editor.",
    "Questions: sophia@sophia-coach.ai",
    "",
  ].join("\n");
}
