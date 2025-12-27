#!/bin/bash

yarn build
rsync -avp frotend/dist/ dominik@static8.int.freshx.de:/data/web/www/freakshow.freshx.de/www/
