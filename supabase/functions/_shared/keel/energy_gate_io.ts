/**
 * LES QUATRE PORTES, ASSEMBLÉES UNE SEULE FOIS DANS TOUT LE PRODUIT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE, ET IL A ÉTÉ EXTRAIT PLUTÔT QU'ÉCRIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `energy_gate.ts` est PUR: il décide à partir de quatre valeurs. Quelqu'un
 * doit aller les chercher en base, et cette lecture est la moitié dangereuse
 * de la garde — l'ordre des portes est éprouvé, la façon de remplir leurs
 * entrées ne l'était nulle part.
 *
 * `no_calorie_to_student_property_test.ts` assertait, jusqu'au 2026-09-01, que
 * `canShowEnergy` n'avait qu'UN appelant, avec ce message: *« every extra
 * caller is another place the four gates can be assembled wrongly »*. Le
 * chemin PHOTO en avait besoin d'un second (CALORIE_REVERSAL §6, la surface).
 * La réponse à cette propriété n'est pas de l'élargir à deux fonctions edge:
 * c'est de faire descendre l'assemblage ICI, d'où `canShowEnergy` garde son
 * appelant unique et où les deux lanes lisent la MÊME chose.
 *
 * ⛔ CE MODULE NE PRODUIT AUCUN CHIFFRE, ET C'EST LE POINT. La règle du
 * 2026-08-18 (CALORIE_REVERSAL §0, décision de l'utilisateur): *« la garde ne
 * PRODUIT jamais le chiffre — elle ne le supprime pas après coup. L'état se lit
 * AVANT le calcul, jamais entre le calcul et l'écran. »* Un appelant lit donc
 * cette porte AVANT d'appeler son modèle ou son calculateur; il ne filtre rien
 * en sortie, parce qu'il n'y a rien à filtrer.
 *
 * ⚠️ IL JETTE PLUTÔT QUE DE RENDRE UNE PORTE OUVERTE. Fail-closed est la seule
 * direction acceptable ici (même arbitrage que `MealBodyContext.restrictionFlag`,
 * FF-030 R6): se fermer rend le produit d'hier, s'ouvrir met un chiffre sous
 * les yeux de quelqu'un qu'on n'a pas su évaluer. Chaque appelant attrape et
 * se ferme — et un `catch` qui rendrait `{ show: true }` serait le défaut le
 * plus cher du dépôt.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { localDateInZone } from "./local_date.ts";
import { assessBirthDate, type BirthDateVerdict } from "./student_age.ts";
import {
  canShowEnergy,
  countingStanceFrom,
  type EnergyGateResult,
  energySwitchFrom,
  type CountingStance,
  type EnergySwitchSource,
} from "./energy_gate.ts";
import { evaluateRestrictionForStudent } from "./restriction_runtime.ts";
import { loadPublishedDoctrine } from "./doctrine_loader.ts";
import { GOAL_TOKENS } from "./tokens.ts";
import { type ScaleDirection, scaleDirectionOf } from "./weight_pace.ts";

/**
 * ⟳ LOT 4 — UNE COLONNE TRI-ÉTAT, LUE SANS L'ÉCRASER.
 *
 * ── LE PIÈGE EXACT QUE CETTE FONCTION EXISTE POUR FERMER ──────────────────
 * `Boolean(null)` vaut `false`, et `col === true` vaut `false` sur `null`
 * AUSSI. Les deux raccourcis transforment donc « personne n'a choisi » en
 * « la personne a éteint » — c'est-à-dire qu'ils annulent tout le lot 4 sans
 * qu'aucun type ne bronche et sans qu'aucun test de la garde ne rougisse. Ce
 * dépôt a déjà payé exactement ce mode d'échec sur `Number(null) === 0`
 * (`finiteEnergyNumber`, côté client): l'absence devenue une valeur.
 *
 * ⚠️ ET UNE VALEUR INCONNUE REND `false`, PAS `null`. Se fermer coûte un
 * chiffre absent; s'ouvrir met un chiffre sous les yeux de quelqu'un dont on
 * n'a pas su lire le choix. C'est la même direction d'échec que partout ici.
 */
export function readTriState(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  return false;
}

export interface EnergyGateLoad {
  /** Le verdict des quatre portes. C'est la seule chose que la plupart lisent. */
  gate: EnergyGateResult;
  /** Le jour LOCAL de l'élève — résolu ici, jamais en UTC. */
  today: string;
  /** Le verdict d'âge ENTIER, pour que l'appelant n'en redérive pas un second. */
  ageVerdict: BirthDateVerdict;
  /** La direction de sa balance (`null` sur maintenance et sur objectif absent). */
  direction: ScaleDirection | null;
  /** La ligne d'objectif, lue UNE fois et prêtée à l'appelant. */
  goalsRow: Record<string, unknown> | null;
  /**
   * ⟳ LOT F — LA POSITION DU COACH, PRÊTÉE À L'APPELANT. La porte par BOÎTE
   * (`canEmitBoxEnergy`) juge chaque bouche du foyer sous la même doctrine —
   * le coach est celui du foyer — et la redériver là-bas ferait une seconde
   * lecture de la même doctrine.
   */
  coachCounting: CountingStance;
  /**
   * ⟳ LOT F — POURQUOI l'interrupteur d'affichage du lecteur est dans l'état
   * où il est. `explicit_off` et `no_direction` ferment tous deux la porte ④,
   * et ne se traitent pas pareil: le premier est un choix (R7, il gagne sur
   * tout), le second un défaut (il laisse passer les boîtes des bouches à
   * objectif). Sans ce champ, `meal-energy-v1` ne pourrait pas les distinguer.
   */
  switchSource: EnergySwitchSource;
  /**
   * L'état de l'interrupteur de CIBLE.
   *
   * Rendu brut parce que la porte ⑤ (`canShowTarget`) n'appartient qu'à la lane
   * du plan: le chemin photo ne montre aucune cible, et lui faire traverser une
   * porte qu'il n'utilise pas lui donnerait un état à ignorer.
   */
  targetSwitchOn: boolean;
}

/**
 * Lire les quatre entrées, décider une fois.
 *
 * ⚠️ UN SEUL APPEL À `canShowEnergy`, ET C'EST DÉLIBÉRÉ. La version d'origine
 * de ce bloc fermait d'abord sur ① et ② pour s'épargner la lecture de doctrine
 * d'un élève déjà protégé — c'est-à-dire qu'elle appelait la garde DEUX fois,
 * la première avec des valeurs de remplissage pour les portes qu'elle n'avait
 * pas encore lues. Deux points de décision finissent par diverger, et celui-ci
 * porte la garde la plus sensible du produit. Le coût est une requête de
 * doctrine pour un élève qui n'aura pas de chiffre.
 *
 * @param localDate le jour local de l'élève, quand l'appelant le connaît déjà
 *   (un fait photo le porte: `protocol_events.local_date`). Sans lui, le fuseau
 *   du profil est REQUIS — pas de repli sur UTC: à Auckland, l'anniversaire des
 *   18 ans tombe douze heures avant que le serveur ne l'admette, et sans fuseau
 *   on ne sait pas quel jour on est chez la personne, donc on ne sait pas si
 *   elle est mineure, donc on se tait.
 */
export async function loadEnergyGate(
  admin: SupabaseClient,
  args: { userId: string; localDate?: string | null },
): Promise<EnergyGateLoad> {
  const [profileRes, loaded, goalsRes] = await Promise.all([
    admin
      .from("profiles")
      .select("timezone, birth_date, energy_display_enabled, energy_target_enabled")
      .eq("id", args.userId)
      .maybeSingle(),
    loadPublishedDoctrine(admin, args.userId),
    admin
      .from("student_goals")
      .select("goal, target_pace_kg_per_week, practical_constraints")
      .eq("user_id", args.userId)
      .maybeSingle(),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (goalsRes.error) throw goalsRes.error;
  const profile = (profileRes.data ?? null) as Record<string, unknown> | null;
  if (!profile) throw new Error("[keel/energy_gate_io] no profile row");

  const given = String(args.localDate ?? "").trim();
  const timezone = String(profile.timezone ?? "").trim();
  if (!given && !timezone) {
    throw new Error("[keel/energy_gate_io] no local date and no timezone");
  }
  const today = given || localDateInZone(timezone, new Date());

  const floor = await evaluateRestrictionForStudent(admin as never, {
    userId: args.userId,
    asOfLocalDate: today,
  });

  // ③ ON LIT LE JETON, PAS LE CHOIX DE PRÉRÉGLAGE. `readStarterChoices` ne
  // reconnaît une position qu'aux entrées encore marquées `source: "starter"`,
  // et `claimOnEdit` retire cette marque dès que le coach réécrit un mot. Un
  // coach qui a personnalisé son « on ne compte pas ici » aurait donc perdu la
  // porte ③ en la rendant DAVANTAGE sienne.
  const coachCounting = loaded.reason === "load_failed"
    // La lecture a échoué — y compris, peut-être, celle qui dit s'il y a un
    // coach. On suppose qu'il y en a un: c'est la direction qui se tait.
    ? countingStanceFrom({ hasCoach: true, doctrineReadable: false, forbiddenTokens: [] })
    : countingStanceFrom({
      hasCoach: loaded.reason !== "no_coach",
      doctrineReadable: true,
      // `no_published_doctrine` rend `doctrine: null` et c'est exact: un coach
      // qui n'a rien publié n'a pas de position. `empty_doctrine` et
      // `empty_for_goal` rendent la doctrine ENTIÈRE — un interdit n'a pas de
      // portée par objectif, donc le jeton y reste visible.
      forbiddenTokens: (loaded.doctrine?.forbidden ?? []).map((f) => f.token),
    });

  const ageVerdict = assessBirthDate(profile.birth_date, today);

  // ⟳ LOT 4 — LA DIRECTION DE SA BALANCE, RÉDUITE UNE FOIS.
  //
  // ⚠️ ELLE VIENT DE `scaleDirectionOf`, jamais d'une table réécrite ici: la
  // règle des trois directions est écrite une seule fois dans `weight_pace.ts`,
  // et `maintenance` y rend `null` — c'est-à-dire que viser la stabilité
  // n'ouvre RIEN, ce qui est exactement la décision.
  const goalsRow = (goalsRes.data ?? null) as Record<string, unknown> | null;
  const goalToken = String(goalsRow?.goal ?? "").trim();
  const direction = (GOAL_TOKENS as readonly string[]).includes(goalToken)
    ? scaleDirectionOf(goalToken as (typeof GOAL_TOKENS)[number])
    : null;

  // ⟳ LOT F — RÉDUIT UNE FOIS, LU DEUX FOIS (`.on` pour la porte, `.source`
  // pour l'appelant). Deux appels à `energySwitchFrom` seraient deux idées du
  // même interrupteur.
  const displaySwitch = energySwitchFrom({
    stored: readTriState(profile.energy_display_enabled),
    direction,
  });
  const gate = canShowEnergy({
    restrictionFlag: floor.restriction_flag === true,
    ageVerdict,
    coachCounting,
    // ⟳ LOT 4 — LA COLONNE EST UN TRI-ÉTAT, ET ELLE NE SE LIT PLUS `=== true`.
    // `null` veut dire « personne n'a choisi », et c'est alors la direction qui
    // décide. Un `=== true` ici refermerait le chiffre à tous ceux que leur
    // objectif devait ouvrir, en silence.
    //
    // ⛔ ET LA DÉRIVATION N'EST PAS ÉCRITE ICI. `energySwitchFrom` est la seule
    // écriture de la règle; deux `??` posés dans deux fonctions edge
    // divergeraient au premier jeton d'objectif ajouté.
    studentSwitch: displaySwitch.on,
  });

  return {
    gate,
    today,
    ageVerdict,
    direction,
    goalsRow,
    coachCounting,
    switchSource: displaySwitch.source,
    targetSwitchOn: energySwitchFrom({
      stored: readTriState(profile.energy_target_enabled),
      direction,
    }).on,
  };
}
