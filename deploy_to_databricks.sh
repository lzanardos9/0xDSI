#!/bin/bash
# Databricks App Deployment Script
# SOC Intelligence Platform Migration Helper

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SOC Intelligence Platform${NC}"
echo -e "${BLUE}Databricks Migration & Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v databricks &> /dev/null; then
    echo -e "${RED}✗ Databricks CLI not found${NC}"
    echo "  Install with: pip install databricks-cli"
    exit 1
fi
echo -e "${GREEN}✓ Databricks CLI installed${NC}"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found${NC}"
    echo "  Install Node.js from: https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✓ npm installed${NC}"

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python installed${NC}"

# Check environment variables
echo ""
echo -e "${YELLOW}Checking environment configuration...${NC}"

if [ -z "$DATABRICKS_HOST" ]; then
    echo -e "${RED}✗ DATABRICKS_HOST not set${NC}"
    echo "  Set with: export DATABRICKS_HOST=your-workspace.cloud.databricks.com"
    exit 1
fi
echo -e "${GREEN}✓ DATABRICKS_HOST: $DATABRICKS_HOST${NC}"

if [ -z "$DATABRICKS_TOKEN" ]; then
    echo -e "${RED}✗ DATABRICKS_TOKEN not set${NC}"
    echo "  Generate a token in Databricks workspace settings"
    exit 1
fi
echo -e "${GREEN}✓ DATABRICKS_TOKEN configured${NC}"

# Select target environment
echo ""
echo -e "${YELLOW}Select deployment target:${NC}"
echo "  1) Development"
echo "  2) Staging"
echo "  3) Production"
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        TARGET="dev"
        echo -e "${BLUE}Deploying to: Development${NC}"
        ;;
    2)
        TARGET="staging"
        echo -e "${BLUE}Deploying to: Staging${NC}"
        ;;
    3)
        TARGET="prod"
        echo -e "${YELLOW}⚠️  Deploying to: PRODUCTION${NC}"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "Deployment cancelled"
            exit 0
        fi
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

# Build frontend
echo ""
echo -e "${YELLOW}Building frontend application...${NC}"
npm install
npm run build
echo -e "${GREEN}✓ Frontend built successfully${NC}"

# Create backend directory structure
echo ""
echo -e "${YELLOW}Preparing backend files...${NC}"
mkdir -p backend
cp spark_streaming_correlation.py backend/
cp requirements.txt backend/

# Create migration notebooks if needed
if [ ! -d "backend/notebooks" ]; then
    mkdir -p backend/notebooks
    echo -e "${BLUE}Created backend/notebooks directory${NC}"
fi

# Validate bundle
echo ""
echo -e "${YELLOW}Validating Databricks bundle...${NC}"
databricks bundle validate --target $TARGET

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Bundle validation failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Bundle validated successfully${NC}"

# Deploy bundle
echo ""
echo -e "${YELLOW}Deploying to Databricks...${NC}"
databricks bundle deploy --target $TARGET

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Deployment successful${NC}"

# Get app URL
echo ""
echo -e "${YELLOW}Retrieving app information...${NC}"
APP_INFO=$(databricks apps list --output json | grep "soc-intelligence-platform-$TARGET")

if [ ! -z "$APP_INFO" ]; then
    echo -e "${GREEN}✓ App deployed successfully${NC}"
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Deployment Complete!${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "Environment: ${GREEN}$TARGET${NC}"
    echo -e "Workspace: ${GREEN}$DATABRICKS_HOST${NC}"
    echo ""
    echo -e "Access your app at:"
    echo -e "${GREEN}https://$DATABRICKS_HOST/apps/soc-intelligence-platform-$TARGET${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Run data migration: python backend/migrate_data.py"
    echo "  2. Create vector search indexes"
    echo "  3. Start streaming jobs"
    echo "  4. Monitor system health"
else
    echo -e "${RED}✗ Could not retrieve app information${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
