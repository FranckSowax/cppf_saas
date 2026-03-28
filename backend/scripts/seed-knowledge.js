/**
 * Script de seed pour la base de connaissances CPPF
 * Injecte les 32 chunks de la base de connaissance dans le RAG (pgvector)
 *
 * Usage:
 *   node backend/scripts/seed-knowledge.js
 *
 * Requires: OPENAI_API_KEY et DATABASE_URL dans l'environnement ou .env
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const ragService = require('../src/services/rag');

// ============================================
// 32 CHUNKS — Base de connaissance CPPF
// ============================================

const CHUNKS = [
  {
    title: "CPPF — Présentation générale",
    content: `La CPPF (Caisse des Pensions et des Prestations Familiales des agents de l'État) est un établissement public à caractère administratif gabonais, créé par le décret n°0236/PR/MBCP du 8 juillet 2014. Elle est dotée de la personnalité morale et jouit d'une autonomie de gestion administrative et financière.

Elle hérite des missions de l'ex-Direction de la Dette Viagère (pour la gestion des pensions des agents publics retraités) et de la Direction de la Solde (pour les prestations familiales).

Les prestations servies par la CPPF sont : les pensions de retraite et les prestations familiales et sociales.

Contact :
- Téléphone : (+241) 011-73-02-26 / 062-16-15-23
- Email : contact@cppf.ga
- Site web : https://cppf.ga
- Facebook : https://www.facebook.com/CPPFGABON
- LinkedIn : linkedin.com/company/cppf-gabon/
- YouTube : https://www.youtube.com/@CPPFGABON
- TikTok : https://www.tiktok.com/@cppf.gabon

Directeur Général : Carl NGUEBA BOUTOUNDOU`,
    metadata: { category: "À propos", keywords: "CPPF, Gabon, présentation, création, missions, contact" }
  },
  {
    title: "CPPF — Missions et engagement",
    content: `La mission de la CPPF est de garantir et faciliter aux agents de l'État l'accès aux prestations sociales, en assurant avec rigueur et professionnalisme la liquidation et le paiement mensuel des pensions et des prestations familiales.

Cette mission s'articule autour de trois axes :
- Pensions de vieillesse et de réversion
- Prestations familiales et sociales
- Risques professionnels (accidents de travail, maladies professionnelles et invalidité)`,
    metadata: { category: "À propos", keywords: "mission, engagement, prestations, pensions, rôle" }
  },
  {
    title: "CPPF — Financement",
    content: `Les ressources de la CPPF sont constituées par :
- Les dotations du budget de l'État
- La contribution de l'État employeur et de ses démembrements
- La contribution des agents de l'État
- Les ressources propres
- Les concours des partenaires au développement
- Les dons et legs
- Toutes autres ressources affectées à la Caisse`,
    metadata: { category: "À propos", keywords: "financement, ressources, budget, cotisations" }
  },
  {
    title: "CPPF — Valeurs",
    content: `Les six valeurs de la CPPF sont :
- Compétence : capacité à accomplir les tâches de manière efficace et efficiente
- Diligence : aptitude à accomplir les tâches avec promptitude, soin et précision
- Résilience : capacité à s'adapter aux changements et à surmonter les difficultés
- Respect : traiter tous les clients, employés et partenaires avec dignité et courtoisie
- Intégrité : engagement à agir de manière honnête, éthique et responsable
- Prévoyance : aptitude à anticiper les risques et prendre des mesures préventives`,
    metadata: { category: "À propos", keywords: "valeurs, compétence, diligence, résilience, respect, intégrité, prévoyance" }
  },
  {
    title: "CPPF — Vision stratégique (3 axes)",
    content: `La vision de développement de la CPPF repose sur 3 axes : STANDARDISER — INNOVER — SÉCURISER, pour faire de la CPPF un organisme de prévoyance sociale de référence et un investisseur institutionnel autonome et résilient au service du Gabon.

Axe I — Standardiser la gouvernance et la gestion des risques : système de gouvernance robuste et transparent, politique de gestion des risques, renforcement des compétences.

Axe II — Innover et moderniser la gestion : système d'information intégré (ERP), digitalisation des processus, intelligence artificielle, certification ISO 9001:2015, e-services clients, hotline, inclusion numérique et bancaire des pensionnés.

Axe III — Sécuriser la performance financière : augmentation du taux de cotisation, rationalisation des dépenses, constitution de réserves techniques, politique de placements financiers, nouvelles sources de financement (retraite complémentaire, fonds de pension souverain, assurance vie).`,
    metadata: { category: "Stratégie", keywords: "vision, axes stratégiques, standardiser, innover, sécuriser" }
  },
  {
    title: "Immatriculation des agents",
    content: `L'immatriculation est l'opération qui inscrit un agent public à la CPPF dès son recrutement. Elle attribue un numéro d'identification unique, indispensable pour le suivi de la carrière et l'ouverture des droits à pension. Encadrée par le Décret n°0236/PR/MBCP du 08 juillet 2014.

Personnes concernées :

Régime spécial : Président de la République, Vice-Président, Membres du Gouvernement, Membres du Parlement, Membres des Institutions constitutionnelles.

Régime général : Fonctionnaires civils de l'État, Magistrats et greffiers, Forces de défense et de sécurité, Agents de la sécurité pénitentiaire, Contractuels de l'État, Contractuels des forces de défense.

Mode opératoire :
- Affiliation obligatoire de tout employeur auprès de la CPPF
- Déclaration obligatoire de tout agent public pour son immatriculation
- Déclaration du nouvel agent en cas de détachement (dans un délai de 30 jours)
- Suivi et reconstitution de la carrière par la CPPF`,
    metadata: { category: "Actifs / Ma carrière", keywords: "immatriculation, inscription, numéro, agent public, recrutement" }
  },
  {
    title: "Cotisations et recouvrement",
    content: `Le recouvrement consiste à collecter les cotisations sociales (part salariale et patronale) versées par les employeurs.

Assiette de cotisation : basée sur la hiérarchie, la catégorie, la classe et l'échelon de l'agent. Pour les agents non permanents, la cotisation porte sur la totalité de la solde. Les indemnités et prestations familiales sont exclues.

Taux de cotisation :
- Régime Spécial — Part Salariale — Cotisation globale : 10%
- Régime Général — Part Patronale — Retraite : 18%
- Régime Général — Part Patronale — Prestations Familiales : 5%
- Régime Général — Part Salariale — Cotisation globale : 7%

Mode opératoire : Émission des appels à cotisation par la CPPF → Prélèvement par l'employeur → Paiement auprès de la CPPF → Transmission de la preuve → Mise à jour des comptes.

Rachat de cotisations : Maximum 2 années, calcul basé sur le dernier traitement, demande au moins 3 mois avant la retraite.

Sanction : Toute absence de déclaration mensuelle entraîne une majoration de 2% du SMIG par agent concerné (article 14 de l'arrêté n°058). Il est interdit de reverser les cotisations dans un autre organisme.`,
    metadata: { category: "Actifs / Ma carrière", keywords: "cotisation, recouvrement, taux, part salariale, part patronale, assiette" }
  },
  {
    title: "Demande de retraite — Modes de départ",
    content: `La législation gabonaise prévoit plusieurs modalités de départ à la retraite.

Retraite à l'âge légal :
- Depuis la réforme de 2024, l'âge légal est fixé à 62 ans pour les agents civils de l'État
- Prorogation possible pour certains corps, sans dépasser 65 ans
- Pour les forces de défense et de sécurité : entre 50 et 70 ans selon le corps et le grade
- La radiation des cadres est automatique à l'atteinte de la limite d'âge

Retraite anticipée (avant la limite d'âge) :
- Carrière longue : au moins 25 années pour les forces de défense, au moins 30 années pour les civils
- Incapacité totale et permanente imputable aux fonctions

Conditions d'ouverture du droit à pension :
- Avoir atteint l'âge légal
- Justifier d'au moins 15 années de services effectifs validées
- Montant proportionnel à la durée de service`,
    metadata: { category: "Actifs / Retraite", keywords: "retraite, départ, âge légal, retraite anticipée, limite d'âge, 62 ans" }
  },
  {
    title: "Liquidation de la pension et calcul",
    content: `La liquidation est l'étape où la CPPF détermine le montant exact de la pension de retraite.

Éléments pris en compte :
- La dernière solde de base (liée au dernier indice détenu)
- Le nombre total d'années de services validées
- Le coefficient de progressivité (proportion des droits acquis dans le cadre du Nouveau Système de Rémunération — NSR)

Conditions importantes :
- La prise en compte des services est subordonnée au versement effectif des retenues pour pension
- Les services accomplis au-delà de la limite d'âge ne sont pas pris en compte (sauf changement de statut prévu par la réglementation)`,
    metadata: { category: "Retraités", keywords: "liquidation, calcul, pension, montant, solde de base, NSR, coefficient" }
  },
  {
    title: "Obligations du retraité",
    content: `Le retraité doit :

Déclarer sans délai à la CPPF :
- Toute reprise de service ou d'activité professionnelle
- Tout changement de situation administrative
- Tout changement familial : mariage, remariage, divorce, séparation, décès du conjoint, naissance, reconnaissance ou décès d'un enfant

Contrôle de vie : Justifier périodiquement de son existence, généralement deux fois par an, par un certificat de vie ou tout autre dispositif reconnu par la CPPF.

Sanction : L'absence de contrôle de vie dans les délais entraîne la suspension temporaire du paiement de la pension, jusqu'à régularisation.`,
    metadata: { category: "Retraités", keywords: "obligations, contrôle de vie, déclaration, changement, suspension" }
  },
  {
    title: "Continuité des droits familiaux à la retraite",
    content: `Le départ à la retraite ne met pas fin aux droits sociaux et familiaux. Les prestations familiales continuent d'être servies pour les enfants à charge (sous conditions d'âge, de scolarité, etc.).

En cas de décès du retraité :
- Le conjoint survivant peut bénéficier d'une pension de réversion
- Les enfants mineurs ouvrent droit à une pension d'orphelin`,
    metadata: { category: "Retraités", keywords: "droits familiaux, retraite, prestations familiales, conjoint survivant, orphelin, réversion" }
  },
  {
    title: "Pension du Régime Général",
    content: `La pension de retraite du régime général est une allocation financière, personnelle et viagère, accordée aux agents publics en contrepartie des services accomplis.

Personnes concernées :
- Fonctionnaires civils de l'État
- Magistrats
- Greffiers
- Agents des forces de défense et de sécurité
- Agents du corps autonome paramilitaire de la sécurité pénitentiaire
- Contractuels de l'État`,
    metadata: { category: "Retraités / Pensions", keywords: "régime général, pension, fonctionnaire, magistrat, militaire, contractuel" }
  },
  {
    title: "Pension du Régime Spécial",
    content: `Les régimes spéciaux reposent sur des dispositions dérogatoires au régime général, concernant les personnes ayant assumé des fonctions électives, nationales, gouvernementales ou régies par des textes spéciaux. Le montant est déterminé en fonction de la durée d'exercice et du traitement perçu.

Personnes concernées :
- Ancien Président de la République
- Ancien Vice-Président de la République
- Ancien Premier Ministre
- Ancien Président du Parlement
- Ancien Président de la Cour Constitutionnelle
- Ancien Président du Conseil Économique et Social
- Ancien Président du Conseil National de la Communication
- Ancien Membre du Parlement (député et sénateur)
- Ancien Membre du Gouvernement
- Ancien Ambassadeur Extraordinaire et Plénipotentiaire
- Ancien Membre de la Cour Constitutionnelle`,
    metadata: { category: "Retraités / Pensions", keywords: "régime spécial, pension, président, ministre, député, sénateur, ambassadeur" }
  },
  {
    title: "Remboursement des retenues pour pension",
    content: `Le remboursement des cotisations consiste en la restitution des sommes prélevées au titre des cotisations de retraite à l'agent public n'ayant pas validé 15 années de services effectifs au moment de sa cessation d'activité.

Caractéristiques :
- Il ne s'agit pas d'une pension à vie
- Les cotisations sont restituées en une seule fois, sous forme de capital

Personnes concernées :
- L'agent n'ayant pas effectué 15 années de service à la date de cessation
- En cas de décès de l'agent, son mandataire légal peut effectuer la demande`,
    metadata: { category: "Retraités", keywords: "remboursement, retenues, cotisations, 15 ans, capital" }
  },
  {
    title: "Allocation Familiale (AF)",
    content: `L'Allocation Familiale est une prestation versée mensuellement aux agents publics et retraités de l'État affiliés à la CPPF.

Montant : 8 000 FCFA par mois et par enfant.

Conditions :
- Enfant jusqu'à l'âge de 16 ans
- Si scolarisé : limite portée à 21 ans (avec attestation de scolarité ou bulletins de notes)
- Enfant atteint d'infirmité ou maladie incurable dans l'impossibilité d'exercer une activité : limite portée à 21 ans

Enfants éligibles :
- Enfant légitime
- Enfant naturel à charge
- Enfant adopté légalement
- Enfant né hors mariage reconnu (limité à 6 enfants)
- Enfant orphelin placé sous tutelle de l'agent`,
    metadata: { category: "Prestations familiales", keywords: "allocation familiale, AF, enfant, 8000 FCFA, mensuelle" }
  },
  {
    title: "Allocation Rentrée Scolaire (ARS)",
    content: `L'Allocation de Rentrée Scolaire est versée une seule fois par an, avant la fin du 4ème trimestre.

Montant : 62 500 FCFA par enfant et par an.

Conditions :
- L'enfant doit déjà bénéficier de l'Allocation Familiale
- L'enfant doit être scolarisé dans un établissement public ou privé reconnu par le Ministère de l'Éducation Nationale
- Âge compris entre 3 et 16 ans

Personnes concernées : Agents publics actifs et retraités de l'État.

Formulaire requis : Certificat de scolarité.`,
    metadata: { category: "Prestations familiales", keywords: "rentrée scolaire, ARS, fournitures, 62500 FCFA, annuelle" }
  },
  {
    title: "Allocation Salaire Unique (ASU)",
    content: `L'Allocation de Salaire Unique est un supplément familial versé mensuellement à l'agent public dont le conjoint ne dispose pas d'un revenu professionnel.

Montant : 2 200 FCFA par mois et par enfant.

Conditions :
- L'enfant doit être éligible aux allocations familiales
- Limité à 4 enfants

Personnes concernées : Agents publics actifs et retraités.`,
    metadata: { category: "Prestations familiales", keywords: "salaire unique, ASU, conjoint, 2200 FCFA" }
  },
  {
    title: "Allocation de Soutien Familial (ASF)",
    content: `L'Allocation de Soutien Familial est versée aux parents d'un enfant éligible à l'Allocation Familiale, atteint d'une maladie grave ou d'un handicap physique ou mental.

Montant : 50 000 FCFA par mois et par enfant.

Conditions :
- Enfant éligible à l'Allocation Familiale
- Enfant âgé de moins de 21 ans

Personnes concernées : Agents publics actifs et retraités.`,
    metadata: { category: "Prestations familiales", keywords: "soutien familial, ASF, handicap, maladie grave, 50000 FCFA" }
  },
  {
    title: "Allocation Prénatale (APN)",
    content: `L'Allocation Prénatale est une aide financière forfaitaire destinée à accompagner les futurs parents durant la grossesse.

Montant : 80 000 FCFA, versée en une seule fois au cours du 7ème mois de grossesse.

Bénéficiaires :
- L'agente publique (fonctionnaire ou contractuelle de l'État) en état de grossesse
- L'épouse de l'agent public (mariage civil obligatoire), si elle ne travaille pas`,
    metadata: { category: "Prestations familiales", keywords: "allocation prénatale, APN, grossesse, 80000 FCFA" }
  },
  {
    title: "Prime à la Naissance (PN)",
    content: `La Prime à la Naissance est une aide financière forfaitaire versée après l'accouchement.

Montant : 60 000 FCFA par enfant. En cas de jumeaux, triplés ou plus, la prime est multipliée (ex : 120 000 FCFA pour des jumeaux).

Versée en une seule fois, sur présentation de l'acte de naissance ou du certificat d'accouchement.

Bénéficiaires :
- L'agente publique ayant accouché
- L'épouse de l'agent public (mariage civil obligatoire)`,
    metadata: { category: "Prestations familiales", keywords: "prime naissance, PN, accouchement, 60000 FCFA, jumeaux" }
  },
  {
    title: "Pension Temporaire d'Orphelin (PTO) — Décès",
    content: `La Pension Temporaire d'Orphelin est versée par l'État aux enfants d'un agent public après son décès.

Montant : Chaque enfant reçoit 10% de la pension du parent décédé. Le total ne peut pas dépasser 40% de la pension.

Versement : Dès le mois suivant le décès, jusqu'à ce que l'enfant atteigne 21 ans.

Conditions :
- Le parent décédé devait être retraité, ou en activité avec des droits à la retraite, ou décédé suite à un accident de service.

Enfants concernés :
- Enfants légitimes et naturels reconnus, quelle que soit la date de naissance
- Enfants adoptifs (si l'acte d'adoption est antérieur à la radiation des cadres)`,
    metadata: { category: "Décès", keywords: "pension orphelin, PTO, décès, enfant, 10%, 40%, 21 ans" }
  },
  {
    title: "Pension du Conjoint Survivant — Décès",
    content: `La pension de réversion est un droit accordé à l'époux ou à l'épouse d'un agent public décédé. Elle permet de percevoir une part de la pension de retraite.

Personnes concernées :
- Conjoint du mariage monogamique légal
- Époux ou épouses en cas de polygamie (dossier individuel auprès de la CPPF)
- Conjoints séparés de corps (sous condition que le mariage n'a pas été dissout par le divorce, pas de remariage, pas de concubinage notoire)`,
    metadata: { category: "Décès", keywords: "conjoint survivant, pension réversion, veuf, veuve, décès, mariage" }
  },
  {
    title: "Pension d'Ascendant Survivant — Décès",
    content: `La pension d'ascendant est une prestation subsidiaire accordée aux parents (père et/ou mère) de l'agent décédé, uniquement en l'absence totale de conjoint survivant et d'orphelins.

Bénéficiaires : Ascendants (père et mère) figurant sur l'acte de naissance de l'agent décédé.

Montant : 60% de la pension que l'agent détenait ou aurait pu obtenir — réparti à 30% pour le père et 30% pour la mère.

Règles importantes :
- L'inexistence, l'absence, le décès ou la disparition d'un parent n'ouvre pas de droit supplémentaire à l'autre
- Non cumulable avec une rémunération d'activité ou toute pension obtenue de son propre chef ou à titre de conjoint survivant`,
    metadata: { category: "Décès", keywords: "ascendant survivant, parents, père, mère, 60%, subsidiaire" }
  },
  {
    title: "Rente d'invalidité",
    content: `La rente d'invalidité est attribuée à l'agent public reconnu partiellement ou totalement inapte à l'exercice de ses fonctions avant l'âge légal de retraite, suite à un accident de travail ou une maladie professionnelle reconnue par la Commission de Réforme.

Deux situations :
- Poursuite d'activité : rente d'invalidité versée en complément de la solde
- Impossibilité définitive de travailler : retraite d'office pour invalidité avec pension d'invalidité mensuelle, quel que soit l'âge

Évaluation médicale : La Commission de Réforme examine le dossier médical, confirme le lien avec le service, et fixe le taux d'incapacité.

Personnes concernées : Agents publics de l'État.`,
    metadata: { category: "Invalidité", keywords: "invalidité, rente, incapacité, accident de travail, maladie professionnelle, commission de réforme" }
  },
  {
    title: "Les grabataires (mobilité réduite)",
    content: `Le statut de grabataire est une reconnaissance officielle pour les personnes dont l'état de santé ne permet plus aucune autonomie (incapacité physique ou mentale grave et permanente, confinement au lit ou fauteuil roulant, nécessité d'aide constante).

Points clés :
- Validation par le Médecin Conseil de la CPPF après expertise médicale
- Mesure de curatelle possible (un curateur assiste légalement le malade pour la gestion de ses biens et démarches)

Personnes concernées :
- Les retraités (pensionnés de l'État)
- Les ayants droit (veufs, veuves ou orphelins bénéficiaires d'une pension)`,
    metadata: { category: "Services spécifiques", keywords: "grabataire, mobilité réduite, incapacité, curatelle, médecin conseil" }
  },
  {
    title: "Récapitulatif des prestations familiales et montants",
    content: `Récapitulatif des prestations familiales servies par la CPPF :

- Allocation Familiale (AF) : 8 000 FCFA par enfant, versée mensuellement
- Allocation Rentrée Scolaire (ARS) : 62 500 FCFA par enfant, versée annuellement (avant fin du 4ème trimestre)
- Allocation Salaire Unique (ASU) : 2 200 FCFA par enfant, versée mensuellement
- Allocation Soutien Familial (ASF) : 50 000 FCFA par enfant, versée mensuellement
- Allocation Prénatale (APN) : 80 000 FCFA, versée une seule fois au 7ème mois de grossesse
- Prime à la Naissance (PN) : 60 000 FCFA par enfant, versée une seule fois après accouchement`,
    metadata: { category: "Prestations familiales", keywords: "montants, récapitulatif, prestations, FCFA, résumé" }
  },
  {
    title: "Législation — Pensions Régime Général",
    content: `Textes régissant le régime général des pensions :
- Arrêté n°646/MTAS-FP-CTA du 09/06/1965 : création de la commission de réforme et des pensions
- Ordonnance n°005/PR/MEP du 27/01/2025 : régime particulier des pensions des Gouverneurs de Province
- Arrêté n°0058/PM du 26/02/2024 : règles de procédure applicables au régime général des pensions
- Décret n°0051/PR/MCP du 07/02/2024 : fixant le régime général des pensions de l'État
- Arrêté n°000010/MCP/MEP du 19/02/2024 : conditions de revalorisation des pensions concédées avant le 1er août 2015`,
    metadata: { category: "Législation", keywords: "loi, décret, arrêté, législation, régime général, textes" }
  },
  {
    title: "Législation — Pensions Régime Spécial",
    content: `Textes régissant les régimes spéciaux :
- Décret n°260/PR/MFEBP du 11/03/2004 : régime spécial des anciens Présidents de la République
- Décret n°259/PR/MFEBP du 11/03/2004 : régime spécial des anciens Vice-Présidents, Premiers Ministres et Présidents de Chambre du Parlement
- Loi n°002/2008 du 08/05/2008 : régime des membres du gouvernement, députés et sénateurs
- Ordonnance n°9/98 du 05/08/1998 : pension des anciens membres de la Cour constitutionnelle
- Ordonnance n°026/PR/2010 du 12/10/2010 : pension des anciens Chefs de Haute Juridiction
- Ordonnance n°56/75 du 03/10/1975 : pensions pour certains emplois`,
    metadata: { category: "Législation", keywords: "législation, régime spécial, textes, loi" }
  },
  {
    title: "Législation — Textes relatifs à la CPPF",
    content: `Textes relatifs à la CPPF :
- Décret n°0049/PR/MBCP du 07/02/2024 : Statut de la CPPF
- Décret n°0236/PR/MBCP du 08/07/2014 : Création et organisation de la CPPF
- Décret N°007/2017 du 09/08/2017 : Régime des prestations familiales et sociales applicables aux agents de l'État`,
    metadata: { category: "Législation", keywords: "législation, CPPF, création, statut, décret" }
  },
  {
    title: "Législation — Fonction Publique",
    content: `Textes relatifs à la fonction publique :
- Loi n°022/2018 du 08/02/2019 : principes fondamentaux des pensions de l'État
- Décret n°0338/PR/MIM du 28/02/2013 : modification relative à la loi n°4/96
- Loi n°4/96 du 11/03/1996 : régime général des pensions de l'État
- Loi n°007/2017 du 09/08/2017 : régime des prestations familiales et sociales
- Arrêté n°00008/MBCPdu 19/02/2016 : taux des cotisations de l'État au régime des prestations familiales`,
    metadata: { category: "Législation", keywords: "fonction publique, loi, prestations familiales, cotisations" }
  },
  {
    title: "e-CPPF — Services en ligne",
    content: `La CPPF développe des e-services pour simplifier les démarches de ses assurés avec :
- Disponibilité 24h/24 et 7j/7
- Suivi des dossiers en temps réel
- Environnement sécurisé
- Gain de temps (pas de files d'attente, pas de déplacements)
- Technologies de pointe pour la sécurité et la performance

La CPPF a lancé un nouveau Module d'Enrôlement et d'Authentification dans le cadre de sa transformation numérique.`,
    metadata: { category: "Services numériques", keywords: "e-CPPF, numérique, en ligne, e-services, digital, 24h/24" }
  },
  {
    title: "FAQ — Questions fréquentes CPPF",
    content: `Questions fréquentes sur la CPPF :

Q : Qu'est-ce que la CPPF ?
R : La Caisse des Pensions et des Prestations Familiales des agents de l'État, un établissement public gabonais créé en 2014 pour gérer les pensions et prestations familiales des agents publics.

Q : Quel est l'âge de départ à la retraite ?
R : 62 ans pour les agents civils (depuis 2024), entre 50 et 70 ans pour les forces de défense selon le grade. Prorogation possible jusqu'à 65 ans pour certains corps.

Q : Combien d'années de service faut-il pour avoir droit à une pension ?
R : Au moins 15 années de services effectifs. En dessous, l'agent a droit au remboursement de ses cotisations en capital.

Q : Quel est le montant de l'Allocation Familiale ?
R : 8 000 FCFA par mois et par enfant, jusqu'à 16 ans (21 ans si scolarisé).

Q : Qu'est-ce que l'Allocation Rentrée Scolaire ?
R : 62 500 FCFA par enfant par an, versée avant la fin du 4ème trimestre, pour les enfants scolarisés de 3 à 16 ans.

Q : Comment contacter la CPPF ?
R : Par téléphone au (+241) 011-73-02-26 ou 062-16-15-23, par email à contact@cppf.ga, ou via le site cppf.ga.

Q : Qu'est-ce que le contrôle de vie ?
R : Une obligation pour les retraités de justifier de leur existence deux fois par an, sous peine de suspension de la pension.

Q : Qui a droit à la pension de réversion ?
R : Le conjoint survivant légitime d'un agent public décédé, sous conditions de mariage et de non-remariage.

Q : Quelle est la Prime à la Naissance ?
R : 60 000 FCFA par enfant, versée en une seule fois après l'accouchement. Multipliée en cas de naissances multiples.

Q : Quels sont les taux de cotisation ?
R : Régime général : 7% part salariale + 18% retraite part patronale + 5% prestations familiales part patronale. Régime spécial : 10% part salariale.`,
    metadata: { category: "FAQ", keywords: "questions, fréquentes, FAQ, réponses" }
  }
];

// ============================================
// MAIN — Seed
// ============================================
async function seed() {
  console.log('='.repeat(60));
  console.log('  SEED BASE DE CONNAISSANCES CPPF — 32 chunks');
  console.log('='.repeat(60));

  // Vérifier les variables d'environnement
  if (!process.env.OPENAI_API_KEY) {
    console.error('\n❌ OPENAI_API_KEY non définie. Définissez-la dans .env ou en variable d\'environnement.');
    console.error('   Ex: OPENAI_API_KEY=sk-... node backend/scripts/seed-knowledge.js');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL non définie.');
    process.exit(1);
  }

  console.log('\n📦 Initialisation du service RAG...');
  await ragService.initialize();
  console.log('✅ RAG initialisé\n');

  // Vérifier les documents existants
  const existing = await ragService.listDocuments();
  const existingTitles = new Set(existing.map(d => d.title));

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < CHUNKS.length; i++) {
    const chunk = CHUNKS[i];
    const num = String(i + 1).padStart(2, '0');

    // Skip si déjà existant
    if (existingTitles.has(chunk.title)) {
      console.log(`  ⏭️  [${num}/32] "${chunk.title}" — déjà existant, ignoré`);
      skipped++;
      continue;
    }

    try {
      console.log(`  📄 [${num}/32] "${chunk.title}" — indexation...`);
      const doc = await ragService.addDocument(
        chunk.title,
        chunk.content,
        'knowledge-base',
        chunk.metadata
      );
      console.log(`  ✅ [${num}/32] "${chunk.title}" — ${doc.chunk_count} chunks vectorisés`);
      added++;
    } catch (err) {
      console.error(`  ❌ [${num}/32] "${chunk.title}" — ERREUR: ${err.message}`);
      failed++;
    }

    // Petite pause pour ne pas saturer l'API OpenAI
    if (i < CHUNKS.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  RÉSULTAT: ${added} ajoutés | ${skipped} ignorés | ${failed} erreurs`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

seed().catch(err => {
  console.error('\n💥 Erreur fatale:', err.message);
  process.exit(1);
});
