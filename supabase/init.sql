-- ============================================
-- CPPF WhatsApp Connect - Configuration Supabase
-- Exécuter ce script dans le SQL Editor de Supabase
-- ============================================

-- 1. Activer pgvector pour le RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tables Utilisateurs
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" TEXT UNIQUE NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPERATOR',
    "is_active" BOOLEAN DEFAULT true,
    "last_login" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tables Templates WhatsApp
CREATE TABLE IF NOT EXISTS "templates" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'MARKETING',
    "content" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT '{}',
    "language" TEXT DEFAULT 'fr',
    "status" TEXT DEFAULT 'PENDING',
    "meta_id" TEXT,
    "approved_at" TIMESTAMP WITH TIME ZONE,
    "rejected_at" TIMESTAMP WITH TIME ZONE,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tables Campagnes
CREATE TABLE IF NOT EXISTS "campaigns" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT DEFAULT 'DRAFT',
    "description" TEXT,
    "sent" INTEGER DEFAULT 0,
    "delivered" INTEGER DEFAULT 0,
    "read" INTEGER DEFAULT 0,
    "clicked" INTEGER DEFAULT 0,
    "failed" INTEGER DEFAULT 0,
    "template_id" UUID REFERENCES "templates"("id"),
    "segment" TEXT NOT NULL,
    "variables" JSONB DEFAULT '{}',
    "scheduled_at" TIMESTAMP WITH TIME ZONE,
    "started_at" TIMESTAMP WITH TIME ZONE,
    "completed_at" TIMESTAMP WITH TIME ZONE,
    "created_by" UUID REFERENCES "users"("id"),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tables Contacts
CREATE TABLE IF NOT EXISTS "contacts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "phone" TEXT UNIQUE NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "segment" TEXT DEFAULT 'ACTIVE',
    "tags" TEXT[] DEFAULT '{}',
    "last_activity" TIMESTAMP WITH TIME ZONE,
    "status" TEXT DEFAULT 'ACTIVE',
    "whatsapp_id" TEXT,
    "opted_in" BOOLEAN DEFAULT false,
    "opted_in_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tables Messages
CREATE TABLE IF NOT EXISTS "messages" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "campaign_id" UUID REFERENCES "campaigns"("id"),
    "contact_id" UUID REFERENCES "contacts"("id"),
    "content" TEXT NOT NULL,
    "type" TEXT DEFAULT 'TEXT',
    "status" TEXT DEFAULT 'PENDING',
    "external_id" TEXT,
    "sent_at" TIMESTAMP WITH TIME ZONE,
    "delivered_at" TIMESTAMP WITH TIME ZONE,
    "read_at" TIMESTAMP WITH TIME ZONE,
    "failed_at" TIMESTAMP WITH TIME ZONE,
    "error" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tables Documents RAG
CREATE TABLE IF NOT EXISTS "knowledge_documents" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER DEFAULT 0,
    "path" TEXT,
    "status" TEXT DEFAULT 'PROCESSING',
    "chunks" INTEGER DEFAULT 0,
    "indexed_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tables Chunks avec Embeddings (RAG)
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "document_id" UUID REFERENCES "knowledge_documents"("id") ON DELETE CASCADE,
    "content" TEXT NOT NULL,
    "embedding" vector(3072),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Tables Sessions Chat
CREATE TABLE IF NOT EXISTS "chat_sessions" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "contact_id" TEXT,
    "messages" JSONB[] DEFAULT '{}',
    "source" TEXT DEFAULT 'web',
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Tables API Keys
CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "key" TEXT UNIQUE NOT NULL,
    "permissions" TEXT[] DEFAULT '{}',
    "last_used_at" TIMESTAMP WITH TIME ZONE,
    "usage_count" INTEGER DEFAULT 0,
    "is_active" BOOLEAN DEFAULT true,
    "expires_at" TIMESTAMP WITH TIME ZONE,
    "created_by" UUID REFERENCES "users"("id"),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Index pour les performances
-- ============================================

CREATE INDEX IF NOT EXISTS "idx_campaigns_status" ON "campaigns"("status");
CREATE INDEX IF NOT EXISTS "idx_campaigns_created_at" ON "campaigns"("created_at");
CREATE INDEX IF NOT EXISTS "idx_contacts_segment" ON "contacts"("segment");
CREATE INDEX IF NOT EXISTS "idx_contacts_phone" ON "contacts"("phone");
CREATE INDEX IF NOT EXISTS "idx_messages_campaign" ON "messages"("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_messages_contact" ON "messages"("contact_id");
CREATE INDEX IF NOT EXISTS "idx_messages_status" ON "messages"("status");
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_doc" ON "knowledge_chunks"("document_id");

-- Index vectoriel pour la recherche sémantique
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_embedding"
    ON "knowledge_chunks"
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ============================================
-- Fonction de recherche vectorielle RAG
-- ============================================

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
    query_embedding vector(3072),
    match_threshold float DEFAULT 0.75,
    match_count int DEFAULT 5
)
RETURNS TABLE(
    id uuid,
    document_id uuid,
    content text,
    metadata jsonb,
    similarity float,
    document_name text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        kc.id,
        kc.document_id,
        kc.content,
        kc.metadata,
        (1 - (kc.embedding <=> query_embedding))::float as similarity,
        kd.name as document_name
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kc.document_id = kd.id
    WHERE 1 - (kc.embedding <=> query_embedding) > match_threshold
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================
-- Trigger pour compter les chunks
-- ============================================

CREATE OR REPLACE FUNCTION update_document_chunks_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE knowledge_documents
        SET chunks = chunks + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.document_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE knowledge_documents
        SET chunks = chunks - 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.document_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_chunks_count ON knowledge_chunks;
CREATE TRIGGER trigger_update_chunks_count
    AFTER INSERT OR DELETE ON knowledge_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_document_chunks_count();

-- ============================================
-- Utilisateur Admin par défaut
-- Mot de passe: admin123 (à changer!)
-- Hash bcrypt généré avec 10 rounds
-- ============================================

INSERT INTO "users" (email, password, name, role)
VALUES (
    'admin@cppf.ga',
    '$2a$10$8KzQ7IKgJXqZKP/QZxHJqe6y7VxRiJXH0vSuJj3HiN5nLQPO5sXyK',
    'Admin CPPF',
    'ADMIN'
) ON CONFLICT (email) DO NOTHING;

-- ============================================
-- Templates WhatsApp exemple
-- ============================================

INSERT INTO "templates" (name, display_name, category, content, variables, status)
VALUES
    ('welcome_message', 'Message de Bienvenue', 'UTILITY',
     'Bonjour {{1}} ! Bienvenue sur le service WhatsApp de la CPPF.',
     ARRAY['nom'], 'APPROVED'),
    ('reactivation', 'Relance Connexion', 'MARKETING',
     'Bonjour {{1}}, nous avons remarqué que vous ne vous êtes pas connecté depuis un moment. Reconnectez-vous ici : {{2}}',
     ARRAY['nom', 'lien'], 'APPROVED'),
    ('otp_code', 'Code OTP', 'AUTHENTICATION',
     'Votre code de verification CPPF est : {{1}}. Valable 5 minutes.',
     ARRAY['code'], 'APPROVED')
ON CONFLICT DO NOTHING;

-- ============================================
-- Vérification finale
-- ============================================

SELECT 'Configuration terminée !' as status;
SELECT 'Tables créées:' as info, COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public';
SELECT 'Extension pgvector:' as info, extversion as version FROM pg_extension WHERE extname = 'vector';
