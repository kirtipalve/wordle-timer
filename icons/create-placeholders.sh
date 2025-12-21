#!/bin/bash
# Create placeholder PNG icons using ImageMagick
# Run: chmod +x create-placeholders.sh && ./create-placeholders.sh
# Requires: ImageMagick (brew install imagemagick)

cd "$(dirname "$0")"

# Create a simple green circle with timer design
for size in 16 48 128; do
  convert -size ${size}x${size} xc:none \
    -fill '#538d4e' -draw "circle $((size/2)),$((size/2)) $((size/2)),0" \
    -fill none -stroke white -strokewidth $((size/12)) \
    -draw "circle $((size/2)),$((size/2)) $((size/2)),$((size/4))" \
    -stroke white -strokewidth $((size/16)) \
    -draw "line $((size/2)),$((size/2)) $((size/2)),$((size/4))" \
    -draw "line $((size/2)),$((size/2)) $((size*2/3)),$((size/3))" \
    icon${size}.png
  echo "Created icon${size}.png"
done

echo "Done! Icons created."
