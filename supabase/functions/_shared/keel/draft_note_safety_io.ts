/**
 * UNE ALLERGIE DITE SUR UN RETOUR DE PLAN EST UNE ALLERGIE — la moitié I/O.
 *
 * Socle : `draft_note_safety.ts` (pur). Autorité produit :
 * `docs/keel/NOMENCLATURE-MEMOIRE.md` §2 axe 1, encadré « arbitrage du
 * 2026-09-01 ».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LES DEUX MOITIÉS NE SE LIVRENT PAS SÉPARÉMENT
 * ═══════════════════════════════════════════════════════════════════════════
 * L'arbitrage remplace le consentement synchrone par **« on l'écrit, on le DIT,
 * et ça se défait en un geste »**. Écrire sans prévenir serait une contrainte
 * médicale posée dans le dos de quelqu'un. Ce module rend donc TOUJOURS ce
 * qu'il a écrit (`written`), pour que l'appelant n'ait aucun moyen d'écrire
 * sans avoir de quoi le dire.
 *
 * Le retrait, lui, existe déjà et il est à la personne : `StudentHealthPage` +
 * `retract_student_safety_constraint`, et la table n'accepte QUE la
 * rétractation (`student_safety_constraints_retraction_only`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ POURQUOI CET `insert` EST ÉCRIT DEUX FOIS DANS LE DÉPÔT
 * ═══════════════════════════════════════════════════════════════════════════
 * `sophia-brain/tools/always_on/declare_safety_constraint/db.ts` fait le même
 * `insert`. Le partager demanderait soit d'importer `sophia-brain` depuis
 * `_shared` — une inversion de couche que ce dépôt n'a nulle part —, soit de
 * déménager le module de la lane de conversation, ce qui est un refactor d'une
 * lane vivante pour un gain de forme.
 *
 * ⛔ LA DUPLICATION EST DONC ASSUMÉE, ET FIGÉE PAR UN TEST:
 * `draft_note_safety_io_test.ts` relit LES DEUX fichiers et exige que les
 * colonnes insérées soient les mêmes. Une colonne ajoutée d'un côté et pas de
 * l'autre écrirait deux formes de la même contrainte — et la ceinture de
 * sortie ne lirait que l'une des deux.
 *
 * ⚠️ `declared_by: "student"` DES DEUX CÔTÉS. `coach` est réservé à un canal
 * qui n'existe pas: une autorisation qu'une couche probabiliste peut affirmer
 * n'est pas une autorisation.
 */

import {
  readSafetyDeclarations,
  type SafetyDeclaration,
} from "./draft_note_safety.ts";

/** Le strict minimum de client dont cette porte a besoin. */
export type MinimalSafetyClient = {
  from: (table: string) => any;
  rpc: (name: string, params: Record<string, unknown>) => any;
};

/**
 * LA SÉVÉRITÉ PAR DÉFAUT, PAR `kind` — copiée de `intake.ts` et pour la même
 * raison qu'elle y est écrite.
 *
 * ⛔ LA PLUS HAUTE COMPATIBLE, ET CE N'EST PAS DE LA PRUDENCE DÉCORATIVE:
 * `severity` décide si la ceinture de sortie mord (`medical` seulement). Un
 * défaut trop bas produirait une contrainte enregistrée, visible en base, et
 * **inerte** — la pire des trois issues, parce qu'elle a l'air d'avoir marché.
 *
 * `dislike` n'atteint jamais ce module (refusé par le socle), donc il n'y a
 * aucun `kind` de goût à traiter ici.
 */
const DEFAULT_SEVERITY: Readonly<Record<string, string>> = {
  allergy: "medical",
  intolerance: "medical",
  medical: "medical",
  diet: "strict",
  religious: "strict",
};

/** Les `kind` qui, sur une bouche du foyer, sont un RÉGIME et pas une allergie. */
const MEMBER_DIET_KINDS = new Set(["diet", "religious"]);

export interface SafetyWriteOutcome {
  /** Ce qui a été ÉCRIT, pour que l'appelant puisse le dire. Jamais vide en cas de succès. */
  readonly written: readonly SafetyDeclaration[];
  readonly proposed: number;
  readonly refused: number;
  /** Les écritures qui ont échoué, comptées et jamais avalées. */
  readonly failed: number;
}

/**
 * ÉCRIT CE QUE LE MODÈLE A DÉCLARÉ, SUR LA BONNE LIGNE.
 *
 * ⛔ DEUX DESTINATIONS, PARCE QUE `student_safety_constraints` EST CLAVETÉE SUR
 * `user_id` et n'a AUCUNE colonne de bouche:
 *   · `memberId === null` → la ligne de la personne qui écrit;
 *   · une bouche nommée   → `keel_household_add_allergy` (allergie,
 *     intolérance, condition) ou `keel_household_set_member_diet` (régime,
 *     règle religieuse).
 *
 * Router les deux au même endroit écrirait l'allergie d'un enfant sur la ligne
 * de sa mère — un fait faux sur de la santé.
 *
 * ⚠️ UNE ÉCRITURE RATÉE NE FAIT PAS ÉCHOUER LES AUTRES, et elle est COMPTÉE.
 * Le plan est déjà écrit; personne ne perd son dîner parce qu'une contrainte
 * n'a pas pu s'enregistrer. Mais un `failed` silencieux ferait croire à une
 * protection absente, donc il sort dans le résultat.
 */
export async function persistSafetyDeclarations(args: {
  admin: MinimalSafetyClient;
  userId: string;
  raw: unknown;
  memberIds: readonly string[];
  contentLocale: string;
  sourceMessageId: string;
}): Promise<SafetyWriteOutcome> {
  const reading = readSafetyDeclarations({
    raw: args.raw,
    memberIds: args.memberIds,
  });
  if (reading.declarations.length === 0) {
    return {
      written: [],
      proposed: reading.proposed,
      refused: reading.refused.total,
      failed: 0,
    };
  }

  const written: SafetyDeclaration[] = [];
  let failed = 0;

  for (const d of reading.declarations) {
    try {
      if (d.memberId === null) {
        // ⚠️ MÊMES COLONNES QUE LA LANE DE CONVERSATION — figé par un test.
        const { error } = await args.admin
          .from("student_safety_constraints")
          .insert({
            user_id: args.userId,
            kind: d.kind,
            allergen_ref: d.ref,
            substance_ref: null,
            medication_class: null,
            condition_ref: null,
            severity: DEFAULT_SEVERITY[d.kind] ?? "medical",
            declared_by: "student",
            notes: d.text || null,
            content_locale: args.contentLocale,
            source_message_id: args.sourceMessageId,
          });
        // ⛔ UN DOUBLON N'EST PAS UN ÉCHEC. La contrainte d'unicité dit que le
        // fait est DÉJÀ protégé; le compter en `failed` ferait lire « la
        // protection n'a pas pu s'écrire » là où elle est déjà là.
        if (error && String(error.code ?? "") !== "23505") throw new Error(error.message);
        written.push(d);
        continue;
      }

      const rpc = MEMBER_DIET_KINDS.has(d.kind)
        ? await args.admin.rpc("keel_household_set_member_diet", {
          p_member: d.memberId,
          p_diet: d.ref,
        })
        : await args.admin.rpc("keel_household_add_allergy", {
          p_member: d.memberId,
          p_label: d.ref,
        });
      if (rpc?.error) throw new Error(String(rpc.error.message ?? rpc.error));
      // ⛔ `{ok:false}` N'EST PAS UNE RÉUSSITE. Les `keel_household_*` ne lèvent
      // pas: elles rendent un motif. Ne pas lire `ok` écrirait « c'est
      // enregistré » sur un refus de la base.
      const body = rpc?.data as Record<string, unknown> | null;
      if (body && typeof body === "object" && body.ok === false) {
        throw new Error(`refus « ${String(body.reason)} »`);
      }
      written.push(d);
    } catch (error) {
      failed += 1;
      console.error("keel.draft_note_safety.write_failed", {
        kind: d.kind,
        // ⚠️ AUCUN `ref` NI TEXTE DANS LE JOURNAL. Un journal n'est pas
        // l'endroit où recopier ce qu'une personne a écrit sur sa santé.
        attributed: d.memberId !== null,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    written,
    proposed: reading.proposed,
    refused: reading.refused.total,
    failed,
  };
}
