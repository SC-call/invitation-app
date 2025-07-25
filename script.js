/**
 * Google Apps Script - 健檢邀約系統 PWA 版本 (GMT+8)
 * 修正版本 - 所有時間戳記改為 GMT+8
 */

// 配置部分 - 請更新為您的實際文件ID
const CONFIG = {
    // Google Drive 中的JSON文件ID
    ACCOUNT_FILE_ID: '1bCSMTR0D2MsJKwxKlXnPxkkj9qCyj3N1',
    SCHEDULE_FILE_ID: '13HgAFzHCmh0UA8V69OpHqKQKXjcvFoZm',
    
    // Google Sheets ID - 用於儲存邀約資料
    INVITATION_SHEET_ID: '1uJZuDmY1NtrveJBGs1EAtvIagodnolDhH2GXByK0VaI'
  };
  
  // ============ GMT+8 時間處理函數 ============
  /**
   * 獲取 GMT+8 時間戳記
   */
  function getGMT8Timestamp() {
      const now = new Date();
      // 使用 Google Apps Script 的時區處理，設定為台北時區
      return Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'');
  }
  
  /**
   * 獲取 GMT+8 的今日字串
   */
  function getTodayStringGMT8(format) {
      const now = new Date();
      
      if (format === 'MMDD') {
          return Utilities.formatDate(now, 'Asia/Taipei', 'MMdd');
      }
      return Utilities.formatDate(now, 'Asia/Taipei', 'yyyyMMdd');
  }
  
  /**
   * 獲取 GMT+8 的年份
   */
  function getYearGMT8() {
      const now = new Date();
      return Utilities.formatDate(now, 'Asia/Taipei', 'yyyy');
  }
  
  /**
   * 建立 CORS 回應 - 統一的標頭設定函數
   */
  function createCORSResponse(content, mimeType) {
    const output = ContentService
      .createTextOutput(content)
      .setMimeType(mimeType || ContentService.MimeType.JSON);
      
    return output;
  }
  
  /**
   * 處理 OPTIONS 請求 - CORS 預檢請求 (必須存在!)
   */
  function doOptions(e) {
    console.log('收到 OPTIONS 請求');
    return createCORSResponse('', ContentService.MimeType.TEXT);
  }
  
  /**
   * 處理 GET 請求 - 用於測試連接
   */
  function doGet(e) {
    console.log('收到 GET 請求:', e);
    
    try {
      const response = {
        success: true,
        message: 'Google Apps Script API 運行正常',
        timestamp: getGMT8Timestamp(),
        version: '2.1.0-GMT8',
        method: 'GET',
        timezone: 'GMT+8 (Asia/Taipei)'
      };
      
      return createCORSResponse(JSON.stringify(response));
        
    } catch (error) {
      console.error('doGet 錯誤:', error);
      
      const errorResponse = {
        success: false,
        error: error.toString(),
        message: 'GET 請求處理失敗',
        timestamp: getGMT8Timestamp()
      };
      
      return createCORSResponse(JSON.stringify(errorResponse));
    }
  }
  
  /**
   * 處理 POST 請求 - PWA 專用
   */
  function doPost(e) {
    console.log('收到 POST 請求:', e);
    
    try {
      // 解析請求資料
      let requestData;
      
      if (e.postData && e.postData.contents) {
        // JSON 格式請求
        try {
          requestData = JSON.parse(e.postData.contents);
        } catch (parseError) {
          console.error('JSON 解析失敗:', parseError);
          throw new Error('無法解析 JSON 請求內容');
        }
      } else if (e.parameter && e.parameter.data) {
        // FormData 格式請求
        try {
          requestData = JSON.parse(e.parameter.data);
        } catch (parseError) {
          console.error('FormData 解析失敗:', parseError);
          throw new Error('無法解析 FormData 請求內容');
        }
      } else {
        // 如果沒有請求資料，返回基本資訊
        const basicResponse = {
          success: true,
          message: 'POST 請求已接收，但沒有資料',
          timestamp: getGMT8Timestamp(),
          timezone: 'GMT+8 (Asia/Taipei)',
          availableFunctions: [
            'getUserList', 'authenticateUser', 'getSessionOptions',
            'getTodayQuota', 'getTodayInvitations', 'submitInvitation',
            'batchSubmitInvitations', 'updateInvitation', 'deleteInvitation',
            'getTodayInvitationList', 'testConnection'
          ]
        };
        
        return createCORSResponse(JSON.stringify(basicResponse));
      }
      
      console.log('解析後的資料:', requestData);
      
      const functionName = requestData.function || 'testConnection';
      const parameters = requestData.parameters || {};
      
      let result;
      
      // 路由到對應的函數
      switch (functionName) {
        case 'getUserList':
          result = getUserList();
          break;
        case 'authenticateUser':
          result = authenticateUser(parameters.username, parameters.password);
          break;
        case 'getSessionOptions':
          result = getSessionOptions(parameters.staffName);
          break;
        case 'getTodayQuota':
          result = getTodayQuota(parameters.staffName, parameters.date);
          break;
        case 'getTodayInvitations':
          result = getTodayInvitations(parameters.inviter, parameters.date);
          break;
        case 'submitInvitation':
          result = submitInvitation(parameters);
          break;
        case 'batchSubmitInvitations':
          result = batchSubmitInvitations(parameters.invitations);
          break;
        case 'updateInvitation':
          result = updateInvitation(parameters);
          break;
        case 'deleteInvitation':
          result = deleteInvitation(parameters.id);
          break;
        case 'getTodayInvitationList':
          result = getTodayInvitationList(parameters.inviter, parameters.date);
          break;
        case 'testConnection':
          result = testConnection();
          break;
        default:
          result = { 
            success: false,
            error: '未知的函數名稱: ' + functionName,
            availableFunctions: [
              'getUserList', 'authenticateUser', 'getSessionOptions',
              'getTodayQuota', 'getTodayInvitations', 'submitInvitation',
              'batchSubmitInvitations', 'updateInvitation', 'deleteInvitation',
              'getTodayInvitationList', 'testConnection'
            ]
          };
      }
      
      console.log('執行結果:', result);
      
      // 返回結果
      return createCORSResponse(JSON.stringify(result));
        
    } catch (error) {
      console.error('doPost 錯誤:', error);
      
      const errorResponse = { 
        success: false,
        error: error.toString(),
        message: '服務器處理錯誤',
        timestamp: getGMT8Timestamp()
      };
      
      return createCORSResponse(JSON.stringify(errorResponse));
    }
  }
  
  /**
   * 測試連接 - 供 PWA 檢查 API 狀態
   */
  function testConnection() {
    try {
      // 簡單測試各個組件
      let status = 'healthy';
      const checks = {};
      
      // 測試 Drive 文件存取
      try {
        readJsonFromDrive(CONFIG.ACCOUNT_FILE_ID);
        checks.accountFile = 'OK';
      } catch (error) {
        checks.accountFile = 'FAILED: ' + error.message;
        status = 'unhealthy';
      }
      
      try {
        readJsonFromDrive(CONFIG.SCHEDULE_FILE_ID);
        checks.scheduleFile = 'OK';
      } catch (error) {
        checks.scheduleFile = 'FAILED: ' + error.message;
        status = 'unhealthy';
      }
      
      // 測試 Sheets 存取
      try {
        getInvitationSheet();
        checks.invitationSheet = 'OK';
      } catch (error) {
        checks.invitationSheet = 'FAILED: ' + error.message;
        status = 'unhealthy';
      }
      
      return {
        success: true,
        message: 'API 連接測試完成',
        status: status,
        timestamp: getGMT8Timestamp(),
        timezone: 'GMT+8 (Asia/Taipei)',
        version: '2.1.0-GMT8',
        checks: checks
      };
    } catch (error) {
      return {
        success: false,
        error: error.toString(),
        message: 'API 連接測試失敗',
        timestamp: getGMT8Timestamp()
      };
    }
  }
  
  /**
   * 從Google Drive讀取JSON文件
   */
  function readJsonFromDrive(fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      const content = file.getBlob().getDataAsString();
      return JSON.parse(content);
    } catch (error) {
      console.error('讀取JSON文件失敗:', error);
      throw new Error('無法讀取配置文件 ' + fileId + ': ' + error.toString());
    }
  }
  
  /**
   * 寫入JSON文件到Google Drive
   */
  function writeJsonToDrive(fileId, data) {
    try {
      const file = DriveApp.getFileById(fileId);
      const jsonString = JSON.stringify(data, null, 2);
      file.setContent(jsonString);
      return true;
    } catch (error) {
      console.error('寫入JSON文件失敗:', error);
      throw new Error('無法寫入配置文件 ' + fileId + ': ' + error.toString());
    }
  }
  
  /**
   * 取得邀約資料工作表
   */
  function getInvitationSheet() {
    try {
      const spreadsheet = SpreadsheetApp.openById(CONFIG.INVITATION_SHEET_ID);
      return spreadsheet.getActiveSheet();
    } catch (error) {
      console.error('無法開啟邀約工作表:', error);
      throw new Error('無法連接到資料庫 ' + CONFIG.INVITATION_SHEET_ID + ': ' + error.toString());
    }
  }
  
  /**
   * 初始化邀約工作表
   */
  function initializeInvitationSheet() {
    try {
      const sheet = getInvitationSheet();
      
      // 檢查是否已經初始化
      if (sheet.getLastRow() > 0) {
        const firstRow = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), 22)).getValues()[0];
        if (firstRow[0] === 'ID') {
          console.log('工作表已經初始化');
          return true; // 已初始化
        }
      }
      
      console.log('初始化工作表標題列');
      
      const headers = [
        'ID', '姓名', '電話1', '電話2', '乳攝', '首篩', '子抹', '成健', 
        'BC肝炎', '大腸', '備註', '年份', '日期', '地區', '地點', '場次', 
        '邀約人員', '邀約日期', '約別', '建立時間', '最後修改時間', '本地ID'
      ];
      
      // 清除現有內容並設定標題
      sheet.clear();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      
      // 設定標題樣式
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#4285f4');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
      
      // 凍結標題列
      sheet.setFrozenRows(1);
      
      console.log('工作表初始化完成');
      return true;
      
    } catch (error) {
      console.error('初始化工作表失敗:', error);
      throw new Error('工作表初始化失敗: ' + error.toString());
    }
  }
  
  /**
   * 用戶認證
   */
  function authenticateUser(username, password) {
    try {
      console.log(username)
      console.log(password)
      if (!username) {
        return {
          success: false,
          message: '請輸入用戶名'
        };
      }
      
      const accountData = readJsonFromDrive(CONFIG.ACCOUNT_FILE_ID);
      
      if (!accountData || !accountData.staffList) {
        return {
          success: false,
          message: '用戶資料載入失敗'
        };
      }
      
      const user = accountData.staffList.find(staff => 
        staff.name === username && staff.status === 'active'
      );
      
      if (!user) {
        return {
          success: false,
          message: '用戶名不存在或帳號已停用'
        };
      }
      
      // 檢查密碼（如果用戶有設定密碼）
      if (user.password && user.password !== '' && user.password !== password) {
        return {
          success: false,
          message: '密碼錯誤'
        };
      }
      
      return {
        success: true,
        user: {
          name: user.name,
          role: user.role || 'staff',
          status: user.status
        },
        message: '登入成功'
      };
      
    } catch (error) {
      console.error('用戶認證錯誤:', error);
      return {
        success: false,
        message: '認證服務暫時無法使用: ' + error.message
      };
    }
  }
  
  /**
   * 取得用戶列表
   */
  function getUserList() {
    try {
      const accountData = readJsonFromDrive(CONFIG.ACCOUNT_FILE_ID);
      
      if (!accountData || !accountData.staffList) {
        return [];
      }
      
      return accountData.staffList
        .filter(staff => staff.status === 'active')
        .map(staff => ({
          name: staff.name,
          role: staff.role || 'staff',
          hasPassword: !!(staff.password && staff.password !== '')
        }));
      
    } catch (error) {
      console.error('取得用戶列表錯誤:', error);
      return [];
    }
  }
  
  /**
   * 取得今日限額配置
   */
  function getTodayQuota(staffName, date) {
    try {
      if (!staffName) {
        return { morning: 0, afternoon: 0, evening: 0, total: 0 };
      }
      
      const scheduleData = readJsonFromDrive(CONFIG.SCHEDULE_FILE_ID);
      
      if (!scheduleData || !scheduleData.Name || !scheduleData.Data) {
        return { morning: 0, afternoon: 0, evening: 0, total: 0 };
      }
      
      const staffScheduleIndexes = scheduleData.Name[staffName] || [];
      
      // 遍歷該員工的排程
      for (let i = 0; i < staffScheduleIndexes.length; i++) {
        const index = staffScheduleIndexes[i];
        const schedule = scheduleData.Data[index];
        
        if (schedule && schedule.約別 === '主約' && schedule.數量) {
          const quotas = schedule.數量.toString().split('/');
          if (quotas.length >= 3) {
            const morningQuota = parseInt(quotas[0]) || 0;
            const afternoonQuota = parseInt(quotas[1]) || 0;
            const eveningQuota = parseInt(quotas[2]) || 0;
            
            return {
              morning: morningQuota,
              afternoon: afternoonQuota,
              evening: eveningQuota,
              total: morningQuota + afternoonQuota + eveningQuota
            };
          }
        }
      }
      
      return { morning: 0, afternoon: 0, evening: 0, total: 0 };
      
    } catch (error) {
      console.error('取得限額配置錯誤:', error);
      return { morning: 0, afternoon: 0, evening: 0, total: 0 };
    }
  }
  
  /**
   * 取得今日邀約統計
   */
  function getTodayInvitations(inviter, date) {
    try {
      if (!date) {
        return { morning: 0, afternoon: 0, evening: 0, total: 0 };
      }
      
      const sheet = getInvitationSheet();
      const targetDate = date.length > 4 ? date.substring(4) : date; // 支援 YYYYMMDD 或 MMDD 格式
      
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return { morning: 0, afternoon: 0, evening: 0, total: 0 };
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
      
      let morningCount = 0, afternoonCount = 0, eveningCount = 0;
      
      data.forEach(row => {
        const inviteDate = row[17]; // 邀約日期
        const session = row[15]; // 場次
        const inviterName = row[16]; // 邀約人員
        const appointmentType = row[18]; // 約別
        
        if (inviteDate === targetDate && 
            (!inviter || inviterName === inviter) && 
            appointmentType === "主約") {
          
          switch (session) {
            case '早上場': 
              morningCount++; 
              break;
            case '下午場': 
              afternoonCount++; 
              break;
            case '晚上場': 
              eveningCount++; 
              break;
          }
        }
      });
      
      return {
        morning: morningCount,
        afternoon: afternoonCount,
        evening: eveningCount,
        total: morningCount + afternoonCount + eveningCount
      };
      
    } catch (error) {
      console.error('取得邀約統計錯誤:', error);
      return { morning: 0, afternoon: 0, evening: 0, total: 0 };
    }
  }
  
  /**
   * 取得場次選項
   */
  function getSessionOptions(staffName) {
    try {
      const scheduleData = readJsonFromDrive(CONFIG.SCHEDULE_FILE_ID);
      
      if (!scheduleData || !scheduleData.Name || !scheduleData.Data) {
        return [];
      }
      
      const staffScheduleIndexes = scheduleData.Name[staffName] || [];
      const isAdmin = staffScheduleIndexes.length === 0; // 如果沒有特定排程，視為管理員
      
      const sessions = [];
      const todayStr = getTodayStringGMT8(); // 使用 GMT+8 的今日
      const todayNum = parseInt(todayStr);
      
      if (isAdmin) {
        // 管理員可以看到所有場次
        scheduleData.Data.forEach(schedule => {
          if (schedule && schedule.日期 && parseInt(schedule.日期) >= todayNum) {
            const appointmentType = schedule.約別 || '副約';
            const sessionValue = schedule.日期 + '-' + schedule.地區 + '-' + schedule.地點 + '-' + appointmentType;
            const sessionDisplay = formatDate(schedule.日期.toString()) + ' / ' + 
                                   schedule.地區 + ' / ' + schedule.地點 + ' / ' + appointmentType;
            
            if (!sessions.find(s => s.value === sessionValue)) {
              sessions.push({
                value: sessionValue,
                display: sessionDisplay,
                date: schedule.日期.toString(),
                region: schedule.地區,
                location: schedule.地點,
                appointmentType: appointmentType
              });
            }
          }
        });
      } else {
        // 一般員工只能看到分配給自己的場次
        staffScheduleIndexes.forEach(index => {
          const schedule = scheduleData.Data[index];
          
          if (schedule && schedule.日期 && parseInt(schedule.日期) >= todayNum) {
            const appointmentType = schedule.約別 || '副約';
            const sessionValue = schedule.日期 + '-' + schedule.地區 + '-' + schedule.地點 + '-' + appointmentType;
            const sessionDisplay = formatDate(schedule.日期.toString()) + ' / ' + 
                                   schedule.地區 + ' / ' + schedule.地點 + ' / ' + appointmentType;
            
            if (!sessions.find(s => s.value === sessionValue)) {
              sessions.push({
                value: sessionValue,
                display: sessionDisplay,
                date: schedule.日期.toString(),
                region: schedule.地區,
                location: schedule.地點,
                appointmentType: appointmentType
              });
            }
          }
        });
      }
      
      // 按日期排序
      sessions.sort((a, b) => a.date.localeCompare(b.date));
      return sessions;
      
    } catch (error) {
      console.error('取得場次選項錯誤:', error);
      return [];
    }
  }
  
  /**
   * 格式化日期 (YYYYMMDD -> MM/DD)
   */
  function formatDate(dateStr) {
    if (!dateStr || dateStr.length !== 8) return dateStr;
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return month + '/' + day;
  }
  
  /**
   * 提交邀約資料
   */
  function submitInvitation(formData) {
    try {
      if (!formData || !formData.name || !formData.phone1 || !formData.sessionInfo || !formData.session) {
        return {
          success: false,
          message: '必填資料不完整'
        };
      }
      
      // 確保工作表已初始化
      initializeInvitationSheet();
      const sheet = getInvitationSheet();
      
      // 解析場次資訊
      const sessionParts = formData.sessionInfo.split('-');
      if (sessionParts.length < 4) {
        return {
          success: false,
          message: '場次資訊格式錯誤'
        };
      }
      
      const sessionDate = sessionParts[0];
      const region = sessionParts[1];
      const location = sessionParts[2];
      const appointmentType = sessionParts[3] || '副約';
      
      // 限額檢查（僅針對主約）
      if (appointmentType === '主約' && formData.inviter) {
        const todayStr = getTodayStringGMT8(); // 使用 GMT+8 時間
        
        const currentCounts = getTodayInvitations(formData.inviter, todayStr);
        const quotaLimits = getTodayQuota(formData.inviter, todayStr);
        
        let currentCount = 0, limit = 0, sessionName = formData.session;
        
        switch (formData.session) {
          case '早上場':
            currentCount = currentCounts.morning;
            limit = quotaLimits.morning;
            break;
          case '下午場':
            currentCount = currentCounts.afternoon;
            limit = quotaLimits.afternoon;
            break;
          case '晚上場':
            currentCount = currentCounts.evening;
            limit = quotaLimits.evening;
            break;
          default:
            currentCount = 0;
            limit = 999999;
        }
        
        if (limit === 0) {
          return {
            success: false,
            message: sessionName + ' 今日不接受主約邀約（限額為0）'
          };
        }
        
        if (currentCount >= limit) {
          return {
            success: false,
            message: sessionName + ' 的主約已達限額（' + currentCount + '/' + limit + '）'
          };
        }
      }
      
      // 生成邀約資料 - 使用 GMT+8 時間
      const inviteDate = getTodayStringGMT8('MMDD'); // GMT+8 的今日日期
      
      const invitationId = 'INV' + Date.now() + Math.random().toString(36).substr(2, 9);
      const timestamp = getGMT8Timestamp(); // 使用 GMT+8 時間戳記
      
      const newRow = [
        invitationId,                                    // ID
        formData.name,                                   // 姓名
        formData.phone1,                                 // 電話1
        formData.phone2 || '',                           // 電話2
        formData.mammography ? 1 : 0,                    // 乳攝
        formData.firstScreen ? 1 : 0,                    // 首篩
        formData.cervicalSmear ? 1 : 0,                  // 子抹
        formData.adultHealth ? 1 : 0,                    // 成健
        formData.hepatitis ? 1 : 0,                      // BC肝炎
        formData.colorectal ? 1 : 0,                     // 大腸
        formData.notes || '',                            // 備註
        getYearGMT8(),                                   // 年份 (GMT+8)
        sessionDate.substring(4),                        // 日期 (MMDD)
        region,                                          // 地區
        location,                                        // 地點
        formData.session,                                // 場次
        formData.inviter || '',                          // 邀約人員
        inviteDate,                                      // 邀約日期 (GMT+8)
        appointmentType,                                 // 約別
        timestamp,                                       // 建立時間 (GMT+8)
        timestamp,                                       // 最後修改時間 (GMT+8)
        formData.localId || ''                           // 本地ID
      ];
      
      // 插入新資料到第二行（標題下方）
      sheet.insertRowAfter(1);
      sheet.getRange(2, 1, 1, newRow.length).setValues([newRow]);
      
      // 回傳更新後的統計
      const todayStr = getTodayStringGMT8();
      const updatedCounts = getTodayInvitations(formData.inviter, todayStr);
      
      return {
        success: true,
        message: '邀約資料已成功儲存！',
        invitationId: invitationId,
        updatedCounts: updatedCounts,
        timestamp: timestamp
      };
      
    } catch (error) {
      console.error('提交邀約失敗:', error);
      return {
        success: false,
        message: '儲存失敗：' + error.toString(),
        timestamp: getGMT8Timestamp()
      };
    }
  }
  
  /**
   * 批次提交邀約資料
   */
  function batchSubmitInvitations(invitationsArray) {
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    try {
      if (!invitationsArray || !Array.isArray(invitationsArray)) {
        throw new Error('無效的邀約資料陣列');
      }
      
      for (let i = 0; i < invitationsArray.length; i++) {
        try {
          const result = submitInvitation(invitationsArray[i]);
          results.push({
            index: i,
            localId: invitationsArray[i].localId,
            success: result.success,
            message: result.message,
            invitationId: result.invitationId
          });
          
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          results.push({
            index: i,
            localId: invitationsArray[i].localId,
            success: false,
            message: error.toString(),
            invitationId: null
          });
          errorCount++;
        }
      }
      
      return {
        success: errorCount === 0,
        totalCount: invitationsArray.length,
        successCount: successCount,
        errorCount: errorCount,
        results: results,
        message: `批次提交完成：${successCount} 成功，${errorCount} 失敗`,
        timestamp: getGMT8Timestamp()
      };
      
    } catch (error) {
      console.error('批次提交失敗:', error);
      return {
        success: false,
        totalCount: invitationsArray ? invitationsArray.length : 0,
        successCount: 0,
        errorCount: invitationsArray ? invitationsArray.length : 0,
        results: [],
        message: '批次提交失敗：' + error.toString(),
        timestamp: getGMT8Timestamp()
      };
    }
  }
  
  /**
   * 取得今日邀約名單
   */
  function getTodayInvitationList(inviter, date) {
    try {
      if (!date) {
        return [];
      }
      
      const sheet = getInvitationSheet();
      const targetDate = date.length > 4 ? date.substring(4) : date; // 支援 YYYYMMDD 或 MMDD 格式
      
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return [];
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
      const invitations = [];
      
      data.forEach((row, index) => {
        const inviteDate = row[17]; // 邀約日期
        const inviterName = row[16]; // 邀約人員
        
        if (inviteDate === targetDate && (!inviter || inviterName === inviter)) {
          invitations.push({
            id: row[0],                    // ID
            name: row[1],                  // 姓名
            phone1: row[2],                // 電話1
            phone2: row[3],                // 電話2
            mammography: row[4],           // 乳攝
            firstScreen: row[5],           // 首篩
            cervicalSmear: row[6],         // 子抹
            adultHealth: row[7],           // 成健
            hepatitis: row[8],             // BC肝炎
            colorectal: row[9],            // 大腸
            notes: row[10],                // 備註
            year: row[11],                 // 年份
            date: row[12],                 // 日期
            region: row[13],               // 地區
            location: row[14],             // 地點
            session: row[15],              // 場次
            inviter: row[16],              // 邀約人員
            inviteDate: row[17],           // 邀約日期
            appointmentType: row[18],      // 約別
            createTime: row[19],           // 建立時間
            lastModified: row[20],         // 最後修改時間
            localId: row[21],              // 本地ID
            rowIndex: index + 2            // 工作表行號
          });
        }
      });
      
      // 按建立時間降序排列（最新的在前）
      invitations.sort((a, b) => {
        const timeA = new Date(a.createTime || 0);
        const timeB = new Date(b.createTime || 0);
        return timeB - timeA;
      });
      
      return invitations;
      
    } catch (error) {
      console.error('取得邀約名單錯誤:', error);
      return [];
    }
  }
  
  /**
   * 更新邀約資料
   */
  function updateInvitation(formData) {
    try {
      if (!formData || (!formData.id && !formData.localId)) {
        return {
          success: false,
          message: '缺少邀約ID'
        };
      }
      
      const sheet = getInvitationSheet();
      const lastRow = sheet.getLastRow();
      
      if (lastRow <= 1) {
        return {
          success: false,
          message: '找不到要更新的邀約記錄'
        };
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
      let targetRowIndex = -1;
      
      // 尋找目標記錄
      for (let i = 0; i < data.length; i++) {
        if (data[i][0] === formData.id || data[i][21] === formData.localId) {
          targetRowIndex = i + 2; // +2 因為有標題行且從1開始計數
          break;
        }
      }
      
      if (targetRowIndex === -1) {
        return {
          success: false,
          message: '找不到要更新的邀約記錄'
        };
      }
      
      // 解析場次資訊
      const sessionParts = formData.sessionInfo ? formData.sessionInfo.split('-') : [];
      if (sessionParts.length < 4) {
        return {
          success: false,
          message: '場次資訊格式錯誤'
        };
      }
      
      const sessionDate = sessionParts[0];
      const region = sessionParts[1];
      const location = sessionParts[2];
      const appointmentType = sessionParts[3] || '副約';
      
      // 更新資料
      const originalData = data[targetRowIndex - 2];
      const timestamp = getGMT8Timestamp(); // 使用 GMT+8 時間戳記
      
      const updatedRow = [
        formData.id || originalData[0],              // ID
        formData.name || originalData[1],            // 姓名
        formData.phone1 || originalData[2],          // 電話1
        formData.phone2 || originalData[3] || '',    // 電話2
        formData.mammography ? 1 : 0,                // 乳攝
        formData.firstScreen ? 1 : 0,                // 首篩
        formData.cervicalSmear ? 1 : 0,              // 子抹
        formData.adultHealth ? 1 : 0,                // 成健
        formData.hepatitis ? 1 : 0,                  // BC肝炎
        formData.colorectal ? 1 : 0,                 // 大腸
        formData.notes || originalData[10] || '',    // 備註
        originalData[11],                            // 年份（保持不變）
        sessionDate ? sessionDate.substring(4) : originalData[12], // 日期
        region || originalData[13],                  // 地區
        location || originalData[14],                // 地點
        formData.session || originalData[15],        // 場次
        formData.inviter || originalData[16],        // 邀約人員
        originalData[17],                            // 邀約日期（保持不變）
        appointmentType,                             // 約別
        originalData[19],                            // 建立時間（保持不變）
        timestamp,                                   // 最後修改時間 (GMT+8)
        formData.localId || originalData[21] || ''   // 本地ID
      ];
      
      // 更新工作表
      sheet.getRange(targetRowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
      
      // 回傳更新後的統計
      const todayStr = getTodayStringGMT8();
      const updatedCounts = getTodayInvitations(formData.inviter, todayStr);
      
      return {
        success: true,
        message: '邀約資料已更新！',
        updatedCounts: updatedCounts,
        timestamp: timestamp
      };
      
    } catch (error) {
      console.error('更新邀約失敗:', error);
      return {
        success: false,
        message: '更新失敗：' + error.toString(),
        timestamp: getGMT8Timestamp()
      };
    }
  }
  
  /**
   * 刪除邀約資料
   */
  function deleteInvitation(id) {
    try {
      if (!id) {
        return {
          success: false,
          message: '缺少邀約ID'
        };
      }
      
      const sheet = getInvitationSheet();
      const lastRow = sheet.getLastRow();
      
      if (lastRow <= 1) {
        return {
          success: false,
          message: '找不到要刪除的邀約記錄'
        };
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
      let targetRowIndex = -1;
      let deletedRecord = null;
      
      // 尋找目標記錄
      for (let i = 0; i < data.length; i++) {
        if (data[i][0] === id || data[i][21] === id) {
          targetRowIndex = i + 2; // +2 因為有標題行且從1開始計數
          deletedRecord = data[i];
          break;
        }
      }
      
      if (targetRowIndex === -1) {
        return {
          success: false,
          message: '找不到要刪除的邀約記錄'
        };
      }
      
      // 刪除行
      sheet.deleteRow(targetRowIndex);
      
      // 回傳更新後的統計
      const todayStr = getTodayStringGMT8();
      
      const inviterName = deletedRecord[16]; // 邀約人員
      const updatedCounts = getTodayInvitations(inviterName, todayStr);
      
      return {
        success: true,
        message: '邀約記錄已刪除！',
        updatedCounts: updatedCounts,
        deletedRecord: {
          name: deletedRecord[1],
          phone: deletedRecord[2]
        },
        timestamp: getGMT8Timestamp()
      };
      
    } catch (error) {
      console.error('刪除邀約失敗:', error);
      return {
        success: false,
        message: '刪除失敗：' + error.toString(),
        timestamp: getGMT8Timestamp()
      };
    }
  }
  
  /**
   * 系統健康檢查
   */
  function healthCheck() {
    const results = {};
    
    try {
      // 檢查 Drive 文件存取
      results.accountFile = 'OK';
      try {
        const accountData = readJsonFromDrive(CONFIG.ACCOUNT_FILE_ID);
        if (!accountData || !accountData.staffList) {
          results.accountFile = 'WARNING: 帳號資料格式異常';
        }
      } catch (error) {
        results.accountFile = 'FAILED: ' + error.message;
      }
      
      results.scheduleFile = 'OK';
      try {
        const scheduleData = readJsonFromDrive(CONFIG.SCHEDULE_FILE_ID);
        if (!scheduleData || !scheduleData.Name || !scheduleData.Data) {
          results.scheduleFile = 'WARNING: 排程資料格式異常';
        }
      } catch (error) {
        results.scheduleFile = 'FAILED: ' + error.message;
      }
      
      // 檢查 Sheets 存取
      results.invitationSheet = 'OK';
      try {
        const sheet = getInvitationSheet();
        const lastRow = sheet.getLastRow();
        results.invitationSheetRows = lastRow;
      } catch (error) {
        results.invitationSheet = 'FAILED: ' + error.message;
      }
      
      // 檢查用戶功能
      results.userList = 'OK';
      try {
        const users = getUserList();
        results.activeUsers = users.length;
        if (users.length === 0) {
          results.userList = 'WARNING: 沒有活躍用戶';
        }
      } catch (error) {
        results.userList = 'FAILED: ' + error.message;
      }
      
      // 整體狀態評估
      const hasFailures = Object.values(results).some(result => 
        typeof result === 'string' && result.includes('FAILED')
      );
      
      const overallStatus = hasFailures ? 'UNHEALTHY' : 'HEALTHY';
      
      return {
        success: true,
        status: overallStatus,
        timestamp: getGMT8Timestamp(),
        timezone: 'GMT+8 (Asia/Taipei)',
        version: '2.1.0-GMT8',
        checks: results
      };
      
    } catch (error) {
      return {
        success: false,
        status: 'UNHEALTHY',
        timestamp: getGMT8Timestamp(),
        error: error.toString(),
        checks: results
      };
    }
  }
  
  /**
   * 取得系統統計資訊
   */
  function getSystemStats() {
    try {
      const sheet = getInvitationSheet();
      const lastRow = sheet.getLastRow();
      
      if (lastRow <= 1) {
        return {
          success: true,
          totalInvitations: 0,
          todayInvitations: 0,
          thisMonthInvitations: 0,
          activeUsers: getUserList().length,
          timestamp: getGMT8Timestamp(),
          timezone: 'GMT+8 (Asia/Taipei)'
        };
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
      const todayStr = getTodayStringGMT8('MMDD'); // GMT+8 的今日
      const thisMonthStr = todayStr.substring(0, 2); // 取得月份
      
      let todayCount = 0;
      let thisMonthCount = 0;
      
      data.forEach(row => {
        const inviteDate = row[17]; // 邀約日期 (MMDD)
        
        if (inviteDate === todayStr) {
          todayCount++;
        }
        
        if (inviteDate && inviteDate.substring(0, 2) === thisMonthStr) {
          thisMonthCount++;
        }
      });
      
      return {
        success: true,
        totalInvitations: data.length,
        todayInvitations: todayCount,
        thisMonthInvitations: thisMonthCount,
        activeUsers: getUserList().length,
        timestamp: getGMT8Timestamp(),
        timezone: 'GMT+8 (Asia/Taipei)'
      };
      
    } catch (error) {
      console.error('獲取統計資訊失敗:', error);
      return {
        success: false,
        message: '獲取統計資訊失敗：' + error.toString(),
        timestamp: getGMT8Timestamp()
      };
    }
  }
  
  /**
   * 手動測試函數 - 在 Google Apps Script 編輯器中執行
   */
  function runManualTest() {
    console.log('=== 開始手動測試 (GMT+8 版本) ===');
    
    try {
      // 測試時區函數
      console.log('測試 GMT+8 時間函數');
      const gmt8Time = getGMT8Timestamp();
      const todayGMT8 = getTodayStringGMT8();
      const todayMMDD = getTodayStringGMT8('MMDD');
      const yearGMT8 = getYearGMT8();
      
      console.log('GMT+8 時間戳記:', gmt8Time);
      console.log('GMT+8 今日 (YYYYMMDD):', todayGMT8);
      console.log('GMT+8 今日 (MMDD):', todayMMDD);
      console.log('GMT+8 年份:', yearGMT8);
      
      // 測試 1: 連接測試
      console.log('測試 1: 連接測試');
      const connectionTest = testConnection();
      console.log('連接測試結果:', connectionTest);
      
      // 測試 2: 健康檢查
      console.log('測試 2: 健康檢查');
      const healthTest = healthCheck();
      console.log('健康檢查結果:', healthTest);
      
      // 測試 3: 用戶列表
      console.log('測試 3: 用戶列表');
      const userList = getUserList();
      console.log('用戶列表 (' + userList.length + ' 個):', userList);
      
      // 測試 4: 工作表初始化
      console.log('測試 4: 工作表初始化');
      const initResult = initializeInvitationSheet();
      console.log('工作表初始化結果:', initResult);
      
      // 測試 5: 系統統計
      console.log('測試 5: 系統統計');
      const stats = getSystemStats();
      console.log('系統統計:', stats);
      
      console.log('=== 手動測試完成 ===');
      
      return {
        success: true,
        message: '所有測試完成 (GMT+8 版本)',
        timezone: 'GMT+8 (Asia/Taipei)',
        testTime: gmt8Time,
        results: {
          connection: connectionTest.success,
          health: healthTest.success,
          userCount: userList.length,
          stats: stats.success,
          timezone: {
            timestamp: gmt8Time,
            today: todayGMT8,
            todayMMDD: todayMMDD,
            year: yearGMT8
          }
        }
      };
      
    } catch (error) {
      console.error('手動測試失敗:', error);
      return {
        success: false,
        message: '測試失敗: ' + error.toString(),
        error: error.toString(),
        timestamp: getGMT8Timestamp()
      };
    }
  }