// public/payment/paymentForm.js
document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        phoneInput: document.getElementById('phone'),
        lookupBtn: document.getElementById('lookupBtn'),
        phoneError: document.getElementById('phoneError'),
        customerDetails: document.getElementById('customerDetails'),
        customerNameSpan: document.getElementById('customerName'),
        customerDebtSpan: document.getElementById('customerDebt'),
        paymentForm: document.getElementById('paymentForm'),
        amountInput: document.getElementById('amount'),
        descriptionInput: document.getElementById('description'),
        submitBtn: document.getElementById('paymentForm').querySelector('.submit-btn'),
        logoutBtn: document.getElementById('logoutBtn'),
        unifiedModal: document.getElementById('unifiedModal'),
        modalIcon: document.getElementById('modalIcon'),
        modalTitle: document.getElementById('modalTitle'),
        modalMessage: document.getElementById('modalMessage'),
        modalActions: document.getElementById('modalActions'),
    };
    
    let allCustomers = [];
    let selectedCustomer = null;
    let csrfToken = null; // متغیر برای نگهداری توکن امنیتی

    const App = {
        async init() {
            this.checkSession();
            await this.fetchCsrfToken(); // دریافت توکن در ابتدای کار
            this.addEventListeners();
            this.fetchCustomers();
        },

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
                button.onclick = () => { this.hideModal(); if (btnConfig.onClick) btnConfig.onClick(); };
                elements.modalActions.appendChild(button);
            });
            elements.unifiedModal.classList.add('show');
        },
        hideModal() { elements.unifiedModal.classList.remove('show'); },

        checkSession() {
            fetch("/api/ping", { credentials: "include" })
                .then(res => { if (res.status === 401) window.location.href = "/login/login.html"; })
                .catch(() => { window.location.href = "/login/login.html"; });
        },

        async fetchCustomers() {
            elements.lookupBtn.disabled = true;
            try {
                const res = await fetch('/api/customers', { credentials: "include" });
                allCustomers = await res.json();
            } catch (error) {
                this.showError("خطا در بارگذاری لیست مشتریان");
            } finally {
                elements.lookupBtn.disabled = false;
            }
        },

        handleLookup() {
            const phone = elements.phoneInput.value.trim();
            this.resetForm();
            if (!/^09\d{9}$/.test(phone)) {
                return this.showError("شماره موبایل وارد شده معتبر نیست.");
            }
            selectedCustomer = allCustomers.find(c => c.phone === phone);
            if (selectedCustomer) {
                elements.customerNameSpan.textContent = selectedCustomer.name;
                elements.customerDebtSpan.textContent = Number(selectedCustomer.debt).toLocaleString('fa-IR');
                elements.customerDetails.classList.remove('hidden');
                elements.amountInput.disabled = false;
                elements.descriptionInput.disabled = false;
                elements.submitBtn.disabled = false;
                elements.amountInput.placeholder = "مثال: 500,000";
                elements.amountInput.focus();
            } else {
                this.showError("مشتری با این شماره موبایل یافت نشد.");
            }
        },

        async handlePaymentSubmit(e) {
            e.preventDefault();
            const amount = elements.amountInput.value.replace(/,/g, '');
            const description = elements.descriptionInput.value.trim();
            if (!amount || isNaN(amount) || Number(amount) <= 0) {
                return this.showResult(false, "خطای ورودی", "مبلغ وارد شده معتبر نیست.");
            }
            if (!selectedCustomer) return;
            
            elements.submitBtn.disabled = true;
            elements.submitBtn.textContent = 'در حال ثبت...';
            try {
                const res = await fetch('/api/transaction', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken // ارسال توکن امنیتی در هدر
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        customerId: selectedCustomer.id, type: 'paid', amount: amount,
                        description: description, date: new Date().toLocaleDateString('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/')
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    this.showResult(true, "ثبت موفق", "پرداخت با موفقیت در سیستم ثبت شد.", true);
                } else {
                    this.showResult(false, "خطا در ثبت", data.message || "خطا در ثبت پرداخت.");
                }
            } catch (error) {
                this.showResult(false, "خطای شبکه", "ارتباط با سرور برقرار نشد.");
            } finally {
                elements.submitBtn.disabled = false;
                elements.submitBtn.textContent = 'ثبت پرداخت';
            }
        },

        resetForm(hardReset = false) {
            elements.customerDetails.classList.add('hidden');
            elements.paymentForm.reset();
            this.showError('');
            elements.amountInput.disabled = true;
            elements.descriptionInput.disabled = true;
            elements.submitBtn.disabled = true;
            elements.amountInput.placeholder = "ابتدا مشتری را انتخاب کنید";
            selectedCustomer = null;
            if (hardReset) {
                elements.phoneInput.value = '';
            }
        },

        showError(msg) {
            elements.phoneError.textContent = msg;
            elements.phoneError.style.display = msg ? 'block' : 'none';
        },

        showResult(isSuccess, title, message, shouldReset = false) {
            this.showModal({
                type: isSuccess ? 'success' : 'error', title: title, message: message,
                iconHtml: isSuccess ? `<svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>` : `<svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`,
                buttons: [{ text: 'بستن', class: 'secondary' }]
            });
            if (shouldReset) {
                this.resetForm(true);
                this.fetchCustomers();
            }
        },

        addEventListeners() {
            elements.lookupBtn.onclick = () => this.handleLookup();
            elements.paymentForm.onsubmit = e => this.handlePaymentSubmit(e);
            elements.amountInput.addEventListener("input", function(e) {
                let val = e.target.value.replace(/,/g, '');
                if (!val || isNaN(val)) { e.target.value = ''; return; }
                e.target.value = Number(val).toLocaleString('en-US');
            });
            elements.logoutBtn.onclick = () => {
                this.showModal({
                    type: 'confirm', title: 'خروج از سیستم', message: 'آیا برای خروج از حساب کاربری خود اطمینان دارید؟',
                    iconHtml: `<svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>`,
                    buttons: [
                        { text: 'بله، خارج شو', class: 'primary', onClick: () => {
                            fetch('/api/logout', {
                                method: 'POST', 
                                credentials: 'include',
                                headers: { 'X-CSRF-Token': csrfToken }
                            })
                            .then(() => { window.location.href = "/login/login.html"; });
                        }},
                        { text: 'انصراف', class: 'secondary' }
                    ]
                });
            };
            elements.unifiedModal.onclick = (e) => {
                if (e.target === elements.unifiedModal) this.hideModal();
            };
        }
    };
    App.init();
});