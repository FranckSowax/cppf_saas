#!/bin/bash
# ============================================
# CPPF WhatsApp Connect - Script d'installation
# Usage: chmod +x deploy.sh && ./deploy.sh
# ============================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "============================================"
echo "  CPPF WhatsApp Connect - Installation"
echo "  Version: 1.0.0"
echo "============================================"
echo -e "${NC}"

# ============================================
# 1. Verification des prerequis
# ============================================
echo -e "${YELLOW}[1/8] Verification des prerequis...${NC}"

command -v docker >/dev/null 2>&1 || {
    echo -e "${RED}ERREUR: Docker n'est pas installe.${NC}"
    echo "Installer Docker: https://docs.docker.com/engine/install/"
    exit 1
}

command -v docker compose >/dev/null 2>&1 || {
    echo -e "${RED}ERREUR: Docker Compose n'est pas installe.${NC}"
    echo "Installer Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
}

DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
echo -e "${GREEN}  Docker: v${DOCKER_VERSION}${NC}"

COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
echo -e "${GREEN}  Docker Compose: v${COMPOSE_VERSION}${NC}"

# ============================================
# 2. Configuration du fichier .env
# ============================================
echo -e "\n${YELLOW}[2/8] Configuration de l'environnement...${NC}"

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}  Fichier .env cree depuis .env.example${NC}"
        echo -e "${RED}  IMPORTANT: Editez le fichier .env avec vos vraies valeurs${NC}"
        echo -e "  Commande: ${BLUE}nano .env${NC}"
        echo ""
        read -p "  Voulez-vous editer .env maintenant ? (O/n): " EDIT_ENV
        if [ "$EDIT_ENV" != "n" ] && [ "$EDIT_ENV" != "N" ]; then
            ${EDITOR:-nano} .env
        fi
    else
        echo -e "${RED}ERREUR: Aucun fichier .env ou .env.example trouve.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}  Fichier .env existant detecte.${NC}"
fi

# Verification des variables critiques
source .env 2>/dev/null || true

MISSING_VARS=0
for VAR in DB_PASSWORD JWT_SECRET WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID OPENAI_API_KEY; do
    VAL=$(eval echo "\$$VAR" 2>/dev/null)
    if [ -z "$VAL" ] || [[ "$VAL" == *"CHANGER"* ]] || [[ "$VAL" == *"GENERER"* ]] || [[ "$VAL" == *"votre"* ]]; then
        echo -e "${RED}  MANQUANT: $VAR${NC}"
        MISSING_VARS=1
    fi
done

if [ "$MISSING_VARS" = "1" ]; then
    echo -e "\n${RED}  Des variables critiques ne sont pas configurees.${NC}"
    read -p "  Continuer quand meme ? (o/N): " CONTINUE
    if [ "$CONTINUE" != "o" ] && [ "$CONTINUE" != "O" ]; then
        echo "  Installation annulee. Editez .env et relancez ./deploy.sh"
        exit 1
    fi
fi

# ============================================
# 3. Certificats SSL
# ============================================
echo -e "\n${YELLOW}[3/8] Verification des certificats SSL...${NC}"

if [ ! -f deploy/ssl/fullchain.pem ] || [ ! -f deploy/ssl/privkey.pem ]; then
    echo -e "${YELLOW}  Aucun certificat SSL trouve dans deploy/ssl/${NC}"
    echo "  Options:"
    echo "    1) Placez vos certificats dans deploy/ssl/ (fullchain.pem + privkey.pem)"
    echo "    2) Generez un certificat auto-signe pour les tests"
    echo ""
    read -p "  Generer un certificat auto-signe ? (o/N): " GEN_CERT
    if [ "$GEN_CERT" = "o" ] || [ "$GEN_CERT" = "O" ]; then
        echo -e "  ${YELLOW}Generation du certificat auto-signe...${NC}"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout deploy/ssl/privkey.pem \
            -out deploy/ssl/fullchain.pem \
            -subj "/C=GA/ST=Estuaire/L=Libreville/O=CPPF/CN=whatsapp.cppf.ga" \
            2>/dev/null
        echo -e "  ${GREEN}Certificat auto-signe genere (valide 365 jours)${NC}"
        echo -e "  ${RED}ATTENTION: Remplacez par un vrai certificat en production !${NC}"
    else
        echo -e "  ${RED}ATTENTION: L'installation continuera mais Nginx ne demarrera pas sans certificats.${NC}"
    fi
else
    echo -e "${GREEN}  Certificats SSL trouves.${NC}"
fi

# ============================================
# 4. Construction des images Docker
# ============================================
echo -e "\n${YELLOW}[4/8] Construction des images Docker...${NC}"
docker compose build --no-cache
echo -e "${GREEN}  Images construites avec succes.${NC}"

# ============================================
# 5. Demarrage de la base de donnees
# ============================================
echo -e "\n${YELLOW}[5/8] Demarrage de PostgreSQL...${NC}"
docker compose up -d db
echo "  Attente du demarrage de PostgreSQL..."
sleep 10

# Verifier que PostgreSQL est pret
RETRIES=30
until docker compose exec db pg_isready -U cppf_user -d cppf_whatsapp >/dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
    echo "  Attente de PostgreSQL... ($RETRIES tentatives restantes)"
    RETRIES=$((RETRIES - 1))
    sleep 2
done

if [ $RETRIES -eq 0 ]; then
    echo -e "${RED}  ERREUR: PostgreSQL n'a pas demarre dans le temps imparti.${NC}"
    docker compose logs db
    exit 1
fi
echo -e "${GREEN}  PostgreSQL est pret.${NC}"

# ============================================
# 6. Migrations de la base de donnees
# ============================================
echo -e "\n${YELLOW}[6/8] Execution des migrations Prisma...${NC}"
docker compose run --rm app sh -c "cd backend && npx prisma migrate deploy"
echo -e "${GREEN}  Migrations appliquees.${NC}"

# ============================================
# 7. Creation du compte administrateur
# ============================================
echo -e "\n${YELLOW}[7/8] Verification du compte administrateur...${NC}"

ADMIN_EXISTS=$(docker compose exec db psql -U cppf_user -d cppf_whatsapp -t -c \
    "SELECT COUNT(*) FROM users WHERE role='ADMIN';" 2>/dev/null | tr -d ' ')

if [ "$ADMIN_EXISTS" = "0" ] || [ -z "$ADMIN_EXISTS" ]; then
    echo "  Aucun administrateur trouve. Creation du compte initial..."

    # Hash bcrypt du mot de passe (10 rounds)
    ADMIN_HASH=$(docker compose run --rm app node -e "
        const bcrypt = require('bcryptjs');
        const hash = bcrypt.hashSync('admin123', 10);
        process.stdout.write(hash);
    ")

    docker compose exec db psql -U cppf_user -d cppf_whatsapp -c \
        "INSERT INTO users (id, email, password, name, role, \"isActive\", \"createdAt\", \"updatedAt\")
         VALUES (gen_random_uuid(), 'admin@cppf.ga', '${ADMIN_HASH}', 'Administrateur CPPF', 'ADMIN', true, NOW(), NOW())
         ON CONFLICT (email) DO NOTHING;"

    echo -e "${GREEN}  Compte admin cree: admin@cppf.ga / admin123${NC}"
    echo -e "${RED}  IMPORTANT: Changez ce mot de passe immediatement apres la premiere connexion !${NC}"
else
    echo -e "${GREEN}  Compte administrateur existant detecte.${NC}"
fi

# ============================================
# 8. Demarrage complet
# ============================================
echo -e "\n${YELLOW}[8/8] Demarrage de tous les services...${NC}"
docker compose up -d
sleep 5

# Verification finale
echo -e "\n${BLUE}============================================${NC}"
echo -e "${BLUE}  Verification des services${NC}"
echo -e "${BLUE}============================================${NC}"

echo ""
SERVICES=("cppf-whatsapp-db" "cppf-whatsapp-app" "cppf-whatsapp-nginx")
ALL_OK=true

for SERVICE in "${SERVICES[@]}"; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$SERVICE" 2>/dev/null || echo "not found")
    if [ "$STATUS" = "running" ]; then
        echo -e "  ${GREEN}[OK]${NC} $SERVICE"
    else
        echo -e "  ${RED}[KO]${NC} $SERVICE (status: $STATUS)"
        ALL_OK=false
    fi
done

echo ""
if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  Installation terminee avec succes !${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "  Interface web:  ${BLUE}https://localhost${NC}"
    echo -e "  API Health:     ${BLUE}https://localhost/api/health${NC}"
    echo -e "  Connexion:      ${BLUE}admin@cppf.ga / admin123${NC}"
    echo ""
    echo -e "  ${YELLOW}Prochaines etapes:${NC}"
    echo "  1. Configurer le DNS pour pointer vers ce serveur"
    echo "  2. Installer un vrai certificat SSL (Let's Encrypt ou interne)"
    echo "  3. Configurer le webhook Meta:"
    echo "     URL: https://votre-domaine/api/webhooks/whatsapp"
    echo "     Token: (valeur de WHATSAPP_VERIFY_TOKEN dans .env)"
    echo "  4. Changer le mot de passe admin"
    echo "  5. Configurer les regles firewall (voir doc securite)"
else
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}  Certains services ne sont pas demarres.${NC}"
    echo -e "${RED}============================================${NC}"
    echo ""
    echo "  Consultez les logs: docker compose logs -f"
fi
