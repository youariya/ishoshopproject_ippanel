document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const elements = {
        customerForm: document.getElementById('customerForm'),
        nameInput: document.getElementById('name'),
        phoneInput: document.getElementById('phone'),
        initialDebtInput: document.getElementById('initialDebt'),
        submitBtn: document.getElementById('customerForm').querySelector('.submit-btn'),
        logoutBtn: document.getElementById('logoutBtn'),
        // Modal Elements
        unifiedModal: document.getElementById('unifiedModal'),
        modalIcon: document.getElementById('modalIcon'),
        modalTitle: document.getElementById('modalTitle'),
        modalMessage: document.getElementById('modalMessage'),
        modalActions: document.getElementById('modalActions'),
    };

    let customerPhones = [];
    let csrfToken = null; // متغیر برای نگهداری توکن

    // --- Main App Logic ---
    const App = {
        async init() {
            this.checkSession();
            await this.fetchCsrfToken(); // دریافت توکن در ابتدای کار
            this.addEventListeners();
            this.fetchCustomers();
        },

        // --- NEW: تابع برای دریافت توکن CSRF ---
        async fetchCsrfToken() {
            try {
                const res = await fetch('/api/csrf-token', { credentials: 'include' });
                if (!res.ok) throw new Error('Network response was not ok');
                const data = await res.json();
                csrfToken = data.csrfToken;
            } catch (error) {
                console.error('Could not fetch CSRF token:', error);
                this.showResult(false, "خطای امنیتی", "بارگذاری نشست امنیتی با مشکل مواجه شد. لطفاً صفحه را رفرش کنید.");
            }
        },

        // --- Modal Controller ---
        showModal(config) {
            elements.modalIcon.innerHTML = config.iconHtml;
            elements.modalIcon.className = `modal-icon ${config.type}`;
            elements.modalTitle.textContent = config.title;
            elements.modalTitle.className = `modal-title ${config.type}`;
            elements.modalMessage.textContent = config.message;
            elements.modalActions.innerHTML = '';
            config.buttons.forEach(btnConfig => {
                const button = document.createElement('button');
                button.textContent = btnConfig.text;
                button.className = `modal-btn ${btnConfig.class}`;
                button.onclick = () => {
                    this.hideModal();
                    if (btnConfig.onClick) btnConfig.onClick();
                };
                elements.modalActions.appendChild(button);
            });
            elements.unifiedModal.classList.add('show');
        },
        hideModal() {
            elements.unifiedModal.classList.remove('show');
        },

        // --- Core Functions ---
        checkSession() {
            fetch("/api/ping", { credentials: "include" })
                .then(res => { if (res.status === 401) window.location.href = "/login/login.html"; })
                .catch(() => { window.location.href = "/login/login.html"; });
        },

        async fetchCustomers() {
            try {
                const res = await fetch("/api/customers", { credentials: "include" });
                const customers = await res.json();
                customerPhones = customers.map(c => c.phone);
            } catch (error) {
                console.error("خطا در دریافت لیست مشتریان:", error);
                this.showResult(false, "خطای شبکه", "دریافت لیست مشتریان با مشکل مواجه شد.");
            }
        },

        async handleFormSubmit(e) {
            e.preventDefault();
            const name = elements.nameInput.value.trim();
            const phone = elements.phoneInput.value.trim();
            const initialDebt = elements.initialDebtInput.value.replace(/,/g, '');

            if (customerPhones.includes(phone)) {
                return this.showResult(false, "خطای تکرار", "این شماره موبایل قبلاً ثبت شده است!");
            }

            elements.submitBtn.textContent = "در حال ثبت...";
            elements.submitBtn.disabled = true;
            
            try {
                const res = await fetch("/api/customer", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "X-CSRF-Token": csrfToken // ارسال توکن در هدر
                    },
                    credentials: "include",
                    body: JSON.stringify({ name, phone, initialDebt })
                });
                const data = await res.json();

                if (res.status === 201) {
                    this.showResult(true, "ثبت موفق", "مشتری جدید با موفقیت ثبت شد.", true);
                    customerPhones.push(phone);
                } else {
                    this.showResult(false, "خطا در ثبت", data.message || "خطایی در سمت سرور رخ داد!");
                }
            } catch (error) {
                this.showResult(false, "خطای ارتباط", "ارتباط با سرور برقرار نشد.");
            } finally {
                elements.submitBtn.textContent = "ثبت مشتری";
                elements.submitBtn.disabled = false;
            }
        },

        showResult(isSuccess, title, message, shouldReset = false) {
            this.showModal({
                type: isSuccess ? 'success' : 'error',
                title: title,
                message: message,
                iconHtml: isSuccess 
                    ? `<svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`
                    : `<svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`,
                buttons: [{ text: 'بستن', class: 'secondary' }]
            });

            if (shouldReset) {
                elements.customerForm.reset();
            }
        },

        addEventListeners() {
            elements.customerForm.addEventListener("submit", e => this.handleFormSubmit(e));
            elements.initialDebtInput.addEventListener("input", function(e) {
                let val = e.target.value.replace(/,/g, '');
                if (!val || isNaN(val)) { e.target.value = ''; return; }
                e.target.value = Number(val).toLocaleString('en-US');
            });
            elements.logoutBtn.onclick = () => {
                this.showModal({
                    type: 'confirm',
                    title: 'خروج از سیستم',
                    message: 'آیا برای خروج از حساب کاربری خود اطمینان دارید؟',
                    iconHtml: `<svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>`,
                    buttons: [
                        { text: 'بله، خارج شو', class: 'primary', onClick: () => {
                            fetch('/api/logout', { // اصلاح مسیر
                                method: 'POST', 
                                credentials: 'include',
                                headers: { 'X-CSRF-Token': csrfToken } // ارسال توکن
                            })
                            .then(() => { window.location.href = "/login/login.html"; });
                        }},
                        { text: 'انصراف', class: 'secondary' }
                    ]
                });
            };
            elements.unifiedModal.onclick = (e) => {
                if (e.target === elements.unifiedModal) {
                    this.hideModal();
                }
            };
        }
    };

    App.init();
});