#!/bin/bash

# ============================================
# CPPF WhatsApp Connect - Script de démarrage
# ============================================

set -e

echo "🚀 Démarrage de CPPF WhatsApp Connect..."
echo ""

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Vérifier les prérequis
echo -e "${BLUE}📋 Vérification des prérequis...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker n'est pas installé${NC}"
    echo "Veuillez installer Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose n'est pas installé${NC}"
    echo "Veuillez installer Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✅ Docker et Docker Compose sont installés${NC}"
echo ""

# Vérifier le fichier .env
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  Fichier .env non trouvé${NC}"
    echo "Création à partir de .env.example..."
    
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Fichier .env créé${NC}"
        echo -e "${YELLOW}⚠️  Veuillez éditer le fichier .env avec vos configurations${NC}"
    else
        echo -e "${RED}❌ Fichier .env.example non trouvé${NC}"
        exit 1
    fi
    echo ""
fi

# Créer les répertoires nécessaires
echo -e "${BLUE}📁 Création des répertoires...${NC}"
mkdir -p logs uploads rag-service-logs
chmod 755 logs uploads rag-service-logs
echo -e "${GREEN}✅ Répertoires créés${NC}"
echo ""

# Démarrer les services
echo -e "${BLUE}🐳 Démarrage des services Docker...${NC}"
echo ""

docker-compose up -d --build

echo ""
echo -e "${GREEN}✅ Services démarrés avec succès !${NC}"
echo ""

# Attendre que les services soient prêts
echo -e "${BLUE}⏳ Attente du démarrage des services...${NC}"
sleep 10

# Vérifier l'état des services
echo ""
echo -e "${BLUE}🔍 Vérification des services...${NC}"
echo ""

services=("cppf-api" "cppf-rag" "cppf-db" "cppf-redis" "cppf-nginx")

for service in "${services[@]}"; do
    if docker ps | grep -q "$service"; then
        echo -e "${GREEN}✅ $service est en cours d'exécution${NC}"
    else
        echo -e "${RED}❌ $service n'est pas démarré${NC}"
    fi
done

echo ""
echo -e "${GREEN}🎉 CPPF WhatsApp Connect est prêt !${NC}"
echo ""
echo "📱 Application: http://localhost"
echo "🔌 API: http://localhost/api"
echo "📊 Grafana: http://localhost:3001 (admin/admin)"
echo "📈 Prometheus: http://localhost:9090"
echo ""
echo -e "${YELLOW}📖 Pour arrêter les services:${NC}"
echo "  docker-compose down"
echo ""
echo -e "${YELLOW}📖 Pour voir les logs:${NC}"
echo "  docker-compose logs -f"
echo ""
echo -e "${BLUE}Merci d'utiliser CPPF WhatsApp Connect !${NC}"
