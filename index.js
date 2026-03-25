const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const EXT_DIR = __dirname;
const HTML_FILE = path.join(EXT_DIR, 'index.html');
const configPath = path.join(EXT_DIR, 'config.json');

// 初始化配置
if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ 
        backendUrl: 'http://127.0.0.1:3456', 
        cliEnabled: false,
        lang: 'zh' 
    }));
}

// 辅助函数：执行 Shell 命令
function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { cwd: EXT_DIR }, (error, stdout, stderr) => {
            if (error) reject(error.message || stderr);
            else resolve(stdout);
        });
    });
}

/* ---------- 被 FastAPI 唤起 (带端口参数) ---------- */
if (process.argv[2]) {
    const PORT = parseInt(process.argv[2], 10);
    const express = require('express');
    const cors = require('cors');
    const app = express();

    app.use(cors());
    app.use(express.json());

    // ================= API 路由 =================
    app.get('/api/status', (req, res) => {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(config);
    });

    app.post('/api/settings', (req, res) => {
        const { backendUrl, lang } = req.body;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (backendUrl) config.backendUrl = backendUrl;
        if (lang) config.lang = lang;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        res.json({ success: true, config });
    });

    app.post('/api/toggle-cli', async (req, res) => {
        const { enable } = req.body;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        try {
            if (enable) {
                await runCommand('npm link');
                config.cliEnabled = true;
            } else {
                await runCommand('npm rm -g sap-cli');
                config.cliEnabled = false;
            }
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            res.json({ success: true, enabled: config.cliEnabled, message: enable ? 'CLI 已全局启用 (命令: sap)' : 'CLI 已卸载' });
        } catch (error) {
            res.status(500).json({ success: false, message: `操作失败: ${error}` });
        }
    });

    // ================= 页面路由 (核心修复区) =================
    
    // 1. 【终极拦截】如果你的前端 iframe 傻傻地请求了 /index.js，绝对不给源码，强行塞给它网页！
    app.get('/index.js', (req, res) => res.sendFile(HTML_FILE));
    
    // 2. 正常情况请求根目录，给网页
    app.get('/', (req, res) => res.sendFile(HTML_FILE));
    
    // 3. 静态资源托管（保留这个是为了如果你以后加了 css 也能正常访问）
    app.use(express.static(EXT_DIR));

    // 4. 健康检查（对齐你的系统标准）
    app.get('/health', (_, res) => res.json({ status: 'ok' }));

    // =========================================================

    app.listen(PORT, '127.0.0.1', () => {
        console.log(`[sap-cli] Node service ready at http://127.0.0.1:${PORT}`);
    });
}