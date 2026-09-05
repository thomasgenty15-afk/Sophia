import React from "react";

import { supabase } from "../../lib/supabase";
import { t } from "../i18n/t";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { inputClass } from "./ui/Field";
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
import { addWrittenFoodLines, type RetainedSubject } from "../api/retainedItems";

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

// ⚠️ LE `COPY` LOCAL DE CETTE CARTE EST PARTI DANS LE SEED (lot 6), sous
// `plan.told.*`. Vingt-deux phrases hors de `t()` — troisième et dernier
// catalogue parallèle de `/app/plan`.

export interface FoodPreferencesCardProps {
  /** `false` tant qu'aucune ligne `student_goals` n'existe: rien à mettre à jour. */
  hasGoal: boolean;
  /** Les autres clés de `practical_constraints`, à ne pas écraser. */
  practicalConstraints: Record<string, unknown>;
  onSaved: () => void | Promise<void>;
  /** Dans la fenêtre de réglages: sans cadre, sans titre, sans repli. */
  embedded?: boolean;
  /**
   * ⟳ 2026-09-06 — ARBITRAGE 2. Quand la page le donne, « Garder » écrit une
   * ligne RETENUE (j'aime / à éviter) au sujet de cette bouche, par la porte
   * de l'écran « Ce que Sophia sait » — ce que le générateur lit. Sans lui,
   * l'ancien geste (liste `food_preferences`, que plus rien ne lit) reste.
   */
  keepAs?: { readonly subject: RetainedSubject; readonly todayLocalIso: string };
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
  // ⟳ 2026-09-06 (arbitrage 2): la proposition devient une ligne retenue, classée
  // par la personne. La proposition sort de la liste (écartée), le souvenir du
  // chat est confirmé, et `food_preferences` n'est plus écrit.
  const keepAsRetained = async (
    p: FoodPreferenceProposal,
    kind: "food.prefer" | "food.exclude",
  ) => {
    if (!props.keepAs) return;
    setBusy(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      await addWrittenFoodLines({
        userId: uid,
        subject: props.keepAs.subject,
        kind,
        foods: [p.text],
        todayLocalIso: props.keepAs.todayLocalIso,
      });
      void confirmMemoryItem(p.memoryItemId);
      await persist(kept, [...dismissed, p.memoryItemId]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
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
  // DANS LA FENÊTRE, RIEN NE SE PLIE. Le repli sert à protéger la page des
  // repas; une section repliée dans un dialogue qu'on a ouvert exprès se lit
  // comme une section absente — et ici, ce qui serait caché, ce sont des
  // suggestions qui attendent une décision.
  const foldable = !props.embedded && props.hasGoal &&
    (kept.length > 0 || proposals.length > 0);
  const summary = kept.length === 1
    ? t("plan.told.summary_one")
    : t("plan.told.summary_many", { count: kept.length });

  const body = (
      <>
        {/* Repliée, elle dit ce qu'elle contient — y compris qu'il reste des
            suggestions à trancher, qui sinon attendraient sans que personne le
            sache. */}
        {foldable && !open && (
          <p className="mt-2 text-sm text-ink">
            {kept.length > 0 ? summary : t("plan.told.subtitle")}
            {proposals.length > 0 && (
              <span className="text-ink-soft">
                {t("plan.told.summary_pending", { count: proposals.length })}
              </span>
            )}
          </p>
        )}

        {/* PAS DANS LA FENÊTRE: `SetupSection` porte déjà cette phrase, en une
            ligne. Les deux ensemble faisaient quatre lignes qui disent la même
            chose en tête d'une section — le mur de texte que la fenêtre existe
            pour supprimer. */}
        {!props.embedded && (!foldable || open) && (
          <p className="mt-2 text-sm text-ink-soft">{t("plan.told.subtitle")}</p>
        )}

        {!props.hasGoal && (
          <p className="mt-3 text-sm text-ink-soft">{t("plan.told.no_goal")}</p>
        )}

        {props.hasGoal && (!foldable || open) && (
          <>
            {proposals.length > 0 && (
              <div className="mt-4">
                <p className="text-label font-semibold uppercase text-ink-soft">
                  {t("plan.told.suggested")}
                </p>
                <ul className="mt-2 space-y-2">
                  {proposals.map((p) => (
                    <li
                      key={p.memoryItemId}
                      className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-paper-2 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 text-sm text-ink">
                        {p.text}
                        {p.replaces && (
                          <span className="mt-0.5 block text-xs text-ink-soft">
                            {t("plan.told.replaces")}{" "}
                            <span className="line-through">{p.replaces}</span>
                          </span>
                        )}
                      </span>
                      {props.keepAs ? (
                        <>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void keepAsRetained(p, "food.prefer")}
                          >
                            {t("plan.told.keep_like")}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void keepAsRetained(p, "food.exclude")}
                          >
                            {t("plan.told.keep_avoid")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void keepProposal(p)}
                        >
                          {p.replaces ? t("plan.told.update") : t("plan.told.keep")}
                        </Button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void dropProposal(p)}
                        className="text-xs text-fig-700 underline hover:text-fig-800"
                      >
                        {t("plan.told.drop")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p className="text-label font-semibold uppercase text-ink-soft">
                {t("plan.told.yours")}
              </p>
              {kept.length === 0 && proposals.length === 0 && (
                <p className="mt-2 text-sm text-ink-soft">{t("plan.told.empty")}</p>
              )}
              <ul className="mt-2 space-y-2">
                {kept.map((text) => (
                  <li key={text} className="flex flex-wrap items-center gap-2">
                    {editing === text
                      ? (
                        <>
                          {/* LA CLASSE DU KIT, PLUS UNE RECOPIE LOCALE. Celle
                              d'ici portait `border-gray-300` et `text-sm` nu:
                              14 px sur téléphone, donc le zoom Safari iOS qui
                              ne se dézoome pas (`Field.tsx`). `inputClass` est
                              `text-base lg:text-sm`, `border-line-strong`
                              (3,84:1) et porte l'anneau de focus `fig-600`.
                              ⚠️ `flex-1` et pas `w-full`: dans une ligne flex
                              c'est `flex-basis: 0%` qui l'emporte sur la
                              largeur, et `min-w-0` est déjà dans `inputClass` —
                              sans lui le champ refuse de rétrécir à 320 px. */}
                          <input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className={`${inputClass} flex-1`}
                          />
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void commitEdit(text)}
                          >
                            {t("plan.told.save")}
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(null);
                              setDraft("");
                            }}
                            className="text-xs text-fig-700 underline hover:text-fig-800"
                          >
                            {t("plan.told.cancel")}
                          </button>
                        </>
                      )
                      : (
                        <>
                          <span className="min-w-0 flex-1 text-sm text-ink">
                            {text}
                            {recheckOf(text) && (
                              <span className="mt-0.5 block text-xs text-amber-700">
                                {t("plan.told.recheck_prefix")} {recheckOf(text)!.newerAt}{" "}
                                {t("plan.told.recheck_suffix")}
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
                            className="text-xs text-fig-700 underline hover:text-fig-800"
                          >
                            {t("plan.told.edit")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeKept(text)}
                            className="text-xs text-fig-700 underline hover:text-fig-800"
                          >
                            {t("plan.told.remove")}
                          </button>
                        </>
                      )}
                  </li>
                ))}
              </ul>
            </div>

            {busy && <p className="mt-2 text-xs text-ink-soft">{t("plan.told.saving")}</p>}
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          </>
        )}
      </>
  );

  // Dans la fenêtre: `SetupSection` porte le cadre, la couleur et le titre.
  if (props.embedded) return body;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <SectionLabel className="mb-0">{t("plan.told.title")}</SectionLabel>
        {foldable && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="shrink-0 text-xs font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
          >
            {open ? t("plan.told.close") : t("plan.told.open")}
          </button>
        )}
      </div>
      {body}
    </Card>
  );
}
