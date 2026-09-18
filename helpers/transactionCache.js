// helpers/transactionCache.js
const CacheManager = require('./cacheManager');

// یک نمونه از CacheManager برای تراکنش‌ها بساز
// با زمان انقضای ۵ دقیقه (۳۰۰ ثانیه)
const transactionCache = new CacheManager('Transactions', 'getAllTransactions', { ttl: 300 });

async function getAllTransactions() {
    return transactionCache.getData();
}

async function getTransactionsForPhone(phone) {
    const allTransactions = await getAllTransactions();
    return allTransactions.filter(tx => tx.phone === phone);
}

async function addTransactionToCache(tx) {
    await transactionCache.addItem(tx);
}

module.exports = {
    getAllTransactions,
    getTransactionsForPhone,
    addTransactionToCache,
};