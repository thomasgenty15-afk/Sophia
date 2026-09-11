import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import SEO from '../components/SEO';
import { PublicFooter, PublicHeader } from '../keel/components/PublicHeader';
import { displayLocaleTag, formatDateLong, formatPrice } from '../keel/i18n/format';
import { t } from '../keel/i18n/t';
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
 * ── LA PAGE PARLE DEUX LANGUES DEPUIS LE 2026-09-09 ──────────────────────
 * Tout le texte vit sous `legal.*` dans `keel/i18n/en.ts` / `fr.ts`, et
 * `/legal` est déclarée dans `PAGE_NAMESPACES`: elle suit donc la langue du
 * visiteur, chrome compris. Deux conséquences pour qui édite ce fichier:
 *
 *  1. AUCUN TEXTE EN DUR ICI. `scripts/ci/i18n-lint.mjs` scanne désormais ce
 *     fichier (il en était exclu au titre du « legacy grand public »), et
 *     `t()` LÈVE en DEV sur une clé hors du namespace déclaré.
 *  2. LES FAITS D'IDENTITÉ NE SONT PAS DU TEXTE. Nom, forme, capital, RCS,
 *     TVA, adresse, téléphone, e-mail: ils viennent de `lib/legalEntity` et
 *     passent en PARAMÈTRES. Les recopier dans le seed créerait une seconde
 *     rédaction d'un numéro de TVA, c'est-à-dire deux valeurs qui divergent.
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

/**
 * Bump by hand when the text below actually changes. See trap 2 above.
 *
 * ⚠️ UNE DATE ISO, ET PLUS « 4 August 2026 ». La chaîne anglaise ne pouvait pas
 * se rendre en français, et la traduire à la main aurait donné deux dates à
 * tenir. `formatDateLong` en fait « 4 August 2026 » ou « 4 août 2026 ».
 */
const LAST_UPDATED = '2026-08-04';

const SECTIONS = [
  { id: 'mentions-legales', label: 'legal.nav.mentions' },
  { id: 'cgu', label: 'legal.nav.cgu' },
  { id: 'confidentialite', label: 'legal.nav.privacy' },
  { id: 'cgv', label: 'legal.nav.cgv' },
  { id: 'parrainage', label: 'legal.nav.referral' },
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

/**
 * Une amorce en gras suivie de son texte — « Renouvellement : les abonnements
 * se renouvellent… ».
 *
 * DEUX CLÉS, ET C'EST LA SEULE FORME D'EMPHASE QUI SURVIT À LA TRADUCTION. Un
 * `<strong>` au MILIEU d'une phrase la coupe en trois morceaux dont l'ordre
 * est celui de l'anglais; une amorce, elle, reste en tête dans les deux
 * langues. Là où le gras portait un mot interne, il a été retiré.
 */
function Term({ label, body }: { label: string; body: string }) {
  return (
    <>
      <strong>{label}</strong> {body}
    </>
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

  const seoDescription = t('legal.seo.description', { domain: LEGAL_ENTITY.domain });

  // Mémoïsé: `SEO` garde `structuredData` dans un tableau de dépendances
  // d'effet, donc un littéral en ligne reconstruirait les `<script>` à chaque
  // rendu. Il ne peut PAS être hissé hors du composant comme avant: `t()` au
  // niveau module se figerait à la langue du premier chargement (règle
  // MODULE_SCOPE_T de `scripts/ci/i18n-lint.mjs`). La bascule de langue
  // recharge la page, donc `[]` suffit.
  const structuredData = useMemo(
    () => [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: t('legal.seo.title'),
        url: `${LEGAL_ENTITY.siteUrl}/legal`,
        description: seoDescription,
        inLanguage: displayLocaleTag(),
        publisher: organizationStructuredData(),
      },
      organizationStructuredData(),
    ],
    [seoDescription],
  );

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <SEO
        title={t('legal.seo.title')}
        description={seoDescription}
        canonical={`${LEGAL_ENTITY.siteUrl}/legal`}
        structuredData={structuredData}
      />

      <PublicHeader />

      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          {t('legal.page.title')}
        </h1>
        <p className="mt-3 text-base leading-7 text-gray-600">
          {t('legal.page.intro', { domain: LEGAL_ENTITY.domain })}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          {t('legal.page.updated', { date: formatDateLong(LAST_UPDATED) })}
        </p>

        <nav className="mt-8 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
            >
              {t(s.label)}
            </a>
          ))}
        </nav>

        <div className="mt-12 space-y-12">
          {/* ── MENTIONS LÉGALES ────────────────────────────────────────── */}
          <Section
            id="mentions-legales"
            title={t('legal.mentions.title')}
            subtitle={t('legal.mentions.subtitle')}
          >
            <P>
              {t('legal.mentions.intro', {
                domain: LEGAL_ENTITY.domain,
                name: LEGAL_ENTITY.legalName,
                form: LEGAL_ENTITY.legalForm,
                capital: formatPrice(LEGAL_ENTITY.shareCapitalEur),
                rcs: LEGAL_ENTITY.rcsNumber,
                office: registeredOfficeLine(),
              })}
            </P>

            <dl className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
              <Row
                label={t('legal.mentions.row_publisher')}
                value={`${LEGAL_ENTITY.legalName} (${LEGAL_ENTITY.legalForm})`}
              />
              <Row
                label={t('legal.mentions.row_form')}
                value={t('legal.mentions.form_value')}
              />
              <Row
                label={t('legal.mentions.row_capital')}
                value={formatPrice(LEGAL_ENTITY.shareCapitalEur)}
              />
              <Row label={t('legal.mentions.row_rcs')} value={LEGAL_ENTITY.rcsNumber} />
              <Row label={t('legal.mentions.row_vat')} value={LEGAL_ENTITY.vatNumber} />
              <Row label={t('legal.mentions.row_office')} value={registeredOfficeLine()} />
              <Row
                label={t('legal.mentions.row_director')}
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
                label={t('legal.mentions.row_contact')}
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
                label={t('legal.mentions.row_phone')}
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

            <H3>{t('legal.mentions.hosting_title')}</H3>
            <P>
              {t('legal.mentions.hosting_body', {
                name: LEGAL_ENTITY.host.name,
                street: LEGAL_ENTITY.host.street,
                city: LEGAL_ENTITY.host.city,
                region: LEGAL_ENTITY.host.region,
                postal: LEGAL_ENTITY.host.postalCode,
              })}
            </P>

            <H3>{t('legal.mentions.ip_title')}</H3>
            <P>{t('legal.mentions.ip_body')}</P>
          </Section>

          {/* ── CGU ─────────────────────────────────────────────────────── */}
          <Section
            id="cgu"
            title={t('legal.cgu.title')}
            subtitle={t('legal.cgu.subtitle')}
          >
            <H3>{t('legal.cgu.s1_title')}</H3>
            <P>{t('legal.cgu.s1_p1', { name: LEGAL_ENTITY.legalName })}</P>
            <P>{t('legal.cgu.s1_p2')}</P>

            <H3>{t('legal.cgu.s2_title')}</H3>
            <P>{t('legal.cgu.s2_p1')}</P>
            <UL>
              <li>{t('legal.cgu.s2_li1')}</li>
              <li>{t('legal.cgu.s2_li2')}</li>
              <li>{t('legal.cgu.s2_li3')}</li>
            </UL>
            <Note>
              <Term
                label={t('legal.cgu.ai_notice_label')}
                body={t('legal.cgu.ai_notice_body')}
              />
            </Note>

            <H3>{t('legal.cgu.s3_title')}</H3>
            <P>{t('legal.cgu.s3_p1')}</P>

            <H3>{t('legal.cgu.s4_title')}</H3>
            <P>{t('legal.cgu.s4_p1')}</P>

            <H3>{t('legal.cgu.s5_title')}</H3>
            <P>
              <Term
                label={t('legal.cgu.s5_service_label')}
                body={t('legal.cgu.s5_service_body', { name: LEGAL_ENTITY.legalName })}
              />
            </P>
            <P>
              <Term
                label={t('legal.cgu.s5_user_label')}
                body={t('legal.cgu.s5_user_body')}
              />
            </P>

            <H3>{t('legal.cgu.s6_title')}</H3>
            <P>{t('legal.cgu.s6_p1')}</P>
            <UL>
              <li>{t('legal.cgu.s6_li1')}</li>
              <li>{t('legal.cgu.s6_li2')}</li>
              <li>{t('legal.cgu.s6_li3')}</li>
              <li>{t('legal.cgu.s6_li4')}</li>
            </UL>
          </Section>

          {/* ── CONFIDENTIALITÉ ─────────────────────────────────────────── */}
          <Section
            id="confidentialite"
            title={t('legal.privacy.title')}
            subtitle={t('legal.privacy.subtitle')}
          >
            <H3>{t('legal.privacy.s1_title')}</H3>
            <P>{t('legal.privacy.s1_p1')}</P>
            <UL>
              <li>
                <Term
                  label={t('legal.privacy.s1_li1_label')}
                  body={t('legal.privacy.s1_li1_body')}
                />
              </li>
              <li>
                <Term
                  label={t('legal.privacy.s1_li2_label')}
                  body={t('legal.privacy.s1_li2_body')}
                />
              </li>
              <li>
                <Term
                  label={t('legal.privacy.s1_li3_label')}
                  body={t('legal.privacy.s1_li3_body')}
                />
              </li>
              <li>
                <Term
                  label={t('legal.privacy.s1_li4_label')}
                  body={t('legal.privacy.s1_li4_body')}
                />
              </li>
            </UL>

            <H3>{t('legal.privacy.s2_title')}</H3>
            <P>{t('legal.privacy.s2_p1')}</P>
            <UL>
              <li>{t('legal.privacy.s2_li1')}</li>
              <li>{t('legal.privacy.s2_li2')}</li>
              <li>{t('legal.privacy.s2_li3')}</li>
              <li>{t('legal.privacy.s2_li4')}</li>
            </UL>

            <H3>{t('legal.privacy.s3_title')}</H3>
            <P>
              {t('legal.privacy.s3_p1')}{' '}
              <strong>{t('legal.privacy.s3_never_sell')}</strong>
            </P>

            <H3>{t('legal.privacy.s4_title')}</H3>
            <P>{t('legal.privacy.s4_p1')}</P>

            <H3>{t('legal.privacy.s5_title')}</H3>
            <P>{t('legal.privacy.s5_p1')}</P>

            <H3>{t('legal.privacy.s6_title')}</H3>
            <P>
              <Term
                label={t('legal.privacy.s6_self_label')}
                body={t('legal.privacy.s6_self_body')}
              />
            </P>
            <UL>
              <li>
                <Term
                  label={t('legal.privacy.s6_li1_label')}
                  body={t('legal.privacy.s6_li1_body')}
                />
              </li>
              <li>
                <Term
                  label={t('legal.privacy.s6_li2_label')}
                  body={t('legal.privacy.s6_li2_body')}
                />
              </li>
            </UL>
            <P>
              <strong>{t('legal.privacy.s6_kept_title')}</strong>
            </P>
            <UL>
              <li>{t('legal.privacy.s6_kept_li1')}</li>
              <li>{t('legal.privacy.s6_kept_li2')}</li>
              <li>{t('legal.privacy.s6_kept_li3')}</li>
            </UL>
            <P>
              <Term
                label={t('legal.privacy.s6_backups_label')}
                body={t('legal.privacy.s6_backups_body')}
              />
            </P>
            <P>
              <Term
                label={t('legal.privacy.s6_export_label')}
                body={t('legal.privacy.s6_export_body')}
              />
            </P>
            <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
              <strong className="text-gray-900">{t('legal.privacy.rights_label')}</strong>{' '}
              {t('legal.privacy.rights_body')}{' '}
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
            title={t('legal.cgv.title')}
            subtitle={t('legal.cgv.subtitle')}
          >
            <H3>{t('legal.cgv.s1_title')}</H3>
            <P>{t('legal.cgv.s1_p1', { name: LEGAL_ENTITY.legalName })}</P>

            <H3>{t('legal.cgv.s2_title')}</H3>
            <P>{t('legal.cgv.s2_p1')}</P>

            <H3>{t('legal.cgv.s3_title')}</H3>
            <P>
              <Term
                label={t('legal.cgv.s3_renewal_label')}
                body={t('legal.cgv.s3_renewal_body')}
              />
            </P>
            <P>
              <Term
                label={t('legal.cgv.s3_cancel_label')}
                body={t('legal.cgv.s3_cancel_body')}
              />
            </P>

            <H3>{t('legal.cgv.s4_title')}</H3>
            <Note>{t('legal.cgv.s4_notice')}</Note>
            <P>{t('legal.cgv.s4_p1')}</P>

            <H3>{t('legal.cgv.s5_title')}</H3>
            <P>{t('legal.cgv.s5_p1', { name: LEGAL_ENTITY.legalName })}</P>
          </Section>

          {/* ── PARRAINAGE ──────────────────────────────────────────────── */}
          <Section
            id="parrainage"
            title={t('legal.referral.title')}
            subtitle={t('legal.referral.subtitle')}
          >
            <H3>{t('legal.referral.s1_title')}</H3>
            <P>{t('legal.referral.s1_p1')}</P>

            <H3>{t('legal.referral.s2_title')}</H3>
            <P>
              {t('legal.referral.s2_lead')}{' '}
              <strong>{t('legal.referral.s2_condition')}</strong>.{' '}
              {t('legal.referral.s2_no_entitlement')}
            </P>
            <P>{t('legal.referral.s2_held')}</P>

            <H3>{t('legal.referral.s3_title')}</H3>
            <P>{t('legal.referral.s3_p1')}</P>

            <H3>{t('legal.referral.s4_title')}</H3>
            <Note>
              {t('legal.referral.s4_notice', { name: LEGAL_ENTITY.legalName })}
            </Note>

            <H3>{t('legal.referral.s5_title')}</H3>
            <P>{t('legal.referral.s5_p1', { name: LEGAL_ENTITY.legalName })}</P>
          </Section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default Legal;
