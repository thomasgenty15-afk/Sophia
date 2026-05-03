import { useEffect } from 'react';
import { ArrowLeft, Shield, FileText, Scale, Mail, Briefcase } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import SEO from '../components/SEO';

const Legal = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const seoDescription = "Consulte les mentions légales, CGU, politique de confidentialité et CGV de Sophia Coach.";

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
        title="Mentions Légales & CGU"
        description={seoDescription}
        canonical="https://sophia-coach.ai/legal"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "Mentions Légales & CGU",
          "url": "https://sophia-coach.ai/legal",
          "description": seoDescription,
          "inLanguage": "fr-FR"
        }}
      />
      <div className="sticky top-0 z-50 border-b border-white/30 bg-[#fffaf1]/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-[#52635b] transition-colors hover:bg-white/52 hover:text-[#17211d]"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </button>
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <img src="/apple-touch-icon.png" alt="Sophia Logo" className="h-8 w-8 rounded-lg" />
            <span className="hidden text-lg font-bold leading-none tracking-tight text-[#17211d] sm:inline md:text-xl">Sophia</span>
          </button>
          <button
            onClick={() => navigate('/auth')}
            className="rounded-full bg-[#17211d] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#31453b]/18 transition-colors hover:bg-[#002d21] md:px-5 md:py-2.5 md:text-sm"
          >
            Accès Membre
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 text-sm font-semibold text-[#52635b] md:hidden">
          <button onClick={() => navigate('/le-plan')} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Le Plan</button>
          <button onClick={() => navigate('/l-architecte')} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Architecte</button>
          <button onClick={() => navigate('/formules')} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Offres</button>
          <button className="shrink-0 rounded-full bg-[#e3f1e6] px-4 py-2 text-[#002d21]">Légal</button>
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-[linear-gradient(130deg,#f7d8bb_0%,#e9eedc_38%,#c6e5db_100%)] opacity-80" />
        <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div className="mb-12 text-center md:mb-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/36 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#002d21] shadow-sm backdrop-blur-md">
            <Shield className="h-3.5 w-3.5" />
            Cadre légal Sophia
          </div>
          <h1 className="mb-5 text-4xl font-bold tracking-tight text-[#17211d] md:text-6xl">Mentions légales</h1>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-[#405148]">
            Transparence, sécurité, confidentialité et conditions d'utilisation du coach IA Sophia.
          </p>
        </div>
        
        <div className="mb-12 flex flex-wrap justify-center gap-3">
          <a href="#mentions-legales" className="flex items-center gap-2 rounded-full border border-white/54 bg-white/52 px-4 py-2 text-sm font-bold text-[#405148] shadow-sm backdrop-blur transition-colors hover:bg-[#e3f1e6] hover:text-[#002d21]">
            <Briefcase className="h-4 w-4" /> Mentions légales
          </a>
          <a href="#cgu" className="flex items-center gap-2 rounded-full border border-white/54 bg-white/52 px-4 py-2 text-sm font-bold text-[#405148] shadow-sm backdrop-blur transition-colors hover:bg-[#e3f1e6] hover:text-[#002d21]">
            <FileText className="h-4 w-4" /> CGU
          </a>
          <a href="#confidentialite" className="flex items-center gap-2 rounded-full border border-white/54 bg-white/52 px-4 py-2 text-sm font-bold text-[#405148] shadow-sm backdrop-blur transition-colors hover:bg-[#e3f1e6] hover:text-[#002d21]">
            <Shield className="h-4 w-4" /> Confidentialité
          </a>
          <a href="#cgv" className="flex items-center gap-2 rounded-full border border-white/54 bg-white/52 px-4 py-2 text-sm font-bold text-[#405148] shadow-sm backdrop-blur transition-colors hover:bg-[#e3f1e6] hover:text-[#002d21]">
            <Scale className="h-4 w-4" /> CGV
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
                <h2 className="text-2xl font-bold text-[#17211d]">Mentions légales</h2>
                <p className="text-sm text-[#6f8178]">Informations légales obligatoires</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-[#52635b] prose-headings:font-bold prose-headings:text-[#17211d]">
              <h3>1. Éditeur du site</h3>
              <p>
                Le site <strong>sophia-coach.ai</strong> est édité par la société <strong>IKIZEN</strong>.
              </p>

              <h3>2. Contact</h3>
              <p>
                Pour toute question ou demande, vous pouvez nous contacter à l'adresse suivante :<br/>
                <a href="mailto:sophia@sophia-coach.ai" className="text-[#002d21] hover:underline">sophia@sophia-coach.ai</a>
              </p>

              <h3>3. Hébergement</h3>
              <p>
                Le site est hébergé par :<br/>
                <strong>Vercel Inc.</strong><br/>
                440 N Barranca Ave #4133<br/>
                Covina, CA 91723<br/>
                États-Unis
              </p>

              <h3>4. Propriété intellectuelle</h3>
              <p>
                L'ensemble de ce site relève de la législation française et internationale sur le droit d'auteur et la propriété intellectuelle. Tous les droits de reproduction sont réservés, y compris pour les documents téléchargeables et les représentations iconographiques et photographiques.
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
                <h2 className="text-2xl font-bold text-[#17211d]">Conditions Générales d'Utilisation</h2>
                <p className="text-sm text-[#6f8178]">Règles d'accès et d'usage de la plateforme</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-[#52635b] prose-headings:font-bold prose-headings:text-[#17211d] prose-a:text-[#002d21]">
              <p className="mb-6 text-sm italic text-[#6f8178]">En vigueur au {new Date().toLocaleDateString('fr-FR')}</p>
              
              <h3>1. Objet et Acceptation</h3>
              <p>
                Les présentes Conditions Générales d'Utilisation (les "CGU") régissent l'accès et l'utilisation de la plateforme SaaS "Sophia" (ci-après le "Service"), éditée par la société <strong>IKIZEN</strong> (ci-après "l'Éditeur").
              </p>
              <p>
                L'utilisation du Service implique l'acceptation sans réserve des présentes CGU. L'utilisateur reconnaît avoir pris connaissance de l'ensemble des conditions avant de cocher la case "J'accepte" lors de son inscription.
              </p>

              <h3>2. Description du Service</h3>
              <p>
                Sophia est un assistant virtuel intelligent (IA) dédié au développement personnel, à la productivité et à l'architecture de vie. Le Service permet notamment de :
              </p>
              <ul>
                <li>Générer des plans d'actions personnalisés pour organiser son quotidien et atteindre ses objectifs.</li>
                <li>Interagir avec une IA conversationnelle pour le soutien motivationnel et le suivi d'habitudes.</li>
                <li>Accéder à des outils de structuration de l'identité et de suivi de progression.</li>
              </ul>
              <p className="rounded-2xl border border-[#cfe8d7] bg-[#eef8ef] p-4 text-sm text-[#002d21]">
                <strong>Avertissement IA :</strong> Les conseils et contenus générés par Sophia sont produits par des algorithmes d'intelligence artificielle. Ils sont fournis à titre informatif et d'aide à la décision, mais ne sauraient remplacer le jugement professionnel humain, ni constituer un conseil juridique, médical ou financier certifié.
              </p>

              <h3>3. Accès au Service</h3>
              <p>
                Le Service est accessible 24h/24 et 7j/7, sauf cas de force majeure ou maintenance. L'Éditeur se réserve le droit de suspendre, d'interrompre ou de limiter l'accès à tout ou partie du Service pour des raisons techniques ou de sécurité, sans que cela n'ouvre droit à indemnisation.
              </p>

              <h3>4. Compte Utilisateur</h3>
              <p>
                L'inscription est obligatoire pour accéder aux fonctionnalités. L'Utilisateur est seul responsable de la confidentialité de ses identifiants. Toute action effectuée depuis son compte est réputée être effectuée par lui. En cas de perte ou de vol d'identifiants, l'Utilisateur doit en informer l'Éditeur sans délai.
              </p>

              <h3>5. Propriété Intellectuelle</h3>
              <p>
                <strong>Contenu du Service :</strong> L'ensemble des éléments du Service (structure, design, codes, algorithmes, marques "Sophia") est la propriété exclusive de IKIZEN. Toute reproduction est interdite sans autorisation.
              </p>
              <p>
                <strong>Contenu Utilisateur :</strong> Les données, textes et informations fournis par l'Utilisateur restent sa propriété. L'Utilisateur concède à l'Éditeur un droit d'utilisation de ces contenus pour les seuls besoins de fonctionnement et d'amélioration du Service (notamment l'entraînement des modèles IA, sous forme anonymisée).
              </p>

              <h3>6. Responsabilité</h3>
              <p>
                L'Éditeur fournit le Service dans le cadre d'une obligation de moyens. Sa responsabilité ne saurait être engagée pour :
              </p>
              <ul>
                <li>Les dommages indirects (perte de chiffre d'affaires, perte de chance, etc.).</li>
                <li>L'inadéquation des conseils de l'IA à la situation spécifique de l'Utilisateur.</li>
                <li>Les problèmes liés au réseau internet de l'Utilisateur.</li>
                <li>Les conséquences d'une défaillance, d'un incident de sécurité ou d'un piratage (hacking) survenant sur les infrastructures des prestataires tiers (hébergeurs, fournisseurs de modèles IA, messagerie), dès lors que l'Éditeur n'a pas commis de faute prouvée dans la sélection ou la configuration de ces services.</li>
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
                <h2 className="text-2xl font-bold text-[#17211d]">Politique de confidentialité</h2>
                <p className="text-sm text-[#6f8178]">Protection de vos données personnelles (RGPD)</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-[#52635b] prose-headings:font-bold prose-headings:text-[#17211d]">
              <h3>1. Données Collectées</h3>
              <p>
                Dans le cadre de l'utilisation de Sophia, nous collectons les données suivantes :
              </p>
              <ul>
                <li><strong>Données d'Identité :</strong> Nom, Prénom, Email, Numéro de téléphone (pour WhatsApp).</li>
                <li><strong>Données de Vie & Objectifs :</strong> Réponses aux questionnaires, objectifs personnels, plans d'actions générés.</li>
                <li><strong>Données Conversationnelles :</strong> Historique des échanges avec l'assistant Sophia.</li>
                <li><strong>Données Techniques :</strong> Logs de connexion, adresse IP, type de navigateur.</li>
              </ul>

              <h3>2. Finalités du Traitement</h3>
              <p>
                Vos données sont traitées pour les raisons suivantes :
              </p>
              <ul>
                <li>Fourniture et personnalisation du Service (Base légale : Exécution du contrat).</li>
                <li>Envoi de notifications et rappels via WhatsApp (Base légale : Consentement).</li>
                <li>Amélioration continue des algorithmes d'IA (Base légale : Intérêt légitime).</li>
                <li>Gestion de la facturation et du support client.</li>
              </ul>

              <h3>3. Partage des Données</h3>
              <p>
                Vos données sont strictement confidentielles. Elles ne sont transmises qu'à nos sous-traitants techniques indispensables (hébergement cloud, fournisseur d'API d'IA, service d'envoi de messages) qui sont tenus aux mêmes obligations de sécurité. <strong>Nous ne vendons jamais vos données à des tiers publicitaires.</strong>
              </p>

              <h3>4. Sécurité</h3>
              <p>
                Nous mettons en œuvre des mesures de sécurité techniques (chiffrement SSL/TLS, bases de données sécurisées) et organisationnelles pour protéger vos données contre tout accès non autorisé, perte ou altération.
              </p>

              <h3>5. Vos Droits</h3>
              <p>
                Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et de portabilité de vos données.
              </p>
              <div className="not-prose mt-6 flex items-start gap-4 rounded-2xl border border-[#cfe8d7] bg-[#eef8ef] p-6">
                <Mail className="mt-1 h-6 w-6 flex-shrink-0 text-[#002d21]" />
                <div>
                  <h4 className="mb-1 text-sm font-bold text-[#17211d]">Exercer vos droits</h4>
                  <p className="text-sm text-[#405148]">
                    Pour toute demande concernant vos données, contactez-nous à : <a href="mailto:sophia@sophia-coach.ai" className="underline hover:text-[#002d21]">sophia@sophia-coach.ai</a>
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
                <h2 className="text-2xl font-bold text-[#17211d]">Conditions Générales de Vente</h2>
                <p className="text-sm text-[#6f8178]">Abonnements, paiements et rétractation</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-[#52635b] prose-headings:font-bold prose-headings:text-[#17211d]">
              <h3>1. Offres et Prix</h3>
              <p>
                Les services sont proposés sous forme d'abonnements (mensuels ou annuels) ou d'achats uniques. Les tarifs sont indiqués en Euros (€) toutes taxes comprises (TTC) sur la page "Tarifs". IKIZEN se réserve le droit de modifier ses prix à tout moment, mais le Service sera facturé sur la base des tarifs en vigueur au moment de la validation de la commande.
              </p>

              <h3>2. Paiement</h3>
              <p>
                Le règlement s'effectue par carte bancaire via notre prestataire de paiement sécurisé (Stripe). Le paiement est exigible immédiatement à la commande. En cas de défaut de paiement, l'accès au Service sera immédiatement suspendu.
              </p>

              <h3>3. Renouvellement et Résiliation</h3>
              <p>
                <strong>Renouvellement :</strong> Les abonnements sont renouvelés tacitement pour une durée identique à celle initialement souscrite, sauf dénonciation par l'Utilisateur.
              </p>
              <p>
                <strong>Résiliation :</strong> L'Utilisateur peut résilier son abonnement à tout moment depuis son espace "Mon Compte". La résiliation prend effet à la fin de la période d'abonnement en cours. Aucun remboursement prorata temporis n'est effectué pour la période entamée.
              </p>

              <h3>4. Absence de Droit de Rétractation</h3>
              <p className="rounded-2xl border border-[#f6d8b8] bg-[#fff8ec] p-4 text-sm font-medium text-[#8a5633]">
                Conformément à l'article L.221-28 du Code de la consommation, le droit de rétractation ne peut être exercé pour les contrats de fourniture d'un contenu numérique non fourni sur un support matériel (SaaS) dont l'exécution a commencé après accord préalable exprès du consommateur et renoncement exprès à son droit de rétractation.
              </p>
              <p>
                En souscrivant au Service et en accédant immédiatement aux fonctionnalités numériques, l'Utilisateur reconnaît renoncer expressément à son droit de rétractation.
              </p>
              
              <h3>5. Loi Applicable</h3>
              <p>
                Les présentes CGV sont soumises à la loi française. En cas de litige, compétence est attribuée aux tribunaux compétents du ressort du siège social de IKIZEN, nonobstant pluralité de défendeurs ou appel en garantie.
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
