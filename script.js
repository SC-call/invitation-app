const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/1Lj6yEZrs3N3VbblG8M2OtmbrSbbFAqK50S6zkeEOydD3K2kQiG6g4KNx/exec';

var currentUser = null;
var currentFunction = 'invite';
var editingInvitation = null;
var sessionOptions = [];
var isOnline = navigator.onLine;
var syncInProgress = false;

// 本地邀約資料列表
var localInvitations = [];

// 邀約計數 (從本地資料計算)
var invitationCounts = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    total: 0
};

var quotaLimits = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    total: 0
};

// 本地儲存鍵名
const STORAGE_KEYS = {
    INVITATIONS: 'health_check_invitations',
    USER: 'health_check_current_user',
    LAST_SYNC: 'health_check_last_sync'
};

// 邀約狀態枚舉
const SYNC_STATUS = {
    PENDING: 'pending',
    SYNCING: 'syncing', 
    SYNCED: 'synced',
    ERROR: 'error'
};

// ============ 初始化和事件監聽 ============
function initializeApp() {
    // 載入本地資料
    loadLocalData();
    
    // 監聽網路狀態變化
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // 更新網路狀態顯示
    updateNetworkStatus();
    
    // 載入用戶列表
    loadUserList();
    
    // 如果有已登入用戶，自動登入
    if (currentUser) {
        updateUserInterface();
        loadTodayData();
        loadSessionOptions(currentUser.name);
    }
    
    // 定期自動同步 (每5分鐘)
    setInterval(autoSync, 5 * 60 * 1000);
}

function handleOnline() {
    isOnline = true;
    updateNetworkStatus();
    showSyncStatus('網路已連接，將自動同步資料', 'success');
    setTimeout(autoSync, 2000); // 2秒後開始同步
}

function handleOffline() {
    isOnline = false;
    updateNetworkStatus();
    showSyncStatus('網路已中斷，將使用離線模式', 'warning');
}

function updateNetworkStatus() {
    const indicator = document.getElementById('networkStatus');
    if (syncInProgress) {
        indicator.className = 'network-status syncing';
        indicator.title = '同步中...';
    } else if (isOnline) {
        indicator.className = 'network-status';
        indicator.title = '網路已連接';
    } else {
        indicator.className = 'network-status offline';
        indicator.title = '離線模式';
    }
}

// ============ 本地資料管理 ============
function loadLocalData() {
    try {
        // 載入邀約資料
        const savedInvitations = localStorage.getItem(STORAGE_KEYS.INVITATIONS);
        if (savedInvitations) {
            localInvitations = JSON.parse(savedInvitations);
        }
        
        // 載入當前用戶
        const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
        }
        
        // 更新計數
        updateLocalCounts();
        
    } catch (error) {
        console.error('載入本地資料失敗:', error);
        localInvitations = [];
        currentUser = null;
    }
}

function saveLocalData() {
    try {
        localStorage.setItem(STORAGE_KEYS.INVITATIONS, JSON.stringify(localInvitations));
        if (currentUser) {
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
        }
        localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (error) {
        console.error('儲存本地資料失敗:', error);
        showAlert('error', '本地儲存失敗，請檢查儲存空間');
    }
}

function addInvitationToLocal(invitationData) {
    // 生成本地ID
    const localId = 'LOCAL_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const invitation = {
        id: localId,
        localId: localId, // 本地唯一標識
        serverId: null, // 服務器ID，同步後填入
        syncStatus: SYNC_STATUS.PENDING,
        syncError: null,
        createTime: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        
        // 邀約資料
        name: invitationData.name,
        phone1: invitationData.phone1,
        phone2: invitationData.phone2 || '',
        mammography: invitationData.mammography ? 1 : 0,
        firstScreen: invitationData.firstScreen ? 1 : 0,
        cervicalSmear: invitationData.cervicalSmear ? 1 : 0,
        adultHealth: invitationData.adultHealth ? 1 : 0,
        hepatitis: invitationData.hepatitis ? 1 : 0,
        colorectal: invitationData.colorectal ? 1 : 0,
        notes: invitationData.notes || '',
        sessionInfo: invitationData.sessionInfo,
        session: invitationData.session,
        inviter: invitationData.inviter,
        
        // 解析場次資訊
        ...parseSessionInfo(invitationData.sessionInfo),
        
        // 邀約日期
        inviteDate: getTodayString('MMDD')
    };
    
    localInvitations.unshift(invitation); // 加到開頭
    saveLocalData();
    updateLocalCounts();
    updateLocalStats();
    
    return invitation;
}

function updateInvitationInLocal(localId, updateData) {
    const index = localInvitations.findIndex(inv => inv.localId === localId);
    if (index === -1) return false;
    
    const invitation = localInvitations[index];
    
    // 更新資料
    Object.assign(invitation, updateData, {
        lastModified: new Date().toISOString(),
        syncStatus: invitation.syncStatus === SYNC_STATUS.SYNCED ? SYNC_STATUS.PENDING : invitation.syncStatus
    });
    
    // 重新解析場次資訊
    if (updateData.sessionInfo) {
        Object.assign(invitation, parseSessionInfo(updateData.sessionInfo));
    }
    
    saveLocalData();
    updateLocalCounts();
    updateLocalStats();
    
    return true;
}

function deleteInvitationFromLocal(localId) {
    const index = localInvitations.findIndex(inv => inv.localId === localId);
    if (index === -1) return false;
    
    localInvitations.splice(index, 1);
    saveLocalData();
    updateLocalCounts();
    updateLocalStats();
    
    return true;
}

function parseSessionInfo(sessionInfo) {
    const parts = sessionInfo.split('-');
    if (parts.length >= 4) {
        return {
            date: parts[0].substring(4), // MMDD格式
            region: parts[1],
            location: parts[2],
            appointmentType: parts[3],
            year: new Date().getFullYear().toString()
        };
    }
    return {
        date: '',
        region: '',
        location: '',
        appointmentType: '副約',
        year: new Date().getFullYear().toString()
    };
}

function getTodayString(format) {
    const today = new Date();
    if (format === 'MMDD') {
        return String(today.getMonth() + 1).padStart(2, '0') + 
               String(today.getDate()).padStart(2, '0');
    }
    return today.getFullYear().toString() + 
           String(today.getMonth() + 1).padStart(2, '0') + 
           String(today.getDate()).padStart(2, '0');
}

// ============ 計數管理 ============
function updateLocalCounts() {
    const todayStr = getTodayString('MMDD');
    const counts = {
        morning: 0,
        afternoon: 0,
        evening: 0,
        total: 0
    };
    
    localInvitations.forEach(function(inv) {
        // 只計算今日的主約邀約
        if (inv.inviteDate === todayStr && 
            inv.appointmentType === '主約' && 
            (!currentUser || inv.inviter === currentUser.name || currentUser.name === '系統管理員')) {
            
            if (inv.session === '早上場') counts.morning++;
            else if (inv.session === '下午場') counts.afternoon++;
            else if (inv.session === '晚上場') counts.evening++;
            
            counts.total++;
        }
    });
    
    invitationCounts = counts;
    updateCountDisplay();
}

function updateCountDisplay() {
    const morningCountEl = document.getElementById('morningCount');
    const afternoonCountEl = document.getElementById('afternoonCount');
    const eveningCountEl = document.getElementById('eveningCount');
    const todayCountEl = document.getElementById('todayCount');
    const remainingCountEl = document.getElementById('remainingCount');
    
    if (morningCountEl) morningCountEl.textContent = invitationCounts.morning;
    if (afternoonCountEl) afternoonCountEl.textContent = invitationCounts.afternoon;
    if (eveningCountEl) eveningCountEl.textContent = invitationCounts.evening;
    if (todayCountEl) todayCountEl.textContent = invitationCounts.total;
    
    const remaining = Math.max(0, quotaLimits.total - invitationCounts.total);
    if (remainingCountEl) remainingCountEl.textContent = remaining;
    
    updateSessionQuotaDisplay();
}

function updateSessionQuotaDisplay() {
    const morningQuota = document.getElementById('morningQuota');
    const afternoonQuota = document.getElementById('afternoonQuota');
    const eveningQuota = document.getElementById('eveningQuota');
    
    if (morningQuota) {
        if (invitationCounts.morning >= quotaLimits.morning && quotaLimits.morning > 0) {
            morningQuota.classList.add('full');
        } else {
            morningQuota.classList.remove('full');
        }
    }
    
    if (afternoonQuota) {
        if (invitationCounts.afternoon >= quotaLimits.afternoon && quotaLimits.afternoon > 0) {
            afternoonQuota.classList.add('full');
        } else {
            afternoonQuota.classList.remove('full');
        }
    }
    
    if (eveningQuota) {
        if (invitationCounts.evening >= quotaLimits.evening && quotaLimits.evening > 0) {
            eveningQuota.classList.add('full');
        } else {
            eveningQuota.classList.remove('full');
        }
    }
}

function updateLocalStats() {
    const todayStr = getTodayString('MMDD');
    let localCount = 0;
    let pendingCount = 0;
    let syncedCount = 0;
    
    localInvitations.forEach(function(inv) {
        if (inv.inviteDate === todayStr && 
            (!currentUser || inv.inviter === currentUser.name || currentUser.name === '系統管理員')) {
            localCount++;
            if (inv.syncStatus === SYNC_STATUS.PENDING || inv.syncStatus === SYNC_STATUS.ERROR) {
                pendingCount++;
            } else if (inv.syncStatus === SYNC_STATUS.SYNCED) {
                syncedCount++;
            }
        }
    });
    
    const localCountEl = document.getElementById('localCount');
    const pendingCountEl = document.getElementById('pendingCount');
    const syncedCountEl = document.getElementById('syncedCount');
    
    if (localCountEl) localCountEl.textContent = localCount;
    if (pendingCountEl) pendingCountEl.textContent = pendingCount;
    if (syncedCountEl) syncedCountEl.textContent = syncedCount;
}

// ============ Google Apps Script API 呼叫 ============
function callGoogleScript(functionName, data = {}) {
    console.log('呼叫函數:', functionName, '參數:', data);
    
    return new Promise((resolve, reject) => {
        const payload = {
            function: functionName,
            parameters: data
        };
        
        // 使用 FormData 格式
        const formData = new FormData();
        formData.append('data', JSON.stringify(payload));
        
        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: formData,
            mode: 'cors'  // 明確設定 CORS 模式
        })
        .then(response => {
            console.log('收到回應:', response.status, response.statusText);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.text(); // 先以文字格式讀取
        })
        .then(text => {
            console.log('回應內容:', text);
            try {
                const result = JSON.parse(text);
                if (result.error) {
                    reject(new Error(result.error));
                } else {
                    resolve(result);
                }
            } catch (parseError) {
                console.error('JSON 解析錯誤:', parseError);
                console.error('原始回應:', text);
                reject(new Error('伺服器回應格式錯誤'));
            }
        })
        .catch(error => {
            console.error('請求失敗:', error);
            reject(error);
        });
    });
}

function safeGoogleScriptCall(functionName, successCallback, errorCallback, ...args) {
    // 如果在Google Apps Script環境中
    if (typeof google !== 'undefined' && google.script && google.script.run) {
        try {
            const call = google.script.run
                .withSuccessHandler(successCallback)
                .withFailureHandler(errorCallback || function(error) {
                    console.error('API 呼叫失敗:', error);
                    if (errorCallback) errorCallback(error);
                });
            
            call[functionName].apply(call, args);
        } catch (error) {
            console.error('呼叫錯誤:', error);
            if (errorCallback) errorCallback(error.toString());
        }
    } else {
        // 在外部環境中，使用fetch呼叫
        const data = args.length > 0 ? args[0] : {};
        
        callGoogleScript(functionName, data)
            .then(result => successCallback(result))
            .catch(error => {
                if (errorCallback) {
                    errorCallback(error.message || error.toString());
                }
            });
    }
}

// ============ 雲端同步功能 ============
function autoSync() {
    if (!isOnline || syncInProgress || !currentUser) return;
    
    const pendingInvitations = localInvitations.filter(inv => 
        inv.syncStatus === SYNC_STATUS.PENDING || inv.syncStatus === SYNC_STATUS.ERROR
    );
    
    if (pendingInvitations.length > 0) {
        syncToCloud(pendingInvitations);
    }
}

function manualSync() {
    if (!isOnline) {
        showAlert('warning', '請檢查網路連接');
        return;
    }
    
    if (syncInProgress) {
        showAlert('warning', '同步進行中，請稍候');
        return;
    }
    
    const pendingInvitations = localInvitations.filter(inv => 
        inv.syncStatus === SYNC_STATUS.PENDING || inv.syncStatus === SYNC_STATUS.ERROR
    );
    
    if (pendingInvitations.length === 0) {
        showAlert('success', '所有資料已同步');
        return;
    }
    
    syncToCloud(pendingInvitations);
}

function syncToCloud(invitations) {
    if (!invitations || invitations.length === 0) return;
    
    syncInProgress = true;
    updateNetworkStatus();
    showSyncStatus('正在同步 ' + invitations.length + ' 筆資料...', 'info');
    
    const syncBtn = document.getElementById('syncBtn');
    const syncBtnText = document.getElementById('syncBtnText');
    
    if (syncBtn) syncBtn.disabled = true;
    if (syncBtnText) syncBtnText.innerHTML = '<div class="loading-spinner"></div>同步中...';
    
    // 標記為同步中
    invitations.forEach(function(inv) {
        inv.syncStatus = SYNC_STATUS.SYNCING;
    });
    
    updateInvitationListDisplay();
    updateLocalStats();
    
    // 批次同步
    batchSyncInvitations(invitations, 0);
}

function batchSyncInvitations(invitations, index) {
    if (index >= invitations.length) {
        // 同步完成
        finishSync();
        return;
    }
    
    const invitation = invitations[index];
    const formData = convertToServerFormat(invitation);
    
    safeGoogleScriptCall(
        'submitInvitation',
        function(result) {
            if (result.success) {
                invitation.syncStatus = SYNC_STATUS.SYNCED;
                invitation.serverId = result.invitationId || invitation.localId;
                invitation.syncError = null;
            } else {
                invitation.syncStatus = SYNC_STATUS.ERROR;
                invitation.syncError = result.message || '同步失敗';
            }
            
            // 繼續下一個
            setTimeout(function() {
                batchSyncInvitations(invitations, index + 1);
            }, 500); // 避免過於頻繁的請求
        },
        function(error) {
            invitation.syncStatus = SYNC_STATUS.ERROR;
            invitation.syncError = error.toString();
            
            // 繼續下一個
            setTimeout(function() {
                batchSyncInvitations(invitations, index + 1);
            }, 500);
        },
        formData
    );
}

function finishSync() {
    syncInProgress = false;
    updateNetworkStatus();
    saveLocalData();
    updateLocalStats();
    updateInvitationListDisplay();
    
    const syncBtn = document.getElementById('syncBtn');
    const syncBtnText = document.getElementById('syncBtnText');
    
    if (syncBtn) syncBtn.disabled = false;
    if (syncBtnText) syncBtnText.textContent = '同步至雲端';
    
    const syncedCount = localInvitations.filter(inv => inv.syncStatus === SYNC_STATUS.SYNCED).length;
    const errorCount = localInvitations.filter(inv => inv.syncStatus === SYNC_STATUS.ERROR).length;
    
    if (errorCount === 0) {
        showSyncStatus('同步完成！共同步 ' + syncedCount + ' 筆資料', 'success');
    } else {
        showSyncStatus('同步完成，' + syncedCount + ' 筆成功，' + errorCount + ' 筆失敗', 'warning');
    }
}

function convertToServerFormat(invitation) {
    return {
        name: invitation.name,
        phone1: invitation.phone1,
        phone2: invitation.phone2,
        mammography: invitation.mammography === 1,
        firstScreen: invitation.firstScreen === 1,
        cervicalSmear: invitation.cervicalSmear === 1,
        adultHealth: invitation.adultHealth === 1,
        hepatitis: invitation.hepatitis === 1,
        colorectal: invitation.colorectal === 1,
        sessionInfo: invitation.sessionInfo,
        session: invitation.session,
        notes: invitation.notes,
        inviter: invitation.inviter,
        localId: invitation.localId
    };
}

function showSyncStatus(message, type) {
    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) {
        syncStatus.className = 'sync-status show ' + (type || 'info');
        syncStatus.textContent = message;
        
        if (type === 'success' || type === 'warning') {
            setTimeout(function() {
                syncStatus.classList.remove('show');
            }, 3000);
        }
    }
}

// ============ 用戶管理和載入功能 ============
function loadUserList() {
    safeGoogleScriptCall(
        'getUserList',
        function(users) {
            const select = document.getElementById('staffSelect');
            if (select) {
                select.innerHTML = '<option value="">選擇邀約人員</option>';
                
                for (let i = 0; i < users.length; i++) {
                    const user = users[i];
                    const option = document.createElement('option');
                    option.value = user.name;
                    option.textContent = user.name;
                    option.dataset.hasPassword = user.hasPassword;
                    select.appendChild(option);
                }
            }
        },
        function(error) {
            showAlert('error', '載入用戶列表失敗：' + error);
        }
    );
}

function loadSessionOptions(staffName) {
    safeGoogleScriptCall(
        'getSessionOptions',
        function(sessions) {
            sessionOptions = sessions;
            updateSessionSelect('sessionInfo', sessions);
            updateSessionSelect('editSessionInfo', sessions);
        },
        function(error) {
            showAlert('error', '載入場次選項失敗：' + error);
        },
        staffName || ''
    );
}

function updateSessionSelect(selectId, sessions) {
    const select = document.getElementById(selectId);
    if (select) {
        select.innerHTML = '<option value="">選擇場次</option>';
        
        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            const option = document.createElement('option');
            option.value = session.value;
            option.textContent = session.display;
            option.dataset.appointmentType = session.appointmentType;
            select.appendChild(option);
        }
    }
}

function getAppointmentTypeFromSession(sessionValue) {
    const parts = sessionValue.split('-');
    if (parts.length >= 4) {
        return parts[3];
    }
    
    for (let i = 0; i < sessionOptions.length; i++) {
        if (sessionOptions[i].value === sessionValue) {
            return sessionOptions[i].appointmentType || '副約';
        }
    }
    return '副約';
}

function login() {
    const staffName = document.getElementById('staffSelect').value;
    const password = document.getElementById('staffPassword').value;
    
    if (!staffName) {
        showAlert('error', '請選擇邀約人員');
        return;
    }
    
    const selectedOption = document.querySelector('#staffSelect option[value="' + staffName + '"]');
    const hasPassword = selectedOption && selectedOption.dataset.hasPassword === 'true';
    
    if (hasPassword && !password) {
        showAlert('error', '此帳號需要密碼');
        return;
    }
    
    safeGoogleScriptCall(
        'authenticateUser',
        function(result) {
            if (result.success) {
                currentUser = result.user;
                saveLocalData(); // 儲存登入狀態
                updateUserInterface();
                loadTodayData();
                loadSessionOptions(currentUser.name);
                showAlert('success', '歡迎 ' + staffName + '，登入成功！');
            } else {
                showAlert('error', result.message);
            }
        },
        function(error) {
            showAlert('error', '登入失敗：' + error);
        },
        { username: staffName, password: password }
    );
}

function updateUserInterface() {
    const userInfo = document.getElementById('userInfo');
    const loginForm = document.getElementById('loginForm');
    const quotaInfo = document.getElementById('quotaInfo');
    const sessionQuotas = document.getElementById('sessionQuotas');
    const functionTabs = document.getElementById('functionTabs');
    const mainContent = document.getElementById('mainContent');
    
    if (userInfo) {
        userInfo.classList.add('logged-in');
        userInfo.innerHTML = '<div><div class="user-name">' + currentUser.name + '</div></div>';
    }
    
    if (loginForm) loginForm.style.display = 'none';
    if (quotaInfo) quotaInfo.style.display = 'grid';
    if (sessionQuotas) sessionQuotas.style.display = 'grid';
    if (functionTabs) functionTabs.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'block';
}

function loadTodayData() {
    const today = new Date();
    const todayStr = today.getFullYear().toString() + 
                    String(today.getMonth() + 1).padStart(2, '0') + 
                    String(today.getDate()).padStart(2, '0');
    
    // 載入限額資料
    safeGoogleScriptCall(
        'getTodayQuota',
        function(quota) {
            quotaLimits = quota;
            const morningLimitEl = document.getElementById('morningLimit');
            const afternoonLimitEl = document.getElementById('afternoonLimit');
            const eveningLimitEl = document.getElementById('eveningLimit');
            const todayLimitEl = document.getElementById('todayLimit');
            
            if (morningLimitEl) morningLimitEl.textContent = quota.morning;
            if (afternoonLimitEl) afternoonLimitEl.textContent = quota.afternoon;
            if (eveningLimitEl) eveningLimitEl.textContent = quota.evening;
            if (todayLimitEl) todayLimitEl.textContent = quota.total;
            
            // 更新顯示
            updateCountDisplay();
        },
        function(error) {
            console.error('載入限額失敗:', error);
        },
        { staffName: currentUser.name, date: todayStr }
    );
}

function checkQuotaBeforeSubmit(session, appointmentType) {
    if (appointmentType !== '主約') {
        return { canSubmit: true };
    }
    
    let currentCount, limit;
    
    switch (session) {
        case '早上場':
            currentCount = invitationCounts.morning;
            limit = quotaLimits.morning;
            break;
        case '下午場':
            currentCount = invitationCounts.afternoon;
            limit = quotaLimits.afternoon;
            break;
        case '晚上場':
            currentCount = invitationCounts.evening;
            limit = quotaLimits.evening;
            break;
        default:
            return { canSubmit: true };
    }
    
    if (currentCount >= limit && limit > 0) {
        return {
            canSubmit: false,
            message: session + '的主約已達限額（' + currentCount + '/' + limit + '），無法提交。'
        };
    }
    
    return { canSubmit: true };
}

function checkQuotaWarning() {
    const session = document.getElementById('session').value;
    const sessionInfo = document.getElementById('sessionInfo').value;
    const warningDiv = document.getElementById('quotaWarning');
    
    if (!session || !sessionInfo || !warningDiv) {
        if (warningDiv) warningDiv.style.display = 'none';
        return;
    }
    
    const appointmentType = getAppointmentTypeFromSession(sessionInfo);
    
    if (appointmentType === '主約') {
        let currentCount, limit;
        
        switch (session) {
            case '早上場':
                currentCount = invitationCounts.morning;
                limit = quotaLimits.morning;
                break;
            case '下午場':
                currentCount = invitationCounts.afternoon;
                limit = quotaLimits.afternoon;
                break;
            case '晚上場':
                currentCount = invitationCounts.evening;
                limit = quotaLimits.evening;
                break;
        }
        
        if (currentCount >= limit && limit > 0) {
            warningDiv.textContent = session + '的主約已達限額（' + currentCount + '/' + limit + '）。';
            warningDiv.style.display = 'block';
            return;
        }
    }
    
    warningDiv.style.display = 'none';
}

function switchFunction(func) {
    currentFunction = func;
    
    const tabs = document.querySelectorAll('.tab-btn');
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }
    
    // 找到被點擊的按鈕
    const activeTab = document.querySelector('.tab-btn[onclick*="' + func + '"]');
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    const inviteSection = document.getElementById('inviteSection');
    const listSection = document.getElementById('listSection');
    
    if (inviteSection) inviteSection.style.display = func === 'invite' ? 'block' : 'none';
    if (listSection) listSection.style.display = func === 'list' ? 'block' : 'none';
    
    if (func === 'list') {
        refreshInvitationList();
    }
}

// ============ 邀約列表管理 ============
function refreshInvitationList() {
    loadInvitationList();
    updateLocalStats();
    showAlert('success', '名單已更新');
}

function loadInvitationList() {
    const listContainer = document.getElementById('invitationList');
    if (!listContainer) return;
    
    // 直接從本地資料載入
    const todayStr = getTodayString('MMDD');
    const todayInvitations = localInvitations.filter(function(inv) {
        return inv.inviteDate === todayStr && 
               (!currentUser || inv.inviter === currentUser.name || currentUser.name === '系統管理員');
    });
    
    if (todayInvitations.length === 0) {
        listContainer.innerHTML = '<div class="no-data">今日暫無邀約記錄</div>';
        return;
    }
    
    let html = '';
    for (let i = 0; i < todayInvitations.length; i++) {
        const invitation = todayInvitations[i];
        html += renderInvitationItem(invitation);
    }
    
    listContainer.innerHTML = html;
    updateLocalStats();
}

function renderInvitationItem(invitation) {
    const healthItems = getHealthItemsDisplay(invitation);
    const appointmentTypeClass = invitation.appointmentType === '主約' ? 'primary' : 'secondary';
    const syncIndicator = getSyncIndicatorHtml(invitation);
    
    return '<div class="invitation-item ' + invitation.syncStatus + '">' +
        syncIndicator +
        '<div class="invitation-header">' +
            '<div>' +
                '<div class="invitation-name">' + invitation.name + 
                ' <span class="appointment-type-tag ' + appointmentTypeClass + '">' + invitation.appointmentType + '</span></div>' +
                '<div class="invitation-phone">' + invitation.phone1 + '</div>' +
                (currentUser && currentUser.name === '系統管理員' ? '<div style="font-size: 0.75em; color: #666;">邀約人：' + invitation.inviter + '</div>' : '') +
            '</div>' +
            '<div class="invitation-actions">' +
                '<button class="btn-small btn-edit" onclick="editInvitation(\'' + invitation.localId + '\')">編輯</button>' +
                '<button class="btn-small btn-delete" onclick="deleteInvitation(\'' + invitation.localId + '\')">刪除</button>' +
            '</div>' +
        '</div>' +
        '<div class="invitation-details">' +
            '<div class="detail-item"><div class="detail-label">日期</div><div class="detail-value">' + formatDate(invitation.date) + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">地區</div><div class="detail-value">' + invitation.region + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">地點</div><div class="detail-value">' + invitation.location + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">時段</div><div class="detail-value">' + invitation.session + '</div></div>' +
        '</div>' +
        '<div class="health-items">' + healthItems + '</div>' +
        (invitation.notes ? '<div style="margin-top: 6px; font-size: 0.8em; color: #666;">備註: ' + invitation.notes + '</div>' : '') +
        (invitation.syncError ? '<div style="margin-top: 6px; font-size: 0.75em; color: #dc3545;">同步錯誤: ' + invitation.syncError + '</div>' : '') +
    '</div>';
}

function getSyncIndicatorHtml(invitation) {
    let text, className;
    
    switch (invitation.syncStatus) {
        case SYNC_STATUS.PENDING:
            text = '待同步';
            className = 'pending';
            break;
        case SYNC_STATUS.SYNCING:
            text = '同步中';
            className = 'syncing';
            break;
        case SYNC_STATUS.SYNCED:
            text = '已同步';
            className = 'synced';
            break;
        case SYNC_STATUS.ERROR:
            text = '同步失敗';
            className = 'error';
            break;
        default:
            text = '未知';
            className = 'pending';
    }
    
    return '<div class="sync-indicator ' + className + '">' + text + '</div>';
}

function formatDate(dateStr) {
    if (!dateStr || dateStr.length !== 4) return dateStr;
    const month = dateStr.substring(0, 2);
    const day = dateStr.substring(2, 4);
    return month + '/' + day;
}

function getHealthItemsDisplay(invitation) {
    const items = [];
    if (invitation.mammography) items.push('乳攝');
    if (invitation.firstScreen) items.push('首篩');
    if (invitation.cervicalSmear) items.push('子抹');
    if (invitation.adultHealth) items.push('成健');
    if (invitation.hepatitis) items.push('BC肝炎');
    if (invitation.colorectal) items.push('大腸');
    
    let html = '';
    for (let i = 0; i < items.length; i++) {
        html += '<span class="health-tag">' + items[i] + '</span>';
    }
    return html;
}

// ============ 表單處理 ============
function handleSubmit(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showAlert('error', '請先登入');
        return;
    }
    
    const sessionInfo = document.getElementById('sessionInfo').value;
    const session = document.getElementById('session').value;
    const appointmentType = getAppointmentTypeFromSession(sessionInfo);
    
    const quotaCheck = checkQuotaBeforeSubmit(session, appointmentType);
    if (!quotaCheck.canSubmit) {
        showAlert('error', quotaCheck.message);
        return;
    }
    
    const formData = {
        name: document.getElementById('name').value.trim(),
        phone1: document.getElementById('phone1').value.trim(),
        phone2: document.getElementById('phone2').value.trim(),
        mammography: document.getElementById('mammography').checked,
        firstScreen: document.getElementById('firstScreen').checked,
        cervicalSmear: document.getElementById('cervicalSmear').checked,
        adultHealth: document.getElementById('adultHealth').checked,
        hepatitis: document.getElementById('hepatitis').checked,
        colorectal: document.getElementById('colorectal').checked,
        sessionInfo: sessionInfo,
        session: session,
        notes: document.getElementById('notes').value.trim(),
        inviter: currentUser.name
    };
    
    if (!formData.name || !formData.phone1 || !formData.sessionInfo || !formData.session) {
        showAlert('error', '請填寫所有必填欄位');
        return;
    }
    
    const hasHealthCheck = formData.mammography || formData.firstScreen || 
                         formData.cervicalSmear || formData.adultHealth || 
                         formData.hepatitis || formData.colorectal;
    
    if (!hasHealthCheck) {
        showAlert('warning', '請至少選擇一項健檢項目');
        return;
    }
    
    submitInvitation(formData);
}

function submitInvitation(data) {
    const submitBtn = document.getElementById('submitBtn');
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中...';
    }
    
    showSubmitStatus('processing', '正在儲存邀約資料...');
    
    try {
        // 先保存到本地
        const invitation = addInvitationToLocal(data);
        
        showSubmitStatus('success', '邀約資料已儲存！' + (!isOnline ? '（將在連網時同步）' : ''));
        resetForm();
        
        // 如果在線，嘗試立即同步
        if (isOnline) {
            setTimeout(function() {
                syncToCloud([invitation]);
            }, 1000);
        }
        
    } catch (error) {
        showSubmitStatus('error', '儲存失敗：' + error.toString());
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '提交邀約資料';
        }
    }
}

function resetForm() {
    const elements = ['name', 'phone1', 'phone2', 'notes', 'sessionInfo', 'session'];
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
    
    const checkboxItems = document.querySelectorAll('#inviteSection .checkbox-item');
    for (let i = 0; i < checkboxItems.length; i++) {
        const item = checkboxItems[i];
        const checkbox = item.querySelector('input');
        if (checkbox && checkbox.id === 'mammography') {
            checkbox.checked = true;
            item.classList.add('checked');
        } else if (checkbox) {
            checkbox.checked = false;
            item.classList.remove('checked');
        }
    }
    
    const quotaWarning = document.getElementById('quotaWarning');
    if (quotaWarning) quotaWarning.style.display = 'none';
}

// ============ 編輯功能 ============
function editInvitation(localId) {
    const invitation = localInvitations.find(inv => inv.localId === localId);
    if (!invitation) return;
    
    editingInvitation = invitation;
    
    const elements = {
        'editId': invitation.localId,
        'editName': invitation.name,
        'editPhone1': invitation.phone1,
        'editPhone2': invitation.phone2 || '',
        'editSession': invitation.session,
        'editNotes': invitation.notes || '',
        'editSessionInfo': invitation.sessionInfo
    };
    
    Object.keys(elements).forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = elements[id];
    });
    
    setEditCheckbox('editMammography', invitation.mammography);
    setEditCheckbox('editFirstScreen', invitation.firstScreen);
    setEditCheckbox('editCervicalSmear', invitation.cervicalSmear);
    setEditCheckbox('editAdultHealth', invitation.adultHealth);
    setEditCheckbox('editHepatitis', invitation.hepatitis);
    setEditCheckbox('editColorectal', invitation.colorectal);
    
    const editModal = document.getElementById('editModal');
    if (editModal) editModal.style.display = 'flex';
}

function setEditCheckbox(checkboxId, value) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;
    
    const item = checkbox.closest('.checkbox-item');
    
    checkbox.checked = value === 1 || value === true;
    if (item) {
        if (checkbox.checked) {
            item.classList.add('checked');
        } else {
            item.classList.remove('checked');
        }
    }
}

function handleEditSubmit(e) {
    e.preventDefault();
    
    const localId = document.getElementById('editId').value;
    const name = document.getElementById('editName').value.trim();
    const phone1 = document.getElementById('editPhone1').value.trim();
    const sessionInfo = document.getElementById('editSessionInfo').value;
    const session = document.getElementById('editSession').value;
    
    if (!name || !phone1 || !sessionInfo || !session) {
        showAlert('error', '請填寫所有必填欄位');
        return;
    }
    
    const hasHealthCheck = document.getElementById('editMammography').checked || 
                         document.getElementById('editFirstScreen').checked || 
                         document.getElementById('editCervicalSmear').checked || 
                         document.getElementById('editAdultHealth').checked || 
                         document.getElementById('editHepatitis').checked || 
                         document.getElementById('editColorectal').checked;
    
    if (!hasHealthCheck) {
        showAlert('warning', '請至少選擇一項健檢項目');
        return;
    }
    
    const updateData = {
        name: name,
        phone1: phone1,
        phone2: document.getElementById('editPhone2').value.trim(),
        mammography: document.getElementById('editMammography').checked ? 1 : 0,
        firstScreen: document.getElementById('editFirstScreen').checked ? 1 : 0,
        cervicalSmear: document.getElementById('editCervicalSmear').checked ? 1 : 0,
        adultHealth: document.getElementById('editAdultHealth').checked ? 1 : 0,
        hepatitis: document.getElementById('editHepatitis').checked ? 1 : 0,
        colorectal: document.getElementById('editColorectal').checked ? 1 : 0,
        sessionInfo: sessionInfo,
        session: session,
        notes: document.getElementById('editNotes').value.trim()
    };
    
    if (updateInvitationInLocal(localId, updateData)) {
        closeEditModal();
        showAlert('success', '邀約資料已更新！');
        refreshInvitationList();
        
        // 如果在線，嘗試同步更新的資料
        if (isOnline) {
            const invitation = localInvitations.find(inv => inv.localId === localId);
            if (invitation && invitation.syncStatus !== SYNC_STATUS.SYNCED) {
                setTimeout(function() {
                    syncToCloud([invitation]);
                }, 1000);
            }
        }
    } else {
        showAlert('error', '更新失敗，找不到邀約記錄');
    }
}

function closeEditModal() {
    const editModal = document.getElementById('editModal');
    if (editModal) editModal.style.display = 'none';
    editingInvitation = null;
}

function deleteInvitation(localId) {
    if (!confirm('確定要刪除這筆邀約記錄嗎？')) return;
    
    if (deleteInvitationFromLocal(localId)) {
        showAlert('success', '邀約記錄已刪除！');
        refreshInvitationList();
    } else {
        showAlert('error', '刪除失敗，找不到邀約記錄');
    }
}

// ============ UI互動功能 ============
function toggleCheckbox(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;
    
    const item = checkbox.closest('.checkbox-item');
    
    checkbox.checked = !checkbox.checked;
    
    if (item) {
        if (checkbox.checked) {
            item.classList.add('checked');
        } else {
            item.classList.remove('checked');
        }
    }
}

function toggleEditCheckbox(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;
    
    const item = checkbox.closest('.checkbox-item');
    
    checkbox.checked = !checkbox.checked;
    
    if (item) {
        if (checkbox.checked) {
            item.classList.add('checked');
        } else {
            item.classList.remove('checked');
        }
    }
}

function showAlert(type, message) {
    const alert = document.getElementById('alertMessage');
    if (alert) {
        alert.className = 'alert ' + type;
        alert.textContent = message;
        alert.style.display = 'block';
        
        setTimeout(function() {
            alert.style.display = 'none';
        }, 3000);
    }
}

function showSubmitStatus(type, message) {
    const status = document.getElementById('submitStatus');
    if (status) {
        status.className = 'submit-status ' + type;
        status.textContent = message;
        status.style.display = 'block';
        
        if (type !== 'processing') {
            setTimeout(function() {
                status.style.display = 'none';
            }, 3000);
        }
    }
}

function updateInvitationListDisplay() {
    if (currentFunction === 'list') {
        loadInvitationList();
    }
}

// ============ 頁面初始化 ============
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    
    const invitationForm = document.getElementById('invitationForm');
    const editForm = document.getElementById('editForm');
    
    if (invitationForm) invitationForm.addEventListener('submit', handleSubmit);
    if (editForm) editForm.addEventListener('submit', handleEditSubmit);
    
    // 模態框點擊背景關閉
    const editModal = document.getElementById('editModal');
    if (editModal) {
        editModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeEditModal();
            }
        });
    }
});

// ============ PWA功能 ============
// 註冊Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // 這裡可以註冊Service Worker
        // navigator.serviceWorker.register('/sw.js');
    });
}

// 預防iOS縮放
document.addEventListener('touchstart', function(e) {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
});

let lastTouchEnd = 0;
document.addEventListener('touchend', function(e) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// ============ 全域函數導出（供HTML呼叫） ============
window.login = login;
window.switchFunction = switchFunction;
window.manualSync = manualSync;
window.refreshInvitationList = refreshInvitationList;
window.editInvitation = editInvitation;
window.deleteInvitation = deleteInvitation;
window.closeEditModal = closeEditModal;
window.toggleCheckbox = toggleCheckbox;
window.toggleEditCheckbox = toggleEditCheckbox;
window.checkQuotaWarning = checkQuotaWarning;