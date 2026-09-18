document.addEventListener('DOMContentLoaded', function() {
    // --- State Variables ---
    let csrfToken = null;
    let selectedCustomerId = null;

    // --- DOM Elements ---
    const lookupBtn = document.getElementById('lookupBtn');
    const phoneInput = document.getElementById('phone');
    const phoneError = document.getElementById('phoneError');
    const customerDetailsDiv = document.getElementById('customerDetails');
    const customerNameSpan = document.getElementById('customerName');
    const customerDebtSpan = document.getElementById('customerDebt');
    const debtForm = document.getElementById('debtForm');
    const amountInput = document.getElementById('amount');
    const descriptionInput = document.getElementById('description');
    const submitBtn = document.getElementById('submit-btn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // Modal Elements
    const modal = document.getElementById('unifiedModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalIcon = document.getElementById('modalIcon');
    const modalActions = document.getElementById('modalActions');

    // --- UTILITY FUNCTIONS ---
    
    // FIX: Added function to convert Persian/Arabic numerals to English
    function fixNumbers(str) {
      if (str === null || str === undefined) return '';
      str = String(str);
      const fa = [/[\u06F0-\u06F9]/g, /[\u0660-\u0669]/g];
      const en = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      return str.replace(fa[0], d => en[d.charCodeAt(0) - 0x06F0])
                .replace(fa[1], d => en[d.charCodeAt(0) - 0x0660]);
    }

    function sanitizeHTML(str) {
        if (!str) return '';
        return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    
    function showModal(type, title, message, actions = []) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        
        const icons = {
            success: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path></svg>`,
            error: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>`,
            confirm: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"></path></svg>`
        };
        modalIcon.innerHTML = icons[type] || '';
        modalIcon.className = `modal-icon ${type}`;

        modalActions.innerHTML = '';
        actions.forEach(action => {
            const button = document.createElement('button');
            button.className = `modal-btn ${action.className}`;
            button.textContent = action.text;
            button.onclick = action.onClick;
            modalActions.appendChild(button);
        });

        modal.classList.add('show');
    }

    function closeModal() {
        modal.classList.remove('show');
    }

    function formatAmount() {
        // FIX: Use fixNumbers to handle Persian numeral input
        let value = fixNumbers(amountInput.value.replace(/,/g, ''));
        if (!isNaN(value) && value.length > 0) {
            amountInput.value = parseInt(value, 10).toLocaleString('en-US');
        } else {
            amountInput.value = '';
        }
    }

    // --- CORE LOGIC ---
    async function fetchCsrfToken() {
        try {
            const res = await fetch('/api/csrf-token', { credentials: 'include' });
            if (res.status === 401) {
                window.location.href = '/login/login.html';
                return;
            }
            if (!res.ok) {
                throw new Error('CSRF token fetch failed with status: ' + res.status);
            }
            const data = await res.json();
            csrfToken = data.csrfToken;
        } catch (error) {
            showModal('error', 'خطای ارتباط', 'ارتباط با سرور برقرار نشد. لطفا صفحه را مجددا بارگیری کنید.');
        }
    }

    async function handleLookup() {
        const phone = phoneInput.value;
        if (!/^09\d{9}$/.test(phone)) {
            phoneError.textContent = 'فرمت شماره موبایل (09xxxxxxxxx) صحیح نیست.';
            phoneError.style.display = 'block';
            return;
        }
        phoneError.style.display = 'none';
        lookupBtn.disabled = true;
        lookupBtn.textContent = '...';

        try {
            const res = await fetch(`/api/customer-inquiry/${phone}`, { credentials: "include" });
             if (res.status === 401) {
                window.location.href = '/login/login.html';
                return;
            }
            const result = await res.json();

            if (res.ok) {
                selectedCustomerId = result.data.id;
                customerNameSpan.textContent = sanitizeHTML(result.data.name);
                customerDebtSpan.textContent = result.data.debt.toLocaleString('fa-IR');
                customerDetailsDiv.classList.remove('hidden');
                
                amountInput.disabled = false;
                descriptionInput.disabled = false;
                submitBtn.disabled = false;
                amountInput.focus();
            } else {
                showModal('error', 'خطا', result.message || 'مشتری با این شماره یافت نشد.');
                resetFormState();
            }
        } catch (error) {
            showModal('error', 'خطای شبکه', 'مشکل در ارتباط با سرور. لطفاً اتصال خود را بررسی کنید.');
            resetFormState();
        } finally {
            lookupBtn.disabled = false;
            lookupBtn.textContent = 'بررسی';
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (!selectedCustomerId || submitBtn.disabled) return;

        // FIX: Use fixNumbers before validation and sending to the server
        const amountValue = fixNumbers(amountInput.value.replace(/,/g, ''));
        if (!amountValue || isNaN(amountValue) || Number(amountValue) <= 0) {
            showModal('error', 'خطای ورودی', 'لطفاً مبلغ بدهی را به درستی وارد کنید.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'در حال ثبت...';

        try {
            const res = await fetch('/api/transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({
                    customerId: selectedCustomerId,
                    type: 'debt',
                    amount: Number(amountValue),
                    description: descriptionInput.value
                })
            });

            if (res.status === 401) {
                window.location.href = '/login/login.html';
                return;
            }

            const result = await res.json();
            if (res.ok) {
                showModal('success', 'موفقیت', 'بدهی جدید با موفقیت برای مشتری ثبت شد.', [
                    { text: 'بسیار خب', className: 'primary', onClick: () => {
                        resetFormState();
                        closeModal();
                    }}
                ]);
            } else {
                showModal('error', 'خطا', result.message || 'خطایی در هنگام ثبت رخ داد.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'ثبت بدهی';
            }
        } catch (error) {
            showModal('error', 'خطای شبکه', 'ارتباط با سرور برقرار نشد.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'ثبت بدهی';
        }
    }
    
    function resetFormState() {
        debtForm.reset();
        customerDetailsDiv.classList.add('hidden');
        amountInput.disabled = true;
        descriptionInput.disabled = true;
        submitBtn.disabled = true;
        submitBtn.textContent = 'ثبت بدهی';
        selectedCustomerId = null;
        phoneInput.value = '';
        phoneInput.focus();
    }
    
    function handleLogout() {
        showModal('confirm', 'خروج از سیستم', 'آیا برای خروج از حساب کاربری خود اطمینان دارید؟', [
            { text: 'بله، خارج شو', className: 'primary', onClick: async () => {
                await fetch('/api/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrfToken } });
                window.location.href = "/login/login.html";
            }},
            { text: 'انصراف', className: 'secondary', onClick: closeModal }
        ]);
    }

    // --- Initialize Page ---
    phoneInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); handleLookup(); } });
    lookupBtn.addEventListener('click', handleLookup);
    amountInput.addEventListener('input', formatAmount);
    debtForm.addEventListener('submit', handleSubmit);
    logoutBtn.addEventListener('click', handleLogout);

    fetchCsrfToken();
});
