#!/usr/bin/env bash
# اسکریپت آنبوردینگ مشتری جدید — این را روی خود سرور (نه در محیط توسعه) اجرا کنید.
# کاری که می‌کند: کلون کدبیس مشترک در پوشه‌ی جدا، نصب پکیج‌ها، ساخت .env و
# config/client.json مخصوص این مشتری، راه‌اندازی با PM2 روی پورت جدا،
# و ساخت یک نمونه‌ی تنظیمات Nginx برای بازبینی دستی.
#
# هیچ‌جا خودش nginx را reload یا certbot را اجرا نمی‌کند — چون این‌ها روی
# زیرساخت مشترک بین همه‌ی مشتری‌ها اثر می‌گذارند و باید دستی بازبینی و اجرا شوند.
#
# اجرا: bash scripts/onboard-client.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/youariya/ishoshopproject_ippanel.git}"
APPS_ROOT="${APPS_ROOT:-/opt/apps}"

echo "== اطلاعات مشتری جدید =="
read -rp "اسم کوتاه/یکتای مشتری (فقط حروف لاتین/عدد/خط‌تیره، مثل mehr-poshak): " CLIENT_SLUG
read -rp "پورت داخلی این مشتری (باید با هیچ مشتری دیگری تکراری نباشد، مثلا 3001): " CLIENT_PORT
read -rp "دامنه‌ی این مشتری (مثلا shop.example.com) — اختیاری، Enter برای رد شدن: " CLIENT_DOMAIN
read -rp "نام کسب‌وکار (در داشبورد نمایش داده می‌شود): " BUSINESS_NAME
read -rp "امضای پیامک (انتهای پیامک‌های عملیاتی و گروهی): " SMS_SIGNATURE
read -rp "سرویس پیامک؟ kavenegar یا ippanel: " SMS_PROVIDER

if [[ ! "$CLIENT_SLUG" =~ ^[a-z0-9-]+$ ]]; then
    echo "خطا: اسم مشتری فقط باید شامل حروف کوچک لاتین، عدد و خط‌تیره باشد." >&2
    exit 1
fi

TARGET_DIR="$APPS_ROOT/$CLIENT_SLUG"
if [ -d "$TARGET_DIR" ]; then
    echo "خطا: پوشه‌ی $TARGET_DIR از قبل وجود دارد؛ اسم دیگری انتخاب کنید یا خودتان بررسی کنید." >&2
    exit 1
fi

echo ""
echo "== کلون کردن کدبیس مشترک در $TARGET_DIR =="
mkdir -p "$APPS_ROOT"
git clone --depth 1 "$REPO_URL" "$TARGET_DIR"
cd "$TARGET_DIR"

echo ""
echo "== نصب پکیج‌ها (yarn) =="
yarn install --production --silent

echo ""
echo "== ساخت .env برای این مشتری =="
cp .env.example .env
SESSION_SECRET_VALUE="$(openssl rand -hex 32)"
sed -i "s|^PORT=.*|PORT=$CLIENT_PORT|" .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET_VALUE|" .env
sed -i "s|^SMS_PROVIDER=.*|SMS_PROVIDER=$SMS_PROVIDER|" .env

echo ""
echo "== ساخت config/client.json برای این مشتری =="
node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('config/client.example.json', 'utf8'));
cfg.businessName = process.argv[1];
cfg.smsSignature = process.argv[2];
fs.writeFileSync('config/client.json', JSON.stringify(cfg, null, 2));
" "$BUSINESS_NAME" "$SMS_SIGNATURE"

echo ""
echo "⚠️  قبل از ادامه، این دو فایل را دستی تکمیل کنید:"
echo "   1) $TARGET_DIR/.env"
echo "      - کلید API سرویس پیامک ($SMS_PROVIDER)، ADMIN_PHONE_NUMBER، APPSCRIPT_URL (گوگل شیت مخصوص همین مشتری)"
echo "   2) $TARGET_DIR/config/client.json"
echo "      - متن دقیق و enabled/disabled هرکدام از پیامک‌های خوشامدگویی/بدهی/پرداخت برای این مشتری"
read -rp "بعد از تکمیل این دو فایل، Enter بزنید تا ادامه پیدا کند... "

echo ""
echo "== راه‌اندازی با PM2 =="
pm2 start index.js --name "$CLIENT_SLUG" --cwd "$TARGET_DIR"
pm2 save

if [ -n "$CLIENT_DOMAIN" ]; then
    NGINX_CONF="/tmp/${CLIENT_SLUG}.nginx.conf"
    cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $CLIENT_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$CLIENT_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    echo ""
    echo "== نمونه‌ی تنظیمات Nginx در $NGINX_CONF ساخته شد (فقط پیشنهاد — خودتان اعمال کنید) =="
    echo "   sudo cp $NGINX_CONF /etc/nginx/sites-available/$CLIENT_SLUG"
    echo "   sudo ln -s /etc/nginx/sites-available/$CLIENT_SLUG /etc/nginx/sites-enabled/"
    echo "   sudo nginx -t && sudo systemctl reload nginx"
    echo "   sudo certbot --nginx -d $CLIENT_DOMAIN   # برای SSL"
fi

echo ""
echo "✅ مشتری «$CLIENT_SLUG» روی پورت $CLIENT_PORT با PM2 اجرا شد."
echo ""
echo "چک‌لیست باقی‌مانده:"
echo "  [ ] مقادیر واقعی .env (کلید API پیامک، APPSCRIPT_URL، ADMIN_PHONE_NUMBER) را بررسی کنید"
echo "  [ ] اگر SMS_PROVIDER=ippanel است: بعد از پر کردن IPPANEL_API_KEY، از داخل $TARGET_DIR اجرا کنید: npm run create-ippanel-patterns"
echo "  [ ] پترن‌ها را در پنل ایپی‌پانل تایید کنید و کدشان را در .env بگذارید، سپس: pm2 restart $CLIENT_SLUG"
echo "  [ ] اگر دامنه دادید: DNS دامنه را به آی‌پی این سرور اشاره بدهید، بعد مراحل Nginx/SSL بالا را دستی اجرا کنید"
