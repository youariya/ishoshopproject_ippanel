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
        customerListBody: document.getElementById('customerList'),
        searchInput: document.getElementById('searchInput'),
        customerFilter: document.getElementById('customerFilter'),
        selectAllCheckbox: document.getElementById('selectAll'),
        messageInput: document.getElementById('messageInput'),
        sendBtn: document.getElementById('sendBtn'),
        previewBox: document.getElementById('previewBox'),
        previewMsgSpan: document.getElementById('previewMsg'),
        selectedCountSpan: document.getElementById('selectedCount'),
        charCounter: document.getElementById('charCounter'),
        logoutBtn: document.getElementById('logoutBtn'),
        unifiedModal: document.getElementById('unifiedModal'),
        modalIcon: document.getElementById('modalIcon'),
        modalTitle: document.getElementById('modalTitle'),
        modalMessage: document.getElementById('modalMessage'),
        modalActions: document.getElementById('modalActions'),
    };

    let allCustomers = [], displayedCustomers = [], selectedPhones = new Set();
    let csrfToken = null;

    // --- Main App Logic ---
    const App = {
        async init() {
            this.checkSession();
            await this.fetchCsrfToken();
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
                button.onclick = () => { this.hideModal(); if (btnConfig.onClick) btnConfig.onClick(); };
                elements.modalActions.appendChild(button);
            });
            elements.unifiedModal.classList.add('show');
        },
        hideModal() { elements.unifiedModal.classList.remove('show'); },
        
        // --- Core Functions ---
        checkSession() {
            fetch("/api/ping", { credentials: "include" })
                .then(res => { if (res.status === 401) window.location.href = "/login/login.html"; })
                .catch(() => { window.location.href = "/login/login.html"; });
        },

        async fetchCustomers() {
            try {
                const res = await fetch('/api/customers', { credentials: "include" });
                allCustomers = await res.json();
                this.updateDisplayedCustomers();
            } catch (error) {
                elements.customerListBody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500">خطا در بارگذاری مشتریان</td></tr>`;
            }
        },

        render() {
            let html = "";
            if (!displayedCustomers.length) {
                html = `<tr><td colspan="4" class="text-center text-gray-400 p-4">موردی یافت نشد</td></tr>`;
            } else {
                html = displayedCustomers.map(c => `
                    <tr class="${selectedPhones.has(c.phone) ? 'selected-row' : ''}">
                        <td class="text-center"><input type="checkbox" class="custom-checkbox" value="${sanitizeHTML(c.phone)}" ${selectedPhones.has(c.phone) ? 'checked' : ''}></td>
                        <td>${sanitizeHTML(c.name || '-')}</td>
                        <td>${sanitizeHTML(c.phone)}</td>
                        <td>${c.debt ? Number(c.debt).toLocaleString('fa-IR') : '۰'}</td>
                    </tr>
                `).join('');
            }
            elements.customerListBody.innerHTML = html;
            this.updateUIState();
        },

        updateDisplayedCustomers() {
            const searchTerm = elements.searchInput.value.trim().toLowerCase();
            const filterType = elements.customerFilter.value;
            const selected = allCustomers.filter(c => selectedPhones.has(c.phone));
            const unselectedAndMatching = allCustomers.filter(c => {
                if (selectedPhones.has(c.phone)) return false;
                const matchesFilter = (filterType === 'all') || (filterType === 'debtors' && Number(c.debt) > 0) || (filterType === 'noDebt' && !Number(c.debt));
                const matchesSearch = !searchTerm || (c.name && c.name.toLowerCase().includes(searchTerm)) || (c.phone && c.phone.includes(searchTerm));
                return matchesFilter && matchesSearch;
            });
            displayedCustomers = [...selected, ...unselectedAndMatching];
            this.render();
        },

        updateUIState() {
            const count = selectedPhones.size;
            elements.selectedCountSpan.textContent = count > 0 ? `${count} گیرنده انتخاب شده` : '';
            const allVisibleSelected = displayedCustomers.length > 0 && displayedCustomers.every(c => selectedPhones.has(c.phone));
            elements.selectAllCheckbox.checked = allVisibleSelected;
            if (count > 0 && elements.messageInput.value.trim()) {
                elements.sendBtn.disabled = false;
                elements.sendBtn.textContent = `ارسال به ${count} نفر`;
            } else {
                elements.sendBtn.disabled = true;
                elements.sendBtn.textContent = count === 0 ? `گیرنده را انتخاب کنید` : `پیام را بنویسید`;
            }
        },

        updatePreviewAndCounter() {
            const message = elements.messageInput.value;
            const len = message.length;
            const smsCount = len <= 70 ? 1 : Math.ceil(len / 67);
            elements.charCounter.textContent = `${len} کاراکتر / ${smsCount} پیامک`;
            if (message) {
                elements.previewBox.style.display = 'block';
                elements.previewMsgSpan.textContent = message;
            } else {
                elements.previewBox.style.display = 'none';
            }
            this.updateUIState();
        },
        
        async handleFormSubmit(e) {
            e.preventDefault();
            const message = elements.messageInput.value.trim();
            const recipients = Array.from(selectedPhones);
            if (!message || recipients.length === 0) return;

            this.showModal({
                type: 'confirm', title: 'تایید ارسال', message: `آیا از ارسال این پیامک به ${recipients.length} نفر مطمئن هستید؟`,
                iconHtml: `<svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>`,
                buttons: [
                    { text: 'بله، ارسال کن', class: 'primary', onClick: () => this.sendSmsLogic(recipients, message) },
                    { text: 'انصراف', class: 'secondary' }
                ]
            });
        },

        async sendSmsLogic(recipients, message) {
            elements.sendBtn.disabled = true;
            elements.sendBtn.textContent = "در حال ارسال...";
            try {
                const customersPayload = allCustomers.filter(c => recipients.includes(c.phone)).map(c => ({ phone: c.phone, name: c.name || 'مشتری' }));
                
                const res = await fetch("/api/bulk-sms", { 
                    method: "POST", 
                    credentials: "include", 
                    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, 
                    body: JSON.stringify({ customers: customersPayload, message }) 
                });

                const data = await res.json();

                if (!res.ok) { // بررسی خطاهای سرور مانند 500 یا 400
                    this.showResult(false, "خطا در عملیات", data.message || "خطای ناشناخته از سمت سرور.", false);
                    return;
                }

                if (data.status === 'success') {
                    this.showResult(true, "ارسال موفق", data.message, true);
                } else if (data.status === 'partial_success') {
                    this.showResult(false, "ارسال با خطا", data.message, true);
                } else {
                    this.showResult(false, "خطا در ارسال", data.message, false);
                }

            } catch (error) {
                this.showResult(false, "خطای شبکه", "ارتباط با سرور برقرار نشد.", false);
            } finally {
                elements.sendBtn.disabled = false;
                this.updateUIState();
            }
        },

        showResult(isSuccess, title, message, shouldReset = false) {
            const displayMessage = message || "پاسخی از سرور دریافت نشد.";
            this.showModal({
                type: isSuccess ? 'success' : 'error', 
                title: title, 
                message: displayMessage,
                iconHtml: isSuccess ? `<svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>` : `<svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`,
                buttons: [{ text: 'بستن', class: 'secondary' }]
            });

            if (shouldReset) {
                elements.messageInput.value = '';
                selectedPhones.clear();
                this.updateDisplayedCustomers();
                this.updatePreviewAndCounter();
            }
        },

        addEventListeners() {
            elements.customerFilter.onchange = () => this.updateDisplayedCustomers();
            elements.searchInput.oninput = () => this.updateDisplayedCustomers();
            elements.messageInput.oninput = () => this.updatePreviewAndCounter();
            elements.selectAllCheckbox.onchange = () => {
                const isChecked = elements.selectAllCheckbox.checked;
                displayedCustomers.forEach(c => {
                    if (isChecked) selectedPhones.add(c.phone);
                    else selectedPhones.delete(c.phone);
                });
                this.render();
            };
            elements.customerListBody.addEventListener('change', e => {
                if (e.target.type === 'checkbox') {
                    const phone = e.target.value;
                    if (e.target.checked) selectedPhones.add(phone);
                    else selectedPhones.delete(phone);
                    this.updateDisplayedCustomers();
                }
            });
            document.getElementById('smsForm').onsubmit = e => this.handleFormSubmit(e);
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
//
