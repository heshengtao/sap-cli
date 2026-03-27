#!/usr/bin/env node
const readline = require('readline');
const { program } = require('commander');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. 初始化配置与多语言
// ==========================================
const configPath = path.join(__dirname, 'config.json');
let config = { backendUrl: 'http://127.0.0.1:3456', lang: 'zh' };
if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
}

const isInteractive = process.stdout.isTTY;

const i18n = {
    zh: { 
        welcome: "🚀 SAP CLI 控制台", info: "输入 /help 查看指令", you: "你: ", ai: "SAP: ", bye: "再见! 👋", 
        reset: "🧹 会话已重置 (上下文已清空)", statusTitle: "📊 当前连接状态", helpTitle: "💡 可用指令",
        cmds: [
            { c: "/help", d: "显示此帮助菜单" }, { c: "/clear", d: "清空当前对话上下文 (开启新话题)" },
            { c: "/status", d: "查看当前后端地址、模型及上下文轮数" }, { c: "/exit", d: "退出程序" }
        ],
        params: [
            { p: "-m <name>", d: "指定模型/Agent (默认: super-model)" },
            { p: "-t", d: "开启深度思考 (Thinking Mode)" },
            { p: "-w", d: "开启联网搜索 (Web Search)" }
        ]
    },
    en: { 
        welcome: "🚀 SAP CLI Console", info: "Type /help for commands", you: "You: ", ai: "SAP: ", bye: "Bye! 👋", 
        reset: "🧹 Session reset (Context cleared)", statusTitle: "📊 Session Status", helpTitle: "💡 Commands",
        cmds: [
            { c: "/help", d: "Show this help menu" }, { c: "/clear", d: "Clear context (Start new topic)" },
            { c: "/status", d: "Show model, URL and context rounds" }, { c: "/exit", d: "Exit program" }
        ],
        params: [
            { p: "-m <name>", d: "Specify Model/Agent (Default: super-model)" },
            { p: "-t", d: "Enable Thinking Mode" },
            { p: "-w", d: "Enable Web Search" }
        ]
    }
};
const T = i18n[config.lang] || i18n.en;

program
  .option('-m, --model <type>', 'Model Name', 'super-model')
  .option('-t, --think', 'Thinking Mode', false)
  .option('-w, --web', 'Web Search', false)
  .parse(process.argv);
const options = program.opts();

// ==========================================
// 模式 A：ACP 协议模式 (给 wechat-acp 使用，完美破解版)
// ==========================================
if (!isInteractive) {
    const logFile = path.join(__dirname, 'acp-debug.log');
    function logDebug(msg) { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); }
    logDebug("\n=== SAP Agent 启动 (后台接管模式) ===");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    
    rl.on('line', async (line) => {
        logDebug(`RECV: ${line}`);
        try {
            const req = JSON.parse(line);
            if (!req.method) return;

            const m = req.method;
            const p = req.params || {};

            // 1. 初始化握手
            if (m === 'initialize') {
                sendResp(req.id, { protocolVersion: "1.0", capabilities: {}, serverInfo: { name: "sap-cli", version: "1.0.0" } });
            } 
            // 2. 创建会话
            else if (m === 'session/new') {
                sendResp(req.id, { sessionId: "sap-session-001" });
            } 
            // 3. 处理核心聊天请求
            else if (m === 'session/prompt') {
                const sessionId = p.sessionId || "sap-session-001";
                let userText = Array.isArray(p.prompt) ? p.prompt.map(item => item.text || '').join('\n') : (p.prompt || "你好");

                logDebug(`💬 收到微信输入: ${userText}`);
                
                // 请求后端AI
                const replyText = await fetchBackend([{ role: 'user', content: userText }], false);
                
                logDebug(`🤖 AI 生成完毕: ${replyText.substring(0, 20)}...`);

                // 【致胜绝招：发送异步事件通知将文本塞进微信插件的 Buffer 里】
                const notifyParams = {
                    sessionId: sessionId,
                    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: replyText } }
                };

                // 同时尝试三种最可能的协议通知方法，以防 SDK 演进
                const methodsToTry = ["notifications/session/update", "notifications/sessionUpdate", "session/update"];
                for (const method of methodsToTry) {
                    const notifyJson = JSON.stringify({ jsonrpc: "2.0", method: method, params: notifyParams });
                    logDebug(`SEND-NOTIFY: ${notifyJson}`);
                    process.stdout.write(notifyJson + '\n');
                }

                // 微延迟确保通知包先被微信插件处理
                await new Promise(r => setTimeout(r, 100));

                // 告诉微信插件这一轮回答结束
                sendResp(req.id, { stopReason: "completed" });
            } 
            // 4. 未知指令兜底放行
            else {
                if (req.id !== undefined) sendResp(req.id, {});
            }
        } catch (e) {
            logDebug(`ERR: ${e.message}`);
        }
    });

    function sendResp(id, result) {
        if (id !== undefined) {
            const msgStr = JSON.stringify({ jsonrpc: "2.0", id, result });
            logDebug(`SEND: ${msgStr}`);
            process.stdout.write(msgStr + '\n');
        }
    }
} 

// ==========================================
// 模式 B：交互式终端模式 (人类直接打开终端使用)
// ==========================================
else {
    runInteractiveMode();
}

/**
 * 通用请求后端函数 (支持流式和非流式)
 */
async function fetchBackend(msgs, isStream) {
    try {
        const response = await fetch(`${config.backendUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: options.model, messages: msgs, stream: isStream,
                enable_thinking: options.think, enable_web_search: options.web
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        if (!isStream) {
            const data = await response.json();
            return data.choices?.[0]?.message?.content || "AI 没有返回内容";
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunks = decoder.decode(value).split('\n');
            for (const chunk of chunks) {
                if (chunk.startsWith('data: ') && !chunk.includes('[DONE]')) {
                    try {
                        const content = JSON.parse(chunk.slice(6)).choices[0]?.delta?.content || "";
                        process.stdout.write(content);
                        fullText += content;
                    } catch (e) {}
                }
            }
        }
        return fullText;
    } catch (e) {
        return `\n[Error] ${e.message}`;
    }
}

/**
 * 带有彩色看板、指令和上下文管理的人类终端模式
 */
function runInteractiveMode() {
    let messages = [];
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    // 帮助菜单打印
    const printHelp = () => {
        console.log(chalk.yellow(`\n${T.helpTitle}:`));
        T.cmds.forEach(item => console.log(`  ${chalk.cyan(item.c.padEnd(10))} ${chalk.gray(item.d)}`));
        console.log(chalk.yellow(`\n⚙️ 启动参数 (运行 sap 时使用):`));
        T.params.forEach(item => console.log(`  ${chalk.cyan(item.p.padEnd(10))} ${chalk.gray(item.d)}`));
        console.log();
    };

    // 状态看板打印
    const printStatus = () => {
        console.log(chalk.blue(`\n${T.statusTitle}:`));
        console.log(`  ${chalk.gray("URL:")}   ${config.backendUrl}`);
        console.log(`  ${chalk.gray("Model:")} ${options.model}`);
        console.log(`  ${chalk.gray("Flags:")} ${options.think ? '🧠 深度思考 ' : ''}${options.web ? '🌐 联网搜索 ' : ''}${!options.think && !options.web ? '默认普通' : ''}`);
        console.log(`  ${chalk.gray("Context:")} 当前已记忆 ${messages.length / 2} 轮对话\n`);
    };

    // 启动欢迎屏幕
    console.clear();
    console.log(chalk.bold.cyan(`\n${T.welcome}`));
    console.log(chalk.dim(`──────────────────────────────────────────`));
    console.log(`${chalk.gray("Backend:")} ${chalk.white(config.backendUrl)}`);
    console.log(`${chalk.gray("Model:")}   ${chalk.green(options.model)}`);
    if(options.think) console.log(chalk.magenta("✨ 深度思考 (Thinking Mode) 已开启"));
    if(options.web)   console.log(chalk.blue("🌐 联网搜索 (Web Search) 已开启"));
    console.log(chalk.dim(`──────────────────────────────────────────`));
    console.log(chalk.italic.yellow(T.info + "\n"));

    // 核心对话循环
    const ask = () => {
        rl.question(chalk.green.bold(T.you), async (input) => {
            const text = input.trim();
            const lowerText = text.toLowerCase();
            
            // --- 路由：处理内部指令 ---
            if (lowerText === 'exit' || lowerText === '/exit') {
                console.log(chalk.yellow(T.bye));
                process.exit();
            }
            if (lowerText === '/help') { printHelp(); return ask(); }
            if (lowerText === '/status') { printStatus(); return ask(); }
            if (lowerText === '/clear') {
                messages = [];
                console.log(chalk.magenta(T.reset + "\n"));
                return ask();
            }
            if (!text) return ask();

            // --- 路由：处理正常对话 ---
            messages.push({ role: 'user', content: text });
            
            try {
                process.stdout.write(chalk.blue.bold(T.ai));
                // 开启终端特供的“流式打字机”输出
                const reply = await fetchBackend(messages, true);
                
                // 将 AI 的回复存入数组，形成长上下文记忆
                messages.push({ role: 'assistant', content: reply });
                console.log("\n");
            } catch (err) {
                console.log(chalk.red(err));
                messages.pop(); // 失败时弹出用户刚才输入的话，防污染
            }
            
            ask();
        });
    };
    
    // 开始运行
    ask();
}