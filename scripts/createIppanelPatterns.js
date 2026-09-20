// اسکریپت یک‌بارمصرف برای ثبت پترن‌های پیامک عملیاتی در ایپی‌پانل.
// اجرا: node scripts/createIppanelPatterns.js
// بعد از اجرا، پترن‌ها با وضعیت «در انتظار بررسی» ثبت می‌شوند و باید توسط تیم ایپی‌پانل تایید شوند.
// پس از تایید (وضعیت «فعال» در پنل)، کد هر پترن را در IPPANEL_PATTERN_DEBT و IPPANEL_PATTERN_PAYMENT در .env قرار دهید.

require('dotenv').config();
const axios = require('axios');

const IPPANEL_API_KEY = process.env.IPPANEL_API_KEY;
const CREATE_PATTERN_URL = 'https://edge.ippanel.com/v1/api/user/pattern';

const patterns = [
    {
        title: 'ثبت خرید نسیه',
        description: 'اطلاع‌رسانی ثبت خرید نسیه به مشتری',
        is_share: false,
        message: '%name% گرامی خرید شما به مبلغ %amount% تومان ثبت شد. مبلغ باقی مانده از کل حساب شما %remaining_debt% تومان می باشد.\n👗پوشاک مهر ؛ ۲۷سال همراهی باسلیقه بانوان شهرم🛍',
        variable: [
            { name: 'name', type: 'string' },
            { name: 'amount', type: 'string' },
            { name: 'remaining_debt', type: 'string' }
        ]
    },
    {
        title: 'ثبت پرداخت',
        description: 'اطلاع‌رسانی ثبت پرداخت مشتری',
        is_share: false,
        message: '%name% گرامی پرداخت وجه در تاریخ %date% با موفقیت ثبت شد. مبلغ پرداخت شده: %amount% تومان مبلغ باقی مانده: %remaining_debt% تومان\n👗پوشاک مهر ؛ ۲۷سال همراهی باسلیقه بانوان شهرم🛍',
        variable: [
            { name: 'name', type: 'string' },
            { name: 'date', type: 'string' },
            { name: 'amount', type: 'string' },
            { name: 'remaining_debt', type: 'string' }
        ]
    }
];

async function main() {
    if (!IPPANEL_API_KEY) {
        console.error('IPPANEL_API_KEY در .env تنظیم نشده است.');
        process.exit(1);
    }

    for (const pattern of patterns) {
        try {
            const response = await axios.post(CREATE_PATTERN_URL, pattern, {
                headers: { Authorization: IPPANEL_API_KEY, 'Content-Type': 'application/json' }
            });
            const data = response.data?.data;
            console.log(`✔ پترن «${pattern.title}» ثبت شد — کد: ${data?.pattern_code} — وضعیت: ${data?.pattern_status}`);
        } catch (err) {
            const meta = err.response?.data?.meta;
            console.error(`✘ خطا در ثبت پترن «${pattern.title}»:`, meta?.message || err.message);
        }
    }

    console.log('\nپس از تایید پترن‌ها توسط ایپی‌پانل (وضعیت "فعال" در پنل)، کدها را در .env قرار دهید: IPPANEL_PATTERN_DEBT و IPPANEL_PATTERN_PAYMENT');
}

main();
