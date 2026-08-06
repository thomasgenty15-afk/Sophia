import React from "react";

import { supabase } from "../../lib/supabase";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import {
  confirmMemoryItem,
  dismissedFrom,
  type FoodPreferenceOrigin,
  type FoodPreferenceProposal,
  ignorableTokens,
  keptFrom,
  loadFoodPreferenceProposals,
  originFrom,
  type PreferenceRecheck,
  preferencesWorthRechecking,
  reconcileKeptPreferences,
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
//
// ── CE QUI DEVIENT D'UNE LIGNE GARDÉE QUAND L'ÉLÈVE REVIENT DESSUS ────────
// Mesuré sur trois semaines de conversation réelle: rien. Le texte gardé était
// une chaîne détachée de son souvenir, et la 3e semaine servait au générateur
// « aime le brocoli rôti » ET « n'aime pas le brocoli ». Deux choses le
// corrigent, et elles sont complémentaires:
//   · `reconcileKeptPreferences` retire ici ce que la mémoire a démenti, pour
//     que l'élève le VOIE disparaître;
//   · `reconcileFoodPreferencesFor` fait la même chose côté serveur, à la
//     génération, pour l'élève qui ne rouvre jamais cet écran.
// La mémoire décide de la péremption; cet écran ne fabrique aucun délai.
//
// ── ET QUAND LE MEMORIZER NE RELIE RIEN ───────────────────────────────────
// Le lien `superseded` est NON DÉTERMINISTE: mesuré le 2026-08-06, le même
// scénario a produit un lien en français et AUCUN en anglais. Quand il manque,
// la réconciliation ne peut rien et les deux lignes restent ici pour toujours.
// La vue datée sauve le PROMPT, pas l'écran. D'où le rappel discret sur la
// ligne ancienne — qui n'affirme PAS qu'elle est fausse (on n'en sait rien),
// seulement que l'élève est revenu sur le sujet depuis. C'est lui qui tranche.

const COPY = {
  // ── LE TITRE COUVRE LES DEUX CHOSES QUE LA CARTE PORTE ────────────────────
  // Depuis l'élargissement du 2026-08-06, elle ne tient plus seulement des
  // goûts: « travaille de nuit trois fois par semaine » et « cuisine partagée,
  // batch cooking le dimanche » y arrivent aussi, parce que ce sont elles qui
  // décident de ce qu'on peut raisonnablement proposer à manger. Un titre qui
  // ne parlerait que de goûts ferait passer une contrainte de travail pour un
  // caprice alimentaire — et l'élève la retirerait.
  title: "What you have told me about your eating and your week",
  subtitle:
    "Picked up from your conversations — what you like, and what your week actually " +
    "allows. Keep what is right, edit it, or drop it: what you keep is used when your " +
    "week is put together.",
  suggested: "Worth keeping?",
  keep: "Keep",
  update: "Update",
  replaces: "replaces",
  recheck_prefix: "You came back to this on",
  recheck_suffix: "— still right?",
  drop: "Not right",
  yours: "In your plan",
  edit: "Edit",
  remove: "Remove",
  save: "Save",
  cancel: "Cancel",
  empty:
    "Nothing yet. Tell me in Chat what you like, what you cannot stand, and when your " +
    "week leaves you no time to cook — it turns up here.",
  no_goal: "Set your goal above first — this is saved alongside it.",
  saving: "Saving…",
  // MÊME LIEN QUE LES TROIS CARTES VOISINES. Il n'apparaît QUE s'il y a quelque
  // chose à replier: sur une carte vide, « Change » ouvrirait du néant et
  // l'élève y perdrait la seule phrase utile — celle qui dit d'où viennent ces
  // lignes et comment en produire.
  open: "Change",
  close: "Close",
  // Replié, on dit COMBIEN il y en a: « rien » et « quatre lignes que je ne vois
  // plus » sont deux états différents, et le second doit rester lisible.
  summary_one: "1 thing you have told me",
  summary_many: "{count} things you have told me",
  summary_pending: " · {count} waiting for you",
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
  // Le PRÉNOM, et il n'est pas décoratif: le memorizer met le prénom de l'élève
  // en tête de chaque résumé, donc sans lui toutes les lignes « se recoupent »
  // et le rappel devient du bruit qu'on apprend à ignorer.
  const [firstName, setFirstName] = React.useState<string | null>(null);
  /**
   * REPLIÉE PAR DÉFAUT, comme les cartes voisines — SAUF quand une suggestion
   * attend une décision.
   *
   * Les propositions ne sont pas persistées: tant qu'elles ne sont ni gardées ni
   * écartées, elles reviennent à chaque ouverture de l'écran. Les cacher
   * derrière un repli les ferait attendre indéfiniment pendant que le générateur
   * compose sans elles. Le résumé les compte quand même, pour l'élève qui a
   * replié la carte lui-même.
   */
  const [open, setOpen] = React.useState(false);

  const kept = keptFrom(props.practicalConstraints);
  const dismissed = dismissedFrom(props.practicalConstraints);
  const origin = originFrom(props.practicalConstraints);

  // Les lignes sur lesquelles l'élève est revenu depuis. Recalculées à chaque
  // rendu plutôt que mises en état: c'est une fonction pure des contraintes et
  // du prénom, et un état de plus serait un état de plus à désynchroniser.
  const rechecks = React.useMemo(
    () =>
      preferencesWorthRechecking({
        practicalConstraints: props.practicalConstraints,
        ignoreTokens: ignorableTokens(firstName),
      }),
    [props.practicalConstraints, firstName],
  );
  const recheckOf = (text: string): PreferenceRecheck | undefined =>
    rechecks.find((r) => r.text === text);

  // Les propositions se recalculent à chaque changement des contraintes: garder
  // une ligne doit la faire disparaître des suggestions sans rechargement.
  //
  // LA RÉCONCILIATION PASSE D'ABORD. Proposer un remplaçant à côté de la ligne
  // qu'il dément afficherait la contradiction à l'élève avant de la lui faire
  // trancher — et un « Keep » posé là empilerait les deux.
  //
  // `constraints` et `onSaved` sont sortis de `props` AVANT l'effet: c'est ce
  // que demande `react-hooks/exhaustive-deps`, et ce n'est pas cosmétique —
  // dépendre de `props` entier relancerait la réconciliation à chaque rendu du
  // parent, donc une écriture en base par frappe de clavier voisine.
  const { practicalConstraints, onSaved } = props;
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", uid)
          .maybeSingle();
        if (!cancelled) {
          setFirstName(
            String((profile as { full_name?: string } | null)?.full_name ?? "")
              .trim().split(/\s+/)[0] || null,
          );
        }
        const fresh = await reconcileKeptPreferences({
          userId: uid,
          practicalConstraints,
        });
        if (fresh.changed) {
          await saveFoodPreferences({
            userId: uid,
            practicalConstraints,
            kept: fresh.kept,
            dismissed: dismissedFrom(practicalConstraints),
            origin: fresh.origin,
          });
          if (!cancelled) await onSaved();
          return; // `onSaved` relit; l'effet repart sur les contraintes à jour.
        }
        const found = await loadFoodPreferenceProposals({
          userId: uid,
          practicalConstraints,
        });
        if (!cancelled) {
          setProposals(found);
          // Une suggestion en attente OUVRE la carte: repliée, elle attendrait
          // indéfiniment pendant que le générateur compose sans elle.
          if (found.length > 0) setOpen(true);
        }
      } catch {
        // Muet: une suggestion qu'on n'a pas su charger laisse la carte
        // utilisable pour ce qui est déjà gardé. Perdre l'écran pour une
        // proposition serait le mauvais arbitrage.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [practicalConstraints, onSaved]);

  async function persist(
    nextKept: string[],
    nextDismissed: string[],
    nextOrigin: Record<string, FoodPreferenceOrigin> = origin,
  ) {
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
        origin: nextOrigin,
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
  //
  // Et quand la proposition REMPLACE une ligne gardée, elle la retire dans la
  // même écriture. Ajouter à côté serait garder les deux moitiés d'une
  // contradiction et les servir ensemble au générateur.
  const keepProposal = (p: FoodPreferenceProposal) => {
    const without = p.replaces
      ? kept.filter((k) => k.toLowerCase() !== p.replaces!.toLowerCase())
      : kept;
    const nextOrigin = { ...origin };
    if (p.replaces) delete nextOrigin[p.replaces.toLowerCase()];
    nextOrigin[p.text.toLowerCase()] = { item: p.memoryItemId, at: p.seenAt ?? null };
    // Le clic EST la confirmation explicite: le souvenir cesse d'être candidat.
    void confirmMemoryItem(p.memoryItemId);
    return persist([...without, p.text], [...dismissed, p.memoryItemId], nextOrigin);
  };

  const dropProposal = (p: FoodPreferenceProposal) =>
    persist(kept, [...dismissed, p.memoryItemId]);

  const removeKept = (text: string) => {
    const nextOrigin = { ...origin };
    delete nextOrigin[text.toLowerCase()];
    return persist(kept.filter((k) => k !== text), dismissed, nextOrigin);
  };

  // L'ORIGINE SUIT LE TEXTE RÉÉCRIT: une ligne éditée reste la même
  // préférence, donc elle doit rester retirable quand la mémoire la dément.
  const commitEdit = (from: string) => {
    const to = draft.trim();
    const next = to
      ? kept.map((k) => (k === from ? to : k))
      : kept.filter((k) => k !== from);
    const nextOrigin = { ...origin };
    const sourceId = nextOrigin[from.toLowerCase()];
    delete nextOrigin[from.toLowerCase()];
    if (to && sourceId) nextOrigin[to.toLowerCase()] = sourceId;
    setEditing(null);
    setDraft("");
    return persist(next, dismissed, nextOrigin);
  };

  // Rien à replier tant qu'il n'y a ni ligne gardée ni proposition: la carte
  // vide EST sa propre explication, et la plier cacherait la seule phrase qui
  // dit comment la remplir.
  const foldable = props.hasGoal && (kept.length > 0 || proposals.length > 0);
  const summary = kept.length === 1
    ? COPY.summary_one
    : COPY.summary_many.replace("{count}", String(kept.length));

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <SectionLabel className="mb-0">{COPY.title}</SectionLabel>
        {foldable && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="shrink-0 text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
          >
            {open ? COPY.close : COPY.open}
          </button>
        )}
      </div>

      <>
        {/* Repliée, elle dit ce qu'elle contient — y compris qu'il reste des
            suggestions à trancher, qui sinon attendraient sans que personne le
            sache. */}
        {foldable && !open && (
          <p className="mt-2 text-sm text-gray-800">
            {kept.length > 0 ? summary : COPY.subtitle}
            {proposals.length > 0 && (
              <span className="text-gray-500">
                {COPY.summary_pending.replace("{count}", String(proposals.length))}
              </span>
            )}
          </p>
        )}

        {(!foldable || open) && (
          <p className="mt-2 text-sm text-gray-600">{COPY.subtitle}</p>
        )}

        {!props.hasGoal && (
          <p className="mt-3 text-sm text-gray-500">{COPY.no_goal}</p>
        )}

        {props.hasGoal && (!foldable || open) && (
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
                        {p.replaces && (
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {COPY.replaces}{" "}
                            <span className="line-through">{p.replaces}</span>
                          </span>
                        )}
                      </span>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void keepProposal(p)}
                      >
                        {p.replaces ? COPY.update : COPY.keep}
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
                            {recheckOf(text) && (
                              <span className="mt-0.5 block text-xs text-amber-700">
                                {COPY.recheck_prefix} {recheckOf(text)!.newerAt}{" "}
                                {COPY.recheck_suffix}
                              </span>
                            )}
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
      </>
    </Card>
  );
}
