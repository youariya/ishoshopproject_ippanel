require('dotenv').config();

// تنظیم timezone ایران برای کل process
process.env.TZ = 'Asia/Tehran';

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { parse } = require('date-fns-jalali');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// 🔥 اضافه کردن MemoryStore جدید
const MemoryStore = require('memorystore')(session);

// --- Helpers & Services ---
const { getCustomers, addCustomerToCache, updateCustomerInCache, isPhoneExistsInCache } = require('./helpers/customerCache');
const { getAllTransactions, addTransactionToCache, getTransactionsForPhone } = require('./helpers/transactionCache');
const { fixNumbers, formatToJalali, addCommas, getCurrentTime, formatDateTime, getIranTime } = require('./helpers/utils');
const smsService = require('./helpers/smsService');

const app = express();
const PORT = process.env.PORT || 3000;
const APPSCRIPT_URL = process.env.APPSCRIPT_URL;

// 🔥 تنظیم Trust Proxy (مهم برای production)
app.set('trust proxy', 1);

// --- بهبود Security Headers ---
// نکته: چون سرور فعلاً فقط روی HTTP هست (بدون SSL)، hsts و upgradeInsecureRequests
// غیرفعال شدن. وقتی SSL نصب شد (مرحله بعدی)، می‌تونیم دوباره فعالشون کنیم.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            upgradeInsecureRequests: null
        }
    },
    crossOriginEmbedderPolicy: false,
    hsts: false
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// 🔥 بهبود Session Configuration
app.use(session({
    store: new MemoryStore({
        checkPeriod: 86400000 // پاک‌سازی هر 24 ساعت
    }),
    secret: process.env.SESSION_SECRET || 'ishoshop-fallback-secret-2024',
    name: 'ishoshop_sid', // نام امن‌تر
    genid: () => crypto.randomBytes(32).toString('hex'), // ID قوی‌تر
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' ? false : false, // فعلاً false تا SSL نصب بشه
        maxAge: 30 * 60 * 1000, // 30 دقیقه به جای 24 ساعت
        sameSite: 'lax',
        path: '/'
    }
}));

const csrfProtection = csurf({ cookie: true });

// 🔥 بهبود Rate Limiting
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقیقه
    max: 5, // کاهش از 50 به 5
    skipSuccessfulRequests: true, // skip موفق
    keyGenerator: (req) => {
        // rate limit بر اساس IP + username
        return req.ip + ':' + (req.body.username || 'unknown');
    },
    message: { 
        status: 'error', 
        message: 'تعداد تلاش برای ورود بیش از حد مجاز است.' 
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for localhost
        const ip = req.ip || req.connection.remoteAddress;
        return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
    }
});

// 🔥 بهبود Authentication Middleware
function isAuthenticated(req, res, next) {
    console.log('🔍 Session check:', {
        sessionID: req.sessionID,
        hasSession: !!req.session,
        hasUser: !!req.session?.user,
        userInfo: req.session?.user
    });
    
    if (!req.session?.user?.id) {
        return unauthorized(req, res);
    }
    
    // 🔥 بررسی انقضای session (جدید)
    const sessionAge = Date.now() - (req.session.user.loginTime || 0);
    const maxAge = 8 * 60 * 60 * 1000; // 8 ساعت
    
    if (sessionAge > maxAge) {
        console.warn(`Session expired for user ${req.session.user.id}`);
        req.session.destroy();
        return unauthorized(req, res);
    }
    
    // تمدید خودکار session
    req.session.touch();
    
    return next();
}

function unauthorized(req, res) {
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ 
            status: 'error', 
            message: 'نشست شما خاتمه یافته، لطفاً دوباره وارد شوید.' 
        });
    }
    return res.redirect('/login/login.html');
}

// --- Public Routes ---
app.get('/', (req, res) => {
    console.log('🏠 Root access - Session:', req.session?.user ? 'Valid' : 'Invalid');
    if (req.session && req.session.user) {
        res.redirect('/dashboard/dashboard.html');
    } else {
        res.redirect('/login/login.html');
    }
});

// 🔥 بهبود Login Route با Session Regeneration
app.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    console.log('🔐 Login attempt:', username);
    
    try {
        const userRes = await axios.post(APPSCRIPT_URL, { action: 'getUserByUsername', username });
        const user = userRes.data;
        
        if (!user) {
            return res.status(401).json({ status: 'error', message: 'نام کاربری یا رمز عبور اشتباه است.' });
        }
        
        const isFirstLogin = !user.passwordHash || user.passwordHash.trim() === '';
        let passwordMatch = false;
        
        if (isFirstLogin) {
            passwordMatch = (password === process.env.DEFAULT_TEMP_PASSWORD);
        } else {
            passwordMatch = await bcrypt.compare(password, user.passwordHash);
        }
        
        if (!passwordMatch) {
            return res.status(401).json({ status: 'error', message: 'نام کاربری یا رمز عبور اشتباه است.' });
        }
        
        // 🔥 Session Regeneration برای جلوگیری از Session Fixation
        req.session.regenerate((err) => {
            if (err) {
                console.error('❌ Session regeneration error:', err);
                return res.status(500).json({ status: 'error', message: 'خطا در ذخیره نشست' });
            }
            
            // ذخیره اطلاعات کاربر در session جدید
            req.session.user = { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                loginTime: Date.now(), // اضافه کردن زمان login
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            };
            
            // Force save session
            req.session.save((err) => {
                if (err) {
                    console.error('❌ Session save error:', err);
                    return res.status(500).json({ status: 'error', message: 'خطا در ذخیره نشست' });
                }
                
                console.log('✅ Session saved successfully');
                console.log('🆔 Session ID:', req.sessionID);
                console.log('👤 User logged in:', user.username);
                
                res.json({ 
                    status: 'success', 
                    isFirstLogin: isFirstLogin,
                    sessionId: req.sessionID // Debug info
                });
            });
        });
        
    } catch (error) {
        console.error("❌ Login error:", error);
        res.status(500).json({ status: 'error', message: 'خطای داخلی سرور.' });
    }
});

app.use('/api', isAuthenticated, csrfProtection);

// --- APIs ---
app.get('/api/csrf-token', (req, res) => { 
    res.json({ csrfToken: req.csrfToken() }); 
});

// 🔥 بهبود Logout Route
app.post('/api/logout', (req, res) => { 
    const userId = req.session?.user?.id;
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ 
                status: 'error', 
                message: 'خطا در خروج از سیستم' 
            });
        }
        
        // پاک کردن کوکی‌ها
        res.clearCookie('ishoshop_sid');
        res.clearCookie('_csrf');
        
        // لاگ خروج
        if (userId) {
            console.log(`👋 User ${userId} logged out at ${new Date().toISOString()}`);
        }
        
        res.json({ status: 'success' });
    });
});

app.post('/api/set-initial-password', async (req, res) => {
    const { newPassword, confirmPassword } = req.body;
    const userId = req.session.user.id;
    
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ status: 'error', message: 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد.' });
    }
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ status: 'error', message: 'رمزهای عبور وارد شده مطابقت ندارند.' });
    }
    
    try {
        const passwordHash = await bcrypt.hash(newPassword, 12);
        await axios.post(APPSCRIPT_URL, {
            action: 'setUserPassword',
            userId: userId,
            passwordHash: passwordHash
        });
        res.json({ status: 'success', message: 'رمز عبور با موفقیت تغییر یافت.' });
    } catch (error) {
        console.error("خطا در ثبت رمز عبور جدید:", error);
        res.status(500).json({ status: 'error', message: 'خطای داخلی سرور.' });
    }
});

app.post('/api/customer', async (req, res) => {
    const { name, phone, initialDebt } = req.body;
    let normalizedPhone = fixNumbers(String(phone || ''));
    if (normalizedPhone.startsWith('9') && normalizedPhone.length === 10) normalizedPhone = '0' + normalizedPhone;
    if (!/^09\d{9}$/.test(normalizedPhone)) return res.status(400).json({ status: 'error', message: 'شماره موبایل معتبر نیست.' });

    if (await isPhoneExistsInCache(normalizedPhone)) {
        return res.status(400).json({ status: 'error', message: 'این شماره موبایل قبلاً ثبت شده است.' });
    }

    const numericInitialDebt = Number(fixNumbers(String(initialDebt || '0').replace(/,/g, '')));
    try {
        const customerId = await generateNextCustomerId();
        const now = getIranTime();
        const newCustomer = {
            id: String(customerId), name, phone: normalizedPhone, debt: numericInitialDebt, date: formatToJalali(now)
        };
        await addCustomerToCache(newCustomer);

        let newTransaction = null;
        if (numericInitialDebt > 0) {
            const transactionId = await generateNextTransactionId();
            newTransaction = {
                id: transactionId, customerId: newCustomer.id, phone: newCustomer.phone, name: newCustomer.name,
                paid: 0, debtAdded: numericInitialDebt, description: 'بدهی اولیه', 
                date: formatToJalali(now), time: getCurrentTime(now), remainDebt: numericInitialDebt
            };
            await addTransactionToCache(newTransaction);
        }

        res.status(201).json({ status: 'success', newCustomer });

        setImmediate(() => {
            const operation = () => axios.post(APPSCRIPT_URL, {
                action: 'processNewCustomer',
                customer: newCustomer,
                transaction: newTransaction
            });
            processInBackground(operation, {
                operationName: 'ثبت مشتری جدید',
                data: { name: newCustomer.name, phone: newCustomer.phone, initialDebt: numericInitialDebt },
                customerName: newCustomer.name
            });
        });
    } catch (error) {
        console.error("خطا در ثبت مشتری:", error);
        res.status(500).json({ status: 'error', message: 'خطای داخلی سرور هنگام ثبت مشتری.' });
    }
});

app.post('/api/transaction', async (req, res) => {
    const { customerId, type, amount, description } = req.body;
    const sanitizedAmount = fixNumbers(String(amount || '0'));

    if (!customerId || !type || !sanitizedAmount || isNaN(Number(sanitizedAmount)) || Number(sanitizedAmount) <= 0) {
        return res.status(400).json({ status: 'error', message: 'اطلاعات ارسالی نامعتبر است.' });
    }
    try {
        const customers = await getCustomers();
        const customer = customers.find(c => String(c.id) === String(customerId));
        if (!customer) {
            return res.status(404).json({ status: 'error', message: 'مشتری یافت نشد.' });
        }
        const numericAmount = Number(sanitizedAmount);
        const newDebt = (type === 'paid') ? customer.debt - numericAmount : customer.debt + numericAmount;
        
        const now = getIranTime();
        const transactionDate = formatToJalali(now);
        const transactionTime = getCurrentTime(now);
        const transactionId = await generateNextTransactionId();
        
        const newTransaction = {
            id: transactionId, customerId: customer.id, phone: customer.phone, name: customer.name,
            paid: (type === 'paid') ? numericAmount : 0,
            debtAdded: (type === 'debt') ? numericAmount : 0,
            description: description || '',
            date: transactionDate,
            time: transactionTime,
            remainDebt: newDebt
        };

        await updateCustomerInCache(customer.id, { debt: newDebt, date: transactionDate });
        await addTransactionToCache(newTransaction);
        res.status(201).json({ status: 'success', message: 'تراکنش با موفقیت ثبت شد.', newTransaction });
        
        setImmediate(() => {
            const operation = () => axios.post(APPSCRIPT_URL, { action: 'processTransaction', transaction: newTransaction });
            processInBackground(operation, {
                operationName: 'ثبت تراکنش',
                data: { customerId: customer.id, name: customer.name, phone: customer.phone, amount: numericAmount, type, description },
                customerName: customer.name
            });
            smsService.sendTransactionSms(type, customer, numericAmount, newDebt, transactionDate);
        });
    } catch (error) {
        console.error("خطا در ثبت تراکنش:", error);
        res.status(500).json({ status: 'error', message: 'خطای داخلی سرور هنگام ثبت تراکنش.' });
    }
});

app.post('/api/bulk-sms', async (req, res) => {
    const { customers, message } = req.body;
    if (!message || !customers || !Array.isArray(customers) || customers.length === 0) {
        return res.status(400).json({ status: 'error', message: 'اطلاعات ارسالی ناقص است.' });
    }

    try {
        const result = await smsService.sendBulkSms(customers, message);

        if (result.failureCount > 0 && result.successCount > 0) {
            const errorMessage = `ارسال تکمیل شد. ${result.successCount} موفق، ${result.failureCount} ناموفق. اولین خطا: ${result.firstErrorMessage}`;
            return res.status(207).json({ status: 'partial_success', message: errorMessage });
        }
        if (result.failureCount > 0) {
            const errorMessage = `ارسال ناموفق بود. خطا: ${result.firstErrorMessage}`;
            return res.status(400).json({ status: 'error', message: errorMessage });
        }
        
        return res.status(200).json({ status: 'success', message: `پیامک‌ها با موفقیت به ${result.successCount} نفر ارسال شد.` });

    } catch (error) {
        console.error('خطای کلی در پردازش ارسال انبوه:', error);
        return res.status(500).json({ status: 'error', message: 'خطای داخلی سرور در هنگام پردازش درخواست.' });
    }
});

app.get('/api/customers', async (req, res) => {
    res.json(await getCustomers());
});

app.get('/api/customer-inquiry/:phone', async (req, res) => {
    try {
        const phone = fixNumbers(req.params.phone);
        if (!/^09\d{9}$/.test(phone)) {
            return res.status(400).json({ status: 'error', message: 'فرمت شماره موبایل نامعتبر است.' });
        }
        const customers = await getCustomers();
        const customer = customers.find(c => c.phone === phone);
        if (!customer) {
            return res.status(404).json({ status: 'error', message: 'مشتری با این شماره یافت نشد.' });
        }
        const transactions = await getTransactionsForPhone(phone);
        
        const sortedTransactions = transactions.sort((a, b) => {
            try {
                const dateA = (a.date) ? parse(`${a.date} ${a.time || '00:00'}`, 'yyyy/MM/dd HH:mm', new Date()) : null;
                const dateB = (b.date) ? parse(`${b.date} ${b.time || '00:00'}`, 'yyyy/MM/dd HH:mm', new Date()) : null;
                const timeA = (dateA && !isNaN(dateA.getTime())) ? dateA.getTime() : 0;
                const timeB = (dateB && !isNaN(dateB.getTime())) ? dateB.getTime() : 0;
                return timeB - timeA;
            } catch (e) {
                console.error("خطا در مرتب‌سازی تراکنش‌ها:", e);
                return 0;
            }
        });

        const lastUpdate = sortedTransactions.length > 0
            ? formatDateTime(sortedTransactions[0].date, sortedTransactions[0].time)
            : formatDateTime(customer.date, null);
        
        const formattedTransactions = sortedTransactions.map(t => ({
            ...t,
            formattedDate: formatDateTime(t.date, t.time)
        }));

        res.json({
            status: 'success',
            data: {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                debt: customer.debt,
                lastUpdate: lastUpdate,
                transactions: formattedTransactions
            }
        });
    } catch (error) {
        console.error("خطا در استعلام مشتری:", error);
        res.status(500).json({ status: 'error', message: 'خطای داخلی سرور.' });
    }
});

app.get('/api/debtors', async (req, res) => {
    try {
        const customers = await getCustomers();
        const debtors = customers
            .filter(c => c.debt > 0)
            .sort((a, b) => b.debt - a.debt);
        const totalDebtorsDebt = debtors.reduce((sum, c) => sum + c.debt, 0);
        res.json({ 
            status: 'success', 
            data: {
                debtors: debtors,
                totalDebtorsDebt: totalDebtorsDebt
            }
        });
    } catch (error) {
        console.error("خطا در دریافت لیست بدهکاران:", error);
        res.status(500).json({ status: 'error', message: 'خطای داخلی سرور.' });
    }
});

app.get('/api/totalDebt', async (req, res) => {
    const customers = await getCustomers();
    const totalDebt = customers.reduce((sum, c) => sum + (c.debt || 0), 0);
    res.json({ totalDebt });
});

app.get('/api/stats/today', async (req, res) => {
    try {
        const transactions = await getAllTransactions();
        const todayJalali = formatToJalali(getIranTime());
        
        const todayPayments = transactions
            .filter(tx => tx.date === todayJalali && tx.paid > 0)
            .reduce((sum, tx) => sum + tx.paid, 0);
        
        const customers = await getCustomers();
        const customerCount = customers.length;

        res.json({
            todayPayments,
            customerCount
        });
    } catch (error) {
        console.error("Error fetching today's stats:", error);
        res.status(500).json({ status: 'error', message: 'خطای داخلی سرور' });
    }
});

app.get('/api/ping', (req, res) => {
    res.json({ 
        status: 'success',
        session: req.session?.user ? 'authenticated' : 'not authenticated'
    });
});

// --- Helper Functions ---
async function generateNextCustomerId() {
    const customers = await getCustomers();
    const maxId = customers.reduce((max, customer) => {
        const id = parseInt(customer.id, 10);
        return !isNaN(id) && id > max ? id : max;
    }, 10000);
    return maxId + 1;
}

async function generateNextTransactionId() {
    const transactions = await getAllTransactions();
    const lastNum = transactions.reduce((maxNum, tx) => {
        if (tx.id && tx.id.startsWith('T')) {
            const num = parseInt(tx.id.substring(1), 10);
            if (!isNaN(num)) return Math.max(maxNum, num);
        }
        return maxNum;
    }, 0);
    return `T${String(lastNum + 1).padStart(3, '0')}`;
}

async function processInBackground(operation, options) {
    const { operationName, data, customerName } = options;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await operation();
            console.log(`عملیات "${operationName}" با موفقیت در تلاش شماره ${attempt} انجام شد.`);
            return;
        } catch (error) {
            console.error(`خطا در تلاش شماره ${attempt} برای عملیات "${operationName}":`, error.message);
            if (attempt === MAX_RETRIES) {
                console.error(`عملیات "${operationName}" پس از ${MAX_RETRIES} تلاش ناموفق بود. ثبت خطا...`);
                const errorMessage = error.response?.data?.message || error.message;
                
                axios.post(APPSCRIPT_URL, {
                    action: 'logError',
                    operation: operationName,
                    data: data,
                    errorMessage: errorMessage
                }).catch(e => console.error("خطای حیاتی در ثبت لاگ خطا:", e.message));

                const alertMessage = `اخطار: عملیات «${operationName}» برای مشتری «${customerName}» در گوگل شیت ناموفق بود. لطفا شیت ErrorLog را بررسی کنید.`;
                smsService.sendAdminSmsAlert(alertMessage);
            } else {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
        }
    }
}

// CSRF Error Handler
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        res.status(403).json({ status: 'error', message: 'نشست امنیتی نامعتبر است. لطفاً صفحه را رفرش کنید.' });
    } else {
        console.error('Unhandled error:', err);
        next(err);
    }
});

app.listen(PORT, () => { 
    console.log(`🚀 سرور در پورت ${PORT} اجرا شد.`); 
    console.log(`🔗 دسترسی مستقیم: http://localhost:${PORT}`);
});
