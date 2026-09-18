const { format, parse } = require('date-fns-jalali');
const { faIR } = require('date-fns/locale');

// تنظیم timezone ایران برای کل process
process.env.TZ = 'Asia/Tehran';

/**
 * اعداد فارسی و عربی را به انگلیسی تبدیل می‌کند
 * @param {string} str - رشته ورودی
 * @returns {string} - رشته با اعداد انگلیسی
 */
function fixNumbers(str) {
  if (str === null || str === undefined) return '';
  str = String(str);
  const fa = [/[\u06F0-\u06F9]/g, /[\u0660-\u0669]/g];
  const en = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return str.replace(fa[0], d => en[d.charCodeAt(0) - 0x06F0])
            .replace(fa[1], d => en[d.charCodeAt(0) - 0x0660]);
}

/**
 * تاریخ میلادی را به شمسی (yyyy/MM/dd) تبدیل می‌کند
 * @param {Date} date - آبجکت تاریخ میلادی
 * @returns {string} - تاریخ شمسی
 */
function formatToJalali(date) {
    try {
        if (!date) return format(new Date(), 'yyyy/MM/dd');
        return format(new Date(date), 'yyyy/MM/dd');
    } catch (error) {
        console.error('خطا در تبدیل تاریخ:', error);
        return format(new Date(), 'yyyy/MM/dd');
    }
}

/**
 * ساعت فعلی را به صورت HH:mm برمی‌گرداند
 * @param {Date} date - آبجکت تاریخ (اختیاری، پیش‌فرض: زمان فعلی)
 * @returns {string} - ساعت فعلی
 */
function getCurrentTime(date = new Date()) {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * تاریخ و ساعت فعلی ایران را برمی‌گرداند
 * @returns {Date} - آبجکت Date با زمان ایران
 */
function getIranTime() {
  return new Date();
}

/**
 * به اعداد کاما (جداکننده هزارگان) اضافه می‌کند
 * @param {number|string} x - عدد ورودی
 * @returns {string} - عدد فرمت‌بندی شده
 */
function addCommas(x) {
  if (x === null || x === undefined) return '';
  const parts = x.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/**
 * تاریخ و ساعت شمسی را به فرمت تک‌خطی و کاربرپسند تبدیل می‌کند.
 * این نسخه نهایی، فرمت مورد نیاز را پیاده‌سازی کرده و در برابر خطا مقاوم است.
 * @param {string} dateString - تاریخ شمسی (e.g., '1403/04/31')
 * @param {string} timeString - ساعت (e.g., '12:18')
 * @returns {string} - تاریخ و ساعت با فرمت: "yyyy/MM/dd EEEE HH:mm"
 */
function formatDateTime(dateString, timeString) {
    // اگر رشته تاریخ وجود نداشته باشد، یک مقدار پیش‌فرض برمی‌گردانیم
    if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
        return 'بدون تاریخ';
    }

    try {
        // ۱. رشته تاریخ و ساعت شمسی را به یک آبجکت Date معتبر تبدیل می‌کنیم
        const date = parse(`${dateString} ${timeString || '00:00'}`, 'yyyy/MM/dd HH:mm', new Date(), { locale: faIR });

        // ۲. بررسی می‌کنیم که آبجکت Date ساخته شده معتبر باشد
        if (isNaN(date.getTime())) {
            console.error("خطای پارس تاریخ - تاریخ نامعتبر:", `${dateString} ${timeString}`);
            return 'تاریخ نامعتبر';
        }

        // ۳. آبجکت Date را با فرمت نهایی درخواستی شما نمایش می‌دهیم
        const formatString = timeString ? 'yyyy/MM/dd EEEE HH:mm' : 'yyyy/MM/dd EEEE';
        return format(date, formatString, { locale: faIR });

    } catch (error) {
        console.error("خطای استثنا در پردازش تاریخ:", dateString, error);
        return 'خطا در فرمت'; // بازگرداندن مقدار پیش‌فرض در صورت بروز خطا
    }
}

module.exports = {
  fixNumbers,
  formatToJalali,
  getCurrentTime,
  getIranTime,
  addCommas,
  formatDateTime
};
