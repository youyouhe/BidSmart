#!/bin/bash
# Render a mermaid file to PNG
# Usage: render.sh <input.mmd> <output.png> [width] [scale]
#
# Args:
#   input.mmd   - Mermaid source file
#   output.png  - Output PNG file path
#   width       - Width in pixels (default: 1200)
#   scale        - Scale factor (default: 2 for high-DPI/print quality)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/mermaid.json"

INPUT="$1"
OUTPUT="$2"
WIDTH="${3:-1200}"
SCALE="${4:-2}"

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
    echo "Usage: render.sh <input.mmd> <output.png> [width] [scale]"
    exit 1
fi

if [ ! -f "$INPUT" ]; then
    echo "Error: Input file not found: $INPUT"
    exit 1
fi

npx --yes @mermaid-js/mermaid-cli \
    -i "$INPUT" \
    -o "$OUTPUT" \
    -c "$CONFIG" \
    -w "$WIDTH" \
    -s "$SCALE" \
    -b transparent \
    2>&1

if [ -f "$OUTPUT" ]; then
    echo "OK: $OUTPUT"
else
    echo "Error: Failed to render $INPUT"
    exit 1
fi
