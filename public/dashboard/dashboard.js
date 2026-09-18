document.addEventListener('DOMContentLoaded', function() {
    let csrfToken = null;

    // --- UTILITY: Sanitize HTML to prevent XSS ---
    function sanitizeHTML(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // --- Main Initializer ---
    async function initializeDashboard() {
        try {
            const res = await fetch("/api/ping", { credentials: "include" });
            if (res.status === 401) { window.location.href = "/login/login.html"; return; }
        } catch (error) { window.location.href = "/login/login.html"; return; }

        await fetchCsrfToken();
        setupEventListeners();
        displayCurrentDate();
        fetchDashboardStats();
    }

    async function fetchCsrfToken() {
        try {
            const res = await fetch('/api/csrf-token', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch CSRF token');
            const data = await res.json();
            csrfToken = data.csrfToken;
        } catch (error) { 
            console.error('Could not fetch CSRF token:', error); 
            alert("خطای امنیتی. لطفاً صفحه را رفرش کنید.");
        }
    }

    function setupEventListeners() {
        // --- Modal & Logout Listeners ---
        document.getElementById('logoutBtn').addEventListener('click', () => { document.getElementById('logoutModal').classList.add('show'); });
        document.getElementById('logoutConfirmBtn').addEventListener('click', logout);
        document.getElementById('logoutCancelBtn').addEventListener('click', () => { document.getElementById('logoutModal').classList.remove('show'); });
        document.addEventListener('keydown', e => { if (e.key === "Escape") { document.getElementById('logoutModal').classList.remove('show'); } });

        // --- Navigation Listeners ---
        document.querySelectorAll('.action-card[data-form], .mobile-tab-bar .tab-item[data-form]').forEach(el => {
            el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.form); });
        });

        // --- Inquiry Module Listeners ---
        const tabButtons = document.querySelectorAll('.tab-btn');
        const resultContainer = document.getElementById('inquiryResultContainer');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                document.getElementById(button.dataset.tab).classList.add('active');

                resultContainer.innerHTML = ''; 
                if (button.dataset.tab === 'all-debtors-list') {
                    fetchAllDebtors();
                }
            });
        });

        const searchInput = document.getElementById('customerSearchInput');
        const searchBtn = document.getElementById('customerSearchBtn');
        searchBtn.addEventListener('click', () => fetchCustomerByPhone(searchInput.value));
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') fetchCustomerByPhone(searchInput.value);
        });

        // Event delegation for clickable debtor items
        resultContainer.addEventListener('click', (e) => {
            const debtorItem = e.target.closest('.debtor-list-item');
            if (debtorItem) {
                const phone = debtorItem.dataset.phone;
                document.querySelector('.tab-btn[data-tab="inquiry-by-number"]').click();
                searchInput.value = phone;
                fetchCustomerByPhone(phone);
            }
        });
    }

    // --- Data Fetching Functions ---
    function fetchDashboardStats() {
        fetchKpiData("/api/totalDebt", "totalDebt", data => data.totalDebt);
        fetchKpiData("/api/stats/today", "customerCount", data => data.customerCount);
        fetchKpiData("/api/stats/today", "todayPayments", data => data.todayPayments);
    }
    
    function fetchKpiData(url, elementId, dataExtractor) {
        const element = document.getElementById(elementId);
        fetch(url, { credentials: "include" })
            .then(res => res.ok ? res.json() : Promise.reject('Failed to fetch'))
            .then(data => {
                element.textContent = (dataExtractor(data) || 0).toLocaleString('fa-IR');
                element.classList.remove('loading');
            })
            .catch(() => {
                element.textContent = 'خطا';
                element.classList.remove('loading');
                element.style.fontSize = '1.2rem';
            });
    }

    async function fetchCustomerByPhone(phone) {
        const resultContainer = document.getElementById('inquiryResultContainer');
        if (!/^09\d{9}$/.test(phone)) {
            resultContainer.innerHTML = '<p class="error-msg">فرمت شماره موبایل صحیح نیست.</p>';
            return;
        }
        resultContainer.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const res = await fetch(`/api/customer-inquiry/${phone}`, { credentials: "include" });
            const result = await res.json();
            if (res.ok) {
                resultContainer.innerHTML = createInquiryResultHtml(result.data);
            } else {
                resultContainer.innerHTML = `<p class="error-msg">${sanitizeHTML(result.message)}</p>`;
            }
        } catch (error) {
            resultContainer.innerHTML = '<p class="error-msg">خطای شبکه در ارتباط با سرور.</p>';
        }
    }

    async function fetchAllDebtors() {
        const resultContainer = document.getElementById('inquiryResultContainer');
        resultContainer.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const res = await fetch('/api/debtors', { credentials: 'include' });
            const result = await res.json();
            if (res.ok) {
                if (result.data.debtors.length > 0) {
                     let html = result.data.debtors.map(createDebtorListItem).join('');
                     resultContainer.innerHTML = html;
                } else {
                    resultContainer.innerHTML = '<p>در حال حاضر هیچ مشتری بدهکاری وجود ندارد.</p>';
                }
            } else {
                 resultContainer.innerHTML = `<p class="error-msg">${sanitizeHTML(result.message)}</p>`;
            }
        } catch (error) {
            resultContainer.innerHTML = '<p class="error-msg">خطای شبکه در ارتباط با سرور.</p>';
        }
    }
    
    // --- HTML Generators ---
    function createInquiryResultHtml(data) {
        return `
            ${createCustomerInfoHtml(data)}
            <h4 class="result-title">سوابق تراکنش‌ها</h4>
            ${createTransactionsHtml(data.transactions)}
        `;
    }

    function createCustomerInfoHtml(data) {
        return `
            <div class="result-box">
                <div class="customer-name">${sanitizeHTML(data.name)}</div>
                <div class="debt-stat">${data.debt.toLocaleString('fa-IR')} <small>تومان</small></div>
                <p class="last-update">آخرین بروزرسانی: ${sanitizeHTML(data.lastUpdate)}</p>
            </div>`;
    }

function createTransactionsHtml(transactions) {
        if (!transactions || transactions.length === 0) {
            return `<p style="text-align: center;">تراکنشی یافت نشد.</p>`;
        }
        
        // FIX: The line that reversed the array was removed.
        // The server already provides the transactions sorted correctly (newest first).

        return `<div class="table-wrapper transactions-list-wrapper"><table class="trans-table">
                    <thead><tr><th>تاریخ</th><th>توضیحات</th><th>مبلغ</th><th>مانده</th></tr></thead>
                    <tbody>${transactions.map(t => { // Use the original transactions array
                        let amountCell = '';
                        if (t.paid > 0) {
                            amountCell = `<td data-label="مبلغ"><div class="amount-wrap paid">${t.paid.toLocaleString('fa-IR')} <span class="trans-label paid">پرداخت</span></div></td>`;
                        } else if (t.debtAdded > 0) {
                            amountCell = `<td data-label="مبلغ"><div class="amount-wrap debt">${t.debtAdded.toLocaleString('fa-IR')} <span class="trans-label debt">بدهی</span></div></td>`;
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
    }
    
    function createDebtorListItem(debtor) {
        return `
            <div class="debtor-list-item" data-phone="${debtor.phone}" style="cursor: pointer;">
                 <div class="debtor-list-item-header">
                    <h3>${sanitizeHTML(debtor.name)}</h3>
                    <span class="debt-status has-debt">${debtor.debt.toLocaleString('fa-IR')} تومان</span>
                </div>
            </div>
        `;
    }
    
    // --- Utility Functions ---
    function displayCurrentDate() {
        const element = document.getElementById('currentDate');
        if (element) {
            const today = new Date();
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            element.textContent = today.toLocaleDateString('fa-IR', options);
        }
    }

    function logout() {
        fetch('/api/logout', { 
            method: 'POST', 
            credentials: 'include', 
            headers: { 'X-CSRF-Token': csrfToken } 
        })
        .finally(() => { window.location.href = "/login/login.html"; });
    }

    function navigate(formName) {
        const pages = {
            customer: '/customer/customerForm.html',
            payment: '/payment/paymentForm.html',
            debt: '/debt/debtForm.html',
            bulkSMS: '/bulksms/bulkSMSForm.html',
            customerInquiry: '/customer-inquiry/customerInquiryForm.html'
        };
        if (pages[formName]) window.location.href = pages[formName];
    }
    
    // --- Start the App ---
    initializeDashboard();
});