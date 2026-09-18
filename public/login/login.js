document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const setPasswordForm = document.getElementById('setPasswordForm');
    const loginAlertBox = document.getElementById('loginAlertBox');
    const setPasswordAlertBox = document.getElementById('setPasswordAlertBox');
    let csrfToken = null;

    // تابع برای دریافت توکن CSRF
    async function fetchCsrfToken() {
        try {
            const res = await fetch('/api/csrf-token');
            const data = await res.json();
            csrfToken = data.csrfToken;
        } catch (error) {
            console.error('Failed to fetch CSRF token', error);
        }
    }

    // --- مدیریت فرم ورود اولیه ---
    loginForm.onsubmit = async function(e) {
        e.preventDefault();
        showAlert(loginAlertBox, ''); // پاک کردن هشدارهای قبلی

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const submitBtn = this.querySelector('.login-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'در حال بررسی...';

        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (res.ok && data.status === 'success') {
                if (data.isFirstLogin) {
                    // اگر اولین ورود است، فرم تغییر رمز را نمایش بده
                    loginForm.style.display = 'none';
                    setPasswordForm.style.display = 'block';
                    await fetchCsrfToken(); // توکن CSRF را برای فرم بعدی دریافت کن
                } else {
                    // در غیر این صورت، به داشبورد منتقل شو
                    showAlert(loginAlertBox, 'ورود موفقیت‌آمیز بود، در حال انتقال...', true);
                    window.location.href = "/dashboard/dashboard.html";
                }
            } else {
                showAlert(loginAlertBox, data.message || 'نام کاربری یا رمز عبور اشتباه است.');
            }
        } catch (err) {
            showAlert(loginAlertBox, 'خطا در ارتباط با سرور.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'ورود';
        }
    };

    // --- مدیریت فرم ثبت رمز عبور جدید ---
    setPasswordForm.onsubmit = async function(e) {
        e.preventDefault();
        showAlert(setPasswordAlertBox, '');

        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const submitBtn = this.querySelector('.login-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'در حال ثبت...';

        try {
            const res = await fetch('/api/set-initial-password', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken // ارسال توکن CSRF
                },
                body: JSON.stringify({ newPassword, confirmPassword })
            });
            const data = await res.json();

            if (res.ok && data.status === 'success') {
                showAlert(setPasswordAlertBox, 'رمز عبور با موفقیت ثبت شد. در حال انتقال به داشبورد...', true);
                window.location.href = "/dashboard/dashboard.html";
            } else {
                showAlert(setPasswordAlertBox, data.message || 'خطا در ثبت رمز عبور.');
            }
        } catch (err) {
            showAlert(setPasswordAlertBox, 'خطا در ارتباط با سرور.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'ثبت رمز عبور و ورود';
        }
    };

    // تابع کمکی برای نمایش هشدارها
    function showAlert(box, msg, isSuccess = false) {
        if (!msg) {
            box.style.display = 'none';
            return;
        }
        box.textContent = msg;
        box.className = "alert-box" + (isSuccess ? " success" : "");
        box.style.display = 'block';
    }
});
