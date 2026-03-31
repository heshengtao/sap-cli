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
// 动态读取最新配置
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
        ],
        // 【新增】：微信 ACP 模式下的双语默认提示词与清洗占位符
        noContent: "AI 没有返回内容",
        analyzeImage: "请分析这张图片的内容。",
        imageWithText: "[用户发了一张图片配文]: ",
        justImage: "[用户发送了一张图片]"
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
        ],
        // 【新增】：微信 ACP 模式下的双语默认提示词与清洗占位符
        noContent: "AI returned no content",
        analyzeImage: "Please analyze the content of this image.",
        imageWithText: "[User sent an image with text]: ",
        justImage: "[User sent an image]"
    }
};
// 根据 config.json 里的 lang 字段决定使用哪种语言
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

    // 全局存储微信的会话上下文
    const acpSessions = {};

    // 辅助函数：向微信发送异步文本消息
    async function sendNotifyToWechat(sessionId, textContent) {
        const notifyParams = {
            sessionId: sessionId,
            update: { 
                sessionUpdate: "agent_message_chunk", 
                content: { type: "text", text: textContent } 
            }
        };
        
        // 根据你的日志反馈，wechat-acp 可能只支持 session/update
        const method = "session/update"; 
        
        const notifyJson = JSON.stringify({ 
            jsonrpc: "2.0", 
            method: method, 
            params: notifyParams 
            // 注意：Notification 不带 id
        });
        
        logDebug(`SEND-NOTIFY: ${notifyJson}`);
        process.stdout.write(notifyJson + '\n');
    }

    rl.on('line', async (line) => {
        logDebug(`RECV: ${line}`);
        try {
            const req = JSON.parse(line);
            if (!req.method) return;

            const m = req.method;
            const p = req.params || {};

            if (m === 'initialize') {
                sendResp(req.id, { 
                    protocolVersion: 1,  // 注意：必须是数字 1，不能是字符串
                    agentCapabilities: {}, // 键名必须是 agentCapabilities
                    agentInfo: {           // 键名必须是 agentInfo
                        name: "sap-cli", 
                        version: "1.0.0" 
                    } 
                });
            }
            else if (m === 'session/new') {
                const sessionId = p.sessionId || `sap-session-${Date.now()}`;
                if (!acpSessions[sessionId]) acpSessions[sessionId] = [];
                sendResp(req.id, { sessionId: sessionId });
            } 
            else if (m === 'session/prompt') {
                const sessionId = p.sessionId || "sap-session-default";
                if (!acpSessions[sessionId]) acpSessions[sessionId] = [];

                let userText = "";       
                let openAiContent = [];  
                let hasImage = false;    

                if (Array.isArray(p.prompt)) {
                    for (const item of p.prompt) {
                        if (item.type === 'text' && item.text) {
                            userText += item.text;
                            openAiContent.push({ type: "text", text: item.text });
                        } else if (item.type === 'image') {
                            const base64Data = item.image_data || item.data || "";
                            if (base64Data) {
                                hasImage = true;
                                openAiContent.push({ 
                                    type: "image_url", 
                                    image_url: { url: `data:image/jpeg;base64,${base64Data}` } 
                                });
                            }
                        }
                    }
                } else {
                    userText = p.prompt || "";
                    openAiContent = userText; 
                }

                // 【多语言支持】：自动补全纯图片提示词
                if (hasImage && !userText.trim()) {
                    openAiContent.push({ type: "text", text: T.analyzeImage });
                }

                logDebug(`💬 收到微信输入 (提取文本): ${userText || '[Image]'}`);
                const lowerCmd = userText.trim().toLowerCase();

                if (lowerCmd === '/clear') {
                    acpSessions[sessionId] = [];
                    await sendNotifyToWechat(sessionId, T.reset);
                    return sendResp(req.id, { stopReason: "end_turn" });
                }
                if (lowerCmd === '/help') {
                    const helpText = `${T.helpTitle}:\n` + T.cmds.map(c => `${c.c}  -  ${c.d}`).join('\n');
                    await sendNotifyToWechat(sessionId, helpText);
                    return sendResp(req.id, { stopReason: "end_turn" });
                }
                if (lowerCmd === '/status') {
                    const rounds = Math.floor(acpSessions[sessionId].length / 2);
                    const statusText = `${T.statusTitle}:\nAPI: ${config.backendUrl}\nModel: ${options.model}\nContext: ${rounds} rounds`;
                    await sendNotifyToWechat(sessionId, statusText);
                    return sendResp(req.id, { stopReason: "end_turn" });
                }

                if (!userText && openAiContent.length === 0) {
                    return sendResp(req.id, { stopReason: "end_turn" });
                }

                acpSessions[sessionId].push({ role: 'user', content: openAiContent });

                if (acpSessions[sessionId].length > 20) {
                    acpSessions[sessionId] = acpSessions[sessionId].slice(-20);
                }

                const replyText = await fetchBackend(acpSessions[sessionId], false);
                logDebug(`🤖 AI 生成完毕: ${replyText.substring(0, 20)}...`);

                // 【多语言支持】：卸磨杀驴式的上下文图片清洗，换成指定语言的文本
                if (hasImage) {
                    const lastUserMsg = acpSessions[sessionId][acpSessions[sessionId].length - 1];
                    if (lastUserMsg && lastUserMsg.role === 'user') {
                        lastUserMsg.content = userText.trim() ? `${T.imageWithText}${userText}` : T.justImage;
                    }
                }

                // 【多语言支持】：防污染，检测多语言下的无内容错误
                if (replyText.includes(T.noContent) || replyText.includes("[Error]")) {
                    acpSessions[sessionId].pop(); 
                } else {
                    acpSessions[sessionId].push({ role: 'assistant', content: replyText });
                }

                await sendNotifyToWechat(sessionId, replyText);
                sendResp(req.id, { stopReason: "end_turn" });
            }
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
            // 【多语言支持】：在此处使用动态提取的语言占位符
            return data.choices?.[0]?.message?.content || T.noContent; 
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

    const printHelp = () => {
        console.log(chalk.yellow(`\n${T.helpTitle}:`));
        T.cmds.forEach(item => console.log(`  ${chalk.cyan(item.c.padEnd(10))} ${chalk.gray(item.d)}`));
        console.log(chalk.yellow(`\n⚙️ 启动参数 (运行 sap 时使用):`));
        T.params.forEach(item => console.log(`  ${chalk.cyan(item.p.padEnd(10))} ${chalk.gray(item.d)}`));
        console.log();
    };

    const printStatus = () => {
        console.log(chalk.blue(`\n${T.statusTitle}:`));
        console.log(`  ${chalk.gray("URL:")}   ${config.backendUrl}`);
        console.log(`  ${chalk.gray("Model:")} ${options.model}`);
        console.log(`  ${chalk.gray("Flags:")} ${options.think ? '🧠 Thinking ' : ''}${options.web ? '🌐 WebSearch ' : ''}${!options.think && !options.web ? 'Default' : ''}`);
        console.log(`  ${chalk.gray("Context:")} ${messages.length / 2} rounds\n`);
    };

    console.clear();
    console.log(chalk.bold.cyan(`\n${T.welcome}`));
    console.log(chalk.dim(`──────────────────────────────────────────`));
    console.log(`${chalk.gray("Backend:")} ${chalk.white(config.backendUrl)}`);
    console.log(`${chalk.gray("Model:")}   ${chalk.green(options.model)}`);
    if(options.think) console.log(chalk.magenta("✨ Thinking Mode Enabled"));
    if(options.web)   console.log(chalk.blue("🌐 Web Search Enabled"));
    console.log(chalk.dim(`──────────────────────────────────────────`));
    console.log(chalk.italic.yellow(T.info + "\n"));

    const ask = () => {
        rl.question(chalk.green.bold(T.you), async (input) => {
            const text = input.trim();
            const lowerText = text.toLowerCase();
            
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

            messages.push({ role: 'user', content: text });
            
            try {
                process.stdout.write(chalk.blue.bold(T.ai));
                const reply = await fetchBackend(messages, true);
                
                messages.push({ role: 'assistant', content: reply });
                console.log("\n");
            } catch (err) {
                console.log(chalk.red(err));
                messages.pop(); 
            }
            
            ask();
        });
    };
    
    ask();
}