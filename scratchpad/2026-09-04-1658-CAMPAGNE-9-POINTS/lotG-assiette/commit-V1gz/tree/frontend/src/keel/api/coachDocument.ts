/**
 * LE DÉPÔT D'UN DOCUMENT DU COACH — les octets, et les refus qui viennent avant.
 *
 * ── POURQUOI CE MODULE EXISTE À CÔTÉ DE `coachDoctrine.ts` ───────────────
 * Deux écrans consomment le même dépôt: `/coach/doctrine` reçoit le brouillon,
 * `/coach/protocol` reçoit les propositions d'aliments. Le premier appelle, le
 * second lit ce que l'appel a parqué. Mettre l'encodage dans la page de la
 * doctrine ferait de la page de la doctrine une dépendance de l'autre.
 *
 * ── LES PLAFONDS NE SONT PAS RECOPIÉS ICI ────────────────────────────────
 * Ils sont IMPORTÉS du module Deno que le serveur exécute. Un plafond écrit
 * deux fois finit par différer, et la différence se manifeste toujours dans le
 * même sens désagréable: le bouton accepte, le serveur rejette, et le coach a
 * attendu l'aller-retour d'un fichier de six mégaoctets pour l'apprendre.
 * Même discipline que `coachDoctrine.ts`, qui importe le compilateur plutôt
 * que de le réécrire.
 */

import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
} from "../../../../supabase/functions/_shared/keel/doctrine_document.ts";
import { supabase } from "../../lib/supabase";
import type { DoctrineDraft } from "./coachDoctrine";

export { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_PAGES };

/** Le plafond, dit comme un humain le lit. */
export const MAX_DOCUMENT_MB = Math.round(MAX_DOCUMENT_BYTES / 1_000_000);

export interface CompileDocumentResult {
  draft: DoctrineDraft;
  issues: string[];
  page_count: number;
  proposals_saved: number;
  proposals_already_pending: number;
}

/**
 * Les octets → base64, par tranches.
 *
 * `String.fromCharCode(...bytes)` sur six mégaoctets dépasse la taille de pile
 * des arguments et jette un `RangeError` — sur un fichier assez gros, donc
 * exactement dans le cas que ce module existe pour servir. La tranche de 32 ko
 * est celle de `PlanImportPage`, qui a déjà rencontré le problème.
 */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Ce qu'on refuse AVANT d'encoder quoi que ce soit.
 *
 * Rendre un message plutôt que jeter: l'appelant l'affiche tel quel sous le
 * champ de fichier. Une exception obligerait chaque écran à traduire un code en
 * phrase, et le deuxième écran le traduirait autrement.
 */
export function rejectDocument(file: File): string | null {
  const type = String(file.type ?? "").toLowerCase();
  const looksPdf = type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!looksPdf) {
    return "That needs to be a PDF. Export your document as one and try again.";
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `That file is ${(file.size / 1_000_000).toFixed(1)} MB, and the limit is ` +
      `${MAX_DOCUMENT_MB} MB. Split it, or export it without the images.`;
  }
  if (file.size === 0) return "That file is empty.";
  return null;
}

/**
 * Dépose le document et rend le brouillon fusionné.
 *
 * `mergeInto` est le brouillon actuellement à l'écran. Le passer est ce qui
 * distingue « ajouter à ce que j'ai » de « repartir de ce document »: la
 * décision appartient au coach, pas à ce module, donc elle voyage en paramètre
 * plutôt que d'être devinée à partir de l'état.
 */
export async function compileDocument(
  file: File,
  options: { mergeInto: DoctrineDraft | null; contentLocale: string },
): Promise<CompileDocumentResult> {
  const rejection = rejectDocument(file);
  if (rejection) throw new Error(rejection);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? "";

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/coach-doctrine-v1`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "compile_document",
        media: { mime_type: "application/pdf", base64: toBase64(bytes) },
        file_name: file.name,
        content_locale: options.contentLocale,
        merge_into: options.mergeInto,
      }),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(explain(json, res.status));
  }
  return json as CompileDocumentResult;
}

/**
 * Le code du serveur → une phrase qui dit quoi faire.
 *
 * `document_too_long` est le cas qui justifie cette fonction: « HTTP 413 »
 * envoie le coach chercher une panne, « ton document fait 240 pages, la limite
 * est 120 » lui dit de le découper. Les codes inconnus passent tels quels
 * plutôt que d'être absorbés dans un « something went wrong » — un code brut
 * reste diagnosticable, un message générique ne l'est pas.
 */
function explain(json: Record<string, unknown>, status: number): string {
  const code = String(json?.error ?? "");
  switch (code) {
    case "document_must_be_pdf":
      return "That needs to be a PDF.";
    case "document_too_large":
      return `That file is over ${MAX_DOCUMENT_MB} MB. Split it, or export it without the images.`;
    case "document_too_long":
      return `That document is ${json.page_count} pages and the limit is ${
        json.max_pages ?? MAX_DOCUMENT_PAGES
      }. Split it and upload the parts one at a time — each one adds to what is already here.`;
    case "document_unreadable":
      return "That PDF could not be opened. If it is password-protected, export an unlocked copy.";
    case "compile_unparseable":
      return "The document was read but the result came back malformed. Try again.";
    case "":
      return `HTTP ${status}`;
    default:
      return code;
  }
}
