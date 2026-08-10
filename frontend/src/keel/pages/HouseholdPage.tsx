import React from "react";

import { useAuth } from "../../context/AuthContext";
import {
  addRestriction,
  createHousehold,
  ENVY_MAX_CHARS,
  envyRound,
  generateHouseholdMeal,
  type HouseholdMealView,
  type HouseholdMemberView,
  type HouseholdView,
  inviteToHousehold,
  loadEnvies,
  loadHousehold,
  loadHouseholdMeal,
  loadRestrictions,
  removeRestriction,
  type RestrictionView,
  restrictionNotice,
  submitEnvy,
} from "../api/household";
import { t } from "../i18n/t";
import KeelAppShell from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";

// KEEL — /app/household.
//
// LE FOYER: qui mange ici, ce dont chacun a envie, et ce que la maison ne sert
// pas. Autorité produit: docs/keel/PIVOT-FOYER.md §8.
//
// ── LA DÉCISION QUI GOUVERNE TOUT L'ÉCRAN (§8.5 règle 4) ───────────────────
// Il y a DEUX autorités dans ce produit, et cet écran est le seul endroit où
// elles se croisent visuellement. Elles ne doivent jamais se ressembler:
//
//   SOPHIA        explique, ne bloque jamais.       — ailleurs dans le produit
//   COMPTE MAÎTRE restreint, sous conditions.       — ICI, et nommément
//
// D'où le libellé de chaque restriction: « Not served here — {owner} decided
// that ». Jamais « ce n'est pas recommandé », jamais une raison de santé. Faire
// passer une décision parentale pour une vérité nutritionnelle est le mensonge
// que §8.5 interdit, et le jour où l'enfant s'en aperçoit, plus rien de ce que
// dit Sophia n'a de poids.
//
// ── LA GARDE DE MONTAGE ────────────────────────────────────────────────────
// Rien n'est rendu avant la première lecture. Un formulaire monté sur du vide
// affiche des champs que personne n'a lus, puis les écrase au premier Save
// (leçon `mount-snapshot-forms-need-a-loading-gate`).

type Loading = "loading" | "ready" | "error";

export default function HouseholdPage(): React.ReactElement {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [phase, setPhase] = React.useState<Loading>("loading");
  const [household, setHousehold] = React.useState<HouseholdView | null>(null);
  const [restrictions, setRestrictions] = React.useState<RestrictionView[]>([]);
  const [envies, setEnvies] = React.useState<Array<{ userId: string; body: string }>>([]);
  const [meal, setMeal] = React.useState<HouseholdMealView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const weekStart = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const refresh = React.useCallback(async () => {
    if (!userId) return;
    try {
      const hh = await loadHousehold(userId);
      setHousehold(hh);
      if (hh) {
        setRestrictions(await loadRestrictions());
        setEnvies(await loadEnvies(weekStart));
        setMeal(await loadHouseholdMeal(weekStart));
      }
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [userId, weekStart]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(action: () => Promise<{ ok: boolean; reason: string }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      // LE MOTIF DE REFUS EST AFFICHÉ TEL QUEL, pas traduit en « une erreur est
      // survenue »: c'est la seule information utile, et l'écran a une clé pour
      // chacun des motifs que la base peut rendre.
      if (!res.ok) setError(res.reason);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return (
      <KeelAppShell title={t("household.title")}>
        <div className="p-4 text-sm text-neutral-500">…</div>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell title={t("household.title")}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        {error ? (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        {!household
          ? <CreateCard busy={busy} onCreate={(n) => run(() => createHousehold(n))} />
          : (
            <>
              <MembersCard household={household} restrictions={restrictions} />
              <EnvyCard
                household={household}
                envies={envies}
                busy={busy}
                onSubmit={(body) => run(() => submitEnvy(weekStart, body))}
              />
              <ComposeCard household={household} onDone={refresh} />
              {meal ? <TableCard meal={meal} /> : null}
              <RestrictionsCard
                household={household}
                restrictions={restrictions}
                busy={busy}
                onAdd={(m, l) => run(() => addRestriction(m, l))}
                onRemove={(id) => run(() => removeRestriction(id))}
              />
              <InviteCard household={household} busy={busy} />
            </>
          )}
      </div>
    </KeelAppShell>
  );
}

function CreateCard(
  { busy, onCreate }: { busy: boolean; onCreate: (name: string) => void },
) {
  const [name, setName] = React.useState("");
  // ── LE CHOIX DU MODE A DISPARU (lot 2, 2026-08-10) ────────────────────────
  // Il fallait cocher « famille » ou « colocation », et ce choix gouvernait le
  // droit de restreindre et la visibilité des objectifs. La colocation est
  // sortie du produit: un foyer est un foyer, et la personne qui cuisine
  // gouverne le menu. Un écran de moins, une question de moins, et surtout plus
  // aucune façon de se tromper de mode en s'inscrivant.

  return (
    <Card>
      <SectionLabel>{t("household.empty.title")}</SectionLabel>
      <p className="mb-3 text-sm text-neutral-600">{t("household.empty.body")}</p>
      <Field label={t("household.create.name")}>
        <input
          className={inputClass}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Button
        className="mt-3"
        disabled={busy || !name.trim()}
        onClick={() => onCreate(name.trim())}
      >
        {t("household.create.submit")}
      </Button>
    </Card>
  );
}

function MembersCard(
  { household, restrictions }: { household: HouseholdView; restrictions: RestrictionView[] },
) {
  return (
    <Card>
      <SectionLabel>{t("household.members.title")}</SectionLabel>
      <ul className="flex flex-col gap-2">
        {household.members.map((m) => {
          const mine = restrictions.filter((r) => r.memberId === m.memberId);
          return (
            <li key={m.memberId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{m.displayName}</span>
              {m.role === "owner"
                ? <Badge>{t("household.members.owner")}</Badge>
                : null}
              {/* L'ÉTIQUETTE, JAMAIS L'ÂGE. Un enfant n'a pas à voir son âge
                  affiché sur un écran que tout le foyer regarde.
                  ⚠️ `unknown` ne porte AUCUNE étiquette: écrire « adulte » par
                  défaut affirmerait un fait qu'on n'a pas. */}
              {m.ageState === "minor" ? <Badge>{t("household.members.child")}</Badge> : null}
              {mine.map((r) => (
                <span key={r.id} className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-600">
                  {r.label}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function EnvyCard(
  { household, envies, busy, onSubmit }: {
    household: HouseholdView;
    envies: Array<{ userId: string; body: string }>;
    busy: boolean;
    onSubmit: (body: string) => void;
  },
) {
  const mine = envies.find((e) => e.userId === household.me?.userId);
  const [body, setBody] = React.useState(mine?.body ?? "");
  const round = envyRound(household, envies);

  return (
    <Card>
      <SectionLabel>{t("household.envy.title")}</SectionLabel>
      <p className="mb-3 text-sm text-neutral-600">{t("household.envy.body")}</p>
      <textarea
        className={`${inputClass} min-h-[80px]`}
        value={body}
        maxLength={ENVY_MAX_CHARS}
        placeholder={t("household.envy.placeholder")}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button disabled={busy || !body.trim()} onClick={() => onSubmit(body.trim())}>
          {t("household.envy.save")}
        </Button>
        {/* LE SILENCE EST COMPTÉ, PAS RÉCLAMÉ. Aucun bouton « relancer »
            n'existe ici, et c'est le sujet: si celui qui tient le foyer devait
            courir après tout le monde, on aurait recréé la charge mentale
            qu'on promet de supprimer (§10.3). */}
        <span className="text-sm text-neutral-500">
          {t("household.envy.spoken", { count: round.spoken.length })}
          {" · "}
          {t("household.envy.silent", { count: round.silent.length })}
        </span>
      </div>
    </Card>
  );
}

/*
 * ── LA CARTE DE CONSENTEMENT A ÉTÉ RETIRÉE (lot 2, 2026-08-10) ──────────────
 *
 * Elle permettait à un majeur d'accepter, puis de révoquer, le droit du compte
 * maître de lui poser des interdits. Elle protégeait un adulte d'un autre
 * adulte, dans un monde où chaque bouche avait un compte.
 *
 * Le modèle arrêté le 2026-08-08 dit qu'une seule personne gouverne le menu —
 * c'est ce qui évite le marécage d'un arbitrage entre un parent et son enfant.
 * LA CONTREPARTIE N'EST PAS RIEN, et elle est plus bas dans ce fichier: chaque
 * contrainte reste affichée AVEC QUI L'A POSÉE (`restrictionNotice`). Ce qui
 * distingue ce modèle du contrôle coercitif, c'est que rien n'est secret.
 */

function RestrictionsCard(
  { household, restrictions, busy, onAdd, onRemove }: {
    household: HouseholdView;
    restrictions: RestrictionView[];
    busy: boolean;
    onAdd: (memberUserId: string, label: string) => void;
    onRemove: (id: string) => void;
  },
) {
  const me = household.me;
  const isOwner = me?.role === "owner";
  const [target, setTarget] = React.useState<string>("");
  const [label, setLabel] = React.useState("");

  const selected = household.members.find((m) => m.memberId === target) ?? null;

  // CÔTÉ MEMBRE RESTREINT: la MÊME donnée, attribuée. §8.5 règle 3.
  const mine = restrictions.filter((r) => r.memberId === me?.memberId);

  if (!isOwner) {
    if (mine.length === 0) return null;
    return (
      <Card>
        <SectionLabel>{t("household.restriction.title")}</SectionLabel>
        <ul className="flex flex-col gap-1 text-sm">
          {mine.map((r) => {
            const notice = restrictionNotice(household, r);
            return (
              <li key={r.id}>
                <span className="font-medium">{r.label}</span>{" — "}
                <span className="text-neutral-600">
                  {notice.kind === "set_by_me"
                    ? t("household.restriction.notice_me")
                    : t("household.restriction.notice_owner", { owner: notice.ownerName })}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel>{t("household.restriction.title")}</SectionLabel>
      <ul className="mb-3 flex flex-col gap-1 text-sm">
        {restrictions.map((r) => {
          const who = household.members.find((m) => m.memberId === r.memberId);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{who?.displayName ?? "—"}</span>
              <span>{r.label}</span>
              <button
                className="text-neutral-500 underline"
                disabled={busy}
                onClick={() => onRemove(r.id)}
              >
                {t("household.restriction.remove")}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        {/* Le libellé du sélecteur et celui du bouton sont DEUX clés
            différentes. Les avoir partagées faisait apparaître « Add a food »
            deux fois de suite à l'écran — vu au navigateur, pas deviné. */}
        <Field label={t("household.restriction.for_whom")}>
          <select
            className={inputClass}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">—</option>
            {household.members
              .filter((m) => m.memberId !== me?.memberId)
              .map((m) => (
                <option key={m.memberId} value={m.memberId}>{m.displayName}</option>
              ))}
          </select>
        </Field>
        <input
          // `min-w-0`: un enfant flex ne rétrécit pas sous son contenu sans lui,
          // et la ligne déborde à 320 px (leçon `flex-child-min-width-auto`).
          className={`${inputClass} min-w-0 flex-1`}
          value={label}
          maxLength={120}
          placeholder={t("household.restriction.placeholder")}
          onChange={(e) => setLabel(e.target.value)}
        />
        {/* PLUS DE MOTIF DE BLOCAGE À AFFICHER. `restrictionBlock` anticipait
            le refus de la base — colocation, consentement du majeur — et ces
            règles n'existent plus: le compte maître pose une contrainte sur
            n'importe quelle bouche de son foyer, et elle est attribuée. Le seul
            refus que la base rende encore est structurel (`not_owner`,
            `not_a_member`), et cette carte n'est rendue qu'au compte maître. */}
        <Button
          disabled={busy || !selected || !label.trim()}
          onClick={() => selected && onAdd(selected.memberId, label.trim())}
        >
          {t("household.restriction.add")}
        </Button>
      </div>
    </Card>
  );
}

function InviteCard(
  { household, busy }: { household: HouseholdView; busy: boolean },
) {
  const [email, setEmail] = React.useState("");
  const [token, setToken] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  if (household.me?.role !== "owner") return null;

  return (
    <Card>
      <SectionLabel>{t("household.invite.title")}</SectionLabel>
      <p className="mb-3 text-sm text-neutral-600">{t("household.invite.body")}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label={t("household.invite.email")}>
          <input
            className={`${inputClass} min-w-0`}
            value={email}
            type="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button
          disabled={busy || working || !email.trim()}
          onClick={async () => {
            setWorking(true);
            setToken(null);
            setReason(null);
            try {
              const res = await inviteToHousehold(email.trim());
              if (res.ok) setToken(String(res.token ?? ""));
              else setReason(res.reason);
            } finally {
              setWorking(false);
            }
          }}
        >
          {t("household.invite.submit")}
        </Button>
      </div>
      {/* LE JETON N'EST RENDU QU'UNE FOIS, par la RPC. On l'affiche donc en
          entier: le regénérer plus tard produirait un second lien, et deux
          liens vivants pour une même personne est exactement ce que
          `consumed_at` existe pour éviter. */}
      {token ? (
        <div className="mt-3 text-sm">
          <p className="mb-1 text-neutral-600">{t("household.invite.link_ready")}</p>
          <code className="block overflow-x-auto rounded bg-neutral-100 p-2 text-xs">
            {`${globalThis.location?.origin ?? ""}/join-household?token=${token}`}
          </code>
        </div>
      ) : null}
      {/* LISTE FERMÉE, et le typecheck l'exige: `t()` n'accepte pas une clé
          construite à la volée. C'est la bonne contrainte — un motif que la
          RPC ajouterait sans étiquette d'affichage casserait la compilation
          plutôt que d'afficher une clé brute à l'utilisateur. */}
      {reason ? (
        <p className="mt-2 text-sm text-neutral-600">{inviteErrorText(reason)}</p>
      ) : null}
    </Card>
  );
}

/** Réexporté pour le test de route: la page monte sans foyer sans exploser. */
export type { HouseholdMemberView };

/**
 * Le motif de refus d'invitation, traduit — liste FERMÉE.
 *
 * Un motif inconnu rend `null` plutôt qu'une clé brute: afficher
 * `household.invite.error.something` à quelqu'un est pire que ne rien
 * afficher, et le silence force à ajouter l'étiquette au lieu de la tolérer.
 */
function inviteErrorText(reason: string): string | null {
  switch (reason) {
    case "rate_limited":
      return t("household.invite.error.rate_limited");
    case "bad_email":
      return t("household.invite.error.bad_email");
    case "not_owner":
      return t("household.invite.error.not_owner");
    default:
      return null;
  }
}

function ComposeCard(
  { household, onDone }: { household: HouseholdView; onDone: () => Promise<void> },
) {
  const [working, setWorking] = React.useState(false);
  const [silent, setSilent] = React.useState<number | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  // SEUL LE COMPTE MAÎTRE COMPOSE. Ce n'est pas une hiérarchie de confort: la
  // composition RETIRE le plan courant de la personne pour qui elle est écrite,
  // donc laisser n'importe quel membre la déclencher laisserait un colocataire
  // effacer la semaine d'un autre. La fonction edge refuse déjà (403); l'écran
  // ne montre pas un bouton qui sera refusé.
  if (household.me?.role !== "owner") return null;

  return (
    <Card>
      <SectionLabel>{t("household.compose.title")}</SectionLabel>
      <p className="mb-3 text-sm text-neutral-600">{t("household.compose.body")}</p>
      <Button
        disabled={working}
        onClick={async () => {
          setWorking(true);
          setFailure(null);
          setSilent(null);
          try {
            const res = await generateHouseholdMeal({
              window: { kind: "until_sunday" },
              intent: "prepare_next",
            });
            // QUI S'EST TU EST DIT APRÈS COUP, jamais réclamé avant. Le plan
            // sort quand même — c'est la règle de survie du conseil de famille
            // (§8.4) — mais le foyer doit savoir pour qui on a composé d'office.
            setSilent(res.silent.length);
            await onDone();
          } catch (e) {
            setFailure(e instanceof Error ? e.message : String(e));
          } finally {
            setWorking(false);
          }
        }}
      >
        {working ? t("household.compose.working") : t("household.compose.submit")}
      </Button>
      {silent !== null && silent > 0 ? (
        <p className="mt-2 text-sm text-neutral-600">
          {t("household.compose.silent_note", { count: silent })}
        </p>
      ) : null}
      {failure ? <p className="mt-2 text-sm text-red-700">{failure}</p> : null}
    </Card>
  );
}

/**
 * À TABLE — qui met quoi dans son assiette.
 *
 * ── POURQUOI ICI ET PAS SUR `/app/plan` ───────────────────────────────────
 * Le plan montre ce qu'on CUISINE; ceci montre comment on SERT. Et c'est la
 * seule vue du produit qui n'a de sens qu'à plusieurs — la mettre sur le plan
 * ferait porter un bloc vide au chemin individuel, qui est le majoritaire.
 *
 * ── AUCUNE RAISON N'EST AFFICHÉE, PARCE QU'IL N'Y EN A PAS ────────────────
 * `portion_note` est une INSTRUCTION DE SERVICE, garantie sans raison ni
 * vocabulaire de corps par `sanitizePortionNote` côté serveur. C'est ce qui
 * permet d'afficher toute la table à tout le monde: l'instruction est
 * publique, le pourquoi ne l'est pas.
 */
function TableCard({ meal }: { meal: HouseholdMealView }) {
  if (meal.portions.length === 0) return null;
  return (
    <Card>
      <SectionLabel>{t("household.portions.title")}</SectionLabel>
      <ul className="flex flex-col gap-3">
        {meal.portions.map((p) => (
          <li key={p.memberId}>
            <p className="text-sm">
              <span className="font-medium">{p.displayName}</span>
              {" — "}
              <span className="text-neutral-600">
                {p.portionNote ?? t("household.portions.standard")}
              </span>
            </p>
            {p.shares.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5 pl-4 text-sm text-neutral-500">
                {p.shares.map((s) => <li key={s.preparationId}>{s.note}</li>)}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
