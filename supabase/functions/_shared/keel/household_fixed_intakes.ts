/**
 * CE QUE CHAQUE BOUCHE MANGE DÉJÀ — la moitié LECTEUR de FF-051 au foyer.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-051-les-apports-fixes.md`
 * (§11 Q1, qui nommait ce trou « non fait, et c'est un vrai trou »).
 *
 * ── LE TROU QUE CE MODULE FERME, ET IL ÉTAIT MESURÉ ────────────────────────
 * Le pop-up « une bouche » demande le shaker AVEC ses trois nombres, et depuis
 * le commit d'avant celui-ci il les ÉCRIT (`api/mouthProfile.ts`). En face,
 * `generate-household-meal-v1` passait `fixedIntakes: []` EN DUR, trois fois.
 * On demandait donc ses protéines et ses calories à quelqu'un, et le
 * générateur du foyer ne les lisait jamais — un champ décoratif de bout en
 * bout, et pire qu'un champ absent parce qu'il promet.
 *
 * ── POURQUOI UN MODULE, ET PAS QUINZE LIGNES DANS LA FONCTION EDGE ─────────
 * Même raison que `household_bodies.ts`, dont ce fichier est le jumeau: les
 * garanties de ce lot portent sur l'APPARIEMENT (`user_id` pour chercher,
 * `member_id` pour rendre), sur ce qu'on REFUSE de laisser traverser, et sur le
 * COÛT. Une fonction edge ne se teste qu'avec une base debout; ce chargeur-ci
 * se teste avec un faux PostgREST.
 *
 * ⚠️ ET PAS DANS `household_meal_generation.ts`: ce module-là se déclare PUR
 * dès sa première ligne. Y mettre un aller-retour PostgREST ferait mentir
 * l'en-tête, et c'est l'en-tête qui garde ses 1300 lignes testables sans base.
 *
 * ── ⚠️ LA RÈGLE QUI TIENT TOUT LE RESTE: UN APPORT NE PREND PAS LE REPAS ──
 * Sur la lane individuelle, un apport `replaces_meal: true` SUPPRIME le
 * moment: le plan sert UNE bouche, et cette bouche a dit qu'elle mangeait
 * autre chose. Au foyer, le même mécanisme supprimerait le petit-déjeuner DE
 * TOUTE LA TABLÉE parce qu'UNE personne prend un shaker — le mode d'échec que
 * le commentaire de la fonction edge nommait pour refuser de lire cette
 * colonne, et il avait raison de le nommer.
 *
 * Ce chargeur RAMÈNE donc chaque apport « à côté du repas » (`replacesMeal:
 * false`) et COMPTE combien il en a ramenés. La direction de l'erreur est
 * choisie et elle est dissymétrique: laisser une portion de trop dans
 * l'assiette de quelqu'un qui a un shaker coûte une portion; retirer le
 * petit-déjeuner de quatre personnes coûte un repas à trois d'entre elles qui
 * n'ont rien déclaré.
 *
 * ── ET L'ATTRIBUTION EST LA SECONDE MOITIÉ DE LA MÊME RÈGLE ───────────────
 * Le tronc écrit « they already eat these ». Au foyer, « they » est la tablée,
 * et « mon shaker » tout seul dirait que TOUT LE MONDE en prend un. Le libellé
 * part donc préfixé du prénom. C'est de la PROSE pour le modèle — R1 tient:
 * `foodRef` ne bouge pas d'un octet, et c'est lui, jamais le libellé, qui sert
 * à résoudre quoi que ce soit.
 */

import {
  type FixedIntake,
  MAX_FIXED_INTAKES,
  parseFixedIntakes,
} from "./fixed_intakes.ts";

/** La tranche de client que ce module utilise. Structurelle: un faux suffit. */
export interface HouseholdIntakeDb {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

/**
 * Ce dont ce module a besoin d'une bouche, et rien de plus.
 *
 * ⚠️ LES TROIS CHAMPS SONT LÀ POUR TROIS RAISONS DIFFÉRENTES. `userId` dit OÙ
 * CHERCHER (`fixed_intakes` vit dans `student_goals.practical_constraints`,
 * donc sur `auth.users`); `memberId` dit DE QUI ÇA VIENT, pour la trace;
 * `displayName` dit au modèle À QUI c'est, sans quoi la ligne parle de la
 * tablée entière.
 */
export interface HouseholdIntakeMouth {
  memberId: string;
  userId: string | null;
  displayName: string;
}

export interface HouseholdFixedIntakes {
  /** Ce qui part au prompt ET au parseur. Jamais deux listes différentes. */
  intakes: FixedIntake[];
  /**
   * Les entrées que le parseur n'a pas su lire, toutes bouches confondues.
   * R4: sans ce compteur, un jsonb mal écrit par un futur écran ressemble à
   * une colonne vide, pour toujours.
   */
  discarded: number;
  /**
   * Les apports RAMENÉS à côté du repas au lieu de le prendre. Voir l'en-tête:
   * c'est la seule chose que ce chargeur retire à une déclaration, et une
   * chose retirée sans compteur est une chose retirée en silence.
   */
  demoted: number;
  /** Les entrées valides qui n'ont pas tenu sous le plafond du prompt. */
  dropped: number;
  /** Ce qui a échoué, nommément. Tracé sur la ligne, jamais silencieux. */
  issues: string[];
  /** LE COÛT, compté et non supposé. Un vrai décompte d'allers-retours. */
  reads: number;
}

function counting(
  db: HouseholdIntakeDb,
  tally: { reads: number },
): HouseholdIntakeDb {
  return {
    from(table: string) {
      tally.reads += 1;
      return db.from(table);
    },
  };
}

/**
 * L'ATTRIBUTION — le prénom devant, et le `foodRef` intact.
 *
 * Un prénom vide laisse le libellé tel quel: « : mon shaker » serait une ligne
 * que personne n'a écrite, et le vide est déjà le repli de `displayName` côté
 * roster (« Member »).
 */
export function attributedIntake(
  intake: FixedIntake,
  displayName: string,
): FixedIntake {
  const who = displayName.trim();
  const label = who === "" ? intake.label : `${who}: ${intake.label}`;
  // ⚠️ `replacesMeal: false`, ET C'EST LA RÈGLE DE L'EN-TÊTE. Le moment reste
  // NOMMÉ (`at_slot`): le modèle doit savoir quand ça tombe pour ne pas le
  // répéter. Il perd seulement le pouvoir de vider la case de la tablée.
  if (intake.placement === "at_slot") {
    return { ...intake, label, replacesMeal: false };
  }
  return { ...intake, label };
}

/**
 * LE PLAFOND DU FOYER — celui du PROMPT, pas la somme des plafonds.
 *
 * `MAX_FIXED_INTAKES` vaut 8 « parce que c'est un prompt, pas une base de
 * données »: huit lignes tiennent dans une section lisible, quarante noient la
 * consigne de sécurité qui les précède. Quatre bouches à huit apports en
 * feraient trente-deux — la même noyade, atteinte par la porte du foyer.
 *
 * ⚠️ À TOUR DE RÔLE, ET PAS DANS L'ORDRE DES BOUCHES. Un titulaire qui a
 * rempli huit apports sur la lane individuelle mangerait sinon tout le budget,
 * et le shaker de sa fille — la déclaration que ce lot existe pour faire
 * traverser — tomberait sans que rien ne le dise. Chacun est servi une fois
 * avant que quiconque soit servi deux fois.
 */
export function interleaveUnderCeiling(
  perMouth: readonly (readonly FixedIntake[])[],
): { intakes: FixedIntake[]; dropped: number } {
  const out: FixedIntake[] = [];
  const total = perMouth.reduce((n, list) => n + list.length, 0);
  const deepest = perMouth.reduce((n, list) => Math.max(n, list.length), 0);
  for (let rank = 0; rank < deepest; rank++) {
    for (const list of perMouth) {
      if (rank >= list.length) continue;
      if (out.length >= MAX_FIXED_INTAKES) break;
      out.push(list[rank]);
    }
    if (out.length >= MAX_FIXED_INTAKES) break;
  }
  return { intakes: out, dropped: total - out.length };
}

/**
 * Charge les apports fixes de chaque bouche QUI A UN COMPTE.
 *
 * Les autres ne coûtent aucune requête: `fixed_intakes` est clé sur `user_id`,
 * donc une bouche sans compte n'a nulle part où en porter — c'est l'asymétrie
 * que l'écrivain (`ownShakerWriter`) porte déjà de son côté, et l'interroger
 * quand même serait N requêtes garanties vides par génération.
 *
 * ⚠️ BEST-EFFORT, JAMAIS BLOQUANT, et c'est l'arbitrage déjà écrit pour le
 * corps: « refuser le dîner de quelqu'un parce qu'on n'a pas su lire sa
 * balance serait la mauvaise moitié de l'arbitrage ». Une lecture en panne
 * rend exactement le produit d'hier (`[]`), et elle le DIT dans `issues`.
 * ⛔ À ne pas confondre avec les contraintes de sécurité, qui restent
 * fail-closed au sens fort dans la fonction edge: une portion de trop est le
 * produit d'hier, un dîner sans verrou d'allergène est un danger.
 */
export async function loadHouseholdFixedIntakes(
  db: HouseholdIntakeDb,
  params: { mouths: readonly HouseholdIntakeMouth[] },
): Promise<HouseholdFixedIntakes> {
  const tally = { reads: 0 };
  const counted = counting(db, tally);

  // EN PARALLÈLE, et chaque bouche porte son propre `try`: un échec n'emporte
  // pas les autres. Même patron que `loadHouseholdMemberBodies`.
  const loaded = await Promise.all(
    params.mouths.map(async (mouth) => {
      const empty = {
        mouth,
        intakes: [] as FixedIntake[],
        discarded: 0,
        demoted: 0,
        issues: [] as string[],
      };
      // ── ⛔ UNE BOUCHE SANS COMPTE A SON PROPRE STOCK DEPUIS LE 2026-08-19 ──
      //
      // Cette ligne était `if (!mouth.userId) return empty;` — un retour sec,
      // et il était JUSTE tant que `fixed_intakes` ne vivait que dans
      // `student_goals.practical_constraints`, c'est-à-dire sur `user_id`.
      //
      // Le produit a le défaut symétrique depuis toujours: un enfant, un
      // conjoint saisi — le cas NOMINAL du foyer — n'avait aucun endroit où
      // poser un shaker, et l'écran ne le proposait donc pas. Demandé quatre
      // fois. La colonne `household_members.fixed_intakes` (migration
      // `20260819170000`) est ce qui manquait.
      //
      // ⚠️ MÊME PARSEUR DES DEUX CÔTÉS. `parseFixedIntakes` est le seul lecteur
      // du produit et il est tout-ou-rien sur la composition déclarée; lire ce
      // stock-ci avec autre chose aurait fait diverger les deux au premier
      // ajustement, et l'écart se serait vu dans une assiette.
      if (!mouth.userId) {
        try {
          const res = await counted
            .from("household_members")
            .select("fixed_intakes")
            .eq("member_id", mouth.memberId)
            .maybeSingle();
          if (res.error) throw new Error(String(res.error.message ?? res.error));
          const parse = parseFixedIntakes(
            (res.data as { fixed_intakes?: unknown } | null)?.fixed_intakes,
          );
          let demoted = 0;
          const intakes = parse.intakes.map((intake) => {
            if (intake.placement === "at_slot" && intake.replacesMeal) demoted++;
            return attributedIntake(intake, mouth.displayName);
          });
          return {
            mouth,
            intakes,
            discarded: parse.discarded,
            demoted,
            issues: [] as string[],
          };
        } catch (error) {
          // MÊME DISCIPLINE QUE LA BRANCHE D'À CÔTÉ: un échec de lecture ne
          // fait pas tomber le foyer entier, il rend cette bouche vide et le
          // journalise. Une bouche sans apport lisible mange son plat normal.
          console.warn(JSON.stringify({
            tag: "keel.household_meal.fixed_intakes_unreadable",
            member_id: mouth.memberId,
            error: String(error instanceof Error ? error.message : error),
          }));
          return empty;
        }
      }
      try {
        const res = await counted
          .from("student_goals")
          .select("practical_constraints")
          .eq("user_id", mouth.userId)
          .maybeSingle();
        if (res.error) throw new Error(String(res.error.message ?? res.error));
        const pc = (res.data?.practical_constraints ?? null) as
          | Record<string, unknown>
          | null;
        const parse = parseFixedIntakes(pc?.fixed_intakes);
        let demoted = 0;
        const intakes = parse.intakes.map((intake) => {
          if (intake.placement === "at_slot" && intake.replacesMeal) demoted++;
          return attributedIntake(intake, mouth.displayName);
        });
        return {
          mouth,
          intakes,
          discarded: parse.discarded,
          demoted,
          issues: [] as string[],
        };
      } catch (error) {
        console.warn(JSON.stringify({
          tag: "keel.household_meal.fixed_intakes_unreadable",
          member_id: mouth.memberId,
          error: error instanceof Error ? error.message : String(error),
          effect: "composition sans les apports de cette bouche (produit d'avant)",
        }));
        return {
          ...empty,
          issues: [`fixed_intakes_unreadable:${mouth.memberId}`],
        };
      }
    }),
  );

  // L'ORDRE SUIT LES BOUCHES, pas l'ordre d'arrivée des promesses: deux
  // générations du même foyer doivent produire le même prompt, sinon la
  // colonne de version ne dit plus rien de ce qui a été servi.
  const { intakes, dropped } = interleaveUnderCeiling(
    loaded.map((entry) => entry.intakes),
  );
  return {
    intakes,
    discarded: loaded.reduce((n, e) => n + e.discarded, 0),
    demoted: loaded.reduce((n, e) => n + e.demoted, 0),
    dropped,
    issues: loaded.flatMap((e) => e.issues),
    reads: tally.reads,
  };
}
