/**
 * LA LISTE DES PLATS REFUSÉS — 2026-09-24. Module PUR, aucune I/O (l'écriture
 * est `rejected_dishes_io.ts`, la lecture passe par la ligne `student_goals`
 * déjà chargée par la lane).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE BESOIN
 * ══════════════════════════════════════════════════════════════════════════
 * Sur l'aperçu d'un plan, « Remplacer » barre un plat avec une raison écrite.
 * Décision du propriétaire (2026-09-24): le plat entre dans une liste, rangée
 * avec LES PERSONNES QUI LE MANGEAIENT, visible et effaçable dans « Ce que
 * Sophia sait », et le générateur ne doit plus le reproposer à ces personnes.
 *
 * ⛔ CE N'EST PAS UNE PRÉFÉRENCE. Une préférence est (personne, ALIMENT ou
 * PRÉPARATION) — `NOMENCLATURE-MEMOIRE.md` §2. Un titre de plat n'en est pas
 * une, et ce module ne touche ni `retained_items` ni la ceinture d'exclusion:
 * ce que la RAISON dit d'un aliment (« Paul n'aime pas les champignons ») est
 * classé à part, par la lecture de note.
 *
 * ⛔ AUCUN MATCHER ICI. Deux plats sont « le même » quand leurs titres ont la
 * même CLÉ (`dishTitleKey`: NFC, espaces repliés, minuscules) — une égalité,
 * jamais une ressemblance. Un plat renommé ou retouché n'est pas reconnu par
 * le code: c'est la consigne qui demande au modèle de ne pas le resservir, et
 * `rejectedServedAgain` ne compte que les retours à l'identique.
 *
 * ── LA FORME EN BASE (`practical_constraints.rejected_dishes`) ────────────
 *   { key, title, name, household, member_ids, reason, at, draft_id }
 * La fusion (une entrée par clé, personnes réunies, 200 au plus) est en SQL:
 * `keel_rejected_dishes_merge`, migration `20260924120000`.
 */

import { DAY_TOKENS } from "./tokens.ts";

/** La clé de `student_goals.practical_constraints`. */
export const REJECTED_DISHES_KEY = "rejected_dishes";

/** Entrées gardées en base (miroir du `limit 200` de la fusion SQL). */
export const REJECTED_DISHES_MAX = 200;

/** Entrées données au modèle, les plus récentes d'abord. */
export const REJECTED_DISHES_PROMPT_MAX = 60;

/** Signes d'une raison (même plafond qu'une note de brouillon). */
export const REJECTED_REASON_MAX_CHARS = 280;

/**
 * LA CLÉ D'UN TITRE — ce qui fait que deux plats sont « le même repas ».
 * NFC, espaces repliés, minuscules. Les ACCENTS RESTENT: « pâtes » n'est pas
 * « pâté » (cicatrice `accent-is-the-discriminant-pates-vs-pate`).
 * ⚠️ Même règle que `dishTitleKey` de `frontend/src/keel/api/planDraft.ts`.
 */
export function dishTitleKey(title: string): string {
  return String(title ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export interface RejectedDish {
  key: string;
  /** Le titre tel que la carte l'affichait (la liste des ingrédients). */
  title: string;
  /** Le nom d'usage du plat, quand le modèle en avait donné un. */
  name: string | null;
  /** Vrai = tous les mangeurs du foyer le mangeaient; `memberIds` est alors vide. */
  household: boolean;
  memberIds: string[];
  /** Les mots de la personne. `null` sur une entrée d'une autre forme. */
  reason: string | null;
  /** `YYYY-MM-DD`, le jour du refus. */
  at: string;
  draftId: string | null;
}

/**
 * LA LISTE, LUE DE `practical_constraints`. Défensive dans une seule
 * direction: une entrée illisible tombe SEULE, jamais la liste.
 */
export function readRejectedDishes(practicalConstraints: unknown): RejectedDish[] {
  const pc = practicalConstraints && typeof practicalConstraints === "object"
    ? practicalConstraints as Record<string, unknown>
    : {};
  const raw = pc[REJECTED_DISHES_KEY];
  if (!Array.isArray(raw)) return [];
  const out: RejectedDish[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === "string" ? e.title.trim() : "";
    const key = typeof e.key === "string" && e.key.trim() !== "" ? e.key.trim() : dishTitleKey(title);
    if (key === "" || title === "") continue;
    const household = e.household === true;
    const memberIds = household || !Array.isArray(e.member_ids)
      ? []
      : e.member_ids.filter((m): m is string => typeof m === "string" && m.trim() !== "")
        .map((m) => m.trim());
    // Une entrée qui ne vise personne ne vise rien: elle ne peut pas atteindre
    // la consigne sans devenir « tout le foyer », ce qu'elle n'a pas dit.
    if (!household && memberIds.length === 0) continue;
    out.push({
      key,
      title,
      name: typeof e.name === "string" && e.name.trim() !== "" ? e.name.trim() : null,
      household,
      memberIds,
      reason: typeof e.reason === "string" && e.reason.trim() !== "" ? e.reason.trim() : null,
      at: typeof e.at === "string" ? e.at : "",
      draftId: typeof e.draft_id === "string" && e.draft_id !== "" ? e.draft_id : null,
    });
  }
  return out;
}

/** Un plat barré, résolu sur le brouillon: son titre, sa raison, qui le mangeait. */
export interface RejectionToFile {
  title: string;
  name: string | null;
  reason: string;
  /** Les bouches servies par ce plat, TOUTES occurrences réunies. */
  eaterIds: readonly string[];
}

/**
 * LES ENTRÉES À ÉCRIRE — une par titre, au format de la base.
 *
 * `household` = les mangeurs couvrent TOUT le foyer (un plat de table mangé
 * par tous). Sinon, la liste des mangeurs, triée. Un plat dont on ne connaît
 * aucun mangeur est rangé pour tout le foyer: il était servi, et « personne »
 * rendrait l'entrée inerte.
 */
export function rejectedEntriesFrom(args: {
  rejections: readonly RejectionToFile[];
  householdMemberIds: readonly string[];
  at: string;
  draftId: string | null;
}): Record<string, unknown>[] {
  const everyone = new Set(args.householdMemberIds);
  const byKey = new Map<string, Record<string, unknown>>();
  for (const r of args.rejections) {
    const title = r.title.trim();
    const key = dishTitleKey(title);
    if (key === "") continue;
    const eaters = [...new Set(r.eaterIds.filter((id) => id !== ""))].sort();
    const household = eaters.length === 0 ||
      (everyone.size > 0 && [...everyone].every((id) => eaters.includes(id)));
    byKey.set(key, {
      key,
      title,
      name: r.name,
      household,
      member_ids: household ? [] : eaters,
      reason: r.reason.trim().slice(0, REJECTED_REASON_MAX_CHARS),
      at: args.at,
      draft_id: args.draftId,
    });
  }
  return [...byKey.values()];
}

/**
 * LA LIGNE DE LA CONSIGNE — ou `null` quand rien ne s'applique (la consigne
 * reste alors identique à l'octet près à celle d'avant ce lot).
 *
 * ⛔ LA PROMESSE TOUCHE LA LISTE: « never serve these again » est la ligne
 * qui la précède immédiatement — une consigne éloignée de ce qu'elle gouverne
 * ne mord pas (mesuré à 0 %, `promise-and-schema-key-must-be-adjacent`).
 *
 * Les personnes sorties du foyer sont retirées d'une entrée; une entrée qui
 * n'a plus personne tombe. Les prénoms viennent du roster, jamais de l'entrée.
 */
export function rejectedDishesLine(args: {
  entries: readonly RejectedDish[];
  roster: readonly { memberId: string; name: string }[];
  max?: number;
}): string | null {
  const names = new Map(args.roster.map((m) => [m.memberId, m.name]));
  const lines: string[] = [];
  for (const entry of args.entries) {
    if (lines.length >= (args.max ?? REJECTED_DISHES_PROMPT_MAX)) break;
    let who: string;
    if (entry.household) {
      who = "everyone";
    } else {
      const present = entry.memberIds.map((id) => names.get(id)).filter((n): n is string => !!n);
      if (present.length === 0) continue;
      who = present.join(", ");
    }
    const label = entry.name ? `«${entry.title}» («${entry.name}»)` : `«${entry.title}»`;
    const reason = entry.reason ? ` — they said: «${entry.reason.replace(/[«»]/g, '"')}»` : "";
    lines.push(`- ${label} — for ${who}${reason}`);
  }
  if (lines.length === 0) return null;
  return [
    "DISHES THEY TURNED DOWN — never serve these dishes again to the people named, not even renamed or " +
    "barely changed (another recipe with the same main foods is the same dish):",
    ...lines,
  ].join("\n");
}

/**
 * LE COMPTEUR — combien de plats du plan produit portent, À L'IDENTIQUE, le
 * titre d'un plat refusé et le servent à quelqu'un que l'entrée vise.
 *
 * ⚠️ UN PLANCHER, PAS UNE MESURE COMPLÈTE: un plat refusé revenu sous un autre
 * titre n'est pas vu (aucun matcher). `0` veut dire « pas revenu à
 * l'identique », rien de plus.
 */
export function rejectedServedAgain(args: {
  entries: readonly RejectedDish[];
  dishes: readonly { title: string; eaterIds: readonly string[] }[];
}): number {
  const byKey = new Map(args.entries.map((e) => [e.key, e]));
  let served = 0;
  for (const dish of args.dishes) {
    const entry = byKey.get(dishTitleKey(dish.title));
    if (!entry) continue;
    if (entry.household || dish.eaterIds.some((id) => entry.memberIds.includes(id))) served++;
  }
  return served;
}

// ═══════════════════════════════════════════════════════════════════════════
// LES PLATS BARRÉS, TELS QUE L'ÉCRAN LES ENVOIE — et leur résolution sur le
// brouillon rangé. Partagés par `keel-read-note-v1` (qui range la liste) et le
// générateur (qui refait les plats): deux lectures du même geste divergeraient.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE PLAFOND D'UN REMPLACEMENT, EN OCCURRENCES. Au-delà, ce n'est plus refaire
 * des plats: c'est recomposer le plan en le faisant passer pour une retouche.
 * ⚠️ Même valeur que `DISH_REPLACE_MAX` côté écran (`api/planDraft.ts`).
 */
export const DISH_REJECTIONS_MAX = 24;

/** Une occurrence d'un plat barré: sa case, pour qui, son titre, la raison. */
export interface DishRejectionTarget {
  day: string;
  slot: string;
  /** `null` = le plat de la table. */
  memberId: string | null;
  title: string;
  reason: string;
}

export interface DishRejectionReading {
  targets: DishRejectionTarget[];
  refused: { malformed: number; duplicate: number; tooMany: number };
}

/**
 * LE CORPS DE LA REQUÊTE, LU. Défensif dans une seule direction: une
 * occurrence illisible tombe SEULE et se compte; jamais un repli.
 */
export function readDishRejections(raw: unknown): DishRejectionReading {
  const refused = { malformed: 0, duplicate: 0, tooMany: 0 };
  const targets: DishRejectionTarget[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!row || typeof row !== "object") {
      refused.malformed++;
      continue;
    }
    const r = row as Record<string, unknown>;
    const day = String(r.day ?? "").trim().toLowerCase();
    const slot = String(r.slot ?? "").trim().toLowerCase();
    const memberId = typeof r.member_id === "string" && r.member_id.trim() !== ""
      ? r.member_id.trim()
      : null;
    const title = typeof r.title === "string" ? r.title.trim() : "";
    const reason = typeof r.reason === "string" ? r.reason.trim().replace(/\s+/g, " ") : "";
    if (
      !(DAY_TOKENS as readonly string[]).includes(day) || slot === "" || title === "" ||
      reason === "" || reason.length > REJECTED_REASON_MAX_CHARS
    ) {
      refused.malformed++;
      continue;
    }
    const key = `${day}/${slot}/${memberId ?? ""}`;
    if (seen.has(key)) {
      refused.duplicate++;
      continue;
    }
    if (targets.length >= DISH_REJECTIONS_MAX) {
      refused.tooMany++;
      continue;
    }
    seen.add(key);
    targets.push({ day, slot, memberId, title, reason });
  }
  return { targets, refused };
}

/** Un plat du brouillon rangé (`source_meal.dishes[]`), réduit à ce qui sert ici. */
export interface StoredDishForRejection {
  day?: string | null;
  slot?: string | null;
  memberId?: string | null;
  title?: string;
  name?: string | null;
  complementsShared?: boolean;
  boxes?: readonly { memberIds?: readonly string[] | null }[] | null;
}

/**
 * LES PLATS BARRÉS, RETROUVÉS SUR LE BROUILLON — un par TITRE, avec toutes les
 * bouches servies par ses occurrences (les boîtes du brouillon, jamais ce que
 * dit l'écran). Retrouvé = même case, même bouche, même clé de titre; un
 * complément n'est jamais retrouvé.
 */
export function resolveRejections(args: {
  dishes: readonly StoredDishForRejection[];
  targets: readonly DishRejectionTarget[];
}): { toFile: RejectionToFile[]; resolved: number; unknown: number } {
  const byKey = new Map<string, { title: string; name: string | null; reason: string; eaters: Set<string> }>();
  let resolved = 0;
  let unknown = 0;
  for (const target of args.targets) {
    const hit = args.dishes.find((d) =>
      d.complementsShared !== true &&
      (d.day ?? null) === target.day &&
      (d.slot ?? null) === target.slot &&
      (d.memberId ?? null) === target.memberId &&
      dishTitleKey(String(d.title ?? "")) === dishTitleKey(target.title)
    );
    if (!hit) {
      unknown++;
      continue;
    }
    resolved++;
    const key = dishTitleKey(String(hit.title ?? ""));
    const entry = byKey.get(key) ?? {
      title: String(hit.title ?? "").trim(),
      name: typeof hit.name === "string" && hit.name.trim() !== "" ? hit.name.trim() : null,
      reason: target.reason,
      eaters: new Set<string>(),
    };
    const boxed = (hit.boxes ?? []).flatMap((b) => (b?.memberIds ?? []).filter((m) => m !== ""));
    for (const m of boxed) entry.eaters.add(m);
    if (boxed.length === 0 && hit.memberId) entry.eaters.add(hit.memberId);
    byKey.set(key, entry);
  }
  return {
    toFile: [...byKey.values()].map((e) => ({
      title: e.title,
      name: e.name,
      reason: e.reason,
      eaterIds: [...e.eaters].sort(),
    })),
    resolved,
    unknown,
  };
}
