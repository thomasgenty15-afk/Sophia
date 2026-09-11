#!/usr/bin/env python3
# LOT F — MOITIÉ SERVEUR. À exécuter UNE fois la lane `supabase/functions/` libre.
# Chaque `sub` exige exactement UNE occurrence: un anchor qui a bougé lève.
import io,re,sys
def patch(path, subs):
    s=io.open(path,encoding='utf-8').read()
    for old,new,label in subs:
        n=s.count(old); assert n==1, f"{path} · {label}: {n} occurrence(s)"
        s=s.replace(old,new)
    io.open(path,'w',encoding='utf-8').write(s); print("ok ·",path)

# ── ① energy_gate.ts : la porte d'ÉMISSION PAR BOÎTE, sous la ceinture de la BOUCHE ──
patch("supabase/functions/_shared/keel/energy_gate.ts", [(
"""  if (!args.reader.show) return { emit: false, reason: args.reader.reason };
  if (!args.mouthIsReader) return { emit: false, reason: "other_mouth" };
  return { emit: true, reason: "open" };
}""",
"""  if (!args.reader.show) return { emit: false, reason: args.reader.reason };
  if (!args.mouthIsReader) return { emit: false, reason: "other_mouth" };
  return { emit: true, reason: "open" };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LOT F (2026-09-04) — LE KCAL D'UNE BOÎTE À UN NOM, SOUS LA CEINTURE DE
// **CETTE** BOUCHE — et plus sous celle du lecteur.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LA DÉCISION, MOT POUR MOT ────────────────────────────────────────────
// « C'est affiché pour les personnes qui ont l'objectif de prendre ou perdre
// du poids. Si le maître est la femme et que c'est le mari qui veut perdre du
// poids, alors ça affiche le nombre de calories sur le compte du maître. Dès
// qu'il y a un objectif de perte ou gain de poids c'est affiché, peu importe
// qui regarde. » (2026-09-04)
//
// ── CE QU'ELLE RENVERSE, ET COMMENT ON RÉPOND À CHACUNE DES TROIS RAISONS ─
// `canEmitMouthEnergy` (au-dessus) dit NON à la question §11 n°4: un chiffre ne
// sort que pour la bouche qui le demande. Ses trois raisons étaient justes le
// jour où elles ont été écrites, et cette porte-ci répond à chacune plutôt que
// de retourner un booléen:
//
//   1. « Les cinq états sont clés sur auth.users, pas sur member_id. » — Cette
//      porte NE LIT PAS la ceinture du lecteur. Elle prend la chaîne de
//      sécurité ①②③ **de la bouche** (`energySafetyGates`, avec SON âge lu sur
//      `household_members.birth_date`, SON plancher quand elle a un compte, la
//      doctrine du foyer) et SON interrupteur ④ (`energySwitchFrom` avec SA
//      direction, lue sur `household_members.goal`). Le chiffre sort sous la
//      ceinture de celui qu'il concerne.
//   2. « Une bouche sans compte ne peut rien éteindre. » — Vrai, et assumé par
//      la décision: le maître qui a ouvert le foyer peut retirer l'objectif de
//      la bouche, et c'est ce qui éteint. La bouche n'est pas nommée à côté
//      d'un corps: le kcal d'une boîte est une QUANTITÉ DU PLAN
//      (`plan_quantities`), au prorata de ses grammes — jamais un poids, une
//      taille ou un besoin.
//   3. « Ce qui touche le corps est à soi. » — Le corps reste à soi. Ce qui
//      sort est ce que pèse une boîte de nourriture, pas ce que pèse quelqu'un.
//
// ⛔ CE QUE CETTE PORTE NE FAIT PAS. Elle ne touche PAS `canEmitMouthEnergy`,
// qui reste la règle du CONSEIL DU MIDI (`eatingOutAdvice`, C9): un conseil
// est une consigne adressée à quelqu'un, et il ne s'adresse qu'à qui le
// demande. Un kcal sur un couvercle n'est pas une consigne.
//
// ⛔ LE PLANCHER, L'ÂGE ET LE COACH FERMENT TOUJOURS, pour cette bouche-là. Un
// mineur du foyer n'a JAMAIS de kcal sur sa boîte, objectif ou pas; une bouche
// sans date de naissance non plus (`age_unknown`, fail-closed).
//
// ⚠️ LE LECTEUR GARDE UN DROIT: le sien. Voir `meal-energy-v1`: si le lecteur
// a EXPLICITEMENT éteint son chiffre (`explicit_off`), rien ne sort sur son
// écran, boîtes des autres comprises — R7, « un chiffre qu'on ne peut pas faire
// taire est un tracker ». Seule une fermeture PAR DÉFAUT du lecteur
// (`no_direction`: il est en maintenance et n'a rien choisi) laisse passer les
// boîtes des bouches à objectif. C'est là que « peu importe qui regarde »
// s'arrête, et c'est écrit.

/** Les motifs de l'émission par BOÎTE. La chaîne de sécurité, plus les deux
 *  états de l'interrupteur de la bouche. Jamais `other_mouth`: il n'y a plus
 *  d'« autre » ici, chaque bouche est jugée pour elle-même. */
export const BOX_ENERGY_REASONS = Object.freeze(
  [...ENERGY_SAFETY_REASONS, "student_off", "no_direction"] as const,
);
export type BoxEnergyReason = (typeof BOX_ENERGY_REASONS)[number];

export function canEmitBoxEnergy(args: {
  /** La chaîne ①②③ **de la bouche** — `energySafetyGates` sur SES entrées. REQUIS. */
  safety: EnergySafetyResult;
  /** L'interrupteur ④ **de la bouche** — `energySwitchFrom` sur SA direction. REQUIS. */
  mouthSwitch: { on: boolean; source: EnergySwitchSource };
}): { emit: boolean; reason: BoxEnergyReason } {
  if (args === null || typeof args !== "object") {
    fail("canEmitBoxEnergy requires an input object");
  }
  const bag = args as unknown as Record<string, unknown>;
  for (const key of ["safety", "mouthSwitch"]) {
    if (!Object.hasOwn(bag, key) || bag[key] === undefined) {
      fail(`missing required box gate input: ${key} — an absent gate is a disarmed gate`);
    }
  }
  if (
    typeof args.safety !== "object" || args.safety === null ||
    typeof args.safety.open !== "boolean" ||
    !(ENERGY_SAFETY_REASONS as readonly string[]).includes(args.safety.reason)
  ) {
    fail("safety must be the result of energySafetyGates");
  }
  if (
    typeof args.mouthSwitch !== "object" || args.mouthSwitch === null ||
    typeof args.mouthSwitch.on !== "boolean" ||
    !(ENERGY_SWITCH_SOURCES as readonly string[]).includes(args.mouthSwitch.source)
  ) {
    fail("mouthSwitch must be the result of energySwitchFrom");
  }
  // LA SÉCURITÉ D'ABORD, ET SON MOTIF SURVIT TEL QUEL — même ordre que partout.
  if (!args.safety.open) return { emit: false, reason: args.safety.reason };
  if (!args.mouthSwitch.on) {
    return {
      emit: false,
      // Deux silences différents: « elle a éteint » se répare en rallumant,
      // « elle n'a pas d'objectif » ne se répare pas — il n'y a rien à ouvrir.
      reason: args.mouthSwitch.source === "explicit_off" ? "student_off" : "no_direction",
    };
  }
  return { emit: true, reason: "open" };
}""", "porte boîte")])

# ── ② energy_gate_io.ts : exposer la position du coach et la SOURCE de l'interrupteur ──
patch("supabase/functions/_shared/keel/energy_gate_io.ts", [
("""  /** La ligne d'objectif, lue UNE fois et prêtée à l'appelant. */
  goalsRow: Record<string, unknown> | null;""",
"""  /** La ligne d'objectif, lue UNE fois et prêtée à l'appelant. */
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
  switchSource: EnergySwitchSource;""", "load: champs"),
("""    studentSwitch: energySwitchFrom({
      stored: readTriState(profile.energy_display_enabled),
      direction,
    }).on,
  });

  return {
    gate,
    today,
    ageVerdict,
    direction,
    goalsRow,""",
"""    studentSwitch: displaySwitch.on,
  });

  return {
    gate,
    today,
    ageVerdict,
    direction,
    goalsRow,
    coachCounting,
    switchSource: displaySwitch.source,""", "load: retour"),
("""  const gate = canShowEnergy({
    restrictionFlag: floor.restriction_flag === true,""",
"""  // ⟳ LOT F — RÉDUIT UNE FOIS, LU DEUX FOIS (`.on` pour la porte, `.source`
  // pour l'appelant). Deux appels à `energySwitchFrom` seraient deux idées du
  // même interrupteur.
  const displaySwitch = energySwitchFrom({
    stored: readTriState(profile.energy_display_enabled),
    direction,
  });
  const gate = canShowEnergy({
    restrictionFlag: floor.restriction_flag === true,""", "load: switch"),
])
# imports du type dans energy_gate_io
s=io.open("supabase/functions/_shared/keel/energy_gate_io.ts",encoding='utf-8').read()
if "type CountingStance" not in s or "type EnergySwitchSource" not in s:
    m=re.search(r'import \{([^}]*)\} from "\./energy_gate\.ts";', s)
    assert m, "bloc d'import energy_gate introuvable"
    names=m.group(1)
    add=[]
    if "CountingStance" not in names: add.append("  type CountingStance,")
    if "EnergySwitchSource" not in names: add.append("  type EnergySwitchSource,")
    s=s[:m.start(1)]+names.rstrip()+"\n"+"\n".join(add)+"\n"+s[m.end(1):]
    io.open("supabase/functions/_shared/keel/energy_gate_io.ts",'w',encoding='utf-8').write(s)
    print("ok · imports energy_gate_io")

# ── ③ plan_energy_read.ts : lire les PLATS AVEC LEURS BOÎTES pour `boxEnergies` ──
patch("supabase/functions/_shared/keel/plan_energy_read.ts", [(
"""export function readPreparations(raw: unknown): EnergyPreparation[] {""",
"""/**
 * ⟳ LOT F (2026-09-04) — LES PLATS **AVEC LEURS CONTENANTS**, tels que
 * `boxEnergies` les attend.
 *
 * ⛔ UN SECOND LECTEUR À CÔTÉ DE `readDishes`, ET C'EST VOULU. `readDishes`
 * nourrit `planEnergy` — l'assiette DU LECTEUR, tronc + add-ons — et n'a rien à
 * savoir des couvercles. Celui-ci nourrit le kcal PAR CONTENANT, qui a besoin
 * du `slot`, des `member_ids` et des grammes de chaque item. Les faire porter
 * par un seul type obligerait l'un des deux appelants à ignorer des champs, et
 * c'est le champ ignoré qui se perd en silence (cicatrice `ingredientPayload`).
 *
 * ⚠️ IL S'APPUIE SUR `readDishes` pour tout ce qu'ils ont en commun: deux
 * lectures de `uses` ou de `ingredients` divergeraient au premier champ ajouté.
 */
export interface EnergyBoxDish extends MouthEnergyDish {
  boxes: readonly {
    id: string;
    memberIds: readonly string[];
    items: readonly { grams: number }[];
    legacyTotalGrams: number | null;
  }[];
}

export function readEnergyBoxDishes(raw: unknown): EnergyBoxDish[] {
  if (!Array.isArray(raw)) return [];
  const common = readDishes(raw);
  return raw.map((entry, i) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    const boxes = Array.isArray(d.boxes) ? d.boxes : [];
    return {
      ...common[i],
      slot: d.slot === null || d.slot === undefined ? null : String(d.slot),
      boxes: boxes.map((rawBox) => {
        const b = (rawBox ?? {}) as Record<string, unknown>;
        const items = Array.isArray(b.items) ? b.items : [];
        const legacy = Number(b.legacy_total_grams);
        return {
          id: String(b.id ?? ""),
          memberIds: Array.isArray(b.member_ids)
            ? b.member_ids.map((m) => String(m ?? "").trim()).filter(Boolean)
            : [],
          items: items.map((rawItem) => ({
            grams: Number((rawItem as Record<string, unknown> | null)?.grams) || 0,
          })),
          legacyTotalGrams: Number.isFinite(legacy) && legacy > 0 ? legacy : null,
        };
      }).filter((b) => b.id !== ""),
    };
  });
}

export function readPreparations(raw: unknown): EnergyPreparation[] {""", "lecteur boîtes")])
s=io.open("supabase/functions/_shared/keel/plan_energy_read.ts",encoding='utf-8').read()
if "MouthEnergyDish" not in s.split("export interface EnergyBoxDish")[0]:
    # ajouter l'import de type en tête (après le premier import)
    i=s.index("import ")
    s=s[:i]+'import type { MouthEnergyDish } from "./mouth_energy.ts";\n'+s[i:]
    io.open("supabase/functions/_shared/keel/plan_energy_read.ts",'w',encoding='utf-8').write(s)
    print("ok · import MouthEnergyDish")
print("SERVEUR ①②③ posés — reste ④ meal-energy-v1 (script séparé)")
