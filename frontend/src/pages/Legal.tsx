import { useEffect } from 'react';
import { ArrowLeft, Shield, FileText, Scale, Mail, Briefcase, Gift } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import SEO from '../components/SEO';

const Legal = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const seoDescription = "Read the legal notice, terms of use, privacy policy and terms of sale for Sophia Coach.";

  // Scroll to section if hash is present
  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(location.hash.replace('#', ''));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  return (
    <div className="min-h-screen bg-[#fbf7ef] font-sans text-[#17211d] selection:bg-[#cfe8d7] selection:text-[#17211d]">
      <SEO 
        title="Legal notice & Terms"
        description={seoDescription}
        canonical="https://sophia-coach.ai/legal"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "Legal notice & Terms",
          "url": "https://sophia-coach.ai/legal",
          "description": seoDescription,
          "inLanguage": "en-GB"
        }}
      />
      <div className="sticky top-0 z-50 border-b border-white/30 bg-[#fffaf1]/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-[#52635b] transition-colors hover:bg-white/52 hover:text-[#17211d]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <img src="/apple-touch-icon.png" alt="Sophia Logo" className="h-8 w-8 rounded-lg" />
            <span className="hidden text-lg font-bold leading-none tracking-tight text-[#17211d] sm:inline md:text-xl">Sophia</span>
          </button>
          <button
            onClick={() => navigate('/auth')}
            className="rounded-full bg-[#17211d] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#31453b]/18 transition-colors hover:bg-[#002d21] md:px-5 md:py-2.5 md:text-sm"
          >
            Member access
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 text-sm font-semibold text-[#52635b] md:hidden">
          <button onClick={() => navigate('/le-plan')} className="shrink-0 rounded-full bg-white/52 px-4 py-2">The Plan</button>
          <button onClick={() => navigate('/l-architecte')} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Architect</button>
          <button onClick={() => navigate('/formules')} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Plans</button>
          <button className="shrink-0 rounded-full bg-[#e3f1e6] px-4 py-2 text-[#002d21]">Legal</button>
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-[linear-gradient(130deg,#f7d8bb_0%,#e9eedc_38%,#c6e5db_100%)] opacity-80" />
        <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div className="mb-12 text-center md:mb-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/36 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#002d21] shadow-sm backdrop-blur-md">
            <Shield className="h-3.5 w-3.5" />
            Sophia legal framework
          </div>
          <h1 className="mb-5 text-4xl font-bold tracking-tight text-[#17211d] md:text-6xl">Legal notice</h1>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-[#405148]">
            Transparency, security, privacy and terms of use for the Sophia AI coach.
          </p>
        </div>
        
        <div className="mb-12 flex flex-wrap justify-center gap-3">
          <a href="#mentions-legales" className="flex items-center gap-2 rounded-full border border-white/54 bg-white/52 px-4 py-2 text-sm font-bold text-[#405148] shadow-sm backdrop-blur transition-colors hover:bg-[#e3f1e6] hover:text-[#002d21]">
            <Briefcase className="h-4 w-4" /> Legal notice
          </a>
          <a href="#cgu" className="flex items-center gap-2 rounded-full border border-white/54 bg-white/52 px-4 py-2 text-sm font-bold text-[#405148] shadow-sm backdrop-blur transition-colors hover:bg-[#e3f1e6] hover:text-[#002d21]">
            <FileText className="h-4 w-4" /> Terms of use
          </a>
          <a href="#confidentialite" className="flex items-center gap-2 rounded-full border border-white/54 bg-white/52 px-4 py-2 text-sm font-bold text-[#405148] shadow-sm backdrop-blur transition-colors hover:bg-[#e3f1e6] hover:text-[#002d21]">
            <Shield className="h-4 w-4" /> Privacy
          </a>
          <a href="#cgv" className="flex items-center gap-2 rounded-full border border-white/54 bg-white/52 px-4 py-2 text-sm font-bold text-[#405148] shadow-sm backdrop-blur transition-colors hover:bg-[#e3f1e6] hover:text-[#002d21]">
            <Scale className="h-4 w-4" /> Terms of sale
          </a>
          <a href="#parrainage" className="flex items-center gap-2 rounded-full border border-white/54 bg-white/52 px-4 py-2 text-sm font-bold text-[#405148] shadow-sm backdrop-blur transition-colors hover:bg-[#e3f1e6] hover:text-[#002d21]">
            <Gift className="h-4 w-4" /> Referral
          </a>
        </div>

        <div className="grid gap-12">
          
          {/* Mentions Légales (Nouveau) */}
          <section id="mentions-legales" className="scroll-mt-32 rounded-3xl border border-[#eadfce] bg-white/72 p-8 shadow-sm backdrop-blur md:p-12">
            <div className="mb-8 flex items-center gap-4 border-b border-[#eadfce] pb-8">
              <div className="rounded-full bg-[#e3f1e6] p-3 text-[#002d21]">
                <Briefcase className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#17211d]">Legal notice</h2>
                <p className="text-sm text-[#6f8178]">Mandatory legal information</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-[#52635b] prose-headings:font-bold prose-headings:text-[#17211d]">
              <h3>1. Site publisher</h3>
              <p>
                The site <strong>sophia-coach.ai</strong> is published by <strong>IKIZEN</strong>.
              </p>

              <h3>2. Contact</h3>
              <p>
                For any question or request, you can contact us at:<br/>
                <a href="mailto:sophia@sophia-coach.ai" className="text-[#002d21] hover:underline">sophia@sophia-coach.ai</a>
              </p>

              <h3>3. Hosting</h3>
              <p>
                The site is hosted by:<br/>
                <strong>Vercel Inc.</strong><br/>
                440 N Barranca Ave #4133<br/>
                Covina, CA 91723<br/>
                United States
              </p>

              <h3>4. Intellectual property</h3>
              <p>
                This site as a whole is governed by French and international copyright and intellectual property law. All reproduction rights are reserved, including for downloadable documents and for iconographic and photographic material.
              </p>
            </div>
          </section>

          {/* CGU */}
          <section id="cgu" className="scroll-mt-32 rounded-3xl border border-[#eadfce] bg-white/72 p-8 shadow-sm backdrop-blur md:p-12">
            <div className="mb-8 flex items-center gap-4 border-b border-[#eadfce] pb-8">
              <div className="rounded-full bg-[#e3f1e6] p-3 text-[#002d21]">
                <FileText className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#17211d]">Terms of Use</h2>
                <p className="text-sm text-[#6f8178]">Rules for accessing and using the platform</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-[#52635b] prose-headings:font-bold prose-headings:text-[#17211d] prose-a:text-[#002d21]">
              <p className="mb-6 text-sm italic text-[#6f8178]">In force as of {new Date().toLocaleDateString('en-GB')}</p>
              
              <h3>1. Purpose and acceptance</h3>
              <p>
                These Terms of Use (the "Terms") govern access to and use of the "Sophia" SaaS platform (the "Service"), published by <strong>IKIZEN</strong> (the "Publisher").
              </p>
              <p>
                Using the Service implies unreserved acceptance of these Terms. The user acknowledges having read all of the conditions before ticking the "I accept" box when signing up.
              </p>

              <h3>2. Description of the Service</h3>
              <p>
                Sophia is an intelligent virtual assistant (AI) for personal development, productivity and life design. The Service allows you in particular to:
              </p>
              <ul>
                <li>Generate personalised action plans to organise your days and reach your goals.</li>
                <li>Interact with a conversational AI for motivational support and habit tracking.</li>
                <li>Access tools for structuring identity and tracking progress.</li>
              </ul>
              <p className="rounded-2xl border border-[#cfe8d7] bg-[#eef8ef] p-4 text-sm text-[#002d21]">
                <strong>AI notice:</strong> The advice and content generated by Sophia are produced by artificial intelligence algorithms. They are provided for information and decision support, and cannot replace human professional judgement or constitute certified legal, medical or financial advice.
              </p>

              <h3>3. Access to the Service</h3>
              <p>
                The Service is available 24/7, except in cases of force majeure or maintenance. The Publisher reserves the right to suspend, interrupt or limit access to all or part of the Service for technical or security reasons, without this giving rise to compensation.
              </p>

              <h3>4. User account</h3>
              <p>
                Registration is required to access the features. The User is solely responsible for keeping their credentials confidential. Any action taken from their account is deemed to have been taken by them. If credentials are lost or stolen, the User must inform the Publisher without delay.
              </p>

              <h3>5. Intellectual property</h3>
              <p>
                <strong>Service content:</strong> All elements of the Service (structure, design, code, algorithms, the "Sophia" trade marks) are the exclusive property of IKIZEN. Any reproduction is prohibited without authorisation.
              </p>
              <p>
                <strong>User content:</strong> The data, text and information provided by the User remain their property. The User grants the Publisher a right to use this content solely for operating and improving the Service (including training AI models, in anonymised form).
              </p>

              <h3>6. Liability</h3>
              <p>
                The Publisher provides the Service under a best-efforts obligation. It cannot be held liable for:
              </p>
              <ul>
                <li>Indirect damages (loss of revenue, loss of opportunity, and so on).</li>
                <li>AI advice being unsuited to the User's specific situation.</li>
                <li>Problems related to the User's own internet connection.</li>
                <li>The consequences of a failure, security incident or hack occurring on third-party providers' infrastructure (hosting, AI model providers, messaging), where no proven fault of the Publisher in selecting or configuring those services is established.</li>
              </ul>
            </div>
          </section>

          {/* Politique de Confidentialité */}
          <section id="confidentialite" className="scroll-mt-32 rounded-3xl border border-[#eadfce] bg-white/72 p-8 shadow-sm backdrop-blur md:p-12">
            <div className="mb-8 flex items-center gap-4 border-b border-[#eadfce] pb-8">
              <div className="rounded-full bg-[#e3f1e6] p-3 text-[#002d21]">
                <Shield className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#17211d]">Privacy policy</h2>
                <p className="text-sm text-[#6f8178]">Protection of your personal data (GDPR)</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-[#52635b] prose-headings:font-bold prose-headings:text-[#17211d]">
              <h3>1. Data collected</h3>
              <p>
                When you use Sophia, we collect the following data:
              </p>
              <ul>
                <li><strong>Identity data:</strong> surname, first name, email, phone number (account identifier).</li>
                <li><strong>Life &amp; goal data:</strong> questionnaire answers, personal goals, generated action plans.</li>
                <li><strong>Conversation data:</strong> the history of exchanges with the Sophia assistant.</li>
                <li><strong>Technical data:</strong> sign-in logs, IP address, browser type.</li>
              </ul>

              <h3>2. Purposes of processing</h3>
              <p>
                Your data is processed for the following reasons:
              </p>
              <ul>
                <li>Providing and personalising the Service (legal basis: performance of the contract).</li>
                <li>Sending notifications and reminders inside the app (legal basis: consent).</li>
                <li>Continuous improvement of the AI algorithms (legal basis: legitimate interest).</li>
                <li>Handling billing and customer support.</li>
              </ul>

              <h3>3. Data sharing</h3>
              <p>
                Your data is strictly confidential. It is passed only to the technical sub-processors we cannot operate without (cloud hosting, AI API provider, message delivery service), who are bound by the same security obligations. <strong>We never sell your data to advertisers.</strong>
              </p>

              <h3>4. Security</h3>
              <p>
                We put in place technical security measures (SSL/TLS encryption, secured databases) and organisational ones to protect your data against unauthorised access, loss or alteration.
              </p>

              <h3>5. Your rights</h3>
              <p>
                Under the GDPR you have rights of access, rectification, erasure, restriction and portability over your data. You can exercise the erasure and portability rights directly in the app, without contacting us: menu <strong>Account → Options → My data</strong> (export your data) and <strong>Delete my account</strong>.
              </p>

              <h3>6. Data retention and deletion</h3>
              <p>
                <strong>Self-service account deletion:</strong> you can delete your account at any time from the app. Deletion happens in two stages:
              </p>
              <ul>
                <li>
                  <strong>Immediately:</strong> your access is disabled, Sophia stops writing to you and your subscription is cancelled with no further charge.
                </li>
                <li>
                  <strong>Within 7 days:</strong> all of your data (profile, plans, conversations, memories) is permanently and irreversibly deleted from our databases. During that period you can cancel the deletion by signing in again.
                </li>
              </ul>
              <p>
                <strong>Data kept after deletion:</strong>
              </p>
              <ul>
                <li>
                  The <strong>invoices</strong> relating to your payments, kept under the statutory accounting retention obligation (article L.123-22 of the French Commercial Code).
                </li>
                <li>
                  A <strong>minimal anonymised record</strong> of the deletion (cryptographic hashes of the email and phone number, and the deletion date), kept as proof of compliance. It cannot be used to identify you.
                </li>
                <li>
                  Technical usage measurements (volumes and compute costs), <strong>anonymised</strong> at deletion time: they are no longer attached to any person.
                </li>
              </ul>
              <p>
                <strong>Technical backups:</strong> backup copies of our databases may remain temporarily after deletion. They expire automatically on their rotation cycle and are never used to restore deleted data, except in a major technical incident affecting the whole service.
              </p>
              <p>
                <strong>Exporting your data:</strong> you can download a copy of your data (profile, plans, conversations, memories) as JSON at any time from the Account menu. For security, re-authentication is required, a notification is sent to you for every request, and exports are limited to one per 24 hours.
              </p>
              <div className="not-prose mt-6 flex items-start gap-4 rounded-2xl border border-[#cfe8d7] bg-[#eef8ef] p-6">
                <Mail className="mt-1 h-6 w-6 flex-shrink-0 text-[#002d21]" />
                <div>
                  <h4 className="mb-1 text-sm font-bold text-[#17211d]">Exercising your rights</h4>
                  <p className="text-sm text-[#405148]">
                    For any request about your data, contact us at: <a href="mailto:sophia@sophia-coach.ai" className="underline hover:text-[#002d21]">sophia@sophia-coach.ai</a>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CGV */}
          <section id="cgv" className="scroll-mt-32 rounded-3xl border border-[#eadfce] bg-white/72 p-8 shadow-sm backdrop-blur md:p-12">
             <div className="mb-8 flex items-center gap-4 border-b border-[#eadfce] pb-8">
              <div className="rounded-full bg-[#fff0de] p-3 text-[#b26c3a]">
                <Scale className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#17211d]">Terms of Sale</h2>
                <p className="text-sm text-[#6f8178]">Subscriptions, payments and withdrawal</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-[#52635b] prose-headings:font-bold prose-headings:text-[#17211d]">
              <h3>1. Plans and prices</h3>
              <p>
                Services are offered as subscriptions (monthly or annual) or as one-off purchases. Prices are shown in Euros (€) including all taxes on the "Pricing" page. IKIZEN reserves the right to change its prices at any time, but the Service is billed at the prices in force when the order is confirmed.
              </p>

              <h3>2. Payment</h3>
              <p>
                Payment is made by card through our secure payment provider (Stripe). Payment is due immediately on ordering. If payment fails, access to the Service is suspended immediately.
              </p>

              <h3>3. Renewal and cancellation</h3>
              <p>
                <strong>Renewal:</strong> Subscriptions renew automatically for a period identical to the one originally taken out, unless cancelled by the User.
              </p>
              <p>
                <strong>Cancellation:</strong> The User can cancel their subscription at any time from the "My Account" area. Cancellation takes effect at the end of the current subscription period. No pro-rata refund is made for a period already started.
              </p>

              <h3>4. No right of withdrawal</h3>
              <p className="rounded-2xl border border-[#f6d8b8] bg-[#fff8ec] p-4 text-sm font-medium text-[#8a5633]">
                Under article L.221-28 of the French Consumer Code, the right of withdrawal cannot be exercised for contracts supplying digital content not provided on a physical medium (SaaS) whose performance has begun after the consumer's express prior agreement and express waiver of their right of withdrawal.
              </p>
              <p>
                By subscribing to the Service and accessing the digital features immediately, the User expressly waives their right of withdrawal.
              </p>
              
              <h3>5. Governing law</h3>
              <p>
                These Terms of Sale are governed by French law. In the event of a dispute, jurisdiction is granted to the competent courts in the district of IKIZEN's registered office, notwithstanding multiple defendants or third-party proceedings.
              </p>
            </div>
          </section>

          {/* PROGRAMME DE PARRAINAGE */}
          <section id="parrainage" className="scroll-mt-32 rounded-3xl border border-[#eadfce] bg-white/72 p-8 shadow-sm backdrop-blur md:p-12">
            <div className="mb-8 flex items-center gap-4 border-b border-[#eadfce] pb-8">
              <div className="rounded-full bg-[#e3f1e6] p-3 text-[#002d21]">
                <Gift className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#17211d]">Referral programme</h2>
                <p className="text-sm text-[#6f8178]">Programme conditions</p>
              </div>
            </div>

            <div className="prose prose-slate max-w-none text-[#52635b] prose-headings:font-bold prose-headings:text-[#17211d]">
              <h3>1. How it works</h3>
              <p>
                Every User has a personal referral code, shareable as a link or a code. When someone (the "Referee") creates a Sophia account with that code, their free trial is extended to 30 days (instead of 14). The code must be entered at sign-up: it cannot be added later to an existing account.
              </p>

              <h3>2. Referrer reward</h3>
              <p>
                The Referrer receives one (1) free month of subscription, matching the monthly price of their current plan, as a credit deducted from their next invoices. This reward is credited <strong>only when the Referee pays a first invoice for an amount strictly greater than zero</strong>. The Referee merely signing up, the trial period, or a €0 invoice give no entitlement to a reward.
              </p>
              <p>
                If the Referrer is not yet subscribed when their Referee converts, the reward is held and applied automatically to their first invoices as soon as they take out a subscription.
              </p>

              <h3>3. Cap</h3>
              <p>
                Free months are capped at twelve (12) months per rolling twelve (12) month period per Referrer. Beyond that cap, referrals are still counted but no longer give entitlement to a reward.
              </p>

              <h3>4. Anti-fraud reservation</h3>
              <p className="rounded-2xl border border-[#f6d8b8] bg-[#fff8ec] p-4 text-sm font-medium text-[#8a5633]">
                Self-referral (same person, same phone number, or multiple accounts) is prohibited. The Referee must be a new user who does not already have a Sophia account. IKIZEN reserves the right to refuse, suspend or cancel any reward obtained in breach of these conditions or by any fraudulent or abusive means, and to suspend the accounts involved.
              </p>

              <h3>5. Nature of the reward</h3>
              <p>
                Free months have no monetary value: they are not refundable, transferable or convertible into cash. IKIZEN may change or end the referral programme at any time; rewards already earned remain due.
              </p>
            </div>
          </section>

        </div>
        
        <div className="mt-16 border-t border-[#eadfce] pt-8 text-center">
          <p className="text-sm font-medium text-[#6f8178]">
            © {new Date().getFullYear()} IKIZEN • Sophia Coach
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Legal;
