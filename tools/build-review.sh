#!/bin/sh
# Страница разбора для сайта движка: только нужные файлы (движок, шрифты, фигуры, логотип), без флагов и задач.
set -e
rm -rf public-review && mkdir -p public-review
cp -r public/engine public/fonts public/pieces public-review/
cp public/logo.svg public/logo-dark.svg public/favicon.svg public-review/
npx vite build --config vite.review.config.ts
mv dist-review/review.html dist-review/index.html
