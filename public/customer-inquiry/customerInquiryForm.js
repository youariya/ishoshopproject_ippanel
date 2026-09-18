document.addEventListener('DOMContentLoaded', () => {
    // --- UTILITY: Sanitize HTML to prevent XSS ---
    function sanitizeHTML(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // --- Elements ---
    const elements = {
        phoneInput: document.getElementById('phone'),
        inquiryBtn: document.getElementById('inquiryBtn'),
        resultContainer: document.getElementById('result-container'),
        logoutBtn: document.getElementById('logoutBtn'),
        logoutModal: document.getElementById('logoutModal'),
        tabButtons: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        logoutConfirmBtn: document.getElementById('logoutConfirmBtn'),
        logoutCancelBtn: document.getElementById('logoutCancelBtn'),
    };

    let csrfToken = null; // متغیر برای نگهداری توکن امنیتی

    // --- Main App Logic ---
    const App = {
        async init() {
            this.checkSession();
            await this.fetchCsrfToken(); // دریافت توکن در ابتدای کار
            this.addEventListeners();
        },
        
        async fetchCsrfToken() {
            try {
                const res = await fetch('/api/csrf-token', { credentials: 'include' });
                if (!res.ok) throw new Error('Network response was not ok');
                const data = await res.json();
                csrfToken = data.csrfToken;
            } catch (error) {
                console.error('Could not fetch CSRF token:', error);
                this.renderError("خطای امنیتی. بارگذاری نشست امنیتی با مشکل مواجه شد.");
            }
        },

        checkSession() {
            fetch("/api/ping", { credentials: "include" })
                .then(res => { if (res.status === 401) window.location.href = "/login/login.html"; })
                .catch(() => { window.location.href = "/login/login.html"; });
        },

        switchTab(targetTabId) {
            elements.tabContents.forEach(content => content.classList.remove('active'));
            elements.tabButtons.forEach(button => button.classList.remove('active'));
            
            const contentToShow = document.getElementById(`${targetTabId}-tab`);
            if(contentToShow) contentToShow.classList.add('active');

            const buttonToActivate = document.querySelector(`.tab-btn[data-tab="${targetTabId}"]`);
            if(buttonToActivate) buttonToActivate.classList.add('active');

            elements.resultContainer.innerHTML = '';
            
            if (targetTabId === 'debtors') {
                this.handleShowDebtors();
            }
        },

        async handleInquiry() {
            const phone = elements.phoneInput.value.trim();
            if (!/^09\d{9}$/.test(phone)) {
                return this.renderError("فرمت شماره موبایل صحیح نیست.");
            }
            this.renderLoading();
            try {
                const res = await fetch(`/api/customer-inquiry/${phone}`, { credentials: 'include' });
                const result = await res.json();
                if (res.ok) {
                    this.renderInquiryResult(result.data);
                } else {
                    this.renderError(result.message);
                }
            } catch (error) {
                this.renderError("خطای شبکه در ارتباط با سرور.");
            }
        },

        async handleShowDebtors() {
            this.renderLoading();
            try {
                const res = await fetch('/api/debtors', { credentials: 'include' });
                const result = await res.json();
                if (res.ok) {
                    this.renderDebtorsList(result.data);
                } else {
                    this.renderError(result.message);
                }
            } catch (error) {
                this.renderError("خطای شبکه در ارتباط با سرور.");
            }
        },
        
        async handleShowDebtorDetails(phone) {
            this.renderLoading();
            try {
                const res = await fetch(`/api/customer-inquiry/${phone}`, { credentials: 'include' });
                const result = await res.json();
                if (res.ok) {
                    this.renderSingleDebtorDetail(result.data);
                } else {
                    this.renderError(result.message);
                }
            } catch (error) {
                this.renderError("خطای شبکه در ارتباط با سرور.");
            }
        },

        renderLoading() {
            elements.resultContainer.innerHTML = `<div class="loading-spinner"></div>`;
        },

        renderError(message) {
            elements.resultContainer.innerHTML = `<div class="error-box">${sanitizeHTML(message)}</div>`;
        },
        
        renderInquiryResult(data) {
            const transactionsHtml = this.createTransactionsHtml(data.transactions);
            elements.resultContainer.innerHTML = `
                ${this.createCustomerInfoHtml(data)}
                <h4 class="result-title">سوابق تراکنش‌ها</h4>
                ${transactionsHtml}
            `;
        },
        
        renderSingleDebtorDetail(data) {
            const transactionsHtml = this.createTransactionsHtml(data.transactions);
            elements.resultContainer.innerHTML = `
                <div class="back-to-list-wrapper">
                    <button id="backToDebtorsBtn" class="back-btn">
                        <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
                        <span>بازگشت به لیست بدهکاران</span>
                    </button>
                </div>
                ${this.createCustomerInfoHtml(data)}
                <h4 class="result-title">سوابق تراکنش‌ها</h4>
                ${transactionsHtml}
            `;
        },

        renderDebtorsList(data) {
            if (data.debtors.length === 0) {
                return this.renderError("در حال حاضر هیچ مشتری بدهکاری وجود ندارد.");
            }
            const debtorsHtml = `
                <h4 class="result-title">لیست تمام بدهکاران</h4>
                <div class="total-debt-summary">
                    مجموع کل بدهی‌ها: ${data.totalDebtorsDebt.toLocaleString('fa-IR')} تومان
                </div>
                <div class="table-wrapper debtors-list-wrapper">
                    <table class="trans-table debtors-table">
                        <thead><tr><th>نام مشتری</th><th>شماره</th><th>مبلغ بدهی (تومان)</th></tr></thead>
                        <tbody>${data.debtors.map(d => `
                            <tr class="clickable-row" data-phone="${d.phone}">
                                <td data-label="نام مشتری">${sanitizeHTML(d.name)}</td>
                                <td data-label="شماره">${sanitizeHTML(d.phone)}</td>
                                <td data-label="مبلغ بدهی" class="debt">${d.debt.toLocaleString('fa-IR')}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
            elements.resultContainer.innerHTML = debtorsHtml;
        },

        createCustomerInfoHtml(data) {
            return `
                <div class="result-box">
                    <div class="customer-name">${sanitizeHTML(data.name)}</div>
                    <div class="debt-stat">${data.debt.toLocaleString('fa-IR')} <small>تومان</small></div>
                    <p class="last-update">آخرین بروزرسانی: ${sanitizeHTML(data.lastUpdate)}</p>
                </div>`;
        },

        createTransactionsHtml(transactions) {
            if (transactions.length === 0) {
                return `<p class="text-center text-gray-500 mt-4">تراکنشی برای این مشتری ثبت نشده است.</p>`;
            }
            return `<div class="table-wrapper transactions-list-wrapper"><table class="trans-table">
                        <thead><tr><th>تاریخ</th><th>توضیحات</th><th>مبلغ</th><th>مانده</th></tr></thead>
                        <tbody>${transactions.map(t => {
                            let amountCell = '';
                            if (t.paid > 0) {
                                amountCell = `<td data-label="مبلغ"><div class="amount-wrap paid">${t.paid.toLocaleString('fa-IR')} <span class="trans-label">پرداخت</span></div></td>`;
                            } else if (t.debtAdded > 0) {
                                amountCell = `<td data-label="مبلغ"><div class="amount-wrap debt">${t.debtAdded.toLocaleString('fa-IR')} <span class="trans-label">بدهی</span></div></td>`;
                            } else {
                                amountCell = `<td data-label="مبلغ">-</td>`;
                            }

                            return `
                                <tr>
                                    <td data-label="تاریخ">${sanitizeHTML(t.formattedDate)}</td>
                                    <td data-label="توضیحات">${sanitizeHTML(t.description || '')}</td>
                                    ${amountCell}
                                    <td data-label="مانده">${t.remainDebt.toLocaleString('fa-IR')}</td>
                                </tr>
                            `;
                        }).join('')}
                        </tbody>
                    </table></div>`;
        },

        addEventListeners() {
            elements.inquiryBtn.onclick = () => this.handleInquiry();
            elements.phoneInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleInquiry();
            });
            elements.tabButtons.forEach(button => {
                button.onclick = () => this.switchTab(button.dataset.tab);
            });

            elements.resultContainer.addEventListener('click', (e) => {
                const clickableRow = e.target.closest('.clickable-row');
                const backButton = e.target.closest('#backToDebtorsBtn');

                if (clickableRow) {
                    this.handleShowDebtorDetails(clickableRow.dataset.phone);
                } else if (backButton) {
                    this.handleShowDebtors();
                }
            });
            
            elements.logoutBtn.onclick = () => elements.logoutModal.classList.add('show');
            elements.logoutCancelBtn.onclick = () => elements.logoutModal.classList.remove('show');
            elements.logoutConfirmBtn.onclick = () => {
                fetch('/api/logout', {
                    method: 'POST', 
                    credentials: 'include',
                    headers: { 'X-CSRF-Token': csrfToken } // ارسال توکن امنیتی
                })
                .then(() => { window.location.href = "/login/login.html"; });
            };
            elements.logoutModal.onclick = (e) => {
                if (e.target === elements.logoutModal) elements.logoutModal.classList.remove('show');
            };
        },
    };
    
    App.init();
});