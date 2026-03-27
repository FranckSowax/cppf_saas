# 🚀 Guide de Déploiement - CPPF WhatsApp Connect

## Table des matières
1. [Prérequis](#prérequis)
2. [Configuration](#configuration)
3. [Déploiement Local](#déploiement-local)
4. [Déploiement Production](#déploiement-production)
5. [Configuration Respond.io](#configuration-respondio)
6. [Vérification](#vérification)

---

## 📋 Prérequis

### Logiciels requis
- **Docker** 24.0+ et Docker Compose 2.20+
- **Git** pour cloner le repository
- **curl** pour les vérifications de santé

### Comptes externes nécessaires
- **Respond.io** - Pour l'API WhatsApp Business
- **OpenAI** - Pour le service RAG (GPT-4)
- **Pinecone** - Pour la base de données vectorielle

---

## ⚙️ Configuration

### 1. Cloner le repository
```bash
git clone https://github.com/cppf/whatsapp-connect.git
cd whatsapp-marketing-saas
```

### 2. Créer le fichier .env
```bash
cp .env.example .env
```

### 3. Configurer les variables d'environnement

Éditer le fichier `.env` avec vos informations:

```bash
# ============================================
# Configuration obligatoire
# ============================================

# JWT Secret (générer une clé sécurisée)
JWT_SECRET=$(openssl rand -base64 32)

# Respond.io API
RESPOND_IO_API_KEY=votre_cle_api_respond_io
RESPOND_IO_CHANNEL_ID=votre_channel_id
RESPOND_IO_WEBHOOK_SECRET=votre_secret_webhook

# OpenAI API
OPENAI_API_KEY=sk-votre_cle_openai

# Pinecone
PINECONE_API_KEY=votre_cle_pinecone
PINECONE_ENVIRONMENT=gcp-starter
PINECONE_INDEX=cppf-knowledge

# Client URL
CLIENT_URL=https://votre-domaine.com
```

---

## 💻 Déploiement Local

### Option 1: Script automatique
```bash
chmod +x start.sh
./start.sh
```

### Option 2: Docker Compose manuel
```bash
# Construire et démarrer
docker-compose up -d --build

# Vérifier les logs
docker-compose logs -f

# Arrêter
docker-compose down
```

### Accès aux services
| Service | URL | Identifiants |
|---------|-----|--------------|
| Application | http://localhost | - |
| API | http://localhost/api | - |
| Grafana | http://localhost:3001 | admin/admin |
| Prometheus | http://localhost:9090 | - |

---

## 🌐 Déploiement Production

### 1. Serveur cloud (AWS/GCP/Azure)

#### Configuration minimale recommandée
```
CPU: 4 vCPUs
RAM: 8 GB
Disque: 100 GB SSD
OS: Ubuntu 22.04 LTS
```

### 2. Installation sur le serveur

```bash
# Se connecter au serveur
ssh user@votre-serveur.com

# Installer Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Installer Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Cloner le projet
git clone https://github.com/cppf/whatsapp-connect.git
cd whatsapp-marketing-saas

# Configurer
nano .env

# Démarrer
chmod +x start.sh
./start.sh
```

### 3. Configuration SSL (HTTPS)

#### Avec Let's Encrypt
```bash
# Installer Certbot
sudo apt install certbot

# Générer le certificat
sudo certbot certonly --standalone -d votre-domaine.com

# Copier les certificats
sudo cp /etc/letsencrypt/live/votre-domaine.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/votre-domaine.com/privkey.pem nginx/ssl/key.pem

# Redémarrer Nginx
docker-compose restart nginx
```

### 4. Configuration DNS

Ajouter un enregistrement A pointant vers votre serveur:
```
votre-domaine.com.  A  IP_DU_SERVEUR
```

---

## 🔧 Configuration Respond.io

### 1. Créer un compte
1. Aller sur [respond.io](https://respond.io)
2. Créer un compte Business
3. Connecter votre numéro WhatsApp Business

### 2. Récupérer l'API Key
1. Aller dans **Settings** > **API**
2. Générer une nouvelle clé API
3. Copier la clé dans votre `.env`

### 3. Configurer le Webhook
1. Aller dans **Settings** > **Webhooks**
2. Ajouter un webhook:
   - **URL**: `https://votre-domaine.com/webhooks/respondio/incoming`
   - **Events**: `message.received`, `message.delivered`, `message.read`, `message.failed`
3. Copier le secret webhook dans votre `.env`

### 4. Créer un canal WhatsApp
1. Aller dans **Channels**
2. Ajouter un canal WhatsApp Business
3. Suivre les instructions de vérification
4. Copier le Channel ID dans votre `.env`

---

## ✅ Vérification

### 1. Vérifier les services
```bash
# Liste des conteneurs
docker-compose ps

# Logs
docker-compose logs -f api
docker-compose logs -f rag-service
```

### 2. Tests de santé
```bash
# API
curl http://localhost/health

# RAG Service
curl http://localhost:8000/health

# Database
docker-compose exec db pg_isready -U postgres

# Redis
docker-compose exec redis redis-cli ping
```

### 3. Tester l'API
```bash
# Login
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@cppf.ga", "password": "password"}'

# Créer une campagne (avec token)
curl -X POST http://localhost/api/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_TOKEN" \
  -d '{
    "name": "Test Campaign",
    "type": "marketing",
    "templateId": "votre-template-id",
    "segment": "active"
  }'
```

---

## 📊 Monitoring

### Grafana Dashboards
Accéder à `http://localhost:3001` (admin/admin)

Dashboards disponibles:
- **System Overview** - Métriques système
- **API Performance** - Performance de l'API
- **Campaign Analytics** - Analytics des campagnes
- **RAG Metrics** - Métriques du chatbot

### Alertes Prometheus
Configurer des alertes dans `monitoring/prometheus/alerts.yml`:
```yaml
groups:
  - name: cppf-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(cppf_api_errors_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
```

---

## 🔒 Sécurité

### 1. Firewall
```bash
# UFW (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2. Mises à jour automatiques
```bash
# Activer les mises à jour de sécurité
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 3. Backup
```bash
# Script de backup
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T db pg_dump -U postgres cppf_whatsapp > backup_$DATE.sql
gzip backup_$DATE.sql
```

---

## 🔄 Mises à jour

### Mettre à jour l'application
```bash
# Pull des dernières modifications
git pull origin main

# Rebuild et redémarrer
docker-compose down
docker-compose up -d --build

# Migrations de base de données
docker-compose exec api npx prisma migrate deploy
```

---

## 🆘 Dépannage

### Problème: Les services ne démarrent pas
```bash
# Vérifier les logs
docker-compose logs

# Vérifier les ports utilisés
sudo netstat -tlnp

# Redémarrer tout
docker-compose down -v
docker-compose up -d --build
```

### Problème: Erreur de connexion à la base de données
```bash
# Vérifier PostgreSQL
docker-compose exec db pg_isready -U postgres

# Reset la base (attention: perte de données)
docker-compose down -v
docker-compose up -d db
docker-compose exec api npx prisma migrate dev
```

### Problème: Le chatbot ne répond pas
```bash
# Vérifier le service RAG
curl http://localhost:8000/health

# Vérifier les logs
docker-compose logs rag-service

# Redémarrer
docker-compose restart rag-service
```

---

## 📞 Support

En cas de problème:
- 📧 Email: support@cppf.ga
- 📱 Téléphone: +241 01 74 12 34
- 📖 Documentation: https://docs.cppf-whatsapp.ga

---

**Version:** 1.0.0  
**Dernière mise à jour:** 06 Février 2026
