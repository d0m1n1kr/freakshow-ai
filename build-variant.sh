#!/bin/bash
# Build Topic Clustering Variant
# Usage: ./build-variant.sh <v1|v2> <variant-name> [--rebuild-all]
#
# Examples:
#   ./build-variant.sh v1 default-v1
#   ./build-variant.sh v2 auto-v2
#   ./build-variant.sh v2 fine-v2 --rebuild-all

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
VERSION=$1
VARIANT_NAME=$2
REBUILD_ALL=${3:-""}

if [ -z "$VERSION" ] || [ -z "$VARIANT_NAME" ]; then
    echo -e "${RED}❌ Usage: $0 <v1|v2> <variant-name> [--rebuild-all]${NC}"
    echo ""
    echo "Available variants in variants.json:"
    if command -v jq &> /dev/null; then
        jq -r '.variants | keys[]' variants.json | sed 's/^/  - /'
    else
        cat variants.json | grep '"' | grep ':' | cut -d'"' -f2 | sed 's/^/  - /'
    fi
    exit 1
fi

if [ "$VERSION" != "v1" ] && [ "$VERSION" != "v2" ]; then
    echo -e "${RED}❌ Version must be 'v1' or 'v2'${NC}"
    exit 1
fi

# Check if variant exists in variants.json
if ! grep -q "\"$VARIANT_NAME\"" variants.json; then
    echo -e "${RED}❌ Variant '$VARIANT_NAME' not found in variants.json${NC}"
    exit 1
fi

# Extract variant configuration
echo -e "${BLUE}📋 Lade Varianten-Konfiguration...${NC}"
if command -v jq &> /dev/null; then
    VARIANT_CONFIG=$(jq ".variants[\"$VARIANT_NAME\"]" variants.json)
    VARIANT_VERSION=$(echo "$VARIANT_CONFIG" | jq -r '.version')
    VARIANT_DISPLAY_NAME=$(echo "$VARIANT_CONFIG" | jq -r '.name')
    
    if [ "$VARIANT_VERSION" != "$VERSION" ]; then
        echo -e "${YELLOW}⚠️  Warning: Variant '$VARIANT_NAME' is configured for $VARIANT_VERSION, but you specified $VERSION${NC}"
        echo -e "${YELLOW}   Continuing anyway...${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  jq not installed, skipping config validation${NC}"
    VARIANT_DISPLAY_NAME=$VARIANT_NAME
fi

# Create output directory
OUTPUT_DIR="frontend/public/topics/$VARIANT_NAME"
mkdir -p "$OUTPUT_DIR"

echo -e "${GREEN}🎯 Building variant: $VARIANT_DISPLAY_NAME${NC}"
echo -e "${GREEN}   Version: $VERSION${NC}"
echo -e "${GREEN}   Output: $OUTPUT_DIR${NC}"
echo ""

# Create temporary settings file for this variant
TEMP_SETTINGS="settings.variant.$VARIANT_NAME.json"
echo -e "${BLUE}⚙️  Erstelle temporäre Settings...${NC}"

if command -v jq &> /dev/null; then
    # Merge base settings with variant settings
    jq --argjson variantSettings "$(jq ".variants[\"$VARIANT_NAME\"].settings" variants.json)" \
       '.topicClustering = (.topicClustering + $variantSettings)' \
       settings.json > "$TEMP_SETTINGS"
else
    # Fallback: just copy settings.json
    cp settings.json "$TEMP_SETTINGS"
fi

# Step 1: Build Rust binary if needed
if [ "$VERSION" == "v1" ]; then
    BINARY="cluster-topics"
else
    BINARY="cluster-topics-v2"
fi

if [ ! -f "target/release/$BINARY" ] || [ "$REBUILD_ALL" == "--rebuild-all" ]; then
    echo -e "${BLUE}🔧 Building $BINARY...${NC}"
    cargo build --release --bin "$BINARY"
else
    echo -e "${GREEN}✓ Using existing binary: target/release/$BINARY${NC}"
fi

# Step 2: Run clustering
echo ""
echo -e "${BLUE}🔬 Running clustering ($VERSION)...${NC}"

# Export settings file location for Rust binary
export SETTINGS_FILE="$TEMP_SETTINGS"
export OUTPUT_DIR_VAR="$OUTPUT_DIR"

# Run the binary with output redirection
"./target/release/$BINARY" --output-dir "$OUTPUT_DIR" --settings "$TEMP_SETTINGS" 2>/dev/null || {
    # Fallback: run without args and move files manually
    echo -e "${YELLOW}   Note: Binary doesn't support --output-dir yet, using fallback${NC}"
    "./target/release/$BINARY"
    
    # Move generated files to variant directory
    echo -e "${BLUE}📦 Moving clustering files to $OUTPUT_DIR...${NC}"
    if [ -f topic-taxonomy.json ]; then
        mv topic-taxonomy.json "$OUTPUT_DIR/"
        echo "   ✓ topic-taxonomy.json"
    fi
    if [ -f topic-taxonomy-detailed.json ]; then
        mv topic-taxonomy-detailed.json "$OUTPUT_DIR/"
        echo "   ✓ topic-taxonomy-detailed.json"
    fi
}

# Step 3: Generate derived visualizations
echo ""
echo -e "${BLUE}📊 Generating derived data...${NC}"

# Topic UMAP
echo -e "  ${YELLOW}→${NC} Generating topic-umap-data.json..."
node generate-topic-umap.js 2>/dev/null || true
if [ -f topic-umap-data.json ]; then
    mv topic-umap-data.json "$OUTPUT_DIR/"
else
    echo "     (skipped - file not generated)"
fi

# Topic River
echo -e "  ${YELLOW}→${NC} Generating topic-river-data.json..."
node generate-topic-river.js 2>/dev/null || true
if [ -f topic-river-data.json ]; then
    mv topic-river-data.json "$OUTPUT_DIR/"
else
    echo "     (skipped - file not generated)"
fi

# Cluster-Cluster Heatmap
echo -e "  ${YELLOW}→${NC} Generating cluster-cluster-heatmap.json..."
node generate-cluster-cluster-heatmap.js 2>/dev/null || true
if [ -f cluster-cluster-heatmap.json ]; then
    mv cluster-cluster-heatmap.json "$OUTPUT_DIR/"
else
    echo "     (skipped - file not generated)"
fi

# Speaker-Cluster Heatmap
echo -e "  ${YELLOW}→${NC} Generating speaker-cluster-heatmap.json..."
node generate-speaker-cluster-heatmap.js 2>/dev/null || true
if [ -f speaker-cluster-heatmap.json ]; then
    mv speaker-cluster-heatmap.json "$OUTPUT_DIR/"
else
    echo "     (skipped - file not generated)"
fi

# Cleanup temporary settings
rm -f "$TEMP_SETTINGS"

# Step 4: Update manifest
echo ""
echo -e "${BLUE}📝 Updating manifest...${NC}"

MANIFEST_FILE="frontend/public/topics/manifest.json"

# Create or update manifest
if command -v jq &> /dev/null; then
    # Create manifest with metadata
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Get existing manifest or create new
    if [ -f "$MANIFEST_FILE" ]; then
        EXISTING_MANIFEST=$(cat "$MANIFEST_FILE")
    else
        EXISTING_MANIFEST='{"variants":{},"defaultVariant":"default-v1","lastUpdated":""}'
    fi
    
    # Add this variant to manifest
    echo "$EXISTING_MANIFEST" | jq \
        --arg name "$VARIANT_NAME" \
        --arg displayName "$VARIANT_DISPLAY_NAME" \
        --arg version "$VERSION" \
        --arg timestamp "$TIMESTAMP" \
        '.variants[$name] = {
            "name": $displayName,
            "version": $version,
            "lastBuilt": $timestamp
        } | .lastUpdated = $timestamp' > "$MANIFEST_FILE"
    
    echo -e "${GREEN}✓ Updated manifest${NC}"
else
    # Simple fallback without jq
    echo "{\"variants\":[\"$VARIANT_NAME\"],\"defaultVariant\":\"default-v1\"}" > "$MANIFEST_FILE"
fi

# Step 5: Summary
echo ""
echo -e "${GREEN}✅ Variant '$VARIANT_NAME' successfully built!${NC}"
echo ""
echo "📁 Generated files in $OUTPUT_DIR:"
ls -lh "$OUTPUT_DIR" | tail -n +2 | awk '{print "   " $9 " (" $5 ")"}'

echo ""
echo -e "${BLUE}💡 Next steps:${NC}"
echo "   1. Start frontend: cd frontend && npm run dev"
echo "   2. Select variant '$VARIANT_NAME' in dropdown"
echo ""
echo -e "${YELLOW}📋 Build other variants:${NC}"
if command -v jq &> /dev/null; then
    jq -r '.variants | keys[] | "   ./build-variant.sh \(. | split("-")[1] // "v1") \(.)"' variants.json | grep -v "$VARIANT_NAME" | head -3
fi

