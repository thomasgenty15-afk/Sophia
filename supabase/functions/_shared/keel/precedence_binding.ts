/**
 * ══════════════════════════════════════════════════════════════════════════
 * `D3′-c` — LE TEXTE D'ARBITRAGE DU FOYER EST LIÉ À SON MILLÉSIME DE PROMPT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⛔ POURQUOI CE MODULE EXISTE, ET IL A UNE DATE ─────────────────────────
 * Le 2026-08-22 à 18:51, `D3′` a réécrit le bloc d'arbitrage de la lane FOYER:
 * le rang 1 a cessé de dire « at the VERY TOP » pour NOMMER ses trois blocs de
 * verrou, un arbitrage inter-bouches a été ajouté, et le bloc est passé en
 * queue du message. `HOUSEHOLD_PROMPT_VERSION` n'a PAS bougé: il valait encore
 * `v21_one_box_per_group` le lendemain.
 *
 * La règle du dépôt — « quelle population voit une consigne ? » — dit qu'un
 * changement de prompt bump le millésime. Elle n'était armée par RIEN: aucun
 * test ne reliait le TEXTE au JETON, et un jeton qui ne bouge pas mélange dans
 * une même population deux prompts qui ne disent pas la même chose.
 *
 * ⛔ CE QUE ÇA A COÛTÉ, ET C'EST MESURÉ. Le 2026-08-23, la question « pourquoi
 * la variante FOYER ne sort-elle jamais ? » a demandé une heure et une entrée
 * de registre fausse. Elle se lisait en une requête si la ligne avait porté son
 * millésime: 12 lignes `…+household.v21_one_box_per_group`, la dernière à
 * 14:51:38 — QUATRE HEURES AVANT la livraison de `D3′`. Le correctif n'était
 * pas désarmé, il n'avait simplement jamais été servi. Sans jeton, « le prompt
 * neuf ne mord pas » et « le prompt neuf n'a jamais tourné » rendent le même
 * zéro — c'est le défaut §⑨ n° 50 transposé à une mesure.
 *
 * ── ⚠️ CE MODULE N'IMPORTE QUE `precedence_tail.ts`, QUI N'IMPORTE RIEN ────
 * §⑨ n° 92: une garde doit être exécutable depuis un clone. Un seul saut, vers
 * un module qui est lui-même une feuille.
 *
 * ── CE QU'IL NE FAIT PAS ──────────────────────────────────────────────────
 * Il ne lit aucune base et n'appelle aucun modèle. Il compare deux chaînes.
 */

import { buildPrecedenceBlock, type PrecedenceLane } from "./precedence_tail.ts";

/**
 * L'EMPREINTE DU TEXTE D'ARBITRAGE SERVI PAR CHAQUE MILLÉSIME DE FOYER.
 *
 * ⛔ CE N'EST PAS UN PIN QUI SE RÉGÉNÈRE. Une entrée déjà écrite est une
 * AFFIRMATION SUR LE PASSÉ: « les lignes qui portent ce jeton ont vu CE
 * texte-là ». La modifier réécrit l'histoire d'une population déjà en base.
 * Changer le texte se fait en AJOUTANT une clé, jamais en éditant une valeur.
 *
 * ── `v21_one_box_per_group` — ET SON EMPREINTE EST CELLE DE LA LANE SOLO ──
 * Avant `D3′` la lane foyer n'avait pas de variante: elle servait le bloc
 * SOLO, posé par le tronc (`meal_generation.ts`). ⚠️ CE N'EST PAS UNE DÉDUCTION
 * DE LECTURE, c'est une mesure: les 243 `user_message` archivés de
 * `generate-household-meal-v1` qui portent l'en-tête d'arbitrage portent
 * `buildPrecedenceBlock("solo")` OCTET POUR OCTET — 243 sur 243, le 2026-08-23.
 * C'est aussi ce qui prouve que le texte solo a survécu intact au déplacement
 * de `D3′` vers `precedence_tail.ts`, et donc que `MEAL_PROMPT_VERSION`, lui,
 * n'avait rien à bumper.
 *
 * ── `v22_precedence_in_tail` — le millésime que `D3′-c` pose ───────────────
 * Le bump est encore SANS PERTE, et il ne le sera plus jamais: aucune ligne
 * `v21` n'a été écrite après la livraison de `D3′` (dernière: 2026-08-22
 * 14:51:38 CEST, livraison: 18:51:33 CEST). La population `v21` est donc
 * ENTIÈREMENT pré-`D3′`. Un seul run réel entre les deux l'aurait rendue
 * définitivement ambiguë.
 */
export const HOUSEHOLD_ARBITRATION_BY_VERSION: Readonly<Record<string, string>> = {
  v21_one_box_per_group: "e4a368b0424334db24328229fb60be442a4caae02fb70619ec6c2c8a89c9feb5",
  v22_precedence_in_tail: "349e5ec42ade5d7f27eb53412252d4e53fb25d07d3f39aa3906aff9a01c0f011",
  // ⟳ v23 (2026-09-03, D6.2) — MÊME EMPREINTE QUE v22, ET C'EST LE POINT.
  // Le bump vient du bloc de la GAMELLE (`workLunchBlock`), pas du bloc
  // d'arbitrage: celui-ci n'a pas bougé d'un octet. Recopier l'empreinte
  // est donc l'affirmation exacte — « la précédence est celle de v22 » —
  // et une entrée ABSENTE ferait tomber la garde sur un texte inchangé.
  v23_the_lunchbox_travels: "349e5ec42ade5d7f27eb53412252d4e53fb25d07d3f39aa3906aff9a01c0f011",
  // ⟳ 2026-09-04 — EMPREINTE NEUVE, ET J'AVAIS ÉCRIT LE CONTRAIRE.
  //
  // En posant cette ligne j'ai d'abord recopié l'empreinte de v23, en pensant
  // que la boîte d'échange ne touchait que le bloc de RÉGIME et celui des
  // BOÎTES. C'était faux, et c'est ce test qui l'a dit: le rang 1 du bloc
  // d'arbitrage CITE les en-têtes des verrous en toutes lettres, et l'un
  // d'eux vient d'être renommé (« WHAT THE SHARED DISH » → « SHARED BASE »).
  // Le texte servi a donc bougé, et une empreinte recopiée aurait fait
  // ressembler deux textes différents à un seul millésime.
  v24_the_swap_box: "2e4fef9a623b4843dd8613e1ba00062aa2498f51257bc61ffad32751d363ffe1",
  // ⟳ 2026-09-04 — MÊME EMPREINTE QUE v24, ET CETTE FOIS C'EST VÉRIFIÉ, PAS
  // SUPPOSÉ. La voix par bouche change le bloc DES VOIX; le bloc d'arbitrage,
  // lui, ne cite que les en-têtes des VERROUS, et aucun n'a bougé. Au lot
  // précédent j'avais recopié une empreinte en le croyant, et c'était faux —
  // ce test l'avait dit.
  v25_every_mouth_has_a_voice: "2e4fef9a623b4843dd8613e1ba00062aa2498f51257bc61ffad32751d363ffe1",
  // ⟳ v26 (2026-09-04) — MÊME EMPREINTE QUE v25, ET VÉRIFIÉE PAR LE TEST, pas
  // recopiée par symétrie. Le bump vient de `EXPLANATION_SCHEMA_BLOCK` (suffixe
  // SYSTÈME) et de `DECIDED BEFORE YOU` (message utilisateur, avant les
  // verrous). Le bloc d'arbitrage ne cite que les EN-TÊTES des verrous, et
  // aucun n'a bougé — ni le régime, ni les règles de maison, ni la cuisine.
  // Si l'empreinte tombait quand même, c'est que j'ai déplacé un verrou sans
  // le voir, et il faudrait le lire avant d'écrire un nouveau chiffre ici.
  v26_the_plan_says_what_it_weighed:
    "2e4fef9a623b4843dd8613e1ba00062aa2498f51257bc61ffad32751d363ffe1",
  // v27 (2026-09-04): la préparation à part pour le composant échangé, dans le
  // bloc SCHÉMA des boîtes — le bloc d'arbitrage ne bouge pas, même empreinte.
  v27_the_swap_cooks_apart:
    "2e4fef9a623b4843dd8613e1ba00062aa2498f51257bc61ffad32751d363ffe1",
};

/** SHA-256 hexadécimal — `crypto.subtle`, standard web, présent en edge. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** L'empreinte du bloc d'arbitrage d'une lane, tel qu'il partirait aujourd'hui. */
export function precedenceDigest(lane: PrecedenceLane): Promise<string> {
  return sha256Hex(buildPrecedenceBlock(lane));
}

/**
 * LE JETON DE MILLÉSIME, LU DANS LA SOURCE ET PAS IMPORTÉ.
 *
 * ⛔ ET C'EST UNE MESURE, PAS UNE PRÉFÉRENCE. `HOUSEHOLD_PROMPT_VERSION` vit
 * dans `household_meal_generation.ts`, qui importe `@supabase/supabase-js`:
 * une garde qui l'importe meurt dans un arbre extrait de `git archive` avec
 * « Could not find a matching package for 'npm:@supabase/realtime-js' »
 * (vérifié le 2026-08-23 sur le commit de ce lot). C'est très exactement la
 * règle §⑨ n° 92 — neuf gardes de cette campagne ont livré une garde que
 * personne d'autre ne peut rejouer. Ici on lit un fichier, on n'ouvre pas un
 * graphe de modules.
 *
 * ⚠️ AUCUNE HEURISTIQUE, ET LE FLOU EST INTERDIT. On exige la forme littérale
 * que le dépôt écrit, en DÉBUT DE LIGNE, et on JETTE si on n'en trouve pas
 * exactement une: zéro veut dire que la constante a été renommée ou supprimée,
 * deux veut dire qu'on ne sait pas laquelle est servie. Les deux sont des
 * états où la garde ne doit pas rendre un verdict, elle doit faire du bruit
 * (§⑨ — « une garde qui s'abstient en silence est une garde désarmée »).
 */
export function readHouseholdPromptVersion(source: string): string {
  const found = [...String(source ?? "").matchAll(
    /^export const HOUSEHOLD_PROMPT_VERSION = "([^"]+)";$/gm,
  )];
  if (found.length !== 1) {
    throw new Error(
      `readHouseholdPromptVersion: ${found.length} déclaration(s) trouvée(s), 1 attendue. ` +
        `La constante a été renommée, supprimée, ou dédoublée — dans les trois cas la ` +
        `garde ne peut plus dire quel texte a été servi à quelle population.`,
    );
  }
  return found[0][1];
}

/**
 * Ce qu'on sait de l'accord entre le jeton de millésime et le texte servi.
 *
 * ⛔ `unknown_version` EST ROUGE, PAS VERT. Bumper sans inscrire l'empreinte
 * rend le jeton aussi muet qu'avant: on saurait qu'un texte a changé, jamais
 * lequel a été servi. Le geste complet est « bump ET inscris ».
 */
export type PrecedenceBindingVerdict =
  | { verdict: "ok"; version: string; digest: string }
  | { verdict: "unknown_version"; version: string; digest: string }
  | { verdict: "text_moved_without_bump"; version: string; recorded: string; found: string };

/**
 * LE VERDICT. Fonction PURE: la table est un paramètre, pour que le test
 * puisse l'exercer sur des cas qui ne sont pas l'état du dépôt (§⑨ n° 105 —
 * une garde paramétrée par sa seule constante reste verte quand on la change).
 */
export function precedenceBindingVerdict(
  version: string,
  digest: string,
  table: Readonly<Record<string, string>> = HOUSEHOLD_ARBITRATION_BY_VERSION,
): PrecedenceBindingVerdict {
  const recorded = table[version];
  if (recorded === undefined) return { verdict: "unknown_version", version, digest };
  if (recorded !== digest) return { verdict: "text_moved_without_bump", version, recorded, found: digest };
  return { verdict: "ok", version, digest };
}
