#!/bin/sh
# usage: cook/pair.sh <before-round> <after-round>  → cook/compare/<after>/Sxx.jpg (before left, after right)
mkdir -p cook/compare/$2
for f in cook/stills/$2/S*.png; do n=$(basename $f .png)
  ffmpeg -loglevel error -y -i cook/stills/$1/$n.png -i $f -filter_complex "[0][1]scale2ref=oh*mdar:ih[a][b];[a][b]hstack=inputs=2,pad=iw+0:ih:0:0" -q:v 3 cook/compare/$2/$n.jpg; done
