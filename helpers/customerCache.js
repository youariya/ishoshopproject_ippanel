// helpers/customerCache.js
const CacheManager = require('./cacheManager');

// یک نمونه از CacheManager برای مشتریان بساز
// با زمان انقضای ۱۵ دقیقه (۹۰۰ ثانیه)
const customerCache = new CacheManager('Customers', 'getAllCustomers', { ttl: 900 });

async function getCustomers() {
    return customerCache.getData();
}

async function addCustomerToCache(customer) {
    await customerCache.addItem(customer);
}

async function updateCustomerInCache(customerId, updatedData) {
    await customerCache.updateItem(customerId, updatedData);
}

async function isPhoneExistsInCache(phone) {
    const customers = await getCustomers();
    return customers.some(c => c.phone === phone);
}

module.exports = {
    getCustomers,
    addCustomerToCache,
    updateCustomerInCache,
    isPhoneExistsInCache,
};