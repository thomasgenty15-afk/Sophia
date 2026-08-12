import React from "react";

import { type GeneratedMealResult, validateMealPlan } from "../api/mealGeneration";
import { validationRefusalKey } from "../copy/planRefusals";
import { t } from "../i18n/t";
import { Button, ButtonLink } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";

// KEEL — L8/O2 · PRENDRE LA MAIN SUR SA SEMAINE (D2, D7, D9).
//
// Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md.
//
// ══════════════════════════════════════════════════════════════════════════
// C'EST LA GÂCHETTE QUI MANQUAIT À TOUT LE CHANTIER.
//
// `keel_validate_meal_plan` existe depuis le 2026-08-11, elle est idempotente
// sous concurrence, elle est gardée, elle est testée — et AUCUNE surface
// produit ne l'appelait. Le registre l'a écrit trois lots de suite (O2):
// personne ne peut valider ⇒ personne ne prend la main ⇒ rien n'est jamais
// proposé au maître ⇒ ni fusion, ni défusion, ni avertissement. Sept lots de
// serveur reposaient sur un geste que personne ne pouvait faire.
// ══════════════════════════════════════════════════════════════════════════
//
// ── CE QUE CETTE CARTE DIT, ET DANS CET ORDRE ─────────────────────────────
//   1. LA POSTURE PAR DÉFAUT, ET ELLE N'EST PAS UN MANQUE. Ne rien faire, être
//      composé dans le plan du foyer comme une bouche ordinaire, est le cas
//      NORMAL et le plus courant. La troisième question ouverte du registre est
//      « comment un secondaire sait-il qu'il PEUT prendre la main ? » — et la
//      réponse ne doit pas être une carte qui lui reproche de ne pas l'avoir
//      fait. Aucune phrase d'ici ne dit qu'il faudrait.
//   2. CE QUE ÇA COÛTE, dit avant le bouton: prendre la main, c'est cuisiner et
//      faire ses courses soi-même. Le registre est explicite — « celui qui a
//      pris la main assume sa cuisson et ses courses ».
//   3. LE GESTE.
//
// ── LA GARDE DE MONTAGE ───────────────────────────────────────────────────
// `place === null` ⇒ RIEN. Tant qu'on ne SAIT pas si cette personne est dans un
// foyer et à quel titre, on n'affiche ni « tu peux prendre la main » (faux pour
// un compte individuel) ni la note du maître (fausse pour tout le monde
// d'autre). Un formulaire monté sur du vide est une cicatrice de ce dépôt.

export interface HouseholdPlace {
  inHousehold: boolean;
  isOwner: boolean;
  householdName: string | null;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function TakeTheHandCard(
  { place, plan, onValidated }: {
    /** `null` tant que la place n'a pas été lue. Voir la garde de montage. */
    place: HouseholdPlace | null;
    /** Le plan de l'onglet REGARDÉ, ou `null` s'il n'y en a pas encore. */
    plan: GeneratedMealResult | null;
    /** Relit les plans: `validated_at` vient de changer en base. */
    onValidated: () => Promise<void> | void;
  },
): React.ReactElement | null {
  const [working, setWorking] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  if (place === null) return null;
  // UN COMPTE SANS FOYER N'A RIEN À PRENDRE. Il n'y a pas d'autre plan que le
  // sien, et « valider » ne changerait le comportement de personne: la date de
  // validation n'est lue que par la composition d'un foyer.
  if (!place.inHousehold) return null;

  // ── LE MAÎTRE (D2, D9) ───────────────────────────────────────────────────
  // Son plan EST le plan du foyer, et sa surface de cuisine n'affiche que
  // celui-là (voir `cookedPlans`). Il n'a donc pas de main à prendre — une
  // ligne, et la porte vers l'écran où il compose vraiment.
  if (place.isOwner) {
    return (
      <Card tone="dashed" className="mb-3">
        <p className="text-sm text-gray-600">{t("plan.hand.owner_note")}</p>
        <ButtonLink to="/app/household" variant="secondary" size="sm" className="mt-2">
          {t("household.title")}
        </ButtonLink>
      </Card>
    );
  }

  const validated = plan?.validatedAt ?? null;

  return (
    <Card tone={validated ? "default" : "dashed"} className="mb-3">
      <SectionLabel>
        {validated ? t("plan.hand.taken_title") : t("plan.hand.title")}
      </SectionLabel>
      <p className="text-sm text-gray-600">
        {validated ? t("plan.hand.taken_body") : t("plan.hand.body")}
      </p>
      {validated
        ? (
          <p className="mt-2 text-sm text-gray-500">
            {t("plan.hand.taken_on", { date: formatDate(validated) })}
          </p>
        )
        : plan
        ? (
          <Button
            className="mt-3"
            variant="primary"
            disabled={working}
            onClick={async () => {
              if (!plan.mealId) return;
              setWorking(true);
              setFailure(null);
              setNote(null);
              try {
                const res = await validateMealPlan(plan.mealId);
                if (!res.ok) {
                  // LE MOTIF NOMMÉ, TRADUIT — liste FERMÉE. Un motif inconnu
                  // sort tel quel plutôt que sous une phrase passe-partout:
                  // `not_a_personal_plan` se rapporte, « une erreur est
                  // survenue » ne se rapporte pas.
                  const key = validationRefusalKey(res.reason);
                  setFailure(key ? t(key) : res.reason);
                  return;
                }
                // ⚠️ `already` EST UN SUCCÈS. La RPC est idempotente sous
                // concurrence — la garde est dans le prédicat de l'`update` —
                // et un double-clic rend `already: true` sans rien redater. Le
                // traiter comme un échec ferait recliquer sur ce qui a marché.
                if (res.already) setNote(t("plan.hand.already"));
                await onValidated();
              } catch (e) {
                setFailure(e instanceof Error ? e.message : String(e));
              } finally {
                setWorking(false);
              }
            }}
          >
            {working ? t("plan.hand.taking") : t("plan.hand.take_cta")}
          </Button>
        )
        // PAS DE PLAN ENCORE: aucun bouton, et c'est voulu. Le geste de
        // validation porte sur un plan précis; l'offrir sans plan promettrait
        // quelque chose que la base refuserait (`not_your_plan`). La carte
        // garde sa première moitié — « tu peux prendre la main » — qui est
        // justement ce qu'il faut lire AVANT d'avoir composé.
        : null}
      {note ? <p className="mt-2 text-sm text-gray-500">{note}</p> : null}
      {failure ? <p className="mt-2 text-sm text-red-700">{failure}</p> : null}
    </Card>
  );
}
