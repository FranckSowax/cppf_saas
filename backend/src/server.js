const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimit');
const { errorHandler } = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const contactRoutes = require('./routes/contacts');
const templateRoutes = require('./routes/templates');
const segmentRoutes = require('./routes/segments');
const billingRoutes = require('./routes/billing');
const chatbotRoutes = require('./routes/chatbot');
const analyticsRoutes = require('./routes/analytics');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (required behind Railway/load balancers for express-rate-limit)
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Rate limiting
app.use('/api/', apiLimiter);

// Fichiers statiques (frontend SPA)
const rootDir = path.join(__dirname, '../../');
app.use(express.static(rootDir, {
  index: 'index.html',
  extensions: ['html']
}));

// Health check (lightweight - no DB connection to avoid Railway SIGTERM)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: 'railway',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    services: {
      whatsapp: !!process.env.WHATSAPP_ACCESS_TOKEN,
      openai: !!process.env.OPENAI_API_KEY,
      supabase: !!process.env.SUPABASE_URL,
      chatbot: process.env.CHATBOT_AUTO_REPLY !== 'false' && !!process.env.OPENAI_API_KEY
    }
  });
});

// Deep health check (with DB - for manual diagnostics only)
app.get('/api/health/deep', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
    await prisma.$disconnect();
  } catch (e) {
    dbStatus = 'error: ' + e.message;
  }
  res.json({ status: 'ok', database: dbStatus, timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/segments', segmentRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhookRoutes);

// ============================================
// Preuve de vie: servir la page et recevoir les resultats
// ============================================
app.get('/preuve-de-vie', (req, res) => {
  // Si query params present (lien WhatsApp), servir la page de verification
  // Sinon (rafraichissement SPA), servir l'app principale
  if (req.query.data || req.query.nom || req.query.token) {
    return res.sendFile(path.join(rootDir, 'public', 'preuve-de-vie.html'));
  }
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.post('/api/preuve-de-vie/result', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const { matricule, nom, status, timestamp, token, similarity, device_info } = req.body;

    logger.info('Preuve de vie result received', { matricule, nom, status, similarity, token });

    // Trouver le contact par token (contactId), matricule, ou nom
    const findWhere = [];
    if (token) findWhere.push({ id: token });
    if (matricule) findWhere.push({ matricule });
    if (nom && nom.split(' ')[0]) findWhere.push({ name: { contains: nom.split(' ')[0], mode: 'insensitive' } });

    let contact = null;
    if (findWhere.length > 0) {
      contact = await prisma.contact.findFirst({ where: { OR: findWhere } });
    }

    if (contact) {
      const attrs = contact.customAttributes || {};
      // MERGER avec les donnees existantes (photoRef, photoSelfie) au lieu d'ecraser
      const existing = attrs.preuveDeVie || {};
      attrs.preuveDeVie = {
        ...existing,
        status,
        date: timestamp || new Date().toISOString(),
        similarity,
        device: device_info?.platform || existing.device || 'unknown',
        mode: existing.mode || 'api'
      };

      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          customAttributes: attrs,
          dernierCertificatVie: status === 'VALIDATED' ? new Date() : contact.dernierCertificatVie
        }
      });

      logger.info('Preuve de vie saved for contact', { contactId: contact.id, status });
    } else {
      logger.warn('Preuve de vie: contact not found', { token, matricule, nom });
    }

    // Envoyer une confirmation WhatsApp au retraite
    if (status === 'VALIDATED' && contact?.phone) {
      const whatsappService = require('./services/whatsapp');
      await whatsappService.sendMessage(contact.phone,
        `Votre preuve de vie a ete validee avec succes le ${new Date().toLocaleDateString('fr-FR')}. Aucune action supplementaire n'est requise. — CPPF`
      );
    }

    await prisma.$disconnect();
    res.json({ success: true, status, matricule });
  } catch (err) {
    logger.error('Preuve de vie result error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/preuve-de-vie/list - Liste des preuves de vie recues
app.get('/api/preuve-de-vie/list', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // Trouver tous les contacts qui ont une preuveDeVie dans customAttributes
    const contacts = await prisma.contact.findMany({
      where: { NOT: { customAttributes: { equals: {} } } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, name: true, phone: true, matricule: true, category: true,
        dernierCertificatVie: true, customAttributes: true, updatedAt: true
      }
    });

    // Filtrer ceux qui ont effectivement une preuveDeVie
    const results = contacts
      .filter(c => c.customAttributes?.preuveDeVie)
      .map(c => {
        const pdv = c.customAttributes.preuveDeVie;
        const history = Array.isArray(pdv.history) ? pdv.history : [];
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          matricule: c.matricule,
          category: c.category,
          status: pdv.status,
          mode: pdv.mode || 'api',
          date: pdv.date,
          similarity: pdv.similarity,
          device: pdv.device,
          photoRef: pdv.photoRef || null,
          photoSelfie: pdv.photoSelfie || null,
          validatedBy: pdv.validatedBy || null,
          dernierCertificatVie: c.dernierCertificatVie,
          historyCount: history.length,
          history: history.sort((a, b) => new Date(b.date) - new Date(a.date))
        };
      });

    await prisma.$disconnect();
    res.json({ data: results, total: results.length });
  } catch (err) {
    logger.error('Error listing preuve de vie', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/preuve-de-vie/find-contact - Trouver un contact par matricule
app.get('/api/preuve-de-vie/find-contact', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const { matricule } = req.query;
    if (!matricule) return res.json({ contactId: null });

    const contact = await prisma.contact.findFirst({ where: { matricule } });
    await prisma.$disconnect();
    res.json({ contactId: contact?.id || null, name: contact?.name || null });
  } catch (err) {
    res.json({ contactId: null });
  }
});

// POST /api/preuve-de-vie/send-link - Envoyer le lien de verification WhatsApp a un contact
app.post('/api/preuve-de-vie/send-link', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const whatsappService = require('./services/whatsapp');
    const { contactId } = req.body;

    if (!contactId) return res.status(400).json({ error: 'contactId requis' });

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) {
      await prisma.$disconnect();
      return res.status(404).json({ error: 'Contact non trouve' });
    }

    const domain = process.env.RAILWAY_PUBLIC_DOMAIN || 'cppfsaas-production.up.railway.app';
    const attrs = contact.customAttributes || {};
    const photoRef = attrs.preuveDeVie?.photoRef || '';

    // Construire les parametres URL pour le bouton dynamique
    // encodeURIComponent pour que les & restent dans la valeur de data= et ne soient pas des separateurs
    const urlParams = encodeURIComponent(new URLSearchParams({
      nom: contact.name || '',
      matricule: contact.matricule || '',
      photo_ref: photoRef,
      token: contact.id
    }).toString());

    // Envoyer via le template APPROVED cppf_preuve_de_vie (UTILITY)
    // Le template a: HEADER TEXT, BODY avec {{1}}=nom, BUTTON URL avec {{1}}=data params
    const components = [
      { type: 'body', parameters: [{ type: 'text', text: contact.name || 'cher assure' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: urlParams }] }
    ];

    const result = await whatsappService.sendTemplate(
      contact.phone, 'cppf_preuve_de_vie', 'fr', components
    );

    logger.info('Preuve de vie template sent', { contactId, phone: contact.phone, success: result.success, error: result.error });

    // Marquer comme en attente
    if (!attrs.preuveDeVie) attrs.preuveDeVie = {};
    attrs.preuveDeVie.status = attrs.preuveDeVie.status || 'PENDING_REVIEW';
    attrs.preuveDeVie.mode = 'api';
    attrs.preuveDeVie.linkSentAt = new Date().toISOString();
    await prisma.contact.update({ where: { id: contactId }, data: { customAttributes: attrs } });

    await prisma.$disconnect();
    logger.info('Preuve de vie link sent', { contactId, phone: contact.phone });
    res.json({ success: result.success, messageId: result.messageId, error: result.error });
  } catch (err) {
    logger.error('Send preuve de vie link error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/preuve-de-vie/upload-photo - Upload photo de reference ou selfie vers Supabase
app.post('/api/preuve-de-vie/upload-photo', async (req, res) => {
  try {
    const multer = require('multer');
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('file');

    upload(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

      const supabase = require('./lib/supabase');
      if (!supabase) return res.status(500).json({ error: 'Supabase non configure' });

      const { contactId, type } = req.body; // type: 'reference' ou 'selfie'
      const timestamp = Date.now();
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `preuve-de-vie/${type || 'photo'}/${timestamp}_${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from('templates-media')
        .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

      if (uploadErr) return res.status(500).json({ error: uploadErr.message });

      const { data: urlData } = supabase.storage.from('templates-media').getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      // Si contactId fourni, sauvegarder dans customAttributes
      if (contactId) {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const contact = await prisma.contact.findUnique({ where: { id: contactId } });
        if (contact) {
          const attrs = contact.customAttributes || {};
          if (!attrs.preuveDeVie) attrs.preuveDeVie = {};
          if (!Array.isArray(attrs.preuveDeVie.history)) attrs.preuveDeVie.history = [];

          if (type === 'reference') {
            attrs.preuveDeVie.photoRef = publicUrl;
          } else {
            // Archiver la verification precedente dans l'historique (si elle existe et a un selfie)
            if (attrs.preuveDeVie.photoSelfie && attrs.preuveDeVie.date) {
              const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
              const lastMonth = attrs.preuveDeVie.date.slice(0, 7);
              // Ajouter a l'historique si pas deja le meme mois
              const alreadyInHistory = attrs.preuveDeVie.history.some(h => h.date?.slice(0, 7) === lastMonth && h.photoSelfie === attrs.preuveDeVie.photoSelfie);
              if (!alreadyInHistory) {
                attrs.preuveDeVie.history.push({
                  date: attrs.preuveDeVie.date,
                  photoSelfie: attrs.preuveDeVie.photoSelfie,
                  status: attrs.preuveDeVie.status,
                  similarity: attrs.preuveDeVie.similarity,
                  mode: attrs.preuveDeVie.mode,
                  validatedBy: attrs.preuveDeVie.validatedBy || null,
                  device: attrs.preuveDeVie.device || null
                });
              }
            }
            // Mettre a jour la verification courante
            attrs.preuveDeVie.photoSelfie = publicUrl;
            attrs.preuveDeVie.date = new Date().toISOString();
            attrs.preuveDeVie.status = 'PENDING_REVIEW';
            attrs.preuveDeVie.similarity = null;
            attrs.preuveDeVie.validatedBy = null;
            attrs.preuveDeVie.mode = req.body.compare === 'true' ? 'api' : 'manual';
          }
          await prisma.contact.update({ where: { id: contactId }, data: { customAttributes: attrs } });
        }
        await prisma.$disconnect();
      }

      logger.info('Preuve de vie photo uploaded', { type, contactId, path: storagePath });

      // Si compare=true et photo_ref fourni, faire la comparaison FaceAnalyzer cote serveur
      let comparison = null;
      if (req.body.compare === 'true' && req.body.photo_ref && type === 'selfie') {
        try {
          const axios = require('axios');
          const FormData = require('form-data');
          const formData = new FormData();
          formData.append('source_image_url', req.body.photo_ref);
          formData.append('target_image', req.file.buffer, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

          const apiResp = await axios.post('https://faceanalyzer-ai.p.rapidapi.com/compare-faces', formData, {
            headers: {
              ...formData.getHeaders(),
              'x-rapidapi-key': '71062435d0mshd94e40817d37670p12b543jsn532d6e690964',
              'x-rapidapi-host': 'faceanalyzer-ai.p.rapidapi.com',
            },
            timeout: 30000,
          });

          comparison = apiResp.data;
          logger.info('FaceAnalyzer comparison done', { statusCode: comparison.statusCode, matched: comparison.body?.matchedFaces?.length || 0 });

          // Mettre a jour le statut du contact selon le resultat
          if (contactId && comparison.statusCode === 200) {
            const { PrismaClient } = require('@prisma/client');
            const prisma2 = new PrismaClient();
            const contact2 = await prisma2.contact.findUnique({ where: { id: contactId } });
            if (contact2) {
              const attrs2 = contact2.customAttributes || {};
              const hasMatch = comparison.body?.matchedFaces?.length > 0;
              const hasUnmatch = comparison.body?.unmatchedFaces?.length > 0;
              const similarity = hasMatch ? comparison.body.matchedFaces[0]?.similarity : (hasUnmatch ? comparison.body.unmatchedFaces[0]?.similarity : null);

              attrs2.preuveDeVie = {
                ...attrs2.preuveDeVie,
                status: hasMatch ? 'VALIDATED' : hasUnmatch ? 'REJECTED' : 'PENDING_REVIEW',
                similarity,
                mode: 'api',
              };

              const updateData = { customAttributes: attrs2 };
              if (hasMatch) updateData.dernierCertificatVie = new Date();

              await prisma2.contact.update({ where: { id: contactId }, data: updateData });

              // Envoyer confirmation WhatsApp si valide
              if (hasMatch && contact2.phone) {
                const whatsappService = require('./services/whatsapp');
                await whatsappService.sendMessage(contact2.phone,
                  `Votre preuve de vie a ete validee avec succes le ${new Date().toLocaleDateString('fr-FR')}. Aucune action supplementaire n'est requise. — CPPF`
                );
              }
            }
            await prisma2.$disconnect();
          }
        } catch (apiErr) {
          logger.warn('FaceAnalyzer API error (non-blocking)', { error: apiErr.message });
        }
      }

      res.json({ success: true, url: publicUrl, path: storagePath, comparison: comparison || null });
    });
  } catch (err) {
    logger.error('Photo upload error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/preuve-de-vie/validate - Validation manuelle par un agent CPPF
app.post('/api/preuve-de-vie/validate', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const { contactId, status, agentName } = req.body; // status: VALIDATED ou REJECTED

    if (!contactId || !status) return res.status(400).json({ error: 'contactId et status requis' });

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) {
      await prisma.$disconnect();
      return res.status(404).json({ error: 'Contact non trouve' });
    }

    const attrs = contact.customAttributes || {};
    if (!attrs.preuveDeVie) attrs.preuveDeVie = {};
    attrs.preuveDeVie.status = status;
    attrs.preuveDeVie.validatedBy = agentName || 'Agent CPPF';
    attrs.preuveDeVie.validatedAt = new Date().toISOString();
    attrs.preuveDeVie.mode = attrs.preuveDeVie.mode || 'manual';

    const updateData = { customAttributes: attrs };
    if (status === 'VALIDATED') updateData.dernierCertificatVie = new Date();

    await prisma.contact.update({ where: { id: contactId }, data: updateData });

    // Envoyer confirmation WhatsApp
    if (status === 'VALIDATED' && contact.phone) {
      const whatsappService = require('./services/whatsapp');
      await whatsappService.sendMessage(contact.phone,
        `Votre preuve de vie a ete validee par un agent CPPF le ${new Date().toLocaleDateString('fr-FR')}. Aucune action supplementaire n'est requise. — CPPF`
      );
    }

    logger.info('Preuve de vie manually validated', { contactId, status, agentName });
    await prisma.$disconnect();
    res.json({ success: true, contactId, status });
  } catch (err) {
    logger.error('Manual validation error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/preuve-de-vie/seed-demo - Injecter des donnees de demo
app.post('/api/preuve-de-vie/seed-demo', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const demoData = [
      { name: 'Marie-Claire Ndong', status: 'VALIDATED', similarity: 92.5, mode: 'api', device: 'Android', daysAgo: 2 },
      { name: 'Jean-Pierre Nzeng', status: 'PENDING_REVIEW', similarity: null, mode: 'manual', device: null, daysAgo: 1 },
      { name: 'David Ondo Obiang', status: 'REJECTED', similarity: 34.2, mode: 'api', device: 'iPhone', daysAgo: 3 },
      { name: 'Paul Mba Ondo', status: 'VALIDATED', similarity: 88.7, mode: 'api', device: 'Android', daysAgo: 5 },
      { name: 'Aline Obame Nguema', status: 'PENDING_REVIEW', similarity: null, mode: 'manual', device: null, daysAgo: 0 },
    ];

    let seeded = 0;
    for (const demo of demoData) {
      const contact = await prisma.contact.findFirst({
        where: { name: { contains: demo.name.split(' ')[0], mode: 'insensitive' } }
      });
      if (contact) {
        const attrs = contact.customAttributes || {};
        const date = new Date();
        date.setDate(date.getDate() - demo.daysAgo);
        // Generer un historique de 3 mois precedents pour les contacts valides
        const history = [];
        if (demo.status === 'VALIDATED') {
          for (let m = 1; m <= 3; m++) {
            const hDate = new Date();
            hDate.setMonth(hDate.getMonth() - m);
            history.push({
              date: hDate.toISOString(),
              photoSelfie: 'https://openmediadata.s3.eu-west-3.amazonaws.com/face.jpg',
              status: 'VALIDATED',
              similarity: 85 + Math.random() * 10,
              mode: m % 2 === 0 ? 'manual' : 'api',
              validatedBy: m % 2 === 0 ? 'Agent CPPF' : null,
              device: demo.device
            });
          }
        }
        attrs.preuveDeVie = {
          status: demo.status,
          mode: demo.mode,
          date: date.toISOString(),
          similarity: demo.similarity,
          device: demo.device,
          photoRef: 'https://openmediadata.s3.eu-west-3.amazonaws.com/face.jpg',
          photoSelfie: demo.status !== 'PENDING_REVIEW' ? 'https://openmediadata.s3.eu-west-3.amazonaws.com/face.jpg' : null,
          validatedBy: demo.mode === 'manual' ? null : undefined,
          history
        };
        const updateData = { customAttributes: attrs };
        if (demo.status === 'VALIDATED') updateData.dernierCertificatVie = date;
        await prisma.contact.update({ where: { id: contact.id }, data: updateData });
        seeded++;
      }
    }

    await prisma.$disconnect();
    res.json({ success: true, seeded, total: demoData.length });
  } catch (err) {
    logger.error('Demo seed error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Tracking redirect: GET /t/:trackingId/:buttonIndex?
// Enregistre le clic sur un bouton puis redirige vers l'URL cible
// Supporte multi-boutons (0, 1, 2)
// ============================================
app.get('/t/:trackingId/:buttonIndex?', async (req, res) => {
  const fallback = process.env.TRACKING_FALLBACK_URL || 'https://cppf.ga/';
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const { trackingId } = req.params;
    const buttonIndex = parseInt(req.params.buttonIndex) || 0;

    const message = await prisma.message.findFirst({
      where: { trackingId },
      include: {
        campaign: { select: { variables: true, template: { select: { buttons: true } } } }
      }
    });

    if (!message) {
      await prisma.$disconnect();
      return res.redirect(fallback);
    }

    // Enregistrer le clic par bouton (clickedButtons = [{index, clickedAt}])
    const clickedButtons = Array.isArray(message.clickedButtons) ? message.clickedButtons : [];
    const alreadyClicked = clickedButtons.some(c => c.index === buttonIndex);

    if (!alreadyClicked) {
      clickedButtons.push({ index: buttonIndex, clickedAt: new Date().toISOString() });
      const updateData = { clickedButtons };

      // Premier clic tous boutons confondus → marquer clickedAt + incrementer compteur campagne
      if (!message.clickedAt) {
        updateData.clickedAt = new Date();
      }

      await prisma.message.update({
        where: { id: message.id },
        data: updateData
      });

      if (message.campaignId && !message.clickedAt) {
        await prisma.campaign.update({
          where: { id: message.campaignId },
          data: { clicked: { increment: 1 } }
        });
      }
      logger.info('Click tracked', { trackingId, buttonIndex, campaignId: message.campaignId });
    }

    // Trouver l'URL de redirection pour ce bouton
    let targetUrl = fallback;
    const buttons = message.campaign?.template?.buttons;
    if (Array.isArray(buttons) && buttons[buttonIndex]) {
      targetUrl = buttons[buttonIndex].redirectUrl || fallback;
    }
    // Fallback: variable buttonUrls (tableau) ou buttonUrl (string)
    if (targetUrl === fallback && message.campaign?.variables) {
      const vars = message.campaign.variables;
      if (Array.isArray(vars.buttonUrls) && vars.buttonUrls[buttonIndex]) {
        targetUrl = vars.buttonUrls[buttonIndex];
      } else if (vars.buttonUrl) {
        targetUrl = vars.buttonUrl;
      }
    }

    await prisma.$disconnect();
    res.redirect(targetUrl);
  } catch (err) {
    logger.error('Tracking redirect error', { error: err.message, trackingId: req.params.trackingId });
    res.redirect(fallback);
  }
});

// Error handling
app.use(errorHandler);

// SPA fallback : routes non-API renvoient index.html
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route non trouvee', path: req.path });
  }
  res.sendFile(path.join(rootDir, 'index.html'));
});

// Auto-migration: appliquer les colonnes manquantes au demarrage
async function runAutoMigrations() {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const migrations = [
      'ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3)',
      'ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "trackingId" TEXT',
      'CREATE UNIQUE INDEX IF NOT EXISTS "messages_trackingId_key" ON "messages"("trackingId")',
      'ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "clickedButtons" JSONB',
      'ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "variableMapping" JSONB'
    ];
    for (const sql of migrations) {
      await prisma.$executeRawUnsafe(sql);
    }
    logger.info('Auto-migrations applied successfully');
    await prisma.$disconnect();
  } catch (err) {
    logger.warn('Auto-migration error (may be already applied)', { error: err.message });
  }
}

// Start server
app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/api/health`);
  runAutoMigrations();
});

// === Tache planifiee : Rapport quotidien a 8h00 (Libreville UTC+1) ===
const enrichmentService = require('./services/enrichment');

let lastScheduledReportDate = null;
setInterval(async () => {
  try {
    const now = new Date();
    const librevilleHour = (now.getUTCHours() + 1) % 24;
    const todayStr = new Date(now.getTime() + 3600000).toISOString().split('T')[0];

    if (librevilleHour === 8 && lastScheduledReportDate !== todayStr) {
      lastScheduledReportDate = todayStr;
      logger.info('[CRON] Debut generation rapport quotidien 8h00 Libreville');

      // 1. Enrichir les sessions non-analysees
      const batchResult = await enrichmentService.enrichBatch(100);
      logger.info('[CRON] Enrichissement batch termine', batchResult);

      // 2. Generer le rapport de la veille
      const report = await enrichmentService.generateDailyReport();
      logger.info('[CRON] Rapport quotidien genere', { reportId: report.id, date: report.date });

      // 3. Alimenter la base RAG automatiquement
      try {
        await enrichmentService.feedReportToRag(report.id);
        logger.info('[CRON] Rapport ajoute a la base RAG');
      } catch (ragErr) {
        logger.warn('[CRON] Erreur ajout RAG', { error: ragErr.message });
      }
    }
  } catch (err) {
    logger.error('[CRON] Erreur tache planifiee', { error: err.message });
  }
}, 60 * 1000);

logger.info('Tache planifiee configuree: rapport quotidien a 8h00 (Libreville/UTC+1)');

module.exports = app;
