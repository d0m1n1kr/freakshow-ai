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
PODCAST_ID="freakshow"

# Check for --podcast argument
for arg in "$@"; do
    if [[ "$arg" == "--podcast" ]]; then
        PODCAST_INDEX=$(echo "$@" | tr ' ' '\n' | grep -n "^--podcast$" | cut -d: -f1)
        PODCAST_ID=$(echo "$@" | tr ' ' '\n' | sed -n "$((PODCAST_INDEX + 1))p")
        break
    fi
done

if [ -z "$VERSION" ] || [ -z "$VARIANT_NAME" ]; then
    echo -e "${RED}❌ Usage: $0 <v1|v2> <variant-name> [--rebuild-all] [--podcast <id>]${NC}"
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
OUTPUT_DIR="frontend/public/podcasts/$PODCAST_ID/topics/$VARIANT_NAME"
mkdir -p "$OUTPUT_DIR"

echo -e "${GREEN}🎯 Building variant: $VARIANT_DISPLAY_NAME${NC}"
echo -e "${GREEN}   Version: $VERSION${NC}"
echo -e "${GREEN}   Podcast: $PODCAST_ID${NC}"
echo -e "${GREEN}   Output: $OUTPUT_DIR${NC}"
echo ""

# Step 1: Build Rust binary if needed
if [ "$VERSION" == "v1" ]; then
    BINARY="cluster-topics"
else
    BINARY="cluster-topics-v2"
fi

NEED_BUILD=false

if [ ! -f "target/release/$BINARY" ] || [ "$REBUILD_ALL" == "--rebuild-all" ]; then
    NEED_BUILD=true
fi

# Safety check: ensure the binary supports --podcast (multi-podcast scripts rely on it).
# If the compiled binary is stale (older CLI), force a rebuild.
if [ "$NEED_BUILD" = false ]; then
    if ! "./target/release/$BINARY" --help 2>/dev/null | grep -q -- "--podcast"; then
        echo -e "${YELLOW}⚠️  Existing $BINARY does not support --podcast (stale build). Rebuilding...${NC}"
        NEED_BUILD=true
    fi
fi

if [ "$NEED_BUILD" = true ]; then
    echo -e "${BLUE}🔧 Building $BINARY...${NC}"
    cargo build --release --bin "$BINARY"
else
    echo -e "${GREEN}✓ Using existing binary: target/release/$BINARY${NC}"
fi

# Step 2: Run clustering
echo ""
echo -e "${BLUE}🔬 Running clustering ($VERSION)...${NC}"

# Run the binary with --variant and --podcast arguments (reads settings from variants.json)
"./target/release/$BINARY" --variant "$VARIANT_NAME" --podcast "$PODCAST_ID" || {
    echo -e "${RED}Error: Failed to run $BINARY${NC}"
    exit 1
}

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

# Step 3: Generate derived visualizations
echo ""
echo -e "${BLUE}📊 Generating derived data...${NC}"

# Temporarily copy taxonomy files back to root for generate scripts
if [ -f "$OUTPUT_DIR/topic-taxonomy.json" ]; then
    cp "$OUTPUT_DIR/topic-taxonomy.json" .
fi
if [ -f "$OUTPUT_DIR/topic-taxonomy-detailed.json" ]; then
    cp "$OUTPUT_DIR/topic-taxonomy-detailed.json" .
fi

# Topic UMAP
# echo -e "  ${YELLOW}→${NC} Generating topic-umap-data.json..."
#node scripts/generate-topic-umap.js || {
#    echo -e "     ${RED}✗ Failed to generate topic-umap-data.json${NC}"
# }
# if [ -f topic-umap-data.json ]; then
#     mv topic-umap-data.json "$OUTPUT_DIR/"
# else
#    echo "     (skipped - file not generated)"
# fi

# Topic River
echo -e "  ${YELLOW}→${NC} Generating topic-river-data.json..."
TOPIC_RIVER_ARGS=()
if [ -f "$OUTPUT_DIR/topic-taxonomy.json" ]; then
    TOPIC_RIVER_ARGS+=(--taxonomy "$OUTPUT_DIR/topic-taxonomy.json")
fi
if [ -f "$OUTPUT_DIR/topic-taxonomy-detailed.json" ]; then
    TOPIC_RIVER_ARGS+=(--taxonomy-detailed "$OUTPUT_DIR/topic-taxonomy-detailed.json")
fi

node scripts/generate-topic-river.js --podcast "$PODCAST_ID" "${TOPIC_RIVER_ARGS[@]}" || {
    echo -e "     ${RED}✗ Failed to generate topic-river-data.json${NC}"
}
# Script writes into frontend/public/podcasts/<podcast>/ by default
TOPIC_RIVER_OUT="frontend/public/podcasts/$PODCAST_ID/topic-river-data.json"
if [ -f "$TOPIC_RIVER_OUT" ]; then
    mv "$TOPIC_RIVER_OUT" "$OUTPUT_DIR/"
elif [ -f topic-river-data.json ]; then
    mv topic-river-data.json "$OUTPUT_DIR/"
else
    echo "     (skipped - file not generated)"
fi

# Cluster-Cluster Heatmap
echo -e "  ${YELLOW}→${NC} Generating cluster-cluster-heatmap.json..."
TEMP_TAXONOMY_LINK="frontend/public/podcasts/$PODCAST_ID/topic-taxonomy.json"
COPIED_TAXONOMY=false
if [ -f "$OUTPUT_DIR/topic-taxonomy.json" ]; then
    # Some generator scripts expect topic-taxonomy.json in the main podcast dir.
    cp "$OUTPUT_DIR/topic-taxonomy.json" "$TEMP_TAXONOMY_LINK"
    COPIED_TAXONOMY=true
fi

node scripts/generate-cluster-cluster-heatmap.js --podcast "$PODCAST_ID" || {
    echo -e "     ${RED}✗ Failed to generate cluster-cluster-heatmap.json${NC}"
}
if [ "$COPIED_TAXONOMY" = true ]; then
    rm -f "$TEMP_TAXONOMY_LINK"
fi

# Script writes into frontend/public/podcasts/<podcast>/ by default
CLUSTER_CLUSTER_OUT="frontend/public/podcasts/$PODCAST_ID/cluster-cluster-heatmap.json"
if [ -f "$CLUSTER_CLUSTER_OUT" ]; then
    mv "$CLUSTER_CLUSTER_OUT" "$OUTPUT_DIR/"
elif [ -f cluster-cluster-heatmap.json ]; then
    mv cluster-cluster-heatmap.json "$OUTPUT_DIR/"
else
    echo "     (skipped - file not generated)"
fi

# Speaker-Cluster Heatmap
echo -e "  ${YELLOW}→${NC} Generating speaker-cluster-heatmap.json..."
COPIED_TAXONOMY=false
if [ -f "$OUTPUT_DIR/topic-taxonomy.json" ]; then
    cp "$OUTPUT_DIR/topic-taxonomy.json" "$TEMP_TAXONOMY_LINK"
    COPIED_TAXONOMY=true
fi

node scripts/generate-speaker-cluster-heatmap.js --podcast "$PODCAST_ID" || {
    echo -e "     ${RED}✗ Failed to generate speaker-cluster-heatmap.json${NC}"
}
if [ "$COPIED_TAXONOMY" = true ]; then
    rm -f "$TEMP_TAXONOMY_LINK"
fi

SPEAKER_CLUSTER_OUT="frontend/public/podcasts/$PODCAST_ID/speaker-cluster-heatmap.json"
if [ -f "$SPEAKER_CLUSTER_OUT" ]; then
    mv "$SPEAKER_CLUSTER_OUT" "$OUTPUT_DIR/"
elif [ -f speaker-cluster-heatmap.json ]; then
    mv speaker-cluster-heatmap.json "$OUTPUT_DIR/"
else
    echo "     (skipped - file not generated)"
fi

# Cleanup - remove temporary taxonomy files
rm -f topic-taxonomy.json topic-taxonomy-detailed.json

# Cleanup (no longer needed - binaries read directly from variants.json)

# Step 4: Update manifest
echo ""
echo -e "${BLUE}📝 Updating manifest...${NC}"

MANIFEST_FILE="frontend/public/podcasts/$PODCAST_ID/topics/manifest.json"

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
    # Get full variant config including description and settings
    VARIANT_CONFIG=$(jq ".variants[\"$VARIANT_NAME\"]" variants.json)
    VARIANT_DESCRIPTION=$(echo "$VARIANT_CONFIG" | jq -r '.description // ""')
    VARIANT_SETTINGS=$(echo "$VARIANT_CONFIG" | jq '.settings')
    
    echo "$EXISTING_MANIFEST" | jq \
        --arg name "$VARIANT_NAME" \
        --arg displayName "$VARIANT_DISPLAY_NAME" \
        --arg version "$VERSION" \
        --arg timestamp "$TIMESTAMP" \
        --arg description "$VARIANT_DESCRIPTION" \
        --argjson settings "$VARIANT_SETTINGS" \
        '.variants[$name] = {
            "name": $displayName,
            "version": $version,
            "lastBuilt": $timestamp,
            "description": $description,
            "settings": $settings
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

