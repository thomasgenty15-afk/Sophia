/**
 * FF-062 R13 — LE DERNIER MESSAGE TUE LE PRÉCÉDENT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA RÈGLE, ET POURQUOI ELLE NE STOCKE RIEN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Quand un message proactif part et que le précédent n'a pas obtenu sa réponse,
 * le nouveau REMPLACE l'ancien: les boutons de l'ancien cessent d'être honorés.
 *
 * Le motif, dans les mots de la décision: *« ça laisse pas les gens se dire
 * j'ai le temps »*. Le produit ne saura pas traiter quelqu'un qui déclare
 * mercredi qu'il n'a pas fait les courses de lundi — la réparation n'existe
 * plus à ce moment-là (FF-061 R11, `session_elapsed`). Une question qui reste
 * tapable trois jours promet donc une réparation qui n'arrivera pas.
 *
 * ── ⛔ AUCUN ÉTAT N'EST ÉCRIT, ET C'EST LE CŒUR DE CE MODULE ──────────────
 *
 * La première conception posait un drapeau « désarmé » à l'émission. Trois
 * choses l'ont écartée, et chacune suffit:
 *
 *   1. **`chat_messages` est UPDATE-able par l'élève.** `rls_chat_messages_update_own`
 *      + `GRANT ALL TO authenticated`: un drapeau dans `metadata` est une garde
 *      que le client peut effacer, c'est-à-dire une garde décorative;
 *   2. **Realtime ne diffuse que les INSERT.** Un UPDATE de désarmement
 *      n'atteindrait pas l'onglet ouvert: l'élève verrait un bouton vivant et
 *      recevrait un refus. C'est littéralement « le bouton ment »;
 *   3. et surtout: un second état à invalider est un état dont l'écrivain finit
 *      par disparaître. Ce dépôt paie cette faute en boucle — `grocery_waves.ts`
 *      l'énonce (« les vagues se calculent à la lecture »), `accident.ts` la
 *      répète, `plan_feedback_chat.ts` aussi.
 *
 * **Le fait est déjà en base**: l'ordre des messages. « Le dernier message
 * proactif porteur de boutons » se DÉRIVE de `chat_messages`, à la lecture, et
 * cette dérivation ne peut pas se désynchroniser d'elle-même.
 *
 * ── CE QUE ÇA IMPOSE: LE TAP DOIT DIRE D'OÙ IL VIENT ─────────────────────
 * `InboundMessage.reply_to` existait, était parsé, était journalisé — et le
 * front ne le remplissait jamais. Il le remplit depuis le 2026-09-01
 * (`ChatPage.onButton` passe `message.id`). Un tap SANS `reply_to` n'est pas
 * refusé: on ne sait pas d'où il vient, et refuser sur une ignorance ferait
 * taire les clients anciens. Fail-open, nommé, compté.
 *
 * ── CE QUI N'EST JAMAIS DÉSARMÉ ──────────────────────────────────────────
 *   · les messages TRANSACTIONNELS (fin d'accès, facturation): ils répondent à
 *     un fait contractuel, pas à un état de l'élève;
 *   · les ACCUSÉS (`isReply`): ils ne portent pas de demande ouverte, et les
 *     désarmer casserait les enchaînements à deux temps (« Pas tout » → les
 *     plats), qui sont des réponses à un tap, pas des messages proactifs.
 *
 * PURE MODULE côté décision; la lecture vit dans `disarmed_tap_io.ts`.
 */

/** Les purposes qui ne désarment rien et ne se font jamais désarmer. */
export const NEVER_DISARMED_PURPOSES: ReadonlySet<string> = new Set([
  "subscription_confirmed",
  "subscription_modified",
  "account_deletion_confirmed",
  "account_export_ready",
]);

export type DisarmVerdict =
  /** Le tap vient du dernier message à boutons: il est honoré. */
  | { disarmed: false; reason: "current" }
  /** On ne sait pas d'où vient le tap. Fail-open, et c'est compté. */
  | { disarmed: false; reason: "no_reply_to" }
  /** Aucun message à boutons en base — rien à comparer. */
  | { disarmed: false; reason: "no_armed_message" }
  /** Le message est transactionnel: hors règle. */
  | { disarmed: false; reason: "transactional" }
  /** Un message plus récent l'a remplacé. */
  | { disarmed: true; reason: "superseded"; latestId: string };

/**
 * Le tap vient-il du message qui porte encore la main ?
 *
 * @param replyTo l'id de la bulle qui portait le bouton, ou `null`.
 * @param latestArmedId l'id du DERNIER message assistant porteur de boutons,
 *   ou `null` s'il n'y en a aucun.
 * @param replyToPurpose le `purpose` de la bulle tapée, quand on a pu le lire.
 *
 * ⚠️ « LE DERNIER PORTEUR DE BOUTONS », PAS « LE DERNIER MESSAGE ». Un message
 * proactif SANS boutons (un fait du soir sans bande) ne doit pas désarmer une
 * question posée la veille: il ne la remplace pas, il ne demande rien. C'est la
 * seule nuance qui sépare cette règle de « le dernier message gagne », et elle
 * est la différence entre fermer une question et fermer une conversation.
 */
export function judgeTapFreshness(args: {
  replyTo: string | null;
  latestArmedId: string | null;
  replyToPurpose: string | null;
}): DisarmVerdict {
  const replyTo = String(args.replyTo ?? "").trim();
  if (!replyTo) return { disarmed: false, reason: "no_reply_to" };

  const purpose = String(args.replyToPurpose ?? "").trim();
  if (purpose && NEVER_DISARMED_PURPOSES.has(purpose)) {
    return { disarmed: false, reason: "transactional" };
  }

  const latest = String(args.latestArmedId ?? "").trim();
  if (!latest) return { disarmed: false, reason: "no_armed_message" };
  if (latest === replyTo) return { disarmed: false, reason: "current" };
  return { disarmed: true, reason: "superseded", latestId: latest };
}

/**
 * LA PHRASE D'UN BOUTON QUI N'EST PLUS D'ACTUALITÉ — une seule, partagée.
 *
 * ⚠️ ELLE ÉTAIT RECOPIÉE TROIS FOIS dans le routeur, et un quatrième chemin
 * l'aurait recopiée une quatrième. Quatre exemplaires d'une même phrase, c'est
 * quatre phrases le jour où l'une bouge — et celle-ci est la seule que la
 * personne lit quand un geste ne fait rien: si elle diverge, le produit dit
 * « rien n'a été enregistré » de quatre façons, dont trois qu'elle n'a jamais
 * vues.
 *
 * ⛔ ELLE DIT L'EFFET, PAS LA CAUSE. Ni « votre bouton a expiré », ni « cette
 * ligne appartient à quelqu'un d'autre »: un message par cas serait un oracle
 * pour qui tape des charges au hasard.
 */
export function UNUSABLE_BUTTON_ACK(language: "fr" | "en"): string {
  return language === "fr"
    ? "Celui-là n'est plus d'actualité — rien n'a été enregistré."
    : "That one's no longer open — nothing has been saved.";
}
