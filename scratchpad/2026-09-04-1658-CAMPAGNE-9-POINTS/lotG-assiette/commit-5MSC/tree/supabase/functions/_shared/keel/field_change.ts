/**
 * QUAND L'IA CHANGE UN CHAMP QUE LA PERSONNE A REMPLI — lot M5.
 *
 * Autorité produit: `scratchpad/2026-08-21-DESIGN-MEMOIRE.md` §2.4 ① et §3.5 M5.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CE MODULE FERME, ET IL EST MESURÉ
 * ═══════════════════════════════════════════════════════════════════════════
 * Jusqu'ici, un `logistics.set` retenu ne changeait PAS le champ: il vivait
 * dans un magasin à part, et les deux générateurs le posaient **en mémoire, à
 * la lecture**, juste avant de composer:
 *
 *     goalRow.practical_constraints = { ...practical_constraints, ...patch }
 *
 * Conséquence: la personne ouvre ses réglages, y lit **45 min**, et son plan est
 * composé sur **35**. Rien à l'écran ne le dit, rien ne peut le défaire, et la
 * seule façon de le découvrir est de relire deux prompts côte à côte.
 *
 * ⛔ **C'est une décision du produit qu'aucun écran ne montre** — précisément ce
 * que le design nomme comme le vice de fond: *« toute décision du produit peut
 * être expliquée en montrant un écran »*.
 *
 * **Le renversement**: l'IA écrit DANS le champ. Le champ est visible, il est
 * éditable, et le changement porte sa cause.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI UNE ENTRÉE DE JOURNAL, ALORS QUE M2 S'EN ÉTAIT PASSÉ
 * ═══════════════════════════════════════════════════════════════════════════
 * Le centre de notifications de M2 est une **vue** sur les lignes retenues, et
 * c'était le bon choix: rien à persister, rien à purger, rien qui puisse
 * diverger. « Défaire » y est trivial — la ligne se retire.
 *
 * Un scalaire n'a pas cette propriété. `cooking_time_min: 35` ne se « retire »
 * pas: il faut savoir qu'il valait **45**. Sans la valeur d'avant, le seul
 * geste possible est *« retape ce que tu avais »* — c'est-à-dire demander à la
 * personne de se souvenir d'un nombre que le produit lui a effacé.
 *
 * ⇒ **Écrire dans un champ FORCE le journal.** Ce n'est pas un choix
 * d'architecture, c'est la conséquence de la forme de la donnée, et il faut
 * l'écrire ici pour que personne ne croie qu'on a cédé à la facilité.
 *
 * ⚠️ ET IL EST PLAFONNÉ. *« Un plafond force une décision. L'absence de plafond
 * force l'accumulation. »* Le journal vit dans le jsonb de la personne; sans
 * borne il grossirait à chaque bilan, pour toujours, dans une colonne que cinq
 * lecteurs traversent.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CE QUE `previous` VEUT DIRE, ET LE PIÈGE QU'IL PORTE
 * ═══════════════════════════════════════════════════════════════════════════
 * `previous` est la valeur **relue en base au moment de l'écriture**, jamais
 * une valeur héritée d'un calcul plus haut. La cicatrice est nommée dans ce
 * dépôt: *« `current` périmé efface l'écriture d'avant »* — deux écritures sur
 * `practical_constraints`, et « le bouton ne fait rien ».
 *
 * `previous: null` est LÉGITIME et distinct de `previous: undefined`: il dit
 * « le champ n'était pas renseigné ». Défaire, alors, c'est le retirer — pas
 * le mettre à zéro.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire. Le jour arrive
 * toujours en paramètre.
 */

import {
  LOGISTICS_FIELDS,
  type RetainedSource,
  RETAINED_QUOTE_MAX_CHARS,
  parseRetainedDay,
  parseRetainedSource,
} from "./retained_item.ts";

/** La clé du journal, dans `student_goals.practical_constraints`. */
export const FIELD_CHANGES_KEY = "field_changes";

/**
 * LES CHAMPS QU'UN PRODUCTEUR A LE DROIT DE CHANGER. Liste FERMÉE.
 *
 * ⛔ ELLE EST DÉRIVÉE DE `LOGISTICS_FIELDS`, PAS RETAPÉE — plus `eating_rhythm`,
 * qui est le champ du rythme et vit dans la même colonne. Une seconde liste
 * écrite à la main serait celle qu'on oublierait de mettre à jour, et le jour
 * où un sixième champ logistique apparaîtrait, un producteur pourrait l'écrire
 * sans que personne ne l'ait décidé.
 *
 * ⛔ ET AUCUN CHAMP DE SÉCURITÉ N'Y EST, NI N'Y SERA. Une allergie a sa table
 * (`student_safety_constraints`), chargée à chaque tour, sans ranking, et
 * **vérifiée sur la sortie**. Un champ de préférence est une consigne de prompt
 * sans contrôle en sortie: y ranger une allergie lui retirerait sa ceinture.
 */
export const WRITABLE_FIELDS = [
  ...LOGISTICS_FIELDS,
  "eating_rhythm",
  // ── ⟳ A2 (2026-09-03) · LES DEUX RÉPONSES DE P2 ────────────────────────
  //
  // ⛔ ELLES SONT AJOUTÉES **ICI** ET PAS DANS `LOGISTICS_FIELDS`, ET LE MOTIF
  // EST UNE FRONTIÈRE, PAS UN RACCOURCI. `LOGISTICS_FIELDS` est la liste que
  // `parseLogisticsSetValue` sait LIRE d'une note de brouillon (`logistics.set`)
  // et que `draft_note_classify` ÉNUMÈRE au modèle. Y ranger `cooking_style`
  // apprendrait au modèle à écrire le style d'une personne depuis une phrase
  // libre — un réglage durable posé par une devinette de texte.
  //
  // Ce que ces deux clés SONT: des champs qu'un PRODUCTEUR (le questionnaire de
  // fin de plan, l'écran de composition) a le droit de changer, avec une trace.
  // C'est exactement ce que `WRITABLE_FIELDS` nomme.
  //
  // ⚠️ LA RECOPIE SQL SUIT DANS LE MÊME LOT (`20260903171000`): la boucle de
  // `keel_write_field_changes_for` et son contrôle ⑤ exigent la même liste, et
  // le port refuserait `forbidden_field` sur un style descendu d'un cran.
  "cooking_style",
  "grocery_runs",
] as const;
export type WritableField = (typeof WRITABLE_FIELDS)[number];

/**
 * LE PLAFOND DU JOURNAL.
 *
 * ⚠️ C'EST UN PLAFOND DE CONSERVATION, PAS D'AFFICHAGE — et c'est la différence
 * avec le fil de M2. Le fil est une vue: il coupe l'affichage, rien ne se perd.
 * Ici on jette vraiment, parce que le journal est la seule chose de ce chantier
 * qui grossisse sans que la personne l'ait demandé.
 *
 * Vingt: assez pour couvrir plusieurs bilans d'affilée (un bilan produit au
 * plus cinq changements), assez peu pour qu'un jsonb de profil ne devienne pas
 * un historique. Ce qui tombe est le plus ANCIEN, et ce qui tombe n'est plus
 * défaisable en un clic — la personne garde la porte ② du design: le champ,
 * qu'elle voit et qu'elle édite.
 */
export const FIELD_CHANGES_MAX = 20;

/**
 * UN CHANGEMENT DE CHAMP, tel qu'il se raconte.
 *
 * Les trois choses du §2.5, et pas moins:
 *   ① ce qui a changé — `field`, `previous` → `next`;
 *   ② la phrase source, CITÉE — `quote`;
 *   ③ de quoi faire le geste inverse — `previous`, justement.
 */
export interface FieldChange {
  readonly field: WritableField;
  /** La valeur relue en base juste avant l'écriture. `null` = pas renseigné. */
  readonly previous: unknown;
  /** Ce que le producteur a écrit. */
  readonly next: unknown;
  /** Le jour, `YYYY-MM-DD`. Requis: un changement sans date ne se situe pas. */
  readonly at: string;
  /** Qui l'a écrit. Jamais `written`: la personne ne se notifie pas elle-même. */
  readonly source: Exclude<RetainedSource, "written">;
  /**
   * ⛔ LES MOTS DE LA PERSONNE — lot M2, même règle et même raison.
   * *« Sans la citation, "Défaire" est un pari. »* Ici c'est pire qu'ailleurs:
   * le geste ne retire pas une ligne, il REMET un nombre. Sans savoir pourquoi
   * il a bougé, la personne ne peut pas décider s'il devait bouger.
   */
  readonly quote: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Le jeton, s'il est dans la liste fermée. Sinon `null` — jamais un repli. */
export function parseWritableField(value: unknown): WritableField | null {
  const slug = String(value ?? "").trim();
  return (WRITABLE_FIELDS as readonly string[]).includes(slug)
    ? slug as WritableField
    : null;
}

/**
 * Lit une entrée. `null` à la première chose illisible.
 *
 * ⛔ AUCUN REPLI, NULLE PART. Une entrée dont on ne saurait pas dire le champ,
 * la cause ou la valeur d'avant est une entrée qui ne sait pas défaire — et une
 * entrée qui ne sait pas défaire est pire qu'absente: elle affiche un bouton
 * qui ment.
 */
export function parseFieldChange(value: unknown): FieldChange | null {
  const row = asRecord(value);
  if (!row) return null;

  const field = parseWritableField(row.field);
  if (!field) return null;

  const at = parseRetainedDay(row.at);
  if (!at) return null;

  const source = parseRetainedSource(row.source);
  // ⛔ `written` EST REFUSÉ ICI. La personne qui édite son propre champ n'a
  // rien à se faire notifier, et une entrée `written` mettrait dans le fil un
  // « défaire » sur un geste qu'elle vient de faire exprès. Le refus est aussi
  // la garde du contournement: un producteur serveur déguisé en `written`
  // passerait toute la matrice par un seul mot.
  if (!source || source === "written") return null;

  const quote = typeof row.quote === "string" ? row.quote.trim() : "";
  if (!quote) return null;

  // `previous` peut valoir n'importe quoi de lisible, `null` compris — c'est
  // « le champ n'était pas renseigné ». `undefined` (clé absente) est en
  // revanche un refus: on ne saurait pas quoi remettre.
  if (!("previous" in row)) return null;
  if (!("next" in row)) return null;

  return {
    field,
    previous: row.previous ?? null,
    next: row.next ?? null,
    at,
    source,
    quote: quote.slice(0, RETAINED_QUOTE_MAX_CHARS),
  };
}

/**
 * Lit la liste. Une entrée difforme TOMBE SEULE et laisse ses voisines —
 * patron `parseRetainedItems`.
 */
export function parseFieldChanges(value: unknown): FieldChange[] {
  if (!Array.isArray(value)) return [];
  const out: FieldChange[] = [];
  for (const entry of value) {
    const change = parseFieldChange(entry);
    if (change) out.push(change);
  }
  return out;
}

/** Les entrées stockées sous la clé, lues défensivement. */
export function fieldChangesFrom(
  pc: Record<string, unknown> | null | undefined,
): FieldChange[] {
  return parseFieldChanges((pc ?? {})[FIELD_CHANGES_KEY]);
}

export function fieldChangeToJson(change: FieldChange): Record<string, unknown> {
  return {
    field: change.field,
    previous: change.previous,
    next: change.next,
    at: change.at,
    source: change.source,
    quote: change.quote,
  };
}

/**
 * LE JOURNAL APRÈS AJOUT — les plus récentes DEVANT, plafonné.
 *
 * ⚠️ LES NEUVES DEVANT, ET C'EST CE QUI REND LE PLAFOND SÛR. Avec les neuves
 * derrière, `slice(0, MAX)` jetterait ce qu'on vient d'écrire dès que le
 * journal est plein — c'est-à-dire exactement l'entrée que la personne a le
 * plus de chances de vouloir défaire.
 *
 * ⛔ IL NE DÉDOUBLONNE PAS. Deux bilans qui baissent le temps de cuisine sont
 * deux changements réels, et les fondre en un ferait perdre la valeur
 * intermédiaire — donc la possibilité de revenir au point de départ.
 *
 * PURE: rend un tableau neuf, ne touche pas l'entrée.
 */
export function withFieldChanges(
  pc: Record<string, unknown> | null | undefined,
  added: readonly FieldChange[],
): Record<string, unknown> {
  const base = { ...(pc ?? {}) };
  const kept = fieldChangesFrom(pc);
  const next = [...added, ...kept].slice(0, FIELD_CHANGES_MAX);
  base[FIELD_CHANGES_KEY] = next.map(fieldChangeToJson);
  return base;
}

/**
 * LE PATCH DES CHAMPS EUX-MÊMES — ce que le producteur veut écrire.
 *
 * ⚠️ SÉPARÉ DU JOURNAL, ET LES DEUX SONT ÉCRITS ENSEMBLE PAR L'APPELANT. Les
 * dissocier dans le temps produirait l'état qu'on ne veut jamais: un champ
 * changé sans sa cause (indéfaisable), ou une cause sans changement (un fil qui
 * annonce ce qui n'a pas eu lieu).
 */
export function patchOf(changes: readonly FieldChange[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  // Le DERNIER gagne: `changes` arrive dans l'ordre de production, et deux
  // changements du même champ dans un même lot se succèdent.
  for (const change of changes) patch[change.field] = change.next;
  return patch;
}

/**
 * DÉFAIRE — le champ revient à sa valeur d'avant, et l'entrée quitte le journal.
 *
 * ⚠️ `previous === null` RETIRE LA CLÉ au lieu d'écrire `null`. Les deux se
 * relisent différemment: une clé absente veut dire « jamais renseigné », un
 * `null` veut dire « renseigné à rien ». Écrire le second là où le premier
 * était vrai inventerait une déclaration que la personne n'a pas faite — et
 * plusieurs lecteurs de cette colonne distinguent les deux.
 *
 * ⛔ AUCUNE RECHERCHE PAR VALEUR. L'entrée à défaire est désignée par sa
 * POSITION dans le journal, parce que deux changements du même champ le même
 * jour sont indiscernables autrement — et défaire le mauvais remettrait un
 * nombre que la personne n'a jamais eu.
 */
export function undoFieldChange(
  pc: Record<string, unknown> | null | undefined,
  index: number,
): Record<string, unknown> | null {
  const kept = fieldChangesFrom(pc);
  if (!Number.isInteger(index) || index < 0 || index >= kept.length) return null;
  const target = kept[index];
  const base = { ...(pc ?? {}) };
  if (target.previous === null) delete base[target.field];
  else base[target.field] = target.previous;
  base[FIELD_CHANGES_KEY] = kept
    .filter((_, i) => i !== index)
    .map(fieldChangeToJson);
  return base;
}
