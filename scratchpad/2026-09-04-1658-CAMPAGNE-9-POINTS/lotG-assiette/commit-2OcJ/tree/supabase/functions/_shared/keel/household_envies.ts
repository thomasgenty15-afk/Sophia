/**
 * LES ENVIES DU FOYER — une ligne, écrite par le compte maître. PUR.
 *
 * Autorité produit: docs/keel/CHANTIER-FOYER-PROFILS.md, lot 5.
 *
 * ── CE QUI A ÉTÉ RETIRÉ LE 2026-08-10, ET POURQUOI ON NE LE REMET PAS ────
 * Ce module portait `mergeEnvies`: une récolte PAR MEMBRE, un bloc qui listait
 * qui avait parlé et qui s'était tu, et une consigne au modèle sur la façon de
 * traiter le silence. Deux raisons de l'avoir jeté, aucune esthétique:
 *
 *   1. La récolte par membre demandait à celui qui tient le foyer de courir
 *      après tout le monde. Un décompte « 3 personnes n'ont rien dit » se lit
 *      « il en reste 3 à relancer », quoi qu'en dise la copie à côté — donc on
 *      avait recréé la charge mentale que le produit promet de supprimer.
 *   2. Sophia arbitrant publiquement entre un parent et son enfant est un
 *      marécage: le produit n'a aucune autorité pour trancher qui l'emporte à
 *      table.
 *
 * Ce qui reste: UNE PHRASE, écrite par le maître pour tout le monde — « Léa
 * veut des pâtes, Marc en a marre du poulet ». On garde la variété et le
 * sentiment que chacun compte; on jette la modération et l'arbitrage public.
 *
 * ── LE SILENCE N'A PLUS BESOIN D'ÊTRE EXPLIQUÉ AU MODÈLE ─────────────────
 * L'ancien bloc devait DIRE au modèle que l'absence de réponse est un état
 * légitime, parce qu'il listait des noms suivis de « n'a rien dit » — et un
 * modèle à qui l'on montre une case vide la remplit ou l'attend. Ici, pas de
 * ligne ⇒ pas de bloc du tout: il n'y a rien à attendre, donc rien à
 * expliquer. La règle de survie (§8.4) est inchangée, elle est juste devenue
 * structurelle au lieu d'être une consigne.
 *
 * ── L'ARBITRAGE RESTE AU GÉNÉRATEUR, ET IL DOIT LE DIRE ──────────────────
 * Une seule phrase peut se contredire elle-même (« du poisson, mais pas de
 * poisson jeudi ») ou contredire les règles de maison. On ne tranche pas ici:
 * trancher en code produirait un arbitrage muet, et un foyer à qui l'on retire
 * son envie sans un mot cesse d'en déposer.
 *
 * ── ET IL NE REND JAMAIS « IMPOSSIBLE » ──────────────────────────────────
 * Aucun chemin de ce module ne lève. Un générateur qui renvoie une erreur à
 * une famille le samedi soir est un produit mort (§8.4).
 */

/**
 * PLAFOND DE LA LIGNE. La base en pose déjà un (`household_envy_body_check`,
 * 500 caractères), et celui-ci n'est pas un doublon: ce module peut être appelé
 * avec du texte qui n'est pas passé par la RPC (un import, un test, un chemin
 * futur). Un prompt de 20 Ko est un défaut que ce dépôt a déjà payé sur le
 * composeur; la borne vit donc aussi du côté qui construit le prompt.
 */
export const MAX_ENVY_CHARS = 500;

function clamp(body: string): string {
  const text = body.trim().replace(/\s+/g, " ");
  return text.length <= MAX_ENVY_CHARS ? text : `${text.slice(0, MAX_ENVY_CHARS)}…`;
}

/**
 * Le bloc de prompt pour la ligne d'envies de la semaine.
 *
 * @param line ce que le maître a écrit pour CETTE semaine, ou `null`/vide s'il
 *        n'a rien écrit. Le lecteur est responsable de l'ancrage temporel: une
 *        phrase d'une semaine passée ne doit jamais arriver ici.
 * @returns le bloc, ou `""` quand il n'y a rien à dire. Une chaîne vide est
 *          filtrée par l'appelant — un en-tête « voici ce que le foyer a
 *          demandé » suivi de rien ferait composer le modèle contre une
 *          demande imaginaire.
 */
export function buildEnvyBlock(line: string | null | undefined): string {
  const body = typeof line === "string" ? clamp(line) : "";
  if (!body) return "";

  return [
    "WHAT THIS HOUSEHOLD ASKED FOR THIS WEEK.",
    "The person who runs this home wrote this, in their own words, for",
    "everyone at the table:",
    "",
    `  "${body}"`,
    "",
    // L'arbitrage: obligatoire, et DIT. Sans cette consigne, un modèle qui
    // rencontre « pas de poulet » et une règle de maison contradictoire choisit
    // en silence, et le foyer ne sait pas ce qui a été sacrifié.
    // ⟳ 2026-09-05 — SERVIE TELLE QUELLE. Mesuré (C06, C07): « pizza » devenait
    // « un dîner de tofu, plus léger », « raviolis aux champignons » devenait
    // « pizza végétale et tofu » — troqués sans qu'aucune règle ne l'impose.
    // L'envie est la seule ligne où la personne dit ce qu'elle VEUT; on la sert
    // comme elle est dite, et on ne troque que contre une règle nommée.
    "Serve it AS ASKED: a pizza is a pizza, ravioli are ravioli. Trade it away",
    "only when a rule below forbids it -- never for a lighter or healthier",
    "version nobody asked for.",
    "This line may contradict itself, or contradict the house rules below.",
    "Compose ONE plan anyway and say plainly, in one short sentence, what you",
    "traded off and for whom.",
    "Never answer that the week is impossible.",
  ].join("\n");
}
