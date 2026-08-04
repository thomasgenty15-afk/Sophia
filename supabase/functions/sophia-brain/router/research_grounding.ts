// Execution du signal needs_research (rose-r6 B01, nina-r6 B03, alex-r2 B02,
// paul-r8 B02, eva-r8 B02 — regression 3de0b9a2 du 30/06 : le consommateur du
// signal avait ete supprime, laissant le dispatcher emettre un flag mort et le
// companion attendre un bloc que rien ne produisait).
//
// Chaine de responsabilite (charte cmd 6): le dispatcher ORIENTE (signal
// structure needs_research — aucune detection ici, cmd 0), ce module EXECUTE
// la recherche, le contexte injecte DECRIT, le composeur PARLE. Honnetete dans
// les deux sens (cmd 7): bloc present → la reponse peut s'y adosser; recherche
// indisponible → directive explicite interdisant tout claim de verification.
import { searchWithGeminiGrounding } from "../../_shared/gemini.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";

/** Doit rester identique au marqueur consomme par agents/companion.ts. */
export const RESEARCH_CONTEXT_MARKER =
  "=== RECHERCHE WEB (informations fraiches) ===";

export type ResearchGroundingLaneResult = {
  /** Bloc a injecter dans le contexte composeur (pin prioritaire companion). */
  context_block: string | null;
  /** Directive d'honnetete quand la recherche etait demandee mais indisponible. */
  honesty_directive: string | null;
  /** Trace courte pour l'observabilite du tour. */
  outcome: "executed" | "empty" | "failed" | "not_requested" | "safety_muted";
};

type SearchFn = typeof searchWithGeminiGrounding;

const HONESTY_DIRECTIVE = [
  "=== RECHERCHE WEB INDISPONIBLE CE TOUR ===",
  "Le user demande une verification ou des informations fraiches, mais la recherche web n'a pas pu etre executee.",
  "Ne dis JAMAIS que tu as verifie, cherche ou consulte internet, et n'affirme aucun chiffre ou etude comme frais/verifie.",
  "Reponds depuis tes connaissances generales en le disant explicitement ('de memoire, a verifier'), et propose de reessayer plus tard si utile.",
].join("\n");

function researchQueryFromTurnFrame(turnFrame: TurnFrame | null): string {
  const signal = (turnFrame as unknown as {
    needs_research?: {
      detected?: boolean;
      value?: boolean;
      query?: string | null;
    } | null;
  } | null)?.needs_research;
  if (!signal || signal.value !== true) return "";
  return String(signal.query ?? "").trim();
}

export async function runResearchGroundingLane(args: {
  turnFrame: TurnFrame | null;
  requestId?: string | null;
  searchFn?: SearchFn;
}): Promise<ResearchGroundingLaneResult> {
  const query = researchQueryFromTurnFrame(args.turnFrame);
  if (!query) {
    return {
      context_block: null,
      honesty_directive: null,
      outcome: "not_requested",
    };
  }
  // Ceinture safety: le dispatcher force deja value=false sur band high
  // (teste au contrat) — si un signal passe malgre tout, aucun appel reseau
  // pendant un moment sensible.
  const riskBand = String(args.turnFrame?.safety?.risk_band ?? "none");
  if (riskBand === "high" || riskBand === "critical") {
    return {
      context_block: null,
      honesty_directive: null,
      outcome: "safety_muted",
    };
  }
  const search = args.searchFn ?? searchWithGeminiGrounding;
  try {
    const result = await search(query, {
      requestId: args.requestId ?? undefined,
      timeoutMs: 20_000,
    });
    const text = String(result?.text ?? "").trim();
    if (!text) {
      return {
        context_block: null,
        honesty_directive: HONESTY_DIRECTIVE,
        outcome: "empty",
      };
    }
    const sources = (result.sources ?? []).filter(Boolean).slice(0, 6);
    const block = [
      RESEARCH_CONTEXT_MARKER,
      `Requete: ${query}`,
      text,
      sources.length > 0 ? `Sources: ${sources.join(" | ")}` : null,
      "Regles: appuie ta reponse sur ce contexte quand il couvre la question (tu peux dire que l'information vient d'une recherche); s'il ne la couvre pas, dis-le au lieu d'extrapoler des chiffres frais.",
    ].filter(Boolean).join("\n");
    return {
      context_block: block,
      honesty_directive: null,
      outcome: "executed",
    };
  } catch (_error) {
    return {
      context_block: null,
      honesty_directive: HONESTY_DIRECTIVE,
      outcome: "failed",
    };
  }
}
