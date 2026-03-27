# CPPF WhatsApp Connect

## 📋 Documentation Technique Complète

### Table des matières
1. [Architecture](#architecture)
2. [Installation](#installation)
3. [Configuration Respond.io](#configuration-respondio)
4. [API Endpoints](#api-endpoints)
5. [Service RAG](#service-rag)
6. [Base de données](#base-de-données)
7. [Workflows](#workflows)
8. [Sécurité](#sécurité)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React)                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Dashboard│ │ Campagnes│ │ Chatbot  │ │ Analytics│           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (Express)                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │  Auth JWT    │ │ Rate Limit   │ │ Validation   │             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Campaign     │   │   RAG         │   │  Contact      │
│  Service      │   │  Service      │   │  Service      │
│  (Node.js)    │   │  (Python)     │   │  (Node.js)    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL + Supabase pgvector              │
│          (Campaigns, Contacts, Vectors RAG)              │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│                    Respond.io API                        │
│              (WhatsApp Business API)                     │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Installation

### Prérequis
- Node.js 18+
- Python 3.10+
- PostgreSQL 14+
- Redis 7+

### 1. Cloner le projet
```bash
git clone https://github.com/cppf/whatsapp-connect.git
cd whatsapp-marketing-saas
```

### 2. Installation Backend
```bash
cd backend
npm install
```

### 3. Configuration environnement
```bash
cp .env.example .env
```

Éditer `.env`:
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/cppf_whatsapp

# JWT
JWT_SECRET=votre_secret_jwt_tres_securise
JWT_EXPIRES_IN=7d

# Respond.io
RESPOND_IO_API_KEY=votre_cle_api_respond_io
RESPOND_IO_WEBHOOK_SECRET=votre_secret_webhook

# OpenAI (pour RAG)
OPENAI_API_KEY=votre_cle_openai

# Supabase (Vector DB avec pgvector)
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_KEY=votre_service_key_supabase
SUPABASE_ANON_KEY=votre_anon_key_supabase

# Configuration RAG
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
TOP_K=5
SIMILARITY_THRESHOLD=0.75

# Redis
REDIS_URL=redis://localhost:6379

# Server
PORT=3000
NODE_ENV=production
```

### 4. Migration base de données
```bash
npx prisma migrate dev
npx prisma generate
```

### 5. Démarrage
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

---

## 🔧 Configuration Respond.io

### 1. Créer un compte
1. Aller sur [respond.io](https://respond.io)
2. Créer un compte Business
3. Vérifier le numéro WhatsApp Business

### 2. Configurer le canal WhatsApp
```javascript
// backend/src/config/respondio.js
module.exports = {
  baseURL: 'https://api.respond.io/v1',
  apiKey: process.env.RESPOND_IO_API_KEY,
  webhookSecret: process.env.RESPOND_IO_WEBHOOK_SECRET,
  
  // Configuration des messages
  messageConfig: {
    maxLength: 4096,
    supportedTypes: ['text', 'image', 'document', 'template'],
    rateLimit: {
      messagesPerSecond: 80,
      burstLimit: 100
    }
  }
};
```

### 3. Webhooks
Configurer les webhooks dans Respond.io Dashboard:

```javascript
// backend/src/routes/webhooks.js
router.post('/respondio/incoming', async (req, res) => {
  const signature = req.headers['x-respondio-signature'];
  
  // Vérifier la signature
  if (!verifyWebhookSignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const { event, data } = req.body;
  
  switch (event) {
    case 'message.received':
      await handleIncomingMessage(data);
      break;
    case 'message.delivered':
      await updateMessageStatus(data.messageId, 'delivered');
      break;
    case 'message.read':
      await updateMessageStatus(data.messageId, 'read');
      break;
    case 'message.failed':
      await handleFailedMessage(data);
      break;
  }
  
  res.status(200).json({ received: true });
});
```

---

## 📡 API Endpoints

### Authentification

#### POST /api/auth/login
```javascript
// Request
{
  "email": "admin@cppf.ga",
  "password": "********"
}

// Response
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "admin@cppf.ga",
    "role": "admin",
    "permissions": ["campaign:create", "campaign:read", "campaign:update"]
  }
}
```

### Campagnes

#### GET /api/campaigns
```javascript
// Query params
?page=1&limit=20&status=running&sort=-createdAt

// Response
{
  "data": [
    {
      "id": "uuid",
      "name": "Relance App Mobile",
      "status": "running",
      "sent": 25000,
      "delivered": 24200,
      "read": 18900,
      "clicked": 4200,
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

#### POST /api/campaigns
```javascript
// Request
{
  "name": "Nouvelle Campagne",
  "type": "reactivation",
  "templateId": "uuid",
  "segment": "inactif",
  "scheduledAt": "2026-02-10T14:00:00Z",
  "variables": {
    "nom": "{{contact.name}}",
    "lien": "https://cppf.ga/app"
  }
}

// Response
{
  "id": "uuid",
  "name": "Nouvelle Campagne",
  "status": "scheduled",
  "estimatedReach": 25000,
  "createdAt": "2026-02-06T10:00:00Z"
}
```

#### POST /api/campaigns/:id/send
```javascript
// Response
{
  "success": true,
  "message": "Campagne lancée avec succès",
  "stats": {
    "totalContacts": 25000,
    "queued": 25000,
    "estimatedTime": "5 minutes"
  }
}
```

### Contacts

#### GET /api/contacts
```javascript
// Query params
?page=1&limit=50&segment=inactif&search=jean

// Response
{
  "data": [
    {
      "id": "uuid",
      "name": "Jean Dupont",
      "phone": "+24174123456",
      "email": "jean.dupont@email.com",
      "segment": "inactif",
      "lastActivity": "2025-11-20T14:30:00Z",
      "status": "active",
      "tags": ["app-mobile", "premium"]
    }
  ],
  "pagination": { ... }
}
```

#### POST /api/contacts/import
```javascript
// Multipart form-data
// file: contacts.csv

// Response
{
  "success": true,
  "imported": 5000,
  "failed": 23,
  "errors": [
    { "row": 45, "error": "Invalid phone number" }
  ]
}
```

### Chatbot RAG

#### POST /api/chatbot/message
```javascript
// Request
{
  "message": "Comment récupérer mes identifiants ?",
  "sessionId": "uuid",
  "contactId": "uuid" // optional
}

// Response
{
  "response": "Pour récupérer vos identifiants CPPF...",
  "sources": [
    { "document": "FAQ_CPPF_2026.pdf", "page": 12, "score": 0.94 }
  ],
  "confidence": 0.94,
  "sessionId": "uuid"
}
```

#### POST /api/chatbot/knowledge/upload
```javascript
// Multipart form-data
// file: document.pdf

// Response
{
  "id": "uuid",
  "name": "FAQ_CPPF_2026.pdf",
  "status": "processing",
  "chunks": 45,
  "estimatedTime": "2 minutes"
}
```

#### GET /api/chatbot/knowledge
```javascript
// Response
{
  "documents": [
    {
      "id": "uuid",
      "name": "FAQ_CPPF_2026.pdf",
      "type": "pdf",
      "size": "2.4 MB",
      "status": "indexed",
      "chunks": 45,
      "indexedAt": "2026-01-10T10:00:00Z"
    }
  ]
}
```

### Templates

#### GET /api/templates
```javascript
// Response
{
  "data": [
    {
      "id": "uuid",
      "name": "Relance Connexion",
      "category": "marketing",
      "status": "approved",
      "content": "Bonjour {{1}} ! Votre espace CPPF vous attend...",
      "variables": ["nom", "lien"],
      "approvedAt": "2026-01-10T10:00:00Z"
    }
  ]
}
```

#### POST /api/templates
```javascript
// Request
{
  "name": "Nouveau Template",
  "category": "utility",
  "content": "Votre code OTP est : {{1}}",
  "language": "fr"
}

// Response
{
  "id": "uuid",
  "name": "Nouveau Template",
  "status": "pending",
  "message": "Template soumis pour approbation Meta. Délai: 24-48h"
}
```

### Analytics

#### GET /api/analytics/dashboard
```javascript
// Query params
?startDate=2026-01-01&endDate=2026-02-06

// Response
{
  "overview": {
    "totalMessages": 164200,
    "deliveryRate": 96.8,
    "openRate": 78.2,
    "clickRate": 22.4,
    "conversionRate": 12.4
  },
  "campaigns": {
    "total": 45,
    "active": 3,
    "completed": 38,
    "scheduled": 4
  },
  "contacts": {
    "total": 125000,
    "active": 98000,
    "inactive": 25000,
    "unsubscribed": 2000
  },
  "charts": {
    "messagesOverTime": [...],
    "engagementByChannel": [...],
    "hourlyActivity": [...]
  }
}
```

---

## 🤖 Service RAG

### Architecture RAG

```
┌─────────────────────────────────────────────────────────────┐
│                      RAG Service (Python)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Document   │  │  Embedding  │  │   Query     │         │
│  │  Loader     │──│   Model     │──│  Handler    │         │
│  │ (LangChain) │  │ (OpenAI)    │  │             │         │
│  └─────────────┘  └─────────────┘  └──────┬──────┘         │
│                                             │                │
│  ┌─────────────┐  ┌─────────────┐          │                │
│  │  Vector     │  │    LLM      │◄─────────┘                │
│  │  Store      │──│  (GPT-4)    │                           │
│  │(Supabase/  │  │             │                           │
│  │  pgvector)  │  │             │                           │
│  └─────────────┘  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### Configuration

```python
# rag-service/config.py
from pydantic import BaseSettings

class Settings(BaseSettings):
    # OpenAI
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4"
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    
    # Supabase (pgvector)
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    
    # RAG Parameters
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    TOP_K: int = 5
    SIMILARITY_THRESHOLD: float = 0.75
    
    # System Prompt
    SYSTEM_PROMPT = """Tu es Cassiopée, l'assistant virtuel de CPPF.

RÈGLES:
- Réponds UNIQUEMENT en français
- Base-toi UNIQUEMENT sur la documentation fournie
- Si tu ne trouves pas la réponse, oriente vers le service client
- Sois professionnel, chaleureux et concis
- Ne partage JAMAIS d'informations sensibles
- Cite toujours tes sources

CONTEXTE:
{context}

QUESTION:
{question}

RÉPONSE:"""

settings = Settings()
```

### Pipeline de Traitement

```python
# rag-service/services/supabase_rag.py
from langchain.document_loaders import PyPDFLoader, CSVLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import OpenAIEmbeddings
from langchain.schema import Document
from supabase import create_client
import openai

class SupabaseRAGService:
    def __init__(self):
        self.supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        self.openai_client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        self.embeddings = OpenAIEmbeddings(
            model=settings.EMBEDDING_MODEL,
            openai_api_key=settings.OPENAI_API_KEY
        )
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP
        )
        self.vectorstore = Pinecone.from_existing_index(
            index_name=settings.PINECONE_INDEX,
            embedding=self.embeddings
        )
    
    async def process_document(self, file_path: str, doc_type: str):
        """Traite un document et l'indexe"""
        # Charger le document
        loader = self._get_loader(file_path, doc_type)
        documents = loader.load()
        
        # Découper en chunks
        chunks = self.text_splitter.split_documents(documents)
        
        # Générer les embeddings et indexer
        await self.vectorstore.aadd_documents(chunks)
        
        return {
            "chunks": len(chunks),
            "status": "indexed"
        }
    
    async def query(self, question: str, session_id: str = None):
        """Interroge la base de connaissances"""
        # Recherche sémantique
        docs = await self.vectorstore.asimilarity_search(
            question,
            k=settings.TOP_K
        )
        
        # Filtrer par seuil de similarité
        filtered_docs = [
            doc for doc in docs 
            if doc.metadata.get('score', 0) >= settings.SIMILARITY_THRESHOLD
        ]
        
        if not filtered_docs:
            return {
                "response": "Je n'ai pas trouvé d'information pertinente. Veuillez contacter le service client au 0770 12 34 56.",
                "sources": [],
                "confidence": 0
            }
        
        # Construire le contexte
        context = "\n\n".join([doc.page_content for doc in filtered_docs])
        
        # Générer la réponse
        qa_chain = RetrievalQA.from_chain_type(
            llm=OpenAI(model_name=settings.OPENAI_MODEL),
            chain_type="stuff",
            retriever=self.vectorstore.as_retriever(),
            return_source_documents=True
        )
        
        result = await qa_chain.acall({
            "query": settings.SYSTEM_PROMPT.format(
                context=context,
                question=question
            )
        })
        
        return {
            "response": result['result'],
            "sources": [
                {
                    "document": doc.metadata.get('source'),
                    "page": doc.metadata.get('page'),
                    "score": doc.metadata.get('score')
                }
                for doc in filtered_docs
            ],
            "confidence": sum(doc.metadata.get('score', 0) for doc in filtered_docs) / len(filtered_docs)
        }
```

---

## 🗄️ Base de Données

### Schéma Prisma

```prisma
// backend/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(ADMIN)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  campaigns Campaign[]
  apiKeys   ApiKey[]
}

model Campaign {
  id          String          @id @default(uuid())
  name        String
  type        CampaignType
  status      CampaignStatus  @default(DRAFT)
  
  // Statistiques
  sent        Int             @default(0)
  delivered   Int             @default(0)
  read        Int             @default(0)
  clicked     Int             @default(0)
  failed      Int             @default(0)
  
  // Configuration
  templateId  String
  template    Template        @relation(fields: [templateId], references: [id])
  segment     String
  variables   Json?
  
  // Planification
  scheduledAt DateTime?
  startedAt   DateTime?
  completedAt DateTime?
  
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  
  createdBy   String
  user        User            @relation(fields: [createdBy], references: [id])
  
  messages    Message[]
}

model Template {
  id          String          @id @default(uuid())
  name        String
  category    TemplateCategory
  content     String
  variables   String[]
  status      TemplateStatus  @default(PENDING)
  
  // Meta approval
  metaId      String?
  approvedAt  DateTime?
  rejectedAt  DateTime?
  rejectionReason String?
  
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  
  campaigns   Campaign[]
}

model Contact {
  id            String    @id @default(uuid())
  phone         String    @unique
  email         String?
  name          String?
  
  // Segmentation
  segment       Segment   @default(ACTIVE)
  tags          String[]
  
  // Métadonnées
  lastActivity  DateTime?
  status        ContactStatus @default(ACTIVE)
  
  // WhatsApp
  whatsappId    String?
  optedIn       Boolean   @default(false)
  optedInAt     DateTime?
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  messages      Message[]
}

model Message {
  id          String          @id @default(uuid())
  
  // Relations
  campaignId  String?
  campaign    Campaign?       @relation(fields: [campaignId], references: [id])
  contactId   String
  contact     Contact         @relation(fields: [contactId], references: [id])
  
  // Contenu
  content     String
  type        MessageType     @default(TEXT)
  
  // Statut
  status      MessageStatus   @default(PENDING)
  externalId  String?         // ID Respond.io
  
  // Timestamps
  sentAt      DateTime?
  deliveredAt DateTime?
  readAt      DateTime?
  failedAt    DateTime?
  error       String?
  
  createdAt   DateTime        @default(now())
}

model KnowledgeDocument {
  id          String         @id @default(uuid())
  name        String
  type        String         // pdf, docx, xlsx, etc.
  size        Int            // in bytes
  path        String?        // storage path (optionnel avec Supabase)
  
  // Indexation
  status      DocumentStatus @default(PROCESSING)
  chunks      Int            @default(0)
  indexedAt   DateTime?
  
  // Relations
  chunks_data KnowledgeChunk[]
  
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

model KnowledgeChunk {
  id           String   @id @default(uuid())
  documentId   String
  document     KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  
  // Content
  content      String
  
  // Vector embedding (3072 dimensions pour text-embedding-3-large)
  embedding    Unsupported("vector(3072)")?
  
  // Metadata
  metadata     Json     @default("{}")
  
  // Timestamps
  createdAt    DateTime @default(now())
}

model ApiKey {
  id          String    @id @default(uuid())
  name        String
  key         String    @unique
  
  // Permissions
  permissions String[]
  
  // Usage
  lastUsedAt  DateTime?
  usageCount  Int       @default(0)
  
  // Status
  isActive    Boolean   @default(true)
  expiresAt   DateTime?
  
  createdAt   DateTime  @default(now())
  createdBy   String
  user        User      @relation(fields: [createdBy], references: [id])
}

// Enums
enum Role {
  ADMIN
  MANAGER
  OPERATOR
}

enum CampaignType {
  REACTIVATION
  TUTORIAL
  NOTIFICATION
  FEATURE
  MARKETING
}

enum CampaignStatus {
  DRAFT
  SCHEDULED
  RUNNING
  PAUSED
  COMPLETED
  FAILED
}

enum TemplateCategory {
  MARKETING
  UTILITY
  AUTHENTICATION
}

enum TemplateStatus {
  PENDING
  APPROVED
  REJECTED
}

enum Segment {
  ACTIVE
  INACTIVE
  NEW
  PREMIUM
}

enum ContactStatus {
  ACTIVE
  UNSUBSCRIBED
  BLOCKED
}

enum MessageType {
  TEXT
  IMAGE
  DOCUMENT
  TEMPLATE
}

enum MessageStatus {
  PENDING
  QUEUED
  SENT
  DELIVERED
  READ
  FAILED
}

enum DocumentStatus {
  PROCESSING
  INDEXED
  FAILED
}
```

---

## 🔄 Workflows

### Workflow 1: Envoi de Campagne

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant API as API
    participant Q as Queue (Bull)
    participant W as Worker
    participant R as Respond.io
    participant DB as Database
    
    U->>API: POST /campaigns/:id/send
    API->>DB: Récupérer contacts du segment
    API->>Q: Ajouter jobs à la queue
    API->>U: { queued: 25000 }
    
    loop Pour chaque batch (100 contacts)
        Q->>W: Process batch
        W->>R: Envoyer messages
        R-->>W: Confirmation
        W->>DB: Mettre à jour statut
    end
```

### Workflow 2: Chatbot RAG

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant API as API
    participant RAG as RAG Service
    participant V as Vector DB
    participant L as LLM
    
    U->>API: POST /chatbot/message
    API->>RAG: query(question)
    RAG->>V: similarity_search(question)
    V-->>RAG: documents pertinents
    RAG->>L: generate(context, question)
    L-->>RAG: réponse
    RAG-->>API: { response, sources }
    API-->>U: Réponse + sources
```

### Workflow 3: Indexation Document

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant API as API
    participant S3 as Storage
    participant RAG as RAG Service
    participant V as Vector DB
    
    U->>API: POST /knowledge/upload
    API->>S3: Upload fichier
    API->>RAG: process_document(path)
    RAG->>RAG: Load & split
    RAG->>RAG: Generate embeddings
    RAG->>V: Store vectors
    V-->>RAG: Confirmation
    RAG-->>API: { chunks: 45, status: indexed }
    API-->>U: Document indexé
```

---

## 🔒 Sécurité

### Authentification JWT

```javascript
// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

const authorize = (permissions) => {
  return (req, res, next) => {
    const userPermissions = req.user.permissions || [];
    
    const hasPermission = permissions.some(p => 
      userPermissions.includes(p)
    );
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    
    next();
  };
};

module.exports = { authenticate, authorize };
```

### Rate Limiting

```javascript
// backend/src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:api:'
  }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // 1000 requêtes par minute
  message: {
    error: 'Trop de requêtes, veuillez réessayer plus tard'
  }
});

const campaignLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:campaign:'
  }),
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 campagnes par heure
  message: {
    error: 'Limite de campagnes atteinte'
  }
});

module.exports = { apiLimiter, campaignLimiter };
```

### Validation des Données

```javascript
// backend/src/validators/campaign.js
const Joi = require('joi');

const createCampaignSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  type: Joi.string().valid('reactivation', 'tutorial', 'notification', 'feature').required(),
  templateId: Joi.string().uuid().required(),
  segment: Joi.string().valid('all', 'active', 'inactive', 'new').required(),
  scheduledAt: Joi.date().min('now').optional(),
  variables: Joi.object().optional()
});

const validateCampaign = (req, res, next) => {
  const { error } = createCampaignSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      error: 'Données invalides',
      details: error.details
    });
  }
  
  next();
};

module.exports = { validateCampaign };
```

---

## 📊 Monitoring

### Logs

```javascript
// backend/src/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

module.exports = logger;
```

### Métriques

```javascript
// backend/src/utils/metrics.js
const promClient = require('prom-client');

const campaignMessagesSent = new promClient.Counter({
  name: 'campaign_messages_sent_total',
  help: 'Total de messages envoyés',
  labelNames: ['campaign_type', 'status']
});

const campaignDuration = new promClient.Histogram({
  name: 'campaign_duration_seconds',
  help: 'Durée des campagnes',
  buckets: [60, 300, 600, 1800, 3600]
});

const activeCampaigns = new promClient.Gauge({
  name: 'active_campaigns',
  help: 'Nombre de campagnes actives'
});

module.exports = {
  campaignMessagesSent,
  campaignDuration,
  activeCampaigns
};
```

---

## 🚀 Déploiement Production

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/cppf_whatsapp
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - RESPOND_IO_API_KEY=${RESPOND_IO_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
      - redis
      - rag-service
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  rag-service:
    build: ./rag-service
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - PINECONE_API_KEY=${PINECONE_API_KEY}
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=cppf_whatsapp
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Nginx Configuration

```nginx
# nginx.conf
upstream api {
    server api:3000;
}

server {
    listen 80;
    server_name api.cppf-whatsapp.ga;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.cppf-whatsapp.ga;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📞 Support

Pour toute question ou problème:
- Email: support@cppf.ga
- Téléphone: +241 01 74 12 34
- Documentation: https://docs.cppf-whatsapp.ga

---

**Version:** 1.0.0  
**Dernière mise à jour:** 06 Février 2026  
**Auteur:** CPPF Digital Team
