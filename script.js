// 修正後的健檢邀約系統前端 JavaScript - 台灣時區版本
// 更新您的 Google Apps Script 部署 URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxxhkCskd6Emdr6Nu77sKGCjdsRdgoOX5YPnpgtrK_RXRLBhLGv5HgQ4r-PP-a4_CTB/exec';

// ============ 台灣時間處理函數 ============
/**
 * 獲取台灣時間戳記
 */
function getTaiwanTimestamp() {
    const now = new Date();
    // 獲取台灣時間字串，然後重新建立 Date 物件
    const taiwanTimeString = now.toLocaleString("en-US", {
        timeZone: "Asia/Taipei",
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    // 解析時間字串並格式化為 ISO 格式 (但保持台灣時間)
    const taiwanTime = new Date(taiwanTimeString);
    const year = taiwanTime.getFullYear();
    const month = String(taiwanTime.getMonth() + 1).padStart(2, '0');
    const day = String(taiwanTime.getDate()).padStart(2, '0');
    const hours = String(taiwanTime.getHours()).padStart(2, '0');
    const minutes = String(taiwanTime.getMinutes()).padStart(2, '0');
    const seconds = String(taiwanTime.getSeconds()).padStart(2, '0');
    const milliseconds = String(taiwanTime.getMilliseconds()).padStart(3, '0');
    
    // 返回台灣時間的 ISO 格式字串，加上 +08:00 時區標識
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+08:00`;
}

/**
 * 獲取台灣的今日字串
 */
function getTodayStringTaiwan(format) {
    const now = new Date();
    // 使用台灣時區
    const taiwanTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
    
    const year = taiwanTime.getFullYear();
    const month = String(taiwanTime.getMonth() + 1).padStart(2, '0');
    const day = String(taiwanTime.getDate()).padStart(2, '0');
    
    if (format === 'MMDD') {
        return month + day;
    }
    return year.toString() + month + day;
}

/**
 * 獲取台灣的年份
 */
function getYearTaiwan() {
    const now = new Date();
    const taiwanTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
    return taiwanTime.getFullYear().toString();
}

/**
 * 格式化台灣時間顯示
 */
function formatTaiwanTime(timestamp) {
    if (!timestamp) return '';
    
    try {
        // 如果時間戳記包含時區資訊，直接解析
        const date = new Date(timestamp);
        
        // 使用台灣時區格式化顯示
        const taiwanTimeString = date.toLocaleString("en-US", {
            timeZone: "Asia/Taipei",
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        // 解析格式化後的字串
        const parts = taiwanTimeString.split(', ');
        const datePart = parts[0]; // MM/DD/YYYY
        const timePart = parts[1]; // HH:MM
        
        const [month, day] = datePart.split('/');
        
        return `${month}/${day} ${timePart}`;
    } catch (error) {
        console.error('時間格式化錯誤:', error);
        return timestamp;
    }
}

// 全域變數
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
    console.log('初始化應用程式...');
    console.log('當前台灣時間:', getTaiwanTimestamp());
    console.log('今日日期 (台灣):', getTodayStringTaiwan());
    
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
        console.log('發現已登入用戶:', currentUser.name);
        updateUserInterface();
        loadTodayData();
        loadSessionOptions(currentUser.name);
    }
    
    // 定期自動同步 (每5分鐘)
    setInterval(autoSync, 5 * 60 * 1000);
    
    // 監聽來自 Service Worker 的訊息
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'BACKGROUND_SYNC') {
                autoSync();
            }
        });
    }
    
    console.log('應用程式初始化完成');
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
    if (!indicator) return;
    
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
            console.log('載入本地邀約資料:', localInvitations.length, '筆');
        }
        
        // 載入當前用戶
        const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            console.log('載入已登入用戶:', currentUser.name);
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
        localStorage.setItem(STORAGE_KEYS.LAST_SYNC, getTaiwanTimestamp()); // 使用台灣時間
    } catch (error) {
        console.error('儲存本地資料失敗:', error);
        showAlert('error', '本地儲存失敗，請檢查儲存空間');
    }
}

function addInvitationToLocal(invitationData) {
    // 生成本地ID
    const localId = 'LOCAL_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const timestamp = getTaiwanTimestamp(); // 使用台灣時間戳記
    
    const invitation = {
        id: localId,
        localId: localId, // 本地唯一標識
        serverId: null, // 服務器ID，同步後填入
        syncStatus: SYNC_STATUS.PENDING,
        syncError: null,
        createTime: timestamp, // 台灣時間
        lastModified: timestamp, // 台灣時間
        
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
        
        // 邀約日期 (台灣時間)
        inviteDate: getTodayStringTaiwan('MMDD')
    };
    
    localInvitations.unshift(invitation); // 加到開頭
    saveLocalData();
    updateLocalCounts();
    updateLocalStats();
    
    console.log('新增本地邀約 (台灣時間):', invitation.name, '時間:', timestamp);
    return invitation;
}

function updateInvitationInLocal(localId, updateData) {
    const index = localInvitations.findIndex(inv => inv.localId === localId);
    if (index === -1) return false;
    
    const invitation = localInvitations[index];
    const timestamp = getTaiwanTimestamp(); // 使用台灣時間戳記
    
    // 更新資料
    Object.assign(invitation, updateData, {
        lastModified: timestamp, // 台灣時間
        syncStatus: invitation.syncStatus === SYNC_STATUS.SYNCED ? SYNC_STATUS.PENDING : invitation.syncStatus
    });
    
    // 重新解析場次資訊
    if (updateData.sessionInfo) {
        Object.assign(invitation, parseSessionInfo(updateData.sessionInfo));
    }
    
    saveLocalData();
    updateLocalCounts();
    updateLocalStats();
    
    console.log('更新本地邀約 (台灣時間):', invitation.name, '時間:', timestamp);
    return true;
}

function deleteInvitationFromLocal(localId) {
    const index = localInvitations.findIndex(inv => inv.localId === localId);
    if (index === -1) return false;
    
    const invitation = localInvitations[index];
    localInvitations.splice(index, 1);
    saveLocalData();
    updateLocalCounts();
    updateLocalStats();
    
    console.log('刪除本地邀約 (台灣時間):', invitation.name, '時間:', getTaiwanTimestamp());
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
            year: getYearTaiwan() // 使用台灣年份
        };
    }
    return {
        date: '',
        region: '',
        location: '',
        appointmentType: '副約',
        year: getYearTaiwan() // 使用台灣年份
    };
}

// ============ 計數管理 ============
function updateLocalCounts() {
    const todayStr = getTodayStringTaiwan('MMDD'); // 使用台灣的今日
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
    const elements = {
        morningCount: document.getElementById('morningCount'),
        afternoonCount: document.getElementById('afternoonCount'),
        eveningCount: document.getElementById('eveningCount'),
        todayCount: document.getElementById('todayCount'),
        remainingCount: document.getElementById('remainingCount')
    };
    
    if (elements.morningCount) elements.morningCount.textContent = invitationCounts.morning;
    if (elements.afternoonCount) elements.afternoonCount.textContent = invitationCounts.afternoon;
    if (elements.eveningCount) elements.eveningCount.textContent = invitationCounts.evening;
    if (elements.todayCount) elements.todayCount.textContent = invitationCounts.total;
    
    const remaining = Math.max(0, quotaLimits.total - invitationCounts.total);
    if (elements.remainingCount) elements.remainingCount.textContent = remaining;
    
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
    const todayStr = getTodayStringTaiwan('MMDD'); // 使用台灣的今日
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
    
    const elements = {
        localCount: document.getElementById('localCount'),
        pendingCount: document.getElementById('pendingCount'),
        syncedCount: document.getElementById('syncedCount')
    };
    
    if (elements.localCount) elements.localCount.textContent = localCount;
    if (elements.pendingCount) elements.pendingCount.textContent = pendingCount;
    if (elements.syncedCount) elements.syncedCount.textContent = syncedCount;
}

// ============ Google Apps Script API 呼叫 ============
function callGoogleScript(functionName, data = {}) {
    console.log('呼叫 API 函數:', functionName, data);
    
    return new Promise((resolve, reject) => {
        const payload = {
            function: functionName,
            parameters: data,
            timestamp: getTaiwanTimestamp(), // 加入台灣時間戳記
            timezone: 'Asia/Taipei'
        };
        
        // 使用 FormData 避免 CORS 預檢請求
        const formData = new FormData();
        formData.append('data', JSON.stringify(payload));
        
        const requestOptions = {
            method: 'POST',
            body: formData,
            // 不設定 Content-Type，讓瀏覽器自動設定
        };
        
        fetch(GOOGLE_SCRIPT_URL, requestOptions)
        .then(response => {
            console.log('API 回應狀態:', response.status, response.statusText);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response.text();
        })
        .then(text => {
            console.log('API 回應內容:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
            
            try {
                const result = JSON.parse(text);
                if (result.success === false && result.error) {
                    reject(new Error(result.error));
                } else {
                    resolve(result);
                }
            } catch (parseError) {
                console.error('JSON 解析錯誤:', parseError);
                
                if (text.includes('<html>') || text.includes('<!DOCTYPE')) {
                    reject(new Error('收到 HTML 回應，可能是權限或部署問題'));
                } else {
                    reject(new Error('API 回應格式錯誤: ' + text.substring(0, 100)));
                }
            }
        })
        .catch(error => {
            console.error('API 請求失敗:', error);
            
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                reject(new Error('網路錯誤或 CORS 問題，請檢查 Google Apps Script 部署設定'));
            } else {
                reject(error);
            }
        });
    });
}

function safeGoogleScriptCall(functionName, successCallback, errorCallback, data = {}) {
    // 移除原來的 ...args 邏輯，直接使用 data 參數
    callGoogleScript(functionName, data)
        .then(result => {
            if (successCallback) successCallback(result);
        })
        .catch(error => {
            console.error('API 呼叫失敗:', functionName, error);
            if (errorCallback) {
                errorCallback(error.message || error.toString());
            }
        });
}

// ============ 雲端同步功能 ============
function autoSync() {
    if (!isOnline || syncInProgress || !currentUser) return;
    
    const pendingInvitations = localInvitations.filter(inv => 
        inv.syncStatus === SYNC_STATUS.PENDING || inv.syncStatus === SYNC_STATUS.ERROR
    );
    
    if (pendingInvitations.length > 0) {
        console.log('開始自動同步 (台灣時間):', pendingInvitations.length, '筆資料，時間:', getTaiwanTimestamp());
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
    
    console.log('開始手動同步 (台灣時間):', pendingInvitations.length, '筆資料，時間:', getTaiwanTimestamp());
    syncToCloud(pendingInvitations);
}

function syncToCloud(invitations) {
    if (!invitations || invitations.length === 0) return;
    
    syncInProgress = true;
    updateNetworkStatus();
    showSyncStatus('正在同步 ' + invitations.length + ' 筆資料...', 'info');
    
    const syncBtn = document.getElementById('syncBtn');
    const syncBtnText = document.getElementById('syncBtnText');
    if (syncBtn && syncBtnText) {
        syncBtn.disabled = true;
        syncBtnText.innerHTML = '<div class="loading-spinner"></div>同步中...';
    }
    
    // 標記為同步中
    invitations.forEach(function(inv) {
        inv.syncStatus = SYNC_STATUS.SYNCING;
        inv.lastModified = getTaiwanTimestamp(); // 更新為台灣時間
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
    
    callGoogleScript('submitInvitation', formData)
        .then(result => {
            if (result.success) {
                invitation.syncStatus = SYNC_STATUS.SYNCED;
                invitation.serverId = result.invitationId || invitation.localId;
                invitation.syncError = null;
                invitation.lastModified = getTaiwanTimestamp(); // 更新為台灣時間
                console.log('同步成功 (台灣時間):', invitation.name, '時間:', invitation.lastModified);
            } else {
                invitation.syncStatus = SYNC_STATUS.ERROR;
                invitation.syncError = result.message || '同步失敗';
                invitation.lastModified = getTaiwanTimestamp(); // 更新為台灣時間
                console.error('同步失敗 (台灣時間):', invitation.name, result.message);
            }
            
            // 繼續下一個
            setTimeout(function() {
                batchSyncInvitations(invitations, index + 1);
            }, 500); // 避免過於頻繁的請求
        })
        .catch(error => {
            invitation.syncStatus = SYNC_STATUS.ERROR;
            invitation.syncError = error.toString();
            invitation.lastModified = getTaiwanTimestamp(); // 更新為台灣時間
            console.error('同步錯誤 (台灣時間):', invitation.name, error);
            
            // 繼續下一個
            setTimeout(function() {
                batchSyncInvitations(invitations, index + 1);
            }, 500);
        });
}

function finishSync() {
    syncInProgress = false;
    updateNetworkStatus();
    saveLocalData();
    updateLocalStats();
    updateInvitationListDisplay();
    
    const syncBtn = document.getElementById('syncBtn');
    const syncBtnText = document.getElementById('syncBtnText');
    if (syncBtn && syncBtnText) {
        syncBtn.disabled = false;
        syncBtnText.textContent = '同步至雲端';
    }
    
    const syncedCount = localInvitations.filter(inv => inv.syncStatus === SYNC_STATUS.SYNCED).length;
    const errorCount = localInvitations.filter(inv => inv.syncStatus === SYNC_STATUS.ERROR).length;
    
    if (errorCount === 0) {
        showSyncStatus('同步完成！共同步 ' + syncedCount + ' 筆資料 (台灣時間: ' + formatTaiwanTime(getTaiwanTimestamp()) + ')', 'success');
    } else {
        showSyncStatus('同步完成，' + syncedCount + ' 筆成功，' + errorCount + ' 筆失敗', 'warning');
    }
    
    console.log('同步完成 (台灣時間)，成功:', syncedCount, '失敗:', errorCount, '時間:', getTaiwanTimestamp());
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
        localId: invitation.localId,
        clientTimestamp: getTaiwanTimestamp() // 加入客戶端台灣時間戳記
    };
}

function showSyncStatus(message, type) {
    const syncStatus = document.getElementById('syncStatus');
    if (!syncStatus) return;
    
    syncStatus.className = 'sync-status show ' + (type || 'info');
    syncStatus.textContent = message;
    
    if (type === 'success' || type === 'warning') {
        setTimeout(function() {
            syncStatus.classList.remove('show');
        }, 3000);
    }
}

// ============ 用戶管理和載入功能 ============
function loadUserList() {
    console.log('載入用戶列表...');
    
    safeGoogleScriptCall(
        'getUserList',
        function(users) {
            console.log('用戶列表載入成功:', users.length, '個用戶');
            
            const select = document.getElementById('staffSelect');
            if (!select) return;
            
            select.innerHTML = '<option value="">選擇邀約人員</option>';
            
            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                const option = document.createElement('option');
                option.value = user.name;
                option.textContent = user.name;
                option.dataset.hasPassword = user.hasPassword;
                select.appendChild(option);
            }
        },
        function(error) {
            console.error('載入用戶列表失敗:', error);
            showAlert('error', '載入用戶列表失敗：' + error);
        },
        {} // 空物件，getUserList 不需要參數
    );
}

function loadSessionOptions(staffName) {
    console.log('載入場次選項:', staffName);
    
    safeGoogleScriptCall(
        'getSessionOptions',
        function(sessions) {
            console.log('場次選項載入成功:', sessions.length, '個場次');
            sessionOptions = sessions;
            updateSessionSelect('sessionInfo', sessions);
            updateSessionSelect('editSessionInfo', sessions);
        },
        function(error) {
            console.error('載入場次選項失敗:', error);
            showAlert('error', '載入場次選項失敗：' + error);
        },
        { staffName: staffName || '' }  // 正確的參數格式
    );
}

function updateSessionSelect(selectId, sessions) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
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
    
    console.log('嘗試登入 (台灣時間):', staffName, '時間:', getTaiwanTimestamp());
    
    const selectedOption = document.querySelector('#staffSelect option[value="' + staffName + '"]');
    const hasPassword = selectedOption && selectedOption.dataset.hasPassword === 'true';
    
    if (hasPassword && !password) {
        showAlert('error', '此帳號需要密碼');
        return;
    }
    
    // 修正：將參數正確打包成物件
    const loginData = {
        username: staffName,    // 對應 Google Apps Script 的第一個參數
        password: password || '', // 對應 Google Apps Script 的第二個參數
        clientTimezone: 'Asia/Taipei',
        loginTime: getTaiwanTimestamp()
    };
    
    safeGoogleScriptCall(
        'authenticateUser',
        function(result) {
            if (result.success) {
                console.log('登入成功 (台灣時間):', result.user, '時間:', getTaiwanTimestamp());
                currentUser = result.user;
                currentUser.loginTime = getTaiwanTimestamp(); // 記錄登入時間
                saveLocalData();
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
        loginData  // 傳遞包含 username 和 password 的物件
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
        const loginTimeDisplay = currentUser.loginTime ? 
            ' (登入: ' + formatTaiwanTime(currentUser.loginTime) + ')' : '';
        userInfo.innerHTML = '<div><div class="user-name">' + currentUser.name + loginTimeDisplay + '</div></div>';
    }
    
    if (loginForm) loginForm.style.display = 'none';
    if (quotaInfo) quotaInfo.style.display = 'grid';
    if (sessionQuotas) sessionQuotas.style.display = 'grid';
    if (functionTabs) functionTabs.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'block';
}

function loadTodayData() {
    const todayTaiwan = getTodayStringTaiwan(); // 使用台灣的今日
    
    console.log('載入今日資料 (台灣時間):', todayTaiwan);
    
    safeGoogleScriptCall(
        'getTodayQuota',
        function(quota) {
            console.log('限額資料載入成功 (台灣時間):', quota);
            quotaLimits = quota;
            
            const elements = {
                morningLimit: document.getElementById('morningLimit'),
                afternoonLimit: document.getElementById('afternoonLimit'),
                eveningLimit: document.getElementById('eveningLimit'),
                todayLimit: document.getElementById('todayLimit')
            };
            
            if (elements.morningLimit) elements.morningLimit.textContent = quota.morning;
            if (elements.afternoonLimit) elements.afternoonLimit.textContent = quota.afternoon;
            if (elements.eveningLimit) elements.eveningLimit.textContent = quota.evening;
            if (elements.todayLimit) elements.todayLimit.textContent = quota.total;
            
            updateCountDisplay();
        },
        function(error) {
            console.error('載入限額失敗:', error);
        },
        {
            staffName: currentUser.name,
            date: todayTaiwan
        }
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
    
    if (!warningDiv || !session || !sessionInfo) {
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
    
    // 找到被點擊的按鈕並添加 active 類
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
    showAlert('success', '名單已更新 (台灣時間: ' + formatTaiwanTime(getTaiwanTimestamp()) + ')');
}

function loadInvitationList() {
    const listContainer = document.getElementById('invitationList');
    if (!listContainer) return;
    
    // 直接從本地資料載入
    const todayStr = getTodayStringTaiwan('MMDD'); // 使用台灣的今日
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
    const timeDisplay = invitation.createTime ? 
        ' (建立: ' + formatTaiwanTime(invitation.createTime) + ')' : '';
    
    return '<div class="invitation-item ' + invitation.syncStatus + '">' +
        syncIndicator +
        '<div class="invitation-header">' +
            '<div>' +
                '<div class="invitation-name">' + invitation.name + 
                ' <span class="appointment-type-tag ' + appointmentTypeClass + '">' + invitation.appointmentType + '</span></div>' +
                '<div class="invitation-phone">' + invitation.phone1 + '</div>' +
                (currentUser && currentUser.name === '系統管理員' ? '<div style="font-size: 0.75em; color: #666;">邀約人：' + invitation.inviter + timeDisplay + '</div>' : '') +
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
        (invitation.lastModified ? '<div style="margin-top: 4px; font-size: 0.7em; color: #999;">最後修改: ' + formatTaiwanTime(invitation.lastModified) + '</div>' : '') +
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
        inviter: currentUser.name,
        submitTime: getTaiwanTimestamp() // 加入提交時間戳記
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
    
    showSubmitStatus('processing', '正在儲存邀約資料... (台灣時間: ' + formatTaiwanTime(getTaiwanTimestamp()) + ')');
    
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
        console.error('提交邀約失敗 (台灣時間):', error, '時間:', getTaiwanTimestamp());
        showSubmitStatus('error', '儲存失敗：' + error.toString());
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '提交邀約資料';
        }
    }
}

function resetForm() {
    const elements = {
        name: document.getElementById('name'),
        phone1: document.getElementById('phone1'),
        phone2: document.getElementById('phone2'),
        notes: document.getElementById('notes'),
        sessionInfo: document.getElementById('sessionInfo'),
        session: document.getElementById('session')
    };
    
    if (elements.name) elements.name.value = '';
    if (elements.phone1) elements.phone1.value = '';
    if (elements.phone2) elements.phone2.value = '';
    if (elements.notes) elements.notes.value = '';
    if (elements.sessionInfo) elements.sessionInfo.value = '';
    if (elements.session) elements.session.value = '';
    
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
    if (!invitation) {
        showAlert('error', '找不到邀約記錄');
        return;
    }
    
    editingInvitation = invitation;
    
    const elements = {
        editId: document.getElementById('editId'),
        editName: document.getElementById('editName'),
        editPhone1: document.getElementById('editPhone1'),
        editPhone2: document.getElementById('editPhone2'),
        editSession: document.getElementById('editSession'),
        editNotes: document.getElementById('editNotes'),
        editSessionInfo: document.getElementById('editSessionInfo')
    };
    
    if (elements.editId) elements.editId.value = invitation.localId;
    if (elements.editName) elements.editName.value = invitation.name;
    if (elements.editPhone1) elements.editPhone1.value = invitation.phone1;
    if (elements.editPhone2) elements.editPhone2.value = invitation.phone2 || '';
    if (elements.editSession) elements.editSession.value = invitation.session;
    if (elements.editNotes) elements.editNotes.value = invitation.notes || '';
    if (elements.editSessionInfo) elements.editSessionInfo.value = invitation.sessionInfo;
    
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
    if (checkbox.checked) {
        item.classList.add('checked');
    } else {
        item.classList.remove('checked');
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
        notes: document.getElementById('editNotes').value.trim(),
        editTime: getTaiwanTimestamp() // 加入編輯時間戳記
    };
    
    if (updateInvitationInLocal(localId, updateData)) {
        closeEditModal();
        showAlert('success', '邀約資料已更新！(台灣時間: ' + formatTaiwanTime(getTaiwanTimestamp()) + ')');
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
        showAlert('success', '邀約記錄已刪除！(台灣時間: ' + formatTaiwanTime(getTaiwanTimestamp()) + ')');
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
    
    if (checkbox.checked) {
        item.classList.add('checked');
    } else {
        item.classList.remove('checked');
    }
}

function toggleEditCheckbox(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;
    
    const item = checkbox.closest('.checkbox-item');
    
    checkbox.checked = !checkbox.checked;
    
    if (checkbox.checked) {
        item.classList.add('checked');
    } else {
        item.classList.remove('checked');
    }
}

function showAlert(type, message) {
    const alert = document.getElementById('alertMessage');
    if (!alert) return;
    
    alert.className = 'alert ' + type;
    alert.textContent = message;
    alert.style.display = 'block';
    
    setTimeout(function() {
        alert.style.display = 'none';
    }, 3000);
}

function showSubmitStatus(type, message) {
    const status = document.getElementById('submitStatus');
    if (!status) return;
    
    status.className = 'submit-status ' + type;
    status.textContent = message;
    status.style.display = 'block';
    
    if (type !== 'processing') {
        setTimeout(function() {
            status.style.display = 'none';
        }, 3000);
    }
}

function updateInvitationListDisplay() {
    if (currentFunction === 'list') {
        loadInvitationList();
    }
}

// ============ API 連接測試 ============
function testAPIConnection() {
    console.log('測試 API 連接 (台灣時間)...', getTaiwanTimestamp());
    
    // 先測試 GET 請求
    fetch(GOOGLE_SCRIPT_URL, { method: 'GET' })
        .then(response => {
            console.log('GET 測試 - 狀態:', response.status);
            return response.text();
        })
        .then(text => {
            console.log('GET 測試 - 回應:', text.substring(0, 200));
            
            // 然後測試 POST 請求
            return callGoogleScript('testConnection', { 
                testTime: getTaiwanTimestamp(),
                timezone: 'Asia/Taipei'
            });
        })
        .then(result => {
            console.log('POST 測試 - 結果:', result);
            if (result.success) {
                showAlert('success', 'API 連接測試成功！(台灣時間: ' + formatTaiwanTime(getTaiwanTimestamp()) + ')');
            } else {
                showAlert('warning', 'API 連接測試部分成功');
            }
        })
        .catch(error => {
            console.error('API 連接測試失敗 (台灣時間):', error, '時間:', getTaiwanTimestamp());
            showAlert('error', 'API 連接失敗: ' + error.message);
        });
}

// ============ 頁面初始化 ============
document.addEventListener('DOMContentLoaded', function() {
    console.log('頁面載入完成，開始初始化... (台灣時間: ' + getTaiwanTimestamp() + ')');
    
    initializeApp();
    
    // 綁定表單事件
    const invitationForm = document.getElementById('invitationForm');
    const editForm = document.getElementById('editForm');
    
    if (invitationForm) {
        invitationForm.addEventListener('submit', handleSubmit);
    }
    
    if (editForm) {
        editForm.addEventListener('submit', handleEditSubmit);
    }
    
    // 模態框點擊背景關閉
    const editModal = document.getElementById('editModal');
    if (editModal) {
        editModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeEditModal();
            }
        });
    }
    
    // 延遲測試 API 連接
    setTimeout(testAPIConnection, 3000);
});

// ============ PWA功能 ============
// 註冊Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/invitation-app/sw.js')
            .then(registration => {
                console.log('Service Worker 註冊成功 (台灣時間):', registration, '時間:', getTaiwanTimestamp());
            })
            .catch(error => {
                console.log('Service Worker 註冊失敗 (台灣時間):', error, '時間:', getTaiwanTimestamp());
            });
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

// 導出台灣時間函數供調試使用
window.getTaiwanTimestamp = getTaiwanTimestamp;
window.getTodayStringTaiwan = getTodayStringTaiwan;
window.formatTaiwanTime = formatTaiwanTime;

// ============ 調試和監控功能 ============
/**
 * 時區測試函數 - 可在瀏覽器控制台執行
 */
function debugTimezone() {
    const localTime = new Date();
    const taiwanTime = getTaiwanTimestamp();
    const todayTaiwan = getTodayStringTaiwan();
    const todayMMDD = getTodayStringTaiwan('MMDD');
    
    console.log('=== 時區調試資訊 ===');
    console.log('本地時間:', localTime.toString());
    console.log('本地時間 ISO:', localTime.toISOString());
    console.log('台灣時間戳記:', taiwanTime);
    console.log('台灣今日 (YYYYMMDD):', todayTaiwan);
    console.log('台灣今日 (MMDD):', todayMMDD);
    console.log('格式化顯示:', formatTaiwanTime(taiwanTime));
    console.log('本地時區偏移 (分鐘):', localTime.getTimezoneOffset());
    console.log('==================');
    
    return {
        localTime: localTime.toString(),
        localTimeISO: localTime.toISOString(),
        taiwanTimestamp: taiwanTime,
        todayTaiwan: todayTaiwan,
        todayMMDD: todayMMDD,
        formatted: formatTaiwanTime(taiwanTime),
        timezoneOffset: localTime.getTimezoneOffset()
    };
}

/**
 * 數據統計函數
 */
function getLocalStats() {
    const todayStr = getTodayStringTaiwan('MMDD');
    const stats = {
        totalInvitations: localInvitations.length,
        todayInvitations: localInvitations.filter(inv => inv.inviteDate === todayStr).length,
        pendingSync: localInvitations.filter(inv => inv.syncStatus === SYNC_STATUS.PENDING).length,
        syncedCount: localInvitations.filter(inv => inv.syncStatus === SYNC_STATUS.SYNCED).length,
        errorCount: localInvitations.filter(inv => inv.syncStatus === SYNC_STATUS.ERROR).length,
        currentUser: currentUser ? currentUser.name : '未登入',
        isOnline: isOnline,
        syncInProgress: syncInProgress,
        currentTime: getTaiwanTimestamp(),
        timezone: 'Asia/Taipei'
    };
    
    console.log('=== 本地數據統計 ===');
    console.log('總邀約數:', stats.totalInvitations);
    console.log('今日邀約數:', stats.todayInvitations);
    console.log('待同步:', stats.pendingSync);
    console.log('已同步:', stats.syncedCount);
    console.log('同步錯誤:', stats.errorCount);
    console.log('當前用戶:', stats.currentUser);
    console.log('網路狀態:', stats.isOnline ? '在線' : '離線');
    console.log('同步狀態:', stats.syncInProgress ? '進行中' : '閒置');
    console.log('當前時間 (台灣):', stats.currentTime);
    console.log('==================');
    
    return stats;
}

/**
 * 清理本地數據 - 謹慎使用
 */
function clearLocalData(confirm = false) {
    if (!confirm) {
        console.warn('警告：此操作將清除所有本地數據！');
        console.warn('如要確認執行，請調用 clearLocalData(true)');
        return false;
    }
    
    try {
        localStorage.removeItem(STORAGE_KEYS.INVITATIONS);
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
        
        localInvitations = [];
        currentUser = null;
        
        console.log('本地數據已清除 (台灣時間):', getTaiwanTimestamp());
        
        // 重新載入頁面
        if (typeof location !== 'undefined') {
            location.reload();
        }
        
        return true;
    } catch (error) {
        console.error('清除本地數據失敗:', error);
        return false;
    }
}

/**
 * 強制同步所有數據
 */
function forceSyncAll() {
    if (!isOnline) {
        console.error('無法同步：網路未連接');
        return false;
    }
    
    if (syncInProgress) {
        console.warn('同步已在進行中');
        return false;
    }
    
    const allPendingInvitations = localInvitations.filter(inv => 
        inv.syncStatus === SYNC_STATUS.PENDING || 
        inv.syncStatus === SYNC_STATUS.ERROR
    );
    
    if (allPendingInvitations.length === 0) {
        console.log('沒有需要同步的數據');
        return true;
    }
    
    console.log('強制同步所有數據 (台灣時間):', allPendingInvitations.length, '筆，時間:', getTaiwanTimestamp());
    syncToCloud(allPendingInvitations);
    return true;
}

/**
 * 導出數據為 JSON - 用於備份
 */
function exportData() {
    const exportData = {
        invitations: localInvitations,
        currentUser: currentUser,
        exportTime: getTaiwanTimestamp(),
        timezone: 'Asia/Taipei',
        version: '2.1.0'
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    // 創建下載連結
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = '健檢邀約數據_' + getTodayStringTaiwan() + '.json';
    link.click();
    
    console.log('數據已導出 (台灣時間):', getTaiwanTimestamp());
    return exportData;
}

/**
 * 系統健康檢查
 */
function systemHealthCheck() {
    const health = {
        localStorage: true,
        apiConnection: true,
        userData: !!currentUser,
        networkStatus: isOnline,
        serviceWorker: 'serviceWorker' in navigator,
        notifications: 'Notification' in window,
        timestamp: getTaiwanTimestamp(),
        timezone: 'Asia/Taipei'
    };
    
    try {
        // 測試 localStorage
        localStorage.setItem('_test_', 'test');
        localStorage.removeItem('_test_');
    } catch (error) {
        health.localStorage = false;
        console.error('localStorage 不可用:', error);
    }
    
    // 測試 API 連接
    callGoogleScript('testConnection', { healthCheck: true })
        .then(result => {
            health.apiConnection = result.success;
            console.log('系統健康檢查完成 (台灣時間):', health);
        })
        .catch(error => {
            health.apiConnection = false;
            console.error('API 連接測試失敗:', error);
            console.log('系統健康檢查完成 (台灣時間):', health);
        });
    
    return health;
}

// 導出調試函數
window.debugTimezone = debugTimezone;
window.getLocalStats = getLocalStats;
window.clearLocalData = clearLocalData;
window.forceSyncAll = forceSyncAll;
window.exportData = exportData;
window.systemHealthCheck = systemHealthCheck;

console.log('=== 健檢邀約系統 台灣時區版本載入完成 ===');
console.log('當前時間 (台灣):', getTaiwanTimestamp());
console.log('可用調試函數:', [
    'debugTimezone()', 
    'getLocalStats()', 
    'clearLocalData(true)', 
    'forceSyncAll()', 
    'exportData()', 
    'systemHealthCheck()'
]);
console.log('=====================================');