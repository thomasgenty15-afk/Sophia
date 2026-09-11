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

/**
 * ⟳ 2026-09-08 — L'EFFORT DE LA COMPOSITION DU FOYER, SÉPARÉ DE CELUI DES RELANCES.
 *
 * ⛔ MESURÉ LE SOIR MÊME, foyer `quatre`, même fixture, même prompt (cartes avec
 * la densité nominative), série `medium` puis série `high` :
 *
 *     medium   91 · 75 · 91 · 83 · 66 %   — réparation demandée à chaque tir
 *     high    100 · 100 %                 — AUCUNE réparation demandée
 *
 * Deux tirs `high` sur quatre ont été tués par un rechargement externe du
 * runtime ; les deux survivants sont à 12 assiettes sur 12, plan juste du
 * premier coup, 6 plats composés et 6 mesurés, aucun coupé. Le défaut de
 * structure que la mesure d'août reprochait à `high` (plats en surnombre,
 * casseroles sans boîte) ne s'est pas reproduit sur ce prompt-ci.
 *
 * ⚠️ DEUX TIRS NE FONT PAS UNE DISTRIBUTION. C'est un signal fort, pas une
 * preuve : à vérifier sur une série de quatre ou cinq dans une fenêtre où rien
 * n'écrit sous `_shared/`. La réserve est écrite ici pour qu'on ne la perde pas.
 *
 * ⛔ LES RELANCES RESTENT À `medium`. Elles relisent un plan déjà composé pour y
 * changer un plat ; le compromis entre personnes est déjà tranché, et c'est lui
 * que `high` sert. Les passer à `high` triplerait leur coût sans objet mesuré.
 *
 * ⛔ CE QUE ÇA COÛTE : 244 à 281 s par composition au lieu de 66 à 108. Mais
 * à `medium` presque chaque tir enchaîne une relance de 36 à 96 s, que `high`
 * n'a pas eu à faire. Le surcoût net est plus proche du double que du triple.
 * D'où `PLAN_COMPOSITION_HTTP_TIMEOUT_MS` juste en dessous : 300 s laissait
 * vingt secondes de marge à un appel de 281.
 */
export const PLAN_COMPOSITION_REASONING_EFFORT = "high" as const;

/**
 * LE TIMEOUT DE LA COMPOSITION DU FOYER, DÉSORMAIS À `high`.
 *
 * Le worker edge coupe à 400 s et Kong à 600 (voir `PLAN_HTTP_TIMEOUT_MS`) :
 * 380 s garde vingt secondes sous la coupure du worker. Les relances gardent
 * `PLAN_HTTP_TIMEOUT_MS`, comme elles gardent `medium`.
 */
export const PLAN_COMPOSITION_HTTP_TIMEOUT_MS = 380_000;

export function keelGenerationModel(): string {
  const override = (safeEnvGet("KEEL_GENERATION_MODEL") ?? "").trim();
  return override || KEEL_GENERATION_MODEL_DEFAULT;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-10 — LE PALIER DE SERVICE DES DEUX LANES DE PLAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `fast` est le « Fast mode » du fournisseur. La réponse renvoie `priority`,
 * qu'on ait demandé `fast` ou `priority` — c'est normal, et le journal
 * distingue `service_tier_sent` de `service_tier_echoed` pour ne pas le lire
 * comme une dégradation.
 *
 * ⛔ CE N'EST PAS UN IDENTIFIANT DE MODÈLE. « high fast » n'existe pas: le
 * modèle reste `gpt-5.6-luna`, l'effort reste `medium`/`high`, et le palier est
 * un TROISIÈME axe, transmis par `meta.serviceTier`.
 *
 * ⚠️ CE QU'IL NE RÉPARE PAS, ET IL FAUT LE DIRE AVANT LE BANC: un `546` du
 * worker edge est un dépassement de CPU, de mémoire ou de mur. Fast raccourcit
 * l'ATTENTE du modèle; il ne réduit ni le CPU dépensé à parser, ni la mémoire
 * tenue. Un banc qui verdit après Fast n'a pas prouvé que la cause était la
 * latence — il faut lire le motif de shutdown.
 */
export const PLAN_SERVICE_TIER = "fast" as const;

/**
 * ⟳ 2026-09-10 — L'EFFORT DES RATTRAPAGES PASSE À `high`, PAR DÉCISION.
 *
 * ⛔ C'EST L'INVERSE DE CE QUE `PLAN_COMPOSITION_REASONING_EFFORT` a mesuré
 * au-dessus, et la mesure n'est pas effacée: le 2026-09-08, les relances
 * relisaient un plan déjà tranché, et `high` y triplait le coût sans objet.
 *
 * Ce qui a changé, et qui justifie de rouvrir: les relances ne sont plus
 * indépendantes. Elles partagent un budget de DEUX (`PLAN_MODEL_REPAIR_BUDGET`)
 * là où le pire cas en portait dix, et chacune doit donc atterrir du premier
 * coup — un rattrapage qui rate n'a plus de suivant. Le surcoût unitaire de
 * `high` se paie sur au plus deux appels au lieu de dix, et `fast` en reprend
 * une partie sur l'attente.
 *
 * ⚠️ À REMESURER: si le banc montre que les rattrapages atterrissent aussi bien
 * à `medium`, cette ligne redescend. Elle est écrite comme un arbitrage, pas
 * comme une mesure.
 */
export const PLAN_REPAIR_REASONING_EFFORT = "high" as const;

/**
 * ⛔ LE REPLI DE MODÈLE EXISTE, ET IL POINTAIT SUR LE MODÈLE MESURÉ DANGEREUX.
 *
 * L'en-tête de ce fichier affirme qu'un modèle OpenAI choisi par l'appelant n'a
 * « pas de repli ». C'est vrai de `pickModelForAttempt` et **faux** de
 * `pickFallbackChainForAttempt` (`_shared/gemini.ts:869`): pour `gpt-5.6-luna`,
 * aucune branche anticipée ne mord, et la fin de fonction pousse
 * `PRIMARY_AI_MODEL` puis `OPENAI_LIGHT_FALLBACK_MODEL`. La chaîne réelle était
 * donc:
 *
 *     ["gpt-5.6-luna", "gpt-5.4-mini", "gpt-5.4-nano"]
 *
 * Le repli n° 2 est très exactement le modèle que le banc du 2026-08-11 accuse
 * de servir des aliments interdits — `Greek yogurt` à un intolérant au lactose
 * 3 fois sur 3 — et il partait SANS QUE RIEN NE LE DISE, sur un chemin où le
 * coût se paie en assiettes.
 *
 * On ne coupe pas le repli (une génération qui échoue en dur sur un 429 est
 * pire), on le REMPLACE par le repli propre mesuré. `secondFallbackModel` et
 * `thirdFallbackModel` occupent les deux emplacements que `gemini.ts` remplirait
 * sinon lui-même; `push` déduplique, donc la chaîne devient:
 *
 *     ["gpt-5.6-luna", "gpt-5.6-sol"]
 *
 * Détail de la mesure: scratchpad/RAPPORT-BANC-MODELES.md §4.1
 */
export const KEEL_GENERATION_FALLBACK_MODEL_DEFAULT = "gpt-5.6-sol";

export function keelGenerationFallbackModel(): string {
  const override = (safeEnvGet("KEEL_GENERATION_FALLBACK_MODEL") ?? "").trim();
  return override || KEEL_GENERATION_FALLBACK_MODEL_DEFAULT;
}

/**
 * ⛔ LES TENTATIVES DU TRANSPORT ÉTAIENT INVISIBLES AU BUDGET.
 *
 * `_shared/gemini.ts:1021` : sans `meta.maxRetries`, le défaut est **10** (la
 * branche à 4 exige `requestId.includes(":tools:")`, ce que les lanes de plan
 * ne font pas — elles passent un UUID nu). Multiplié par la chaîne de replis,
 * la borne haute d'un SEUL `generateWithGemini` était de trente appels HTTP,
 * chacun avec son plein timeout.
 *
 * ⚠️ `maxRetries: 1` ne veut pas dire « un réessai »: c'est **une passe** de la
 * boucle extérieure. La boucle intérieure parcourt encore la chaîne de replis,
 * donc au plus DEUX appels fournisseur par appel logique — luna, puis sol.
 * C'est borné, et c'est ce que le budget peut compter.
 */
export const PLAN_MODEL_MAX_RETRIES = 1;

/**
 * LE BUDGET COMMUN DE RATTRAPAGE — deux, pour tout le plan.
 *
 * ⛔ AVANT, CHAQUE RELANCE AVAIT SON PROPRE COMPTEUR, et personne ne les
 * additionnait: exclusions 1, régime 1, échange 1, séparation 1, non-nourris
 * **3**, densité 1, plat dédié 1 — plus la composition initiale. Pire cas
 * mesuré sur la lane du foyer: **dix appels modèle** dans une requête dont
 * aucun ne connaissait le temps déjà dépensé par les autres.
 *
 * Désormais un seul compteur, consommé par toute recomposition demandée au
 * modèle APRÈS la composition initiale. Quand il est vide, les contrôles
 * déterministes tournent quand même — c'est eux qui décident, pas le budget:
 * `applyHouseRuleLock` rend toujours 422 sur une règle de maison violée, et
 * `clampToBounds` rabote toujours en écrivant `unmet_kcal`.
 */
export const PLAN_MODEL_REPAIR_BUDGET = 2;

/**
 * L'ÉCHÉANCE DE LA REQUÊTE, ET LA QUEUE QU'ON LUI RÉSERVE.
 *
 * ⚠️ DEUX COMMENTAIRES DU DÉPÔT SE CONTREDISENT SUR KONG:
 * `generation_model.ts` (ci-dessus) dit 600 s, patché;
 * `generate-household-meal-v1/index.ts:1178` dit « celle que Kong coupe à 150 s
 * en hébergé ». Les deux ne peuvent pas décrire le même environnement. En local
 * le patch est un script (`scripts/local_extend_kong_functions_timeout.sh`,
 * 150 000 → 600 000 ms) **perdu à chaque recréation du conteneur**. Le seul
 * plafond qu'on peut tenir pour vrai partout est celui du worker edge: 400 s.
 *
 * 380 s laisse vingt secondes sous cette coupure. Les trente dernières secondes
 * sont réservées à ce qui vient APRÈS le dernier appel modèle: la mesure
 * finale, les ceintures, le verrou de maison, l'écriture. Un plan mesuré et non
 * écrit ne vaut rien, et c'est ce bout-là qui saute quand on laisse le modèle
 * manger tout le mur.
 */
export const PLAN_REQUEST_BUDGET_MS = 380_000;
export const PLAN_TAIL_RESERVE_MS = 30_000;

/**
 * LE TEMPS MINIMUM POUR OSER LANCER UN RATTRAPAGE.
 *
 * ⛔ UN APPEL LANCÉ TROP TARD EST PIRE QU'UN APPEL NON LANCÉ: il fait générer
 * une réponse ENTIÈRE, facturée, que personne ne lit — et `timeout_or_abort`
 * n'enregistre aucun jeton, donc le compteur de coût ne voit même pas ce qu'il
 * a coûté. Nuit du 2026-08-19: 987 appels lancés, 101 aboutis, **137 abandons**.
 *
 * 40 s: la borne basse de ce qu'un rattrapage a mesuré (36 à 96 s le
 * 2026-09-08, à `medium`). En dessous, on sait déjà qu'il ne reviendra pas.
 *
 * ⚠️ CE N'EST PAS UNE PROMESSE QU'IL REVIENDRA. C'est un refus de partir quand
 * on sait qu'il ne peut pas — le budget écrit alors `time_budget_exhausted`, et
 * la dernière version utilisable part telle quelle.
 */
export const PLAN_REPAIR_MIN_MS = 40_000;
