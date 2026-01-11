#!/bin/bash

cd frontend
export VITE_CDN_BASE_URL="https://d0m1n1kr.github.io/pod-insights"
npm run build
rsync -avp --exclude podcasts dist/ dominik@static8.int.freshx.de:/data2/freakshow.freshx.de/
