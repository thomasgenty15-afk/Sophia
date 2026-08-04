/**
 * KEEL — LA DATE DE NAISSANCE, ET CE QU'ON FAIT D'UN MINEUR.
 *
 * ── POURQUOI UNE DATE ET PAS UN ÂGE ────────────────────────────────────────
 * Un entier `age` est faux le lendemain de l'anniversaire, et personne ne
 * repasse jamais derrière pour le corriger. On stocke la date (`profiles.
 * birth_date`, qui existait déjà) et on DÉRIVE l'âge à chaque lecture.
 *
 * ── POURQUOI CE MODULE EXISTE ALORS QUE `ageFromBirthDate` EXISTE DÉJÀ ──────
 * `sophia-brain/context/user_identity.ts` en a un. Il répond à une autre
 * question: « quel ton adopter ». Il rend `null` pour tout ce qui est absurde
 * (âge négatif, 200 ans) parce qu'un ton ne se règle pas sur une aberration —
 * et c'est le bon choix LÀ-BAS.
 *
 * Ici la question est « a-t-on le droit de générer un plan nutritionnel pour
 * cette personne ». Un `null` qui confond « on ne sait pas » et « la valeur est
 * aberrante » y est inacceptable: les deux appellent des gestes opposés (l'un
 * demande la donnée, l'autre refuse une écriture). Ce module NOMME chaque cas.
 * Fusionner les deux ferait perdre à l'un ce qui fait la justesse de l'autre.
 *
 * ── LA DÉCISION « MINEUR », ÉCRITE ICI PARCE QU'ELLE DOIT ÊTRE LUE ─────────
 * Collecter l'âge finit forcément par dire qu'un élève a moins de 18 ans. Les
 * options honnêtes étaient: refuser l'inscription, alerter le coach, restreindre
 * l'objectif, ou accepter avec une mention légale.
 *
 * RETENU: **bloquer la génération de plan et prévenir le coach.**
 *
 * Parce qu'un accompagnement nutritionnel de mineur relève du cadre
 * professionnel du coach (et, selon les pays, d'une autorisation parentale et
 * d'un cadre de santé), pas du nôtre. Bloquer la GÉNÉRATION plutôt que
 * l'INSCRIPTION est délibéré: expulser l'élève le renverrait sans rien, et
 * détruirait au passage le lien coach-élève qui est justement l'endroit où la
 * décision doit se prendre. Le coach reçoit une escalade `immediate` et tranche
 * en connaissance de cause.
 *
 * L'ALTERNATIVE RAISONNABLE, pour qu'elle soit rejouable: restreindre
 * `fat_loss` et laisser le reste passer. Écartée parce qu'elle prétend que le
 * problème est l'objectif alors qu'il est le cadre — un plan `performance`
 * généré pour un enfant de 12 ans pose exactement le même problème de
 * responsabilité, sans même déclencher l'alerte qui l'aurait fait voir.
 *
 * ── LA CONDITION DE DÉSARMEMENT (P9), PARCE QU'ELLE SE VÉRIFIE ─────────────
 * La ceinture ne mord QUE sur `minor`. Une date ABSENTE ne bloque rien: sinon
 * tout élève existant — aucun n'a de date, la colonne n'a jamais été demandée —
 * se retrouverait enfermé dehors du jour au lendemain par une garde censée
 * protéger des enfants. « On ne sait pas » n'est pas « c'est un enfant ». Le
 * premier passage (P4) est ce qui comble le trou, pas un refus de service.
 *
 * PURE MODULE : no I/O, no clock (le caller passe la date locale du jour).
 */

/** L'âge à partir duquel le produit s'adresse à quelqu'un directement. */
export const KEEL_MINOR_AGE = 18;

/**
 * Au-delà, c'est une faute de saisie, pas un doyen. Le record humain vérifié
 * est 122 ans; 120 laisse la marge sans accepter « 1900 » comme plausible.
 */
export const KEEL_MAX_PLAUSIBLE_AGE = 120;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ce qu'on sait de la date de naissance d'un élève.
 *
 * Chaque cas est NOMMÉ plutôt que replié sur `null` (R7): un appelant qui doit
 * choisir entre « demande-la » et « refuse d'écrire ça » ne peut pas le faire
 * avec un booléen.
 */
export type BirthDateVerdict =
  /** Aucune date enregistrée. Le cas de TOUS les élèves d'avant ce chantier. */
  | { status: "absent" }
  /** Présente mais pas une date ISO lisible. */
  | { status: "unreadable"; raw: string }
  /** Dans le futur. */
  | { status: "future"; raw: string; isoDate: string }
  /** Lisible, passée, mais l'âge dérivé est hors du plausible. */
  | { status: "implausible"; raw: string; isoDate: string; age: number }
  /** Lisible et plausible, moins de 18 ans. */
  | { status: "minor"; isoDate: string; age: number }
  /** Lisible et plausible, 18 ans ou plus. */
  | { status: "adult"; isoDate: string; age: number };

/** Les verdicts qu'on refuse d'ÉCRIRE. Lire n'est pas écrire — voir plus bas. */
export type RejectedBirthDateStatus = "unreadable" | "future" | "implausible";

/**
 * L'âge en années révolues, en arithmétique de CALENDRIER.
 *
 * Pas de division par 365.25: elle décale l'anniversaire d'un jour une année
 * sur quatre, et le seul jour où ce module doit être exact est précisément un
 * anniversaire — le 18e.
 *
 * `todayLocalIso` est la date locale de l'ÉLÈVE, pas l'UTC du serveur. Un élève
 * à Auckland a 18 ans douze heures avant que le serveur ne l'admette, et la
 * garde le lui refuserait pendant ces douze heures.
 */
export function ageOnDate(birthIso: string, todayLocalIso: string): number {
  const [by, bm, bd] = birthIso.split("-").map(Number);
  const [ty, tm, td] = todayLocalIso.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/**
 * Lit une date de naissance et dit ce qu'elle est.
 *
 * @param raw       la valeur telle qu'elle sort de la base (ou d'un formulaire)
 * @param todayLocalIso  la date locale de l'élève, `YYYY-MM-DD`
 */
export function assessBirthDate(
  raw: unknown,
  todayLocalIso: string,
): BirthDateVerdict {
  if (!ISO_DATE.test(String(todayLocalIso ?? "").trim())) {
    // Une garde qui se trompe de « aujourd'hui » se trompe sur l'âge. On refuse
    // de deviner plutôt que de rendre un verdict sur une date inventée.
    throw new Error(
      `[keel/student_age] todayLocalIso is not YYYY-MM-DD: ${JSON.stringify(todayLocalIso)}`,
    );
  }

  const text = String(raw ?? "").trim();
  if (!text) return { status: "absent" };

  // `new Date("2010-02-30")` rend le 2 mars sans se plaindre. On vérifie la
  // forme PUIS que la date se relit à l'identique, sinon « 30 février » entre
  // dans la base comme une date valide.
  if (!ISO_DATE.test(text)) return { status: "unreadable", raw: text };
  const [y, m, d] = text.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return { status: "unreadable", raw: text };
  }

  const age = ageOnDate(text, todayLocalIso);
  if (age < 0) return { status: "future", raw: text, isoDate: text };
  if (age > KEEL_MAX_PLAUSIBLE_AGE) {
    return { status: "implausible", raw: text, isoDate: text, age };
  }
  return age < KEEL_MINOR_AGE
    ? { status: "minor", isoDate: text, age }
    : { status: "adult", isoDate: text, age };
}

/** L'âge exploitable d'un verdict, ou `null` quand il n'y en a pas. */
export function usableAge(verdict: BirthDateVerdict): number | null {
  return verdict.status === "minor" || verdict.status === "adult"
    ? verdict.age
    : null;
}

/**
 * Une date de naissance est-elle ACCEPTABLE à l'écriture ?
 *
 * Le pendant de la garde de lecture: on refuse d'enregistrer ce qui est
 * illisible, futur ou aberrant, pour que la garde de lecture n'ait jamais à
 * arbitrer sur des données qu'on aurait pu ne pas laisser entrer. Un mineur,
 * lui, s'enregistre — c'est justement ce qu'on veut savoir.
 */
export function birthDateWritable(
  verdict: BirthDateVerdict,
): { ok: true } | { ok: false; reason: RejectedBirthDateStatus } {
  switch (verdict.status) {
    case "unreadable":
    case "future":
    case "implausible":
      return { ok: false, reason: verdict.status };
    default:
      return { ok: true };
  }
}

export interface WeekPlanAgeGate {
  /** `false` seulement pour un mineur avéré. */
  allowed: boolean;
  /** Nommé, y compris quand ça passe — un log qui dit « ok » ne dit rien. */
  reason:
    | "adult"
    | "unknown_birth_date"
    | "unusable_birth_date"
    | "minor";
  age: number | null;
}

/**
 * LA CEINTURE : a-t-on le droit de générer un plan pour cette personne ?
 *
 * Une seule condition de morsure, et elle est écrite en toutes lettres:
 * `status === "minor"`. Tout le reste passe. Voir l'en-tête pour pourquoi
 * « absent » ne bloque pas — c'est la condition de désarmement, et elle a son
 * test.
 */
export function weekPlanAgeGate(verdict: BirthDateVerdict): WeekPlanAgeGate {
  switch (verdict.status) {
    case "minor":
      return { allowed: false, reason: "minor", age: verdict.age };
    case "adult":
      return { allowed: true, reason: "adult", age: verdict.age };
    case "absent":
      return { allowed: true, reason: "unknown_birth_date", age: null };
    default:
      return { allowed: true, reason: "unusable_birth_date", age: null };
  }
}

/**
 * Ce que le générateur passe au modèle à propos de l'âge.
 *
 * UNE BANDE, PAS UN NOMBRE, et c'est un arbitrage: le modèle n'a aucun usage
 * légitime de « 34 » qu'il n'ait de « adulte ». Une bande ne peut pas non plus
 * ressortir telle quelle dans une ligne du plan (« à 34 ans, vous… »), ce qu'un
 * nombre exact finit toujours par faire.
 *
 * `null` quand l'âge est inconnu: le prompt dira « non renseigné » plutôt que
 * de prêter au modèle une certitude qu'on n'a pas.
 */
export type AgeBand = "18_29" | "30_44" | "45_59" | "60_plus";

export function ageBandOf(age: number | null): AgeBand | null {
  if (age === null || !Number.isFinite(age) || age < KEEL_MINOR_AGE) return null;
  if (age < 30) return "18_29";
  if (age < 45) return "30_44";
  if (age < 60) return "45_59";
  return "60_plus";
}
