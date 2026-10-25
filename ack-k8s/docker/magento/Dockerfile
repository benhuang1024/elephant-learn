# syntax=docker/dockerfile:1
#
# Magento 2.4.8-p5 镜像：一次构建，产出两个镜像
#   --target php  → php-fpm：跑 PHP 代码、bin/magento、cron
#   --target web  → nginx：只带 pub/ 下的文件（静态资源 + PHP 入口文件名）
# 两个镜像必须来自同一次构建、打同一个 tag，否则 nginx 里的静态文件和 PHP 渲染出来的页面可能对不上。
#
# 构建前先完成 14 章第 1 步（本地引导），把 composer.json、composer.lock、app/etc/config.php 放进 project/。
#
#   docker buildx build --platform linux/amd64 --target php -t $REGISTRY/magento-php:1.0.0 --push .
#   docker buildx build --platform linux/amd64 --target web -t $REGISTRY/magento-web:1.0.0 --push .

ARG PHP_VERSION=8.4

# ---------- 公共底座：PHP 扩展 + composer ----------
FROM php:${PHP_VERSION}-fpm AS php-base
COPY --from=mlocati/php-extension-installer:2 /usr/bin/install-php-extensions /usr/local/bin/
# Magento 2.4.8 的 composer 依赖要求、而官方 php 8.4 镜像没有自带的扩展（包括 ext-ftp）
RUN install-php-extensions bcmath ftp gd intl opcache pdo_mysql soap sockets xsl zip
COPY --from=composer:2.10 /usr/bin/composer /usr/local/bin/composer
COPY php/zz-magento.ini /usr/local/etc/php/conf.d/zz-magento.ini
COPY php/zz-fpm.conf /usr/local/etc/php-fpm.d/zz-magento.conf
ENV COMPOSER_ALLOW_SUPERUSER=1
WORKDIR /var/www/html

# ---------- 构建：装依赖、编译 DI、生成静态文件（不需要数据库） ----------
FROM php-base AS build
COPY project/composer.json project/composer.lock ./
# 用官方源 repo.magento.com 时，通过 BuildKit secret 传入 auth.json，密钥不会留在镜像层里：
#   docker buildx build --secret id=composer_auth,src=$HOME/.composer/auth.json ...
RUN --mount=type=cache,target=/root/.composer/cache \
    --mount=type=secret,id=composer_auth,target=/root/.composer/auth.json,required=false \
    composer install --no-dev --no-interaction --no-progress --prefer-dist
# config.php 里带着模块列表和 scopes/themes，有了它，di:compile 和静态文件部署都不用连数据库
COPY project/app/etc/config.php app/etc/config.php
RUN php -d memory_limit=-1 bin/magento setup:di:compile \
 && composer dump-autoload --no-dev --optimize \
 && php -d memory_limit=-1 bin/magento setup:static-content:deploy -f --jobs=4 en_US \
 && rm -rf var/cache var/page_cache var/view_preprocessed

# ---------- 运行镜像 1：php-fpm ----------
FROM php-base AS php
COPY --from=build --chown=www-data:www-data /var/www/html /var/www/html
USER www-data
EXPOSE 9000
CMD ["php-fpm"]

# ---------- 运行镜像 2：nginx ----------
FROM nginx:1.30-alpine AS web
COPY --from=build /var/www/html/pub /var/www/html/pub
COPY --from=build /var/www/html/nginx.conf.sample /etc/nginx/magento.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
