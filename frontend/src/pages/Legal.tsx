import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import SEO from '../components/SEO';
import { PublicFooter, PublicHeader } from '../keel/components/PublicHeader';
import {
  LEGAL_ENTITY,
  organizationStructuredData,
  registeredOfficeLine,
} from '../lib/legalEntity';

/**
 * /legal — the one public legal surface: mentions légales, terms, privacy,
 * terms of sale, referral.
 *
 * ── WHY THE IDENTITY BLOCK IS FIRST AND IS A TABLE ───────────────────────
 * Under art. 6-III of the LCEN a company publishing a site must name itself,
 * its legal form, its capital, its registered office and its publication
 * director. That is the legal reason. The operational reason is that this
 * block is the only place where the DOMAIN and the COMPANY REGISTRY entry are
 * joined in public: a store reviewer holding a D&B record for "IKIZEN SAS"
 * and an app declaring `sophia-coach.ai` needs one page that says both names
 * in the same sentence, or the developer account cannot be verified. So it is
 * a labelled table, not a paragraph — it is read by people scanning for a
 * SIREN, not by people reading prose. The values live in `lib/legalEntity`
 * because the same numbers are also emitted as JSON-LD for the machines.
 *
 * ── TWO TRAPS THIS FILE HAS ALREADY FALLEN INTO ──────────────────────────
 * 1. NO `prose` CLASSES. This page used to lean on `prose prose-slate` and
 *    `prose-headings:font-bold`. `@tailwindcss/typography` is NOT installed
 *    (Tailwind v4, no `@plugin` line in index.css), so every one of those
 *    classes was inert and the headings rendered at browser default inside a
 *    grey body — a legal page whose structure was invisible. Style headings
 *    explicitly here, or install the plugin; do not reintroduce bare `prose`.
 * 2. NO `new Date()` IN "IN FORCE AS OF". The date used to be computed at
 *    render, so the terms claimed to have been amended today, every day, for
 *    anyone who loaded the page. A legal document's date is a fact, not a
 *    clock reading: bump LAST_UPDATED by hand when the text actually changes.
 *
 * The chrome is the KEEL public header/footer. The previous one was the
 * legacy consumer chrome and its nav pointed at /l-architecte and /formules,
 * routes dismounted at the pivot — three links to a 404 on the page whose
 * whole job is to look legitimate.
 */

/** Bump by hand when the text below actually changes. See trap 2 above. */
const LAST_UPDATED = '4 August 2026';

const SEO_DESCRIPTION =
  'Legal notice for sophia-coach.ai: publisher, registered office, VAT number, ' +
  'hosting, terms of use, privacy policy and terms of sale.';

// Hoisted: SEO keeps `structuredData` in a useEffect dependency array, so an
// inline literal would rebuild the <script> tags on every render.
const STRUCTURED_DATA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Legal notice & Terms',
    url: `${LEGAL_ENTITY.siteUrl}/legal`,
    description: SEO_DESCRIPTION,
    inLanguage: 'en-GB',
    publisher: organizationStructuredData(),
  },
  organizationStructuredData(),
];

const SECTIONS = [
  { id: 'mentions-legales', label: 'Legal notice' },
  { id: 'cgu', label: 'Terms of use' },
  { id: 'confidentialite', label: 'Privacy' },
  { id: 'cgv', label: 'Terms of sale' },
  { id: 'parrainage', label: 'Referral' },
] as const;

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-gray-200 pt-10">
      <h2 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      <div className="mt-6 space-y-4">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pt-4 text-base font-semibold text-gray-900 first:pt-0">{children}</h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-6 text-gray-700">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">{children}</ul>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      {children}
    </p>
  );
}

/** One labelled row of the identity table. `value` may be a node (links). */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  );
}

const Legal = () => {
  const location = useLocation();

  // Scroll to section if hash is present
  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(location.hash.replace('#', ''));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <SEO
        title="Legal notice & Terms"
        description={SEO_DESCRIPTION}
        canonical={`${LEGAL_ENTITY.siteUrl}/legal`}
        structuredData={STRUCTURED_DATA}
      />

      <PublicHeader />

      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          Legal notice &amp; terms
        </h1>
        <p className="mt-3 text-base leading-7 text-gray-600">
          Who publishes {LEGAL_ENTITY.domain}, how to reach us, and the terms that
          govern the service.
        </p>
        <p className="mt-2 text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>

        <nav className="mt-8 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="mt-12 space-y-12">
          {/* ── MENTIONS LÉGALES ────────────────────────────────────────── */}
          <Section
            id="mentions-legales"
            title="Legal notice"
            subtitle="Publisher identity, as required by article 6-III of the French LCEN"
          >
            <P>
              The site <strong>{LEGAL_ENTITY.domain}</strong> and the Sophia service
              are published by <strong>{LEGAL_ENTITY.legalName}</strong>,{' '}
              {LEGAL_ENTITY.legalForm} with share capital of{' '}
              {LEGAL_ENTITY.shareCapital}, registered with the French Trade and
              Companies Register (RCS) under number{' '}
              <strong>{LEGAL_ENTITY.rcsNumber}</strong>, whose registered office is at{' '}
              {registeredOfficeLine()}.
            </P>

            <dl className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
              <Row label="Publisher" value={`${LEGAL_ENTITY.legalName} (${LEGAL_ENTITY.legalForm})`} />
              <Row label="Legal form" value="Société par actions simplifiée (SAS), France" />
              <Row label="Share capital" value={LEGAL_ENTITY.shareCapital} />
              <Row label="RCS number" value={LEGAL_ENTITY.rcsNumber} />
              <Row label="Intra-EU VAT number" value={LEGAL_ENTITY.vatNumber} />
              <Row label="Registered office" value={registeredOfficeLine()} />
              <Row
                label="Publication director"
                value={
                  <>
                    {LEGAL_ENTITY.publicationDirector} —{' '}
                    <a
                      href={`mailto:${LEGAL_ENTITY.publicationDirectorEmail}`}
                      className="font-medium text-gray-900 underline underline-offset-2 hover:text-gray-600"
                    >
                      {LEGAL_ENTITY.publicationDirectorEmail}
                    </a>
                  </>
                }
              />
              <Row
                label="Contact"
                value={
                  <a
                    href={`mailto:${LEGAL_ENTITY.contactEmail}`}
                    className="font-medium text-gray-900 underline underline-offset-2 hover:text-gray-600"
                  >
                    {LEGAL_ENTITY.contactEmail}
                  </a>
                }
              />
              <Row
                label="Phone"
                value={
                  <a
                    href={`tel:${LEGAL_ENTITY.phoneE164}`}
                    className="font-medium text-gray-900 underline underline-offset-2 hover:text-gray-600"
                  >
                    {LEGAL_ENTITY.phone}
                  </a>
                }
              />
            </dl>

            <H3>Hosting</H3>
            <P>
              The site is hosted by <strong>{LEGAL_ENTITY.host.name}</strong>,{' '}
              {LEGAL_ENTITY.host.street}, {LEGAL_ENTITY.host.city},{' '}
              {LEGAL_ENTITY.host.region} {LEGAL_ENTITY.host.postalCode},{' '}
              {LEGAL_ENTITY.host.country}.
            </P>

            <H3>Intellectual property</H3>
            <P>
              This site as a whole is governed by French and international copyright
              and intellectual property law. All reproduction rights are reserved,
              including for downloadable documents and for iconographic and
              photographic material.
            </P>
          </Section>

          {/* ── CGU ─────────────────────────────────────────────────────── */}
          <Section
            id="cgu"
            title="Terms of use"
            subtitle="Rules for accessing and using the platform"
          >
            <H3>1. Purpose and acceptance</H3>
            <P>
              These Terms of Use (the "Terms") govern access to and use of the
              "Sophia" SaaS platform (the "Service"), published by{' '}
              <strong>{LEGAL_ENTITY.legalName}</strong> (the "Publisher").
            </P>
            <P>
              Using the Service implies unreserved acceptance of these Terms. The user
              acknowledges having read all of the conditions before ticking the "I
              accept" box when signing up.
            </P>

            <H3>2. Description of the Service</H3>
            <P>
              Sophia is an intelligent virtual assistant (AI) for personal
              development, productivity and life design. The Service allows you in
              particular to:
            </P>
            <UL>
              <li>
                Generate personalised action plans to organise your days and reach
                your goals.
              </li>
              <li>
                Interact with a conversational AI for motivational support and habit
                tracking.
              </li>
              <li>
                Access tools for structuring identity and tracking progress.
              </li>
            </UL>
            <Note>
              <strong>AI notice:</strong> The advice and content generated by Sophia
              are produced by artificial intelligence algorithms. They are provided
              for information and decision support, and cannot replace human
              professional judgement or constitute certified legal, medical or
              financial advice.
            </Note>

            <H3>3. Access to the Service</H3>
            <P>
              The Service is available 24/7, except in cases of force majeure or
              maintenance. The Publisher reserves the right to suspend, interrupt or
              limit access to all or part of the Service for technical or security
              reasons, without this giving rise to compensation.
            </P>

            <H3>4. User account</H3>
            <P>
              Registration is required to access the features. The User is solely
              responsible for keeping their credentials confidential. Any action taken
              from their account is deemed to have been taken by them. If credentials
              are lost or stolen, the User must inform the Publisher without delay.
            </P>

            <H3>5. Intellectual property</H3>
            <P>
              <strong>Service content:</strong> All elements of the Service
              (structure, design, code, algorithms, the "Sophia" trade marks) are the
              exclusive property of {LEGAL_ENTITY.legalName}. Any reproduction is
              prohibited without authorisation.
            </P>
            <P>
              <strong>User content:</strong> The data, text and information provided
              by the User remain their property. The User grants the Publisher a right
              to use this content solely for operating and improving the Service
              (including training AI models, in anonymised form).
            </P>

            <H3>6. Liability</H3>
            <P>
              The Publisher provides the Service under a best-efforts obligation. It
              cannot be held liable for:
            </P>
            <UL>
              <li>Indirect damages (loss of revenue, loss of opportunity, and so on).</li>
              <li>AI advice being unsuited to the User's specific situation.</li>
              <li>Problems related to the User's own internet connection.</li>
              <li>
                The consequences of a failure, security incident or hack occurring on
                third-party providers' infrastructure (hosting, AI model providers,
                messaging), where no proven fault of the Publisher in selecting or
                configuring those services is established.
              </li>
            </UL>
          </Section>

          {/* ── CONFIDENTIALITÉ ─────────────────────────────────────────── */}
          <Section
            id="confidentialite"
            title="Privacy policy"
            subtitle="Protection of your personal data (GDPR)"
          >
            <H3>1. Data collected</H3>
            <P>When you use Sophia, we collect the following data:</P>
            <UL>
              <li>
                <strong>Identity data:</strong> surname, first name, email, phone
                number (account identifier).
              </li>
              <li>
                <strong>Life &amp; goal data:</strong> questionnaire answers, personal
                goals, generated action plans.
              </li>
              <li>
                <strong>Conversation data:</strong> the history of exchanges with the
                Sophia assistant.
              </li>
              <li>
                <strong>Technical data:</strong> sign-in logs, IP address, browser
                type.
              </li>
            </UL>

            <H3>2. Purposes of processing</H3>
            <P>Your data is processed for the following reasons:</P>
            <UL>
              <li>
                Providing and personalising the Service (legal basis: performance of
                the contract).
              </li>
              <li>
                Sending notifications and reminders inside the app (legal basis:
                consent).
              </li>
              <li>
                Continuous improvement of the AI algorithms (legal basis: legitimate
                interest).
              </li>
              <li>Handling billing and customer support.</li>
            </UL>

            <H3>3. Data sharing</H3>
            <P>
              Your data is strictly confidential. It is passed only to the technical
              sub-processors we cannot operate without (cloud hosting, AI API
              provider, message delivery service), who are bound by the same security
              obligations. <strong>We never sell your data to advertisers.</strong>
            </P>

            <H3>4. Security</H3>
            <P>
              We put in place technical security measures (SSL/TLS encryption, secured
              databases) and organisational ones to protect your data against
              unauthorised access, loss or alteration.
            </P>

            <H3>5. Your rights</H3>
            <P>
              Under the GDPR you have rights of access, rectification, erasure,
              restriction and portability over your data. You can exercise the erasure
              and portability rights directly in the app, without contacting us: menu{' '}
              <strong>Account → Options → My data</strong> (export your data) and{' '}
              <strong>Delete my account</strong>.
            </P>

            <H3>6. Data retention and deletion</H3>
            <P>
              <strong>Self-service account deletion:</strong> you can delete your
              account at any time from the app. Deletion happens in two stages:
            </P>
            <UL>
              <li>
                <strong>Immediately:</strong> your access is disabled, Sophia stops
                writing to you and your subscription is cancelled with no further
                charge.
              </li>
              <li>
                <strong>Within 7 days:</strong> all of your data (profile, plans,
                conversations, memories) is permanently and irreversibly deleted from
                our databases. During that period you can cancel the deletion by
                signing in again.
              </li>
            </UL>
            <P>
              <strong>Data kept after deletion:</strong>
            </P>
            <UL>
              <li>
                The <strong>invoices</strong> relating to your payments, kept under
                the statutory accounting retention obligation (article L.123-22 of the
                French Commercial Code).
              </li>
              <li>
                A <strong>minimal anonymised record</strong> of the deletion
                (cryptographic hashes of the email and phone number, and the deletion
                date), kept as proof of compliance. It cannot be used to identify you.
              </li>
              <li>
                Technical usage measurements (volumes and compute costs),{' '}
                <strong>anonymised</strong> at deletion time: they are no longer
                attached to any person.
              </li>
            </UL>
            <P>
              <strong>Technical backups:</strong> backup copies of our databases may
              remain temporarily after deletion. They expire automatically on their
              rotation cycle and are never used to restore deleted data, except in a
              major technical incident affecting the whole service.
            </P>
            <P>
              <strong>Exporting your data:</strong> you can download a copy of your
              data (profile, plans, conversations, memories) as JSON at any time from
              the Account menu. For security, re-authentication is required, a
              notification is sent to you for every request, and exports are limited
              to one per 24 hours.
            </P>
            <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
              <strong className="text-gray-900">Exercising your rights.</strong> For
              any request about your data, contact us at{' '}
              <a
                href={`mailto:${LEGAL_ENTITY.contactEmail}`}
                className="font-medium text-gray-900 underline underline-offset-2 hover:text-gray-600"
              >
                {LEGAL_ENTITY.contactEmail}
              </a>
              .
            </p>
          </Section>

          {/* ── CGV ─────────────────────────────────────────────────────── */}
          <Section
            id="cgv"
            title="Terms of sale"
            subtitle="Subscriptions, payments and withdrawal"
          >
            <H3>1. Plans and prices</H3>
            <P>
              Services are offered as subscriptions (monthly or annual) or as one-off
              purchases. Prices are shown in Euros (€) including all taxes on the
              "Pricing" page. {LEGAL_ENTITY.legalName} reserves the right to change
              its prices at any time, but the Service is billed at the prices in force
              when the order is confirmed.
            </P>

            <H3>2. Payment</H3>
            <P>
              Payment is made by card through our secure payment provider (Stripe).
              Payment is due immediately on ordering. If payment fails, access to the
              Service is suspended immediately.
            </P>

            <H3>3. Renewal and cancellation</H3>
            <P>
              <strong>Renewal:</strong> Subscriptions renew automatically for a period
              identical to the one originally taken out, unless cancelled by the User.
            </P>
            <P>
              <strong>Cancellation:</strong> The User can cancel their subscription at
              any time from the "My Account" area. Cancellation takes effect at the
              end of the current subscription period. No pro-rata refund is made for a
              period already started.
            </P>

            <H3>4. No right of withdrawal</H3>
            <Note>
              Under article L.221-28 of the French Consumer Code, the right of
              withdrawal cannot be exercised for contracts supplying digital content
              not provided on a physical medium (SaaS) whose performance has begun
              after the consumer's express prior agreement and express waiver of their
              right of withdrawal.
            </Note>
            <P>
              By subscribing to the Service and accessing the digital features
              immediately, the User expressly waives their right of withdrawal.
            </P>

            <H3>5. Governing law</H3>
            <P>
              These Terms of Sale are governed by French law. In the event of a
              dispute, jurisdiction is granted to the competent courts in the district
              of {LEGAL_ENTITY.legalName}'s registered office, notwithstanding
              multiple defendants or third-party proceedings.
            </P>
          </Section>

          {/* ── PARRAINAGE ──────────────────────────────────────────────── */}
          <Section
            id="parrainage"
            title="Referral programme"
            subtitle="Programme conditions"
          >
            <H3>1. How it works</H3>
            <P>
              Every User has a personal referral code, shareable as a link or a code.
              When someone (the "Referee") creates a Sophia account with that code,
              their free trial is extended to 30 days (instead of 14). The code must
              be entered at sign-up: it cannot be added later to an existing account.
            </P>

            <H3>2. Referrer reward</H3>
            <P>
              The Referrer receives one (1) free month of subscription, matching the
              monthly price of their current plan, as a credit deducted from their
              next invoices. This reward is credited{' '}
              <strong>
                only when the Referee pays a first invoice for an amount strictly
                greater than zero
              </strong>
              . The Referee merely signing up, the trial period, or a €0 invoice give
              no entitlement to a reward.
            </P>
            <P>
              If the Referrer is not yet subscribed when their Referee converts, the
              reward is held and applied automatically to their first invoices as soon
              as they take out a subscription.
            </P>

            <H3>3. Cap</H3>
            <P>
              Free months are capped at twelve (12) months per rolling twelve (12)
              month period per Referrer. Beyond that cap, referrals are still counted
              but no longer give entitlement to a reward.
            </P>

            <H3>4. Anti-fraud reservation</H3>
            <Note>
              Self-referral (same person, same phone number, or multiple accounts) is
              prohibited. The Referee must be a new user who does not already have a
              Sophia account. {LEGAL_ENTITY.legalName} reserves the right to refuse,
              suspend or cancel any reward obtained in breach of these conditions or
              by any fraudulent or abusive means, and to suspend the accounts
              involved.
            </Note>

            <H3>5. Nature of the reward</H3>
            <P>
              Free months have no monetary value: they are not refundable,
              transferable or convertible into cash. {LEGAL_ENTITY.legalName} may
              change or end the referral programme at any time; rewards already earned
              remain due.
            </P>
          </Section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default Legal;
