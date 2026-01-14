import React, { useEffect } from 'react';
import { ArrowLeft, Shield, FileText, Lock, Scale, Mail, Eye, Briefcase } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import SEO from '../components/SEO';

const Legal = () => {
  const navigate = useNavigate();
  const location = useLocation();

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
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <SEO 
        title="Mentions Légales & CGU"
        description="Consultez nos mentions légales, conditions générales d'utilisation (CGU), politique de confidentialité et conditions générales de vente (CGV)."
        canonical="https://sophia-coach.ai/legal"
      />
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <div className="flex items-center gap-2">
            <img src="/apple-touch-icon.png" alt="Sophia Logo" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-xl tracking-tight text-slate-900 leading-none">Sophia</span>
          </div>
          <div className="w-20"></div> {/* Spacer for balance */}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">Mentions Légales</h1>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            Transparence, sécurité et conformité. Voici les règles du jeu pour bâtir votre empire avec Sophia.
          </p>
        </div>
        
        {/* Navigation Rapide */}
        <div className="flex flex-wrap gap-4 justify-center mb-12">
          <a href="#mentions-legales" className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200 text-sm font-bold text-slate-700 hover:text-slate-900 hover:border-slate-400 transition-all">
            <Briefcase className="w-4 h-4" /> Mentions Légales
          </a>
          <a href="#cgu" className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200 text-sm font-bold text-slate-700 hover:text-indigo-600 hover:border-indigo-200 transition-all">
            <FileText className="w-4 h-4" /> CGU
          </a>
          <a href="#confidentialite" className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200 text-sm font-bold text-slate-700 hover:text-emerald-600 hover:border-emerald-200 transition-all">
            <Shield className="w-4 h-4" /> Confidentialité
          </a>
          <a href="#cgv" className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200 text-sm font-bold text-slate-700 hover:text-rose-600 hover:border-rose-200 transition-all">
            <Scale className="w-4 h-4" /> CGV
          </a>
        </div>

        <div className="grid gap-12">
          
          {/* Mentions Légales (Nouveau) */}
          <section id="mentions-legales" className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-slate-200 scroll-mt-24">
            <div className="flex items-center gap-4 mb-8 pb-8 border-b border-slate-100">
              <div className="p-3 bg-slate-100 rounded-2xl text-slate-600">
                <Briefcase className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Mentions Légales</h2>
                <p className="text-slate-500 text-sm">Informations légales obligatoires</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-slate-600 prose-headings:font-bold prose-headings:text-slate-900">
              <h3>1. Éditeur du site</h3>
              <p>
                Le site <strong>sophia-coach.ai</strong> est édité par la société <strong>IKIZEN</strong>.
              </p>

              <h3>2. Contact</h3>
              <p>
                Pour toute question ou demande, vous pouvez nous contacter à l'adresse suivante :<br/>
                <a href="mailto:sophia@sophia-coach.ai" className="text-violet-600 hover:underline">sophia@sophia-coach.ai</a>
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
          <section id="cgu" className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-slate-200 scroll-mt-24">
            <div className="flex items-center gap-4 mb-8 pb-8 border-b border-slate-100">
              <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Conditions Générales d'Utilisation</h2>
                <p className="text-slate-500 text-sm">Règles d'accès et d'usage de la plateforme</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-slate-600 prose-headings:font-bold prose-headings:text-slate-900 prose-a:text-indigo-600">
              <p className="italic text-sm text-slate-400 mb-6">En vigueur au {new Date().toLocaleDateString('fr-FR')}</p>
              
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
              <p className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-indigo-800 text-sm">
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
          <section id="confidentialite" className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-slate-200 scroll-mt-24">
            <div className="flex items-center gap-4 mb-8 pb-8 border-b border-slate-100">
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                <Shield className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Politique de Confidentialité</h2>
                <p className="text-slate-500 text-sm">Protection de vos données personnelles (RGPD)</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-slate-600 prose-headings:font-bold prose-headings:text-slate-900">
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
              <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100 flex items-start gap-4 not-prose mt-6">
                <Mail className="w-6 h-6 text-emerald-600 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-emerald-900 text-sm mb-1">Exercer vos droits</h4>
                  <p className="text-emerald-800 text-sm">
                    Pour toute demande concernant vos données, contactez-nous à : <a href="mailto:sophia@sophia-coach.ai" className="underline hover:text-emerald-950">sophia@sophia-coach.ai</a>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CGV */}
          <section id="cgv" className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-slate-200 scroll-mt-24">
             <div className="flex items-center gap-4 mb-8 pb-8 border-b border-slate-100">
              <div className="p-3 bg-rose-50 rounded-2xl text-rose-600">
                <Scale className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Conditions Générales de Vente</h2>
                <p className="text-slate-500 text-sm">Abonnements, paiements et rétractation</p>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none text-slate-600 prose-headings:font-bold prose-headings:text-slate-900">
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
              <p className="bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 text-sm font-medium">
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
        
        <div className="mt-16 pt-8 border-t border-slate-200 text-center">
          <p className="text-slate-400 text-sm font-medium">
            © {new Date().getFullYear()} IKIZEN • Fait avec <span className="text-rose-400">♥</span> et Intelligence Artificielle.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Legal;
