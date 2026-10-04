// ============================================================
// TOOL SERVER - Quản lý license cho tool MoSlot
// Phiên bản: 5.0.0 (Logic chuyển lên server)
// ============================================================

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const gameApi = require('./game-api.js');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY;

if (!ADMIN_KEY) {
    console.error('❌ Thiếu ADMIN_KEY trong file .env');
    process.exit(1);
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ============================================================
// DATABASE (JSON file)
// ============================================================
const DATA_FILE = path.join(__dirname, 'data.json');

function initData() {
    if (!fs.existsSync(DATA_FILE)) {
        const defaultData = {
            keys: {},
            logs: [],
            sessions: {},
            users: {},
            settings: {
                toolEnabled: true,
                message: 'Tool đang bảo trì hệ thống, sẽ mở lại sau'
            }
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!data.keys) data.keys = {};
    if (!data.logs) data.logs = [];
    if (!data.sessions) data.sessions = {};
    if (!data.users) data.users = {};
    if (!data.settings) data.settings = { toolEnabled: true, message: 'Tool đang bảo trì hệ thống, sẽ mở lại sau' };
    if (data.settings.toolEnabled === undefined) data.settings.toolEnabled = true;
    if (!data.settings.message) data.settings.message = 'Tool đang bảo trì hệ thống, sẽ mở lại sau';
    return data;
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.socket.remoteAddress
        || 'unknown';
}

// ============================================================
// MIDDLEWARE
// ============================================================
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    req.clientIp = getClientIp(req);
    next();
});

function adminAuth(req, res, next) {
    const key = (req.body && req.body.adminKey) || req.query.adminKey;
    if (key !== ADMIN_KEY) {
        return res.status(403).json({ success: false, message: 'Không có quyền!' });
    }
    next();
}

// ============================================================
// API GỐC
// ============================================================
app.get('/', (req, res) => {
    res.json({
        name: 'MoSlot Tool Server',
        version: '5.0.0',
        status: 'running'
    });
});

// ============================================================
// API HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
    const data = initData();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        totalKeys: Object.keys(data.keys).length,
        activeKeys: Object.values(data.keys).filter(k => k.active).length,
        totalSessions: Object.keys(data.sessions).length,
        totalUsers: Object.keys(data.users).length,
        totalLogs: data.logs.length,
        toolEnabled: data.settings.toolEnabled
    });
});

// ============================================================
// API STATUS
// ============================================================
app.get('/api/status', (req, res) => {
    const data = initData();
    res.json({
        success: true,
        enabled: data.settings.toolEnabled !== false,
        message: data.settings.message || 'Tool đang bảo trì hệ thống, sẽ mở lại sau'
    });
});

// ============================================================
// API START-TOOL — Bắt đầu session, lấy data acc
// ============================================================
app.post('/api/start-tool', async (req, res) => {
    const { key, uniqId, username, platform, hostId, deviceId } = req.body;
    const data = initData();
    const clientIp = req.clientIp;
    const now = new Date().toISOString();

    try {
        // 1. Check tool bật
        if (data.settings.toolEnabled === false) {
            return res.json({
                success: false,
                message: data.settings.message || 'Tool đang bảo trì hệ thống, sẽ mở lại sau',
                code: 'TOOL_DISABLED'
            });
        }

        // 2. Check thiếu key
        if (!key) return res.json({ success: false, message: 'Thiếu key!', code: 'NO_KEY' });
        if (!uniqId) return res.json({ success: false, message: 'Thiếu UNIQ_ID!', code: 'NO_UNIQ' });
        if (!platform) return res.json({ success: false, message: 'Thiếu platform!', code: 'NO_PLATFORM' });

        // 3. Check key tồn tại
        if (!data.keys[key]) {
            data.logs.push({
                timestamp: now, key, action: 'START_FAILED',
                username: username || 'unknown', platform, uniqId, hostId,
                status: 'KEY_NOT_FOUND', ip: clientIp,
                message: 'Key không tồn tại'
            });
            saveData(data);
            return res.json({ success: false, message: 'Key không tồn tại!', code: 'KEY_NOT_FOUND' });
        }

        const keyData = data.keys[key];
        // Tương thích key cũ
        if (keyData.maxUses === undefined) keyData.maxUses = keyData.totalUses ?? 999;
        if (keyData.used === undefined) keyData.used = keyData.usedUses ?? 0;
        if (keyData.active === undefined) keyData.active = keyData.status === 'active';
        if (!keyData.expiry) keyData.expiry = '2099-12-31';
        // ===== CHECK HWID (1 KEY = 1 MÁY) =====
if (deviceId) {
    if (!keyData.hwid) {
        // Lần đầu dùng key → lưu HWID
        keyData.hwid = deviceId;
        keyData.firstUsedAt = now;
        console.log(`🔒 Key ${key} gắn với HWID: ${deviceId}`);
    } else if (keyData.hwid !== deviceId) {
        // HWID không khớp → từ chối
        data.logs.push({
            timestamp: now, key, action: 'START_FAILED',
            status: 'WRONG_HWID', ip: clientIp,
            username: username || 'unknown', platform, uniqId, hostId,
            message: `HWID không khớp. Key thuộc máy khác. HWID gửi: ${deviceId}, HWID lưu: ${keyData.hwid}`
        });
        saveData(data);
        return res.json({
            success: false,
            message: 'KEY đã được sử dụng trên máy khác! Mỗi key chỉ dùng được 1 máy.',
            code: 'WRONG_HWID'
        });
    }
}
        // 4. Check key active
        if (!keyData.active) {
            data.logs.push({ timestamp: now, key, action: 'START_FAILED', status: 'KEY_DISABLED', ip: clientIp, message: 'Key bị vô hiệu hóa' });
            saveData(data);
            return res.json({ success: false, message: 'Key đã bị vô hiệu hóa!', code: 'KEY_DISABLED' });
        }

        // 5. Check hết hạn
        if (new Date(keyData.expiry) < new Date()) {
            data.logs.push({ timestamp: now, key, action: 'START_FAILED', status: 'KEY_EXPIRED', ip: clientIp, message: 'Key hết hạn' });
            saveData(data);
            return res.json({ success: false, message: 'Key đã hết hạn!', code: 'KEY_EXPIRED' });
        }

        // 6. Check hết lượt
        if (keyData.used >= keyData.maxUses) {
            data.logs.push({ timestamp: now, key, action: 'START_FAILED', status: 'KEY_EXHAUSTED', ip: clientIp, message: 'Key hết lượt' });
            saveData(data);
            return res.json({ success: false, message: 'Key đã hết lượt sử dụng!', code: 'KEY_EXHAUSTED' });
        }

        // 7. LẤY DATA ACC TỪ SERVER GAME (chạy trên server)
        let info;
        try {
            info = await gameApi.fetchUserData(platform, uniqId, hostId);
        } catch (gameErr) {
            data.logs.push({
                timestamp: now, key, action: 'START_FAILED', status: 'GAME_API_ERROR',
                username: username || 'unknown', platform, uniqId, hostId, ip: clientIp,
                message: 'Lỗi gọi server game: ' + gameErr.message
            });
            saveData(data);
            return res.json({
                success: false,
                message: 'Không lấy được dữ liệu tài khoản: ' + gameErr.message,
                code: 'GAME_API_ERROR'
            });
        }

        // 8. Tạo session token
        const token = crypto.randomBytes(32).toString('hex');
        data.sessions[token] = {
            key,
            deviceId: deviceId || 'unknown',
            username: info.userName || username || 'unknown',
            platform,
            uniqId,
            hostId,
            connectedAt: now,
            lastActive: now,
            ip: clientIp,
            sessionData: {
                gichapo: info.gichapo,
                runCount: info.runCount,
                selectedHero: info.selectedHero,
                selectedHeroMax: info.selectedHeroMax,
                bouHero: info.bouHero
            }
        };

        // 9. Lưu user info
        if (uniqId) {
            if (!data.users[uniqId]) {
                data.users[uniqId] = {
                    uniqId, hostId: hostId || 'unknown',
                    username: info.userName || 'unknown',
                    platform, keyUsed: key,
                    firstSeen: now, lastSeen: now, totalUses: 1
                };
            } else {
                data.users[uniqId].lastSeen = now;
                data.users[uniqId].totalUses = (data.users[uniqId].totalUses || 0) + 1;
                data.users[uniqId].hostId = hostId || data.users[uniqId].hostId;
                data.users[uniqId].username = info.userName || data.users[uniqId].username;
                data.users[uniqId].platform = platform;
                data.users[uniqId].keyUsed = key;
            }
        }

        // 10. Log
        data.logs.push({
            timestamp: now, key, action: 'START_SUCCESS',
            username: info.userName || 'unknown', platform, uniqId, hostId,
            status: 'SUCCESS', ip: clientIp, sessionToken: token,
            message: `Bắt đầu session. Còn ${keyData.maxUses - keyData.used} lượt`
        });

        saveData(data);

        // 11. Trả data cho client (KHÔNG trả gichapo, runCount → client không cần biết)
        res.json({
            success: true,
            token,
            message: `Kết nối thành công! Còn ${keyData.maxUses - keyData.used} lượt`,
            data: {
                userName: info.userName,
                version: info.version,
                selectedHero: info.selectedHero,
                selectedHeroMax: info.selectedHeroMax,
                runCount: info.runCount,
                maxSlots: info.runCount,
                remaining: keyData.maxUses - keyData.used
            }
        });

    } catch (err) {
        console.error('❌ start-tool error:', err);
        return res.json({ success: false, message: 'Lỗi server: ' + err.message });
    }
});

// ============================================================
// API OPEN-SLOT — Mở slot (chạy trên server)
// ============================================================
app.post('/api/open-slot', async (req, res) => {
    const { token, count } = req.body;
    const data = initData();
    const clientIp = req.clientIp;
    const now = new Date().toISOString();

    try {
        // 1. Check session token
        if (!token || !data.sessions[token]) {
            return res.json({ success: false, message: 'Session không hợp lệ! Vui lòng chạy lại tool.', code: 'NO_SESSION' });
        }

        const session = data.sessions[token];
        const keyData = data.keys[session.key];

        // 2. Check tool bật
        if (data.settings.toolEnabled === false) {
            return res.json({ success: false, message: data.settings.message, code: 'TOOL_DISABLED' });
        }

        // 3. Check key còn lượt
        if (keyData.used >= keyData.maxUses) {
            return res.json({ success: false, message: 'Key đã hết lượt sử dụng!', code: 'KEY_EXHAUSTED' });
        }

        // 4. Check count
        const openCount = Math.max(1, Math.min(parseInt(count) || 1, 50));
        const remaining = keyData.maxUses - keyData.used;
        const actualCount = Math.min(openCount, remaining);

        session.lastActive = now;

        // 5. Chuẩn bị data
        let currentRunCount = session.sessionData.runCount;
        let currentHeroData = {
            selectedHero: session.sessionData.selectedHero,
            selectedHeroMax: session.sessionData.selectedHeroMax,
            bouHero: session.sessionData.bouHero
        };

        // 6. MỞ SLOT TRÊN SERVER
        let successCount = 0;
        let failCount = 0;
        const results = [];

        for (let i = 1; i <= actualCount; i++) {
            // Delay: 2s lần đầu, 1s các lần sau
            if (i === 1) {
                await new Promise(r => setTimeout(r, 2000));
            } else {
                await new Promise(r => setTimeout(r, 1000));
            }

            const runToSend = currentRunCount - 1;
            if (runToSend < 0) {
                results.push({ index: i, success: false, error: 'RUN_COUNT = 0' });
                failCount++;
                continue;
            }

            try {
                const result = await gameApi.expandHeroSlot(
                    session.platform,
                    session.uniqId,
                    session.hostId,
                    session.sessionData.gichapo,
                    runToSend,
                    currentHeroData
                );

                if (result && result.RESULT === "OK") {
                    successCount++;
                    currentRunCount = runToSend;
                    if (result.VALUE && result.VALUE.selected_hero_max) {
                        currentHeroData.selectedHeroMax = parseInt(result.VALUE.selected_hero_max);
                    }
                    if (result.VALUE && result.VALUE.selected_hero) {
                        currentHeroData.selectedHero = result.VALUE.selected_hero;
                    }
                    if (result.VALUE && result.VALUE.bou_hero) {
                        currentHeroData.bouHero = result.VALUE.bou_hero;
                    }
                    results.push({ index: i, success: true, slotNow: currentHeroData.selectedHeroMax });
                } else {
                    failCount++;
                    results.push({ index: i, success: false, error: 'RESULT != OK' });
                }
            } catch (e) {
                failCount++;
                results.push({ index: i, success: false, error: e.message });
            }
        }

        // 7. Trừ lượt dùng key theo số slot đã mở
        keyData.used += successCount;

        // 8. Cập nhật session
        session.sessionData.runCount = currentRunCount;
        session.sessionData.selectedHero = currentHeroData.selectedHero;
        session.sessionData.selectedHeroMax = currentHeroData.selectedHeroMax;
        session.sessionData.bouHero = currentHeroData.bouHero;

        // 9. Log
        data.logs.push({
            timestamp: now, key: session.key, action: 'OPEN_SLOT',
            username: session.username, platform: session.platform,
            uniqId: session.uniqId, hostId: session.hostId,
            status: successCount > 0 ? 'SUCCESS' : 'FAILED',
            ip: clientIp, sessionToken: token,
            message: `Mở ${actualCount} slot: ${successCount} OK, ${failCount} fail`
        });

        saveData(data);

        // 10. Trả kết quả
        res.json({
            success: true,
            message: `Đã mở ${successCount}/${actualCount} slot thành công`,
            data: {
                total: actualCount,
                success: successCount,
                failed: failCount,
                slotNow: currentHeroData.selectedHeroMax,
                remaining: keyData.maxUses - keyData.used,
                results
            }
        });

    } catch (err) {
        console.error('❌ open-slot error:', err);
        return res.json({ success: false, message: 'Lỗi server: ' + err.message });
    }
});

// ============================================================
// API END-TOOL — Kết thúc session
// ============================================================
app.post('/api/end-tool', (req, res) => {
    const { token } = req.body;
    const data = initData();
    if (token && data.sessions[token]) {
        delete data.sessions[token];
        saveData(data);
    }
    res.json({ success: true, message: 'Đã kết thúc session' });
});

// ============================================================
// API ADMIN — TẠO KEY
// ============================================================
app.post('/api/admin/create-key', adminAuth, (req, res) => {
    const { type, expiry, maxUses, note } = req.body;
    const data = initData();
    const newKey = `KEY_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    data.keys[newKey] = {
        type: type || 'vip',
        expiry: expiry || '2028-12-31',
        maxUses: maxUses || 999,
        used: 0,
        active: true,
        createdBy: 'ADMIN',
        createdAt: new Date().toISOString(),
        note: note || 'Key mới'
    };

    data.logs.push({
        timestamp: new Date().toISOString(), key: newKey,
        action: 'KEY_CREATED', username: 'ADMIN', platform: 'ADMIN',
        uniqId: 'ADMIN', status: 'SUCCESS', ip: req.clientIp,
        message: `Đã tạo key mới: ${newKey}`
    });

    saveData(data);
    res.json({ success: true, message: 'Tạo key thành công!', key: newKey, data: data.keys[newKey] });
});

// ============================================================
// API ADMIN — DANH SÁCH KEY
// ============================================================
app.get('/api/admin/list-keys', adminAuth, (req, res) => {
    const data = initData();
    const keyList = Object.keys(data.keys).map(k => {
        const kd = data.keys[k];
        const maxUses = kd.maxUses !== undefined ? kd.maxUses : (kd.totalUses !== undefined ? kd.totalUses : 999);
        const used = kd.used !== undefined ? kd.used : (kd.usedUses !== undefined ? kd.usedUses : 0);
        const active = kd.active !== undefined ? kd.active : (kd.status === 'active');
        return { key: k, ...kd, maxUses, used, active, remaining: maxUses - used };
    });
    res.json({ success: true, total: keyList.length, keys: keyList });
});

// ============================================================
// API ADMIN — XÓA KEY
// ============================================================
app.post('/api/admin/delete-key', adminAuth, (req, res) => {
    const { key } = req.body;
    const data = initData();
    if (!data.keys[key]) return res.json({ success: false, message: 'Key không tồn tại!' });
    delete data.keys[key];
    data.logs.push({ timestamp: new Date().toISOString(), key, action: 'KEY_DELETED', username: 'ADMIN', platform: 'ADMIN', uniqId: 'ADMIN', status: 'SUCCESS', ip: req.clientIp, message: `Đã xóa key: ${key}` });
    saveData(data);
    res.json({ success: true, message: `Đã xóa key: ${key}` });
});

// ============================================================
// API ADMIN — DISABLE/ENABLE KEY
// ============================================================
app.post('/api/admin/disable-key', adminAuth, (req, res) => {
    const { key } = req.body;
    const data = initData();
    if (!data.keys[key]) return res.json({ success: false, message: 'Key không tồn tại!' });
    data.keys[key].active = false;
    data.keys[key].status = 'disabled';
    data.logs.push({ timestamp: new Date().toISOString(), key, action: 'KEY_DISABLED', username: 'ADMIN', platform: 'ADMIN', uniqId: 'ADMIN', status: 'SUCCESS', ip: req.clientIp, message: `Đã vô hiệu hóa key: ${key}` });
    saveData(data);
    res.json({ success: true, message: `Đã vô hiệu hóa key: ${key}` });
});

app.post('/api/admin/enable-key', adminAuth, (req, res) => {
    const { key } = req.body;
    const data = initData();
    if (!data.keys[key]) return res.json({ success: false, message: 'Key không tồn tại!' });
    data.keys[key].active = true;
    data.keys[key].status = 'active';
    data.logs.push({ timestamp: new Date().toISOString(), key, action: 'KEY_ENABLED', username: 'ADMIN', platform: 'ADMIN', uniqId: 'ADMIN', status: 'SUCCESS', ip: req.clientIp, message: `Đã kích hoạt lại key: ${key}` });
    saveData(data);
    res.json({ success: true, message: `Đã kích hoạt lại key: ${key}` });
});

// ============================================================
// API ADMIN — LOGS
// ============================================================
app.get('/api/admin/logs', adminAuth, (req, res) => {
    const { limit = 100, key } = req.query;
    const data = initData();
    let logs = data.logs;
    if (key) logs = logs.filter(l => l.key === key);
    logs = logs.slice(-parseInt(limit)).reverse();
    res.json({ success: true, total: data.logs.length, filtered: logs.length, logs });
});

// ============================================================
// API ADMIN — SESSIONS
// ============================================================
app.get('/api/admin/sessions', adminAuth, (req, res) => {
    const data = initData();
    const sessions = Object.keys(data.sessions).map(token => ({
        token: token.substring(0, 16) + '...',
        ...data.sessions[token],
        sessionData: undefined
    }));
    res.json({ success: true, total: sessions.length, sessions });
});

// ============================================================
// API ADMIN — USERS
// ============================================================
app.get('/api/admin/users', adminAuth, (req, res) => {
    const data = initData();
    const users = Object.values(data.users).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
    res.json({ success: true, total: users.length, users });
});

// ============================================================
// API ADMIN — DISCONNECT
// ============================================================
app.post('/api/admin/disconnect', adminAuth, (req, res) => {
    const { token, key } = req.body;
    const data = initData();
    let disconnected = [];

    if (token && data.sessions[token]) {
        delete data.sessions[token];
        disconnected.push(token.substring(0, 16) + '...');
    } else if (key) {
        const tokens = Object.keys(data.sessions).filter(t => data.sessions[t].key === key);
        tokens.forEach(t => { delete data.sessions[t]; disconnected.push(t.substring(0, 16) + '...'); });
    } else {
        const tokens = Object.keys(data.sessions);
        tokens.forEach(t => { delete data.sessions[t]; disconnected.push(t.substring(0, 16) + '...'); });
    }

    data.logs.push({ timestamp: new Date().toISOString(), key: key || 'ALL', action: 'DISCONNECT', username: 'ADMIN', platform: 'ADMIN', uniqId: 'ADMIN', status: 'SUCCESS', ip: req.clientIp, message: `Đã ngắt ${disconnected.length} session(s)` });
    saveData(data);
    res.json({ success: true, message: `Đã ngắt ${disconnected.length} session(s)`, disconnected });
});

// ============================================================
// API ADMIN — TOGGLE TOOL
// ============================================================
app.post('/api/admin/toggle-tool', adminAuth, (req, res) => {
    const { enabled, message } = req.body;
    const data = initData();
    data.settings.toolEnabled = !!enabled;
    if (message) data.settings.message = message;
    saveData(data);
    data.logs.push({ timestamp: new Date().toISOString(), key: 'SYSTEM', action: enabled ? 'TOOL_ENABLED' : 'TOOL_DISABLED', username: 'ADMIN', platform: 'ADMIN', uniqId: 'ADMIN', status: 'SUCCESS', ip: req.clientIp, message: enabled ? 'Đã BẬT tool' : 'Đã TẮT tool' });
    saveData(data);
    res.json({ success: true, enabled: data.settings.toolEnabled, message: data.settings.message });
});

app.get('/api/admin/tool-status', adminAuth, (req, res) => {
    const data = initData();
    res.json({ success: true, enabled: data.settings.toolEnabled !== false, message: data.settings.message || '' });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    initData();
    console.log(`✅ Server đang chạy tại port ${PORT}`);
    console.log(`📁 Dữ liệu: ${DATA_FILE}`);
    console.log(`🔑 Admin key: ${ADMIN_KEY.substring(0, 3)}***`);
});
