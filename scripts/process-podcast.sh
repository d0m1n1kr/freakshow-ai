#!/bin/bash
# Process a complete podcast: scrape, extract, cluster, and generate visualizations
# Usage: ./scripts/process-podcast.sh <podcast-id> [--skip-scraping] [--skip-rag] [--from-step <step>]
#
# Steps:
#   1: Data Collection (scraping + speaker stats)
#   2: Topic Extraction & Analysis
#   3: Subject Analysis
#   4: Clustering
#   5: Generate Visualizations
#   6: Optional Processing
#   7: Organize Frontend Files
#
# Example:
#   ./scripts/process-podcast.sh freakshow
#   ./scripts/process-podcast.sh freakshow --from-step 3  # Start from subject analysis

# Safety: if this script is invoked via zsh/sh (or sourced), re-exec under bash.
# This prevents parse errors like "syntax error near unexpected token `('" in zsh.
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
PODCAST_ID=${1:-freakshow}
SKIP_SCRAPING=false
SKIP_RAG=false
FROM_STEP=0

# Parse positional and named arguments
ARGS=()
for arg in "$@"; do
    case "$arg" in
        --skip-scraping) SKIP_SCRAPING=true ;;
        --skip-rag) SKIP_RAG=true ;;
        --from-step)
            # Will be handled in next iteration
            FROM_STEP_ARG=true
            ;;
        --help|-h)
            echo "Usage: $0 <podcast-id> [options]"
            echo ""
            echo "Options:"
            echo "  --skip-scraping    Skip data collection phase"
            echo "  --skip-rag         Skip RAG database creation"
            echo "  --from-step <n>    Start from step n (1-7)"
            echo ""
    echo "Steps:"
    echo "  1: Data Collection (scraping + speaker stats)"
    echo "  2: Topic Extraction & Analysis"
    echo "  3: Subject Analysis"
    echo "  4: Clustering"
    echo "  5: Generate Visualizations"
    echo "  6: Optional Processing"
    echo "  7: Organize Frontend Files"
            exit 0
            ;;
        *)
            if [ "${FROM_STEP_ARG:-false}" = true ]; then
                FROM_STEP=$arg
                FROM_STEP_ARG=false
            else
                ARGS+=("$arg")
            fi
            ;;
    esac
done

# Validate FROM_STEP
if [ "$FROM_STEP" -lt 0 ] || [ "$FROM_STEP" -gt 7 ]; then
    echo -e "${RED}❌ Invalid --from-step value: $FROM_STEP (must be 0-7)${NC}"
    exit 1
fi

# Helper function to check if a step should run
should_run_step() {
    local step=$1
    [ "$FROM_STEP" -le "$step" ]
}

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}🎙️  Processing Podcast: ${PODCAST_ID}${NC}\n"

# Create all necessary directories upfront
echo -e "${YELLOW}📁 Creating necessary directories...${NC}"
mkdir -p "podcasts/$PODCAST_ID/episodes"
mkdir -p "podcasts/$PODCAST_ID/speakers"
mkdir -p "db"
mkdir -p "frontend/public/podcasts/$PODCAST_ID"
mkdir -p "frontend/public/podcasts/$PODCAST_ID/speakers"
mkdir -p "frontend/public/podcasts/$PODCAST_ID/topics"
echo -e "${GREEN}✓${NC} Directories created\n"

# Helper function to run a script with podcast parameter
run_script() {
    local script=$1
    shift
    echo -e "${YELLOW}→${NC} Running: $script --podcast $PODCAST_ID $@"
    if node "$script" --podcast "$PODCAST_ID" "$@"; then
        echo -e "${GREEN}✓${NC} $script completed\n"
    else
        echo -e "${RED}✗${NC} $script failed\n"
        exit 1
    fi
}

# Helper function to run an optional script (never abort the pipeline)
run_script_optional() {
    local script=$1
    shift
    echo -e "${YELLOW}→${NC} Running (optional): $script --podcast $PODCAST_ID $@"
    if node "$script" --podcast "$PODCAST_ID" "$@"; then
        echo -e "${GREEN}✓${NC} $script completed\n"
    else
        echo -e "${YELLOW}⚠${NC}  $script failed (skipped)\n"
        return 0
    fi
}
# Phase 1: Data Collection
if should_run_step 1 && [ "$SKIP_SCRAPING" = false ]; then
    echo -e "${BLUE}📥 Phase 1: Data Collection${NC}\n"
    
    echo -e "${YELLOW}→${NC} Scraping episode list..."
    run_script "scripts/scrape.js"
    
    echo -e "${YELLOW}→${NC} Scraping episode details (transcripts, shownotes)..."
    run_script "scripts/scrape-details.js" --all
    
    echo -e "${YELLOW}→${NC} Scraping episode cover images..."
    run_script "scripts/scrape-images.js"
    
    echo -e "${YELLOW}→${NC} Scraping speakers..."
    run_script "scripts/scrape-speakers.js"

    echo -e "${YELLOW}→${NC} Generating speaker stats..."
    run_script "scripts/generate-speaker-stats.js"

    echo -e "${YELLOW}→${NC} Scraping chapters..."
    run_script "scripts/scrape-chapters.js" --all
    
    echo -e "${YELLOW}→${NC} Scraping OSF shownotes (episodes 89-190)..."
    run_script "scripts/scrape-osf.js" || echo -e "${YELLOW}⚠${NC}  OSF scraping skipped (may not be needed)\n"
elif [ "$SKIP_SCRAPING" = true ]; then
    echo -e "${YELLOW}⏭${NC}  Skipping scraping phase\n"
elif ! should_run_step 1; then
    echo -e "${YELLOW}⏭${NC}  Skipping Phase 1 (starting from step $FROM_STEP)\n"
fi

# Phase 2: Topic Extraction & Analysis
if should_run_step 2; then
    echo -e "${BLUE}🔬 Phase 2: Topic Extraction & Analysis${NC}\n"

echo -e "${YELLOW}→${NC} Extracting topics with LLM..."
run_script "scripts/extract-topics.js" --all

echo -e "${YELLOW}→${NC} Normalizing topics..."
run_script "scripts/normalize-topics.js"

echo -e "${YELLOW}→${NC} Generating extended topics (for RAG)..."
run_script_optional "scripts/generate-extended-topics.js" --all --use-llm-timestamps

    echo -e "${YELLOW}→${NC} Creating embeddings..."
    run_script "scripts/create-embeddings.js"
else
    echo -e "${YELLOW}⏭${NC}  Skipping Phase 2 (starting from step $FROM_STEP)\n"
fi

# Phase 3: Subject Analysis
if should_run_step 3; then
    echo -e "${BLUE}📚 Phase 3: Subject Analysis${NC}\n"

    echo -e "${YELLOW}→${NC} Generating coarse subjects..."
    run_script "scripts/generate-coarse-subjects.js"

    echo -e "${YELLOW}→${NC} Generating episode subjects data..."
    run_script "scripts/generate-episode-subjects.js" --all

    echo -e "${YELLOW}→${NC} Generating subject river data..."
    run_script "scripts/generate-subject-river.js"
else
    echo -e "${YELLOW}⏭${NC}  Skipping Phase 3 (starting from step $FROM_STEP)\n"
fi

# Phase 4: Clustering
if should_run_step 4; then
    echo -e "${BLUE}🎯 Phase 4: Clustering (V2 auto-v2.1)${NC}\n"

    echo -e "${YELLOW}→${NC} Building clustering variant: auto-v2.1..."
    if ./scripts/build-variant.sh v2 auto-v2.1 --podcast "$PODCAST_ID"; then
        echo -e "${GREEN}✓${NC} Clustering completed\n"
    else
        echo -e "${RED}✗${NC} Clustering failed\n"
        exit 1
    fi
else
    echo -e "${YELLOW}⏭${NC}  Skipping Phase 4 (starting from step $FROM_STEP)\n"
fi

# Phase 5: Generate Visualizations
if should_run_step 5; then
    echo -e "${BLUE}📊 Phase 4: Generate Visualizations${NC}\n"

    echo -e "${YELLOW}→${NC} Analyzing cluster speakers..."
    run_script "scripts/analyze-cluster-speakers.js"

    echo -e "${YELLOW}→${NC} Generating speaker river data..."
    run_script "scripts/generate-speaker-river.js"

    # Note: topic-river, speaker-cluster-heatmap, and cluster-cluster-heatmap
    # are already generated by build-variant.sh in Phase 4 (no need to regenerate)

    echo -e "${YELLOW}→${NC} Generating speaker-speaker heatmap..."
    run_script "scripts/generate-speaker-speaker-heatmap.js"

    echo -e "${YELLOW}→${NC} Generating year-duration heatmap..."
    run_script "scripts/generate-year-duration-heatmap.js"

    echo -e "${YELLOW}→${NC} Generating dayofweek-duration heatmap..."
    run_script "scripts/generate-dayofweek-duration-heatmap.js"

    echo -e "${YELLOW}→${NC} Generating speaker-duration heatmap..."
    run_script "scripts/generate-speaker-duration-heatmap.js"

    # Note: UMAP generation is handled by build-variant.sh, so it should already be in the variant directory
    # But we can regenerate it if needed
    echo -e "${YELLOW}→${NC} Checking topic UMAP data..."
    VARIANT_UMAP="frontend/public/podcasts/$PODCAST_ID/topics/auto-v2.1/topic-umap-data.json"
    if [ ! -f "$VARIANT_UMAP" ]; then
        echo -e "${YELLOW}→${NC} Generating topic UMAP data (from variant taxonomy)..."
        VARIANT_TAXONOMY="frontend/public/podcasts/$PODCAST_ID/topics/auto-v2.1/topic-taxonomy.json"
        if [ -f "$VARIANT_TAXONOMY" ]; then
            # Copy taxonomy to main podcast dir temporarily for UMAP script
            cp "$VARIANT_TAXONOMY" "frontend/public/podcasts/$PODCAST_ID/topic-taxonomy.json"
            run_script "scripts/generate-topic-umap.js"
            rm -f "frontend/public/podcasts/$PODCAST_ID/topic-taxonomy.json"
            # Move UMAP data to variant directory
            if [ -f "frontend/public/podcasts/$PODCAST_ID/topic-umap-data.json" ]; then
                mv "frontend/public/podcasts/$PODCAST_ID/topic-umap-data.json" "$VARIANT_UMAP"
                echo -e "${GREEN}✓${NC} UMAP data moved to variant directory\n"
            fi
        else
            echo -e "${YELLOW}⚠${NC}  Variant taxonomy not found, skipping UMAP\n"
        fi
    else
        echo -e "${GREEN}✓${NC} UMAP data already exists in variant directory\n"
    fi
else
    echo -e "${YELLOW}⏭${NC}  Skipping Phase 4 (starting from step $FROM_STEP)\n"
fi

# Phase 6: Optional Processing
if should_run_step 6; then
    echo -e "${BLUE}⚙️  Phase 5: Optional Processing${NC}\n"

    echo -e "${YELLOW}→${NC} Generating episodes MP3 index..."
    run_script "scripts/generate-episodes-mp3.js" || echo -e "${YELLOW}⚠${NC}  MP3 index generation skipped\n"

    echo -e "${YELLOW}→${NC} Generating speaker profiles..."
    # run_script "scripts/generate-speaker-profiles.js" --all --max-chunks 50 || echo -e "${YELLOW}⚠${NC}  Speaker profiles skipped\n"

    echo -e "${YELLOW}→${NC} Generating TS-live files..."
    node scripts/generate-ts-live.js --podcast "$PODCAST_ID" --all || echo -e "${YELLOW}⚠${NC}  TS-live generation skipped\n"

    if [ "$SKIP_RAG" = false ]; then
        echo -e "${YELLOW}→${NC} Creating RAG database..."
        run_script_optional "scripts/create-rag-db.js"
    fi
else
    echo -e "${YELLOW}⏭${NC}  Skipping Phase 5 (starting from step $FROM_STEP)\n"
fi

# Phase 7: Copy/Move Files to Frontend
if should_run_step 7; then
    echo -e "${BLUE}📦 Phase 7: Organize Frontend Files${NC}\n"

    FRONTEND_PODCAST_DIR="frontend/public/podcasts/$PODCAST_ID"
    mkdir -p "$FRONTEND_PODCAST_DIR"
    mkdir -p "$FRONTEND_PODCAST_DIR/speakers"
    mkdir -p "$FRONTEND_PODCAST_DIR/topics"

    echo -e "${YELLOW}→${NC} Copying visualization data files..."

    # Copy main visualization files
    [ -f "speaker-river-data.json" ] && cp "speaker-river-data.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ speaker-river-data.json"
    [ -f "topic-river-data.json" ] && cp "topic-river-data.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ topic-river-data.json"
    [ -f "cluster-speakers.json" ] && cp "cluster-speakers.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ cluster-speakers.json"
    [ -f "speaker-speaker-heatmap.json" ] && cp "speaker-speaker-heatmap.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ speaker-speaker-heatmap.json"
    [ -f "speaker-cluster-heatmap.json" ] && cp "speaker-cluster-heatmap.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ speaker-cluster-heatmap.json"
    [ -f "cluster-cluster-heatmap.json" ] && cp "cluster-cluster-heatmap.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ cluster-cluster-heatmap.json"
    [ -f "year-duration-heatmap.json" ] && cp "year-duration-heatmap.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ year-duration-heatmap.json"
    [ -f "dayofweek-duration-heatmap.json" ] && cp "dayofweek-duration-heatmap.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ dayofweek-duration-heatmap.json"
    [ -f "speaker-duration-heatmap.json" ] && cp "speaker-duration-heatmap.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ speaker-duration-heatmap.json"
    [ -f "subject-river-data.json" ] && cp "subject-river-data.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ subject-river-data.json"
    [ -f "episodes.json" ] && cp "episodes.json" "$FRONTEND_PODCAST_DIR/" && echo "  ✓ episodes.json"

    # Copy topic files from variant directory (already created by build-variant.sh)
    VARIANT_DIR="$FRONTEND_PODCAST_DIR/topics/auto-v2.1"
    if [ -d "$VARIANT_DIR" ]; then
        echo -e "${GREEN}✓${NC} Topic variant data already in place: $VARIANT_DIR"
    fi

    # Copy speaker files
    PODCAST_SPEAKERS_DIR="podcasts/$PODCAST_ID/speakers"
    if [ -d "$PODCAST_SPEAKERS_DIR" ]; then
        echo -e "${YELLOW}→${NC} Copying speaker files..."
        cp -r "$PODCAST_SPEAKERS_DIR"/* "$FRONTEND_PODCAST_DIR/speakers/" 2>/dev/null || true
        echo -e "${GREEN}✓${NC} Speaker files copied"
    fi

    # Create symlink for episodes
    EPISODES_SYMLINK="$FRONTEND_PODCAST_DIR/episodes"
    PODCAST_EPISODES_DIR="podcasts/$PODCAST_ID/episodes"

    if [ -d "$PODCAST_EPISODES_DIR" ]; then
        if [ -L "$EPISODES_SYMLINK" ]; then
            rm "$EPISODES_SYMLINK"
        fi
        if [ ! -e "$EPISODES_SYMLINK" ]; then
            ln -s "../../../../podcasts/$PODCAST_ID/episodes" "$EPISODES_SYMLINK"
            echo -e "${GREEN}✓${NC} Created episodes symlink: $EPISODES_SYMLINK → $PODCAST_EPISODES_DIR"
        else
            echo -e "${YELLOW}⚠${NC}  Episodes symlink already exists or target exists"
        fi
    fi
else
    echo -e "${YELLOW}⏭${NC}  Skipping Phase 7 (starting from step $FROM_STEP)\n"
fi

# Summary
if [ "$FROM_STEP" -gt 0 ]; then
    echo -e "\n${GREEN}✅ Podcast processing completed (resumed from step $FROM_STEP)!${NC}\n"
else
    echo -e "\n${GREEN}✅ Podcast processing completed!${NC}\n"
fi
echo -e "📁 Data location:"
echo -e "   Backend: podcasts/$PODCAST_ID/"
echo -e "   Frontend: frontend/public/podcasts/$PODCAST_ID/"
echo -e "\n🎯 Next steps:"
echo -e "   1. Start frontend: cd frontend && npm run dev"
echo -e "   2. Select podcast '$PODCAST_ID' in the dropdown"
echo -e "   3. View visualizations at http://localhost:5173"

