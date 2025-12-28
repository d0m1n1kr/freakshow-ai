#!/bin/bash
# Wrapper script to run generate scripts with variant-specific paths
# Usage: ./run-generate.sh <script-name> <input-taxonomy> <output-file>

SCRIPT=$1
INPUT=$2
OUTPUT=$3

if [ -z "$SCRIPT" ] || [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
    echo "Usage: $0 <script-name> <input-taxonomy> <output-file>"
    exit 1
fi

# Run the script with parameters
node "$SCRIPT" --input "$INPUT" --output "$OUTPUT"

