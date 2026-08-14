/**
 * DE LA MÉMOIRE À LA COMPOSITION — promouvoir ce que l'élève a dit sur sa
 * bouffe en quelque chose que le générateur de plan lit.
 *
 * ---------------------------------------------------------------------------
 * LA BOUCLE OUVERTE QUE ÇA FERME
 * ---------------------------------------------------------------------------
 * L'élève écrit « je déteste le brocoli » dans la conversation. Le memorizer
 * l'extrait — mesuré le 2026-08-03 sur un vrai élève KEEL de 18 messages, il a
 * sorti seul l'aversion, deux contextes de vie, et a même résolu une
 * rétractation. Le rappel de conversation le ressort au bon moment.
 *
 * Et `generate-week-plan-v1` / `generate-meal-v1` n'en savent RIEN: vérifié par
 * grep, ni `memory_items` ni `memory_v2` ni `recall` n'apparaissent dans les
 * deux fonctions ni dans leurs constructeurs de prompt. Le plan composé trois
 * jours plus tard remet du brocoli.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI UNE PROMOTION, ET PAS UNE LECTURE DIRECTE
 * ---------------------------------------------------------------------------
 * Brancher `memory_items` sur le générateur aurait été plus court. C'est
 * exactement le motif que l'architecture s'interdit: `memory_items` est un
 * MAGASIN PROBABILISTE (confiance, ranking, statut `candidate`). Ce dépôt a la
 * cicatrice — avant le lot de correction, la seule trace qu'une allergie
 * laissait était un `memory_item` `candidate`, « le magasin probabiliste que
 * l'architecture interdit précisément pour ça »
 * (`safety-constraints-armed-belt-empty-vault`).
 *
 * La promotion passe donc par un écran: l'élève CONFIRME, et une inférence
 * devient un fait déclaré. C'est aussi ce qui rend la chose éditable et
 * évitable, ce qui est la moitié de la demande.
 *
 * ---------------------------------------------------------------------------
 * LA DESTINATION EXISTE DÉJÀ, ET C'EST CE QUI REND LE PONT COURT
 * ---------------------------------------------------------------------------
 * `student_goals.practical_constraints` est un jsonb LU PAR LES DEUX
 * générateurs, et `week_plan_generation.ts` le sérialise en entier dans le
 * prompt. Écrire une clé de plus suffit à ce que les deux la voient — aucun
 * câblage supplémentaire.
 *
 * COROLLAIRE, et c'est pour ça que les propositions ne sont PAS persistées:
 * tout ce qui entre dans ce jsonb part dans le prompt. Une proposition rangée
 * là serait servie au générateur comme un fait acquis avant que l'élève ne
 * l'ait vue. Les propositions se calculent donc à la volée; seul ce qui est
 * GARDÉ s'écrit.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

/** Une ligne de `memory_items`, réduite à ce que la promotion regarde. */
export interface MemoryItemForPromotion {
  id: string;
  kind: string;
  status: string;
  content_text: string;
  normalized_summary?: string | null;
  domain_keys?: readonly string[] | null;
  confidence?: number | null;
  sensitivity_level?: string | null;
  /**
   * Rempli par le memorizer quand l'élève REVIENT sur ce qu'il a dit
   * (`operation_type="supersede"`). C'est la seule trace qui relie l'ancienne
   * vérité à la nouvelle, et c'est elle qui rend la réconciliation possible.
   */
  superseded_by_item_id?: string | null;
  /** QUAND l'élève l'a dit. Voir `foodPreferencesForPrompt`. */
  created_at?: string | null;
}

/** Ce que l'écran propose à l'élève de garder. */
export interface FoodPreferenceProposal {
  /** L'id de l'item source — c'est lui qu'on retient si l'élève écarte. */
  memoryItemId: string;
  /** Le texte proposé, éditable avant d'être gardé. */
  text: string;
  /**
   * Le texte GARDÉ que celui-ci remplace, quand la mémoire a enregistré un
   * revirement. L'écran doit le dire (« remplace: … ») plutôt que d'empiler
   * une deuxième ligne qui contredit la première.
   */
  replaces?: string;
  /** `YYYY-MM-DD` du jour où l'élève l'a dit. Voir `foodPreferencesForPrompt`. */
  seenAt?: string;
}

/** `YYYY-MM-DD`, ou `null` si la date est absente ou illisible. */
function dayOf(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * LA CLÉ ALIMENTAIRE de la taxonomie (`memory/domain_keys.v1.json`).
 *
 * Reste exportée sous son nom d'origine: c'est la clé PRINCIPALE, celle que
 * porte l'écrasante majorité des souvenirs promouvables, et plusieurs lecteurs
 * la nomment.
 */
export const FOOD_DOMAIN_KEY = "sante.alimentation";

/**
 * LES CLÉS QUI RENDENT UN SOUVENIR PROMOUVABLE — et pourquoi il y en a plus
 * qu'une depuis le 2026-08-06.
 *
 * ── LE TROU MESURÉ ────────────────────────────────────────────────────────
 * Ce module ne regardait que `sante.alimentation`, avec pour raison écrite:
 * « pas une liste élargie au cas où — `habitudes.execution` ou `sante.energie`
 * remonteraient des souvenirs vrais mais hors sujet ». L'argument est bon et il
 * tient toujours pour CES clés-là. Il ne tenait pas pour les contraintes de
 * VIE, et la mesure le dit sans ambiguïté (corpus local, 92 souvenirs):
 *
 *   « Travaille de nuit trois fois par semaine. »           {travail.charge, sante.sommeil}
 *   « Shares kitchen with 4 flatmates; batch cooks Sundays » {habitudes.environnement,
 *                                                             habitudes.planification}
 *
 * Aucune des deux ne porte `sante.alimentation`. Toutes les deux décident de ce
 * qu'on peut raisonnablement proposer à manger. Elles étaient invisibles à la
 * carte, donc absentes de `practical_constraints`, donc absentes du prompt des
 * deux générateurs — qui composaient des dîners à cuisiner pour quelqu'un qui
 * part travailler le soir. C'est le trou que
 * [[memorizer-to-generator-only-food-preferences]] nomme.
 *
 * ── POURQUOI CES QUATRE-LÀ, ET PAS UNE DE PLUS ────────────────────────────
 * Le critère n'est pas « ça parle de nourriture » mais **« ça décide QUAND, OÙ
 * ou COMBIEN cet élève peut cuisiner et manger »**:
 *   · `travail.charge`          — postes de nuit, semaine de rush: les fenêtres de repas;
 *   · `habitudes.environnement` — cuisine partagée, pas de four, télétravail: le lieu;
 *   · `habitudes.planification` — batch cooking le dimanche, jour de courses: le rythme;
 *   · `sante.activite_physique` — jours d'entraînement: le placement des repas.
 *
 * EXCLUS, et chacun pour sa raison: `psychologie.*` (un ressenti n'est pas une
 * contrainte, et la carte deviendrait un journal intime), `relations.*` (bruit,
 * et « ma sœur est allergique » est un piège dont la vraie place est
 * `student_safety_constraints`), `sante.medical` (le dur ne passe JAMAIS par une
 * carte souple), `sante.sommeil` / `sante.energie` (ce sont des RÉSULTATS, ceux
 * que le bilan hebdomadaire mesure, pas des contraintes), `addictions.*`
 * (clinique), `objectifs.*` (c'est `student_goals.goal`), `habitudes.execution`
 * et ses voisines (du comportement, pas de la cuisine).
 *
 * ── CE QUE L'ÉLARGISSEMENT NE CHANGE PAS ──────────────────────────────────
 * Tout le reste: le plancher de confiance, la ligne médicale, les `kind`
 * promouvables, `proposer n'est pas garder`, l'origine, la réconciliation, la
 * vue datée. Une clé de plus ouvre la porte; elle ne desserre aucune garde.
 *
 * ── LA MESURE DE BRUIT, faite AVANT d'écrire ce code ──────────────────────
 * Sur le corpus local, ces quatre clés font passer TROIS souvenirs de plus, et
 * les trois sont des blocages réels. Zéro faux positif. C'est ce chiffre-là qui
 * a fait préférer l'élargissement d'une liste à la création d'une seconde: deux
 * listes parallèles auraient dupliqué l'origine, le `dismissed`, la
 * réconciliation et la vue datée — quatre mécanismes qui divergeraient.
 */
export const PROMOTABLE_DOMAIN_KEYS: readonly string[] = [
  FOOD_DOMAIN_KEY,
  "travail.charge",
  "habitudes.environnement",
  "habitudes.planification",
  "sante.activite_physique",
];

/**
 * Sous ce seuil, le memorizer lui-même n'est pas sûr. Il refuse déjà de créer
 * un item sous 0,55; on demande davantage pour proposer quelque chose qui ira
 * gouverner une semaine de repas.
 */
const MIN_CONFIDENCE = 0.7;

/**
 * LES STATUTS QU'ON REFUSE, chacun pour une raison différente:
 *   `hidden_by_user` /
 *   `deleted_by_user`  — l'élève a déjà dit non. Le reproposer serait insister.
 *   `superseded` /
 *   `invalidated` /
 *   `archived`         — remplacé ou périmé; ce n'est plus ce qu'il pense.
 *
 * ── POURQUOI `candidate` EST ACCEPTÉ, ET CE QUE ÇA A COÛTÉ DE LE REFUSER ───
 * Ce module refusait `candidate` au motif que « le système de mémoire lui-même
 * ne l'a pas retenu ». Mesuré le 2026-08-06 sur un run réel de trois semaines
 * (`docs/nutrition-pivot/qa-web/N1_food_memory_over_time.ts`), ce motif est
 * FAUX pour le premier jour d'un élève:
 *
 *   « Theo déteste le brocoli. »   confidence 0.95   status candidate
 *
 * `candidate` ne dit pas ici « on doute du contenu » — il dit « le lien vers
 * le sujet est faible » (`link_conf 0.62`), parce que le SUJET vient d'être
 * créé dans le même lot. Les mêmes phrases, dites trois jours plus tard,
 * sortent `active` avec `link_conf 0.88`. Autrement dit: **tout ce qu'un
 * élève neuf dit sur sa bouffe le premier jour était invisible à la carte**,
 * donc absent de la toute première semaine composée — la seule sur laquelle il
 * juge le produit. Et le cron d'entretien ARCHIVE ces items à J+14 faute de
 * réaffirmation: la préférence ne devenait jamais proposable, elle mourait.
 *
 * Ce qui garde la ligne au bon endroit, ce n'est pas le statut, ce sont les
 * deux filtres qui restent: la confiance PROPRE de l'item (`MIN_CONFIDENCE`,
 * plus exigeante que le plancher du memorizer) et la ligne médicale
 * (`sensitivity_level`). Et surtout: proposer n'est pas garder. L'élève
 * confirme — c'est exactement le signal `explicit_confirmation` que
 * `decideCandidatePromotion` traite déjà comme suffisant pour promouvoir.
 */
const PROMOTABLE_STATUSES: readonly string[] = ["active", "candidate"];

/**
 * Les statuts qui RETIRENT une préférence déjà gardée. C'est la moitié
 * manquante du cycle de vie: sans elle, un texte gardé est détaché de son
 * souvenir pour toujours, et une rétractation enregistrée par le memorizer
 * n'atteint jamais le plan.
 */
const RETIRED_STATUSES: readonly string[] = [
  "superseded",
  "invalidated",
  "archived",
  "hidden_by_user",
  "deleted_by_user",
];

/**
 * LES `kind` PROMOUVABLES.
 *
 * `event` est exclu, et c'est le filtre le plus important de la liste: « j'ai
 * mangé une pizza mardi » est un fait daté, pas une préférence permanente. Le
 * promouvoir en contrainte de composition mettrait une pizza dans toutes les
 * semaines à venir.
 *
 * `action_observation` est exclu aussi: il décrit l'exécution d'une action du
 * plan, pas un goût.
 */
const PROMOTABLE_KINDS: readonly string[] = ["fact", "statement"];

/**
 * Les propositions à montrer, dans l'ordre où le memorizer les a rendues.
 *
 * @param kept les textes DÉJÀ gardés — on ne repropose pas ce qui est écrit.
 * @param dismissed les ids d'items DÉJÀ écartés — on ne réinsiste jamais.
 */
export function proposeFoodPreferences(args: {
  items: readonly MemoryItemForPromotion[];
  kept?: readonly string[];
  dismissed?: readonly string[];
  /**
   * La table d'origines telle qu'elle est en base — les deux formes sont
   * acceptées, voir `originMapOf`. Sert à annoncer un remplacement plutôt
   * qu'un ajout.
   */
  origin?: Record<string, unknown>;
}): FoodPreferenceProposal[] {
  const dismissed = new Set(
    (args.dismissed ?? []).map((d) => String(d ?? "").trim()).filter(Boolean),
  );
  // `texte normalisé → texte gardé tel qu'il s'affiche`. Le remplacement doit
  // NOMMER la ligne dans sa forme d'origine, pas dans sa forme de clé.
  const keptByKey = new Map<string, string>();
  for (const raw of args.kept ?? []) {
    const text = String(raw ?? "").trim();
    if (text) keptByKey.set(text.toLowerCase(), text);
  }
  const keptNormalized = new Set(keptByKey.keys());
  // `id de l'item remplacé → texte gardé`: quand une proposition succède à un
  // souvenir dont le texte est encore dans le plan, on le NOMME.
  const keptByOriginId = new Map<string, string>();
  for (
    const [key, entry] of Object.entries(
      originMapOf({ [FOOD_PREFERENCES_ORIGIN_KEY]: args.origin ?? {} }),
    )
  ) {
    const original = keptByKey.get(key);
    if (original) keptByOriginId.set(entry.item, original);
  }
  // `id du remplaçant → texte gardé qu'il remplace`, reconstruit depuis les
  // items retirés eux-mêmes: c'est `superseded_by_item_id` qui porte le lien,
  // et il est sur l'ANCIEN item, pas sur le nouveau.
  const replacesByNewId = new Map<string, string>();
  for (const item of args.items) {
    const replacement = String(item?.superseded_by_item_id ?? "").trim();
    if (!replacement) continue;
    const replacedText = keptByOriginId.get(String(item?.id ?? "").trim());
    if (replacedText) replacesByNewId.set(replacement, replacedText);
  }

  const out: FoodPreferenceProposal[] = [];
  const seen = new Set<string>();

  for (const item of args.items) {
    const id = String(item?.id ?? "").trim();
    if (!id || dismissed.has(id)) continue;

    if (!PROMOTABLE_STATUSES.includes(String(item.status ?? ""))) continue;
    if (!PROMOTABLE_KINDS.includes(String(item.kind ?? ""))) continue;

    // ── LA LIGNE MÉDICALE, ET ELLE NE BOUGE PAS ────────────────────────────
    // `sensitive` et `safety` ne montent JAMAIS dans une carte souple et
    // éditable. Le dur a sa table — `student_safety_constraints`, synchrone,
    // sans cache, sans ranking — et une allergie qui arriverait ici serait
    // exactement la confusion des deux couches que le pivot a tranchée.
    if (String(item.sensitivity_level ?? "normal") !== "normal") continue;

    // AU MOINS UNE des clés promouvables. `some` et pas `includes` d'une clé
    // unique: voir `PROMOTABLE_DOMAIN_KEYS` pour le trou que ça ferme et pour
    // la raison de chacune des quatre.
    const keys = (item.domain_keys ?? []).map((k) => String(k ?? "").trim());
    if (!keys.some((k) => PROMOTABLE_DOMAIN_KEYS.includes(k))) continue;

    const confidence = Number(item.confidence ?? 0);
    if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) continue;

    // Le résumé normalisé quand il existe: c'est la forme courte, celle qui
    // tient sur une ligne d'écran. Le texte brut sinon.
    const text = String(item.normalized_summary ?? "").trim() ||
      String(item.content_text ?? "").trim();
    if (!text) continue;

    const key = text.toLowerCase();
    if (keptNormalized.has(key) || seen.has(key)) continue;
    seen.add(key);

    const proposal: FoodPreferenceProposal = { memoryItemId: id, text };
    const replaces = replacesByNewId.get(id);
    if (replaces) proposal.replaces = replaces;
    const seenAt = dayOf(item.created_at);
    if (seenAt) proposal.seenAt = seenAt;
    out.push(proposal);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Ce qui s'écrit dans `practical_constraints`
// ---------------------------------------------------------------------------

/** La clé lue par les deux générateurs, via la sérialisation du jsonb. */
export const FOOD_PREFERENCES_KEY = "food_preferences";
/** Les ids écartés. Jamais servi au modèle — voir `constraintsForPrompt`. */
export const FOOD_PREFERENCES_DISMISSED_KEY = "food_preferences_dismissed";
/**
 * `texte normalisé → id du souvenir dont il vient`. JAMAIS servi au modèle.
 *
 * ── CE QUE SON ABSENCE COÛTAIT, mesuré le 2026-08-06 ──────────────────────
 * Une fois gardé, le texte était une chaîne DÉTACHÉE de son souvenir. Le
 * memorizer pouvait enregistrer proprement le revirement de l'élève — dans le
 * run réel il l'a fait, `superseded` et `superseded_by_item_id` remplis — et
 * `practical_constraints` n'en savait rien. État final de la 3e semaine, servi
 * tel quel au générateur:
 *
 *   ["Aime le brocoli s'il est rôti.", …, "N'aime pas le brocoli."]
 *
 * Les deux, ensemble, dans le même prompt. Une contrainte de composition qui
 * se contredit ne guide plus rien: elle transforme la semaine en tirage au
 * sort, et elle ne se répare jamais toute seule puisque rien ne relie la ligne
 * gardée au souvenir qui l'a démentie.
 *
 * Une entrée SANS origine (tapée à la main, éditée hors reconnaissance, ou
 * écrite avant cette clé) n'est jamais retirée automatiquement: elle
 * appartient à l'élève, pas au memorizer.
 */
export const FOOD_PREFERENCES_ORIGIN_KEY = "food_preferences_origin";

/**
 * Ce qu'une entrée d'origine porte: d'où vient la ligne, et de QUAND.
 *
 * ── POURQUOI `source` EST EXPLICITE ET NE SE DÉDUIT PAS D'UN VIDE ─────────
 * L'absence d'entrée d'origine est DÉJÀ ambiguë: elle dit « tapée à la main »
 * AUTANT que « lien au souvenir perdu » (le cas que la ligne 3 du bloc
 * ci-dessus décrit). S'en servir comme signature du texte écrit rendrait les
 * deux indiscernables pour toujours, et on ne saurait plus dire à l'élève
 * « ça, c'est toi qui l'as écrit » plutôt que « ça, je l'ai déduit de ce que
 * tu m'as dit mardi ».
 *
 * Une ligne écrite porte donc une entrée COMPLÈTE, avec `item: ""` — et c'est
 * ce vide-là qui la protège: `reconcileFoodPreferences` garde toute ligne sans
 * `sourceId`, donc le memorizer ne peut pas retirer ce que l'élève a tapé.
 */
export interface FoodPreferenceOrigin {
  /** L'id du `memory_items` source. **Vide pour une ligne écrite à la main.** */
  item: string;
  /** `YYYY-MM-DD` du jour où l'élève l'a dit, ou `null`. */
  at: string | null;
  /**
   * QUI a produit cette ligne. `memory` = le memorizer l'a proposée et l'élève
   * l'a gardée; `written` = l'élève l'a tapée.
   *
   * Une entrée ancienne (avant cette clé) se lit `memory`: elle ne pouvait
   * venir que de là, puisque rien d'autre n'écrivait d'origine.
   */
  source: "written" | "memory";
}

/**
 * Lit la table d'origines, en acceptant les DEUX formes.
 *
 * La première version de cette clé rangeait l'id nu (`"texte": "uuid"`). Les
 * jsonb déjà écrits le portent encore, et une migration pour six élèves de
 * pilote serait plus risquée que ce `typeof`. Une entrée ancienne se lit donc
 * comme une entrée sans date — ce qui est exactement ce qu'elle est.
 */
function originMapOf(
  constraints: Record<string, unknown> | null | undefined,
): Record<string, FoodPreferenceOrigin> {
  const raw = (constraints ?? {})[FOOD_PREFERENCES_ORIGIN_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, FoodPreferenceOrigin> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(key ?? "").trim().toLowerCase();
    if (!k) continue;
    if (typeof value === "string") {
      const item = value.trim();
      // La forme ancienne ne portait QUE l'id d'un souvenir: rien d'autre
      // n'écrivait cette clé. Elle est donc `memory` par construction.
      if (item) out[k] = { item, at: null, source: "memory" };
      continue;
    }
    if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      const item = String(row.item ?? "").trim();
      const written = String(row.source ?? "").trim().toLowerCase() === "written";
      // ⚠️ `item` VIDE N'EST PLUS UN REJET, à la seule condition que la ligne
      // se déclare écrite. Sans ce `||`, une ligne tapée à la main perdrait son
      // entrée à la lecture et redeviendrait indiscernable d'une ligne dont le
      // lien s'est perdu — c'est-à-dire le défaut que `source` existe pour
      // fermer. Une entrée sans item ET sans `source: written` reste jetée:
      // elle ne désigne rien.
      if (item || written) {
        out[k] = {
          item,
          at: dayOf(row.at),
          source: written ? "written" : "memory",
        };
      }
    }
  }
  return out;
}

/**
 * LE PLAFOND DE `food_preferences_dismissed`.
 *
 * Cette liste n'a QUE des `push`: chaque proposition gardée ou écartée y laisse
 * un UUID, à vie, sur une ligne relue à chaque génération de semaine ET de
 * repas. Un élève actif sur deux ans y accumule des milliers d'entrées pour un
 * service — « ne repropose pas ça » — qui ne concerne que les souvenirs encore
 * PROPOSABLES.
 *
 * L'ARBITRAGE, et il n'est pas gratuit: on coupe par le PLUS ANCIEN. Un id
 * tombé du plafond dont l'item serait resté `active` peut être reproposé une
 * fois — l'élève le réécarte, et il repasse en tête. C'est le bon côté à
 * perdre: les écarts anciens portent en majorité des souvenirs que le cron
 * d'entretien a déjà archivés (donc plus proposables, donc l'id ne servait
 * plus à rien), tandis que les récents sont ceux qui travaillent encore.
 *
 * 200 = deux cents souvenirs alimentaires distincts déjà traités. Aucun élève
 * réel n'en produit autant en un an; le plafond est un garde-fou de structure,
 * pas une contrainte de fonctionnement.
 */
export const MAX_DISMISSED = 200;

/** Coupe `dismissed` par le plus ancien, en dédoublonnant. Voir `MAX_DISMISSED`. */
export function capDismissed(ids: readonly string[]): string[] {
  const unique = [...new Set(ids.map((v) => String(v ?? "").trim()).filter(Boolean))];
  return unique.length <= MAX_DISMISSED ? unique : unique.slice(-MAX_DISMISSED);
}

/** L'origine d'une préférence gardée, ou `null` si elle n'en a pas. */
export function originOf(
  constraints: Record<string, unknown> | null | undefined,
  text: string,
): FoodPreferenceOrigin | null {
  return originMapOf(constraints)[String(text ?? "").trim().toLowerCase()] ?? null;
}

/**
 * Les ids de `memory_items` à relire pour réconcilier, dédoublonnés.
 *
 * Exporté, et c'est le point: l'appelant serveur en avait fabriqué sa propre
 * version (`Object.values(origin).map(String)`), qui rendait `"[object
 * Object]"` dès que la valeur est devenue un objet daté — Postgres refusait la
 * requête, et la réconciliation ne tournait plus. Deux lectures d'une même
 * structure finissent toujours par diverger; celle-ci n'en a plus qu'une.
 */
export function originIdsOf(
  constraints: Record<string, unknown> | null | undefined,
): string[] {
  // ⚠️ LE `filter` N'EST PAS DE LA COQUETTERIE. Depuis que les lignes écrites
  // portent une entrée d'origine à `item: ""`, cette liste contiendrait une
  // chaîne vide — et elle part dans un `in('id', ids)` sur des UUID. C'est
  // exactement la panne que le paragraphe ci-dessus raconte, avec
  // `"[object Object]"`: Postgres refuse la requête, et la réconciliation
  // cesse silencieusement de tourner pour TOUT LE MONDE.
  return [
    ...new Set(
      Object.values(originMapOf(constraints))
        .map((o) => o.item)
        .filter((id) => id !== ""),
    ),
  ];
}

/**
 * Fusionne une décision de l'élève dans `practical_constraints`, SANS écraser
 * les autres clés.
 *
 * Le motif vient des deux cartes qui existent déjà (`EatingRhythmCard`,
 * `CookingCapacityCard`): chacune possède UNE clé et fusionne le reste. Deux
 * cartes ouvertes côte à côte ne doivent pas se désécrire l'une l'autre.
 */
export function applyFoodPreferenceDecision(
  constraints: Record<string, unknown> | null | undefined,
  decision:
    | {
      kind: "keep";
      text: string;
      memoryItemId?: string | null;
      /** La ligne gardée que celle-ci remplace (revirement de l'élève). */
      replaces?: string | null;
      /** Le jour où l'élève l'a dit. Vient de l'item, jamais d'une horloge. */
      seenAt?: string | null;
    }
    | { kind: "dismiss"; memoryItemId: string }
    | { kind: "remove"; text: string }
    | { kind: "edit"; from: string; to: string }
    /**
     * CE QUE L'ÉLÈVE TAPE LUI-MÊME — la porte d'entrée qui manquait.
     *
     * Avant ce lot, une phrase ne pouvait entrer dans `food_preferences` que
     * par le memorizer: la dire au chat, attendre le passage quotidien, la
     * voir revenir en proposition, la garder. À l'inscription, le memorizer
     * n'a rien vu — la section « ce qu'ils m'ont dit » était donc VIDE pour
     * exactement la personne qui compose son premier plan.
     *
     * Aucun `memoryItemId`: il n'y a pas de souvenir derrière. L'entrée
     * d'origine est écrite quand même, à `item: ""`, pour que la ligne se
     * DÉCLARE écrite (voir `FoodPreferenceOrigin`).
     */
    | { kind: "write"; text: string },
): Record<string, unknown> {
  const base = { ...(constraints ?? {}) } as Record<string, unknown>;
  const kept = Array.isArray(base[FOOD_PREFERENCES_KEY])
    ? (base[FOOD_PREFERENCES_KEY] as unknown[]).map((v) => String(v ?? "").trim())
      .filter(Boolean)
    : [];
  const dismissed = Array.isArray(base[FOOD_PREFERENCES_DISMISSED_KEY])
    ? (base[FOOD_PREFERENCES_DISMISSED_KEY] as unknown[]).map((v) =>
      String(v ?? "").trim()
    ).filter(Boolean)
    : [];
  const origin = originMapOf(base);

  if (decision.kind === "keep") {
    const text = String(decision.text ?? "").trim();
    const id = String(decision.memoryItemId ?? "").trim();
    // LE REMPLACEMENT AVANT L'AJOUT. Une proposition qui succède à une ligne
    // gardée la REMPLACE — sans ça on empile la contradiction que la
    // réconciliation devra défaire au tour suivant.
    const replaces = String(decision.replaces ?? "").trim().toLowerCase();
    if (replaces) {
      const at = kept.findIndex((k) => k.toLowerCase() === replaces);
      if (at >= 0) kept.splice(at, 1);
      delete origin[replaces];
    }
    if (text && !kept.some((k) => k.toLowerCase() === text.toLowerCase())) {
      kept.push(text);
    }
    if (text && id) {
      origin[text.toLowerCase()] = {
        item: id,
        at: dayOf(decision.seenAt),
        source: "memory",
      };
    }
    // Gardé ET marqué comme traité: sans ça la proposition reviendrait à
    // chaque ouverture de l'écran, puisqu'elle n'est pas persistée.
    if (id && !dismissed.includes(id)) dismissed.push(id);
  }

  if (decision.kind === "write") {
    const text = String(decision.text ?? "").trim();
    // Le doublon est SILENCIEUX, pas une erreur: quelqu'un qui retape une
    // phrase qu'il a déjà ne fait rien de mal, et un refus l'obligerait à
    // relire sa propre liste pour comprendre. On garde la première.
    if (text && !kept.some((k) => k.toLowerCase() === text.toLowerCase())) {
      kept.push(text);
      // `at: null` — AUCUNE HORLOGE ICI. Ce module est pur, et la date d'une
      // ligne écrite ne sert à rien: son rang vient de `source`, plus de sa
      // fraîcheur. Inventer un `new Date()` casserait la pureté pour une
      // donnée que personne ne lit.
      origin[text.toLowerCase()] = { item: "", at: null, source: "written" };
    }
  }

  if (decision.kind === "dismiss") {
    const id = String(decision.memoryItemId ?? "").trim();
    if (id && !dismissed.includes(id)) dismissed.push(id);
  }

  if (decision.kind === "remove") {
    const text = String(decision.text ?? "").trim().toLowerCase();
    const at = kept.findIndex((k) => k.toLowerCase() === text);
    if (at >= 0) kept.splice(at, 1);
    delete origin[text];
  }

  if (decision.kind === "edit") {
    const from = String(decision.from ?? "").trim().toLowerCase();
    const to = String(decision.to ?? "").trim();
    const at = kept.findIndex((k) => k.toLowerCase() === from);
    if (at >= 0 && to) kept[at] = to;
    else if (at >= 0) kept.splice(at, 1);
    // L'ORIGINE SUIT LE TEXTE. Une ligne réécrite par l'élève reste la même
    // préférence: si le memorizer la dément plus tard, la réconciliation doit
    // encore savoir de quel souvenir elle vient. La perdre ici rendrait toute
    // ligne éditée définitivement irrécupérable — exactement le défaut que
    // cette clé existe pour corriger.
    if (at >= 0) {
      const sourceId = origin[from];
      delete origin[from];
      if (to && sourceId) origin[to.toLowerCase()] = sourceId;
    }
  }

  base[FOOD_PREFERENCES_KEY] = kept;
  base[FOOD_PREFERENCES_DISMISSED_KEY] = capDismissed(dismissed);
  base[FOOD_PREFERENCES_ORIGIN_KEY] = origin;
  return base;
}

// ---------------------------------------------------------------------------
// La réconciliation — ce qui fait qu'une préférence VIT
// ---------------------------------------------------------------------------

/** Ce qu'une réconciliation a changé, pour que l'appelant puisse le journaliser. */
export interface FoodPreferenceReconciliation {
  constraints: Record<string, unknown>;
  changed: boolean;
  /** Les lignes retirées, avec le statut du souvenir qui les a retirées. */
  dropped: Array<{ text: string; memoryItemId: string; status: string }>;
  /**
   * Les lignes qu'un `superseded` réclamait et qu'on a GARDÉES faute de lien
   * lisible entre l'ancienne et la nouvelle. À journaliser: c'est la trace
   * d'une supersession douteuse côté memorizer.
   */
  keptDespiteSupersession: Array<{
    text: string;
    memoryItemId: string;
    replacementId: string;
  }>;
}

/**
 * LES MOTS QUI NE DISTINGUENT RIEN, dans les DEUX langues servies.
 *
 * ── CE QUE CETTE LISTE A COÛTÉ D'OUBLIER ──────────────────────────────────
 * Première version sans elle: le test de plausibilité déclarait « Theo déteste
 * le brocoli » et « Theo n'aime pas le porridge » liés — parce qu'ils
 * partagent `theo`. Le memorizer PRÉFIXE ses résumés du prénom de l'élève,
 * donc absolument toutes ses paires partagent au moins ce mot-là, et le
 * contrôle était vert en étant mort. Le prénom, lui, n'est pas ici: il n'est
 * pas connu d'un module pur — il arrive par `ignoreTokens`.
 *
 * Bilingue par construction: ce dépôt a déjà payé une garde écrite et testée
 * dans une seule langue, verte à cause de ça.
 */
const NON_DISTINCTIVE_TOKENS: ReadonlySet<string> = new Set([
  // FR — cadres de phrase et verbes d'appréciation
  "aime", "aimes", "adore", "deteste", "detestes", "prefere", "preferes",
  "mange", "manges", "boit", "boire", "manger", "supporte", "apprecie",
  "habitude", "toujours", "jamais", "parfois", "souvent", "plus", "pour",
  "avec", "sans", "dans", "chez", "quand", "cela", "elle", "leur", "tout",
  "tous", "toute", "toutes", "etre", "avoir", "fait", "faire", "peut",
  // EN — same job
  "likes", "like", "loves", "love", "hates", "hate", "dislikes", "dislike",
  "prefers", "prefer", "eats", "eat", "eating", "drinks", "drink", "does",
  "always", "never", "sometimes", "often", "with", "without", "when",
  "that", "this", "they", "them", "their", "have", "will", "would", "cannot",
  "student", "eleve",
]);

/**
 * Les mots porteurs d'un texte: minuscules, sans accents, ≥ 4 lettres, hors
 * mots non distinctifs et hors `ignore`.
 *
 * Volontairement grossier. Ce n'est PAS un analyseur de sens — c'est un test
 * de plausibilité sur un lien que le memorizer affirme, et il doit rester
 * assez bête pour être relisible et ne jamais avoir raison contre l'évidence.
 */
function contentTokens(text: string, ignore?: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (
    const word of String(text ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
  ) {
    if (word.length < 4) continue;
    if (NON_DISTINCTIVE_TOKENS.has(word)) continue;
    if (ignore?.has(word)) continue;
    out.add(word);
  }
  return out;
}

/** Normalise des mots à ignorer (typiquement le prénom de l'élève). */
export function ignorableTokens(...values: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    for (
      const word of String(value ?? "")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
    ) {
      if (word.length >= 2) out.add(word);
    }
  }
  return out;
}

/**
 * LA CONDITION DE LA CEINTURE: une supersession n'emporte une préférence que
 * si le remplaçant PARLE de la même chose.
 *
 * ── CE QU'ELLE A ATTRAPÉ, mesuré au 4e run réel ───────────────────────────
 * Le memorizer a rattaché « Theo déteste le brocoli. » (2026-07-20) à TROIS
 * items, dont « Theo n'aime pas du tout le porridge au petit-déjeuner. ». La
 * réconciliation, qui faisait confiance au statut seul, a donc supprimé une
 * préférence VRAIE et sans rapport — silencieusement, dans une carte que
 * l'élève ouvre rarement.
 *
 * ── POURQUOI CETTE ERREUR-LÀ COMPTE PLUS QUE SON INVERSE ──────────────────
 * Garder une ligne périmée et supprimer une ligne vraie coûtent la même chose
 * au plan. Elles ne coûtent PAS la même chose à l'élève: la ligne périmée
 * reste affichée dans « In your plan », donc visible et corrigeable; la ligne
 * supprimée disparaît sans trace. À incertitude égale on choisit l'erreur que
 * l'élève peut voir — et la vue datée du prompt, elle, sait déjà départager
 * deux lignes qui se contredisent.
 *
 * `invalidated` n'est pas concerné: il n'y a pas de remplaçant à comparer,
 * l'élève a simplement rétracté.
 */
function supersessionIsPlausible(
  retired: string,
  replacement: string,
  ignore?: ReadonlySet<string>,
): boolean {
  const a = contentTokens(retired, ignore);
  // Plus aucun mot distinctif d'un côté: on n'a rien pour juger, donc on ne
  // s'oppose pas. Le contrôle ne doit BLOQUER que sur une preuve, jamais sur
  // une ignorance — sinon il gèlerait la réconciliation entière.
  if (a.size === 0) return true;
  const b = contentTokens(replacement, ignore);
  if (b.size === 0) return true;
  for (const token of a) if (b.has(token)) return true;
  return false;
}

/**
 * RETIRE DU PLAN CE QUE LA MÉMOIRE A DÉMENTI.
 *
 * ── LA QUESTION À LAQUELLE ELLE RÉPOND ────────────────────────────────────
 * « Jusqu'à ce que ça change ou que ce ne soit plus utile. » Sans cette
 * fonction, une préférence gardée ne changeait jamais et n'était jamais
 * inutile: elle était éternelle. La 3e semaine du run réel servait au
 * générateur « aime le brocoli rôti » ET « n'aime pas le brocoli ».
 *
 * ── POURQUOI LA MÉMOIRE DÉCIDE, ET PAS UN TTL ─────────────────────────────
 * La tentation est un délai de péremption maison (« oublier après N
 * semaines »). Ce serait une SECONDE source de vérité sur la durée de vie
 * d'un fait, en concurrence avec celle qui existe déjà et qui est mieux
 * informée: le cycle de vie de `memory_items` (`superseded` quand l'élève
 * revient dessus, `invalidated` quand il rétracte, `archived` quand rien ne
 * le réaffirme). On s'y branche au lieu d'en inventer une deuxième.
 *
 * PURE: aucun I/O. L'appelant fournit les items et persiste le résultat.
 */
export function reconcileFoodPreferences(args: {
  constraints: Record<string, unknown> | null | undefined;
  items: readonly MemoryItemForPromotion[];
  /**
   * Les mots à ne pas compter comme un lien — le prénom de l'élève au premier
   * chef, que le memorizer met en tête de chaque résumé. Voir
   * `NON_DISTINCTIVE_TOKENS`.
   */
  ignoreTokens?: ReadonlySet<string>;
}): FoodPreferenceReconciliation {
  const base = { ...(args.constraints ?? {}) } as Record<string, unknown>;
  const kept = Array.isArray(base[FOOD_PREFERENCES_KEY])
    ? (base[FOOD_PREFERENCES_KEY] as unknown[]).map((v) => String(v ?? "").trim())
      .filter(Boolean)
    : [];
  const origin = originMapOf(base);
  if (kept.length === 0) {
    return {
      constraints: base,
      changed: false,
      dropped: [],
      keptDespiteSupersession: [],
    };
  }

  const byId = new Map<string, MemoryItemForPromotion>();
  for (const item of args.items) {
    const id = String(item?.id ?? "").trim();
    if (id) byId.set(id, item);
  }
  const textOf = (item: MemoryItemForPromotion | undefined) =>
    String(item?.normalized_summary ?? "").trim() ||
    String(item?.content_text ?? "").trim();

  const dropped: FoodPreferenceReconciliation["dropped"] = [];
  const keptDespiteSupersession:
    FoodPreferenceReconciliation["keptDespiteSupersession"] = [];
  const nextKept: string[] = [];
  for (const text of kept) {
    const key = text.toLowerCase();
    const sourceId = origin[key]?.item;
    // Pas d'origine = pas de propriétaire côté mémoire. On n'y touche pas:
    // c'est une ligne que l'élève a tapée ou héritée, et la retirer serait
    // effacer une décision qu'aucun souvenir ne contredit.
    if (!sourceId) {
      nextKept.push(text);
      continue;
    }
    const source = byId.get(sourceId);
    // Souvenir INTROUVABLE ≠ souvenir démenti. Une purge RGPD, un export, un
    // `limit` de lecture trop court: dans tous ces cas l'absence est une
    // ignorance, pas une rétractation. Fail SAFE — on garde.
    if (source === undefined) {
      nextKept.push(text);
      continue;
    }
    const status = String(source.status ?? "");
    if (!RETIRED_STATUSES.includes(status)) {
      nextKept.push(text);
      continue;
    }

    // LA CONDITION DE LA CEINTURE, et elle ne vaut que pour `superseded`: le
    // remplaçant doit parler de la même chose. Voir `supersessionIsPlausible`.
    const replacementId = String(source.superseded_by_item_id ?? "").trim();
    if (status === "superseded" && replacementId) {
      const replacement = byId.get(replacementId);
      // Remplaçant non chargé: on ne peut pas vérifier, donc on ne retire pas.
      if (!replacement) {
        nextKept.push(text);
        keptDespiteSupersession.push({ text, memoryItemId: sourceId, replacementId });
        continue;
      }
      if (
        !supersessionIsPlausible(
          textOf(source) || text,
          textOf(replacement),
          args.ignoreTokens,
        )
      ) {
        nextKept.push(text);
        keptDespiteSupersession.push({ text, memoryItemId: sourceId, replacementId });
        continue;
      }
    }

    dropped.push({ text, memoryItemId: sourceId, status });
    delete origin[key];
  }

  if (dropped.length === 0) {
    return { constraints: base, changed: false, dropped: [], keptDespiteSupersession };
  }
  base[FOOD_PREFERENCES_KEY] = nextKept;
  base[FOOD_PREFERENCES_ORIGIN_KEY] = origin;
  return { constraints: base, changed: true, dropped, keptDespiteSupersession };
}

/**
 * `practical_constraints` TEL QUE LE MODÈLE DOIT LE VOIR.
 *
 * ── POURQUOI CETTE FONCTION EXISTE ────────────────────────────────────────
 * Les deux générateurs sérialisent le jsonb ENTIER dans leur prompt
 * (`week_plan_generation.ts`: `JSON.stringify(practicalConstraints)`). Une clé
 * de plus est donc servie au modèle automatiquement — c'est ce qui rend le pont
 * court, et c'est aussi le piège: `food_preferences_dismissed` est une liste
 * d'UUID de comptabilité interne. Servie au modèle, elle occupe du budget de
 * prompt pour du bruit, et un modèle qui voit « dismissed » à côté de
 * préférences peut très bien décider de les appliquer à l'envers.
 *
 * Ce filtre est donc une garde de PROMPT, pas une préférence d'affichage.
 *
 * `food_preferences_origin` part par la même porte et pour la même raison:
 * c'est une table de correspondance texte→UUID, illisible pour un modèle et
 * coûteuse en budget. Elle sert la réconciliation, jamais la composition.
 * Sa DATE, elle, reste — voir `foodPreferencesForPrompt`.
 */
export function constraintsForPrompt(
  constraints: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out = { ...(constraints ?? {}) } as Record<string, unknown>;
  delete out[FOOD_PREFERENCES_DISMISSED_KEY];
  delete out[FOOD_PREFERENCES_ORIGIN_KEY];
  const dated = foodPreferencesForPrompt(constraints);
  if (dated.length > 0) out[FOOD_PREFERENCES_KEY] = dated;
  return out;
}

/**
 * LES PRÉFÉRENCES TELLES QUE LE MODÈLE DOIT LES LIRE: datées, la plus récente
 * d'abord.
 *
 * ── LE DÉFAUT QUE ÇA CORRIGE, MESURÉ ──────────────────────────────────────
 * La réconciliation retire ce que le memorizer a EXPLICITEMENT démenti
 * (`superseded`, `invalidated`). Elle ne peut rien pour ce qu'il n'a pas relié
 * — et il ne relie pas tout. Run réel du 2026-08-06, semaine 2, deux lignes
 * gardées, toutes les deux `active`, aucun lien entre elles:
 *
 *   « Indisponibilité temporaire pour cuisiner le soir jusqu'au 20 juillet »
 *   « Cuisine de nouveau le soir. »
 *
 * Servies comme un SAC de chaînes sans date, ces deux lignes sont
 * indépartageables: rien dans le prompt ne dit laquelle est la plus récente,
 * donc le modèle n'a aucun moyen, même en principe, de choisir. Datées et
 * ordonnées, c'est une lecture triviale — et la première ligne porte même sa
 * propre péremption (« jusqu'au 20 juillet »), que le modèle peut comparer à
 * la semaine qu'on lui demande de composer.
 *
 * ── POURQUOI PAS UN OUBLI AUTOMATIQUE ─────────────────────────────────────
 * La tentation est de retirer nous-mêmes la plus ancienne des deux. Ça
 * demanderait de décider que deux phrases libres parlent du même sujet et se
 * contredisent — un jugement de langue qu'on ferait mal, en silence, sur une
 * donnée que l'élève a explicitement gardée. On lui donne le contexte de le
 * faire au lieu de le faire à sa place.
 *
 * ── CE QUE L'ÉLÈVE A ÉCRIT PASSE DEVANT, ET C'EST UN RENVERSEMENT ─────────
 * Jusqu'au 2026-08-13, les lignes sans date passaient EN DERNIER — et le
 * commentaire les nommait « tapées à la main ». Or le plafond coupe par la
 * QUEUE. Une consigne écrite par l'élève était donc la PREMIÈRE sacrifiée, au
 * profit de phrases que le memorizer avait glanées dans une conversation.
 *
 * L'ordre s'inverse: ce que quelqu'un prend la peine d'écrire sur son
 * alimentation vaut plus qu'une remarque au passage qu'on lui a fait
 * confirmer. Le plafond sacrifie désormais la plus ancienne RÉCOLTE, jamais
 * une consigne.
 *
 * Les lignes écrites passent sans préfixe de date: on n'invente pas une date
 * pour les ranger, et leur rang ne vient plus de là.
 *
 * ── LE PLAFOND, ET POURQUOI IL EST ICI ────────────────────────────────────
 * `generate-meal-v1` en portait un (20) que `generate-week-plan-v1` n'avait
 * pas: ce dernier sérialise le jsonb entier, donc une liste qui grossit sans
 * fin y pousse la doctrine du coach hors du contexte, et le budget tronque par
 * la QUEUE — c'est-à-dire par le coach. Le plafond descend donc ici, où les
 * deux passent, et il coupe du bon côté puisque la liste est triée: ce qu'on
 * perd est le plus ancien.
 */
const MAX_PROMPT_PREFERENCES = 20;

export interface FoodPreferencesByOrigin {
  /** Ce que l'élève a TAPÉ. Des consignes. Sans préfixe de date. */
  written: string[];
  /** Ce que le memorizer a proposé et que l'élève a gardé. Daté, récent d'abord. */
  remembered: string[];
}

/**
 * LA PRIMITIVE, et la SEULE lecture de cette structure.
 *
 * `foodPreferencesForPrompt` en est un enrobage. Deux lectures d'une même
 * structure finissent toujours par diverger — c'est écrit dans ce fichier, au
 * -dessus d'`originIdsOf`, et ça y a déjà coûté une réconciliation morte.
 *
 * ⚠️ LE PLAFOND S'APPLIQUE À LA LISTE COMBINÉE, PAS À CHAQUE SEAU. Un plafond
 * par seau ferait passer le total de 20 à 40 lignes le jour où quelqu'un écrit
 * beaucoup, et `MAX_PROMPT_PREFERENCES` existe précisément pour que cette
 * liste ne pousse pas la doctrine du coach hors du contexte.
 */
export function foodPreferencesByOrigin(
  constraints: Record<string, unknown> | null | undefined,
): FoodPreferencesByOrigin {
  const base = (constraints ?? {}) as Record<string, unknown>;
  const kept = Array.isArray(base[FOOD_PREFERENCES_KEY])
    ? (base[FOOD_PREFERENCES_KEY] as unknown[]).map((v) => String(v ?? "").trim())
      .filter(Boolean)
    : [];
  if (kept.length === 0) return { written: [], remembered: [] };
  const origin = originMapOf(base);

  const rows = kept.map((text, index) => {
    const o = origin[text.toLowerCase()] ?? null;
    return {
      text,
      index,
      at: o?.at ?? null,
      // Sans entrée d'origine, on ne SAIT pas: on ne promeut pas au rang de
      // consigne une ligne dont on ignore la provenance. `memory` est la
      // direction sûre — elle laisse la ligne où elle était avant ce lot.
      written: o?.source === "written",
    };
  });
  rows.sort((a, b) => {
    if (a.written !== b.written) return a.written ? -1 : 1;
    if (a.at && b.at) return a.at === b.at ? a.index - b.index : (a.at < b.at ? 1 : -1);
    if (a.at) return -1;
    if (b.at) return 1;
    return a.index - b.index;
  });
  const capped = rows.slice(0, MAX_PROMPT_PREFERENCES);
  return {
    written: capped.filter((r) => r.written).map((r) => r.text),
    remembered: capped
      .filter((r) => !r.written)
      .map((r) => (r.at ? `${r.at} — ${r.text}` : r.text)),
  };
}

export function foodPreferencesForPrompt(
  constraints: Record<string, unknown> | null | undefined,
): string[] {
  const { written, remembered } = foodPreferencesByOrigin(constraints);
  return [...written, ...remembered];
}

// ---------------------------------------------------------------------------
// CE QU'IL FAUT DEMANDER À L'ÉLÈVE — et surtout, ne pas décider pour lui
// ---------------------------------------------------------------------------

/** Une ligne ancienne qu'une ligne plus récente recoupe. */
export interface PreferenceRecheck {
  /** La ligne ANCIENNE — celle sur laquelle on interroge. */
  text: string;
  at: string;
  /** La ligne récente qui parle du même sujet. */
  newerText: string;
  newerAt: string;
}

/**
 * LES LIGNES SUR LESQUELLES L'ÉLÈVE EST REVENU DEPUIS — sans prétendre savoir
 * laquelle est vraie.
 *
 * ── LE TROU QUE ÇA COUVRE ─────────────────────────────────────────────────
 * `reconcileFoodPreferences` ne retire que ce que le memorizer a EXPLICITEMENT
 * relié. Or ce lien est NON DÉTERMINISTE: mesuré le 2026-08-06, le même
 * scénario a produit un `superseded` en français et AUCUN lien en anglais.
 * Quand il manque, les deux lignes restent dans la carte pour toujours, et
 * seul un `Remove` manuel les nettoie — c'est-à-dire jamais.
 *
 * La vue datée du prompt suffit au MODÈLE (il lit la plus récente en premier).
 * Elle ne suffit pas à l'ÉCRAN, qui accumule.
 *
 * ── CE QUE CETTE FONCTION AFFIRME, ET CE QU'ELLE N'AFFIRME PAS ────────────
 * Elle n'affirme PAS « ces deux lignes se contredisent »: décider que deux
 * phrases libres s'opposent est un jugement de langue qu'on ferait mal, en
 * silence, sur une donnée que l'élève a explicitement gardée.
 *
 * Elle affirme ce que les données disent, et rien de plus: **« tu es revenu
 * sur ce sujet plus tard »**. C'est vérifiable (un mot porteur partagé, deux
 * dates différentes), et c'est exactement ce qu'il faut pour poser une
 * question plutôt que pour trancher. « No broccoli » + « no broccoli in soup »
 * se recoupent sans se contredire — et la bonne réaction est la même dans les
 * deux cas: demander.
 *
 * ── LES TROIS ABSTENTIONS ─────────────────────────────────────────────────
 *   · pas de date des deux côtés → aucune base pour dire qui est ancien;
 *   · même date → dit dans le même souffle, donc complémentaire, pas un
 *     revirement;
 *   · seule la PLUS ANCIENNE est signalée — la récente est présumée courante.
 *
 * PURE: aucun I/O, aucune horloge.
 */
export function preferencesWorthRechecking(args: {
  constraints: Record<string, unknown> | null | undefined;
  /** Le prénom de l'élève, sinon toutes les paires se recoupent. */
  ignoreTokens?: ReadonlySet<string>;
}): PreferenceRecheck[] {
  const base = (args.constraints ?? {}) as Record<string, unknown>;
  const kept = Array.isArray(base[FOOD_PREFERENCES_KEY])
    ? (base[FOOD_PREFERENCES_KEY] as unknown[]).map((v) => String(v ?? "").trim())
      .filter(Boolean)
    : [];
  if (kept.length < 2) return [];
  const origin = originMapOf(base);

  const dated = kept
    .map((text) => ({ text, at: origin[text.toLowerCase()]?.at ?? null }))
    .filter((r): r is { text: string; at: string } => Boolean(r.at));

  const out: PreferenceRecheck[] = [];
  for (const older of dated) {
    let best: { text: string; at: string } | null = null;
    for (const newer of dated) {
      if (newer.text === older.text || newer.at <= older.at) continue;
      const shared = contentTokens(older.text, args.ignoreTokens);
      if (shared.size === 0) continue;
      const theirs = contentTokens(newer.text, args.ignoreTokens);
      let overlaps = false;
      for (const token of shared) {
        if (theirs.has(token)) {
          overlaps = true;
          break;
        }
      }
      // La plus RÉCENTE des lignes qui recoupent: c'est celle qui a le dernier
      // mot, donc celle qu'il est utile de citer à l'élève.
      if (overlaps && (!best || newer.at > best.at)) best = newer;
    }
    if (best) {
      out.push({
        text: older.text,
        at: older.at,
        newerText: best.text,
        newerAt: best.at,
      });
    }
  }
  return out;
}
