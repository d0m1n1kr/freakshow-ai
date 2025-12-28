#!/bin/bash
# Build and run the V2 topic clustering (HDBSCAN + dimensionality reduction)

set -e

echo "🔧 Building cluster-topics-v2..."
cargo build --release --bin cluster-topics-v2

echo ""
echo "🚀 Running cluster-topics-v2..."
./target/release/cluster-topics-v2

echo ""
echo "✅ Done!"

