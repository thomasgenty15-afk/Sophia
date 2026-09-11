/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-10 — UN COMPTE SEUL EST UNE BOUCHE DE SON PROPRE FOYER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CE MODULE FERME ────────────────────────────────────────
 * L'appétit (`APPETITE_LEVELS`, ±10 %) est posé sur la FICHE d'une bouche
 * (`household_member_bodies.appetite`, écrit par `keel_household_set_member_body`)
 * — y compris sur celle du titulaire, à qui l'écran pose la question au « tu »
 * (`household.mouth.appetite_you`, `mouthVoice.ts`). La lane individuelle, elle,
 * passait `appetite: null` EN DUR à `envelopeFor`, avec un commentaire disant
 * « il n'est pas collecté sur cette lane ». Il l'était: personne n'allait le
 * chercher.
 *
 * ⛔ ET `chooseGenerator` DIT POURQUOI C'EST LÉGITIME. Un titulaire sans autre
 * bouche est routé sur `generate-meal-v1` (« un foyer commencé puis laissé à
 * une seule bouche compose comme un solo ») — mais sa LIGNE de foyer existe, et
 * c'est là que sa fiche de corps est écrite. Les deux lanes lisent donc la même
 * source; seule celle qui composait ne la lisait pas.
 *
 * ⚠️ LES DEUX RPC NE PRENNENT PAS LE MÊME ARGUMENT, et c'est une cicatrice
 * mesurée du dépôt: `keel_household_roster_for(p_user)` mais
 * `keel_household_bodies_for(p_household)`. Passer `p_user` à la seconde rend
 * « Could not find the function … in the schema cache », un refus de PostgREST
 * qui ressemble à une panne de base.
 *
 * ⚠️ AUCUNE PANNE NE LÈVE, et le repli est le comportement d'AVANT ce lot:
 * `{appetite: null, asked: false}` — c'est-à-dire ×1,00, un neutre VRAI. Une
 * lecture de confort qui ferait tomber la composition serait le mauvais côté de
 * l'arbitrage; l'échec est journalisé BRUYAMMENT pour qu'une lecture muette ne
 * passe pas pour une lecture qui ne trouve jamais rien.
 *
 * ⛔ TROIS ÉTATS, PAS DEUX. `asked` sépare « la question n'a jamais été posée à
 * cette fiche » de « on a demandé et la personne n'a pas répondu ». Les fondre
 * rendrait impossible de savoir si la question sert à quelque chose — le zéro
 * ambigu que `APPETITE_SOURCES` existe déjà pour refuser.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { type AppetiteLevel, APPETITE_LEVELS } from "./tokens.ts";
import { parseMemberLight } from "./household_habits.ts";

export interface OwnMouthBody {
  /**
   * ⟳ 2026-09-10 — LES MOMENTS QUE CETTE PERSONNE A MARQUÉS « LÉGER ».
   *
   * ⛔ MÊME SOURCE QUE LA LANE DU FOYER (`keel_household_habits_for`, colonne
   * `slots`, lue par `parseMemberLight`). La lane individuelle passait
   * `lightSlots: []` EN DUR à `slotPlanTargets` et à `plateBoundsFor`: un
   * dîner marqué léger pesait donc son poids plein, et sa borne de masse était
   * celle d'un repas ordinaire. Le champ était collecté à l'écran, écrit en
   * base, et jeté avant le calcul — le mode d'échec n° 1 de ce dépôt.
   *
   * `[]` = rien de marqué, et c'est la répartition de base. Jamais une valeur
   * inventée: « pas demandé » et « normal » ne se confondent pas.
   */
  lightSlots: readonly string[];
  /** La ligne de foyer du titulaire, ou `null` s'il n'en a pas. */
  memberId: string | null;
  /** `null` = pas de réponse lisible. Voir `asked` pour la distinguer. */
  appetite: AppetiteLevel | null;
  /** La fiche a-t-elle DÉJÀ vu la question ? */
  asked: boolean;
  /**
   * ⛔ COMPTEUR OBLIGATOIRE. `null` partout et « on n'a pas su lire » rendent
   * la même valeur; sans ce jeton, un chargeur cassé ressemble trait pour trait
   * à une base où personne n'a répondu.
   */
  source: "read" | "no_household" | "no_member" | "unreadable";
}

const ABSENT: OwnMouthBody = Object.freeze({
  memberId: null,
  appetite: null,
  lightSlots: [],
  asked: false,
  source: "no_household",
});

/**
 * LA FICHE DE CORPS DU TITULAIRE, TELLE QUE SA LIGNE DE FOYER LA PORTE.
 *
 * @param householdId déjà résolu par l'appelant (`resolveHouseholdIdFor`).
 * ⛔ REQUIS ET NULLABLE, jamais `?`: le re-résoudre ici ferait une seconde
 * résolution du foyer dans la même requête, et deux résolutions divergent.
 */
export async function loadOwnMouthBody(
  admin: SupabaseClient,
  userId: string,
  householdId: string | null,
  /** Le tag de journal de l'appelant — pour que le warn se lise chez lui. */
  tag: string,
): Promise<OwnMouthBody> {
  if (!householdId) return ABSENT;
  try {
    const roster = await admin.rpc("keel_household_roster_for", { p_user: userId });
    if (roster.error) throw new Error(roster.error.message);
    const mine = ((roster.data ?? []) as Record<string, unknown>[])
      .find((row) => String(row.user_id ?? "").trim() === userId);
    const memberId = String(mine?.member_id ?? "").trim();
    if (!memberId) {
      return {
        memberId: null,
        appetite: null,
        lightSlots: [],
        asked: false,
        source: "no_member",
      };
    }
    const bodies = await admin.rpc("keel_household_bodies_for", {
      p_household: householdId,
    });
    if (bodies.error) throw new Error(bodies.error.message);
    const row = ((bodies.data ?? []) as Record<string, unknown>[])
      .find((r) => String(r.member_id ?? "").trim() === memberId);
    const raw = String(row?.appetite ?? "").trim();
    // ⚠️ UNE SECONDE LECTURE, ET ELLE EST DANS LE MÊME `try`. Le « léger » vit
    // dans la table des HABITUDES, pas dans celle des corps — même RPC que la
    // lane du foyer, même parseur, pour que les deux lanes ne puissent pas lire
    // deux réponses différentes à la même question.
    //
    // ⛔ UN ÉCHEC DE CETTE LECTURE-CI NE DOIT PAS EMPORTER L'APPÉTIT: elle est
    // donc tolérante (`[]` sur erreur), et le `catch` général reste la garde de
    // la lecture principale.
    let lightSlots: readonly string[] = [];
    try {
      const habits = await admin.rpc("keel_household_habits_for", { p_user: userId });
      if (!habits.error) {
        const mineHabits = ((habits.data ?? []) as Record<string, unknown>[])
          .find((r) => String(r.member_id ?? "").trim() === memberId);
        lightSlots = Object.entries(parseMemberLight(mineHabits?.slots))
          .filter(([, on]) => on === true)
          .map(([slot]) => slot);
      }
    } catch {
      lightSlots = [];
    }
    return {
      memberId,
      lightSlots,
      // Hors vocabulaire ⇒ `null`, jamais un repli sur un cran: choisir un cran
      // à la place de quelqu'un ferait peser une réponse qu'il n'a pas donnée.
      appetite: (APPETITE_LEVELS as readonly string[]).includes(raw)
        ? (raw as AppetiteLevel)
        : null,
      asked: row?.appetite_asked === true,
      source: "read",
    };
  } catch (error) {
    console.warn(JSON.stringify({
      tag,
      event: "own_mouth_unreadable",
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
      effect: "appétit neutre (x1,00) — le comportement d'avant ce lot",
    }));
    return {
      memberId: null,
      appetite: null,
      lightSlots: [],
      asked: false,
      source: "unreadable",
    };
  }
}
