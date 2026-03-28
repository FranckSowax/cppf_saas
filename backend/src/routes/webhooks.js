const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const whatsappService = require('../services/whatsapp');
const ragService = require('../services/rag');
const enrichmentService = require('../services/enrichment');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// ============================================
// GET /webhooks/whatsapp - Vérification webhook Meta
// Meta envoie un GET avec hub.mode, hub.verify_token, hub.challenge
// ============================================
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const result = whatsappService.verifyWebhook(mode, token, challenge);

  if (result.valid) {
    logger.info('Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('Webhook verification failed', { mode, token });
  return res.sendStatus(403);
});

// ============================================
// POST /webhooks/whatsapp - Messages entrants WhatsApp Cloud API
// Format Meta: { object, entry: [{ changes: [{ value: { messages, statuses, contacts } }] }] }
// ============================================
router.post('/whatsapp', async (req, res) => {
  try {
    // Toujours répondre 200 immédiatement pour éviter les retries Meta
    res.status(200).json({ received: true });

    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // Traiter les messages entrants
        if (value.messages) {
          for (const message of value.messages) {
            await handleIncomingMessage(message, value.contacts);
          }
        }

        // Traiter les mises à jour de statut
        if (value.statuses) {
          for (const status of value.statuses) {
            await handleStatusUpdate(status);
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error processing WhatsApp webhook', { error: error.message });
  }
});

// ============================================
// Gestionnaire: Message entrant
// ============================================
async function handleIncomingMessage(message, contacts) {
  try {
    const from = message.from; // numéro sans +
    const phone = '+' + from;
    const contactInfo = contacts?.find(c => c.wa_id === from);
    const contactName = contactInfo?.profile?.name;

    logger.info('Incoming WhatsApp message', {
      from: phone.replace(/\d(?=\d{4})/g, '*'),
      type: message.type
    });

    // Rechercher ou créer le contact
    let dbContact = await prisma.contact.findUnique({
      where: { phone }
    });

    if (!dbContact) {
      dbContact = await prisma.contact.create({
        data: {
          phone,
          name: contactName,
          whatsappId: from,
          optedIn: true,
          optedInAt: new Date()
        }
      });
      logger.info('New contact created from webhook', { contactId: dbContact.id });
    } else {
      await prisma.contact.update({
        where: { id: dbContact.id },
        data: { lastActivity: new Date() }
      });
    }

    // Gestion opt-out : STOP / ARRET / DESINSCRIRE
    if (message.type === 'text' && message.text?.body) {
      const textLower = message.text.body.trim().toLowerCase();
      if (['stop', 'arret', 'arreter', 'desinscrire', 'unsubscribe'].includes(textLower)) {
        await prisma.contact.update({
          where: { id: dbContact.id },
          data: { status: 'UNSUBSCRIBED', optedIn: false }
        });
        await whatsappService.sendMessage(phone, 'Vous avez ete desinscrit de nos communications. Pour vous reinscrire, envoyez START.').catch(() => {});
        logger.info('Contact opted out', { contactId: dbContact.id, phone: phone.replace(/\d(?=\d{4})/g, '*') });
        return;
      }
      // Gestion opt-in : START
      if (['start', 'ok', 'inscrire'].includes(textLower) && dbContact.status === 'UNSUBSCRIBED') {
        await prisma.contact.update({
          where: { id: dbContact.id },
          data: { status: 'ACTIVE', optedIn: true, optedInAt: new Date() }
        });
        await whatsappService.sendMessage(phone, 'Vous etes de nouveau inscrit aux communications de la CPPF. Bienvenue !').catch(() => {});
        logger.info('Contact opted back in', { contactId: dbContact.id });
        return;
      }
    }

    // Note: Le tracking des clics est géré par le redirect /t/:trackingId (server.js)
    // Les clics sur les boutons URL des templates passent par notre serveur de redirection

    // Chatbot automatique : repond a tous les messages texte entrants via RAG
    if (message.type === 'text' && message.text?.body) {
      const text = message.text.body;
      const autoReply = process.env.CHATBOT_AUTO_REPLY !== 'false'; // ON par defaut

      if (autoReply) {
        try {
          // Utiliser le service RAG interne (pgvector + OpenAI)
          const result = await ragService.chat(text, dbContact.id);
          const botReply = result.response;

          if (botReply) {
            await whatsappService.sendMessage(phone, botReply);
            logger.info('Auto-reply sent via RAG', {
              contactId: dbContact.id,
              chunks_used: result.chunks_used,
              sources: result.sources
            });

            // Sauvegarder la session de chat + enrichissement async
            try {
              const session = await prisma.chatSession.create({
                data: {
                  contactId: dbContact.id,
                  source: 'whatsapp',
                  messages: [
                    { role: 'user', content: text, timestamp: new Date() },
                    { role: 'bot', content: botReply, timestamp: new Date() }
                  ]
                }
              });

              // Enrichissement IA async (fire-and-forget)
              enrichmentService.enrichConversation(session.id).catch(err => {
                logger.warn('Enrichment failed for session', { sessionId: session.id, error: err.message });
              });
            } catch (saveErr) {
              logger.warn('Failed to save chat session', { error: saveErr.message });
            }
          } else {
            logger.warn('No AI response available (check OPENAI_API_KEY)');
          }
        } catch (chatErr) {
          logger.error('Error in auto-reply', { error: chatErr.message });
          // Message de fallback en cas d'erreur
          const fallbackMsg = process.env.CHATBOT_FALLBACK_MESSAGE ||
            'Merci pour votre message. Un conseiller CPPF vous repondra dans les plus brefs delais. Service : (+241) 011-73-02-26';
          await whatsappService.sendMessage(phone, fallbackMsg).catch(() => {});
        }
      }
    }
  } catch (error) {
    logger.error('Error handling incoming message', { error: error.message });
  }
}

// ============================================
// Gestionnaire: Mise à jour de statut WhatsApp
// statuses: sent, delivered, read, failed
// ============================================
async function handleStatusUpdate(status) {
  try {
    const externalId = status.id;
    const waStatus = status.status;

    // Log complet du statut recu de Meta (essentiel pour debug)
    logger.info('WhatsApp status webhook received', {
      externalId,
      status: waStatus,
      recipientId: status.recipient_id,
      timestamp: status.timestamp,
      errors: status.errors || null
    });

    const statusMap = {
      'sent': 'SENT',
      'delivered': 'DELIVERED',
      'read': 'READ',
      'failed': 'FAILED'
    };

    const dbStatus = statusMap[waStatus];
    if (!dbStatus) return;

    const dbMessage = await prisma.message.findFirst({
      where: { externalId }
    });

    if (!dbMessage) {
      logger.warn('Message not found for status update', { externalId, status: waStatus });
      return;
    }

    // Protection progression de statut : ne pas regresser (ex: DELIVERED → SENT)
    const statusOrder = { PENDING: 0, QUEUED: 1, SENT: 2, DELIVERED: 3, READ: 4, FAILED: 5 };
    if (statusOrder[dbStatus] <= statusOrder[dbMessage.status] && dbStatus !== 'FAILED') {
      logger.info('Status update skipped (not a progression)', { externalId, current: dbMessage.status, received: dbStatus });
      return;
    }

    const updateData = { status: dbStatus };
    if (dbStatus === 'DELIVERED') updateData.deliveredAt = new Date();
    if (dbStatus === 'READ') updateData.readAt = new Date();
    if (dbStatus === 'FAILED') {
      updateData.failedAt = new Date();
      // Capture complete des erreurs Meta (message, title, error_data.details)
      const errorInfo = status.errors?.[0];
      const errorMsg = errorInfo?.message || errorInfo?.title || 'Unknown error';
      const errorDetails = errorInfo?.error_data?.details;
      const errorCode = errorInfo?.code;
      updateData.error = errorDetails ? `[${errorCode}] ${errorMsg}: ${errorDetails}` : errorCode ? `[${errorCode}] ${errorMsg}` : errorMsg;
      logger.warn('Message delivery FAILED', { externalId, error: updateData.error, errorFull: errorInfo });
    }

    await prisma.message.update({
      where: { id: dbMessage.id },
      data: updateData
    });

    // Mettre a jour les statistiques de la campagne (increments uniquement)
    if (dbMessage.campaignId) {
      const campaignUpdate = {};
      if (dbStatus === 'DELIVERED') campaignUpdate.delivered = { increment: 1 };
      if (dbStatus === 'READ') campaignUpdate.read = { increment: 1 };
      if (dbStatus === 'FAILED') campaignUpdate.failed = { increment: 1 };

      if (Object.keys(campaignUpdate).length > 0) {
        await prisma.campaign.update({
          where: { id: dbMessage.campaignId },
          data: campaignUpdate
        });
      }
    }

    logger.info('Message status updated', { externalId, status: dbStatus, messageId: dbMessage.id });
  } catch (error) {
    logger.error('Error updating message status', { error: error.message, stack: error.stack });
  }
}

// ============================================
// GET /webhooks/health - Health check
// ============================================
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'webhooks',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// POST /webhooks/whatsapp/test-send - Envoyer un message test
// ============================================
router.post('/whatsapp/test-send', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token requis' });

    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone et message requis' });

    const result = await whatsappService.sendMessage(phone, message);
    res.json(result);
  } catch (error) {
    logger.error('Test send error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST /webhooks/whatsapp/test-template - Envoyer un template test
// ============================================
router.post('/whatsapp/test-template', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token requis' });

    const { phone, templateName, language = 'fr', components = [] } = req.body;
    if (!phone || !templateName) return res.status(400).json({ error: 'phone et templateName requis' });

    const result = await whatsappService.sendTemplate(phone, templateName, language, components);
    res.json(result);
  } catch (error) {
    logger.error('Test template send error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST /webhooks/whatsapp/change-category - Change templates from MARKETING to UTILITY
// Deletes from Meta, recreates with new category, updates DB
// ============================================
router.post('/whatsapp/change-category', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token requis' });

    const axios = require('axios');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    const { templateNames, newCategory = 'UTILITY' } = req.body;
    if (!templateNames || !Array.isArray(templateNames)) {
      return res.status(400).json({ error: 'templateNames (array) requis' });
    }

    const results = [];

    for (const name of templateNames) {
      const tpl = await prisma.template.findFirst({ where: { name } });
      if (!tpl) {
        results.push({ name, status: 'error', error: 'Template non trouve en DB' });
        continue;
      }

      // Step 1: Delete from Meta
      try {
        await axios.delete(
          `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
          { params: { name }, headers: { 'Authorization': `Bearer ${token}` } }
        );
        logger.info(`Deleted template "${name}" from Meta for category change`);
      } catch (delErr) {
        const msg = delErr.response?.data?.error?.message || delErr.message;
        logger.info(`Delete "${name}" from Meta: ${msg}`);
      }

      // Wait for Meta to process
      await new Promise(r => setTimeout(r, 3000));

      // Step 2: Upload image header if needed
      let headerHandle = null;
      if (tpl.headerType === 'IMAGE' && tpl.headerContent && tpl.headerContent.startsWith('http')) {
        const tempPath = path.join(os.tmpdir(), `cppf_cat_${Date.now()}.jpg`);
        try {
          const imgResp = await axios.get(tpl.headerContent, { responseType: 'arraybuffer', timeout: 60000 });
          fs.writeFileSync(tempPath, imgResp.data);
          const uploadResult = await whatsappService.uploadMediaForTemplate(tempPath, 'image/jpeg');
          if (uploadResult.success) {
            headerHandle = uploadResult.headerHandle;
          } else {
            logger.warn(`Header upload failed for "${name}": ${uploadResult.error}`);
          }
        } catch (dlErr) {
          logger.warn(`Image download failed for "${name}": ${dlErr.message}`);
        } finally {
          try { fs.unlinkSync(tempPath); } catch {}
        }
      }

      // Step 3: Restore original URLs for buttons
      let metaButtons = null;
      if (Array.isArray(tpl.buttons)) {
        metaButtons = tpl.buttons.map(btn => {
          if (btn.type === 'URL' && btn.redirectUrl) {
            return { type: btn.type, text: btn.text, url: btn.redirectUrl };
          }
          return { type: btn.type, text: btn.text, url: btn.url || null, phone: btn.phone || null };
        });
      }

      // Step 4: Recreate on Meta with new category
      const metaResult = await whatsappService.createTemplate({
        name: tpl.name,
        category: newCategory.toLowerCase(),
        content: tpl.content,
        language: tpl.language || 'fr',
        headerType: tpl.headerType || 'NONE',
        headerContent: tpl.headerType === 'TEXT' ? tpl.headerContent : null,
        headerHandle,
        buttons: metaButtons,
        footer: tpl.footer || null
      });

      if (metaResult.success) {
        await prisma.template.update({
          where: { id: tpl.id },
          data: { category: newCategory, metaId: metaResult.templateId, status: 'PENDING' }
        });
        results.push({ name, status: 'submitted', metaId: metaResult.templateId, category: newCategory });
      } else {
        results.push({ name, status: 'error', error: metaResult.error, details: metaResult.details });
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 2000));
    }

    const submitted = results.filter(r => r.status === 'submitted').length;
    res.json({ success: true, submitted, total: templateNames.length, results });
  } catch (error) {
    logger.error('Error changing template category', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST /webhooks/whatsapp/recreate-as-utility - Recreate MARKETING templates as UTILITY with new names
// ============================================
router.post('/whatsapp/recreate-as-utility', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token requis' });

    const axios = require('axios');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    // Find all MARKETING templates in DB
    const marketingTemplates = await prisma.template.findMany({
      where: { category: 'MARKETING' }
    });

    if (marketingTemplates.length === 0) {
      return res.json({ success: true, message: 'Aucun template MARKETING', created: 0 });
    }

    const results = [];

    for (const tpl of marketingTemplates) {
      const newName = tpl.name + '_v2';

      // Check if v2 already exists
      const existing = await prisma.template.findFirst({ where: { name: newName } });
      if (existing) {
        results.push({ name: newName, status: 'skipped', reason: 'Already exists' });
        continue;
      }

      // Upload image header if needed
      let headerHandle = null;
      if (tpl.headerType === 'IMAGE' && tpl.headerContent && tpl.headerContent.startsWith('http')) {
        const tempPath = path.join(os.tmpdir(), `cppf_v2_${Date.now()}.jpg`);
        try {
          const imgResp = await axios.get(tpl.headerContent, { responseType: 'arraybuffer', timeout: 60000 });
          fs.writeFileSync(tempPath, imgResp.data);
          const uploadResult = await whatsappService.uploadMediaForTemplate(tempPath, 'image/jpeg');
          if (uploadResult.success) headerHandle = uploadResult.headerHandle;
          else logger.warn(`Header upload failed for "${newName}": ${uploadResult.error}`);
        } catch (dlErr) {
          logger.warn(`Image download failed for "${newName}": ${dlErr.message}`);
        } finally {
          try { fs.unlinkSync(tempPath); } catch {}
        }
      }

      // Restore original URLs for Meta
      let metaButtons = null;
      if (Array.isArray(tpl.buttons)) {
        metaButtons = tpl.buttons.map(btn => {
          if (btn.type === 'URL' && btn.redirectUrl) {
            return { type: btn.type, text: btn.text, url: btn.redirectUrl };
          }
          return { type: btn.type, text: btn.text, url: btn.url || null, phone: btn.phone || null };
        });
      }

      // Create on Meta as UTILITY
      const metaResult = await whatsappService.createTemplate({
        name: newName,
        category: 'utility',
        content: tpl.content,
        language: tpl.language || 'fr',
        headerType: tpl.headerType || 'NONE',
        headerContent: tpl.headerType === 'TEXT' ? tpl.headerContent : null,
        headerHandle,
        buttons: metaButtons,
        footer: tpl.footer || null
      });

      if (metaResult.success) {
        // Create new template in DB
        await prisma.template.create({
          data: {
            name: newName,
            displayName: tpl.displayName + ' (Utility)',
            category: 'UTILITY',
            content: tpl.content,
            variables: tpl.variables || [],
            language: tpl.language,
            headerType: tpl.headerType,
            headerContent: tpl.headerContent,
            buttons: tpl.buttons,
            footer: tpl.footer,
            status: 'PENDING',
            metaId: metaResult.templateId
          }
        });
        results.push({ name: newName, status: 'submitted', metaId: metaResult.templateId });
      } else {
        results.push({ name: newName, status: 'error', error: metaResult.error, details: metaResult.details });
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 3000));
    }

    const submitted = results.filter(r => r.status === 'submitted').length;
    res.json({ success: true, submitted, total: marketingTemplates.length, results });
  } catch (error) {
    logger.error('Error recreating templates as utility', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /webhooks/whatsapp/debug-meta - Debug Meta API: templates, phone, account
// ============================================
router.get('/whatsapp/debug-meta', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token requis' });

    const axios = require('axios');
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const debug = {};

    // 1. Phone number info (quality, status, verified_name)
    try {
      const phoneRes = await axios.get(`https://graph.facebook.com/v21.0/${phoneId}`, {
        params: { fields: 'verified_name,quality_rating,display_phone_number,status,name_status,messaging_limit_tier,throughput,is_official_business_account' },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      debug.phoneNumber = phoneRes.data;
    } catch (e) {
      debug.phoneNumber = { error: e.response?.data?.error?.message || e.message };
    }

    // 2. WABA info
    try {
      const wabaRes = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}`, {
        params: { fields: 'name,account_review_status,message_template_namespace,on_behalf_of_business_info' },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      debug.waba = wabaRes.data;
    } catch (e) {
      debug.waba = { error: e.response?.data?.error?.message || e.message };
    }

    // 3. Templates with full details
    try {
      const tplRes = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`, {
        params: { limit: 20, fields: 'name,status,quality_score,category,language,components,rejected_reason' },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      debug.templates = tplRes.data.data.map(t => ({
        name: t.name,
        status: t.status,
        quality_score: t.quality_score,
        category: t.category,
        language: t.language,
        rejected_reason: t.rejected_reason,
        components: t.components
      }));
    } catch (e) {
      debug.templates = { error: e.response?.data?.error?.message || e.message };
    }

    res.json(debug);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
