#!/bin/bash

cd frontend
npm run build
rsync -avp dist/ dominik@static8.int.freshx.de:/data/web/www/freakshow.freshx.de/www/
