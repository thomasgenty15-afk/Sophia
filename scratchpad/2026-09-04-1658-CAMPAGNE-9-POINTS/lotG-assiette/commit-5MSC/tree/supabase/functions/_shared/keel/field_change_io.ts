/**
 * LE PORT D'ÉCRITURE SERVEUR DES CHAMPS — lot M5.
 *
 * Socle: `field_change.ts`. RPC: `keel_write_field_changes_for`
 * (migration `20260901180000`). Jumeau de `retained_items_io.ts`, et sa forme
 * est délibérément la même — un appelant qui connaît l'un sait lire l'autre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LE PATCH ET LE JOURNAL PARTENT ENSEMBLE, OU PAS DU TOUT
 * ═══════════════════════════════════════════════════════════════════════════
 * La RPC les écrit dans un seul énoncé, et ce module ne propose aucun moyen de
 * les dissocier. Les séparer produirait l'un des deux états qu'on ne veut
 * jamais:
 *   · un champ changé sans sa cause → indéfaisable, et inexplicable à la
 *     personne qui le découvre;
 *   · une cause sans changement → un fil qui annonce ce qui n'a pas eu lieu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ LE TÉMOIN EST PRIS ICI, PAS HÉRITÉ
 * ═══════════════════════════════════════════════════════════════════════════
 * `expected` est l'état des champs TOUCHÉS tel que l'appelant vient de le lire.
 * La course est réelle: la personne ouvre ses réglages et met 60 minutes
 * pendant que le bilan calcule 30 depuis 45. Sans témoin, le bilan écraserait
 * un réglage qu'elle venait de choisir, et le symptôme serait « le bouton ne
 * fait rien » — cicatrice nommée du dépôt.
 *
 * ⛔ CE MODULE N'ÉCHOUE JAMAIS VERS SON APPELANT. Il rend un résultat, jamais
 * une exception — posture de `retained_items_io.ts`: on parle de réglages de
 * cuisine, et personne ne perd son dîner parce qu'un champ n'a pas atterri.
 * Mais **l'échec est DICIBLE**: `ok: false` porte toujours un `reason`.
 */

import {
  type FieldChange,
  fieldChangeToJson,
  patchOf,
  WRITABLE_FIELDS,
} from "./field_change.ts";

/** ⚠️ ÉPINGLÉ À LA MIGRATION PAR LE TEST. Un nom qui diverge rend `PGRST202`. */
export const FIELD_CHANGES_WRITE_RPC = "keel_write_field_changes_for";

export type MinimalClient = {
  rpc: (name: string, params: Record<string, unknown>) => Promise<
    { data: unknown; error: { message: string } | null }
  >;
};

/**
 * Pourquoi l'écriture n'a pas eu lieu — ou qu'elle a eu lieu (`written`).
 *
 * Les six derniers viennent de la RPC, tels quels: un appelant qui veut réagir
 * à un motif précis le compare à une valeur, pas à une chaîne devinée.
 */
export const FIELD_CHANGES_WRITE_REASONS = [
  "written",
  "bad_args",
  "nothing_to_write",
  "forbidden_field",
  "rpc_failed",
  "no_user",
  "no_goal_row",
  "stale_snapshot",
  "bad_patch",
  "bad_changes",
  "unknown",
] as const;
export type FieldChangesWriteReason =
  (typeof FIELD_CHANGES_WRITE_REASONS)[number];

export interface FieldChangesWriteOutcome {
  readonly ok: boolean;
  readonly reason: FieldChangesWriteReason;
  readonly written: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reasonOf(value: unknown): FieldChangesWriteReason {
  const slug = String(value ?? "").trim();
  return (FIELD_CHANGES_WRITE_REASONS as readonly string[]).includes(slug)
    ? slug as FieldChangesWriteReason
    : "unknown";
}

/**
 * ÉCRIT LES CHAMPS ET LEUR CAUSE.
 *
 * @param expected l'état des champs touchés, RELU par l'appelant à quelques
 *   millisecondes d'ici. `{}` est un témoin légitime: il dit « aucune de ces
 *   clés n'existait ».
 * @param changes ce que le producteur vient de produire. Le journal complet
 *   (ancien + neuf, plafonné) est calculé par l'appelant via `withFieldChanges`
 *   — ce module ne relit pas la base pour le fabriquer, parce qu'une seconde
 *   lecture serait une seconde chance de partir d'un état périmé.
 */
export async function persistFieldChangesFor(args: {
  admin: MinimalClient;
  userId: string;
  source: string;
  expected: Record<string, unknown>;
  changes: readonly FieldChange[];
  journal: readonly FieldChange[];
}): Promise<FieldChangesWriteOutcome> {
  const source = String(args?.source ?? "").trim() || "unknown_caller";
  const userId = String(args?.userId ?? "").trim();
  const changes = args?.changes ?? [];

  const warn = (event: string, detail: Record<string, unknown>) =>
    console.warn(JSON.stringify({
      tag: "keel/field_changes_write",
      event,
      ...detail,
    }));

  if (!args?.admin || !userId) {
    warn("refused", { source, user_id: userId, reason: "bad_args" });
    return { ok: false, reason: "bad_args", written: 0 };
  }
  if (changes.length === 0) {
    return { ok: false, reason: "nothing_to_write", written: 0 };
  }

  // ⛔ LA LISTE FERMÉE MORD ICI AUSSI, avant la base. La RPC la tient aussi
  // (`forbidden_field`), et les deux étages sont nécessaires: le SQL protège
  // contre un appelant qu'on n'a pas écrit, celui-ci nomme le défaut à
  // l'endroit où on peut le corriger. Un refus qui n'arrive qu'en SQL se lit
  // comme une panne de base.
  const stray = changes.find(
    (change) =>
      !(WRITABLE_FIELDS as readonly string[]).includes(String(change.field)),
  );
  if (stray) {
    warn("refused", {
      source,
      user_id: userId,
      reason: "forbidden_field",
      field: String(stray.field),
    });
    return { ok: false, reason: "forbidden_field", written: 0 };
  }

  try {
    const { data, error } = await args.admin.rpc(FIELD_CHANGES_WRITE_RPC, {
      p_user: userId,
      p_expected: args.expected ?? {},
      p_patch: patchOf(changes),
      p_changes: (args.journal ?? []).map(fieldChangeToJson),
    });
    if (error) {
      warn("rpc_failed", { source, user_id: userId, error: error.message });
      return { ok: false, reason: "rpc_failed", written: 0 };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    const ok = row.ok === true;
    const reason = ok ? "written" : reasonOf(row.reason);
    (ok ? console.info : console.warn)(JSON.stringify({
      tag: "keel/field_changes_write",
      event: ok ? "written" : "not_written",
      source,
      user_id: userId,
      reason,
      // ⚠️ LES CHAMPS SONT NOMMÉS, LEURS VALEURS NON. Le journal dit ce qui a
      // bougé; recopier ce que la personne mange ou dépense dans un log serait
      // un second magasin, celui-là sans écran ni effacement.
      fields: changes.map((change) => change.field),
      asked: changes.length,
    }));
    return { ok, reason, written: ok ? changes.length : 0 };
  } catch (error) {
    warn("rpc_failed", { source, user_id: userId, error: messageOf(error) });
    return { ok: false, reason: "rpc_failed", written: 0 };
  }
}
