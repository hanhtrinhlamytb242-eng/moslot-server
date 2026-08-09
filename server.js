# Xóa hết, paste code trên
# Ctrl+X → Y → Enter

git add server.js git commit -m "Update decrypt key"# Xóa 
hết, paste code trên vào Ctrl+X → Y → Enter# Xóa
git push -u origin main# hết, paste code trên vào Ctrl+X → Y → Enter# Xóa hết, 
# paste code trên vào# Xóa hết, paste code trên vào Ctrl+X 
# → Y → Enter# Xóa hết, paste code trên vàoconst express = 
# require('express'); Ctrl+X → Y → Enterconst fs = 
# require('fs'); Ctrl+X → Y → Enterconst crypto = 
# require('crypto'); const cors =
require('cors'); git add server.js const app = express(); 
app.use(cors()); app.use(express.json()); git commit -m 
"Full server with all routes" git push -u origin main 
const DB_FILE = 'data.json'; git add server.js git commit 
-m "Update decrypt key"// ===== ĐỌC/GHI DATABASE ===== 
function loadDB() { git push -u origin main try { git add 
server.js return JSON.parse(fs.readFileSync(DB_FILE, 
'utf8')); git commit -m "Update decrypt key" } catch { git 
push -u origin main return { keys: {}, logs: [] }; git add 
server.js } git commit -m "Update decrypt key"} git push 
-u origin main function saveDB(db) { git add server.js 
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); 
git commit -m "Update decrypt key"}
git push -u origin main
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
        key: key,
        totalUses: uses,
        usedUses: 0,
        remaining: uses,
        note: note,
        status: 'active',
        created: Date.now(),
        usedBy: []
    };
    
    saveDB(db);
    res.json({
        success: true,
        key: key,
        uses: uses,
        message: `✅ Key ${key} tạo thành công!`
    });
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
    
    if (hwid && !keyData.usedBy.includes(hwid)) {
        keyData.usedBy.push(hwid);
    }
    
    db.logs.push({
        key: key,
        hwid: hwid || 'unknown',
        action: 'verify',
        time: new Date().toLocaleString('vi-VN')
    });
    saveDB(db);
    
    res.json({
        success: true,
        data: {
            key: key,
            remaining: keyData.remaining,
            total: keyData.totalUses,
            note: keyData.note
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
    
    if (keyData.remaining <= 0) {
        keyData.status = 'expired';
    }
    
    db.logs.push({
        key: key,
        hwid: hwid || 'unknown',
        action: 'use',
        time: new Date().toLocaleString('vi-VN'),
        remaining: keyData.remaining
    });
    saveDB(db);
    
    res.json({
        success: true,
        remaining: keyData.remaining,
        used: keyData.usedUses,
        total: keyData.totalUses
    });
});

// ===== GHI LOG HOẠT ĐỘNG =====
app.post('/log', (req, res) => {
    const { key, hwid, action, data } = req.body;
    const db = loadDB();
    
    db.logs.push({
        key: key || 'unknown',
        hwid: hwid || 'unknown',
        action: action || 'unknown',
        data: data || {},
        time: new Date().toLocaleString('vi-VN'),
        timestamp: Date.now()
    });
    
    if (db.logs.length > 1000) {
        db.logs = db.logs.slice(-1000);
    }
    
    saveDB(db);
    res.json({ success: true });
});

// ===== XEM LOG =====
app.get('/logs', (req, res) => {
    const db = loadDB();
    const limit = parseInt(req.query.limit) || 100;
    res.json({
        success: true,
        data: db.logs.slice(-limit).reverse(),
        total: db.logs.length
    });
});

// ===== XEM LOG THEO KEY =====
app.get('/logs/:key', (req, res) => {
    const db = loadDB();
    const logs = db.logs.filter(l => l.key === req.params.key).slice(-50).reverse();
    res.json({ success: true, data: logs });
});

// ===== DANH SÁCH KEY (ĐÃ SỬA) =====
app.get('/keys', (req, res) => {
    const db = loadDB();
    const keys = Object.values(db.keys).map(k => ({
        key: k.key,
        used: k.usedUses,
        remaining: k.remaining,
        total: k.totalUses,
        status: k.status,
        note: k.note,
        devices: k.usedBy.length
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ SERVER CHẠY TẠI PORT ${PORT}`);
    console.log('\n📋 API ENDPOINTS:');
    console.log('  GET  /                - Trang chủ');
    console.log('  POST /create-key      - Tạo key');
    console.log('  POST /verify-key      - Xác thực key');
    console.log('  POST /use-key         - Trừ lượt dùng');
    console.log('  POST /log             - Ghi log');
    console.log('  GET  /logs            - Xem log');
    console.log('  GET  /logs/:key       - Xem log theo key');
    console.log('  GET  /keys            - Danh sách key');
    console.log('  GET  /stats           - Thống kê');
    console.log('  POST /disable-key     - Vô hiệu hóa key');
    console.log('  POST /enable-key      - Kích hoạt lại key');
    console.log('  POST /delete-key      - Xóa key');
});
