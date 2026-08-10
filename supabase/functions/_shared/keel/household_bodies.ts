/**
 * LE CORPS DE CHAQUE BOUCHE — la moitié I/O du lot 3B.
 *
 * Autorité produit: `docs/keel/CHANTIER-FOYER-PROFILS.md` §« Lot 3B ».
 *
 * ── LE TROU QUE CE MODULE FERME ────────────────────────────────────────────
 * `generate-meal-v1` lit la taille, la bande d'âge, le sexe, la dernière pesée
 * et le dernier tour de taille de l'élève, et les fait entrer dans la consigne
 * (FF-030). `generate-household-meal-v1` n'en lisait RIEN: le générateur du
 * foyer ne connaissait d'une personne qu'un jeton d'objectif et son état d'âge.
 * Réclamer son profil ne changeait donc rien à la portion servie à table —
 * c'est-à-dire que le cran 2 du chantier n'existait pas.
 *
 * ── POURQUOI UN MODULE, ET PAS QUINZE LIGNES DANS LA FONCTION EDGE ─────────
 * Parce que les quatre garanties du lot se prouvent ICI, et nulle part ailleurs:
 * l'appariement par `member_id` (jamais par `user_id`), le fail-closed du
 * plancher, la bouche sans compte qui ne casse rien, et le COÛT. Une fonction
 * edge ne se teste qu'avec une base debout; ce module se teste avec un faux
 * PostgREST, donc les quatre sont épinglées.
 *
 * ── L'ARBITRAGE, EN DEUX MOITIÉS QUI NE SE RESSEMBLENT PAS ────────────────
 *
 *   LE PLANCHER TCA  — FAIL-CLOSED. Il part à `true` et n'est abaissé que par
 *                      une lecture RÉUSSIE. Se fermer rend exactement le
 *                      produit d'hier (une portion dimensionnée sans le corps);
 *                      s'ouvrir met un poids sous les yeux du modèle pour
 *                      quelqu'un qu'on n'a pas su évaluer. Les deux coûts ne
 *                      sont pas du même ordre (FF-030 R6).
 *
 *   LE CORPS         — BEST-EFFORT, jamais bloquant. L'arbitrage est déjà
 *                      écrit sur le chemin individuel: « refuser le dîner de
 *                      quelqu'un parce qu'on n'a pas su lire sa balance serait
 *                      la mauvaise moitié de l'arbitrage ».
 *
 * ⚠️ À NE PAS CONFONDRE avec les CONTRAINTES DE SÉCURITÉ (les allergies), qui
 * restent fail-CLOSED au sens fort dans la fonction edge: leur lecture en panne
 * ARRÊTE la génération (`safety_constraints_unreadable`). Une portion mal
 * dimensionnée est le produit d'hier; un dîner sans verrou d'allergène est un
 * danger. Ce module ne touche pas à ça.
 */

import { evaluateRestrictionForStudent } from "./restriction_runtime.ts";
import { loadStudentBody, mealBodyContextFrom } from "./student_body_io.ts";
import type { MealBodyContext } from "./meal_body.ts";

/** La tranche de client que ce module utilise. Structurelle: un faux suffit. */
export interface HouseholdBodyDb {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

/**
 * Ce dont ce module a besoin d'une bouche, et rien de plus.
 *
 * ⚠️ LES DEUX IDENTIFIANTS SONT LÀ, ET ILS NE SONT PAS INTERCHANGEABLES.
 * `userId` dit OÙ CHERCHER (les mesures et le profil restent clés sur
 * `auth.users`); `memberId` dit À QUI RENDRE. Un résultat clé sur `user_id`
 * serait introuvable pour le brief de portions, qui ne connaît que
 * `member_id` — et le repli silencieux serait « personne n'a de corps ».
 */
export interface HouseholdBodyMember {
  memberId: string;
  userId: string | null;
}

export interface HouseholdBodies {
  /** Clé: `member_id`. Absent = aucun fait corporel pour cette bouche. */
  byMember: Map<string, MealBodyContext>;
  /** Ce qui a échoué, nommément. Tracé sur la ligne, jamais silencieux. */
  issues: string[];
  /**
   * LE COÛT, COMPTÉ ET NON SUPPOSÉ.
   *
   * Le lot fait passer la lecture de corps de 1 à N par génération, et c'est la
   * ligne que paie le persona prioritaire. « À mesurer, pas à supposer » est
   * écrit dans la fiche: ce compteur est un vrai décompte de requêtes (chaque
   * `.from()` est un aller-retour PostgREST), pas une estimation recopiée d'un
   * commentaire — une estimation figée survit toujours à sa cause.
   */
  reads: number;
}

/**
 * Compte les allers-retours PostgREST d'une lecture, sans en changer aucune.
 *
 * Le décompte vit ici plutôt que dans un commentaire parce qu'un chargeur
 * appelé plus bas peut gagner une requête sans que personne le remarque — et
 * la seule chose qui le dirait est un nombre qui bouge en production.
 */
function counting(db: HouseholdBodyDb, tally: { reads: number }): HouseholdBodyDb {
  return {
    from(table: string) {
      tally.reads += 1;
      return db.from(table);
    },
  };
}

/**
 * Charge le corps de chaque bouche QUI A UN COMPTE.
 *
 * Les autres portent `null` et ne coûtent aucune requête: une bouche sans
 * compte n'a ni profil ni mesures, et l'interroger quand même serait N requêtes
 * garanties vides par génération.
 *
 * @param todayLocalDate le jour local du COMPTE MAÎTRE. Un foyer cuisine
 *   ensemble et n'a qu'un calendrier — celui de la personne qui compose. Faire
 *   la moyenne de quatre fuseaux produirait une date que personne n'habite, et
 *   c'est déjà l'arbitrage écrit sur `todayToken` dans la fonction edge.
 */
export async function loadHouseholdMemberBodies(
  db: HouseholdBodyDb,
  params: {
    members: readonly HouseholdBodyMember[];
    todayLocalDate: string;
  },
): Promise<HouseholdBodies> {
  const tally = { reads: 0 };
  const counted = counting(db, tally);

  // EN PARALLÈLE, et c'est le point du lot sur le coût: N lectures en série
  // ajouteraient N fois la latence d'un aller-retour à une composition qui
  // attend déjà un modèle. Chaque membre porte son propre `try`, donc un
  // échec n'emporte pas les autres.
  const loaded = await Promise.all(
    params.members.map(async (member) => {
      const issues: string[] = [];
      if (!member.userId) return { member, body: null, issues };

      // FAIL-CLOSED. `true` tant qu'une lecture réussie ne l'a pas abaissé.
      let restrictionFlag = true;
      try {
        const floor = await evaluateRestrictionForStudent(counted, {
          userId: member.userId,
          asOfLocalDate: params.todayLocalDate,
        });
        restrictionFlag = floor.restriction_flag === true;
      } catch (error) {
        // JOURNALISÉ NOMMÉMENT: sans cette ligne, un plancher qui échoue en
        // boucle est indiscernable d'un membre qui n'a jamais saisi de mesure
        // — les deux produisent une ligne de brief sans corps.
        console.warn(JSON.stringify({
          tag: "keel.household_meal.restriction_floor_unreadable",
          member_id: member.memberId,
          error: error instanceof Error ? error.message : String(error),
          effect: "fail-closed: aucun fait corporel pour ce membre",
        }));
        issues.push(`body_floor_unreadable:${member.memberId}`);
      }

      try {
        const body = mealBodyContextFrom(
          await loadStudentBody(counted, member.userId, params.todayLocalDate),
          restrictionFlag,
        );
        return { member, body, issues };
      } catch (error) {
        console.warn(JSON.stringify({
          tag: "keel.household_meal.member_body_unreadable",
          member_id: member.memberId,
          error: error instanceof Error ? error.message : String(error),
          effect: "portion composée sans corps (comportement d'avant le lot 3B)",
        }));
        issues.push(`body_unreadable:${member.memberId}`);
        return { member, body: null, issues };
      }
    }),
  );

  const byMember = new Map<string, MealBodyContext>();
  const issues: string[] = [];
  // L'ORDRE SUIT LES MEMBRES, pas l'ordre d'arrivée des promesses. Deux
  // générations du même foyer doivent produire la même ligne `issues`, sinon
  // relire « pourquoi Marc a-t-il eu une part standard ? » trois jours plus
  // tard dépend de qui a répondu le premier ce soir-là.
  for (const entry of loaded) {
    if (entry.body) byMember.set(entry.member.memberId, entry.body);
    issues.push(...entry.issues);
  }
  return { byMember, issues, reads: tally.reads };
}
