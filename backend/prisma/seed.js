const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database CPPF...');

  // ============================================
  // 1. Utilisateur Admin
  // ============================================
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cppf.ga' },
    update: {},
    create: {
      email: 'admin@cppf.ga',
      password: adminPassword,
      name: 'Admin CPPF',
      role: 'ADMIN',
      isActive: true
    }
  });
  console.log(`Admin cree: ${admin.email}`);

  // Utilisateur operateur
  const operatorPassword = await bcrypt.hash('operator123', 10);
  const operator = await prisma.user.upsert({
    where: { email: 'operator@cppf.ga' },
    update: {},
    create: {
      email: 'operator@cppf.ga',
      password: operatorPassword,
      name: 'Operateur CPPF',
      role: 'OPERATOR',
      isActive: true
    }
  });
  console.log(`Operateur cree: ${operator.email}`);

  // ============================================
  // 2. Templates WhatsApp CPPF
  // ============================================
  const templates = await Promise.all([
    prisma.template.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'cppf_bienvenue_actif',
        displayName: 'Bienvenue Actif',
        category: 'UTILITY',
        content: 'Bienvenue {{1}} sur le service WhatsApp de la CPPF ! Suivez vos cotisations et preparez votre retraite en toute serenite.',
        variables: ['nom'],
        language: 'fr',
        status: 'APPROVED',
        approvedAt: new Date()
      }
    }),
    prisma.template.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'cppf_notification_paiement',
        displayName: 'Notification de paiement',
        category: 'UTILITY',
        content: 'Bonjour {{1}}, votre pension/allocation du mois de {{2}} a ete viree le {{3}}. CPPF - Au service des agents de l\'Etat.',
        variables: ['nom', 'mois', 'date_virement'],
        language: 'fr',
        status: 'APPROVED',
        approvedAt: new Date()
      }
    }),
    prisma.template.upsert({
      where: { id: '00000000-0000-0000-0000-000000000003' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'cppf_rappel_certificat_vie',
        displayName: 'Rappel certificat de vie',
        category: 'UTILITY',
        content: 'Rappel CPPF : Votre certificat de vie expire le {{1}}. Rendez-vous dans votre antenne CPPF la plus proche pour le renouveler. Info : (+241) 011-73-02-26',
        variables: ['date_expiration'],
        language: 'fr',
        status: 'APPROVED',
        approvedAt: new Date()
      }
    }),
    prisma.template.upsert({
      where: { id: '00000000-0000-0000-0000-000000000004' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000004',
        name: 'cppf_nouveau_retraite',
        displayName: 'Bienvenue nouveau retraite',
        category: 'MARKETING',
        content: 'Felicitations {{1}} ! Votre pension a ete liquidee avec succes. Decouvrez votre espace retraite sur e-CPPF : {{2}}',
        variables: ['nom', 'lien'],
        language: 'fr',
        status: 'APPROVED',
        approvedAt: new Date()
      }
    }),
    prisma.template.upsert({
      where: { id: '00000000-0000-0000-0000-000000000005' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000005',
        name: 'cppf_rentree_scolaire',
        displayName: 'Allocation rentree scolaire',
        category: 'MARKETING',
        content: 'CPPF - Allocation de rentree scolaire {{1}} : deposez vos certificats de scolarite avant le {{2}}. Plus d\'infos sur e-CPPF.',
        variables: ['annee', 'date_limite'],
        language: 'fr',
        status: 'APPROVED',
        approvedAt: new Date()
      }
    }),
    prisma.template.upsert({
      where: { id: '00000000-0000-0000-0000-000000000006' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000006',
        name: 'cppf_mot_dg',
        displayName: 'Mot du Directeur General',
        category: 'MARKETING',
        content: 'Message du Directeur General de la CPPF : {{1}}',
        variables: ['message'],
        language: 'fr',
        headerType: 'VIDEO',
        status: 'APPROVED',
        approvedAt: new Date()
      }
    }),
    prisma.template.upsert({
      where: { id: '00000000-0000-0000-0000-000000000007' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000007',
        name: 'cppf_e_services',
        displayName: 'Promotion e-CPPF',
        category: 'MARKETING',
        content: 'Decouvrez e-CPPF : suivez vos dossiers en ligne 24h/24 ! Cotisations, prestations, carriere... tout est accessible. Connectez-vous : {{1}}',
        variables: ['lien'],
        language: 'fr',
        headerType: 'IMAGE',
        buttons: JSON.stringify([{ type: 'URL', text: 'Acceder a e-CPPF', url: 'https://cppf.ga' }]),
        status: 'APPROVED',
        approvedAt: new Date()
      }
    })
  ]);
  console.log(`${templates.length} templates crees`);

  // ============================================
  // 3. Assures de test (donnees CPPF)
  // ============================================
  const contacts = [
    { phone: '+24174000001', name: 'Jean-Pierre Nzeng', email: 'jp.nzeng@gouv.ga', category: 'ACTIF', tags: ['e-cppf'], optedIn: true, matricule: '102345A', administration: 'Min. Education Nationale', grade: 'Professeur certifie', regime: 'GENERAL', ville: 'Libreville', province: 'Estuaire', nombreEnfants: 3, engagementScore: 85 },
    { phone: '+24174000002', name: 'Marie-Claire Ndong', email: 'mc.ndong@gouv.ga', category: 'RETRAITE', tags: ['pension-generale'], optedIn: true, matricule: '078234B', administration: 'Min. Sante', grade: 'Infirmiere principale', regime: 'GENERAL', ville: 'Libreville', province: 'Estuaire', nombreEnfants: 4, numeroPension: 'PG-2024-0891', engagementScore: 72 },
    { phone: '+24174000003', name: 'Paul Mba Ondo', email: 'p.mbaondo@gouv.ga', category: 'ACTIF', tags: [], optedIn: true, matricule: '156789C', administration: 'Forces Armees', grade: 'Capitaine', regime: 'SPECIAL', ville: 'Port-Gentil', province: 'Ogooue-Maritime', nombreEnfants: 2, engagementScore: 45 },
    { phone: '+24174000004', name: 'Aline Obame Nguema', email: 'a.obame@gouv.ga', category: 'ACTIF', tags: ['e-cppf', 'preparation-retraite'], optedIn: true, matricule: '034567D', administration: 'Min. Finances', grade: 'Inspecteur du Tresor', regime: 'GENERAL', ville: 'Libreville', province: 'Estuaire', nombreEnfants: 5, engagementScore: 95 },
    { phone: '+24174000005', name: 'Marc Essono Ella', email: 'marc.essono@gouv.ga', category: 'ACTIF', tags: ['nouveau'], optedIn: true, matricule: '198765E', administration: 'Min. Justice', grade: 'Greffier', regime: 'GENERAL', ville: 'Franceville', province: 'Haut-Ogooue', nombreEnfants: 1, engagementScore: 40 },
    { phone: '+24174000006', name: 'Sophie Nguema Minko', email: 'sophie.nguema@gouv.ga', category: 'AYANT_DROIT', tags: ['reversion'], optedIn: true, matricule: null, administration: null, grade: null, regime: 'GENERAL', ville: 'Libreville', province: 'Estuaire', nombreEnfants: 3, numeroPension: 'PR-2025-0234', engagementScore: 60 },
    { phone: '+24174000007', name: 'David Ondo Obiang', email: 'david.ondo@gouv.ga', category: 'RETRAITE', tags: ['certificat-vie-expire'], optedIn: true, matricule: '045678F', administration: 'Min. Agriculture', grade: 'Ingenieur agronome', regime: 'GENERAL', ville: 'Oyem', province: 'Woleu-Ntem', nombreEnfants: 6, numeroPension: 'PG-2020-0456', engagementScore: 15 },
    { phone: '+24174000008', name: 'Claire Bongo Ondimba', email: 'claire.bongo@gouv.ga', category: 'RETRAITE', tags: ['pension-speciale'], optedIn: true, matricule: '023456G', administration: 'Magistrature', grade: 'Magistrat hors hierarchie', regime: 'SPECIAL', ville: 'Libreville', province: 'Estuaire', nombreEnfants: 2, numeroPension: 'PS-2023-0112', engagementScore: 88 },
    { phone: '+24174000009', name: 'Pierre Ella Mintsa', email: 'pierre.ella@gouv.ga', category: 'ACTIF', tags: ['e-cppf'], optedIn: true, matricule: '167890H', administration: 'Min. Travaux Publics', grade: 'Ingenieur TP', regime: 'GENERAL', ville: 'Lambarene', province: 'Moyen-Ogooue', nombreEnfants: 4, engagementScore: 55 },
    { phone: '+24174000010', name: 'Fatou Diallo Mbina', email: 'fatou.diallo@gouv.ga', category: 'INVALIDE', tags: ['rente-invalidite'], optedIn: true, matricule: '134567I', administration: 'Min. Transports', grade: 'Agent technique', regime: 'GENERAL', ville: 'Libreville', province: 'Estuaire', nombreEnfants: 2, engagementScore: 35 }
  ];

  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { phone: contact.phone },
      update: {
        category: contact.category,
        ville: contact.ville,
        province: contact.province,
        administration: contact.administration,
        grade: contact.grade,
        regime: contact.regime,
        nombreEnfants: contact.nombreEnfants,
        engagementScore: contact.engagementScore
      },
      create: {
        ...contact,
        language: 'fr',
        gender: ['M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F'][contacts.indexOf(contact)],
        datePriseService: new Date(Date.now() - (10 + Math.random() * 25) * 365 * 24 * 60 * 60 * 1000),
        dernierCertificatVie: contact.category === 'RETRAITE' ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) : null,
        optedInAt: contact.optedIn ? new Date() : null,
        lastActivity: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      }
    });
  }
  console.log(`${contacts.length} assures crees`);

  // ============================================
  // 4. Segments dynamiques CPPF
  // ============================================
  const segments = [
    {
      id: '00000000-0000-0000-0000-000000000020',
      name: 'actifs_libreville',
      description: 'Agents actifs bases a Libreville',
      type: 'DYNAMIC',
      criteria: {
        operator: 'AND',
        rules: [
          { field: 'ville', op: 'eq', value: 'Libreville' },
          { field: 'category', op: 'eq', value: 'ACTIF' }
        ]
      },
      contactCount: 0,
      createdBy: admin.id
    },
    {
      id: '00000000-0000-0000-0000-000000000021',
      name: 'retraites_certificat_expire',
      description: 'Retraites dont le certificat de vie est expire (plus de 12 mois)',
      type: 'CPPF_CRITERIA',
      criteria: {
        operator: 'AND',
        rules: [
          { field: 'category', op: 'eq', value: 'RETRAITE' },
          { field: 'tags', op: 'has', value: 'certificat-vie-expire' }
        ]
      },
      contactCount: 0,
      createdBy: admin.id
    },
    {
      id: '00000000-0000-0000-0000-000000000022',
      name: 'regime_special',
      description: 'Tous les assures du regime special (militaires, magistrats)',
      type: 'CPPF_CRITERIA',
      criteria: {
        operator: 'AND',
        rules: [
          { field: 'regime', op: 'eq', value: 'SPECIAL' }
        ]
      },
      contactCount: 0,
      createdBy: admin.id
    },
    {
      id: '00000000-0000-0000-0000-000000000023',
      name: 'ayants_droit',
      description: 'Conjoints survivants et ayants droit',
      type: 'DYNAMIC',
      criteria: {
        operator: 'AND',
        rules: [
          { field: 'category', op: 'eq', value: 'AYANT_DROIT' }
        ]
      },
      contactCount: 0,
      createdBy: admin.id
    },
    {
      id: '00000000-0000-0000-0000-000000000024',
      name: 'preparation_retraite',
      description: 'Agents actifs en preparation de depart a la retraite',
      type: 'DYNAMIC',
      criteria: {
        operator: 'AND',
        rules: [
          { field: 'category', op: 'eq', value: 'ACTIF' },
          { field: 'tags', op: 'has', value: 'preparation-retraite' }
        ]
      },
      contactCount: 0,
      createdBy: admin.id
    }
  ];

  for (const seg of segments) {
    await prisma.segment.upsert({
      where: { id: seg.id },
      update: { criteria: seg.criteria, description: seg.description },
      create: seg
    });
  }
  console.log(`${segments.length} segments crees`);

  // ============================================
  // 5. Campagne de test
  // ============================================
  const campaign = await prisma.campaign.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Campagne Test - Rappel certificat de vie',
      type: 'RAPPEL',
      status: 'DRAFT',
      templateId: '00000000-0000-0000-0000-000000000003',
      legacySegment: 'RETRAITE',
      variables: { var1: 'date_expiration' },
      createdBy: admin.id
    }
  });
  console.log(`Campagne creee: ${campaign.name}`);

  // ============================================
  // 6. API Key de test
  // ============================================
  const apiKey = await prisma.apiKey.upsert({
    where: { key: 'cppf-test-api-key-2026' },
    update: {},
    create: {
      name: 'Test API Key',
      key: 'cppf-test-api-key-2026',
      permissions: ['campaign:create', 'campaign:read', 'campaign:send', 'contact:create', 'contact:read', 'template:read'],
      isActive: true,
      createdBy: admin.id
    }
  });
  console.log(`API Key creee: ${apiKey.name}`);

  console.log('\nSeed termine !');
  console.log('=====================================');
  console.log('Comptes de test:');
  console.log('  Admin:    admin@cppf.ga / admin123');
  console.log('  Operator: operator@cppf.ga / operator123');
  console.log('=====================================');
}

main()
  .catch((e) => {
    console.error('Erreur seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
