const crypto = require('crypto');
const fs = require('fs');

// Đọc file tool
const code = fs.readFileSync('hackdatim30v5555-with-key.js', 'utf8');

// Tạo key và iv
const KEY = crypto.randomBytes(32);
const IV = crypto.randomBytes(16);

// Mã hóa
const cipher = crypto.createCipheriv('aes-256-cbc', KEY, IV);
let encrypted = cipher.update(code, 'utf8', 'base64');
encrypted += cipher.final('base64');

// Lưu KEY và IV
fs.writeFileSync('tool-key.txt', `KEY: ${KEY.toString('hex')}\nIV: ${IV.toString('hex')}`);
console.log('✅ KEY và IV đã lưu vào tool-key.txt');

// Tạo file loader
const loader = `
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const readline = require('readline-sync');

const SERVER_URL = 'https://tool-server-tfmc.onrender.com';
const KEY_FILE = 'license.json';

function getHWID() {
    try {
        const { execSync } = require('child_process');
        const data = [
            execSync('getprop ro.product.brand', { encoding: 'utf8' }).trim(),
            execSync('getprop ro.product.model', { encoding: 'utf8' }).trim(),
            execSync('getprop ro.product.device', { encoding: 'utf8' }).trim(),
            execSync('getprop ro.build.fingerprint', { encoding: 'utf8' }).trim()
        ].join('|');
        return crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
    } catch {
        return crypto.randomBytes(16).toString('hex').toUpperCase();
    }
}

function loadKeyFromFile() {
    try {
        if (fs.existsSync(KEY_FILE)) {
            return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).key || '';
        }
    } catch (e) {}
    return '';
}

function saveKeyToFile(key) {
    fs.writeFileSync(KEY_FILE, JSON.stringify({ key: key }, null, 2));
}

async function checkServerConnection() {
    try {
        const response = await axios.get(\`\${SERVER_URL}/\`, { timeout: 10000, validateStatus: false });
        if (response.status) return { connected: true };
        return { connected: false, error: 'Server không phản hồi!' };
    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') {
            return { connected: false, error: 'Không thể kết nối server! Kiểm tra mạng.' };
        }
        return { connected: true };
    }
}

async function verifyKeyWithServer(inputKey) {
    const connection = await checkServerConnection();
    if (!connection.connected) {
        console.log('\\n  ❌ KHÔNG THỂ KẾT NỐI SERVER!');
        return { success: false, message: '❌ Mất kết nối server!' };
    }
    
    const hwid = getHWID();
    try {
        const response = await axios.post(\`\${SERVER_URL}/verify-key\`, {
            key: inputKey.trim().toUpperCase(),
            hwid: hwid
        }, { timeout: 10000 });
        return response.data;
    } catch (error) {
        return { success: false, message: '❌ Kết nối server thất bại!' };
    }
}

async function main() {
    console.clear();
    console.log('\\n  🔐 XÁC THỰC LICENSE KEY');
    console.log('  📌 Mua key: Discord: hiaeeeeej_8282\\n');
    
    let savedKey = loadKeyFromFile();
    let inputKey = '';
    
    if (savedKey) {
        console.log(\`  📂 Tìm thấy key đã lưu: \${savedKey}\`);
        const useSaved = readline.question('  Dùng key này? (y/n): ');
        if (useSaved.toLowerCase() === 'y') {
            inputKey = savedKey;
        }
    }
    
    if (!inputKey) {
        inputKey = readline.question('\\n  🔑 Nhập Key: ');
    }
    
    if (!inputKey) {
        console.log('\\n  ❌ Key không được để trống!');
        process.exit(0);
    }
    
    console.log('\\n  ⏳ Đang xác thực key...');
    const verifyResult = await verifyKeyWithServer(inputKey);
    
    if (!verifyResult.success) {
        console.log(\`\\n  \${verifyResult.message}\`);
        console.log('  💡 Mua key: Discord: hiaeeeeej_8282');
        readline.question('\\n  👉 Nhấn Enter để thoát...');
        process.exit(0);
    }
    
    const currentKey = inputKey.trim().toUpperCase();
    saveKeyToFile(currentKey);
    
    console.log('\\n  ✅ Key hợp lệ!');
    
    // ===== GIẢI MÃ TOOL =====
    const encrypted = \`${encrypted}\`;
    const decipher = crypto.createDecipheriv('aes-256-cbc', 
        Buffer.from('${KEY.toString('hex')}', 'hex'),
        Buffer.from('${IV.toString('hex')}', 'hex')
    );
    let code = decipher.update(encrypted, 'base64', 'utf8');
    code += decipher.final('utf8');
    
    eval(code);
}

main().catch(err => {
    console.error('\\n  ❌ LỖI: ' + err.message);
    readline.question('\\n  👉 Nhấn Enter để thoát...');
});
`;

fs.writeFileSync('hackdatim30v5555-encrypted.js', loader);
console.log('✅ File đã mã hóa: hackdatim30v5555-encrypted.js');
console.log('📋 Copy KEY và IV từ tool-key.txt vào server.js');
