import React from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import CoachBroadcastCard from "../components/CoachBroadcastCard";
import { InviteDialog } from "../components/InviteDialog";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button, ButtonLink } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import {
  type InviteSendState,
  inviteResendMessageKey,
  inviteStateIsReassuring,
  sendStudentInvitation,
} from "../api/inviteStudent";
import { t } from "../i18n/t";
import {
  CONTACT_LABEL,
  type CoachEscalationRow,
  type ContactState,
  contactStateFor,
  countActiveSeats,
  countPendingInvitationsFrom,
  type CoachInvitationRow,
  heldStudents,
  type InvitationState,
  studentNameState,
  visibleInvitations,
} from "../api/coachCohort";

/**
 * KEEL W6.1 — `/coach`: the coach's home. Who they follow, and how many seats
 * that costs.
 *
 * ---------------------------------------------------------------------------
 * TWO SOURCES, ON PURPOSE (the W1 tenancy split)
 * ---------------------------------------------------------------------------
 *   `coach_clients`             — Tier A. The LINK: status, seat state, dates.
 *                                 Structural columns, no student prose, so a
 *                                 plain SELECT policy is enough.
 *   `coach_student_directory`   — Tier B. The student's IDENTITY (full_name,
 *                                 avatar, timezone, locale).
 *
 * Why not just select `profiles`? Because PostgREST grants are per-ROLE and the
 * coach and the student are both `authenticated`: a policy cannot hide a column
 * from one and not the other. `coach_student_directory` is a SECURITY DEFINER
 * view with a column allowlist — it is structurally incapable of returning
 * email, phone_number, birth_date or any billing column. Reading `profiles`
 * here would hand the coach exactly those.
 *
 * ---------------------------------------------------------------------------
 * THE SEAT COUNTER IS THE INVOICE
 * ---------------------------------------------------------------------------
 * `coach_clients.status='active'` is the billable seat (SCHEMA, TENANCY). It is
 * counted from the rows on screen, never from a stored counter — same doctrine
 * as the rest of KEEL: zero incremental counters, derived state recomputed from
 * the rows. `invited`, `paused` and `ended` links appear in the list and are
 * NOT counted, so what the coach sees and what they are billed for cannot
 * diverge.
 *
 * FAIL LOUD, SHOW NOTHING. A failed read renders the error state, never an
 * empty list: "you have no students" and "we could not read your students" are
 * different sentences, and showing the first for the second is how a coach
 * concludes their client lost access.
 */

interface CoachClientRow {
  id: string;
  student_user_id: string | null;
  invited_email: string | null;
  status: "invited" | "active" | "paused" | "ended";
  seat_state: "billed" | "trial" | "free";
  started_at: string | null;
  consent_granted_at: string | null;
  created_at: string;
}

interface DirectoryRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  locale: string | null;
}

interface ContactRow {
  student_user_id: string;
  last_inbound_at: string | null;
  inbound_count_7d: number;
}

interface CoachHomeData {
  clients: CoachClientRow[];
  /**
   * LES INVITATIONS, ET ELLES NE SONT PAS DANS `clients`.
   *
   * `coach-invite-student-v1` n'écrit que `coach_invitations`; la ligne
   * `coach_clients` n'apparaît qu'à l'ACCEPTATION. Une invitation envoyée et non
   * acceptée était donc invisible sur cet écran — et la tuile « en attente »,
   * qui comptait `coach_clients.status='invited'`, affichait un zéro permanent.
   */
  invitations: CoachInvitationRow[];
  directory: Map<string, DirectoryRow>;
  contact: Map<string, ContactRow>;
  /**
   * LES ESCALADES OUVERTES — voir `heldStudents` dans `api/coachCohort.ts` pour
   * ce que cette lecture ferme. Résumé: `generate-week-plan-v1` dit à l'élève
   * mineur « your coach has been told », et personne n'affichait la ligne.
   */
  escalations: CoachEscalationRow[];
  /** La lecture a échoué: on le DIT, on ne rend pas une section vide. */
  escalationsFailed: boolean;
}

const CONTACT_TONE: Record<ContactState, BadgeTone> = {
  responsive: "positive",
  slipping: "caution",
  silent: "critical",
};



type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: CoachHomeData }
  | { kind: "error" };

async function loadCoachHome(coachUserId: string): Promise<CoachHomeData> {
  // The coaches row id is what `coach_clients.coach_id` points at; the RLS
  // policy already scopes the select to this coach, so no filter is needed and
  // none is added (a filter that duplicates a policy is a filter that can drift
  // from it).
  void coachUserId;

  const [clientsRes, directoryRes, contactRes, invitationsRes, escalationsRes] =
    await Promise.all([
    supabase
      .from("coach_clients")
      .select(
        "id, student_user_id, invited_email, status, seat_state, started_at, " +
          "consent_granted_at, created_at",
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("coach_student_directory")
      .select("id, full_name, avatar_url, timezone, locale"),
    // PIVOT §1.4 — WHEN the student last spoke, never WHAT they said. Tier B
    // view: `chat_messages` has no coach policy at all, and that is deliberate
    // (the conversation log is the student's private journal, §1.5).
    supabase
      .from("coach_student_contact")
      .select("student_user_id, last_inbound_at, inbound_count_7d"),
    // Les invitations de CE coach. La policy `coach_invitations_coach_select`
    // existait déjà: le droit de lire était là, personne ne lisait. Le jeton
    // n'est PAS sélectionné — seul son hash est en base, et un écran n'a aucune
    // raison de manipuler de quoi rejouer une invitation.
    supabase
      .from("coach_invitations")
      .select("id, email, status, created_at, expires_at")
      .order("created_at", { ascending: false }),
    // C9 — LES ESCALADES OUVERTES. La policy `contract_change_requests_select_coach`
    // existait déjà (elle scope sur `coached_student_ids()`), et là encore le
    // droit de lire était là sans lecteur. Le filtre est posé ICI et pas dans le
    // rendu: `student_words` est de la prose sur un élève, et une escalade qu'on
    // n'affiche pas n'a aucune raison de descendre dans le navigateur.
    supabase
      .from("contract_change_requests")
      .select("id, user_id, reason_code, status, student_words, created_at")
      .eq("reason_code", "minor_student")
      .eq("status", "open"),
  ]);

  if (clientsRes.error) {
    throw new Error(`[keel/coach] coach_clients failed: ${clientsRes.error.message}`);
  }
  if (directoryRes.error) {
    throw new Error(
      `[keel/coach] coach_student_directory failed: ${directoryRes.error.message}`,
    );
  }

  // A contact read that fails degrades the BADGE, never the screen: knowing
  // who is on the roster matters more than knowing who went quiet, and a coach
  // staring at an error page learns neither.
  const contact = new Map<string, ContactRow>();
  if (!contactRes.error) {
    for (const row of (contactRes.data ?? []) as unknown as ContactRow[]) {
      contact.set(row.student_user_id, row);
    }
  } else {
    console.warn("[keel/coach] coach_student_contact failed", contactRes.error);
  }

  // Même arbitrage que le contact: une lecture ratée dégrade la SECTION, jamais
  // l'écran. Savoir qui est sur le roster compte plus que savoir qui est en
  // attente, et un coach devant une page d'erreur n'apprend ni l'un ni l'autre.
  let invitations: CoachInvitationRow[] = [];
  if (!invitationsRes.error) {
    invitations = (invitationsRes.data ?? []) as unknown as CoachInvitationRow[];
  } else {
    console.warn("[keel/coach] coach_invitations failed", invitationsRes.error);
  }

  // C9 — MÊME FAIL-SOFT, MAIS PAS LE MÊME SILENCE. Un badge « silencieux » qui
  // manque coûte une nuance; une escalade qui manque efface une décision que le
  // produit a promise à l'élève. La section se dégrade donc en AVEU (voir
  // `escalationsFailed` plus bas), jamais en absence.
  let escalations: CoachEscalationRow[] = [];
  let escalationsFailed = false;
  if (!escalationsRes.error) {
    escalations = (escalationsRes.data ?? []) as unknown as CoachEscalationRow[];
  } else {
    escalationsFailed = true;
    console.warn("[keel/coach] contract_change_requests failed", escalationsRes.error);
  }

  const directory = new Map<string, DirectoryRow>();
  for (const row of (directoryRes.data ?? []) as unknown as DirectoryRow[]) {
    directory.set(row.id, row);
  }
  return {
    clients: (clientsRes.data ?? []) as unknown as CoachClientRow[],
    directory,
    contact,
    invitations,
    escalations,
    escalationsFailed,
  };
}

export function CoachHomePage() {
  const { user } = useAuth();
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = React.useState(0);
  /**
   * LE DIALOGUE EST MONTÉ ICI, ET C'EST UNE CORRECTION D'UN DÉFAUT MESURÉ.
   *
   * Il vivait DANS `EmptyState` et DANS `CoachHomeBody`, chacun avec son propre
   * `inviteOpen`. Or inviter déclenche un rechargement, et le rechargement fait
   * précisément BASCULER d'une branche à l'autre — la cohorte n'est plus vide.
   * Le dialogue était donc démonté à la seconde où il avait quelque chose à
   * dire, et sa confirmation partait avec lui.
   *
   * Mesuré au navigateur le 2026-08-05 sur le cas du coach qui a signalé le
   * trou (cohorte vide, une invitation): l'avertissement « aucun email n'est
   * parti » n'était JAMAIS affiché. Un état de succès qui ne survit pas à son
   * propre effet de bord ne se lit pas.
   */
  const [inviteOpen, setInviteOpen] = React.useState(false);
  /**
   * LE RÉSULTAT D'UN RENVOI VIT ICI, AU-DESSUS DU RECHARGEMENT.
   *
   * Renvoyer révoque l'invitation et en réémet une neuve, donc il FAUT recharger
   * pour afficher la nouvelle date. Mais un état posé sur la ligne serait détruit
   * par ce rechargement — exactement le défaut qui rendait invisible
   * l'avertissement « aucun email n'est parti ». On le garde donc au-dessus, et
   * on le retrouve par l'adresse, qui survit à la réémission.
   */
  const [resend, setResend] = React.useState<
    { email: string; state: InviteSendState } | null
  >(null);

  const userId = user?.id ?? null;

  React.useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    setState({ kind: "loading" });
    loadCoachHome(userId)
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  return (
    <KeelAppShell
      variant="coach"
      title={t("coach.home.title")}
      subtitle={t("coach.home.subtitle")}
    >
      {state.kind === "loading" && (
        <p className="text-sm text-gray-500">{t("coach.guard.checking")}</p>
      )}

      {state.kind === "error" && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">{t("coach.home.load_error")}</p>
          <Button
            className="mt-3 border-amber-300 text-amber-900 hover:bg-amber-100"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {t("coach.home.retry")}
          </Button>
        </Card>
      )}

      {state.kind === "ready" && (
        <CoachHomeBody
          data={state.data}
          setInviteOpen={setInviteOpen}
          resend={resend}
          onResent={(outcome) => {
            setResend(outcome);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => setReloadKey((k) => k + 1)}
      />
    </KeelAppShell>
  );
}

function CoachHomeBody({
  data,
  setInviteOpen,
  resend,
  onResent,
}: {
  data: CoachHomeData;
  setInviteOpen: (open: boolean) => void;
  resend: { email: string; state: InviteSendState } | null;
  onResent: (outcome: { email: string; state: InviteSendState }) => void;
}) {
  const activeSeats = countActiveSeats(data.clients);
  // `new Date()` une fois par rendu, passé aux deux appels: deux `now`
  // différents entre le compteur et la liste pourraient afficher « 1 en
  // attente » au-dessus d'une liste où elle est expirée.
  const now = new Date();
  const pending = countPendingInvitationsFrom(data.invitations, now);
  const invitations = visibleInvitations(data.invitations, now);

  // L'ÉCRAN VIDE NE L'EST PLUS QUAND DES INVITATIONS SONT DEHORS.
  //
  // C'est le cas exact du coach qui a signalé le trou: il venait d'inviter
  // quelqu'un, sa cohorte était vide, et il voyait donc « invitez votre premier
  // élève » — l'écran lui redemandait de faire ce qu'il venait de faire, sans
  // jamais mentionner l'invitation en cours.
  if (data.clients.length === 0 && invitations.length === 0) {
    return <EmptyState setInviteOpen={setInviteOpen} />;
  }

  // C9 — EN HAUT, AVANT LES COMPTEURS, et ce n'est pas de la mise en page.
  // L'escalade porte `urgency='immediate'` en base et suspend la génération
  // d'un élève: sous la liste, elle se lirait comme une note de bas de page sur
  // un écran dont le premier tiers parle de facturation.
  const held = heldStudents(
    data.escalations,
    data.clients,
    (id) => data.directory.get(id)?.full_name ?? null,
  );

  return (
    <>
      {(held.length > 0 || data.escalationsFailed) && (
        <section className="mb-8">
          <SectionLabel>{t("coach.home.held_title")}</SectionLabel>
          {data.escalationsFailed
            ? (
              <Card>
                <p className="text-sm text-gray-800">{t("coach.home.held_unreadable")}</p>
              </Card>
            )
            : (
              <>
                <Card padded={false}>
                  <ul className="divide-y divide-gray-200">
                    {held.map((student) => (
                      <li key={student.userId} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            {/* `heldStudents` n'a gardé que des liens ACTIFS,
                                donc l'annuaire a forcément rendu la ligne: un
                                nom absent ici veut dire « pas encore écrit »,
                                jamais « masqué ». */}
                            <div className="truncate text-sm font-medium text-gray-900">
                              {student.name ?? t("coach.home.student_no_name")}
                            </div>
                            <div className="text-xs text-gray-500">
                              {t("coach.home.held_since", {
                                date: formatDate(student.since),
                              })}
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <Badge tone="critical">{t("coach.home.held_badge")}</Badge>
                            <ButtonLink
                              to={`/coach/clients/${student.userId}`}
                              size="sm"
                            >
                              {t("coach.home.open_student")}
                            </ButtonLink>
                          </div>
                        </div>
                        {/* LA PHRASE DE LA LIGNE, PAS UNE PARAPHRASE D'ÉCRAN.
                            `student_words` est écrit par le système qui a
                            bloqué (`minorEscalationRow`); la réécrire ici
                            créerait une seconde source pour un même fait. */}
                        {student.words && (
                          <p className="mt-2 text-sm leading-5 text-gray-700">
                            {student.words}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  {t("coach.home.held_hint")}
                </p>
              </>
            )}
        </section>
      )}

      <section className="mb-8 grid grid-cols-2 gap-3">
        <StatTile
          label={t("coach.home.seats_label")}
          value={String(activeSeats)}
          hint={t("coach.home.seats_hint")}
        />
        <StatTile label={t("coach.home.pending_label")} value={String(pending)} />
      </section>

      {/* LE MOT À TOUTE LA COHORTE — sous les compteurs, au-dessus de la liste.
          L'ordre dit le modèle: le coach voit d'abord COMBIEN d'élèves il a,
          puis il leur parle à tous, et seulement ensuite il descend dans la
          liste nominative. Placée après la liste, elle se serait lue comme une
          action sur l'élève survolé — exactement ce que ce canal n'est pas.

          Écriture par RPC (`keel_coach_send_broadcast`, migration
          20260806180500): `coach_broadcasts` n'a aucune policy d'écriture, la
          cadence hebdomadaire est tenue par un index unique en base et non par
          cet écran. */}
      <CoachBroadcastCard />

      {invitations.length > 0 && (
        <section className="mb-8">
          <SectionLabel>{t("coach.home.invites_title")}</SectionLabel>
          <Card padded={false}>
            <ul className="divide-y divide-gray-200">
              {invitations.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  outcome={resend?.email === invitation.email ? resend.state : null}
                  onResent={onResent}
                />
              ))}
            </ul>
          </Card>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            {t("coach.home.invites_hint")}
          </p>
        </section>
      )}

      {data.clients.length > 0 && (
      <section>
        <SectionLabel>{t("coach.home.list_title")}</SectionLabel>
        <Card padded={false}>
          <ul className="divide-y divide-gray-200">
            {data.clients.map((client) => (
              <StudentRow
                key={client.id}
                client={client}
                directory={client.student_user_id
                  ? data.directory.get(client.student_user_id) ?? null
                  : null}
                contact={client.student_user_id
                  ? data.contact.get(client.student_user_id) ?? null
                  : null}
              />
            ))}
          </ul>
        </Card>
      </section>
      )}

      {/* L'invitation est la SEULE action de cet écran. Les raccourcis « Import
          a plan » et « Plan templates » ont été retirés d'ici: l'import et la
          bibliothèque restent atteignables par l'onglet « Templates » de la
          nav, et cette page ne parle que de la cohorte. */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => setInviteOpen(true)}>
          {t("coach.home.empty_cta")}
        </Button>
      </div>

    </>
  );
}

function EmptyState({
  setInviteOpen,
}: {
  setInviteOpen: (open: boolean) => void;
}) {
  return (
    <Card tone="dashed" className="p-8 text-center">
      <h2 className="text-lg font-semibold text-gray-900">
        {t("coach.home.empty_title")}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-600">
        {t("coach.home.empty_body")}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {/* W6.5 landed: the invitation is the first act — a coach with no
            student and no way to invite one has no product. Le raccourci
            « Import a plan » qui l'accompagnait a été retiré: l'import se fait
            depuis l'onglet « Templates », pas depuis l'écran cohorte. */}
        <Button variant="primary" onClick={() => setInviteOpen(true)}>
          {t("coach.home.empty_cta")}
        </Button>
      </div>
      {/* Plus de second `InviteDialog` ici: il est monté une fois par
          CoachHomePage, au-dessus de la bascule vide/non-vide. C'était le
          défaut — deux montages, deux états, et celui-ci disparaissait au
          rechargement qu'il venait lui-même de déclencher. */}
    </Card>
  );
}

/**
 * UNE INVITATION EN ATTENTE.
 *
 * L'adresse est le seul identifiant qu'on a: personne n'a de compte ni de nom
 * tant qu'il n'a pas accepté. On l'affiche donc en clair, au coach qui l'a
 * saisie lui-même — pas une fuite, sa propre donnée.
 *
 * L'état est un BADGE et pas une phrase, avec les tons du produit: « en
 * attente » est neutre, « expirée » demande un geste. Et la date d'expiration
 * est écrite en toutes lettres, parce que « dans 4 jours » est ce dont le coach
 * a besoin pour décider s'il relance.
 */
function InvitationRow({
  invitation,
  outcome,
  onResent,
}: {
  invitation: CoachInvitationRow & { state: InvitationState };
  outcome: InviteSendState | null;
  onResent: (outcome: { email: string; state: InviteSendState }) => void;
}) {
  const expired = invitation.state === "expired";
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  /**
   * RENVOYER = RAPPELER LA MÊME FONCTION AVEC LA MÊME ADRESSE.
   *
   * `coach-invite-student-v1` révoque l'invitation pendante et en réémet une
   * hors de sa fenêtre de 60 s — « The old link stops working, which is the
   * correct behaviour for a resend », dit son propre commentaire. Un second
   * endpoint aurait dupliqué la garde d'abus, la révocation et le journal.
   */
  const resend = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Your session expired. Sign in again.");
      const out = await sendStudentInvitation(invitation.email, token);
      onResent({ email: out.email, state: out.state });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{invitation.email}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {expired
              ? t("coach.home.invite_expired_at", { date: formatDay(invitation.expires_at) })
              : t("coach.home.invite_expires_at", { date: formatDay(invitation.expires_at) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={expired ? "caution" : "neutral"}>
            {expired
              ? t("coach.home.invite_state_expired")
              : t("coach.home.invite_state_pending")}
          </Badge>
          <Button size="sm" onClick={resend} disabled={busy}>
            {busy
              ? t("coach.home.invite_resending")
              : expired
                ? t("coach.home.invite_resend_expired")
                : t("coach.home.invite_resend")}
          </Button>
        </div>
      </div>

      {/* Le résultat, et il ne se félicite QUE quand un email est réellement
          parti: `inviteStateIsReassuring` n'est vrai que pour `sent`. */}
      {outcome && !failure && (
        <p
          className={`mt-2 text-xs leading-5 ${
            inviteStateIsReassuring(outcome) ? "text-emerald-700" : "text-amber-800"
          }`}
        >
          {t(inviteResendMessageKey(outcome))}
        </p>
      )}
      {failure && <p className="mt-2 text-xs leading-5 text-rose-700">{failure}</p>}
    </li>
  );
}

/** Date courte, lisible, sans dépendance: l'écran est en anglais (R3). */
function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold text-gray-900">{value}</div>
      {hint && <p className="mt-2 text-xs leading-5 text-gray-500">{hint}</p>}
    </Card>
  );
}

const STATUS_LABEL: Record<CoachClientRow["status"], Parameters<typeof t>[0]> = {
  invited: "coach.home.status.invited",
  active: "coach.home.status.active",
  paused: "coach.home.status.paused",
  ended: "coach.home.status.ended",
};

const SEAT_LABEL: Record<CoachClientRow["seat_state"], Parameters<typeof t>[0]> = {
  billed: "coach.home.seat.billed",
  trial: "coach.home.seat.trial",
  free: "coach.home.seat.free",
};

function StudentRow({
  client,
  directory,
  contact,
}: {
  client: CoachClientRow;
  directory: DirectoryRow | null;
  contact: ContactRow | null;
}) {
  // Name resolution order, and what each step means:
  //   directory.full_name -> ACTIVE link: `coach_student_directory` filters on
  //                          coached_student_ids(), which only returns active
  //                          consented links. So an identity is on screen if
  //                          and only if the coach currently has read access.
  //   invited_email       -> the invitation is out, nobody has accepted yet
  //   no name yet         -> C9: the directory DID return the row, the name is
  //                          simply empty. Measured 9/359 live links. Saying
  //                          "hidden" here accused the link of a fault that
  //                          belongs to the profile.
  //   linked but hidden   -> paused or ended: the row exists (billing history,
  //                          audit) but the name is no longer readable. Saying
  //                          so is more honest than showing "Invited student"
  //                          for someone who was a client for six months.
  // We never fall back to the raw uuid: an identifier on screen reads as
  // information and is none.
  const resolved = studentNameState({
    fullName: directory?.full_name,
    invitedEmail: client.invited_email,
    hasDirectoryRow: directory !== null,
    studentUserId: client.student_user_id,
  });
  const name = resolved.value ?? t(
    resolved.kind === "no_name"
      ? "coach.home.student_no_name"
      : resolved.kind === "hidden"
      ? "coach.home.student_hidden"
      : "coach.home.student_unnamed",
  );

  const secondary = client.student_user_id === null
    ? t("coach.home.no_name_yet")
    : client.started_at
    ? t("coach.home.since", { date: formatDate(client.started_at) })
    : (directory?.timezone ?? "");

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-gray-900">{name}</div>
        {secondary && (
          <div className="truncate text-xs text-gray-500">{secondary}</div>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {/* PIVOT §1.4 — shown only on a LIVE link: "silent" about a paused or
            ended student is noise, and about an invitation nobody accepted it
            would be a lie (there is nothing to be silent from yet). */}
        {client.status === "active" && (() => {
          const state = contactStateFor(contact?.last_inbound_at, new Date());
          return (
            <Badge tone={CONTACT_TONE[state]}>{CONTACT_LABEL[state]}</Badge>
          );
        })()}
        {client.status === "active" && (
          <Badge>{t(SEAT_LABEL[client.seat_state])}</Badge>
        )}
        <Badge tone={STATUS_TONE[client.status]}>
          {t(STATUS_LABEL[client.status])}
        </Badge>
        {/* W6.6 — the read-only student space. Offered ONLY on an active link:
            `coached_student_ids()` returns nothing for a paused or ended one, so
            the page would open on a refusal panel and an audit line would be
            written for an access the coach does not have. */}
        {client.status === "active" && client.student_user_id && (
          <ButtonLink to={`/coach/clients/${client.student_user_id}`} size="sm">
            {t("coach.home.open_student")}
          </ButtonLink>
        )}
      </div>
    </li>
  );
}

const STATUS_TONE: Record<CoachClientRow["status"], BadgeTone> = {
  active: "positive",
  invited: "info",
  paused: "caution",
  ended: "neutral",
};

/**
 * R3, `ui_locale`: the locale is STATED, not inherited from the browser.
 * `toLocaleDateString(undefined, ...)` reads navigator.language, which renders
 * "27 juil. 2026" inside an otherwise 100 %-English screen for anyone whose
 * browser is French — observed in the W6.1 browser run. The KEEL pilot ships
 * one UI locale (see `i18n/t.ts`: "Pilot: English only"), so that is the tag
 * passed here. When ui_locale becomes a real per-user axis, this is the single
 * place that reads it.
 */
const UI_LOCALE = "en-US";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(UI_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default CoachHomePage;
