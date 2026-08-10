# Xóa file cũ
rm -f server.js

# Tạo file mới
cat > server.js << 'EOF'
// ===== CODE SERVER MỚI =====
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ===== FILE LƯU TRỮ DỮ LIỆU =====
const DATA_FILE = path.join(__dirname, 'data.json');

// ===== KHỞI TẠO DỮ LIỆU =====
function initData() {
    if (!fs.existsSync(DATA_FILE)) {
        const defaultData = {
            keys: {},
            logs: [],
            sessions: {}
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== MIDDLEWARE LOG =====
app.use((req, res, next) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${clientIp}`);
    req.clientIp = clientIp;
    next();
});

// ===== API GỐC =====
app.get('/', (req, res) => {
    res.json({
        name: 'Tool Management Server',
        version: '3.0.0',
        status: 'running',
        endpoints: {
            health: '/api/health',
            verify: '/api/verify (POST)',
            createKey: '/api/admin/create-key (POST - Admin)',
            listKeys: '/api/admin/list-keys (GET - Admin)',
            deleteKey: '/api/admin/delete-key (POST - Admin)',
            disableKey: '/api/admin/disable-key (POST - Admin)',
            enableKey: '/api/admin/enable-key (POST - Admin)',
            getKeyInfo: '/api/admin/key-info (GET - Admin)',
            logs: '/api/admin/logs (GET - Admin)',
            sessions: '/api/admin/sessions (GET - Admin)',
            disconnect: '/api/admin/disconnect (POST - Admin)'
        }
    });
});

// ===== API KIỂM TRA SỨC KHỎE =====
app.get('/api/health', (req, res) => {
    const data = initData();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        totalKeys: Object.keys(data.keys).length,
        activeKeys: Object.values(data.keys).filter(k => k.active).length,
        totalSessions: Object.keys(data.sessions).length,
        totalLogs: data.logs.length
    });
});

// ===== API XÁC THỰC KEY =====
app.post('/api/verify', (req, res) => {
    const { key, deviceId, clientId, version, username, platform, uniqId } = req.body;
    const data = initData();
    const clientIp = req.clientIp;
    
    if (!data.keys[key]) {
        data.logs.push({
            timestamp: new Date().toISOString(),
            key: key,
            action: 'VERIFY_FAILED',
            username: username || 'unknown',
            platform: platform || 'unknown',
            uniqId: uniqId || 'unknown',
            status: 'KEY_NOT_FOUND',
            ip: clientIp,
            message: 'Key không tồn tại'
        });
        saveData(data);
        return res.json({
            success: false,
            message: 'Key không tồn tại! Vui lòng nhập lại.'
        });
    }
    
    const keyData = data.keys[key];
    
    if (!keyData.active) {
        data.logs.push({
            timestamp: new Date().toISOString(),
            key: key,
            action: 'VERIFY_FAILED',
            username: username || 'unknown',
            platform: platform || 'unknown',
            uniqId: uniqId || 'unknown',
            status: 'KEY_DISABLED',
            ip: clientIp,
            message: 'Key đã bị vô hiệu hóa'
        });
        saveData(data);
        return res.json({
            success: false,
            message: 'Key đã bị vô hiệu hóa!'
        });
    }
    
    if (new Date(keyData.expiry) < new Date()) {
        data.logs.push({
            timestamp: new Date().toISOString(),
            key: key,
            action: 'VERIFY_FAILED',
            username: username || 'unknown',
            platform: platform || 'unknown',
            uniqId: uniqId || 'unknown',
            status: 'KEY_EXPIRED',
            ip: clientIp,
            message: 'Key đã hết hạn'
        });
        saveData(data);
        return res.json({
            success: false,
            message: 'Key đã hết hạn!'
        });
    }
    
    if (keyData.used >= keyData.maxUses) {
        data.logs.push({
            timestamp: new Date().toISOString(),
            key: key,
            action: 'VERIFY_FAILED',
            username: username || 'unknown',
            platform: platform || 'unknown',
            uniqId: uniqId || 'unknown',
            status: 'KEY_EXHAUSTED',
            ip: clientIp,
            message: 'Key đã hết lượt sử dụng'
        });
        saveData(data);
        return res.json({
            success: false,
            message: 'Key đã hết lượt sử dụng!'
        });
    }
    
    keyData.used++;
    
    const token = crypto.randomBytes(32).toString('hex');
    data.sessions[token] = {
        key: key,
        deviceId: deviceId || 'unknown',
        username: username || 'unknown',
        platform: platform || 'unknown',
        uniqId: uniqId || 'unknown',
        connectedAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        ip: clientIp
    };
    
    data.logs.push({
        timestamp: new Date().toISOString(),
        key: key,
        action: 'VERIFY_SUCCESS',
        username: username || 'unknown',
        platform: platform || 'unknown',
        uniqId: uniqId || 'unknown',
        status: 'SUCCESS',
        ip: clientIp,
        sessionToken: token,
        message: `Xác thực thành công, còn ${keyData.maxUses - keyData.used} lượt`
    });
    
    saveData(data);
    
    res.json({
        success: true,
        message: `Xác thực thành công! Còn ${keyData.maxUses - keyData.used} lượt sử dụng`,
        data: {
            token: token,
            expiresIn: 86400,
            type: keyData.type,
            note: keyData.note
        }
    });
});

// ===== API ADMIN - TẠO KEY =====
app.post('/api/admin/create-key', (req, res) => {
    const { adminKey, type, expiry, maxUses, note } = req.body;
    
    if (adminKey !== 'ADMIN_2026_SECRET') {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền!'
        });
    }
    
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
        timestamp: new Date().toISOString(),
        key: newKey,
        action: 'KEY_CREATED',
        username: 'ADMIN',
        platform: 'ADMIN',
        uniqId: 'ADMIN',
        status: 'SUCCESS',
        ip: req.clientIp,
        message: `Đã tạo key mới: ${newKey}`
    });
    
    saveData(data);
    
    res.json({
        success: true,
        message: 'Tạo key thành công!',
        key: newKey,
        data: data.keys[newKey]
    });
});

// ===== API ADMIN - XEM DANH SÁCH KEY =====
app.get('/api/admin/list-keys', (req, res) => {
    const { adminKey } = req.query;
    
    if (adminKey !== 'ADMIN_2026_SECRET') {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền!'
        });
    }
    
    const data = initData();
    const keyList = Object.keys(data.keys).map(k => ({
        key: k,
        ...data.keys[k],
        remaining: data.keys[k].maxUses - data.keys[k].used,
        status: data.keys[k].active ? '🟢 Hoạt động' : '🔴 Đã khóa'
    }));
    
    res.json({
        success: true,
        total: keyList.length,
        keys: keyList
    });
});

// ===== API ADMIN - XÓA KEY =====
app.post('/api/admin/delete-key', (req, res) => {
    const { adminKey, key } = req.body;
    
    if (adminKey !== 'ADMIN_2026_SECRET') {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền!'
        });
    }
    
    const data = initData();
    if (!data.keys[key]) {
        return res.json({
            success: false,
            message: 'Key không tồn tại!'
        });
    }
    
    delete data.keys[key];
    
    data.logs.push({
        timestamp: new Date().toISOString(),
        key: key,
        action: 'KEY_DELETED',
        username: 'ADMIN',
        platform: 'ADMIN',
        uniqId: 'ADMIN',
        status: 'SUCCESS',
        ip: req.clientIp,
        message: `Đã xóa key: ${key}`
    });
    
    saveData(data);
    
    res.json({
        success: true,
        message: `Đã xóa key: ${key}`
    });
});

// ===== API ADMIN - VÔ HIỆU HÓA KEY =====
app.post('/api/admin/disable-key', (req, res) => {
    const { adminKey, key } = req.body;
    
    if (adminKey !== 'ADMIN_2026_SECRET') {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền!'
        });
    }
    
    const data = initData();
    if (!data.keys[key]) {
        return res.json({
            success: false,
            message: 'Key không tồn tại!'
        });
    }
    
    data.keys[key].active = false;
    
    data.logs.push({
        timestamp: new Date().toISOString(),
        key: key,
        action: 'KEY_DISABLED',
        username: 'ADMIN',
        platform: 'ADMIN',
        uniqId: 'ADMIN',
        status: 'SUCCESS',
        ip: req.clientIp,
        message: `Đã vô hiệu hóa key: ${key}`
    });
    
    saveData(data);
    
    res.json({
        success: true,
        message: `Đã vô hiệu hóa key: ${key}`
    });
});

// ===== API ADMIN - KÍCH HOẠT KEY =====
app.post('/api/admin/enable-key', (req, res) => {
    const { adminKey, key } = req.body;
    
    if (adminKey !== 'ADMIN_2026_SECRET') {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền!'
        });
    }
    
    const data = initData();
    if (!data.keys[key]) {
        return res.json({
            success: false,
            message: 'Key không tồn tại!'
        });
    }
    
    data.keys[key].active = true;
    
    data.logs.push({
        timestamp: new Date().toISOString(),
        key: key,
        action: 'KEY_ENABLED',
        username: 'ADMIN',
        platform: 'ADMIN',
        uniqId: 'ADMIN',
        status: 'SUCCESS',
        ip: req.clientIp,
        message: `Đã kích hoạt lại key: ${key}`
    });
    
    saveData(data);
    
    res.json({
        success: true,
        message: `Đã kích hoạt lại key: ${key}`
    });
});

// ===== API ADMIN - XEM LOG =====
app.get('/api/admin/logs', (req, res) => {
    const { adminKey, limit = 100, key } = req.query;
    
    if (adminKey !== 'ADMIN_2026_SECRET') {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền!'
        });
    }
    
    const data = initData();
    let logs = data.logs;
    
    if (key) {
        logs = logs.filter(log => log.key === key);
    }
    
    logs = logs.slice(-parseInt(limit)).reverse();
    
    res.json({
        success: true,
        total: data.logs.length,
        filtered: logs.length,
        logs: logs
    });
});

// ===== API ADMIN - XEM SESSION =====
app.get('/api/admin/sessions', (req, res) => {
    const { adminKey } = req.query;
    
    if (adminKey !== 'ADMIN_2026_SECRET') {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền!'
        });
    }
    
    const data = initData();
    const sessions = Object.keys(data.sessions).map(token => ({
        token: token.substring(0, 16) + '...',
        ...data.sessions[token]
    }));
    
    res.json({
        success: true,
        total: sessions.length,
        sessions: sessions
    });
});

// ===== API ADMIN - NGẮT KẾT NỐI =====
app.post('/api/admin/disconnect', (req, res) => {
    const { adminKey, token, key } = req.body;
    
    if (adminKey !== 'ADMIN_2026_SECRET') {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền!'
        });
    }
    
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
        timestamp: new Date().toISOString(),
        key: key || 'ALL',
        action: 'DISCONNECT',
        username: 'ADMIN',
        platform: 'ADMIN',
        uniqId: 'ADMIN',
        status: 'SUCCESS',
        ip: req.clientIp,
        message: `Đã ngắt kết nối ${disconnected.length} session(s)`
    });
    
    saveData(data);
    
    res.json({
        success: true,
        message: `Đã ngắt kết nối ${disconnected.length} session(s)`,
        disconnected: disconnected
    });
});

// ===== KHỞI ĐỘNG SERVER =====
app.listen(PORT, () => {
    initData();
    console.log(`✅ Server đang chạy tại port ${PORT}`);
    console.log(`📁 Dữ liệu lưu tại: ${DATA_FILE}`);
    console.log(`🔑 Admin Key: ADMIN_2026_SECRET`);
});
EOF
