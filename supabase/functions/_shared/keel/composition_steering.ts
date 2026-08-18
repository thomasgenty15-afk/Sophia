/**
 * FF-041 — LE PILOTAGE DE COMPOSITION : la méthode du coach, rendue exécutable.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-041-la-methode-du-coach-executable.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §3, arbitrages A1 et A2.
 *
 * ── CE FICHIER EST LA FORME COMPILÉE, JAMAIS UN FORMULAIRE ───────────────
 * §3.0 du design: le coach ne voit JAMAIS un axe du moteur. Sa surface est sa
 * doctrine — une question posée comme un débat du point de départ, dans son
 * langage. Ce qui suit en est DÉRIVÉ à la publication, exactement comme
 * `compileDoctrineBlock` dérive le bloc chat de ses convictions.
 *
 * Si quelqu'un se met un jour à afficher `satiety_density` sur un écran coach,
 * la ligne a été franchie.
 *
 * ── LES DÉCISIONS SONT DANS LE TYPE, PAS DANS DES `if` ───────────────────
 * `deficit_style` n'a pas de token `"aggressive"` (A1). Ce n'est pas une
 * validation qui le rejette: c'est une valeur qui n'existe pas. Un `if` se
 * retire un jour « pour un cas particulier »; un type se casse. L'asymétrie
 * avec `surplus_style`, qui a le sien, EST la forme que prend l'arbitrage.
 *
 * ── `off` RETIRE L'ARBITRE, JAMAIS L'INSTRUMENT ─────────────────────────
 * Un coach éteint des VERDICTS, pas le calcul interne ni les planchers. Le
 * moteur continue de mesurer et d'écrire; il cesse seulement de corriger sur
 * cette grandeur. Mesure ≠ pilotage.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { type GoalToken, GOAL_TOKENS } from "./tokens.ts";
import type { Envelope } from "./meal_envelope.ts";

// ---------------------------------------------------------------------------
// LE VOCABULAIRE
// ---------------------------------------------------------------------------

export const STEERING_AXES = [
  "protein",
  "energy",
  "proportions",
  "satiety_density",
  "micro_coverage",
  "carb_timing",
  "plant_diversity",
] as const;
export type SteeringAxis = (typeof STEERING_AXES)[number];

/**
 * L'AXE QU'AUCUNE DOCTRINE NE PEUT ÉTEINDRE.
 *
 * La protéine est la grandeur au fondement le plus solide du corpus (Morton
 * 2018, Helms 2014, Moore 2015). Une version antérieure du design la rendait
 * extinguible pendant que `plant_diversity` — dont la preuve est faible —
 * restait exposée. Elle est réordonnable, jamais éteignable.
 */
export const UNEXTINGUISHABLE_AXIS: SteeringAxis = "protein";

/**
 * L'AXE QUI N'EXISTE QUE POUR UNE DYNAMIQUE.
 *
 * `carb_timing` (Impey 2018) est inerte sans jours d'entraînement déclarés.
 * Posé ailleurs, il est rejeté, COMPTÉ, et dit à l'écran coach — pas nettoyé
 * en silence: un coach doit savoir que sa position n'a pas pris.
 *
 * ⚠️ IL A CHANGÉ DE DYNAMIQUE LE 2026-08-18, ET IL FALLAIT CHOISIR. Il visait
 * `performance`, qui n'existe plus: les quatre nuances du « ni l'un ni
 * l'autre » se replient sur `maintenance`. Le repli MÉCANIQUE aurait donc posé
 * le timing des glucides sur la dynamique de qui ne veut rien changer — c'est
 * la seule des trois qui, par définition, ne s'entraîne pas forcément.
 * `muscle_gain` est la dynamique qui reste et qui suppose un entraînement, et
 * c'est chez elle que la position d'un coach sur le timing a un sujet.
 */
export const CARB_TIMING_GOAL: GoalToken = "muscle_gain";

export interface SteeringProportions {
  protein_share: "standard" | "high";
  carb_share: "low" | "standard" | "high";
  fat_share: "low" | "standard" | "high";
}

/**
 * UNE ENTRÉE DE PILOTAGE — la forme compilée d'une position du coach.
 *
 * Chaque champ porte sa décision:
 *   - `deficit_style` n'a PAS de `"aggressive"` (A1, non débrayable);
 *   - `surplus_style` en a un — c'est le véhicule qu'exige Helms 2023, et
 *     l'asymétrie encode l'asymétrie de la preuve;
 *   - `maintenance_weeks` et `recalibration` sont des OPINIONS de la maison,
 *     donc débrayables, donc des champs nommés plutôt que des planchers
 *     déguisés.
 */
export interface SteeringEntry {
  /** `null` = toute la cohorte. Sinon, la dynamique visée. */
  goal_scope: GoalToken | null;
  /** Ordre imposé, dédupliqué. Le premier est la grandeur primaire. */
  priorities: SteeringAxis[];
  /** `"protein"` y est ILLÉGAL. */
  off: SteeringAxis[];
  /** La posture citable, dans le bloc chat. `null` = le moteur exécute, le chat se tait. */
  belief_key: string | null;
  /** Renseigné SSI `proportions` est prioritaire. */
  proportions: SteeringProportions | null;
  protein_range: "standard" | "high" | "very_high";
  /** `muscle_gain` seulement. */
  surplus_style: "lean" | "standard" | "aggressive";
  /** PAS de token agressif — A1, et c'est le TYPE qui le dit. */
  deficit_style: "gentle" | "standard";
  maintenance_weeks: "auto" | "off";
  recalibration: "observed_trend" | "static";
  carb_timing: "off" | "around_sessions";
}

const DEFAULT_ENTRY: Omit<SteeringEntry, "goal_scope" | "priorities" | "off" | "belief_key"> = {
  proportions: null,
  protein_range: "standard",
  surplus_style: "standard",
  deficit_style: "standard",
  maintenance_weeks: "auto",
  recalibration: "observed_trend",
  carb_timing: "off",
};

// ---------------------------------------------------------------------------
// LE PARSE — strict, et bruyant
// ---------------------------------------------------------------------------

export interface ParsedSteering {
  entries: SteeringEntry[];
  /**
   * Ce qui a été écarté, et pourquoi. **Montré à l'écran coach.**
   *
   * Un repli silencieux ferait croire à un coach que sa méthode gouverne alors
   * qu'elle n'a pas été lue — c'est exactement le défaut que `coach_food_rules`
   * a produit dans ce dépôt: un écran, des gardes, trente tests, et aucun
   * lecteur au runtime.
   */
  issues: string[];
}

function pick<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = String(raw ?? "").trim();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function axes(raw: unknown): SteeringAxis[] {
  if (!Array.isArray(raw)) return [];
  const out: SteeringAxis[] = [];
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (!(STEERING_AXES as readonly string[]).includes(s)) continue;
    if (out.includes(s as SteeringAxis)) continue; // dédupliqué, ordre gardé
    out.push(s as SteeringAxis);
  }
  return out;
}

/**
 * `composition_steering`, lu depuis le jsonb de la doctrine publiée.
 *
 * ── STRICT SUR LE SENS, TOLÉRANT SUR LA FORME ────────────────────────────
 * Une clé inconnue est ignorée; une VALEUR hors liste retombe sur le défaut ET
 * est comptée. La différence compte: la première est du bruit de sérialisation,
 * la seconde est une position du coach qui n'a pas pris.
 */
export function parseCompositionSteering(raw: unknown): ParsedSteering {
  const issues: string[] = [];
  if (raw === null || raw === undefined) return { entries: [], issues };
  if (!Array.isArray(raw)) {
    issues.push("composition_steering: not an array, ignored");
    return { entries: [], issues };
  }

  const entries: SteeringEntry[] = [];
  const seenScopes = new Set<string>();
  for (const [i, item] of raw.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push(`composition_steering[${i}]: not an object, dropped`);
      continue;
    }
    const e = item as Record<string, unknown>;

    const scopeRaw = String(e.goal_scope ?? "").trim();
    const goal_scope = (GOAL_TOKENS as readonly string[]).includes(scopeRaw)
      ? (scopeRaw as GoalToken)
      : null;
    if (scopeRaw && goal_scope === null) {
      issues.push(`composition_steering[${i}]: unknown goal_scope ${JSON.stringify(scopeRaw)}, treated as all goals`);
    }

    // ── UNE SEULE ENTRÉE PAR PORTÉE ─────────────────────────────────────
    // Deux entrées sur la même dynamique, c'est deux méthodes: le moteur
    // trancherait à la place du coach.
    const scopeKey = goal_scope ?? "*";
    if (seenScopes.has(scopeKey)) {
      issues.push(`composition_steering[${i}]: a second entry for '${scopeKey}', dropped`);
      continue;
    }

    const off = axes(e.off);
    // ── LA PROTÉINE NE S'ÉTEINT PAS ─────────────────────────────────────
    // Bruyant, et l'entrée ENTIÈRE tombe. La nettoyer silencieusement
    // (retirer `protein` de `off` et garder le reste) publierait une méthode
    // que le coach n'a pas écrite.
    if (off.includes(UNEXTINGUISHABLE_AXIS)) {
      issues.push(
        `composition_steering[${i}]: '${UNEXTINGUISHABLE_AXIS}' cannot be switched off, entry dropped`,
      );
      continue;
    }

    const priorities = axes(e.priorities).filter((a) => !off.includes(a));
    const carbTiming = pick(e.carb_timing, ["off", "around_sessions"] as const, "off");
    let carb_timing = carbTiming;
    if (carbTiming === "around_sessions" && goal_scope !== CARB_TIMING_GOAL) {
      // REJETÉ, COMPTÉ, DIT À L'ÉCRAN. Pas nettoyé en silence.
      issues.push(
        `composition_steering[${i}]: carb_timing only applies to '${CARB_TIMING_GOAL}', ignored`,
      );
      carb_timing = "off";
    }

    const wantsProportions = priorities.includes("proportions");
    const proportionsRaw = (e.proportions ?? null) as Record<string, unknown> | null;
    let proportions: SteeringProportions | null = null;
    if (wantsProportions) {
      if (!proportionsRaw || typeof proportionsRaw !== "object") {
        issues.push(
          `composition_steering[${i}]: 'proportions' is a priority but no template was given, ignored`,
        );
      } else {
        proportions = {
          protein_share: pick(proportionsRaw.protein_share, ["standard", "high"] as const, "standard"),
          carb_share: pick(proportionsRaw.carb_share, ["low", "standard", "high"] as const, "standard"),
          fat_share: pick(proportionsRaw.fat_share, ["low", "standard", "high"] as const, "standard"),
        };
      }
    }

    seenScopes.add(scopeKey);
    entries.push({
      ...DEFAULT_ENTRY,
      goal_scope,
      priorities,
      off,
      belief_key: String(e.belief_key ?? "").trim() || null,
      proportions,
      protein_range: pick(e.protein_range, ["standard", "high", "very_high"] as const, "standard"),
      surplus_style: pick(e.surplus_style, ["lean", "standard", "aggressive"] as const, "standard"),
      // ── A1, DANS LA LECTURE AUSSI ─────────────────────────────────────
      // La liste ne contient pas `"aggressive"`, donc une doctrine qui
      // l'aurait posé retombe sur `standard` — et c'est COMPTÉ juste après.
      deficit_style: pick(e.deficit_style, ["gentle", "standard"] as const, "standard"),
      maintenance_weeks: pick(e.maintenance_weeks, ["auto", "off"] as const, "auto"),
      recalibration: pick(e.recalibration, ["observed_trend", "static"] as const, "observed_trend"),
      carb_timing,
    });
    if (String(e.deficit_style ?? "").trim() === "aggressive") {
      issues.push(
        `composition_steering[${i}]: there is no aggressive deficit in this product; ` +
          "read as 'standard'",
      );
    }
  }
  return { entries, issues };
}

/** L'entrée qui gouverne cet élève, ou `null`. La portée précise gagne. */
export function steeringFor(
  entries: readonly SteeringEntry[],
  goal: GoalToken,
): SteeringEntry | null {
  return entries.find((e) => e.goal_scope === goal) ??
    entries.find((e) => e.goal_scope === null) ??
    null;
}

/** Les axes que cette doctrine a éteints, pour la boucle de correction. */
export function offAxesFor(entry: SteeringEntry | null): SteeringAxis[] {
  return entry ? [...entry.off] : [];
}

// ---------------------------------------------------------------------------
// L'APPLICATION — écrêtée sous flag, jamais reroutée
// ---------------------------------------------------------------------------

/**
 * Le pilotage appliqué à une enveloppe.
 *
 * ── SOUS FLAG: ÉCRÊTAGE, ET LA DÉGRADATION VIT ICI ───────────────────────
 * Une enveloppe `per_portion` ne porte structurellement ni énergie ni plafond
 * de densité: les axes `energy` et `proportions` n'ont donc RIEN à piloter, et
 * `satiety_density` est désarmée par construction. Le reste survit tel quel.
 *
 * Le flag n'a pas à CHOISIR la grandeur de remplacement d'un coach qui ne l'a
 * pas demandée — c'est la différence entre écrêter et rerouter, et c'est un
 * défaut fatal qu'un des designs candidats portait.
 *
 * La dégradation vit dans cette fonction PURE, jamais chez l'appelant: une
 * garde qu'un appelant applique est une garde que le prochain appelant oublie.
 *
 * ── `restrictionFlag` EST REQUIS ─────────────────────────────────────────
 * Même si l'enveloppe le porte déjà implicitement (`per_portion`). Il est
 * passé séparément pour que la lane foyer — qui n'a pas de corps — puisse le
 * fournir, et pour qu'un appelant ne puisse pas l'oublier.
 */
export function applyPiloting(
  steering: SteeringEntry | null,
  envelope: Envelope,
  restrictionFlag: boolean,
): Envelope {
  if (envelope.mode === "per_portion") {
    // Rien à écrêter: le type ne porte aucun champ pilotable. On rend
    // l'enveloppe TELLE QUELLE — reconstruire un objet ici ferait diverger
    // l'empreinte d'indiscernabilité pour la moitié de la population.
    return envelope;
  }
  // Fail-closed: un appelant qui passerait `true` avec une enveloppe `per_kg`
  // s'est trompé quelque part, et la bonne réponse est la dégradation, pas la
  // confiance.
  if (restrictionFlag) {
    return { mode: "per_portion", proteinPortionPerMeal: true };
  }
  if (!steering) return envelope;

  let next: Envelope = { ...envelope };

  // ── LE PLANCHER PROTÉIQUE SE HAUSSE, JAMAIS NE BAISSE ──────────────────
  // `protein_range` est un jeton de coach; il ne peut pas descendre sous le
  // plancher de la dynamique, qui est une ceinture produit.
  const proteinBoost = { standard: 1.0, high: 1.15, very_high: 1.3 }[
    steering.protein_range
  ];
  next = {
    ...next,
    proteinFloorG: Math.round(next.proteinFloorG * Math.max(1, proteinBoost)),
  };

  // ── L'ÉNERGIE ──────────────────────────────────────────────────────────
  // `deficit_style: "gentle"` REMONTE le bas de bande (moins de déficit).
  // Rien ne peut le descendre: le plafond de 500 kcal/j est déjà appliqué par
  // `envelopeFor`, et aucun jeton n'existe pour l'outrepasser (A1).
  if (next.energy && steering.deficit_style === "gentle" && next.energy.low < next.energy.high) {
    const span = next.energy.high - next.energy.low;
    next = {
      ...next,
      energy: { low: Math.round(next.energy.low + span / 2), high: next.energy.high },
    };
  }
  // `surplus_style` ne touche que le HAUT de bande, et seulement vers le haut.
  if (next.energy && steering.surplus_style === "aggressive") {
    next = { ...next, energy: { low: next.energy.low, high: Math.round(next.energy.high * 1.05) } };
  }
  if (next.energy && steering.surplus_style === "lean") {
    next = {
      ...next,
      energy: {
        low: next.energy.low,
        high: Math.max(next.energy.low, Math.round(next.energy.high * 0.97)),
      },
    };
  }

  // ── LES AXES ÉTEINTS ───────────────────────────────────────────────────
  // `off` retire l'ARBITRE: le champ disparaît de l'enveloppe, donc plus aucun
  // verdict ne s'en sert. Le CALCUL, lui, continue — `meal_verdict.ts` mesure
  // toujours, et la mesure est toujours écrite.
  if (steering.off.includes("energy")) next = { ...next, energy: null };
  if (steering.off.includes("satiety_density")) next = { ...next, densityCeiling: null };

  return next;
}

// ---------------------------------------------------------------------------
// L'ACCENT — `steeredFocus` ENVELOPPE `focusFor`, sans jamais le toucher
// ---------------------------------------------------------------------------

/**
 * L'accent de composition, réordonné par le pilotage du coach.
 *
 * ── POURQUOI UNE ENVELOPPE ET PAS UNE MODIFICATION DE `focusFor` ─────────
 * `focusFor` (`week_plan_generation.ts`) sert la lane HEBDO, elle y est testée,
 * et son `switch` exhaustif est une garantie de ce fichier-là. La modifier
 * ferait porter à la lane hebdo le risque d'une régression de composition —
 * c'est le patron `weekEmphasis` de `student_body.ts`, et il existe pour ça.
 *
 * ── LA CONDITION DE DÉSARMEMENT EST UNE ÉGALITÉ DE CHAÎNES ───────────────
 * Sans pilotage, cette fonction rend l'accent de `focusFor` **au caractère
 * près**. Pas « à peu près le même », pas « le même plus un espace »: le même.
 * C'est ce que le test vérifie, et c'est ce qui rend le lot additif.
 *
 * ── CE QU'ELLE AJOUTE EST UNE PHRASE, JAMAIS UN CHIFFRE ─────────────────
 * Le pilotage se dit en façon de composer. `DIET_REGISTER_LEXICON` est passé
 * sur cette table par le test de FF-040.
 */
const AXIS_EMPHASIS: Partial<Record<SteeringAxis, string>> = {
  protein: "a protein food anchoring every main meal",
  proportions: "plates built around protein and vegetables, with starch as a side",
  satiety_density: "volume from vegetables, so a plate stays filling without being heavy",
  micro_coverage: "variety across the week, so the usual groups all show up",
  plant_diversity: "a wide range of plants across the week",
  carb_timing: "starch placed around training days",
  // `energy` n'a PAS d'accent, et c'est délibéré: la direction d'énergie
  // s'exprime dans les JETONS de correction (« portions généreuses », « les
  // légumes portent le volume »), jamais dans un accent permanent. Un accent
  // d'énergie serait exactement l'endroit où le registre du régime rentrerait.
};

/**
 * @param base l'accent rendu par `focusFor(goal).emphasis`, tel quel.
 */
export function steeredFocus(
  base: string,
  steering: SteeringEntry | null,
): string {
  if (!steering) return base;
  const primary = steering.priorities[0];
  if (!primary) return base;
  const addition = AXIS_EMPHASIS[primary];
  if (!addition) return base;
  return `${base}; above all, ${addition}`;
}
