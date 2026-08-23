/**
 * KEEL — LE MODÈLE QUI COMPOSE, distinct de celui qui converse.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 * Jusqu'ici, composer une semaine entière de repas — doctrine, contraintes
 * dures, absences, rythme, plafonds, liste de courses, le tout en JSON
 * structuré — se faisait sur `GLOBAL_AI_MODEL`, dont le défaut est
 * `gpt-5.4-mini` (`_shared/gemini.ts`). Le même modèle que pour répondre
 * « ok, noté » dans un chat.
 *
 * Ce n'est pas la même tâche. Une génération de plan tient une trentaine de
 * contraintes SIMULTANÉES dont beaucoup sont NÉGATIVES (« rien mardi midi »,
 * « jamais cet aliment »), et une contrainte négative est précisément ce qu'un
 * modèle de composition a le plus tendance à compléter — c'est son métier de
 * remplir. C'est le seul endroit du produit où la capacité du modèle se paie
 * en assiettes fausses plutôt qu'en tournure maladroite.
 *
 * ── LA SOUPAPE, ET POURQUOI ELLE N'EST PAS DU CONFORT ──────────────────────
 * `gemini.ts` a une chaîne de repli — mais elle NE S'APPLIQUE PAS à un modèle
 * OpenAI choisi par l'appelant: `pickModelForAttempt` finit par
 * « Otherwise keep caller-selected model ». Autrement dit, si l'identifiant
 * ci-dessous n'existe pas côté fournisseur, chaque tentative retape le même
 * identifiant mort et TOUTE génération échoue — sans repli, silencieusement,
 * pour tous les élèves.
 *
 * D'où la variable d'environnement: elle permet de revenir en arrière **sans
 * redéploiement**. C'est le seul geste de retour arrière qui ne demande pas de
 * toucher au code, et sur un chemin sans repli c'est exactement ce qu'il faut.
 *
 * ⚠️ MAIS PAS VERS `gpt-5.4-mini`, ET C'EST MESURÉ.
 * Banc du 2026-08-11 (180 générations, 5 modèles): sur les cinq candidats,
 * `gpt-5.4-mini` est le SEUL à servir des aliments interdits — `Greek yogurt`
 * à un intolérant au lactose 3 fois sur 3, `roast chicken thighs` et
 * `beef strips` à un végétarien, `soy sauce` à un foyer sans gluten. Ce sont
 * des lignes de liste de courses. Le repli propre mesuré est `gpt-5.6-sol`.
 * Détail: scratchpad/RAPPORT-BANC-MODELES.md §4.1
 *
 * ── LE DÉFAUT EST `gpt-5.6-luna` DEPUIS LE 2026-08-19 ─────────────────────
 * Décision du propriétaire, en connaissance de la mesure: `luna` n'a PAS été
 * éprouvé par le banc (il n'en faisait pas partie) et il est facturé au même
 * tarif que `sol` d'après la table de tarifs — la bascule n'achète donc aucune
 * économie au jeton, seulement l'espoir qu'il produise moins. L'identifiant a
 * été vérifié présent chez le fournisseur (404 sur un nom mort, 429 sur
 * `luna`). Le candidat MESURÉ le moins cher à qualité supérieure était
 * `gpt-5.6-terra` (−27 %, plus de plats, moitié moins d'issues).
 *
 * ── CE QUE CE MODULE NE FAIT PAS ───────────────────────────────────────────
 * Il ne touche PAS `GLOBAL_AI_MODEL`. Le chat, le memorizer, les flows et tout
 * le reste gardent leur modèle. Changer le défaut global aurait déplacé le
 * coût et la latence de toutes les surfaces pour un besoin qui n'existe que
 * sur trois fonctions de génération.
 */

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

/**
 * Le modèle des fonctions de génération, quand rien ne le surcharge.
 *
 * ⚠️ VÉRIFIE CET IDENTIFIANT CHEZ LE FOURNISSEUR avant de déployer. Voir la
 * note sur l'absence de repli en tête de fichier: un identifiant invalide ici
 * ne dégrade pas le produit, il l'arrête.
 */
export const KEEL_GENERATION_MODEL_DEFAULT = "gpt-5.6-luna";

/**
 * Le modèle à passer dans `meta.model` d'un appel `generateWithGemini` fait
 * par une fonction de COMPOSITION (repas, semaine, foyer).
 *
 * Lu à chaque appel, jamais mis en cache dans un module: une variable
 * d'environnement changée doit prendre effet au prochain appel, pas au
 * prochain démarrage d'isolat — c'est ce qui fait d'elle un retour arrière.
 */
/**
 * LE TEMPS QU'UNE COMPOSITION A LE DROIT DE PRENDRE.
 *
 * ⛔ LE PLAFOND ÉTAIT LE NÔTRE, ET IL A COÛTÉ CHER. `generateWithGemini` choisit
 * son timeout par une échelle de branches: la plus généreuse (240 s) est
 * déverrouillée par `requestId.includes(":tools:")` (`_shared/gemini.ts:336`) —
 * une CONVENTION DE NOMMAGE, pas la nature du travail. Les lanes de plan
 * passent un UUID nu, elles tombaient donc sur le défaut de **110 s**; et en
 * repli sur `gemini-3-flash-preview`, sur **60 s**, plus serré encore.
 *
 * Mesuré le 2026-08-19: le banc donne `gpt-5.6-sol` à **164 s de médiane** sur
 * un plan lourd — au-dessus du plafond, donc structurellement incapable
 * d'aboutir. Sur une nuit: **987 appels lancés, 101 aboutis, 137 abandons**. Un
 * appel abandonné a fait générer une réponse ENTIÈRE, facturée, jamais lue —
 * et `timeout_or_abort` n'enregistre aucun jeton, donc le compteur ne comptait
 * pas ce qui coûtait.
 *
 * ⚠️ CE N'ÉTAIT PAS UNE LIMITE D'INFRASTRUCTURE. Vérifié le même jour: le
 * worker edge coupe à **400 s** (`SUPABASE_INTERNAL_WALLCLOCK_LIMIT_SEC` non
 * posée ⇒ défaut de 400 s dans le service principal) et Kong est patché à
 * 600 s. Il y avait de la marge depuis le début; personne n'était allé
 * chercher la ligne.
 *
 * 150 s: au-dessus de la médiane mesurée de `sol` (164 s ne rentre pas, mais ce
 * modèle n'est plus le défaut) et 2,8× la latence mesurée de `gpt-5.6-luna`
 * (50–56 s sur une fenêtre d'un jour). Déclaré ICI plutôt que par une variable
 * d'environnement globale, qui déplacerait aussi la latence du chat.
 */
export const PLAN_HTTP_TIMEOUT_MS = 300_000;

/**
 * L'EFFORT DE RAISONNEMENT DES DEUX LANES DE PLAN — mesuré, pas supposé.
 *
 * `gpt-5.6-luna` réfléchit DÉJÀ beaucoup au défaut du fournisseur: 2 338 à
 * 3 266 jetons de raisonnement pour ~7 400 jetons de sortie, soit ~40 %
 * (3 runs, fenêtre 1 jour, 2026-08-19). Le défaut n'est donc pas `minimal`.
 *
 * ── POURQUOI `medium` ET PAS `high`, ET C'EST CONTRE-INTUITIF ──────────────
 * Mesuré sur la MÊME fenêtre de 7 jours, le même foyer, seul l'effort changeant:
 *
 *   effort   durée    plats  dédiés   issues   surplus jeté   prép. sans boîte
 *   medium    68 s      28   14/25       7       ~2 plats            0
 *   high     211 s      28   14/25      14       10 plats            2
 *
 * `high` ne compose pas mieux — il compose PLUS, et le plafond de 28 plats
 * jette le surplus: 38 plats générés, facturés, dont 10 supprimés. Il laisse en
 * prime deux préparations sans boîte, une erreur structurelle que `medium` ne
 * fait pas. Pour 143 secondes de plus.
 *
 * ⚠️ RÉSERVE ÉCRITE: un run par effort. Les issues varient d'un tirage à
 * l'autre, et `high` a produit le seul plan MIXTE des deux (viande pour les
 * omnivores, pas pour la végane) — ce qui peut être une meilleure prise en
 * compte de la divergence, ou un tirage. Rejouer 2 runs par effort trancherait;
 * ⛔ pas un banc de 180 générations, la leçon du 2026-08-19 étant qu'une
 * campagne massive coûte plus que ce qu'elle apprend.
 *
 * `high` et `xhigh` sont identiques: `_shared/gemini.ts:461` replie le second
 * sur le premier.
 */
export const PLAN_REASONING_EFFORT = "medium" as const;

export function keelGenerationModel(): string {
  const override = (safeEnvGet("KEEL_GENERATION_MODEL") ?? "").trim();
  return override || KEEL_GENERATION_MODEL_DEFAULT;
}
