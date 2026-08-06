import React from "react";

import { supabase } from "../../lib/supabase";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import {
  dismissedFrom,
  type FoodPreferenceProposal,
  keptFrom,
  loadFoodPreferenceProposals,
  saveFoodPreferences,
} from "../api/foodPreferences";

// CE QUE TU M'AS DIT SUR TA BOUFFE — la carte qui ferme la boucle.
//
// ── LE DÉFAUT QU'ELLE CORRIGE ──────────────────────────────────────────────
// L'élève dit « je déteste le brocoli » dans la conversation. Le memorizer le
// retient, Sophia le lui ressort au bon moment — et le plan composé trois jours
// plus tard lui remet du brocoli, parce qu'aucun des deux générateurs ne lit la
// mémoire.
//
// ── POURQUOI UN ÉCRAN, ET PAS UN BRANCHEMENT DIRECT ────────────────────────
// `memory_items` est un magasin PROBABILISTE (confiance, ranking, statut
// `candidate`). Ce dépôt a la cicatrice: la seule trace qu'une allergie
// laissait était un item `candidate`, « le magasin probabiliste que
// l'architecture interdit précisément pour ça ». Faire confirmer transforme une
// inférence en fait déclaré — et rend la chose éditable et évitable, ce qui est
// la moitié de la demande.
//
// ── CE QUI N'ARRIVE JAMAIS ICI ─────────────────────────────────────────────
// Rien de `sensitive` ni de `safety`. Une allergie n'est pas une préférence:
// elle a sa table (`student_safety_constraints`), synchrone et sans ranking.
// Le filtre est posé DANS la requête, pas seulement à l'affichage.

const COPY = {
  title: "What you have told me about your eating",
  subtitle:
    "Picked up from your conversations. Keep what is right, edit it, or drop it — " +
    "what you keep is used when your week is put together.",
  suggested: "Worth keeping?",
  keep: "Keep",
  drop: "Not right",
  yours: "In your plan",
  edit: "Edit",
  remove: "Remove",
  save: "Save",
  cancel: "Cancel",
  empty:
    "Nothing yet. Tell me what you like, hate or cannot cook in Chat, and it turns up here.",
  no_goal: "Set your goal above first — this is saved alongside it.",
  saving: "Saving…",
} as const;

export interface FoodPreferencesCardProps {
  /** `false` tant qu'aucune ligne `student_goals` n'existe: rien à mettre à jour. */
  hasGoal: boolean;
  /** Les autres clés de `practical_constraints`, à ne pas écraser. */
  practicalConstraints: Record<string, unknown>;
  onSaved: () => void | Promise<void>;
}

export default function FoodPreferencesCard(props: FoodPreferencesCardProps) {
  const [proposals, setProposals] = React.useState<FoodPreferenceProposal[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const kept = keptFrom(props.practicalConstraints);
  const dismissed = dismissedFrom(props.practicalConstraints);

  // Les propositions se recalculent à chaque changement des contraintes: garder
  // une ligne doit la faire disparaître des suggestions sans rechargement.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const found = await loadFoodPreferenceProposals({
          userId: uid,
          practicalConstraints: props.practicalConstraints,
        });
        if (!cancelled) setProposals(found);
      } catch {
        // Muet: une suggestion qu'on n'a pas su charger laisse la carte
        // utilisable pour ce qui est déjà gardé. Perdre l'écran pour une
        // proposition serait le mauvais arbitrage.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.practicalConstraints]);

  async function persist(nextKept: string[], nextDismissed: string[]) {
    setBusy(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("not signed in");
      await saveFoodPreferences({
        userId: uid,
        practicalConstraints: props.practicalConstraints,
        kept: nextKept,
        dismissed: nextDismissed,
      });
      await props.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Garder marque AUSSI l'item comme traité: la proposition n'est pas
  // persistée, donc sans ça elle reviendrait à chaque ouverture de l'écran.
  const keepProposal = (p: FoodPreferenceProposal) =>
    persist([...kept, p.text], [...dismissed, p.memoryItemId]);

  const dropProposal = (p: FoodPreferenceProposal) =>
    persist(kept, [...dismissed, p.memoryItemId]);

  const removeKept = (text: string) =>
    persist(kept.filter((k) => k !== text), dismissed);

  const commitEdit = (from: string) => {
    const to = draft.trim();
    const next = to
      ? kept.map((k) => (k === from ? to : k))
      : kept.filter((k) => k !== from);
    setEditing(null);
    setDraft("");
    return persist(next, dismissed);
  };

  return (
    <section>
      <SectionLabel>{COPY.title}</SectionLabel>
      <Card>
        <p className="text-sm text-gray-600">{COPY.subtitle}</p>

        {!props.hasGoal && (
          <p className="mt-3 text-sm text-gray-500">{COPY.no_goal}</p>
        )}

        {props.hasGoal && (
          <>
            {proposals.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {COPY.suggested}
                </p>
                <ul className="mt-2 space-y-2">
                  {proposals.map((p) => (
                    <li
                      key={p.memoryItemId}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 text-sm text-gray-800">
                        {p.text}
                      </span>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void keepProposal(p)}
                      >
                        {COPY.keep}
                      </Button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void dropProposal(p)}
                        className="text-xs text-gray-500 underline"
                      >
                        {COPY.drop}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {COPY.yours}
              </p>
              {kept.length === 0 && proposals.length === 0 && (
                <p className="mt-2 text-sm text-gray-600">{COPY.empty}</p>
              )}
              <ul className="mt-2 space-y-2">
                {kept.map((text) => (
                  <li key={text} className="flex flex-wrap items-center gap-2">
                    {editing === text
                      ? (
                        <>
                          <input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                          />
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void commitEdit(text)}
                          >
                            {COPY.save}
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(null);
                              setDraft("");
                            }}
                            className="text-xs text-gray-500 underline"
                          >
                            {COPY.cancel}
                          </button>
                        </>
                      )
                      : (
                        <>
                          <span className="min-w-0 flex-1 text-sm text-gray-800">
                            {text}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditing(text);
                              setDraft(text);
                            }}
                            className="text-xs text-gray-500 underline"
                          >
                            {COPY.edit}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeKept(text)}
                            className="text-xs text-gray-500 underline"
                          >
                            {COPY.remove}
                          </button>
                        </>
                      )}
                  </li>
                ))}
              </ul>
            </div>

            {busy && <p className="mt-2 text-xs text-gray-500">{COPY.saving}</p>}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </>
        )}
      </Card>
    </section>
  );
}
