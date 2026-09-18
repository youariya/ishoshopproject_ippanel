// helpers/cacheManager.js
const NodeCache = require('node-cache');
const axios = require('axios');
const APPSCRIPT_URL = process.env.APPSCRIPT_URL;

class CacheManager {
    constructor(name, action, options = {}) {
        this.name = name; // نام کش برای لاگ‌گیری (مثال: 'Customers')
        this.action = action; // اکشنی که به GAS ارسال می‌شود (مثال: 'getAllCustomers')
        this.cache = new NodeCache({
            stdTTL: options.ttl || 600, // زمان انقضای پیش‌فرض: ۱۰ دقیقه
            checkperiod: 120, // هر ۲ دقیقه کلیدهای منقضی شده را چک کن
        });
        this.syncPromise = null;
    }

    /**
     * تابع اصلی برای دریافت داده‌ها.
     * ابتدا کش را بررسی می‌کند، در صورت نبود داده، آن را از منبع اصلی همگام‌سازی می‌کند.
     */
    async getData() {
        const cachedData = this.cache.get('all_data');
        if (cachedData) {
            console.log(`Cache hit for ${this.name}.`);
            return cachedData;
        }
        console.log(`Cache miss for ${this.name}. Triggering sync...`);
        return this._sync();
    }

    /**
     * منطق همگام‌سازی داده‌ها از منبع اصلی (GAS)
     * از الگوی syncPromise برای جلوگیری از درخواست‌های همزمان استفاده می‌کند.
     */
    _sync() {
        if (this.syncPromise) {
            console.log(`Sync already in progress for ${this.name}. Waiting...`);
            return this.syncPromise;
        }

        this.syncPromise = new Promise(async (resolve, reject) => {
            console.log(`Fetching ${this.name} from GAS...`);
            try {
                const res = await axios.post(APPSCRIPT_URL, { action: this.action });
                const data = Array.isArray(res.data) ? res.data : [];
                this.cache.set('all_data', data);
                console.log(`Cache for ${this.name} synced. Count: ${data.length}`);
                resolve(data);
            } catch (err) {
                console.error(`Error syncing cache for ${this.name}:`, err.message);
                reject(err);
            } finally {
                this.syncPromise = null; // پاک کردن پراپیس پس از اتمام
            }
        });

        return this.syncPromise;
    }

    /**
     * افزودن یک آیتم جدید به کش موجود
     */
    async addItem(item) {
        const allData = await this.getData();
        allData.push(item);
        this.cache.set('all_data', allData);
    }
    
    /**
     * به‌روزرسانی یک آیتم در کش بر اساس شناسه
     */
    async updateItem(id, updatedData, idKey = 'id') {
        const allData = await this.getData();
        const itemIndex = allData.findIndex(item => String(item[idKey]) === String(id));
        if (itemIndex !== -1) {
            allData[itemIndex] = { ...allData[itemIndex], ...updatedData };
            this.cache.set('all_data', allData);
            console.log(`Cache updated for item ${id} in ${this.name}.`);
        }
    }

    /**
     * پاک کردن دستی کش (برای همگام‌سازی مجدد)
     */
    invalidate() {
        this.cache.flushAll();
        console.log(`Cache for ${this.name} invalidated.`);
    }
}

module.exports = CacheManager;