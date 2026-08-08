// FF-025 · L'INVITATION À LA PHOTO — approfondir un don, jamais réclamer.
//
// ── LE PROBLÈME ─────────────────────────────────────────────────────────────
//   Élève : « j'ai pas eu le temps, j'ai commandé »
//   Base  : une ligne hors plan, sans aliment, sans rien.
// Une photo aurait tout donné en trois secondes, et la personne a son téléphone
// DANS LA MAIN au moment où elle écrit. Rien ne l'invite à le faire.
//
// ── LA FRONTIÈRE QUI LA LÉGITIME, ET ELLE EST TOUTE LA FICHE ────────────────
// « Le chat n'initie jamais une collecte » (T3) interdit de RÉCLAMER À FROID,
// pas d'APPROFONDIR UN DON. L'invitation est adossée à un fait que la personne
// VIENT de donner, au moment exact où elle l'a donné (T5). Sans ce fait, il n'y
// a pas d'invitation — et c'est pour ça que `planRelation` et
// `committedEventCount` sont des paramètres REQUIS et non des options.
//
// ── POURQUOI UN MODULE PUR, ET UN TEXTE FIGÉ ────────────────────────────────
// Même raison que les gabarits de `meal_precision.ts`: « un prompt est une
// intention; une constante est une garantie ». Confier cette phrase à une
// génération, c'est remettre à chaque tour la ligne rouge du registre (R6:
// l'utilité, jamais le contrôle) — et ce dépôt a mesuré que les correctifs
// prompt-only régressent en run réel. Le test passe chaque gabarit au crible
// d'un lexique de contrôle ET d'un lexique de quantité, DANS LES DEUX LANGUES:
// la garde ne peut pas dériver sans casser un test.
//
// ── LA LIGNE D'ÉDUCATION, ET LA LECTURE QU'ELLE IMPOSE ──────────────────────
// §3 dit « au plus UNE ligne d'éducation — une fois, puis silence », et §7 dit
// « une fois par PERSONNE, pas une fois par repas ». Mais R2 dit « zéro
// relance: ni le lendemain, ni au repas suivant ». Ces deux phrases ne peuvent
// tenir ensemble que d'une seule manière: la ligne d'éducation n'est pas un
// SECOND message, c'est la FORME que prend la toute première invitation. Une
// invitation autonome le lendemain serait la relance que R2 interdit, aussi
// gentille soit-elle.
//   → première invitation de la vie de cette personne : variante éducative;
//   → toutes les suivantes                            : variante nue.
// L'écart avec la lettre de §3 est consigné au rapport, avec l'amendement
// proposé. MODULE PUR: aucune I/O, aucune horloge, aucun aléa.

import { localePackKey, type LocalePackKey } from "./locale.ts";

/**
 * LES GABARITS. Constantes, jamais générées, une paire par langue.
 *
 * `bare` — l'invitation ordinaire. UNE phrase.
 * `educating` — la même, dite une seule fois dans la vie de la personne, avec
 *   ce qu'elle a besoin de savoir pour y penser toute seule la prochaine fois:
 *   qu'une photo approximative suffit, et que ne pas l'envoyer ne coûte rien.
 *
 * CE QUE CHAQUE MOT PORTE, ET POURQUOI IL EST LÀ:
 *  - « si tu as » / « if you have » — la porte est ouverte, pas le rendez-vous;
 *  - « ça aide le suivi » — le registre est l'UTILITÉ (R6). « pour que je
 *    vérifie » transformerait l'app de conseil en app de surveillance en une
 *    phrase, et c'est le rabbit hole nommé par la fiche;
 *  - « sinon aucun souci » — la contre-mesure de §10, écrite DANS la phrase: si
 *    déclarer déclenche une demande, les gens arrêtent de déclarer. La seule
 *    protection qui tienne est que la demande porte visiblement son propre
 *    droit de refus.
 */
const PHOTO_INVITATION_PACKS: Readonly<
  Record<LocalePackKey, Readonly<{ bare: string; educating: string }>>
> = {
  en: {
    bare: "If you have a photo of it, send it over — it helps the tracking.",
    educating:
      "If you have a photo of it, send it over: even a rough one tells me more than a description, and if you don't, no worries.",
  },
  fr: {
    bare: "Si tu as une photo, envoie-la — ça aide le suivi.",
    educating:
      "Si tu as une photo, envoie-la : même approximative, elle m'en dit plus qu'une description, et sinon aucun souci.",
  },
};

/** Les gabarits d'une langue. R7 par délégation: langue non livrée ⇒ throw. */
export function photoInvitationSentences(
  locale: string,
): Readonly<{ bare: string; educating: string }> {
  return PHOTO_INVITATION_PACKS[localePackKey(locale)];
}

/** Toutes les phrases livrées, dans toutes les langues. Sert aux tests et aux ceintures. */
export function allPhotoInvitationSentences(): string[] {
  return Object.values(PHOTO_INVITATION_PACKS).flatMap((pack) => [
    pack.bare,
    pack.educating,
  ]);
}

export type PhotoInvitationGateReason =
  | "invite"
  /** R5 — plancher de sécurité. Hors débat. */
  | "safety_band"
  /** T4 — le budget du jour est déjà consommé, par n'importe quelle surface. */
  | "budget_consumed"
  /** Une photo accompagne déjà ce tour: il n'y a rien à inviter. */
  | "photo_attached"
  /** Une intention, pas un fait. Même désarme que les planchers. */
  | "future_intent"
  /** Le fait n'est pas hors plan (ou sa relation est inconnue). */
  | "not_off_plan"
  /** Rien n'a été écrit: pas de parole sans ligne. */
  | "no_committed_fact"
  /** Une question de précision attend déjà sa réponse. */
  | "flow_already_open";

export interface PhotoInvitationGateResult {
  invite: boolean;
  /** La phrase EXACTE à ajouter à la réponse, ou null. */
  sentence: string | null;
  /** true quand c'est la variante éducative — la première fois, et une seule. */
  educating: boolean;
  /** Toujours nommé, jamais un silence. */
  reason_code: PhotoInvitationGateReason;
}

/**
 * Invite-t-on ?
 *
 * ── TOUS LES PARAMÈTRES SONT REQUIS, ET CE N'EST PAS DU ZÈLE ────────────────
 * La cicatrice `optional-gate-params-are-disarmed-gates` a été payée sur
 * exactement cette forme: `safetyBand?` a laissé une ceinture ne jamais mordre
 * pendant des semaines, parce qu'aucun appelant ne la passait et qu'aucun test
 * ne tombait. Un paramètre de garde optionnel est une garde désarmée.
 *
 * ── L'ORDRE DES REFUS EST LE CONTRAT, du plus grave au plus bénin ───────────
 *  1. safety — demander une image de l'assiette à quelqu'un qui va mal est
 *     exactement ce que le plancher interdit (R5). Toute bande ≠ `none` ferme;
 *  2. intention future — on n'invite pas à photographier un repas qui n'a pas
 *     eu lieu;
 *  3. une photo est déjà là — il n'y a plus rien à inviter, et le redemander
 *     serait le signe le plus court qu'on ne lit pas ce qui arrive;
 *  4. aucun fait committé — pas de parole sans ligne. Une invitation sans
 *     ligne parlerait d'un repas qui n'existe pas;
 *  5. pas hors plan — §3: « jamais sur un repas conforme au plan ». `null`
 *     compte comme « pas hors plan »: la relation inconnue n'est pas une
 *     autorisation;
 *  6. flow déjà ouvert — une question attend déjà sa réponse. Deux demandes
 *     ouvertes en même temps sont l'interrogatoire, même étalées sur deux tours;
 *  7. budget du jour.
 *
 * Le budget vient EN DERNIER parce que sa lecture coûte un aller-retour en
 * base: on ne la paie que si tout le reste laisse passer.
 */
export function gatePhotoInvitation(args: {
  /** R7 — la phrase part vers l'élève: le gate porte donc sa langue. REQUIS. */
  locale: string;
  /** La relation au plan du fait qui vient d'être écrit. `null` = inconnue. */
  planRelation: string | null;
  /** REQUIS. Toute bande ≠ `none` ferme. */
  safetyBand: string | null | undefined;
  /** Le tour porte-t-il déjà une image. */
  hasMedia: boolean;
  /** La ceinture déterministe partagée avec la lane d'écriture. */
  futureIntent: boolean;
  /** Le nombre de lignes RELUES par ce tour. Zéro ferme. */
  committedEventCount: number;
  /** Le compte du budget partagé, tous genres confondus. */
  asksMadeToday: number;
  /** Cette personne a-t-elle déjà été invitée une fois, un jour quelconque. */
  alreadyInvitedEver: boolean;
  /** Une question de précision attend-elle déjà sa réponse. */
  flowAlreadyOpen: boolean;
  /** Le plafond. Passé explicitement pour que les tests puissent l'éprouver. */
  budget: number;
}): PhotoInvitationGateResult {
  const deny = (
    reason: PhotoInvitationGateReason,
  ): PhotoInvitationGateResult => ({
    invite: false,
    sentence: null,
    educating: false,
    reason_code: reason,
  });

  const band = String(args.safetyBand ?? "none").trim().toLowerCase() || "none";
  if (band !== "none") return deny("safety_band");
  if (args.futureIntent) return deny("future_intent");
  if (args.hasMedia) return deny("photo_attached");
  if (args.committedEventCount <= 0) return deny("no_committed_fact");
  if (String(args.planRelation ?? "").trim() !== "off_plan") {
    return deny("not_off_plan");
  }
  if (args.flowAlreadyOpen) return deny("flow_already_open");
  if (args.asksMadeToday >= args.budget) return deny("budget_consumed");

  const pack = photoInvitationSentences(args.locale);
  const educating = !args.alreadyInvitedEver;
  return {
    invite: true,
    sentence: educating ? pack.educating : pack.bare,
    educating,
    reason_code: "invite",
  };
}

/**
 * L'AJOUT À LA RÉPONSE, par le runtime et pas par le modèle.
 *
 * CONDITION DE DÉSARMEMENT (doctrine P9): sans invitation armée, la fonction
 * rend le texte INCHANGÉ, et elle n'en retire jamais rien. Elle ne peut donc
 * pas appauvrir une réponse; au pire elle n'ajoute rien.
 *
 * ── POURQUOI ELLE NE SE TAIT PAS DEVANT UN « ? » DÉJÀ PRÉSENT ───────────────
 * `appendMealPrecisionQuestion` abandonne quand le composeur a déjà posé une
 * question — « deux questions sont un interrogatoire ». Une invitation N'EST
 * PAS une question: elle ne se répond pas, elle ouvre une porte, et elle ne
 * porte aucun point d'interrogation. Surtout, elle a DÉJÀ consommé sa place au
 * budget: l'abandonner ici brûlerait la place ET la ligne d'éducation « une
 * fois par personne » sans que personne n'ait rien lu. L'anti-interrogatoire
 * est tenu en amont, par le budget partagé qui empêche une seconde demande
 * d'être armée dans le même tour.
 */
export function appendPhotoInvitation(
  text: string,
  sentence: string | null | undefined,
): string {
  const source = String(text ?? "");
  const invite = String(sentence ?? "").trim();
  if (!invite) return source;
  // Déjà présente (rejeu, ou composeur qui a recopié le gabarit): ne pas la
  // doubler. Comparaison EXACTE sur un gabarit fermé — pas une heuristique de
  // sens, une égalité de chaîne.
  if (source.includes(invite)) return source;
  const body = source.trim();
  return body ? `${body}\n\n${invite}` : invite;
}
