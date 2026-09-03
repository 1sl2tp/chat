/**
 * TAPHOA Workspace - Core Application Logic
 * File: app.js
 */

// ==========================================
// 1. UI MODULE (Giao diện, Modal, Toast, Tab)
// ==========================================
const UIModule = {
    toggleDropdown(id) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden');
    },

    toggleElement(id) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden');
    },

    openModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    },

    closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    },

    openLightbox(url) {
        const img = document.getElementById('lightboxImg');
        if (img) {
            img.src = url;
            this.openModal('lightboxModal');
        }
    },

    switchTab(tabId) {
        const convTab = document.getElementById('conversationsTab');
        const callTab = document.getElementById('callsTab');
        const btnChat = document.getElementById('tabBtnChat');
        const btnCall = document.getElementById('tabBtnCall');

        if (tabId === 'conversationsTab') {
            convTab.classList.remove('hidden');
            callTab.classList.add('hidden');
            btnChat.className = 'px-3 py-1 font-bold text-white bg-slate-800 rounded-lg';
            btnCall.className = 'px-3 py-1 font-bold text-slate-400 hover:text-white rounded-lg';
        } else {
            convTab.classList.add('hidden');
            callTab.classList.remove('hidden');
            btnCall.className = 'px-3 py-1 font-bold text-white bg-slate-800 rounded-lg';
            btnChat.className = 'px-3 py-1 font-bold text-slate-400 hover:text-white rounded-lg';
        }
    },

    selectChat(chatCode) {
        this.showToast(`Đã chuyển sang cuộc trò chuyện: ${chatCode}`);
    },

    copyText(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            this.showToast(`Đã sao chép: ${text}`);
        } else {
            this.showToast("Không hỗ trợ Clipboard API");
        }
    },

    shareLink(url) {
        if (navigator.share) {
            navigator.share({ title: 'Chia sẻ từ TAPHOA', url: url }).catch(() => {});
        } else {
            this.copyText(url);
            this.showToast("Đã sao chép liên kết vào bộ nhớ tạm!");
        }
    },

    showToast(msg) {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toastMsg');
        if (toast && toastMsg) {
            toastMsg.innerText = msg;
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 2800);
        }
    },

    newChat() {
        this.showToast("Mở giao diện khởi tạo cuộc trò chuyện mới...");
    },

    logout() {
        if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?")) {
            this.showToast("Đang đăng xuất...");
            setTimeout(() => location.reload(), 1000);
        }
    }
};

// ==========================================
// 2. CHAT & MULTIMEDIA MODULE
// ==========================================
const ChatModule = {
    recordingInterval: null,
    recordSeconds: 0,
    currentQuoteText: '',

    sendMessage() {
        const input = document.getElementById('mainComposer');
        const text = input ? input.value.trim() : '';
        if (!text) return;

        const stream = document.getElementById('messageStream');
        const msgId = 'msg-' + Date.now();

        let quoteHTML = '';
        if (this.currentQuoteText) {
            quoteHTML = `
                <div class="bg-slate-950/80 border-l-2 border-cw-500 p-1.5 rounded text-[11px] text-slate-300 mb-1.5 truncate">
                    <span class="text-cw-400 font-bold block text-[9px]">Đã trích dẫn:</span>
                    ${this.currentQuoteText}
                </div>
            `;
            this.closeQuote();
        }

        const bubble = `
            <div class="flex items-start justify-end space-x-2 group" id="${msgId}">
                <div class="space-y-1 max-w-md">
                    <div class="bg-cw-600 p-3 rounded-2xl text-xs text-white space-y-1 shadow-md relative">
                        ${quoteHTML}
                        <p>${this.escapeHTML(text)}</p>
                        <span class="text-[9px] text-cw-200 block text-right mt-1 font-mono">Đã gửi • Vừa xong</span>
                        
                        <div class="absolute -top-3 left-2 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition flex space-x-1 shadow-lg text-xs">
                            <button onclick="ChatModule.addReaction('${msgId}', '👍')" class="hover:scale-125 transition">👍</button>
                            <button onclick="ChatModule.addReaction('${msgId}', '❤️')" class="hover:scale-125 transition">❤️</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (stream) {
            stream.insertAdjacentHTML('beforeend', bubble);
            input.value = '';
            stream.scrollTop = stream.scrollHeight;
        }
    },

    quoteMessage(text) {
        this.currentQuoteText = text;
        const box = document.getElementById('quoteBox');
        const txt = document.getElementById('quoteText');
        if (box && txt) {
            txt.innerText = text;
            box.classList.remove('hidden');
        }
    },

    closeQuote() {
        this.currentQuoteText = '';
        const box = document.getElementById('quoteBox');
        if (box) box.classList.add('hidden');
    },

    addReaction(msgId, emoji) {
        const msgEl = document.getElementById(msgId);
        if (msgEl) {
            let reacContainer = msgEl.querySelector('.reaction-badge');
            if (!reacContainer) {
                reacContainer = document.createElement('div');
                reacContainer.className = 'reaction-badge text-[11px] bg-slate-900 border border-slate-700 rounded-full px-1.5 py-0.5 mt-1 inline-block shadow';
                msgEl.querySelector('.space-y-1').appendChild(reacContainer);
            }
            reacContainer.innerText = emoji;
            UIModule.showToast(`Đã thả cảm xúc ${emoji}`);
        }
    },

    triggerFileInput(acceptType) {
        const fileInput = document.getElementById('hiddenFileInput');
        if (fileInput) {
            fileInput.accept = acceptType;
            fileInput.click();
            UIModule.toggleDropdown('attachMenu');
        }
    },

    handleFileSelected(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            UIModule.showToast(`Đã tải lên tệp: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
        }
    },

    startVoiceRecord() {
        const bar = document.getElementById('voiceRecorderBar');
        const timer = document.getElementById('recordTimer');
        if (bar) {
            bar.classList.remove('hidden');
            this.recordSeconds = 0;
            if (timer) timer.innerText = "00:00";

            clearInterval(this.recordingInterval);
            this.recordingInterval = setInterval(() => {
                this.recordSeconds++;
                const sec = String(this.recordSeconds % 60).padStart(2, '0');
                const min = String(Math.floor(this.recordSeconds / 60)).padStart(2, '0');
                if (timer) timer.innerText = `${min}:${sec}`;
            }, 1000);
        }
    },

    cancelVoiceRecord() {
        clearInterval(this.recordingInterval);
        const bar = document.getElementById('voiceRecorderBar');
        if (bar) bar.classList.add('hidden');
    },

    sendVoiceRecord() {
        clearInterval(this.recordingInterval);
        const bar = document.getElementById('voiceRecorderBar');
        if (bar) bar.classList.add('hidden');

        const stream = document.getElementById('messageStream');
        const bubble = `
            <div class="flex items-start justify-end space-x-2">
                <div class="bg-cw-600 border border-cw-500 p-3 rounded-2xl w-64 space-y-2 shadow-md">
                    <div class="flex items-center justify-between text-xs text-cw-100">
                        <span class="font-bold flex items-center gap-1"><i class="fa-solid fa-microphone"></i> Ghi âm thoại gửi đi</span>
                        <span class="font-mono text-[10px]">0:${String(this.recordSeconds).padStart(2, '0')}</span>
                    </div>
                    <div class="flex items-center space-x-3 bg-slate-950/40 p-2 rounded-xl border border-white/10">
                        <button onclick="ChatModule.toggleAudioPlay(this)" class="w-8 h-8 rounded-full bg-white text-cw-600 flex items-center justify-center shrink-0 shadow"><i class="fa-solid fa-play text-xs"></i></button>
                        <div class="flex-1 flex items-center gap-0.5 h-5">
                            <span class="w-1 bg-white h-2 rounded"></span><span class="w-1 bg-white h-4 rounded"></span><span class="w-1 bg-white h-5 rounded"></span><span class="w-1 bg-white h-3 rounded"></span><span class="w-1 bg-white h-4 rounded"></span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        if (stream) {
            stream.insertAdjacentHTML('beforeend', bubble);
            stream.scrollTop = stream.scrollHeight;
        }
        UIModule.showToast("Đã gửi đoạn ghi âm thoại!");
    },

    toggleAudioPlay(btn) {
        const icon = btn.querySelector('i');
        if (icon) {
            if (icon.classList.contains('fa-play')) {
                icon.className = 'fa-solid fa-pause text-xs';
                UIModule.showToast("Đang phát ghi âm...");
            } else {
                icon.className = 'fa-solid fa-play text-xs';
            }
        }
    },

    sendLocationCard() {
        UIModule.toggleDropdown('attachMenu');
        const stream = document.getElementById('messageStream');
        const bubble = `
            <div class="flex items-start justify-end space-x-2">
                <div class="bg-slate-900 border border-slate-800 p-3 rounded-2xl w-64 space-y-2 shadow-md">
                    <div class="flex items-center gap-2 text-rose-400 font-bold text-xs"><i class="fa-solid fa-location-dot"></i> Vị trí kho hàng chính</div>
                    <div class="bg-slate-950 p-2 rounded-xl border border-slate-800 space-y-1">
                        <h5 class="text-xs font-bold text-white">Tổng Kho Hà Nội</h5>
                        <p class="text-[10px] text-slate-400">Số 120 Đường Cầu Giấy, Hà Nội</p>
                    </div>
                    <a href="https://maps.google.com" target="_blank" class="block text-center py-1 bg-rose-600/20 text-rose-300 border border-rose-500/30 rounded-xl text-[10px] font-bold">Xem bản đồ</a>
                </div>
            </div>
        `;
        if (stream) {
            stream.insertAdjacentHTML('beforeend', bubble);
            stream.scrollTop = stream.scrollHeight;
        }
    },

    sendContactCard() {
        UIModule.toggleDropdown('attachMenu');
        UIModule.showToast("Đã chia sẻ thông tin danh bạ nhân viên!");
    },

    escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
};

// ==========================================
// 3. VOIP CALL MODULE (Thoại / Video HD)
// ==========================================
const VoIPModule = {
    callTimerInterval: null,
    callSeconds: 0,

    startCall(type) {
        const modal = document.getElementById('callModal');
        const remoteVid = document.getElementById('remoteVideo');
        const selfVid = document.getElementById('selfVideo');
        const audioAva = document.getElementById('audioAvatar');
        const badge = document.getElementById('callTypeBadge');

        if (modal) modal.classList.remove('hidden');

        if (type === 'video') {
            if (remoteVid) remoteVid.classList.remove('hidden');
            if (selfVid) selfVid.classList.remove('hidden');
            if (audioAva) audioAva.classList.add('hidden');
            if (badge) badge.innerText = "Cuộc gọi Video HD Mã hóa SIP";
        } else {
            if (remoteVid) remoteVid.classList.add('hidden');
            if (selfVid) selfVid.classList.add('hidden');
            if (audioAva) audioAva.classList.remove('hidden');
            if (badge) badge.innerText = "Cuộc gọi thoại mã hóa SIP VoIP";
        }

        this.startTimer();
    },

    endCall() {
        const modal = document.getElementById('callModal');
        if (modal) modal.classList.add('hidden');
        this.stopTimer();
        UIModule.showToast("Cuộc gọi đã kết thúc");
    },

    acceptCall() {
        const banner = document.getElementById('incomingCallBanner');
        if (banner) banner.classList.add('hidden');
        this.startCall('audio');
    },

    rejectCall() {
        const banner = document.getElementById('incomingCallBanner');
        if (banner) banner.classList.add('hidden');
        UIModule.showToast("Đã từ chối cuộc gọi đến");
    },

    toggleMute(btn) {
        btn.classList.toggle('bg-red-600');
        UIModule.showToast("Đã bật / tắt Micro");
    },

    toggleCam(btn) {
        btn.classList.toggle('bg-red-600');
        UIModule.showToast("Đã bật / tắt Camera");
    },

    startTimer() {
        this.callSeconds = 0;
        const timerEl = document.getElementById('callTimer');
        clearInterval(this.callTimerInterval);
        this.callTimerInterval = setInterval(() => {
            this.callSeconds++;
            const min = String(Math.floor(this.callSeconds / 60)).padStart(2, '0');
            const sec = String(this.callSeconds % 60).padStart(2, '0');
            if (timerEl) timerEl.innerText = `${min}:${sec} • Quality HD`;
        }, 1000);
    },

    stopTimer() {
        clearInterval(this.callTimerInterval);
    }
};

// ==========================================
// 4. ACCOUNT MANAGEMENT MODULE (CRUD)
// ==========================================
const AccountModule = {
    users: [
        { name: "Bùi Xuân Tùng", email: "admin@taphoa.xyz", role: "Admin" },
        { name: "Nguyễn Văn A", email: "nhaxe@taphoa.xyz", role: "Vận Tải" }
    ],

    renderTable() {
        const tbody = document.getElementById('crudTableBody');
        if (!tbody) return;

        tbody.innerHTML = this.users.map(u => `
            <tr>
                <td class="p-3 font-bold text-white">${UIModule.escapeHTML ? UIModule.escapeHTML(u.name) : u.name}</td>
                <td class="p-3 font-mono">${u.email}</td>
                <td class="p-3"><span class="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded text-[10px] font-bold">${u.role}</span></td>
                <td class="p-3 text-right space-x-1">
                    <button onclick="AccountModule.editUser('${u.email}')" class="p-1.5 bg-slate-800 hover:bg-slate-700 text-cw-400 rounded-lg"><i class="fa-solid fa-pen"></i> Sửa</button>
                    <button onclick="AccountModule.deleteUser(this, '${u.email}')" class="p-1.5 bg-slate-800 hover:bg-slate-700 text-red-400 rounded-lg"><i class="fa-solid fa-trash"></i> Xóa</button>
                </td>
            </tr>
        `).join('');
    },

    addUser(e) {
        e.preventDefault();
        const name = document.getElementById('crudName').value.trim();
        const email = document.getElementById('crudEmail').value.trim();

        if (name && email) {
            this.users.push({ name, email, role: "Nhân viên" });
            this.renderTable();
            document.getElementById('crudName').value = '';
            document.getElementById('crudEmail').value = '';
            document.getElementById('crudPass').value = '';
            UIModule.showToast("Đã thêm tài khoản nhân viên mới!");
        }
    },

    editUser(email) {
        const u = this.users.find(x => x.email === email);
        if (u) {
            const newName = prompt("Nhập tên mới:", u.name);
            if (newName) {
                u.name = newName;
                this.renderTable();
                UIModule.showToast("Đã cập nhật thông tin!");
            }
        }
    },

    deleteUser(btn, email) {
        if (confirm("Bạn có chắc chắn muốn xóa tài khoản này?")) {
            this.users = this.users.filter(x => x.email !== email);
            this.renderTable();
            UIModule.showToast("Đã xóa tài khoản khỏi hệ thống!");
        }
    }
};

// Global Keydown Listeners & App Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Bind Enter Key on Main Composer Input
    const mainComposer = document.getElementById('mainComposer');
    if (mainComposer) {
        mainComposer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                ChatModule.sendMessage();
            }
        });
    }

    // Render initial account CRUD table
    AccountModule.renderTable();
});