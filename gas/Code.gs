/**
 * Google Apps Script پشتیبان این پروژه — همان API‌ای که Node در APPSCRIPT_URL صدا می‌زند.
 *
 * نصب برای مشتری جدید:
 *  1. یک Google Sheet خالی جدید بسازید.
 *  2. Extensions > Apps Script را باز کنید، محتوای همین فایل را کامل جای‌گزین کد پیش‌فرض کنید.
 *  3. از نوار بالا، تابع setup را انتخاب و Run بزنید (بار اول اجازه‌ی دسترسی می‌خواهد، تایید کنید).
 *     این کار شیت‌ها و ستون‌های لازم را می‌سازد (بدون پاک‌کردن داده‌ی موجود در اجراهای بعدی).
 *  4. Deploy > New deployment > نوع «Web app» > Execute as: Me > Who has access: Anyone.
 *  5. آدرس exec که می‌دهد را در .env این مشتری به‌عنوان APPSCRIPT_URL بگذارید.
 *  6. هر بار کد این فایل را عوض کردید، باید Deploy > Manage deployments > ویرایش > نسخه‌ی جدید بزنید
 *     وگرنه آدرس قبلی نسخه‌ی قدیمی کد را اجرا می‌کند.
 */

const SHEET_SCHEMAS = {
  Customers: ['id', 'name', 'phone', 'debt', 'date'],
  Transactions: ['id', 'customerId', 'phone', 'name', 'paid', 'debtAdded', 'description', 'date', 'time', 'remainDebt'],
  Users: ['id', 'username', 'passwordHash', 'role'],
  ErrorLog: ['timestamp', 'operation', 'data', 'errorMessage'],
  SmsLog: ['timestamp', 'smsId', 'phone', 'name', 'message', 'date', 'wsApiCode', 'smsApiMessage']
};

/**
 * ساخت شیت‌ها و هدرهای لازم. امن برای اجرای چندباره: اگر شیتی با داده وجود داشته باشد
 * و هدرش با ساختار زیر یکی نباشد، دست‌کاریش نمی‌کند و فقط در Log هشدار می‌دهد.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(SHEET_SCHEMAS).forEach(name => {
    const headers = SHEET_SCHEMAS[name];
    let sheet = ss.getSheetByName(name);
    const isNew = !sheet;
    if (isNew) sheet = ss.insertSheet(name);

    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const headerMatches = headers.every((h, i) => firstRow[i] === h);

    if (headerMatches) return;

    if (!isNew && sheet.getLastRow() > 1) {
      Logger.log('⚠ شیت "' + name + '" داده دارد ولی هدرش با ساختار مورد انتظار یکی نیست؛ برای جلوگیری از آسیب، دستی بررسی کنید.');
      return;
    }

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#f1f3f4')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  });

  // حذف شیت پیش‌فرض خالی که گوگل موقع ساخت شیت جدید اضافه می‌کند
  ['Sheet1', 'برگه1'].forEach(defaultName => {
    const defaultSheet = ss.getSheetByName(defaultName);
    if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(defaultSheet);
    }
  });

  // یک کاربر ادمین پیش‌فرض بساز اگر شیت Users خالی است (رمز خالی = اولین ورود با DEFAULT_TEMP_PASSWORD در .env)
  const usersSheet = ss.getSheetByName('Users');
  if (usersSheet.getLastRow() === 1) {
    usersSheet.appendRow(['1', 'admin', '', 'admin']);
    Logger.log('کاربر پیش‌فرض "admin" با رمز خالی (اولین ورود) ساخته شد.');
  }

  SpreadsheetApp.flush();
  Logger.log('✅ راه‌اندازی شیت‌ها کامل شد.');
}

// ==================== API ====================

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const handlers = {
      getAllCustomers: handleGetAllCustomers,
      getAllTransactions: handleGetAllTransactions,
      processNewCustomer: handleProcessNewCustomer,
      processTransaction: handleProcessTransaction,
      getUserByUsername: handleGetUserByUsername,
      setUserPassword: handleSetUserPassword,
      logError: handleLogError,
      logSingleSMS: handleLogSingleSms,
      logBulkSMS: handleLogBulkSms
    };
    const handler = handlers[req.action];
    if (!handler) {
      return jsonResponse({ status: 'error', message: 'اکشن نامعتبر: ' + req.action });
    }
    return handler(req);
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('شیت "' + name + '" پیدا نشد — ابتدا تابع setup را اجرا کنید.');
  return sheet;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function appendObjectRow(sheet, headers, obj) {
  const row = headers.map(h => (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '');
  sheet.appendRow(row);
}

// --- خواندن ---

function handleGetAllCustomers() {
  return jsonResponse(sheetToObjects(getSheet('Customers')));
}

function handleGetAllTransactions() {
  return jsonResponse(sheetToObjects(getSheet('Transactions')));
}

// --- نوشتن ---

function handleProcessNewCustomer(req) {
  appendObjectRow(getSheet('Customers'), SHEET_SCHEMAS.Customers, req.customer);
  if (req.transaction) {
    appendObjectRow(getSheet('Transactions'), SHEET_SCHEMAS.Transactions, req.transaction);
  }
  return jsonResponse({ status: 'success' });
}

function handleProcessTransaction(req) {
  appendObjectRow(getSheet('Transactions'), SHEET_SCHEMAS.Transactions, req.transaction);
  // نکته: Node فقط ردیف تراکنش را می‌فرستد، نه آپدیت مشتری — پس این تنها جایی است که
  // ستون debt در شیت Customers به‌روز می‌شود. بدون این، مانده بدهی در شیت هیچ‌وقت واقعی نمی‌ماند.
  updateCustomerDebt(req.transaction.customerId, req.transaction.remainDebt, req.transaction.date);
  return jsonResponse({ status: 'success' });
}

function updateCustomerDebt(customerId, newDebt, newDate) {
  const sheet = getSheet('Customers');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  const debtCol = headers.indexOf('debt');
  const dateCol = headers.indexOf('date');
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(customerId)) {
      sheet.getRange(r + 1, debtCol + 1).setValue(newDebt);
      sheet.getRange(r + 1, dateCol + 1).setValue(newDate);
      return;
    }
  }
}

function handleGetUserByUsername(req) {
  const users = sheetToObjects(getSheet('Users'));
  const user = users.find(u => String(u.username) === String(req.username));
  return jsonResponse(user || null);
}

function handleSetUserPassword(req) {
  const sheet = getSheet('Users');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  const passCol = headers.indexOf('passwordHash');
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(req.userId)) {
      sheet.getRange(r + 1, passCol + 1).setValue(req.passwordHash);
      return jsonResponse({ status: 'success' });
    }
  }
  return jsonResponse({ status: 'error', message: 'کاربر یافت نشد.' });
}

function handleLogError(req) {
  appendObjectRow(getSheet('ErrorLog'), SHEET_SCHEMAS.ErrorLog, {
    timestamp: new Date(),
    operation: req.operation,
    data: JSON.stringify(req.data),
    errorMessage: req.errorMessage
  });
  return jsonResponse({ status: 'success' });
}

function handleLogSingleSms(req) {
  appendObjectRow(getSheet('SmsLog'), SHEET_SCHEMAS.SmsLog, {
    timestamp: new Date(),
    smsId: req.smsId,
    phone: req.phone,
    name: req.name,
    message: req.message,
    date: req.date,
    wsApiCode: req.wsApiCode,
    smsApiMessage: req.smsApiMessage
  });
  return jsonResponse({ status: 'success' });
}

function handleLogBulkSms(req) {
  const sheet = getSheet('SmsLog');
  (req.logs || []).forEach(log => {
    appendObjectRow(sheet, SHEET_SCHEMAS.SmsLog, {
      timestamp: new Date(),
      smsId: log.smsId,
      phone: log.phone || log.receptor, // نسخه‌ی گروهی به‌جای phone از receptor استفاده می‌کند
      name: log.name,
      message: log.message,
      date: log.date,
      wsApiCode: log.wsApiCode,
      smsApiMessage: log.smsApiMessage
    });
  });
  return jsonResponse({ status: 'success' });
}
