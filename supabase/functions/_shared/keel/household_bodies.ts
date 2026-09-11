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
import { latest, loadStudentBody, mealBodyContextFrom } from "./student_body_io.ts";
import type { MealBodyContext } from "./meal_body.ts";
// ⟳ 2026-09-10 · LOT 3 — LE MOTEUR A BESOIN DE PLUS QUE LE BRIEF.
// `MealBodyContext` rend une BANDE d'âge (mineur / adulte) et jette l'âge en
// années, et il ne porte pas les deux axes d'activité. Le dimensionnement a
// besoin des deux. On rend donc, à côté, la forme plate que
// `resolved_mouth.ts` consomme — SANS UNE SEULE LECTURE DE PLUS: tout sort du
// même `loadStudentBody`.
import type { PersonalMouthFacts } from "./resolved_mouth.ts";
import { usableAge } from "./student_age.ts";

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
  /**
   * ⟳ 2026-09-10 · LOT 3 — LES MÊMES FAITS, POUR LE MOTEUR.
   *
   * Clé: `member_id`, et **présent pour toute bouche AYANT UN COMPTE**, y
   * compris quand la lecture est tombée (`read: "failed"`). C'est la
   * différence qui compte: une entrée absente veut dire « pas de compte »,
   * une entrée `failed` veut dire « on n'a pas su lire » — et le résolveur ne
   * doit pas confondre les deux avec « la personne n'a rien saisi ».
   */
  personalByMember: Map<string, PersonalMouthFacts>;
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
      // ⛔ PLUS DE `return null` ICI. La fiche est lue en bloc après cette
      // boucle: une bouche sans compte n'a pas de PROFIL, mais elle a un CORPS.
      // ⚠️ `personal: null` VEUT DIRE « PAS DE COMPTE », et c'est distinct de
      // `read: "failed"`. Le résolveur traite la fiche comme AUTORITÉ dans ce
      // cas-là, pas comme un repli.
      if (!member.userId) {
        return { member, body: null, personal: null, issues };
      }

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
        const snapshot = await loadStudentBody(
          counted,
          member.userId,
          params.todayLocalDate,
        );
        const body = mealBodyContextFrom(snapshot, restrictionFlag);
        // ⟳ 2026-09-10 · LOT 3 — LA MÊME LECTURE, MISE À PLAT POUR LE MOTEUR.
        // ⚠️ LE POIDS PORTE SA DATE. « 78 kg » ne dit rien, « 78 kg, semaine du
        // 7 septembre » dit quelque chose — et c'est ce qui permet, plus tard,
        // de savoir si un grammage a été calculé sur une pesée fraîche.
        const derniere = latest(snapshot.weights);
        const personal: PersonalMouthFacts = {
          read: "ok",
          heightCm: snapshot.heightCm,
          weightKg: derniere?.value ?? null,
          weightAsOf: derniere?.weekStart ?? null,
          gender: snapshot.gender,
          // ⛔ L'ÂGE SE DÉRIVE DE LA DATE, JAMAIS D'UNE BANDE. `usableAge` rend
          // `null` sur une date illisible ou aberrante: on n'en invente pas.
          ageYears: usableAge(snapshot.verdict),
          activityLevel: snapshot.activityLevel,
          activityAxes: snapshot.activityAxes,
        };
        return { member, body, personal, issues };
      } catch (error) {
        console.warn(JSON.stringify({
          tag: "keel.household_meal.member_body_unreadable",
          member_id: member.memberId,
          error: error instanceof Error ? error.message : String(error),
          effect: "portion composée sans corps (comportement d'avant le lot 3B)",
        }));
        issues.push(`body_unreadable:${member.memberId}`);
        // ⛔ `read: "failed"` ET PAS UNE ABSENCE. Le résolveur du lot 3 refuse
        // de se replier sur la fiche dans ce cas: un chiffre périmé servi sous
        // les traits d'un chiffre à jour est pire qu'un chiffre manquant.
        return {
          member,
          body: null,
          personal: {
            read: "failed",
            heightCm: null,
            weightKg: null,
            weightAsOf: null,
            gender: null,
            ageYears: null,
            activityLevel: null,
            activityAxes: { day: null, sport: null, asked: false },
          } satisfies PersonalMouthFacts,
          issues,
        };
      }
    }),
  );

  // ── LE CORPS DE LA FICHE, POUR LES BOUCHES SANS COMPTE (2026-08-19) ───────
  //
  // ⛔ LE DÉFAUT QUE CE BLOC FERME, ET LA PHRASE QUI L'A CAUSÉ. L'en-tête de ce
  // module affirmait qu'« une bouche sans compte n'a ni profil ni mesures, et
  // l'interroger quand même serait N requêtes garanties vides ». La première
  // moitié est vraie, la seconde est FAUSSE: `household_member_bodies` porte
  // taille, poids et sexe en NOT NULL, saisis à l'ajout du membre, pour toute
  // bouche — compte ou pas.
  //
  // Mesuré par le propriétaire sur son propre foyer: `169 cm · 59 kg · femme`
  // en base, et le brief portait « - Christèle: » suivi de RIEN. Le modèle a
  // servi à une femme de 59 kg la boîte d'un homme de 73 kg qui s'entraîne —
  // `140/140`, `180/180`, `220/220`, identiques à chaque préparation. Il n'a
  // rien différencié parce qu'il n'avait rien pour le faire.
  //
  // UNE SEULE REQUÊTE pour tout le foyer, pas N: c'est l'objection de coût de
  // l'en-tête, et elle reste valable — c'est la conclusion qui était fausse.
  let fichesEnEchec = false;
  const sansCompte = params.members.filter((m) => !m.userId).map((m) => m.memberId);
  // ── ⟳ 2026-09-04 — LA FICHE SERT AUSSI LE TITULAIRE DONT LA SÉRIE EST VIDE ──
  //
  // Une bouche AVEC un compte ne recevait JAMAIS le relais de la fiche: son
  // corps devait venir de sa propre série de pesées. Mesuré en base: 15
  // titulaires sur 38 qui portent une fiche n'ont AUCUNE ligne de série. Leur
  // poids est écrit, stocké, rendu par `keel_household_bodies_for` — et
  // invisible au dimensionnement, qui les sert « comme la table ».
  //
  // ⛔ LA SÉRIE VIDE N'EST PAS LA LECTURE RATÉE. Le `null` fail-closed d'un
  // compte dont la lecture a ÉCHOUÉ reste `null`: la fiche ne répare pas une
  // panne, et ce cas-là garde son test. Ici on ne prend que le compte dont la
  // lecture a RÉUSSI et n'a rien rendu (`body` présent, `latestWeight` null).
  // Le poids part par `declaredWeightKg`, jamais par `latestWeight`: une fiche
  // n'est pas une série, et la ligne rendue dit « as stated on their sheet ».
  const serieVide = loaded
    .filter((e) => e.member.userId && e.body !== null && e.body.latestWeight === null)
    .map((e) => e.member.memberId);
  const fichesVoulues = [...sansCompte, ...serieVide];
  const fiches = new Map<string, { h: number | null; w: number | null; g: string | null }>();
  if (fichesVoulues.length > 0) {
    try {
      const res = await counted
        .from("household_member_bodies")
        .select("member_id, height_cm, weight_kg, gender")
        .in("member_id", fichesVoulues);
      if (res.error) throw res.error;
      for (const row of (res.data ?? []) as Array<Record<string, unknown>>) {
        const id = String(row.member_id ?? "").trim();
        if (!id) continue;
        const h = Number(row.height_cm);
        const w = Number(row.weight_kg);
        const g = String(row.gender ?? "").trim();
        fiches.set(id, {
          h: Number.isFinite(h) ? h : null,
          w: Number.isFinite(w) ? w : null,
          g: g === "male" || g === "female" || g === "other" ? g : null,
        });
      }
    } catch (error) {
      // NOMMÉ, jamais silencieux: sans cette ligne, une lecture qui échoue en
      // boucle est indiscernable d'un foyer dont personne n'a rempli sa fiche.
      console.warn(JSON.stringify({
        tag: "keel.household_meal.sheet_bodies_unreadable",
        error: error instanceof Error ? error.message : String(error),
        effect: "les bouches sans compte restent sans fait corporel",
      }));
      fichesEnEchec = true;
    }
  }

  const byMember = new Map<string, MealBodyContext>();
  // ⟳ 2026-09-10 · LOT 3 — REMPLIE POUR TOUTE BOUCHE AYANT UN COMPTE, y compris
  // celles dont la lecture est tombée. Absent ⇒ pas de compte, et le résolveur
  // traite alors la fiche comme AUTORITÉ.
  const personalByMember = new Map<string, PersonalMouthFacts>();
  const issues: string[] = [];
  // L'ORDRE SUIT LES MEMBRES, pas l'ordre d'arrivée des promesses. Deux
  // générations du même foyer doivent produire la même ligne `issues`, sinon
  // relire « pourquoi Marc a-t-il eu une part standard ? » trois jours plus
  // tard dépend de qui a répondu le premier ce soir-là.
  if (fichesEnEchec) issues.push("sheet_bodies_unreadable");
  for (const entry of loaded) {
    if (entry.personal !== null) {
      personalByMember.set(entry.member.memberId, entry.personal);
    }
    if (entry.body) {
      let body = entry.body;
      if (entry.member.userId && body.latestWeight === null) {
        const fiche = fiches.get(entry.member.memberId);
        if (fiche && fiche.w !== null) {
          body = {
            ...body,
            declaredWeightKg: fiche.w,
            heightCm: body.heightCm ?? fiche.h,
            gender: body.gender ?? (fiche.g as MealBodyContext["gender"]),
          };
          issues.push(`body_from_sheet:${entry.member.memberId}`);
        }
      }
      byMember.set(entry.member.memberId, body);
      issues.push(...entry.issues);
      continue;
    }
    issues.push(...entry.issues);
    // ── LA FICHE PREND LE RELAIS, ET SEULEMENT ALORS ────────────────────────
    // Un compte qui a échoué garde son `null` fail-closed: la fiche ne répare
    // pas une lecture ratée, elle sert la bouche qui n'a jamais eu de compte.
    if (entry.member.userId) continue;
    const fiche = fiches.get(entry.member.memberId);
    if (!fiche) continue;
    if (fiche.h === null && fiche.w === null && fiche.g === null) continue;
    byMember.set(entry.member.memberId, {
      heightCm: fiche.h,
      // AUCUNE BANDE D'ÂGE: la fiche ne porte pas de date de naissance, et
      // `householdBodyFacts` reçoit de toute façon `ageState` à part — c'est
      // lui qui ferme sur un mineur, pas ce champ.
      ageBand: null,
      gender: fiche.g as MealBodyContext["gender"],
      // AUCUNE PESÉE DATÉE: une fiche n'est pas une série. Le poids part par
      // `declaredWeightKg`, et la ligne rendue dit « as stated on their sheet ».
      latestWeight: null,
      latestWaist: null,
      declaredWeightKg: fiche.w,
      // ⚠️ `false`, ET CE N'EST PAS UN ASSOUPLISSEMENT. Le plancher TCA vit sur
      // un COMPTE (`evaluateRestrictionForStudent(userId)`); une bouche qui n'en
      // a pas n'a pas de plancher levé à respecter. Le `true` fail-closed
      // couvre « je n'ai pas pu lire », pas « il n'y a rien à lire » — les
      // confondre est ce qui fermait le calcul sur exactement la population
      // qu'il devait servir.
      restrictionFlag: false,
      activityLevel: null,
    });
  }
  return { byMember, personalByMember, issues, reads: tally.reads };
}
