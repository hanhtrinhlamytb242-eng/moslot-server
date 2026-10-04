// ============================================================
// GAME API - Logic gọi server game
// File này CHỈ chạy trên server của bạn, KHÔNG gửi cho client
// ============================================================

const crypto = require('crypto');
const http = require('http');

// ===== AES KEYS (BÍ MẬT — không để lộ) =====
const K_AES2 = Buffer.from("gksekfidjrqjfwk1", "utf8");
const I_AES2 = Buffer.from("towerdefense_amo", "utf8");

// ===== MÃ HOÁ / GIẢI MÃ AES =====
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

// ===== HTTP POST TỚI SERVER GAME =====
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
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        req.on('error', e => reject(e));
        req.write(postData);
        req.end();
    });
}

// ===== TÌM GICHAPO TRONG DATA =====
function findGichapo(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.gichapo && typeof obj.gichapo === 'string' && obj.gichapo.length >= 1) return obj.gichapo;
    for (let k in obj) { let f = findGichapo(obj[k]); if (f) return f; }
    return null;
}

// ===== LẤY DATA TÀI KHOẢN GAME =====
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

// ===== EXPORT =====
module.exports = {
    fetchUserData,
    expandHeroSlot
};
