#!/bin/bash

for podcast in cre das-universum forschergeist freakshow lnp minkorrekt raumzeit ukw wrint-wissenschaft; do 
  echo "Processing $podcast..." && \
  node scripts/create-embeddings.js --podcast "$podcast" && \
  node scripts/create-rag-db.js --podcast "$podcast"; 
done
