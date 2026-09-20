const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'client.json');
const EXAMPLE_PATH = path.join(__dirname, 'client.example.json');

// config/client.json مخصوص همین استقرار (مشتری) است و در گیت کامیت نمی‌شود (مثل .env)؛
// اگر روی سرور ساخته نشده باشد، برای این‌که برنامه بالا نیاید، از نمونه پیش‌فرض استفاده می‌کنیم.
function loadClientConfig() {
    const targetPath = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : EXAMPLE_PATH;
    if (targetPath === EXAMPLE_PATH) {
        console.warn('⚠ config/client.json پیدا نشد؛ از config/client.example.json استفاده می‌شود. آن را برای این مشتری بسازید.');
    }
    return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}

module.exports = loadClientConfig();
