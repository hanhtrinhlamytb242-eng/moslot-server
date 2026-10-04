// ============================================================
// MOSLOT TOOL - CLIENT
// Phiên bản: 2.0.0 (Logic đã chuyển lên server)
// Client chỉ hiển thị UI + gọi server
// ============================================================

const readline = require("readline-sync");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const os = require("os");

const C = {
    r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", b: "\x1b[34m",
    m: "\x1b[35m", c: "\x1b[36m", w: "\x1b[37m", rs: "\x1b[0m",
    bold: "\x1b[1m"
};

// ============================================================
// SERVER CONFIG
// ============================================================
const SERVER_URL = "https://moslot-server.onrender.com";  // ⚠️ ĐỔI LINK NÀY

// ============================================================
// HTTP HELPERS
// ============================================================
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
                timeout: 120000,
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
                timeout: 60000
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

// Lấy HWID (gửi server để check)
function getHWID() {
    try {
        const raw = os.hostname() + '_' + (os.cpus()[0]?.model || 'unk') + '_' + os.platform();
        return crypto.createHash('md5').update(raw).digest('hex').substring(0, 16);
    } catch { return 'unknown_hwid'; }
}

// ============================================================
// UI HELPERS
// ============================================================
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

// ============================================================
// MAIN
// ============================================================
async function main() {
    printBanner();
    printSeparator();

    // ===== 1. CHECK SERVER STATUS =====
    console.log(`\n  ${C.y}📡 Đang kết nối server...${C.rs}`);
    const status = await getServer('/api/status');
    if (!status.success || status.enabled === false) {
        console.log(`\n  ${C.r}⛔ KHÔNG THỂ SỬ DỤNG TOOL${C.rs}`);
        console.log(`  ${C.y}📢 Lý do: ${status.message || 'Không kết nối được server'}${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
        process.exit(0);
    }
    console.log(`  ${C.g}✅ Kết nối server thành công${C.rs}`);

    // ===== 2. CHỌN SERVER =====
    const serverMap = { "1": "AMO", "2": "ATV", "3": "LG", "4": "SS" };
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
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
        return;
    }
    console.log(`  ${C.g}✅ Platform: ${C.y}${platform}${C.rs}`);
    printSeparator();

    // ===== 3. NHẬP THÔNG TIN =====
    console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}              📝  N H Ậ P   T H Ô N G   T I N            ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);

    const uniqId = readline.question(`\n  ${C.r}🆔 UNIQ_ID: ${C.w}`).trim();
    if (!uniqId) {
        console.log(`\n  ${C.r}❌ UNIQ_ID không được để trống!${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
        return;
    }

    // ===== 4. NHẬP KEY =====
    console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}              🔑  X Á C   T H Ự C   K E Y                ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);

    const licenseKey = readline.question(`\n  ${C.y}🔑 Nhập KEY để sử dụng tool: ${C.w}`).trim();
    if (!licenseKey) {
        console.log(`\n  ${C.r}❌ Bạn chưa nhập KEY!${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
        process.exit(0);
    }

    // ===== 5. NHẬP HOST_ID =====
    let hostId;
    if (platform === 'AMO') {
        hostId = readline.question(`  ${C.y}📧 HOST_ID (Enter = gibongtran@gmail.com): ${C.w}`).trim() || "gibongtran@gmail.com";
    } else {
        console.log(`\n  ${C.bold}${C.y}🔗 CHỌN KIỂU HOST${C.rs}`);
        console.log(`  ${C.w}[1] ${C.m}Host liên kết ([연동] + ID AMO)${C.rs}`);
        console.log(`  ${C.w}[2] ${C.y}Host dạng Gmail${C.rs}`);
        const hostType = readline.question(`  ${C.c}👉 Chọn (1/2): ${C.w}`);
        if (hostType === '1') {
            const linkedId = readline.question(`  ${C.y}🔗 Nhập ID AMO liên kết: ${C.w}`).trim();
            if (!linkedId) {
                console.log(`\n  ${C.r}❌ ID không được để trống!${C.rs}`);
                return;
            }
            hostId = `[연동]${linkedId},[비번]undefined`;
        } else {
            hostId = readline.question(`  ${C.y}📧 HOST_ID (Enter = gibongtran@gmail.com): ${C.w}`).trim() || "gibongtran@gmail.com";
        }
    }

    // ===== 6. GỌI SERVER: START-TOOL =====
    console.log(`\n  ${C.y}📡 Đang lấy dữ liệu tài khoản từ server...${C.rs}`);

    const startResult = await callServer('/api/start-tool', {
        key: licenseKey,
        uniqId: uniqId,
        platform: platform,
        hostId: hostId,
        deviceId: getHWID()
    });

    if (!startResult.success) {
        console.log(`\n  ${C.r}❌ KHÔNG THỂ BẮT ĐẦU${C.rs}`);
        console.log(`  ${C.y}📢 Lý do: ${startResult.message || 'Lỗi không xác định'}${C.rs}`);
        if (startResult.code) console.log(`  ${C.m}🔍 Code: ${startResult.code}${C.rs}`);
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
        process.exit(0);
    }

    const sessionToken = startResult.token;
    const info = startResult.data;

    console.log(`  ${C.g}✅ ${startResult.message}${C.rs}`);
    printSeparator();

    // ===== 7. HIỂN THỊ INFO =====
    console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}           📊  T H Ô N G   T I N   H E R O              ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╠══════════════════════════════════════════════════════════════════════╣${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.w}  👤 USER NAME : ${C.g}${(info.userName || '???').padEnd(40).substring(0,40)}${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.w}  🔄 RUN_COUNT : ${C.y}${String(info.runCount || 0).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.w}  ⚡ Slot hiện tại: ${C.g}${String(info.selectedHeroMax || 1).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.w}  🎁 Còn lại    : ${C.y}${String(info.remaining || 0).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);

    printSeparator();

    // ===== 8. HỎI SỐ LẦN MỞ =====
    console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}           🔄  S Ố   L Ầ N   M Ở   S L O T              ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);
    console.log(`  ${C.w}💡 Mỗi lần mở slot sẽ giảm 1 lượt của KEY${C.rs}`);
    console.log(`  ${C.w}💡 Slot hiện tại: ${C.y}${info.selectedHeroMax || 1}${C.rs}`);
    console.log(`  ${C.w}💡 Còn lại: ${C.y}${info.remaining}${C.rs}`);

    const maxOpen = Math.min(info.runCount || 1, info.remaining || 1);
    const hackCount = parseInt(readline.question(`\n  ${C.c}👉 Số lần mở slot (1-${maxOpen}): ${C.w}`));
    if (isNaN(hackCount) || hackCount < 1 || hackCount > maxOpen) {
        console.log(`\n  ${C.r}❌ Số lần không hợp lệ! Phải từ 1 đến ${maxOpen}${C.rs}`);
        await callServer('/api/end-tool', { token: sessionToken });
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
        return;
    }

    // ===== 9. XÁC NHẬN =====
    console.log(`\n  ${C.y}📦 XÁC NHẬN`);
    console.log(`  ${C.w}⚡ Slot hiện tại: ${C.g}${info.selectedHeroMax}`);
    console.log(`  ${C.w}⚡ Slot sau hack: ${C.g}${(info.selectedHeroMax || 1) + hackCount}`);
    console.log(`  ${C.w}🎰 Số lần: ${C.g}${hackCount}`);
    console.log(`  ${C.w}🎁 Lượt còn lại sau: ${C.y}${info.remaining - hackCount}`);
    console.log(`  ${C.y}══════════════════════════════════════════════════════════════════════${C.rs}`);

    const confirm = readline.question(`\n  ${C.r}❓ Xác nhận mở ${hackCount} slot? (y/n): ${C.w}`);
    if (confirm.toLowerCase() !== 'y') {
        console.log(`\n  ${C.g}✅ Đã hủy!${C.rs}`);
        await callServer('/api/end-tool', { token: sessionToken });
        readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
        return;
    }

    // ===== 10. GỌI SERVER: OPEN-SLOT =====
    console.log(`\n  ${C.y}🔥 Đang mở ${hackCount} slot (xử lý trên server)...`);
    console.log(`  ${C.w}⏳ Vui lòng đợi, tool có thể mất 1-2 phút...${C.rs}`);
    printSeparator();

    const openResult = await callServer('/api/open-slot', {
        token: sessionToken,
        count: hackCount
    });

    // ===== 11. HIỂN THỊ KẾT QUẢ =====
    if (!openResult.success) {
        console.log(`\n  ${C.r}❌ LỖI: ${openResult.message}${C.rs}`);
        if (openResult.code) console.log(`  ${C.m}🔍 Code: ${openResult.code}${C.rs}`);
    } else {
        const r = openResult.data;
        console.log(`\n  ${C.g}✅ ${openResult.message}${C.rs}`);
        console.log(`  ${C.w}📊 Chi tiết:${C.rs}`);
        console.log(`  ${C.w}   • Tổng: ${C.y}${r.total}${C.rs}`);
        console.log(`  ${C.w}   • Thành công: ${C.g}${r.success}${C.rs}`);
        console.log(`  ${C.w}   • Thất bại: ${C.r}${r.failed}${C.rs}`);
        console.log(`  ${C.w}   • Slot hiện tại: ${C.y}${r.slotNow}${C.rs}`);
        console.log(`  ${C.w}   • Lượt còn lại: ${C.y}${r.remaining}${C.rs}`);
    }

    printSeparator();
    console.log(`\n  ${C.bold}${C.c}╔══════════════════════════════════════════════════════════════════════╗${C.rs}`);
    console.log(`  ${C.bold}${C.c}║${C.bold}${C.w}              📊  T Ổ N G   K Ế T                         ${C.bold}${C.c}║${C.rs}`);
    console.log(`  ${C.bold}${C.c}╠══════════════════════════════════════════════════════════════════════╣${C.rs}`);
    if (openResult.success) {
        const r = openResult.data;
        console.log(`  ${C.bold}${C.c}║${C.w}  🎰 Số lần mở    : ${C.g}${String(hackCount).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
        console.log(`  ${C.bold}${C.c}║${C.w}  ✅ Thành công    : ${C.g}${String(r.success).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
        console.log(`  ${C.bold}${C.c}║${C.w}  ❌ Thất bại      : ${C.r}${String(r.failed).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
        console.log(`  ${C.bold}${C.c}║${C.w}  ⚡ Slot hiện tại : ${C.g}${String(r.slotNow).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
        console.log(`  ${C.bold}${C.c}║${C.w}  🎁 Lượt còn lại  : ${C.y}${String(r.remaining).padEnd(40)}${C.bold}${C.c}║${C.rs}`);
    } else {
        console.log(`  ${C.bold}${C.c}║${C.w}  ❌ ${openResult.message.padEnd(68).substring(0,68)}${C.bold}${C.c}║${C.rs}`);
    }
    console.log(`  ${C.bold}${C.c}╚══════════════════════════════════════════════════════════════════════╝${C.rs}`);

    // ===== 12. KẾT THÚC SESSION =====
    await callServer('/api/end-tool', { token: sessionToken });

    console.log(`\n  ${C.bold}${C.y}══════════════════════════════════════════════════════════════════════`);
    console.log(`  ${C.bold}${C.m}🔥 Tool Mở Slot Hero - Code by Kaito ☠️${C.rs}`);
    console.log(`  ${C.bold}${C.y}══════════════════════════════════════════════════════════════════════${C.rs}`);

    readline.question(`\n  ${C.bold}${C.y}👉 Nhấn Enter để thoát...${C.w}`);
}

main().catch(err => {
    console.error(`\n  ${C.r}❌ LỖI: ${err.message}${C.rs}`);
});
