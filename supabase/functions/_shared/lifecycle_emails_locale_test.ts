// KEEL — LA LANGUE DES E-MAILS DE CYCLE DE VIE.
//
// `send-welcome-email` avait été traité; les trois autres non. Ce fichier les
// tient ensemble parce qu'ils partagent exactement un motif et exactement un
// piège:
//
//   · le motif — un module PUR `renderX(args, locale) → {subject, html}`, deux
//     packs entiers, `locale` REQUIS, un transport qui ne décide rien.
//   · le piège — leurs `index.ts` sont TOUS EN `@ts-nocheck`. Le compilateur
//     n'y relit rien. La copie a donc été sortie de ces fichiers pour qu'un
//     relecteur existe: c'est ce fichier.
//
// Chaque épreuve est BIDIRECTIONNELLE. Une assertion sur la seule langue
// d'origine reste verte devant un texte codé en dur — et c'est le défaut qu'on
// retire, dans les deux sens: `account-export-v1` était FRANÇAIS en dur,
// `account-deletion-v1` ANGLAIS en dur, dans le même dépôt.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import {
  renderExportReadme,
  renderExportRequestedNotice,
} from "../account-export-v1/export_copy.ts";
import {
  renderCoachDepartureEmail,
  renderDeletionConfirmedMessage,
} from "../account-deletion-v1/deletion_copy.ts";
import {
  renderInviteEmail,
  resolveInviteLocale,
} from "../coach-invite-student-v1/invite_token.ts";
import { formatAccountDate } from "./account_lifecycle.ts";

const FRENCH_MARKERS = [
  "Bonjour",
  "Ton compte",
  "Ton coach",
  "tes données",
  "mot de passe",
  "L'équipe",
  "t'invite",
  "Accepter",
  "AVERTISSEMENT",
  "Contenu de l'archive",
];

function assertNoFrenchLeak(text: string, where: string): void {
  for (const marker of FRENCH_MARKERS) {
    assert(!text.includes(marker), `${where}: « ${marker} » a fuité — ${text.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// LA DATE — la fonction dont le NOM disait le problème
// ---------------------------------------------------------------------------

Deno.test("formatAccountDate rend la date dans la langue du compte, pas en français", () => {
  const iso = "2026-08-20T10:00:00.000Z";
  const fr = formatAccountDate(iso, "fr-FR");
  const en = formatAccountDate(iso, "en-US");
  assert(fr.includes("août"), fr);
  assert(en.includes("August"), en);
  assertNotEquals(fr, en);
  // Une langue non livrée rend l'anglais, jamais une troisième langue.
  assertEquals(formatAccountDate(iso, "de-DE"), en);
  // Le fuseau reste un paramètre INDÉPENDANT de la langue: le changer avec
  // elle déplacerait des dates de purge pour des comptes existants.
  assert(formatAccountDate(iso, "en-US", "Pacific/Auckland").includes("August"));
});

// ---------------------------------------------------------------------------
// account-export-v1 — c'était du FRANÇAIS en dur
// ---------------------------------------------------------------------------

Deno.test("l'alerte d'export existe dans les deux langues — c'est un message de SÉCURITÉ", () => {
  const fr = renderExportRequestedNotice("fr-FR");
  const en = renderExportRequestedNotice("en-US");

  assert(fr.body.includes("mot de passe"), fr.body);
  assert(fr.subject.startsWith("Sophia —"), fr.subject);

  // Un avertissement que son destinataire ne lit pas ne protège personne: la
  // consigne d'action (changer le mot de passe) doit être présente, pas
  // seulement l'absence de français.
  assert(en.body.includes("change your password"), en.body);
  assert(en.subject.length > 10, en.subject);
  assertNoFrenchLeak(en.body, "notice.body");
  assertNoFrenchLeak(en.subject, "notice.subject");
  assertNoFrenchLeak(en.html, "notice.html");

  // UNE SEULE PHRASE-SOURCE pour l'e-mail et le message in-app: deux textes
  // divergents diraient deux choses différentes du même incident.
  for (const notice of [fr, en]) assert(notice.html.includes(notice.body));
});

Deno.test("le README de l'archive suit la langue, et garde les NOMS DE FICHIERS", () => {
  const iso = "2026-08-20T10:00:00.000Z";
  const fr = renderExportReadme(iso, "fr-FR");
  const en = renderExportReadme(iso, "en-US");

  assert(fr.startsWith("EXPORT DE TES DONNÉES SOPHIA"), fr.slice(0, 40));
  assert(en.startsWith("YOUR SOPHIA DATA EXPORT"), en.slice(0, 40));
  assertNoFrenchLeak(en, "README en-US");

  // R1 — LES NOMS DE FICHIERS SONT DES JETONS. Ils désignent une entrée réelle
  // du ZIP, et le README les CITE pour qu'on la retrouve. Les traduire
  // produirait un README anglais nommant des fichiers qui n'existent pas.
  for (
    const token of [
      "profil.json",
      "conversations.json",
      "mon_foyer.json",
      "ma_memoire_alimentaire.json",
      "fichiers.json",
      "tables_indisponibles",
      "sophia@sophia-coach.ai",
    ]
  ) {
    assert(fr.includes(token), `FR perd le jeton ${token}`);
    assert(en.includes(token), `EN perd le jeton ${token}`);
  }

  // L'avertissement de sécurité survit dans les deux — c'est le paragraphe qui
  // dit que le fichier contient l'historique complet des conversations.
  assert(fr.includes("⚠ AVERTISSEMENT"), "FR perd l'avertissement");
  assert(en.includes("⚠ WARNING"), "EN perd l'avertissement");
  assert(en.includes("conversations"), en);

  // La date est rendue par le même chemin, donc dans la même langue.
  assert(fr.includes("août"), "FR: date non française");
  assert(en.includes("August"), "EN: date non anglaise");
});

// ---------------------------------------------------------------------------
// account-deletion-v1 — c'était de l'ANGLAIS en dur (et du français pour la date)
// ---------------------------------------------------------------------------

Deno.test("l'accusé de suppression porte la date ET l'échéance dans les deux langues", () => {
  const fr = renderDeletionConfirmedMessage("20 août 2026", "fr-FR");
  const en = renderDeletionConfirmedMessage("20 August 2026", "en-US");
  assert(fr.includes("20 août 2026"), fr);
  assert(en.includes("20 August 2026"), en);
  // LA MOITIÉ QUI COMPTE: la fenêtre d'annulation de sept jours. Un accusé qui
  // perdrait cette phrase serait une suppression qu'on croit irréversible.
  assert(fr.includes("annuler la suppression"), fr);
  assert(en.toLowerCase().includes("cancel the deletion"), en);
  assertNoFrenchLeak(en, "deletion ack");
});

Deno.test("l'avis de départ du coach dit la MÊME chose dans les deux langues", () => {
  const fr = renderCoachDepartureEmail("Julie", "fr-FR");
  const en = renderCoachDepartureEmail("Julie", "en-US");
  assert(fr.html.includes("Bonjour Julie,"), fr.html);
  assert(en.html.includes("Hi Julie,"), en.html);
  assertNoFrenchLeak(en.html, "coach departure html");
  assertNoFrenchLeak(en.subject, "coach departure subject");
  // La phrase qui ne doit JAMAIS s'adoucir en traduction: le plan et les
  // données de l'élève sont à lui, et ils restent.
  assert(fr.html.includes("<strong>Ton plan et tes données t'appartiennent.</strong>"));
  assert(en.html.includes("<strong>Your plan and your data belong to you.</strong>"));
  assertNotEquals(fr.subject, en.subject);
});

Deno.test("sans prénom, chaque pack rend SA salutation courte", () => {
  assert(renderCoachDepartureEmail("", "fr-FR").html.includes("<p>Bonjour,</p>"));
  assert(renderCoachDepartureEmail("   ", "en-US").html.includes("<p>Hi,</p>"));
});

// ---------------------------------------------------------------------------
// coach-invite-student-v1 — l'e-mail dont le destinataire n'a PAS de compte
// ---------------------------------------------------------------------------

Deno.test("la chaîne de langue de l'invitation n'a que DEUX maillons", () => {
  // 1. le choix explicite du coach; 2. `en-US`. Rien d'autre — surtout pas
  // `Accept-Language` ni `profiles.locale` du coach, qui donnent tous deux la
  // langue du COACH et pas celle de l'invité.
  assertEquals(resolveInviteLocale("fr-FR"), "fr-FR");
  assertEquals(resolveInviteLocale("fr"), "fr-FR");
  assertEquals(resolveInviteLocale("en-GB"), "en-US");
  // Absence = pas de choix = l'aveu par défaut, jamais une devinette.
  assertEquals(resolveInviteLocale(undefined), "en-US");
  assertEquals(resolveInviteLocale(""), "en-US");
  assertEquals(resolveInviteLocale("   "), "en-US");
  assertEquals(resolveInviteLocale(42), "en-US");
  // Une langue exotique ne JETTE pas ici: une invitation refusée pour cause de
  // tag inconnu est un élève qui n'entre jamais, sans que le coach le sache.
  assertEquals(resolveInviteLocale("de-DE"), "en-US");
});

Deno.test("l'invitation existe dans les deux langues, lien et durée compris", () => {
  const url = "https://sophia-coach.ai/join?token=abc";
  const fr = renderInviteEmail({ coachName: "Marie", joinUrl: url, locale: "fr-FR" });
  const en = renderInviteEmail({ coachName: "Marie", joinUrl: url, locale: "en-US" });

  assert(fr.subject.includes("Marie"), fr.subject);
  assert(en.subject.includes("Marie"), en.subject);
  assertNotEquals(fr.subject, en.subject);
  assertNoFrenchLeak(en.html, "invite html");
  assertNoFrenchLeak(en.subject, "invite subject");

  // Le lien est un jeton: présent, intact, dans les deux.
  for (const mail of [fr, en]) assert(mail.html.includes(url), mail.html);
  // La durée de vie est CITÉE depuis la constante, jamais réécrite à la main —
  // deux textes qui annoncent deux durées seraient deux promesses.
  for (const mail of [fr, en]) assert(mail.html.includes("14"), mail.html);
});

Deno.test("sans nom de coach, chaque pack a SON repli — pas un repli imposé en amont", () => {
  const url = "https://x/join?token=a";
  assert(
    renderInviteEmail({ coachName: null, joinUrl: url, locale: "fr-FR" })
      .subject.startsWith("Ton coach"),
  );
  assert(
    renderInviteEmail({ coachName: "  ", joinUrl: url, locale: "en-US" })
      .subject.startsWith("Your coach"),
  );
});
