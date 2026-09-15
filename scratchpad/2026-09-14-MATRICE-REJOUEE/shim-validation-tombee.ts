/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 3 — LA PANNE DE VALIDATION, DANS LE VRAI HANDLER, SANS DRAPEAU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CE FICHIER N'EST PAS. Ce n'est pas un interrupteur de production :
 * `supabase/functions/_shared/keel/plan_publication.ts` n'est PAS modifié, et
 * le handler n'apprend rien de ce fichier. C'est une CARTE D'IMPORT
 * (`--import-map`), un outil de test, qui ne vit que dans `scratchpad/`.
 *
 * ⛔ CE QU'IL REMPLACE, ET RIEN D'AUTRE : la fonction `validate` passée à
 * `decidePlanPublication`. Le reste — l'ordre des quatre portes, la décision,
 * `publish` — est la fonction de PRODUCTION, importée telle quelle.
 * `?reel=1` empêche la carte de se remapper sur elle-même.
 *
 * ⚠️ DEUX MODES, ET ILS NE SE CONFONDENT PAS :
 *   · `LOT3_PANNE=controle` — le CONTRÔLE jette  ⇒ refus, ZÉRO publication.
 *   · `LOT3_PANNE=journal`  — le JOURNAL jette   ⇒ le plan part quand même.
 */
export {
  runValidation,
} from "../../supabase/functions/_shared/keel/plan_publication.ts?reel=1";
export type {
  GateDeliveryLike,
  OutputLockSurvey,
  PlanPublicationOutcome,
  ValidationRun,
} from "../../supabase/functions/_shared/keel/plan_publication.ts?reel=1";
import { decidePlanPublication as vraieDecision } from "../../supabase/functions/_shared/keel/plan_publication.ts?reel=1";

const MODE = (Deno.env.get("LOT3_PANNE") ?? "").trim();

export const decidePlanPublication: typeof vraieDecision = ((args: Parameters<typeof vraieDecision>[0]) => {
  if (MODE === "controle") {
    console.error(
      "   ⛔ SHIM : le relevé final des surfaces JETTE (panne de CONTRÔLE).",
    );
    return vraieDecision({
      ...args,
      validate: () => {
        throw new TypeError("lot3: relevé des surfaces indisponible");
      },
    });
  }
  if (MODE === "journal") {
    console.error(
      "   ⚠️ SHIM : le JOURNAL du relevé jette (panne de TRACE, pas de contrôle).",
    );
    return vraieDecision({
      ...args,
      journal: () => {
        throw new TypeError("lot3: journal du relevé indisponible");
      },
    });
  }
  return vraieDecision(args);
}) as typeof vraieDecision;
