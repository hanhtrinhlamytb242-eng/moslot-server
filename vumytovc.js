const crypto = require("crypto");
const readline = require("readline-sync");
const http = require("http");
const https = require("https");
const os = require("os");

const C = {
    r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", b: "\x1b[34m",
    m: "\x1b[35m", c: "\x1b[36m", w: "\x1b[37m", rs: "\x1b[0m",
    bold: "\x1b[1m"
};

const K_AES2 = Buffer.from("gksekfidjrqjfwk1", "utf8");
const I_AES2 = Buffer.from("towerdefense_amo", "utf8");

// ============================================================
// SERVER CONFIG — Kết nối server quản lý
// ============================================================
const SERVER_URL = "http://localhost:3000";   // ⚠️ ĐỔI KHI DEPLOY

function callServer(pathApi, data) {
    return new Promise((resolve) => {
        try {
            const postData = new URLSearchParams(data).toString();
            const u = new URL(SERVER_URL + pathApi);
            const lib = u.protocol === 'https:' ? https : http;
            const req = lib.request({
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname,
                method: 'POST',
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, res => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); }
                    catch { resolve({ success: false, message: 'Server trả về lỗi' }); }
                });
            });
            req.on('timeout', () => { req.destroy(); resolve({ success: false, message: 'Server timeout' }); });
            req.on('error', () => resolve({ success: false, message: 'Không kết nối được server' }));
            req.write(postData);
            req.end();
        } catch (e) {
            resolve({ success: false, message: 'Lỗi kết nối: ' + e.message });
        }
    });
}

function getServer(pathApi) {
    return new Promise((resolve) => {
        try {
            const u = new URL(SERVER_URL + pathApi);
            const lib = u.protocol === 'https:' ? https : http;
            const req = lib.get({
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname + u.search,
                timeout: 10000
            }, res => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); }
                    catch { resolve({ success: false, message: 'Server trả về lỗi' }); }
                });
            });
            req.on('timeout', () => { req.destroy(); resolve({ success: false, message: 'Server timeout' }); });
            req.on('error', () => resolve({ success: false, message: 'Không kết nối được server' }));
        } catch (e) {
            resolve({ success: false, message: 'Lỗi kết nối: ' + e.message });
        }
    });
}

function getHWID() {
    try {
        const raw = os.hostname() + '_' + (os.cpus()[0]?.model || 'unk') + '_' + os.platform();
        return crypto.createHash('md5').update(raw).digest('hex').substring(0, 16);
    } catch { return 'unknown_hwid'; }
}

async function checkServerStatus() {
    const res = await getServer('/api/status');
    if (!res.success) {
        return { ok: false, reason: res.message || 'Không kết nối được server' };
    }
    if (res.enabled === false) {
        return { ok: false, reason: res.message || 'Tool đang bảo trì hệ thống, sẽ mở lại sau' };
    }
    return { ok: true, message: res.message };
}

async function verifyKey(key, userInfo) {
    const res = await callServer('/api/verify', {
        key: key,
        uniqId: userInfo.uniqId || '',
        username: userInfo.username || '',
        platform: userInfo.platform || '',
        hostId: userInfo.hostId || '',
        deviceId: getHWID(),
        version: '1.0'
    });
    return res;
}
// ============================================================

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

function showBox(title, content, color = "c") {
    const borderColor = color === "c" ? C.c : color === "g" ? C.g : color === "r" ? C.r : C.m;
    const width = 78;
    console.log(`${borderColor}┌${"─".repeat(width)}┐${C.rs}`);
    console.log(`${borderColor}│${C.bold}${C.w} ${title.padEnd(width - 2)}${C.rs}${borderColor}│${C.rs}`);
    console.log(`${borderColor}├${"─".repeat(width)}┤${C.rs}`);
    content.forEach(line => console.log(`${borderColor}│${C.w} ${line.padEnd(width - 2)}${C.rs}${borderColor}│${C.rs}`));
    console.log(`${borderColor}└${"─".repeat(width)}┘${C.rs}`);
}

function printBanner() {
    console.clear();
    const banner = `
  ${C.bold}${C.m}╔══════════════════════════════════════════════════════════════════════╗${C.rs}
  ${C.bold}${C.m}║${C.bold}${C.y}          ⚡  M Ở   S L O T   H E R O  ⚡          ${C.bold}${C.m}║${C.rs}
  ${C.bold}${C.m}╠══════════════════════════════════════════════════════════════════════╣${C.rs}
  ${C.bold}${C.m}║${C.w}  ⚡ Mở rộng slot anh hùng (Hero Slot)                    ${C.bold}${C.m}║${C.rs}
  ${C.bold}${C.m}║${C.w}  🎯 Tăng số lượng hero có thể sở hữu                    ${C.bold}${C.m}║${C.rs}
  ${C.bold}${C.m}║${C.w}  💡 Không cần đủ tài nguyên                             ${C.bold}${C.m}║${C.rs}
  ${C.bold}${C.m}║${C.w}  ⏳ Delay 2s lần đầu / 1s các lần sau                  ${C.bold}${C.m}║${C.rs}
  ${C.bold}${C.m}╚══════════════════════════════════════════════════════════════════════╝${C.rs}
  `;
    console.log(banner);
}

function printSeparator() {
    console.log(`  ${C.bold}${C.c}${"─".repeat(78)}${C.rs}`);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== HÀM XỬ LÝ HOST_ID =====
async function getHostId(platform) {
    const isAMO = (platform === 'AMO');
    let host_id = "";
    let mobileConnect = "";
    
    if (isAMO) {
        host_id = readline.question(`  ${C.y}📧 HOST_ID (Enter = gibongtran@gmail.com): ${C.w}`).trim() || "gibongtran@gmail.com";
        mobileConnect = "";
    } else {
        console.log(`\n  ${C.bold}${C.y}🔗 CHỌN KIỂU HOST${C.rs}`);
        console.log(`  ${C.w}[1] ${C.m}Host liên kết ([연동] + ID AMO)${C.rs}`);
        console.log(`  ${C.w}[2] ${C.y}Host dạng Gmail${C.rs}`);
        const hostType = readline.question(`  ${C.c}👉 Chọn (1/2): ${C.w}`);
        
        if (hostType === '1') {
            const linkedId = readline.question(`  ${C.y}🔗 Nhập ID AMO liên kết: ${C.w}`).trim();
            if (!linkedId) {
                console.log(`\n  ${C.r}❌ ID không được để trống!${C.rs}`);
                return null;
            }
            host_id = `[연동]${linkedId},[비번]undefined`;
            mobileConnect = "AMO";
        } else {
            host_id = readline.question(`  ${C.y}📧 HOST_ID (Enter = gibongtran@gmail.com): ${C.w}`).trim() || "gibongtran@gmail.com";
            mobileConnect = "";
        }
    }
    return { host_id, mobileConnect };
}

// ===== GET DATA =====
async function fetchUserData(platform, uniqId, hostId) {
    const isViet = (platform === 'AMO' || platform === 'SS');
    const gicDefault = isViet ? "선택된서버:베트남서버 ping:67ms" : "선택된서버:한국서버 ping:205ms";
    
    const getUrl = `http://211.253.26.47:8093/TOWERDEFENCE_${platform}/get_user_data_all_AES2.php`;
    const getPayload = {
        UNIQ_ID: uniqId, HOST_ID: hostId,
        MOBILE_CONNECT: "", ANDROID_AD: "",
        GICHAPO: gicDefault, LOCAL_KEY: null
    };
    if (platform === 'ATV' || platform === 'LG') getPayload.MODEL_NAME = "BeyondTV";

    const res = await postRequest(getUrl, `DATA=${encodeURIComponent(encryptAES2(getPayload))}`);
    const dec = decryptAES2(res);
    if (!dec) throw new Error('Không giải mã được dữ liệu GET');
    const data = JSON.parse(dec);
    const gichapo = findGichapo(data);
    if (!gichapo) throw new Error('Không tìm thấy GICHAPO');
    const val = data.VALUE || {};
    const normal = val.normal?.value || {};
    const heroVal = val.hero?.value || {};
    const etc = val.etc?.value || {};
    
    return {
        gichapo,
        userName: normal.USER_NAME || '???',
        version: normal.VERSION || `TD_${platform}_20240621`,
        runCount: etc.run_count || 0,
        selectedHero: heroVal.SELECTED_HERO || heroVal.selected_hero || "",
        selectedHeroMax: parseInt(heroVal.SELECTED_HERO_MAX) || parseInt(heroVal.selected_hero_max) || 1,
        bouHero: heroVal.BOU_HERO || heroVal.bou_hero || "",
        rawData: data
    };
}

// ===== MỞ SLOT HERO =====
async function expandHeroSlot(platform, uniqId, hostId, gichapo, runCount, heroData) {
    const payload = {
        UNIQ_ID: uniqId,
        HOST_ID: hostId,
        SELECTED_HERO: heroData.selectedHero || "",
        SELECTED_HERO_MAX: heroData.selectedHeroMax || 1,
        BOU_HERO: heroData.bouHero || "",
        RUN_COUNT: runCount,
        COMMENT: "[모바일연동됨]영웅슬롯증가",
        MOBILE_CONNECT: "",
        GICHAPO: gichapo
    };
    
    const enc = encryptAES2(payload);
    const url = `http://211.253.26.47:8093/TOWERDEFENCE_${platform}/put_userinfo_hero_AES2.php`;
    const body = `DATA=${encodeURIComponent(enc)}`;
    const headers = {
        'X-Requested-With': platform === 'ATV' ? 'busidol.atv.tower' : 'busidol.mobile.tower'
    };
    
    const res = await postRequest(url, body, headers);
    
    try {
        const dec = decryptAES2(res);
        return JSON.parse(dec || res);
    } catch (e) {
        return { RAW: res, ERROR: e.message };
    }
}

// ==================== MAIN ====================
async function main() {
    printBanner();
    printSeparator();

    // ===== CHECK SERVER STATUS TRƯỚC KHI CHO DÙNG =====
    console.log(`\n  ${C.y}📡 Đang kết nối server...${C.rs}`);
    const serverCheck = await checkServerStatus();
    if (!serverCheck.ok) {
        console.log(`\n  ${C.r}⛔ KHÔNG THỂ SỬ DỤNG TOOL${C.rs}`);
        console.log(`  ${C.y}📢 Lý do: ${serverCheck.reason}${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
        process.exit(0);
    }
    console.log(`  ${C.g}✅ Kết nối server thành công${C.rs}`);
    
    const serverMap = { "1": "AMO", "2": "ATV", "3": "LG", "4": "SS" };
    const serverColors = { "1": C.g, "2": C.m, "3": C.y, "4": C.b };
    
    console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}              🎯  C H Ọ N   S E R V E R              ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╠══════════════════════════════════════════════════════════════════════╣${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.g}  [1] AMO (Mobile)                                        ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.m}  [2] ATV (Android TV)                                     ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.y}  [3] LG (LG WebOS)                                        ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.b}  [4] SS (Samsung TV)                                      ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);
    
    const svChoice = readline.question(`\n  ${C.c}👉 Chọn server (1-4): ${C.w}`);
    const platform = serverMap[svChoice];
    if (!platform) {
        console.log(`\n  ${C.r}❌ Lựa chọn không hợp lệ!${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để tiếp tục...${C.w}`);
        return;
    }
    console.log(`  ${C.g}✅ Platform: ${serverColors[svChoice]}${platform}${C.rs}`);
    printSeparator();
    
    console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}              📝  N H Ậ P   T H Ô N G   T I N            ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);
    
    const uniq_id = readline.question(`\n  ${C.r}🆔 UNIQ_ID: ${C.w}`).trim();
    if (!uniq_id) {
        console.log(`\n  ${C.r}❌ UNIQ_ID không được để trống!${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để tiếp tục...${C.w}`);
        return;
    }

    // ===== YÊU CẦU NHẬP KEY =====
    console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}              🔑  X Á C   T H Ự C   K E Y                ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);
    
    const licenseKey = readline.question(`\n  ${C.y}🔑 Nhập KEY để sử dụng tool: ${C.w}`).trim();
    if (!licenseKey) {
        console.log(`\n  ${C.r}❌ Bạn chưa nhập KEY!${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
        process.exit(0);
    }
    
    const hostResult = await getHostId(platform);
    if (!hostResult) return;
    const { host_id, mobileConnect } = hostResult;
    
    console.log(`\n  ${C.y}📡 Đang lấy dữ liệu tài khoản...${C.rs}`);
    await delay(500);
    
    let gichapo, runCount, heroData;
    try {
        const info = await fetchUserData(platform, uniq_id, host_id);
        gichapo = info.gichapo;
        runCount = info.runCount;
        heroData = {
            selectedHero: info.selectedHero,
            selectedHeroMax: info.selectedHeroMax,
            bouHero: info.bouHero
        };

        // ===== VERIFY KEY VỚI SERVER =====
        console.log(`\n  ${C.y}🔐 Đang xác thực KEY với server...${C.rs}`);
        const verifyResult = await verifyKey(licenseKey, {
            uniqId: uniq_id,
            username: info.userName || '???',
            platform: platform,
            hostId: host_id
        });
        
        if (!verifyResult.success) {
            console.log(`\n  ${C.r}❌ XÁC THỰC THẤT BẠI${C.rs}`);
            console.log(`  ${C.y}📢 Lý do: ${verifyResult.message || 'Key không hợp lệ'}${C.rs}`);
            readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
            process.exit(0);
        }
        console.log(`  ${C.g}✅ ${verifyResult.message}${C.rs}`);

        console.log(`  ${C.g}✅ Lấy dữ liệu thành công!`);
        printSeparator();
        console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
        console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}           📊  T H Ô N G   T I N   H E R O              ${C.bold}${C.c}║${C.rs}`);
        console.log(`  ${C.bold}${C.c}╠══════════════════════════════════════════════════════════════════════╣${C.rs}`);
        console.log(`  ${C.bold}${C.c}║${C.w}  👤 USER NAME : ${C.g}${info.userName.padEnd(40)}${C.bold}${C.c}║${C.rs}`);
        console.log(`  ${C.bold}${C.c}║${C.w}  🔄 RUN_COUNT : ${C.y}${String(runCount).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
        console.log(`  ${C.bold}${C.c}║${C.w}  🔑 GICHAPO   : ${C.m}${gichapo.padEnd(40)}${C.bold}${C.c}║${C.rs}`);
        console.log(`  ${C.bold}${C.c}║${C.w}  ⚡ Slot hiện tại: ${C.g}${String(heroData.selectedHeroMax).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
        console.log(`  ${C.bold}${C.c}║${C.w}  🎯 Hero chọn  : ${C.y}${heroData.selectedHero.padEnd(40)}${C.bold}${C.c}║${C.rs}`);
        console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);
    } catch(e) {
        console.log(`  ${C.r}❌ Lỗi GET: ${e.message}${C.rs}`);
        gichapo = readline.question(`  ${C.m}🔑 Nhập GICHAPO thủ công: ${C.w}`).trim();
        if (!gichapo) {
            console.log(`\n  ${C.r}❌ GICHAPO không được để trống!${C.rs}`);
            readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để tiếp tục...${C.w}`);
            return;
        }
        runCount = 1;
        heroData = { selectedHero: "", selectedHeroMax: 1, bouHero: "" };
    }
    
    const gicInput = readline.question(`\n  ${C.m}🔑 Nhập GICHAPO (Enter dùng GICHAPO server): ${C.w}`).trim();
    if (gicInput) gichapo = gicInput;
    console.log(`  ${C.g}✅ Dùng GICHAPO: ${C.y}${gichapo}${C.rs}`);
    
    printSeparator();
    
    console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}           🔄  S Ố   L Ầ N   M Ở   S L O T              ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);
    console.log(`  ${C.w}💡 RUN_COUNT hiện tại: ${C.y}${runCount}`);
    console.log(`  ${C.w}💡 Mỗi lần mở slot RUN_COUNT giảm 1${C.rs}`);
    console.log(`  ${C.w}💡 Slot hiện tại: ${C.y}${heroData.selectedHeroMax}${C.rs}`);
    
    const hackCount = parseInt(readline.question(`\n  ${C.c}👉 Số lần mở slot (1-${runCount}): ${C.w}`));
    if (isNaN(hackCount) || hackCount < 1 || hackCount > runCount) {
        console.log(`\n  ${C.r}❌ Số lần không hợp lệ! Phải từ 1 đến ${runCount}${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để tiếp tục...${C.w}`);
        return;
    }
    
    const runToSend = runCount - 1;
    if (runToSend < 0) {
        console.log(`  ${C.r}⚠️ RUN_COUNT = 0, không thể hack!${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để tiếp tục...${C.w}`);
        return;
    }
    
    console.log(`\n  ${C.y}📦 XÁC NHẬN`);
    console.log(`  ${C.w}⚡ Slot hiện tại: ${C.g}${heroData.selectedHeroMax}`);
    console.log(`  ${C.w}⚡ Slot sau hack: ${C.g}${heroData.selectedHeroMax + hackCount}`);
    console.log(`  ${C.w}🎰 Số lần: ${C.g}${hackCount}`);
    console.log(`  ${C.w}🔄 RUN_COUNT: ${C.y}${runCount} ${C.w}→ ${C.g}${runToSend}`);
    console.log(`  ${C.w}🔑 GICHAPO: ${C.y}${gichapo}`);
    console.log(`  ${C.y}══════════════════════════════════════════════════════════════════════${C.rs}`);
    
    const confirm = readline.question(`\n  ${C.r}❓ Xác nhận mở ${hackCount} slot? (y/n): ${C.w}`);
    if (confirm.toLowerCase() !== 'y') {
        console.log(`\n  ${C.g}✅ Đã hủy!${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để tiếp tục...${C.w}`);
        return;
    }
    
    console.log(`\n  ${C.y}🔥 Đang mở ${hackCount} slot...`);
    printSeparator();
    
    let successCount = 0, failCount = 0;
    let currentRunCount = runCount;
    let currentHeroData = heroData;
    
    for (let i = 1; i <= hackCount; i++) {
        if (i === 1) {
            console.log(`\n  ${C.y}⏳ Đợi 2 giây...${C.rs}`);
            await delay(2000);
        } else {
            await delay(1000);
        }
        
        process.stdout.write(`\n  ${C.c}[${i}/${hackCount}] ${C.w}Đang mở slot...`);
        
        const runToSend2 = currentRunCount - 1;
        
        try {
            const result = await expandHeroSlot(
                platform, uniq_id, host_id, gichapo,
                runToSend2, currentHeroData
            );
            
            if (result && result.RESULT === "OK") {
                successCount++;
                currentRunCount = runToSend2;
                if (result.VALUE && result.VALUE.selected_hero_max) {
                    currentHeroData.selectedHeroMax = parseInt(result.VALUE.selected_hero_max);
                }
                if (result.VALUE && result.VALUE.selected_hero) {
                    currentHeroData.selectedHero = result.VALUE.selected_hero;
                }
                if (result.VALUE && result.VALUE.bou_hero) {
                    currentHeroData.bouHero = result.VALUE.bou_hero;
                }
                console.log(` ${C.g}✅ THÀNH CÔNG!`);
                console.log(`  ${C.w}⚡ Slot hiện tại: ${C.y}${currentHeroData.selectedHeroMax}`);
            } else {
                failCount++;
                console.log(` ${C.r}❌ THẤT BẠI!`);
            }
        } catch(e) {
            failCount++;
            console.log(` ${C.r}❌ LỖI: ${e.message}`);
        }
    }
    
    printSeparator();
    console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}              📊  T Ổ N G   K Ế T                         ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╠══════════════════════════════════════════════════════════════════════╣${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.w}  🎰 Số lần mở    : ${C.g}${String(hackCount).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.w}  ✅ Thành công    : ${C.g}${String(successCount).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.w}  ❌ Thất bại      : ${C.r}${String(failCount).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.w}  🔄 RUN_COUNT cuối: ${C.y}${String(currentRunCount).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.w}  ⚡ Slot hiện tại : ${C.g}${String(currentHeroData.selectedHeroMax).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);
    
    console.log(`\n  ${C.bold}${C.y}══════════════════════════════════════════════════════════════════════`);
    console.log(`  ${C.bold}${C.m}🔥 Tool Mở Slot Hero - Code by Kaito ☠️${C.rs}`);
    console.log(`  ${C.bold}${C.y}══════════════════════════════════════════════════════════════════════${C.rs}`);
    
    readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để tiếp tục...${C.w}`);
}

main().catch(err => {
    console.error(`\n  ${C.r}❌ LỖI: ${err.message}${C.rs}`);
});
