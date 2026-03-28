/**
 * Script de création des templates WhatsApp CPPF avec images et boutons URL
 *
 * 1. Supprime les anciens templates (DB + Meta)
 * 2. Upload les images vers Supabase Storage
 * 3. Crée les nouveaux templates avec header IMAGE + boutons URL
 *
 * Usage:
 *   node backend/scripts/seed-templates.js
 *
 * Requires: DATABASE_URL, OPENAI_API_KEY, WHATSAPP_ACCESS_TOKEN,
 *           WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_APP_ID,
 *           SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const whatsappService = require('../src/services/whatsapp');

// Supabase client for Storage
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

// Tracking URL base
const TRACKING_BASE = process.env.TRACKING_BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/t/{{1}}`
  : 'https://cppf-whatsapp-production.up.railway.app/t/{{1}}');

// ============================================
// TEMPLATES DEFINITIONS
// ============================================
const TEMPLATES = [
  {
    name: 'cppf_bienvenue_actif',
    displayName: 'CPPF Bienvenue Actif',
    category: 'MARKETING',
    content: 'Bienvenue sur le service WhatsApp de la CPPF ! Suivez vos cotisations et préparez votre retraite.',
    language: 'fr',
    headerType: 'IMAGE',
    imageFile: 'cppf_bienvenue_actif.jpeg',
    footer: 'CPPF — Caisse des Pensions et des Prestations Familiales',
    buttons: [
      { type: 'URL', text: '📋 Ma carrière', url: 'https://cppf.ga/ma-carriere/' },
      { type: 'URL', text: '🏠 Accueil CPPF', url: 'https://cppf.ga/' }
    ]
  },
  {
    name: 'cppf_notification_paiement',
    displayName: 'CPPF Notification Paiement',
    category: 'UTILITY',
    content: 'Votre pension/allocation du mois de {{1}} a été virée le {{2}}.',
    language: 'fr',
    headerType: 'IMAGE',
    imageFile: 'cppf_notification_paiement.jpeg',
    footer: 'CPPF — Caisse des Pensions et des Prestations Familiales',
    buttons: [
      { type: 'URL', text: '📄 Mon espace retraité', url: 'https://cppf.ga/je-beneficie-de-ma-retraite/' },
      { type: 'URL', text: '💰 Mes Prestations', url: 'https://cppf.ga/nos-prestations/' }
    ]
  },
  {
    name: 'cppf_rappel_certificat_vie',
    displayName: 'CPPF Rappel Certificat de Vie',
    category: 'UTILITY',
    content: 'Rappel : Votre certificat de vie expire le {{1}}. Rendez-vous dans votre antenne CPPF.',
    language: 'fr',
    headerType: 'IMAGE',
    imageFile: 'cppf_rappel_certificat_vie.jpeg',
    footer: 'CPPF — Caisse des Pensions et des Prestations Familiales',
    buttons: [
      { type: 'URL', text: '📋 Mes obligations', url: 'https://cppf.ga/je-beneficie-de-ma-retraite/' }
    ]
  },
  {
    name: 'cppf_nouveau_retraite',
    displayName: 'CPPF Nouveau Retraité',
    category: 'MARKETING',
    content: 'Félicitations pour votre départ à la retraite ! La CPPF vous accompagne dans cette nouvelle étape. Découvrez vos droits et démarches.',
    language: 'fr',
    headerType: 'IMAGE',
    imageFile: 'cppf_nouveau_retraite.jpeg',
    footer: 'CPPF — Caisse des Pensions et des Prestations Familiales',
    buttons: [
      { type: 'URL', text: '🎉 Mon espace retraité', url: 'https://cppf.ga/je-beneficie-de-ma-retraite/' },
      { type: 'URL', text: '📂 Hub Retraités', url: 'https://cppf.ga/retraites/' }
    ]
  },
  {
    name: 'cppf_rentree_scolaire',
    displayName: 'CPPF Rentrée Scolaire',
    category: 'MARKETING',
    content: 'La rentrée approche ! L\'Allocation de Rentrée Scolaire (62 500 FCFA/enfant) est disponible. Préparez vos documents.',
    language: 'fr',
    headerType: 'IMAGE',
    imageFile: 'cppf_rentree_scolaire.jpeg',
    footer: 'CPPF — Caisse des Pensions et des Prestations Familiales',
    buttons: [
      { type: 'URL', text: '🎒 Allocation Rentrée', url: 'https://cppf.ga/allocation-rentre-scolaire/' },
      { type: 'URL', text: '📄 Formulaires', url: 'https://cppf.ga/formulaires-documentation/' }
    ]
  },
  {
    name: 'cppf_mot_dg',
    displayName: 'CPPF Mot du DG',
    category: 'MARKETING',
    content: 'Message du Directeur Général de la CPPF, M. Carl NGUEBA BOUTOUNDOU. Découvrez les orientations stratégiques et les avancées de la CPPF.',
    language: 'fr',
    headerType: 'TEXT',
    headerContent: '📢 Mot du Directeur Général',
    imageFile: null,
    footer: 'CPPF — Caisse des Pensions et des Prestations Familiales',
    buttons: [
      { type: 'URL', text: '🎤 Mot du DG', url: 'https://cppf.ga/mot-du-directeur/' },
      { type: 'URL', text: '📰 Nos Actualités', url: 'https://cppf.ga/nos-actualites/' }
    ]
  },
  {
    name: 'cppf_e_services',
    displayName: 'CPPF e-Services',
    category: 'MARKETING',
    content: 'Découvrez e-CPPF, votre espace numérique disponible 24h/24 et 7j/7. Suivez vos dossiers en temps réel, sans file d\'attente !',
    language: 'fr',
    headerType: 'IMAGE',
    imageFile: 'cppf_e_services.jpeg',
    footer: 'CPPF — Caisse des Pensions et des Prestations Familiales',
    buttons: [
      { type: 'URL', text: '💻 Accéder à e-CPPF', url: 'https://cppf.ga/e-cppf/' },
      { type: 'URL', text: '🏠 Accueil CPPF', url: 'https://cppf.ga/' }
    ]
  }
];

// ============================================
// Upload image to Supabase Storage
// ============================================
async function uploadImageToSupabase(filename) {
  if (!supabase) {
    console.log('    ⚠️  Supabase non configuré, skip upload Storage');
    return null;
  }

  const filePath = path.resolve(__dirname, '../../', filename);
  if (!fs.existsSync(filePath)) {
    console.log(`    ⚠️  Image non trouvée: ${filePath}`);
    return null;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const storagePath = `templates/${Date.now()}_${filename}`;

  const { data, error } = await supabase.storage
    .from('templates-media')
    .upload(storagePath, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: false
    });

  if (error) {
    console.log(`    ⚠️  Erreur upload Supabase: ${error.message}`);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('templates-media')
    .getPublicUrl(storagePath);

  console.log(`    ✅ Image uploadée: ${urlData.publicUrl.substring(0, 80)}...`);
  return urlData.publicUrl;
}

// ============================================
// Delete existing templates
// ============================================
async function deleteExistingTemplates() {
  console.log('\n🗑️  Suppression des anciens templates...');

  const templateNames = TEMPLATES.map(t => t.name);

  // Delete from Meta first
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (wabaId && accessToken) {
    const axios = require('axios');
    for (const name of templateNames) {
      try {
        await axios.delete(
          `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
          {
            params: { name },
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );
        console.log(`  🗑️  Meta: "${name}" supprimé`);
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        if (msg.includes('not found') || msg.includes('does not exist')) {
          console.log(`  ⏭️  Meta: "${name}" n'existe pas, ignoré`);
        } else {
          console.log(`  ⚠️  Meta: "${name}" — ${msg}`);
        }
      }
    }
  } else {
    console.log('  ⚠️  WHATSAPP_BUSINESS_ACCOUNT_ID manquant, skip suppression Meta');
  }

  // Delete from local DB
  for (const name of templateNames) {
    try {
      const existing = await prisma.template.findFirst({ where: { name } });
      if (existing) {
        // Check if used in campaigns
        const campaigns = await prisma.campaign.count({ where: { templateId: existing.id } });
        if (campaigns > 0) {
          // Unlink campaigns first
          await prisma.campaign.updateMany({
            where: { templateId: existing.id },
            data: { templateId: null }
          });
          console.log(`  🔗 DB: ${campaigns} campagnes déliées de "${name}"`);
        }
        await prisma.template.delete({ where: { id: existing.id } });
        console.log(`  🗑️  DB: "${name}" supprimé`);
      }
    } catch (err) {
      console.log(`  ⚠️  DB: "${name}" — ${err.message}`);
    }
  }
}

// ============================================
// Create a single template
// ============================================
async function createTemplate(tpl, imageUrl) {
  // Apply tracking to buttons
  const trackedButtons = tpl.buttons.map(btn => {
    if (btn.type === 'URL' && btn.url && !btn.url.includes('/t/{{1}}')) {
      return { ...btn, redirectUrl: btn.url, url: TRACKING_BASE };
    }
    return btn;
  });

  // Upload image to Meta for header_handle
  let headerHandle = null;
  if (tpl.headerType === 'IMAGE' && imageUrl) {
    const axios = require('axios');
    const os = require('os');

    // Download image to temp file
    const tempPath = path.join(os.tmpdir(), `cppf_tpl_${Date.now()}.jpg`);
    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
      fs.writeFileSync(tempPath, response.data);

      const uploadResult = await whatsappService.uploadMediaForTemplate(tempPath, 'image/jpeg');
      if (uploadResult.success) {
        headerHandle = uploadResult.headerHandle;
        console.log(`    ✅ Header handle Meta obtenu`);
      } else {
        console.log(`    ⚠️  Upload Meta échoué: ${uploadResult.error}`);
      }
    } catch (err) {
      console.log(`    ⚠️  Download image échoué: ${err.message}`);
    } finally {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }

  // Extract variables
  const variableMatches = tpl.content.match(/\{\{(\d+)\}\}/g) || [];
  const variables = variableMatches.map((_, index) => `var${index + 1}`);

  // Save to DB
  const template = await prisma.template.create({
    data: {
      name: tpl.name,
      displayName: tpl.displayName,
      category: tpl.category,
      content: tpl.content,
      variables,
      language: tpl.language,
      headerType: tpl.headerType,
      headerContent: tpl.headerType === 'TEXT' ? tpl.headerContent : (imageUrl || null),
      buttons: trackedButtons,
      footer: tpl.footer,
      status: 'PENDING'
    }
  });

  // Submit to Meta
  const metaResult = await whatsappService.createTemplate({
    name: tpl.name,
    category: tpl.category.toLowerCase(),
    content: tpl.content,
    language: tpl.language,
    headerType: tpl.headerType,
    headerContent: tpl.headerType === 'TEXT' ? tpl.headerContent : imageUrl,
    headerHandle,
    buttons: trackedButtons,
    footer: tpl.footer
  });

  if (metaResult.success) {
    await prisma.template.update({
      where: { id: template.id },
      data: { metaId: metaResult.templateId }
    });
    return { success: true, metaId: metaResult.templateId, dbId: template.id };
  } else {
    return { success: false, error: metaResult.error, dbId: template.id };
  }
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.log('='.repeat(60));
  console.log('  TEMPLATES WHATSAPP CPPF — Création avec images & boutons');
  console.log('='.repeat(60));

  // Check env vars
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.WHATSAPP_ACCESS_TOKEN) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) missing.push('WHATSAPP_BUSINESS_ACCOUNT_ID');
  if (!process.env.WHATSAPP_APP_ID) missing.push('WHATSAPP_APP_ID');

  if (missing.length > 0) {
    console.error(`\n❌ Variables manquantes: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Step 1: Delete existing templates
  await deleteExistingTemplates();

  // Step 2: Create new templates
  console.log('\n📦 Création des nouveaux templates...\n');

  let created = 0;
  let failed = 0;

  for (let i = 0; i < TEMPLATES.length; i++) {
    const tpl = TEMPLATES[i];
    const num = String(i + 1).padStart(1, '0');
    console.log(`  📄 [${num}/${TEMPLATES.length}] "${tpl.name}"`);

    // Upload image to Supabase if needed
    let imageUrl = null;
    if (tpl.imageFile) {
      console.log(`    🖼️  Upload image: ${tpl.imageFile}`);
      imageUrl = await uploadImageToSupabase(tpl.imageFile);
    }

    // Create template
    try {
      const result = await createTemplate(tpl, imageUrl);
      if (result.success) {
        console.log(`  ✅ "${tpl.name}" — soumis à Meta (ID: ${result.metaId})`);
        created++;
      } else {
        console.log(`  ⚠️  "${tpl.name}" — DB OK, Meta: ${result.error}`);
        created++; // Still created in DB
      }
    } catch (err) {
      console.log(`  ❌ "${tpl.name}" — ERREUR: ${err.message}`);
      failed++;
    }

    // Pause between API calls
    if (i < TEMPLATES.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  RÉSULTAT: ${created} créés | ${failed} erreurs`);
  console.log('  Les templates seront approuvés par Meta sous 24-48h.');
  console.log('='.repeat(60));

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n💥 Erreur fatale:', err.message);
  prisma.$disconnect();
  process.exit(1);
});
