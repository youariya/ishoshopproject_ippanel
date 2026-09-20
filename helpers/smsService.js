require('dotenv').config();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { formatToJalali, addCommas, getIranTime } = require('./utils');
const fs = require('fs');
const path = require('path');

const APPSCRIPT_URL = process.env.APPSCRIPT_URL;
const smsTemplates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'smsTemplates.json'), 'utf8'));

// انتخاب سرویس‌دهنده پیامک از طریق .env — مقادیر مجاز: kavenegar | ippanel
const SMS_PROVIDER = (process.env.SMS_PROVIDER || 'kavenegar').toLowerCase();

const KAVEHNEGAR_API_KEY = process.env.KAVEHNEGAR_API_KEY;
const KAVEHNEGAR_SENDER_LINE = process.env.KAVENEGAR_SENDER_LINE;

const IPPANEL_API_KEY = process.env.IPPANEL_API_KEY;
const IPPANEL_SENDER_NUMBER = process.env.IPPANEL_SENDER_NUMBER;
const IPPANEL_SEND_URL = 'https://edge.ippanel.com/v1/api/send';
// ایپی‌پانل پیامک‌های عملیاتی را فقط از طریق پترن‌های تاییدشده می‌پذیرد؛ کد هر پترن بعد از ساخت و تایید در پنل، اینجا تنظیم می‌شود
const IPPANEL_PATTERN_DEBT = process.env.IPPANEL_PATTERN_DEBT;
const IPPANEL_PATTERN_PAYMENT = process.env.IPPANEL_PATTERN_PAYMENT;

// محدودیت تقسیم‌بندی درخواست‌های حجیم
const CHUNK_SIZE = 200;

/**
 * تابع کمکی برای تقسیم یک آرایه به بسته‌های کوچکتر
 */
function chunkArray(array, size) {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
}

/**
 * شماره موبایل ایرانی (09xxxxxxxxx) را به فرمت بین‌المللی مورد نیاز ایپی‌پانل (+98xxxxxxxxxx) تبدیل می‌کند
 */
function toE164(phone) {
    return phone.replace(/^0/, '+98');
}

/**
 * تابع سطح پایین برای لاگ کردن نتیجه پیامک در گوگل شیت
 */
async function logSms(logType, logData) {
    try {
        await axios.post(APPSCRIPT_URL, { action: logType, ...logData });
    } catch (logError) {
        console.error(`خطا در ثبت لاگ ${logType}:`, logError.message);
    }
}

/**
 * ارسال یک پیامک از طریق کاوه‌نگار
 */
async function sendViaKavenegar(phone, message) {
    try {
        const url = `https://api.kavenegar.com/v1/${KAVEHNEGAR_API_KEY}/sms/send.json`;
        const response = await axios.post(url, new URLSearchParams({
            receptor: phone, message, sender: KAVEHNEGAR_SENDER_LINE
        }));
        const data = response.data;
        return {
            success: data.return?.status === 200,
            messageId: data.entries?.[0]?.messageid,
            code: data.return?.status,
            message: data.return?.message
        };
    } catch (err) {
        console.error('Kavenegar SMS Error:', err.response?.data || err.message);
        return {
            success: false,
            messageId: undefined,
            code: err.response?.status || 500,
            message: err.response?.data?.return?.message || err.message
        };
    }
}

/**
 * ارسال یک پیامک آزاد از طریق وب‌سرویس ایپی‌پانل (برای متن‌های دستی/گروهی که پترن ندارند)
 */
async function sendViaIppanel(phone, message) {
    try {
        const response = await axios.post(IPPANEL_SEND_URL, {
            sending_type: 'webservice',
            from_number: IPPANEL_SENDER_NUMBER,
            message,
            params: { recipients: [toE164(phone)] }
        }, {
            headers: { Authorization: IPPANEL_API_KEY, 'Content-Type': 'application/json' }
        });

        const meta = response.data?.meta || {};
        return {
            success: meta.status === true,
            messageId: response.data?.data?.message_outbox_ids?.[0],
            code: meta.message_code || (meta.status ? '200' : '500'),
            message: meta.message || ''
        };
    } catch (err) {
        const meta = err.response?.data?.meta;
        console.error('ippanel SMS Error:', meta?.message || err.message);
        return {
            success: false,
            messageId: undefined,
            code: meta?.message_code || String(err.response?.status || 500),
            message: meta?.message || err.message
        };
    }
}

/**
 * ارسال یک پیامک از طریق یک پترن تاییدشده ایپی‌پانل (برای پیامک‌های عملیاتی)
 */
async function sendViaIppanelPattern(phone, code, params) {
    if (!code) {
        return { success: false, messageId: undefined, code: 'no_pattern', message: 'کد پترن در .env تنظیم نشده است.' };
    }

    try {
        const response = await axios.post(IPPANEL_SEND_URL, {
            sending_type: 'pattern',
            from_number: IPPANEL_SENDER_NUMBER,
            code,
            recipients: [toE164(phone)],
            params
        }, {
            headers: { Authorization: IPPANEL_API_KEY, 'Content-Type': 'application/json' }
        });

        const meta = response.data?.meta || {};
        return {
            success: meta.status === true,
            messageId: response.data?.data?.message_outbox_ids?.[0],
            code: meta.message_code || (meta.status ? '200' : '500'),
            message: meta.message || ''
        };
    } catch (err) {
        const meta = err.response?.data?.meta;
        console.error('ippanel Pattern SMS Error:', meta?.message || err.message);
        return {
            success: false,
            messageId: undefined,
            code: meta?.message_code || String(err.response?.status || 500),
            message: meta?.message || err.message
        };
    }
}

/**
 * ارسال یک پیامک آزاد از طریق سرویس‌دهنده انتخاب‌شده در SMS_PROVIDER (بدون پترن)
 */
async function sendSms(phone, message) {
    if (SMS_PROVIDER === 'ippanel') {
        return sendViaIppanel(phone, message);
    }
    return sendViaKavenegar(phone, message);
}

/**
 * برای ارسال پیامک تراکنش (پرداخت یا بدهی)
 * روی ایپی‌پانل از پترن تاییدشده استفاده می‌شود؛ روی کاوه‌نگار همان متن آزاد قبلی ارسال می‌شود.
 * @param {string} type - نوع تراکنش ('paid' یا 'debt')
 * @param {object} customer - آبجکت مشتری
 * @param {number} amount - مبلغ تراکنش
 * @param {number} remainingDebt - مانده حساب جدید مشتری
 * @param {string} date - تاریخ تراکنش
 */
async function sendTransactionSms(type, customer, amount, remainingDebt, date) {
    const templateKey = type === 'paid' ? 'payment' : 'debt';
    const template = smsTemplates[templateKey];
    if (!template) return;

    const messageForSms = template
        .replace(/{name}/g, customer.name || 'مشتری')
        .replace(/{amount}/g, addCommas(amount))
        .replace(/{remaining_debt}/g, addCommas(remainingDebt))
        .replace(/{date}/g, date);

    const messageForLog = messageForSms.replace(/\n/g, ' | ');

    let result;
    if (SMS_PROVIDER === 'ippanel') {
        const params = {
            name: customer.name || 'مشتری',
            amount: addCommas(amount),
            remaining_debt: addCommas(remainingDebt)
        };
        if (type === 'paid') params.date = date;

        const patternCode = type === 'paid' ? IPPANEL_PATTERN_PAYMENT : IPPANEL_PATTERN_DEBT;
        result = await sendViaIppanelPattern(customer.phone, patternCode, params);
    } else {
        result = await sendViaKavenegar(customer.phone, messageForSms);
    }

    // این بخش همیشه اجرا می‌شود، چه موفق و چه ناموفق
    logSms('logSingleSMS', {
        smsId: result.messageId || uuidv4(),
        phone: customer.phone,
        name: customer.name || '',
        message: messageForLog,
        date: formatToJalali(getIranTime()),
        wsApiCode: result.code,
        smsApiMessage: result.message
    });
}

async function sendBulkSms(customers, bodyMessage) {
    if (!customers || !Array.isArray(customers) || customers.length === 0) {
        throw new Error('آرایه مشتریان نمی‌تواند خالی باشد.');
    }

    console.log(`شروع فرآیند ارسال پیامک گروهی به ${customers.length} نفر...`);

    let successCount = 0;
    let failureCount = 0;
    let firstErrorMessage = '';
    const logsToBatch = [];

    // ارسال یکی‌یکی، مطابق منطق اصلی
    for (const customer of customers) {
        const finalMessage = `${customer.name || 'مشتری'} عزیز\n${bodyMessage}\n👗پوشاک مهر ؛ ۲۷سال همراهی باسلیقه بانوان شهرم🛍`;

        const result = await sendSms(customer.phone, finalMessage);

        if (result.success) {
            successCount++;
        } else {
            failureCount++;
            if (!firstErrorMessage) firstErrorMessage = result.message;
        }

        logsToBatch.push({
            smsId: result.messageId || uuidv4(),
            receptor: customer.phone,
            name: customer.name || '',
            message: finalMessage.replace(/\n/g, ' | '),
            date: formatToJalali(getIranTime()),
            wsApiCode: result.code,
            smsApiMessage: result.message
        });
    }

    if (logsToBatch.length > 0) {
        logSms('logBulkSMS', { logs: logsToBatch });
    }

    console.log("فرآیند ارسال پیامک گروهی به پایان رسید.");
    return { successCount, failureCount, firstErrorMessage };
}

/**
 * برای ارسال پیامک اخطار به مدیر سیستم
 */
async function sendAdminSmsAlert(alertMessage) {
    const adminPhone = process.env.ADMIN_PHONE_NUMBER;
    if (!adminPhone) {
        console.error("خطا: شماره موبایل مدیر برای ارسال اخطار در فایل .env تعریف نشده است.");
        return;
    }

    const result = await sendSms(adminPhone, alertMessage);
    if (result.success) {
        console.log(`پیامک اخطار با موفقیت به مدیر سیستم ارسال شد.`);
    } else {
        console.error('Admin SMS Error:', result.message);
    }
}

module.exports = {
    sendBulkSms,
    sendTransactionSms,
    sendAdminSmsAlert
};
