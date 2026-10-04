// ============================================================
// TOOL SERVER - Quản lý license cho tool MoSlot
// Phiên bản: 4.0.1 (fixed sessions)
// ============================================================

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

    // ===== ĐẢM BẢO TẤT CẢ FIELD TỒN TẠI =====
    if (!data.keys) data.keys = {};
    if (!data.logs) data.logs = [];
    if (!data.sessions) data.sessions = {};
    if (!data.users) data.users = {};
    if (!data.settings) {
        data.settings = {
            toolEnabled: true,
            message: 'Tool đang bảo trì hệ thống, sẽ mở lại sau'
        };
    }
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
// MIDDLEWARE LOG
// ============================================================
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    req.clientIp = getClientIp(req);
    next();
});

// Middleware check admin
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
        version: '4.0.1',
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
// API STATUS — Tool gọi khi khởi động
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
// API VERIFY KEY
// ============================================================
app.post('/api/verify', (req, res) => {
    const { key, deviceId, clientId, version, username, platform, uniqId, hostId } = req.body;
    const data = initData();
    const clientIp = req.clientIp;
    const now = new Date().toISOString();

    // 1. Check tool có bật không
    if (data.settings.toolEnabled === false) {
        return res.json({
            success: false,
            message: data.settings.message || 'Tool đang bảo trì hệ thống, sẽ mở lại sau',
            code: 'TOOL_DISABLED'
        });
    }

    // 2. Check thiếu key
    if (!key) {
        return res.json({ success: false, message: 'Thiếu key!', code: 'NO_KEY' });
    }

    // 3. Check key tồn tại
    if (!data.keys[key]) {
        data.logs.push({
            timestamp: now, key, action: 'VERIFY_FAILED',
            username: username || 'unknown', platform: platform || 'unknown',
            uniqId: uniqId || 'unknown', hostId: hostId || 'unknown',
            status: 'KEY_NOT_FOUND', ip: clientIp,
            message: 'Key không tồn tại'
        });
        saveData(data);
        return res.json({
            success: false,
            message: 'Key không tồn tại! Vui lòng kiểm tra lại.',
            code: 'KEY_NOT_FOUND'
        });
    }

    const keyData = data.keys[key];

    // ===== TƯƠNG THÍCH KEY CŨ (totalUses/usedUses) =====
    if (keyData.maxUses === undefined) {
        keyData.maxUses = keyData.totalUses !== undefined ? keyData.totalUses : 999;
    }
    if (keyData.used === undefined) {
        keyData.used = keyData.usedUses !== undefined ? keyData.usedUses : 0;
    }
    if (keyData.active === undefined) {
        keyData.active = keyData.status === 'active';
    }
    if (!keyData.expiry) keyData.expiry = '2099-12-31';

    // 4. Check key bị disable
    if (!keyData.active) {
        data.logs.push({
            timestamp: now, key, action: 'VERIFY_FAILED',
            username: username || 'unknown', platform: platform || 'unknown',
            uniqId: uniqId || 'unknown', hostId: hostId || 'unknown',
            status: 'KEY_DISABLED', ip: clientIp,
            message: 'Key đã bị vô hiệu hóa'
        });
        saveData(data);
        return res.json({
            success: false,
            message: 'Key đã bị vô hiệu hóa!',
            code: 'KEY_DISABLED'
        });
    }

    // 5. Check key hết hạn
    if (new Date(keyData.expiry) < new Date()) {
        data.logs.push({
            timestamp: now, key, action: 'VERIFY_FAILED',
            username: username || 'unknown', platform: platform || 'unknown',
            uniqId: uniqId || 'unknown', hostId: hostId || 'unknown',
            status: 'KEY_EXPIRED', ip: clientIp,
            message: 'Key đã hết hạn'
        });
        saveData(data);
        return res.json({
            success: false,
            message: 'Key đã hết hạn!',
            code: 'KEY_EXPIRED'
        });
    }

    // 6. Check key hết lượt
    if (keyData.used >= keyData.maxUses) {
        data.logs.push({
            timestamp: now, key, action: 'VERIFY_FAILED',
            username: username || 'unknown', platform: platform || 'unknown',
            uniqId: uniqId || 'unknown', hostId: hostId || 'unknown',
            status: 'KEY_EXHAUSTED', ip: clientIp,
            message: 'Key đã hết lượt sử dụng'
        });
        saveData(data);
        return res.json({
            success: false,
            message: 'Key đã hết lượt sử dụng!',
            code: 'KEY_EXHAUSTED'
        });
    }

    // 7. Tăng lượt dùng
    keyData.used++;

    // 8. Tạo session token
    const token = crypto.randomBytes(32).toString('hex');
    data.sessions[token] = {
        key,
        deviceId: deviceId || 'unknown',
        username: username || 'unknown',
        platform: platform || 'unknown',
        uniqId: uniqId || 'unknown',
        hostId: hostId || 'unknown',
        connectedAt: now,
        lastActive: now,
        ip: clientIp
    };

    // 9. Lưu user info
    if (uniqId) {
        if (!data.users[uniqId]) {
            data.users[uniqId] = {
                uniqId,
                hostId: hostId || 'unknown',
                username: username || 'unknown',
                platform: platform || 'unknown',
                keyUsed: key,
                firstSeen: now,
                lastSeen: now,
                totalUses: 1
            };
        } else {
            data.users[uniqId].lastSeen = now;
            data.users[uniqId].totalUses = (data.users[uniqId].totalUses || 0) + 1;
            data.users[uniqId].hostId = hostId || data.users[uniqId].hostId;
            data.users[uniqId].username = username || data.users[uniqId].username;
            data.users[uniqId].platform = platform || data.users[uniqId].platform;
            data.users[uniqId].keyUsed = key;
        }
    }

    // 10. Log
    data.logs.push({
        timestamp: now, key, action: 'VERIFY_SUCCESS',
        username: username || 'unknown', platform: platform || 'unknown',
        uniqId: uniqId || 'unknown', hostId: hostId || 'unknown',
        status: 'SUCCESS', ip: clientIp, sessionToken: token,
        message: `Xác thực thành công, còn ${keyData.maxUses - keyData.used} lượt`
    });

    saveData(data);

    res.json({
        success: true,
        message: `Xác thực thành công! Còn ${keyData.maxUses - keyData.used} lượt sử dụng`,
        data: {
            token,
            expiresIn: 86400,
            type: keyData.type,
            note: keyData.note,
            remaining: keyData.maxUses - keyData.used
        }
    });
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
        return {
            key: k,
            ...kd,
            maxUses, used,
            active,
            remaining: maxUses - used,
            statusText: active ? '🟢 Hoạt động' : '🔴 Đã khóa'
        };
    });
    res.json({ success: true, total: keyList.length, keys: keyList });
});

// ============================================================
// API ADMIN — XÓA KEY
// ============================================================
app.post('/api/admin/delete-key', adminAuth, (req, res) => {
    const { key } = req.body;
    const data = initData();
    if (!data.keys[key]) {
        return res.json({ success: false, message: 'Key không tồn tại!' });
    }
    delete data.keys[key];
    data.logs.push({
        timestamp: new Date().toISOString(), key,
        action: 'KEY_DELETED', username: 'ADMIN', platform: 'ADMIN',
        uniqId: 'ADMIN', status: 'SUCCESS', ip: req.clientIp,
        message: `Đã xóa key: ${key}`
    });
    saveData(data);
    res.json({ success: true, message: `Đã xóa key: ${key}` });
});

// ============================================================
// API ADMIN — DISABLE KEY
// ============================================================
app.post('/api/admin/disable-key', adminAuth, (req, res) => {
    const { key } = req.body;
    const data = initData();
    if (!data.keys[key]) {
        return res.json({ success: false, message: 'Key không tồn tại!' });
    }
    data.keys[key].active = false;
    data.keys[key].status = 'disabled';
    data.logs.push({
        timestamp: new Date().toISOString(), key,
        action: 'KEY_DISABLED', username: 'ADMIN', platform: 'ADMIN',
        uniqId: 'ADMIN', status: 'SUCCESS', ip: req.clientIp,
        message: `Đã vô hiệu hóa key: ${key}`
    });
    saveData(data);
    res.json({ success: true, message: `Đã vô hiệu hóa key: ${key}` });
});

// ============================================================
// API ADMIN — ENABLE KEY
// ============================================================
app.post('/api/admin/enable-key', adminAuth, (req, res) => {
    const { key } = req.body;
    const data = initData();
    if (!data.keys[key]) {
        return res.json({ success: false, message: 'Key không tồn tại!' });
    }
    data.keys[key].active = true;
    data.keys[key].status = 'active';
    data.logs.push({
        timestamp: new Date().toISOString(), key,
        action: 'KEY_ENABLED', username: 'ADMIN', platform: 'ADMIN',
        uniqId: 'ADMIN', status: 'SUCCESS', ip: req.clientIp,
        message: `Đã kích hoạt lại key: ${key}`
    });
    saveData(data);
    res.json({ success: true, message: `Đã kích hoạt lại key: ${key}` });
});

// ============================================================
// API ADMIN — XEM LOGS
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
// API ADMIN — XEM SESSIONS
// ============================================================
app.get('/api/admin/sessions', adminAuth, (req, res) => {
    const data = initData();
    const sessions = Object.keys(data.sessions).map(token => ({
        token: token.substring(0, 16) + '...',
        ...data.sessions[token]
    }));
    res.json({ success: true, total: sessions.length, sessions });
});

// ============================================================
// API ADMIN — XEM USERS
// ============================================================
app.get('/api/admin/users', adminAuth, (req, res) => {
    const data = initData();
    const users = Object.values(data.users).sort((a, b) =>
        new Date(b.lastSeen) - new Date(a.lastSeen)
    );
    res.json({ success: true, total: users.length, users });
});

// ============================================================
// API ADMIN — NGẮT KẾT NỐI
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
        tokens.forEach(t => {
            delete data.sessions[t];
            disconnected.push(t.substring(0, 16) + '...');
        });
    } else {
        const tokens = Object.keys(data.sessions);
        tokens.forEach(t => {
            delete data.sessions[t];
            disconnected.push(t.substring(0, 16) + '...');
        });
    }

    data.logs.push({
        timestamp: new Date().toISOString(), key: key || 'ALL',
        action: 'DISCONNECT', username: 'ADMIN', platform: 'ADMIN',
        uniqId: 'ADMIN', status: 'SUCCESS', ip: req.clientIp,
        message: `Đã ngắt kết nối ${disconnected.length} session(s)`
    });

    saveData(data);
    res.json({
        success: true,
        message: `Đã ngắt kết nối ${disconnected.length} session(s)`,
        disconnected
    });
});

// ============================================================
// API ADMIN — BẬT/TẮT TOOL
// ============================================================
app.post('/api/admin/toggle-tool', adminAuth, (req, res) => {
    const { enabled, message } = req.body;
    const data = initData();
    data.settings.toolEnabled = !!enabled;
    if (message) data.settings.message = message;
    saveData(data);

    data.logs.push({
        timestamp: new Date().toISOString(),
        key: 'SYSTEM', action: enabled ? 'TOOL_ENABLED' : 'TOOL_DISABLED',
        username: 'ADMIN', platform: 'ADMIN', uniqId: 'ADMIN',
        status: 'SUCCESS', ip: req.clientIp,
        message: enabled ? 'Đã BẬT tool' : 'Đã TẮT tool'
    });
    saveData(data);

    res.json({
        success: true,
        enabled: data.settings.toolEnabled,
        message: data.settings.message
    });
});

// ============================================================
// API ADMIN — TRẠNG THÁI TOOL
// ============================================================
app.get('/api/admin/tool-status', adminAuth, (req, res) => {
    const data = initData();
    res.json({
        success: true,
        enabled: data.settings.toolEnabled !== false,
        message: data.settings.message || ''
    });
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
