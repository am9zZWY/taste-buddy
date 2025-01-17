#!/usr/bin/env sh
#
# Copyright (c) 2024 Josef Müller.
#

# This script is used to publish the PWA to the gh-pages branch

# build the app
bun run build -m pwa

# navigate into the build output directory
cd dist/pwa || exit

# add a CNAME file
echo 'kiwi.jpkmiller.de' > CNAME

# deploy to github pages
git init
git add -A

# change user config
git config user.name "kiwi"
git config user.email ""
git config --local commit.gpgsign false

# deploy
git commit -m 'deploy'
git branch -M master
git remote add origin git@github.com:kiwi-cook/kiwi-cook.github.io.git
git push -u -f origin master

# remove the build directory
cd - || exit
rm -rf dist
