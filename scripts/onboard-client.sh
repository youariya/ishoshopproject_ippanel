#!/usr/bin/env bash
# اسکریپت آنبوردینگ مشتری جدید — این را روی خود سرور (نه در محیط توسعه) اجرا کنید.
#
# دو حالت اجرا:
#   ۱) غیرتعاملی (پیشنهادی): bash scripts/onboard-client.sh path/to/answers.env
#      همه‌ی مقادیر از یک فایل خوانده می‌شوند؛ هیچ سوالی پرسیده نمی‌شود، nano لازم نیست.
#      قالب فایل: scripts/client-answers.example.env
#   ۲) تعاملی (اگر بدون آرگومان اجرا شود): سوال‌به‌سوال می‌پرسد.
#
# در هر دو حالت: کلون کدبیس مشترک، نصب پکیج‌ها، ساخت .env و config/client.json،
# راه‌اندازی با PM2، و یک نمونه تنظیمات Nginx برای بازبینی دستی می‌سازد.
# خودش هیچ‌وقت nginx را reload یا certbot را اجرا نمی‌کند — چون این‌ها روی
# زیرساخت مشترک بین همه‌ی مشتری‌ها اثر می‌گذارند و باید دستی بازبینی و اجرا شوند.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/youariya/ishoshopproject_ippanel.git}"
APPS_ROOT="${APPS_ROOT:-/opt/apps}"
ANSWERS_FILE="${1:-}"

if [ -n "$ANSWERS_FILE" ]; then
    if [ ! -f "$ANSWERS_FILE" ]; then
        echo "خطا: فایل جواب‌ها پیدا نشد: $ANSWERS_FILE" >&2
        exit 1
    fi
    echo "== خواندن اطلاعات از $ANSWERS_FILE (بدون سوال تعاملی) =="
    set -a
    # shellcheck disable=SC1090
    source "$ANSWERS_FILE"
    set +a

    for required in CLIENT_SLUG CLIENT_PORT BUSINESS_NAME SMS_SIGNATURE SMS_PROVIDER; do
        if [ -z "${!required:-}" ]; then
            echo "خطا: مقدار $required در فایل جواب‌ها خالی است." >&2
            exit 1
        fi
    done
    CLIENT_DOMAIN="${CLIENT_DOMAIN:-}"
else
    echo "== اطلاعات مشتری جدید (حالت تعاملی — برای غیرتعاملی: bash $0 answers.env) =="
    read -rp "اسم کوتاه/یکتای مشتری (فقط حروف لاتین/عدد/خط‌تیره، مثل mehr-poshak): " CLIENT_SLUG
    read -rp "پورت داخلی این مشتری (باید با هیچ مشتری دیگری تکراری نباشد، مثلا 3001): " CLIENT_PORT
    read -rp "دامنه‌ی این مشتری (مثلا shop.example.com) — اختیاری، Enter برای رد شدن: " CLIENT_DOMAIN
    read -rp "نام کسب‌وکار (در داشبورد نمایش داده می‌شود): " BUSINESS_NAME
    read -rp "امضای پیامک (انتهای پیامک‌های عملیاتی و گروهی): " SMS_SIGNATURE
    read -rp "سرویس پیامک؟ kavenegar یا ippanel: " SMS_PROVIDER
fi

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
SESSION_SECRET_VALUE="${SESSION_SECRET:-}"
if [ -z "$SESSION_SECRET_VALUE" ]; then
    SESSION_SECRET_VALUE="$(openssl rand -hex 32)"
fi
cat > .env <<ENVEOF
PORT=${CLIENT_PORT}
SESSION_SECRET=${SESSION_SECRET_VALUE}
SMS_PROVIDER=${SMS_PROVIDER}
KAVEHNEGAR_API_KEY=${KAVEHNEGAR_API_KEY:-}
KAVENEGAR_SENDER_LINE=${KAVENEGAR_SENDER_LINE:-}
IPPANEL_API_KEY=${IPPANEL_API_KEY:-}
IPPANEL_SENDER_NUMBER=${IPPANEL_SENDER_NUMBER:-}
IPPANEL_PATTERN_WELCOME=${IPPANEL_PATTERN_WELCOME:-}
IPPANEL_PATTERN_DEBT=${IPPANEL_PATTERN_DEBT:-}
IPPANEL_PATTERN_PAYMENT=${IPPANEL_PATTERN_PAYMENT:-}
ADMIN_PHONE_NUMBER=${ADMIN_PHONE_NUMBER:-}
APPSCRIPT_URL=${APPSCRIPT_URL:-}
DEFAULT_TEMP_PASSWORD=${DEFAULT_TEMP_PASSWORD:-}
ENVEOF

echo ""
echo "== ساخت config/client.json برای این مشتری =="

# در فایل جواب‌ها هر پیام باید یک خط باشد و بین خط‌ها از \n استفاده شود (نه اینتر واقعی)
# چون فایل جواب‌ها با bash source می‌شود؛ اینجا \n را به خط جدید واقعی تبدیل می‌کنیم.
SMS_WELCOME_ENABLED="${SMS_WELCOME_ENABLED:-true}"
SMS_WELCOME_MESSAGE="${SMS_WELCOME_MESSAGE:-}"
if [ -z "$SMS_WELCOME_MESSAGE" ]; then
    SMS_WELCOME_MESSAGE='{name} گرامی\nخوش‌آمدید\n{signature}'
fi
SMS_WELCOME_MESSAGE="${SMS_WELCOME_MESSAGE//\\n/$'\n'}"

SMS_DEBT_ENABLED="${SMS_DEBT_ENABLED:-true}"
SMS_DEBT_MESSAGE="${SMS_DEBT_MESSAGE:-}"
if [ -z "$SMS_DEBT_MESSAGE" ]; then
    SMS_DEBT_MESSAGE='{name} گرامی خرید شما به مبلغ {amount} تومان ثبت شد. مبلغ باقی مانده از کل حساب شما {remaining_debt} تومان می باشد.\n{signature}'
fi
SMS_DEBT_MESSAGE="${SMS_DEBT_MESSAGE//\\n/$'\n'}"

SMS_PAYMENT_ENABLED="${SMS_PAYMENT_ENABLED:-true}"
SMS_PAYMENT_MESSAGE="${SMS_PAYMENT_MESSAGE:-}"
if [ -z "$SMS_PAYMENT_MESSAGE" ]; then
    SMS_PAYMENT_MESSAGE='{name} گرامی پرداخت وجه در تاریخ {date} با موفقیت ثبت شد. مبلغ پرداخت شده: {amount} تومان مبلغ باقی مانده: {remaining_debt} تومان\n{signature}'
fi
SMS_PAYMENT_MESSAGE="${SMS_PAYMENT_MESSAGE//\\n/$'\n'}"

BUSINESS_NAME="$BUSINESS_NAME" \
SMS_SIGNATURE="$SMS_SIGNATURE" \
SMS_WELCOME_ENABLED="$SMS_WELCOME_ENABLED" SMS_WELCOME_MESSAGE="$SMS_WELCOME_MESSAGE" \
SMS_DEBT_ENABLED="$SMS_DEBT_ENABLED" SMS_DEBT_MESSAGE="$SMS_DEBT_MESSAGE" \
SMS_PAYMENT_ENABLED="$SMS_PAYMENT_ENABLED" SMS_PAYMENT_MESSAGE="$SMS_PAYMENT_MESSAGE" \
node -e "
const fs = require('fs');
fs.writeFileSync('config/client.json', JSON.stringify({
  businessName: process.env.BUSINESS_NAME,
  smsSignature: process.env.SMS_SIGNATURE,
  sms: {
    welcome: { enabled: process.env.SMS_WELCOME_ENABLED === 'true', message: process.env.SMS_WELCOME_MESSAGE },
    debt: { enabled: process.env.SMS_DEBT_ENABLED === 'true', message: process.env.SMS_DEBT_MESSAGE },
    payment: { enabled: process.env.SMS_PAYMENT_ENABLED === 'true', message: process.env.SMS_PAYMENT_MESSAGE }
  }
}, null, 2));
"

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
echo "  [ ] اگر APPSCRIPT_URL یا کلید سرویس پیامک را در فایل جواب‌ها خالی گذاشتید، آن‌ها را در"
echo "      $TARGET_DIR/.env تکمیل کنید و بزنید: pm2 restart $CLIENT_SLUG"
echo "  [ ] اگر SMS_PROVIDER=ippanel است: بعد از پر کردن IPPANEL_API_KEY، از داخل $TARGET_DIR اجرا کنید: npm run create-ippanel-patterns"
echo "  [ ] پترن‌ها را در پنل ایپی‌پانل تایید کنید و کدشان را در .env بگذارید، سپس: pm2 restart $CLIENT_SLUG"
echo "  [ ] اگر دامنه دادید: DNS دامنه را به آی‌پی این سرور اشاره بدهید، بعد مراحل Nginx/SSL بالا را دستی اجرا کنید"
