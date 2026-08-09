const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = 'data.json';

// ===== KEY GIẢI MÃ TOOL =====
const TOOL_DECRYPT_KEY = Buffer.from('dca2ee0a6eec27ea1e180e5d3f0f689d7d99b5d231e025d70ae7d4eaa0988b24', 'hex');
const TOOL_DECRYPT_IV = Buffer.from('8aeedaaf68b7291f28ea9331141576a8', 'hex');

// ===== MÃ HÓA AES =====
const K_AES2 = Buffer.from("gksekfidjrqjfwk1", "utf8");
const I_AES2 = Buffer.from("towerdefense_amo", "utf8");

function encryptAES2(data) {
    const cipher = crypto.createCipheriv("aes-128-cbc", K_AES2, I_AES2);
    let enc = cipher.update(JSON.stringify(data), "utf8", "base64");
    enc += cipher.final("base64");
    return enc;
}

function decryptAES2(b64) {
    try {
        if (typeof b64 === 'string' && b64.startsWith('{')) return b64;
        const d = crypto.createDecipheriv("aes-128-cbc", K_AES2, I_AES2);
        let dec = d.update(b64, "base64", "utf8") + d.final("utf8");
        return dec.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
    } catch (e) { return null; }
}

function postRequest(url, postData, headers = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const opt = {
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname,
            method: 'POST',
            timeout: timeoutMs,
            headers: {
                'User-Agent': 'app',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                'Connection': 'keep-alive',
                ...headers
            }
        };
        const req = http.request(opt, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.on('error', e => reject(e));
        req.write(postData);
        req.end();
    });
}

function findGichapo(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.gichapo && typeof obj.gichapo === 'string' && obj.gichapo.length >= 1) return obj.gichapo;
    for (let k in obj) { let f = findGichapo(obj[k]); if (f) return f; }
    return null;
}

// ===== DATABASE =====
function loadDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {
        return { keys: {}, logs: [] };
    }
}

function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ===== ROUTE GỐC =====
app.get('/', (req, res) => {
    res.send('✅ Server đang chạy!');
});

// ===== TẠO KEY =====
app.post('/create-key', (req, res) => {
    const { key, uses = 20, note = '' } = req.body;
    if (!key) return res.json({ error: 'Vui lòng nhập key!' });
    if (uses < 1) return res.json({ error: 'Số lượt phải >= 1' });
    const db = loadDB();
    if (db.keys[key]) return res.json({ error: 'Key đã tồn tại!' });
    db.keys[key] = {
        key, totalUses: uses, usedUses: 0, remaining: uses,
        note, status: 'active', created: Date.now(), usedBy: []
    };
    saveDB(db);
    res.json({ success: true, key, uses, message: `✅ Key ${key} tạo thành công!` });
});

// ===== XÁC THỰC KEY =====
app.post('/verify-key', (req, res) => {
    const { key, hwid } = req.body;
    if (!key) return res.json({ success: false, message: '❌ Vui lòng nhập Key!' });
    const db = loadDB();
    const keyData = db.keys[key];
    if (!keyData) return res.json({ success: false, message: '❌ Key không tồn tại!' });
    if (keyData.status === 'disabled') return res.json({ success: false, message: '❌ Key đã bị khóa!' });
    if (keyData.remaining <= 0) return res.json({ success: false, message: '❌ Key đã hết lượt dùng!' });
    if (hwid && !keyData.usedBy.includes(hwid)) keyData.usedBy.push(hwid);
    db.logs.push({ key, hwid: hwid || 'unknown', action: 'verify', time: new Date().toLocaleString('vi-VN') });
    saveDB(db);
    res.json({
        success: true,
        data: {
            key, remaining: keyData.remaining, total: keyData.totalUses,
            note: keyData.note,
            decryptKey: TOOL_DECRYPT_KEY.toString('hex'),
            decryptIv: TOOL_DECRYPT_IV.toString('hex')
        }
    });
});

// ===== TRỪ LƯỢT DÙNG =====
app.post('/use-key', (req, res) => {
    const { key, hwid } = req.body;
    const db = loadDB();
    const keyData = db.keys[key];
    if (!keyData) return res.json({ success: false, error: 'Key không tồn tại!' });
    if (keyData.remaining <= 0) return res.json({ success: false, error: 'Key đã hết lượt!' });
    keyData.usedUses += 1;
    keyData.remaining -= 1;
    if (keyData.remaining <= 0) keyData.status = 'expired';
    db.logs.push({ key, hwid: hwid || 'unknown', action: 'use', time: new Date().toLocaleString('vi-VN'), remaining: keyData.remaining });
    saveDB(db);
    res.json({ success: true, remaining: keyData.remaining, used: keyData.usedUses, total: keyData.totalUses });
});

// ===== LOG =====
app.post('/log', (req, res) => {
    const { key, hwid, action, data } = req.body;
    const db = loadDB();
    db.logs.push({
        key: key || 'unknown', hwid: hwid || 'unknown',
        action: action || 'unknown', data: data || {},
        time: new Date().toLocaleString('vi-VN'), timestamp: Date.now()
    });
    if (db.logs.length > 1000) db.logs = db.logs.slice(-1000);
    saveDB(db);
    res.json({ success: true });
});

// ===== XEM LOG =====
app.get('/logs', (req, res) => {
    const db = loadDB();
    res.json({ success: true, data: db.logs.slice(-100).reverse() });
});

// ===== DANH SÁCH KEY =====
app.get('/keys', (req, res) => {
    const db = loadDB();
    const keys = Object.values(db.keys).map(k => ({
        key: k.key, used: k.usedUses, remaining: k.remaining,
        total: k.totalUses, status: k.status, note: k.note, devices: k.usedBy.length
    }));
    res.json({ success: true, data: keys });
});

// ===== THỐNG KÊ =====
app.get('/stats', (req, res) => {
    const db = loadDB();
    const keys = Object.values(db.keys);
    res.json({
        success: true,
        data: {
            totalKeys: keys.length,
            activeKeys: keys.filter(k => k.status === 'active').length,
            totalUses: keys.reduce((sum, k) => sum + k.usedUses, 0),
            totalRemaining: keys.reduce((sum, k) => sum + k.remaining, 0)
        }
    });
});

// ===== VÔ HIỆU HÓA KEY =====
app.post('/disable-key', (req, res) => {
    const { key } = req.body;
    const db = loadDB();
    if (!db.keys[key]) return res.json({ success: false, error: 'Key không tồn tại!' });
    db.keys[key].status = 'disabled';
    saveDB(db);
    res.json({ success: true, message: '✅ Key đã bị vô hiệu hóa!' });
});

// ===== KÍCH HOẠT LẠI KEY =====
app.post('/enable-key', (req, res) => {
    const { key } = req.body;
    const db = loadDB();
    if (!db.keys[key]) return res.json({ success: false, error: 'Key không tồn tại!' });
    db.keys[key].status = 'active';
    saveDB(db);
    res.json({ success: true, message: '✅ Key đã được kích hoạt lại!' });
});

// ===== XÓA KEY =====
app.post('/delete-key', (req, res) => {
    const { key } = req.body;
    const db = loadDB();
    if (!db.keys[key]) return res.json({ success: false, error: 'Key không tồn tại!' });
    delete db.keys[key];
    saveDB(db);
    res.json({ success: true, message: '✅ Key đã bị xóa!' });
});

// ===== API LẤY DỮ LIỆU USER =====
app.post('/get-user-data', async (req, res) => {
    const { platform, uniq_id, host_id, key, hwid } = req.body;
    const db = loadDB();
    const keyData = db.keys[key];
    if (!keyData) return res.json({ success: false, error: 'Key không tồn tại!' });
    if (keyData.remaining <= 0) return res.json({ success: false, error: 'Key đã hết lượt!' });
    try {
        const isViet = (platform === 'AMO' || platform === 'SS');
        const gicDefault = isViet ? "선택된서버:베트남서버 ping:67ms" : "선택된서버:한국서버 ping:205ms";
        const getUrl = `http://211.253.26.47:8093/TOWERDEFENCE_${platform}/get_user_data_all_AES2.php`;
        const getPayload = {
            UNIQ_ID: uniq_id, HOST_ID: host_id,
            MOBILE_CONNECT: "", ANDROID_AD: "",
            GICHAPO: gicDefault, LOCAL_KEY: null
        };
        if (platform === 'ATV' || platform === 'LG') getPayload.MODEL_NAME = "BeyondTV";
        const resData = await postRequest(getUrl, `DATA=${encodeURIComponent(encryptAES2(getPayload))}`);
        const dec = decryptAES2(resData);
        if (!dec) throw new Error('Không giải mã được dữ liệu GET');
        const data = JSON.parse(dec);
        const gichapo = findGichapo(data);
        if (!gichapo) throw new Error('Không tìm thấy GICHAPO');
        const val = data.VALUE || {};
        const normal = val.normal?.value || {};
        const rubydiagold = val.rubydiagold?.value || {};
        res.json({
            success: true,
            gichapo: gichapo,
            userName: normal.USER_NAME || '???',
            magic: rubydiagold.MAGIC || 0
        });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ===== API HACK MAGIC (SERVER XỬ LÝ) =====
app.post('/hack-magic', async (req, res) => {
    const { key, hwid, platform, uniq_id, host_id, gichapo, hackCount } = req.body;
    const db = loadDB();
    const keyData = db.keys[key];
    if (!keyData) return res.json({ success: false, error: 'Key không tồn tại!' });
    if (keyData.remaining <= 0) return res.json({ success: false, error: 'Key đã hết lượt!' });
    if (keyData.status === 'disabled') return res.json({ success: false, error: 'Key đã bị khóa!' });
    
    const payload = {
        SGS: true, LANG: 3, PICK: 7, PICK_NAME: "MAGIC", PICK_AMOUNT: "100",
        UNIQ_ID: uniq_id, PLATFORM: platform, MOBILE_CONNECT: "", GICHAPO: gichapo
    };
    const enc = encryptAES2(payload);
    const url = `http://211.253.26.47:8093/TOWERDEFENCE_COMMON/EVENT_MENU/eventmenu_shopping.php`;
    const body = `DATA=${encodeURIComponent(enc)}`;
    
    let successCount = 0, failCount = 0, totalMagicReceived = 0;
    for (let i = 1; i <= hackCount; i++) {
        try {
            const result = await postRequest(url, body);
            const dec = decryptAES2(result);
            const data = JSON.parse(dec || result);
            if (data && data.RESULT === "OK") {
                successCount++;
                totalMagicReceived += 30;
            } else {
                failCount++;
            }
        } catch (e) {
            failCount++;
        }
        if (i < hackCount) await new Promise(r => setTimeout(r, 2000));
    }
    keyData.usedUses += 1;
    keyData.remaining -= 1;
    if (keyData.remaining <= 0) keyData.status = 'expired';
    saveDB(db);
    db.logs.push({
        key, hwid: hwid || 'unknown', action: 'hack_magic',
        data: { hackCount, successCount, failCount, totalMagicReceived, platform, uniq_id },
        time: new Date().toLocaleString('vi-VN')
    });
    saveDB(db);
    res.json({
        success: true,
        data: {
            total: hackCount, success: successCount, fail: failCount,
            magic_received: totalMagicReceived,
            remaining: keyData.remaining, used: keyData.usedUses, total: keyData.totalUses
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ SERVER CHẠY TẠI PORT ${PORT}`);
    console.log('\n📋 API:');
    console.log('  POST /create-key, POST /verify-key, POST /use-key');
    console.log('  POST /log, GET /logs, GET /keys, GET /stats');
    console.log('  POST /disable-key, POST /enable-key, POST /delete-key');
    console.log('  POST /get-user-data, POST /hack-magic');
});
