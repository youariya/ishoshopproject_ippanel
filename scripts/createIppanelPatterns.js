// اسکریپت یک‌بارمصرف برای ثبت پترن‌های پیامک عملیاتی در ایپی‌پانل، بر اساس config/client.json همین مشتری.
// اجرا: node scripts/createIppanelPatterns.js
// فقط پیامک‌هایی که در config/client.json enabled:true هستند پترن می‌گیرند.
// بعد از اجرا، پترن‌ها با وضعیت «در انتظار بررسی» ثبت می‌شوند و باید توسط تیم ایپی‌پانل تایید شوند.
// پس از تایید (وضعیت «فعال» در پنل)، کد هر پترن را در IPPANEL_PATTERN_WELCOME / _DEBT / _PAYMENT در .env قرار دهید.

require('dotenv').config();
const axios = require('axios');
const clientConfig = require('../config/loadClientConfig');

const IPPANEL_API_KEY = process.env.IPPANEL_API_KEY;
const CREATE_PATTERN_URL = 'https://edge.ippanel.com/v1/api/user/pattern';

const VARIABLE_TYPES = {
    name: 'string',
    amount: 'string',
    remaining_debt: 'string',
    date: 'string'
};

const PATTERN_DEFINITIONS = {
    welcome: { title: 'خوشامدگویی به مشتری جدید', description: 'اطلاع‌رسانی خوشامدگویی به مشتری جدید', envVar: 'IPPANEL_PATTERN_WELCOME' },
    debt: { title: 'ثبت خرید نسیه', description: 'اطلاع‌رسانی ثبت خرید نسیه به مشتری', envVar: 'IPPANEL_PATTERN_DEBT' },
    payment: { title: 'ثبت پرداخت', description: 'اطلاع‌رسانی ثبت پرداخت مشتری', envVar: 'IPPANEL_PATTERN_PAYMENT' }
};

// متن {name}/{signature} داخلی ما را به فرمت %name% مورد نیاز ایپی‌پانل تبدیل می‌کند
// و {signature} را مستقیماً با مقدار واقعی امضای این مشتری جای‌گزین می‌کند (ایپی‌پانل چنین متغیری ندارد)
function toIppanelMessage(template) {
    return template
        .replace(/{signature}/g, clientConfig.smsSignature || '')
        .replace(/{(\w+)}/g, '%$1%');
}

function extractVariables(template) {
    const names = new Set();
    for (const match of template.matchAll(/{(\w+)}/g)) {
        if (match[1] !== 'signature') names.add(match[1]);
    }
    return [...names].map(name => ({ name, type: VARIABLE_TYPES[name] || 'string' }));
}

async function main() {
    if (!IPPANEL_API_KEY) {
        console.error('IPPANEL_API_KEY در .env تنظیم نشده است.');
        process.exit(1);
    }

    for (const [type, def] of Object.entries(PATTERN_DEFINITIONS)) {
        const templateConfig = clientConfig.sms?.[type];
        if (!templateConfig || !templateConfig.enabled) {
            console.log(`- «${def.title}» برای این مشتری غیرفعال است، رد شد.`);
            continue;
        }

        const pattern = {
            title: def.title,
            description: def.description,
            is_share: false,
            message: toIppanelMessage(templateConfig.message),
            variable: extractVariables(templateConfig.message)
        };

        try {
            const response = await axios.post(CREATE_PATTERN_URL, pattern, {
                headers: { Authorization: IPPANEL_API_KEY, 'Content-Type': 'application/json' }
            });
            const data = response.data?.data;
            console.log(`✔ پترن «${def.title}» ثبت شد — کد: ${data?.pattern_code} — وضعیت: ${data?.pattern_status} — بعد از تایید در ${def.envVar} قرار بدهید.`);
        } catch (err) {
            const meta = err.response?.data?.meta;
            console.error(`✘ خطا در ثبت پترن «${def.title}»:`, meta?.message || err.message);
        }
    }

    console.log('\nپس از تایید پترن‌ها توسط ایپی‌پانل (وضعیت "فعال" در پنل)، کدها را در .env قرار دهید.');
}

main();
