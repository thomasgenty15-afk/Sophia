// ===========================================================================
// LE BROUILLON DE L'ENTONNOIR, GARDÉ SUR CE NAVIGATEUR
// ===========================================================================
//
// ── LE DÉFAUT QU'IL FERME ─────────────────────────────────────────────────
// `SetupPage` porte tout ce qu'on tape dans du `useState`, et n'écrit en base
// qu'au « Continuer » de chaque étape. Un rechargement au milieu de l'étape 2
// — un HMR pendant le développement, un onglet restauré, un téléphone qui
// reprend la main — détruisait donc prénom, corps, objectif, régime, moments
// et habitudes d'un seul coup. Rien ne les gardait: le seul `localStorage` du
// produit sert au jeton d'invitation coach, à la langue d'UI et aux
// notifications de chat.
//
// ── ⛔ CE MODULE NE RENVERSE PAS « LA LECTURE EST LA SEULE SOURCE » ────────
// C'est la règle de `SetupPage.load`, et elle est écrite contre une cicatrice
// réelle (`mount-snapshot-forms-need-a-loading-gate`): un formulaire semé
// depuis autre chose que la base finit par ÉCRASER la base. Le brouillon local
// ne se substitue donc JAMAIS à la lecture serveur — il se glisse DESSOUS, et
// seulement là où le serveur n'a rien de plus récent à dire.
//
// La réconciliation est à trois termes, et le troisième est ce qui la rend
// sûre:
//
//   · `base`  — l'état SERVEUR au moment où le brouillon a été écrit;
//   · `draft` — ce qui est à l'écran, tel qu'on l'a tapé;
//   · `fresh` — l'état serveur relu MAINTENANT.
//
// Champ par champ:
//
//   1. `draft` == `base`  → personne n'a touché ce champ ⇒ le serveur gagne.
//   2. `fresh` != `base`  → quelqu'un d'AUTRE a écrit depuis (`/app/household`
//                           vise les mêmes colonnes) ⇒ le serveur gagne.
//   3. sinon              → saisie non enregistrée, et rien ne l'a contredite
//                           ⇒ l'écran gagne. C'est le SEUL cas où le cache
//                           parle, et c'est exactement celui qu'on perdait.
//
// La conséquence de 2. est voulue et elle se paie: modifier un champ ici PUIS
// le modifier ailleurs, sans enregistrer ici, perd la saisie d'ici. Entre les
// deux, c'est la bonne à perdre — c'est celle que personne n'a validée.
//
// ── CE QUI N'EST PAS GARDÉ, ET POURQUOI ───────────────────────────────────
// La FENÊTRE du plan (`windowStart` / `windowEnd`) n'entre pas ici: elle est
// ancrée sur `browserLocalDate()`, et restaurer la fenêtre d'hier proposerait
// de composer un plan qui commence dans le passé. Elle se réancre à chaque
// montage, ce qui est la bonne réponse.

/**
 * ⚠️ LE NUMÉRO MONTE DÈS QUE LA FORME D'UN BROUILLON CHANGE. Un brouillon
 * d'une version antérieure est JETÉ, pas migré: il porterait des champs que le
 * code d'aujourd'hui ne sait plus lire. Perdre une saisie au déploiement
 * suivant est un coût connu; glisser un champ mort dans un formulaire n'en est
 * pas un. C'est CE numéro, et pas `takeKnownShape`, qui tient la forme.
 */
export const SETUP_DRAFT_VERSION = 2;

/**
 * SEPT JOURS. Au-delà ce n'est plus « je reviens finir »: c'est une reprise que
 * la personne ne reconnaîtrait pas, et la base a pu bouger entre-temps par tous
 * les autres écrans.
 */
export const SETUP_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Une clé par compte: deux personnes sur le même navigateur ne se mélangent pas. */
export function setupDraftKey(userId: string): string {
  return `keel.setup.draft.${userId}`;
}

/**
 * CE QU'ON ÉCRIT. `object` et pas `Record<string, unknown>`: les brouillons de
 * l'écran sont des `interface`, et une interface n'a pas de signature d'index —
 * la contraindre ici obligerait à en poser une sur `SelfDraft`, c'est-à-dire à
 * ouvrir une forme fermée pour satisfaire un cache.
 */
export interface SetupDraftPayload {
  self: object;
  plan: object;
  /**
   * La fiche d'ajout en cours. ⚠️ AUCUN PENDANT SERVEUR: tant qu'on n'a pas
   * cliqué « Ajouter », cette bouche n'existe nulle part. Elle se restaure donc
   * telle quelle, sans réconciliation — il n'y a rien avec quoi réconcilier.
   */
  mouth: object;
  stepIndex: number;
  /**
   * Le choix de l'étape 1 tant que `student_goals` n'existe pas encore.
   *
   * Cette ligne ne peut être créée qu'à l'étape 2, lorsque la personne choisit
   * sa direction. Garder le nombre ici évite qu'un rechargement intermédiaire
   * transforme une famille encore vide en couple par le repli historique.
   */
  householdSize: number | null;
  cookingShape: string | null;
  /**
   * « TOUT CUISINER EN UNE SEULE FOIS » — 2026-09-01.
   *
   * ⚠️ IL EST DANS LE BROUILLON POUR LA MÊME RAISON QUE `cookingShape`: il ne
   * s'écrit dans AUCUNE colonne, donc un onglet rechargé le perdrait sans qu'il
   * existe la moindre trace ailleurs. Les réponses de `plan`, elles, sont en
   * base — le brouillon ne fait que les devancer.
   */
  oneCookingSession: boolean;
  // ⟳ A1 (2026-09-03) — `cookTheDayBefore` A ÉTÉ RETIRÉ DU BROUILLON.
  // La veille n'est plus une case: le serveur la dérive de la date de départ
  // et de l'heure locale. Un brouillon d'avant ce lot porte encore la clé;
  // elle est simplement ignorée à la relecture — aucun rattrapage, et rien à
  // reposer à la personne, puisqu'on ne lui demande plus rien.
  /**
   * L'envie, AVEC SA SEMAINE. Elle est écrite par semaine côté serveur
   * (`household_envy_submissions`): restaurer la phrase de la semaine dernière
   * sur un plan qui commence lundi prochain la poserait sur la mauvaise.
   */
  envy: string;
  envyWeek: string;
}

/** CE QU'ON RELIT — tout ce qui vient de `JSON.parse` est un sac de clés. */
export interface StoredSetupDraft {
  v: number;
  /** Millisecondes epoch de la dernière écriture — c'est le TTL qui la lit. */
  at: number;
  /** L'ARBITRE. Voir l'en-tête: sans lui il n'y a pas de réconciliation sûre. */
  base: { self: Record<string, unknown>; plan: Record<string, unknown> };
  draft: {
    self: Record<string, unknown>;
    plan: Record<string, unknown>;
    mouth: Record<string, unknown>;
    stepIndex: number;
    householdSize: number | null;
    cookingShape: string | null;
    oneCookingSession: boolean;
    envy: string;
    envyWeek: string;
  };
}

/**
 * ÉGALITÉ DE VALEUR, EN PROFONDEUR.
 *
 * ⚠️ `===` NE SUFFIT PAS ICI, et s'en contenter aurait désarmé la règle 2 de
 * l'en-tête sur la moitié des champs: `habits`, `extras`, `allergies`,
 * `dislikes`, `rhythm`, `cookDays` et `shaker` sont des objets. Deux lectures
 * successives de la base en rendent des instances DIFFÉRENTES, donc « le
 * serveur a bougé » aurait été vrai à chaque montage — et le brouillon
 * n'aurait jamais parlé.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const arrayA = Array.isArray(a);
  if (arrayA !== Array.isArray(b)) return false;
  if (arrayA) {
    const left = a as readonly unknown[];
    const right = b as readonly unknown[];
    return left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) =>
    Object.hasOwn(right, key) && sameValue(left[key], right[key])
  );
}

function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * REPRENDRE D'UN SAC DE CLÉS CE QUE LA FORME ATTENDUE RECONNAÎT.
 *
 * ⛔ CE N'EST PAS UNE GARDE DE SÉCURITÉ, et la confondre avec ça serait la
 * seule façon de s'en servir mal. Les vocabulaires fermés — objectif, régime,
 * cran d'activité, moment — sont tenus par des CHECK en base (`tokens.ts`), et
 * c'est là qu'ils doivent l'être: un `localStorage` est la machine de la
 * personne, elle peut y écrire ce qu'elle veut, et elle n'y gagne rien qu'un
 * refus RPC. Ce que cette fonction empêche est plus bête et plus fréquent: un
 * brouillon écrit par une version d'avant, un `null` là où on attend une
 * chaîne, une entrée à moitié écrite — c'est-à-dire un `setState` typé qui
 * reçoit une forme qu'il ne sait pas rendre.
 *
 * ⚠️ UNE CLÉ ABSENTE, OU DE MAUVAIS GENRE, RETOMBE SUR `fallback` — et quand
 * `fallback` est la lecture serveur, ce repli est NEUTRE pour la
 * réconciliation: la valeur devient identique à `fresh`, donc la règle 1 ou la
 * règle 2 rend le serveur, et le cache se tait.
 *
 * ⚠️ `null` TRAVERSE DANS LES DEUX SENS, et il le faut: la moitié des champs
 * de l'entonnoir sont des tri-états (`activityLevel`, `takesPain`, `rhythm`…).
 * Un `fallback` à `null` ne dit rien du genre de la réponse, donc il accepte
 * tout; et un `null` gardé est la RÉPONSE « on a effacé », donc il traverse
 * même sous un `fallback` qui est une chaîne.
 *
 * ⛔ LE TROU QUE ÇA LAISSE, ÉCRIT ICI PLUTÔT QUE DÉCOUVERT: un `null` gardé
 * atterrit aussi dans un champ qui, lui, n'est jamais nul — `firstName`. Il n'y
 * a pas moyen de séparer les deux sans un schéma par champ, et un schéma de
 * plus qui doit suivre `SelfDraft` à la main est précisément le genre de
 * seconde source que ce fichier existe pour ne pas créer. Ce qui tient la forme
 * est `SETUP_DRAFT_VERSION`; et pour y arriver il faut avoir édité soi-même son
 * propre `localStorage`, ce qui ne fait perdre que son propre brouillon.
 */
export function takeKnownShape<T extends object>(
  fallback: T,
  stored: Record<string, unknown> | null | undefined,
): T {
  if (!stored) return fallback;
  const reference = fallback as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...reference };
  for (const key of Object.keys(reference)) {
    if (!Object.hasOwn(stored, key)) continue;
    const value = stored[key];
    const expected = kindOf(reference[key]);
    if (expected !== "null" && kindOf(value) !== expected && value !== null) {
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

/**
 * LA RÉCONCILIATION À TROIS TERMES. Voir l'en-tête pour les trois règles.
 *
 * ⚠️ LA FORME DE SORTIE EST CELLE DE `fresh`, TOUJOURS: on n'itère que sur les
 * clés de la lecture serveur. Un champ que le brouillon porte et que la lecture
 * ne connaît plus ne traverse pas.
 */
export function reconcileDraft<T extends object>(args: {
  base: T | null | undefined;
  draft: T | null | undefined;
  fresh: T;
}): T {
  const { base, draft, fresh } = args;
  if (!base || !draft) return fresh;
  const freshRecord = fresh as unknown as Record<string, unknown>;
  const baseRecord = base as unknown as Record<string, unknown>;
  const draftRecord = draft as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...freshRecord };
  for (const key of Object.keys(freshRecord)) {
    if (!Object.hasOwn(draftRecord, key) || !Object.hasOwn(baseRecord, key)) {
      continue;
    }
    // 1. Pas touché depuis la semence ⇒ le serveur.
    if (sameValue(draftRecord[key], baseRecord[key])) continue;
    // 2. Un autre écran a écrit depuis ⇒ le serveur. Voir l'en-tête.
    if (!sameValue(freshRecord[key], baseRecord[key])) continue;
    // 3. Saisie non enregistrée que rien ne contredit ⇒ l'écran.
    out[key] = draftRecord[key];
  }
  return out as T;
}

/**
 * ⚠️ TOUT ACCÈS EST GARDÉ, ET LE REPLI EST « PAS DE CACHE ».
 *
 * `localStorage` n'existe pas sous vitest sans jsdom, il jette en navigation
 * privée sur certains moteurs, et il jette au quota. Aucun de ces trois cas ne
 * doit empêcher quelqu'un de remplir l'entonnoir: le cache est un confort, pas
 * une dépendance.
 */
function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * LE BROUILLON GARDÉ, OU `null`.
 *
 * `null` est rendu pour un cache vide, illisible, périmé, ou d'une autre
 * version — les quatre se traitent pareil, et l'entrée est effacée au passage
 * pour ne pas rejouer la lecture à chaque montage.
 */
export function readSetupDraft(
  userId: string,
  now: number,
): StoredSetupDraft | null {
  if (!userId) return null;
  const box = store();
  if (!box) return null;
  let raw: string | null = null;
  try {
    raw = box.getItem(setupDraftKey(userId));
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearSetupDraft(userId);
    return null;
  }
  if (!isRecord(parsed)) {
    clearSetupDraft(userId);
    return null;
  }
  const at = typeof parsed.at === "number" ? parsed.at : 0;
  if (parsed.v !== SETUP_DRAFT_VERSION || now - at > SETUP_DRAFT_TTL_MS) {
    clearSetupDraft(userId);
    return null;
  }
  const base = parsed.base;
  const draft = parsed.draft;
  if (!isRecord(base) || !isRecord(draft)) {
    clearSetupDraft(userId);
    return null;
  }
  if (!isRecord(base.self) || !isRecord(base.plan)) {
    clearSetupDraft(userId);
    return null;
  }
  if (!isRecord(draft.self) || !isRecord(draft.plan) || !isRecord(draft.mouth)) {
    clearSetupDraft(userId);
    return null;
  }
  return {
    v: SETUP_DRAFT_VERSION,
    at,
    base: { self: base.self, plan: base.plan },
    draft: {
      self: draft.self,
      plan: draft.plan,
      mouth: draft.mouth,
      stepIndex: typeof draft.stepIndex === "number" ? draft.stepIndex : 0,
      householdSize: typeof draft.householdSize === "number" &&
          Number.isInteger(draft.householdSize) && draft.householdSize >= 1
        ? draft.householdSize
        : null,
      cookingShape: typeof draft.cookingShape === "string"
        ? draft.cookingShape
        : null,
      // ⚠️ `=== true`, ET LA COMPARAISON EST LA GARDE. Ce qui sort de
      // `JSON.parse` est un sac de clés: `"true"`, `1` et `{}` sont truthy et
      // ne sont pas des réponses. Un brouillon d'avant ce lot n'a pas la clé, et
      // rend donc `false` — le comportement d'hier.
      oneCookingSession: draft.oneCookingSession === true,
      envy: typeof draft.envy === "string" ? draft.envy : "",
      envyWeek: typeof draft.envyWeek === "string" ? draft.envyWeek : "",
    },
  };
}

export function writeSetupDraft(
  userId: string,
  value: { base: { self: object; plan: object }; draft: SetupDraftPayload },
  now: number,
): void {
  if (!userId) return;
  const box = store();
  if (!box) return;
  try {
    box.setItem(
      setupDraftKey(userId),
      JSON.stringify({
        v: SETUP_DRAFT_VERSION,
        at: now,
        base: value.base,
        draft: value.draft,
      }),
    );
  } catch {
    // Quota plein, mode privé: on n'a pas de cache, et c'est tout. Voir `store`.
  }
}

export function clearSetupDraft(userId: string): void {
  if (!userId) return;
  const box = store();
  if (!box) return;
  try {
    box.removeItem(setupDraftKey(userId));
  } catch {
    // Idem — l'échec d'un nettoyage ne casse aucun parcours.
  }
}
