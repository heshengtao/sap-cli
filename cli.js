#!/usr/bin/env node
const readline = require('readline');
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const blessed = require('blessed');

// ==========================================
// 1. 配置与多语言（保持不变）
// ==========================================
const configPath = path.join(__dirname, 'config.json');
let config = { backendUrl: 'http://127.0.0.1:3456', lang: 'zh' };
if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
}

const isInteractive = process.stdout.isTTY;

const i18n = {
    zh: {
        welcome: '🚀 SAP TUI 控制台',
        info: 'Enter 发送，↑/↓ 历史，Ctrl+C 退出',
        you: '你: ',
        ai: 'SAP: ',
        bye: '再见! 👋',
        reset: '🧹 会话已重置',
        statusTitle: '📊 连接状态',
        helpTitle: '💡 快捷命令',
        cmds: [
            { c: '/help', d: '显示帮助' },
            { c: '/clear', d: '清空上下文' },
            { c: '/status', d: '查看状态' },
            { c: '/exit', d: '退出程序' }
        ],
        params: [
            { p: '-m <name>', d: '模型/Agent' },
            { p: '-t', d: '深度思考' },
            { p: '-w', d: '联网搜索' }
        ],
        noContent: 'AI 无返回内容',
        analyzeImage: '请分析这张图片的内容。',
        imageWithText: '[图片配文]: ',
        justImage: '[用户发送了一张图片]',
        statusLine: '后端: {url} | 模型: {model} | 思考: {think} 联网: {web}',
        thinking: '🧠 深度思考',
        toolCall: '🔧 工具调用',
        toolResult: '✅ 工具结果',
        error: '❌ 错误',
        approval: '🛡️ 审批请求',
        denying: '❌ 已拒绝',
        executing: '⚙️ 执行中'
    },
    en: {
        welcome: '🚀 SAP TUI Console',
        info: 'Enter to send, ↑/↓ history, Ctrl+C to quit',
        you: 'You: ',
        ai: 'SAP: ',
        bye: 'Bye! 👋',
        reset: '🧹 Session reset',
        statusTitle: '📊 Session Status',
        helpTitle: '💡 Commands',
        cmds: [
            { c: '/help', d: 'Show help' },
            { c: '/clear', d: 'Clear context' },
            { c: '/status', d: 'Show status' },
            { c: '/exit', d: 'Exit program' }
        ],
        params: [
            { p: '-m <name>', d: 'Model/Agent' },
            { p: '-t', d: 'Thinking Mode' },
            { p: '-w', d: 'Web Search' }
        ],
        noContent: 'AI returned no content',
        analyzeImage: 'Please analyze the content of this image.',
        imageWithText: '[Image with text]: ',
        justImage: '[User sent an image]',
        statusLine: 'Backend: {url} | Model: {model} | Think: {think} Web: {web}',
        thinking: '🧠 Thinking',
        toolCall: '🔧 Tool Call',
        toolResult: '✅ Tool Result',
        error: '❌ Error',
        approval: '🛡️ Approval',
        denying: '❌ Denied',
        executing: '⚙️ Executing'
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
// 模式 A：ACP 协议模式（完全保持原样）
// ==========================================
if (!isInteractive) {
    const logFile = path.join(__dirname, 'acp-debug.log');
    function logDebug(msg) { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); }
    logDebug('\n=== SAP Agent 启动 (后台接管模式) ===');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    const acpSessions = {};

    async function sendNotifyToWechat(sessionId, textContent) {
        const notifyParams = {
            sessionId: sessionId,
            update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: textContent }
            }
        };
        const method = 'session/update';
        const notifyJson = JSON.stringify({
            jsonrpc: '2.0',
            method: method,
            params: notifyParams
        });
        logDebug(`SEND-NOTIFY: ${notifyJson}`);
        process.stdout.write(notifyJson + '\n');
    }

    // 此处保留原 ACP 逻辑完整代码（因篇幅省略，实际替换时请粘贴原始 cli.js 中 ACP 部分）
    // ...（请务必复制原文件中的 ACP 处理部分，不能省略）

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
                if (!acpSessions[sessionId]) acpSessions[sessionId] =[];

                let userText = "";       
                let openAiContent =[];  
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

                logDebug(`💬 收到微信/Zed输入: ${userText || '[Image]'}`);
                const lowerCmd = userText.trim().toLowerCase();

                // 处理内置指令 (注意这里全都改成了 end_turn)
                if (lowerCmd === '/clear') {
                    acpSessions[sessionId] =[];
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

                // 将用户输入加入上下文
                acpSessions[sessionId].push({ role: 'user', content: openAiContent });

                // 限制上下文最大轮数
                if (acpSessions[sessionId].length > 20) {
                    acpSessions[sessionId] = acpSessions[sessionId].slice(-20);
                }

                logDebug(`🤖 开始请求 AI，准备流式返回...`);

                // ==========================================
                // 流式返回与换行截断逻辑 (Buffer)
                // ==========================================
                let streamBuffer = "";

                const handleStreamChunk = async (content) => {
                    streamBuffer += content;
                    
                    // 只要缓冲区里有回车符 \n，就截断发送
                    // (提示: 如果觉得按行发送太频繁，可以把这里的 '\n' 改成 '\n\n' 按段落发送)
                    if (streamBuffer.includes('\n')) {
                        const lastNewlineIndex = streamBuffer.lastIndexOf('\n');
                        // 截取到最后一个回车符（包含回车符）
                        const chunkToSend = streamBuffer.substring(0, lastNewlineIndex + 1);
                        // 剩下的无回车文本留到下一次
                        streamBuffer = streamBuffer.substring(lastNewlineIndex + 1);
                        
                        // 防止发送空气泡
                        if (chunkToSend.trim()) {
                            await sendNotifyToWechat(sessionId, chunkToSend);
                        }
                    }
                };

                // 调用 fetchBackend，开启流式 (true)，并传入我们刚写好的回调函数
                const replyText = await fetchBackend(acpSessions[sessionId], true, handleStreamChunk);

                // AI 生成结束后，把 buffer 里最后没有回车符的剩余文本发出去
                if (streamBuffer.trim().length > 0) {
                    await sendNotifyToWechat(sessionId, streamBuffer);
                }

                logDebug(`🤖 AI 生成完毕: ${replyText.substring(0, 20)}...`);

                // ==========================================
                // 上下文清理与历史记录保存
                // ==========================================
                // 卸磨杀驴式的上下文图片清洗，换成指定语言的文本
                if (hasImage) {
                    const lastUserMsg = acpSessions[sessionId][acpSessions[sessionId].length - 1];
                    if (lastUserMsg && lastUserMsg.role === 'user') {
                        lastUserMsg.content = userText.trim() ? `${T.imageWithText}${userText}` : T.justImage;
                    }
                }

                // 防污染，检测多语言下的无内容错误
                if (replyText.includes(T.noContent) || replyText.includes("[Error]")) {
                    acpSessions[sessionId].pop(); 
                } else {
                    acpSessions[sessionId].push({ role: 'assistant', content: replyText });
                }

                // 最终必须返回 end_turn，宣告这个对话轮次正式结束，这样 Zed 就不会报错了
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
// 模式 B：TUI 终端模式（全新实现）
// ==========================================
else {
    runTuiMode();
}

// ==========================================
// TUI 主函数
// ==========================================
function runTuiMode() {
    // ---------- 状态变量 ----------
    let messages = [];            // { role, blocks: [{type, content, name, id, arguments}] }
    let isStreaming = false;
    let streamBlocks = [];       // 当前正在生成的块数组
    let streamController = null; // 用于中断生成
    let inputHistory = [];
    let historyIndex = -1;

    // ---------- 工具函数 ----------
    function escapeBlessed(text) {
        return String(text).replace(/\{/g, '{').replace(/\}/g, '}');
    }

    function buildStatusLine() {
        return T.statusLine
            .replace('{url}', config.backendUrl)
            .replace('{model}', options.model)
            .replace('{think}', options.think ? '🧠开' : '关')
            .replace('{web}', options.web ? '🌐开' : '关');
    }

    // 将消息数组和流式块渲染为带标签的字符串
    function renderMessages() {
        const lines = [];
        for (const msg of messages) {
            if (msg.role === 'user') {
                lines.push(`{green-fg}${T.you}{/green-fg}${escapeBlessed(msg.content)}`);
            } else if (msg.role === 'assistant') {
                if (msg.blocks) {
                    for (const block of msg.blocks) {
                        appendBlockLines(lines, block);
                    }
                } else {
                    lines.push(`{cyan-fg}${T.ai}{/cyan-fg}${escapeBlessed(msg.content || '')}`);
                }
            }
            lines.push(''); // 消息间空行
        }

        // 正在流式生成的回复
        if (isStreaming && streamBlocks.length > 0) {
            lines.push(`{cyan-fg}${T.ai}{/cyan-fg}`);
            for (const block of streamBlocks) {
                appendBlockLines(lines, block);
            }
        }
        return lines.join('\n');
    }

    function appendBlockLines(lines, block) {
        const esc = escapeBlessed;
        switch (block.type) {
            case 'text':
                lines.push(esc(block.content || ''));
                break;
            case 'reasoning':
                lines.push(`{gray-fg}${T.thinking}: ${esc(block.content || '')}{/gray-fg}`);
                break;
            case 'tool_call':
                lines.push(`{yellow-fg}${T.toolCall}: ${esc(block.name || '')}{/yellow-fg}`);
                if (block.arguments) {
                    lines.push(`{yellow-fg}${esc(block.arguments)}{/yellow-fg}`);
                }
                break;
            case 'tool_result':
                lines.push(`{yellow-fg}${T.toolResult}: ${esc(block.name || '')}{/yellow-fg}`);
                if (block.content) {
                    const contentLines = String(block.content).split('\n');
                    for (const l of contentLines) {
                        lines.push(`{yellow-fg}${esc(l)}{/yellow-fg}`);
                    }
                }
                break;
            case 'error':
                lines.push(`{red-fg}${T.error}: ${esc(block.content || '')}{/red-fg}`);
                break;
            case 'approval':
                lines.push(`{magenta-fg}${T.approval}: ${esc(block.name || '')}{/magenta-fg}`);
                if (block.content) {
                    lines.push(`{magenta-fg}${esc(block.content)}{/magenta-fg}`);
                }
                break;
            default:
                lines.push(esc(block.content || ''));
        }
    }

    // ---------- 流式请求后端 ----------
    async function tuiStreamResponse(msgs, callbacks) {
        streamController = new AbortController();
        let response;
        try {
            response = await fetch(`${config.backendUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: options.model,
                    messages: msgs,
                    stream: true,
                    enable_thinking: options.think,
                    enable_web_search: options.web
                }),
                signal: streamController.signal
            });
        } catch (err) {
            callbacks.onError(`网络错误: ${err.message}`);
            return;
        }

        if (!response.ok) {
            callbacks.onError(`HTTP ${response.status}`);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            let done, value;
            try {
                ({ done, value } = await reader.read());
            } catch (err) {
                if (err.name === 'AbortError') break;
                callbacks.onError('读取流失败');
                break;
            }
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n');
            buffer = parts.pop();

            for (let line of parts) {
                line = line.trim();
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const obj = JSON.parse(data);
                    const delta = obj.choices?.[0]?.delta;
                    if (!delta) continue;

                    if (delta.content) {
                        callbacks.onText(delta.content);
                    }
                    if (delta.reasoning_content) {
                        callbacks.onReasoning(delta.reasoning_content);
                    }
                    if (delta.tool_progress) {
                        const prog = delta.tool_progress;
                        callbacks.onToolProgress({
                            id: prog.tool_call_id || prog.id,
                            name: prog.name,
                            arguments: prog.arguments || ''
                        });
                    }
                    if (delta.tool_content) {
                        const tool = delta.tool_content;
                        callbacks.onToolContent({
                            type: tool.type,
                            title: tool.title,
                            content: tool.content,
                            tool_call_id: delta.tool_call_id || delta.async_tool_id
                        });
                    }
                } catch (e) { /* 忽略单行解析错误 */ }
            }
        }
    }

    // ---------- 节流重绘 ----------
    let throttleTimer = null;
    function scheduleRedraw() {
        if (throttleTimer) return;
        throttleTimer = setTimeout(() => {
            throttleTimer = null;
            const content = renderMessages();
            chatBox.setContent(content);
            chatBox.setScrollPerc(100);
            screen.render();
        }, 30);
    }

    // ---------- 处理用户输入 ----------
    async function handleInput(text) {
        const trimmed = text.trim();
        if (!trimmed) return;

        // 如果正在流式生成，中断它（按 Enter 再次发送前自动停止）
        if (isStreaming && streamController) {
            streamController.abort();
            isStreaming = false;
            streamBlocks = [];
            scheduleRedraw();
            return;
        }

        // 保存历史
        inputHistory.push(trimmed);
        historyIndex = inputHistory.length;

        // 本地命令
        const lower = trimmed.toLowerCase();
        if (lower === '/exit') {
            messages.push({ role: 'system', content: T.bye });
            scheduleRedraw();
            setTimeout(() => process.exit(0), 500);
            return;
        }
        if (lower === '/help') {
            let helpText = `{bold}${T.helpTitle}:{/bold}\n`;
            T.cmds.forEach(c => helpText += `  {cyan-fg}${c.c}{/cyan-fg} - ${c.d}\n`);
            helpText += `\n{bold}启动参数:{/bold}\n`;
            T.params.forEach(p => helpText += `  {cyan-fg}${p.p}{/cyan-fg} - ${p.d}\n`);
            messages.push({ role: 'system', content: helpText });
            scheduleRedraw();
            return;
        }
        if (lower === '/clear') {
            messages = [];
            streamBlocks = [];
            scheduleRedraw();
            return;
        }
        if (lower === '/status') {
            messages.push({ role: 'system', content: buildStatusLine() });
            scheduleRedraw();
            return;
        }

        // 正常对话
        messages.push({ role: 'user', content: trimmed, blocks: null });
        scheduleRedraw();

        // 构建发给 API 的消息格式（与之前相同）
        const apiMessages = messages.map(msg => {
            if (msg.role === 'user') return { role: 'user', content: msg.content };
            if (msg.role === 'assistant') {
                // 将 blocks 转为 OpenAI 格式的 content 数组
                let contentArray = [];
                if (msg.blocks) {
                    for (const b of msg.blocks) {
                        if (b.type === 'text') {
                            contentArray.push({ type: 'text', text: b.content });
                        } else if (b.type === 'tool_call') {
                            // 这里简化，实际需要转换为 tool_calls，但为了兼容我们先跳过
                        } else if (b.type === 'tool_result') {
                            // 添加 tool 角色消息
                        }
                    }
                }
                // 如果旧格式，直接用 content
                if (!contentArray.length && msg.content) {
                    contentArray = [{ type: 'text', text: msg.content }];
                }
                return { role: 'assistant', content: contentArray.length ? contentArray : msg.content };
            }
            return msg;
        });

        // 开始流式生成
        isStreaming = true;
        streamBlocks = [];

        const callbacks = {
            onText: (text) => {
                const last = streamBlocks[streamBlocks.length - 1];
                if (last && last.type === 'text') {
                    last.content += text;
                } else {
                    streamBlocks.push({ type: 'text', content: text });
                }
                scheduleRedraw();
            },
            onReasoning: (text) => {
                const last = streamBlocks[streamBlocks.length - 1];
                if (last && last.type === 'reasoning') {
                    last.content += text;
                } else {
                    streamBlocks.push({ type: 'reasoning', content: text });
                }
                scheduleRedraw();
            },
            onToolProgress: (prog) => {
                let found = streamBlocks.find(b => b.type === 'tool_call' && b.id === prog.id);
                if (!found) {
                    found = { type: 'tool_call', id: prog.id, name: prog.name, arguments: prog.arguments };
                    streamBlocks.push(found);
                } else {
                    found.name = prog.name || found.name;
                    found.arguments += prog.arguments || '';
                }
                scheduleRedraw();
            },
            onToolContent: (tool) => {
                let type = 'tool_result';
                if (tool.type === 'error') type = 'error';
                else if (tool.type === 'call') type = 'tool_call';
                else if (tool.type === 'tool_approval') type = 'approval';

                const id = tool.tool_call_id || `tool_${Date.now()}`;
                let existing = streamBlocks.find(b => b.id === id && b.type === type);
                if (existing) {
                    existing.content = (existing.content || '') + (tool.content || '');
                    existing.name = tool.title || existing.name;
                } else {
                    streamBlocks.push({
                        type,
                        id,
                        name: tool.title,
                        content: tool.content || ''
                    });
                }
                scheduleRedraw();
            },
            onError: (errMsg) => {
                streamBlocks.push({ type: 'error', content: errMsg });
                isStreaming = false;
                streamController = null;
                scheduleRedraw();
            }
        };

        await tuiStreamResponse(apiMessages, callbacks);

        // 流式结束
        if (streamBlocks.length > 0) {
            messages.push({ role: 'assistant', blocks: streamBlocks, content: null });
        } else {
            messages.push({ role: 'assistant', content: T.noContent });
        }
        streamBlocks = [];
        isStreaming = false;
        streamController = null;
        scheduleRedraw();
    }

    // ---------- 构建 TUI 界面 ----------
    const screen = blessed.screen({
        smartCSR: true,
        title: 'SAP TUI',
        dockBorders: true,
        fullUnicode: true,
        autoPadding: true
    });

    const statusBar = blessed.box({
        top: 0,
        left: 0,
        width: '100%',
        height: 1,
        tags: true,
        style: { fg: 'white', bg: 'black' },
        content: buildStatusLine()
    });

    const chatBox = blessed.box({
        top: 1,
        left: 0,
        width: '100%',
        height: '100%-3',
        scrollable: true,
        alwaysScroll: true,
        keys: true,
        tags: true,
        mouse: true,
        style: { fg: 'white', bg: 'black' },
        padding: { left: 1, right: 1, top: 0, bottom: 0 }
    });

    const inputBox = blessed.textbox({
        bottom: 0,
        left: 0,
        width: '100%',
        height: 3,
        inputOnFocus: true,
        keys: true,
        mouse: true,
        tags: true,
        style: {
            fg: 'white',
            bg: '#111111',
            border: { fg: '#00c2a8' }
        },
        border: 'line',
        padding: { left: 1, right: 1 }
    });

    screen.append(statusBar);
    screen.append(chatBox);
    screen.append(inputBox);

    // 欢迎信息
    chatBox.setContent(`{bold}{cyan-fg}${T.welcome}{/cyan-fg}{/bold}\n{gray-fg}${T.info}{/gray-fg}\n`);
    inputBox.focus();

    // 输入事件
    inputBox.key('enter', () => {
        const val = inputBox.getValue();
        inputBox.clearValue();
        screen.render();
        handleInput(val);
    });

    inputBox.key('up', () => {
        if (inputHistory.length === 0) return;
        if (historyIndex > 0) historyIndex--;
        inputBox.setValue(inputHistory[historyIndex] || '');
        screen.render();
    });

    inputBox.key('down', () => {
        if (inputHistory.length === 0) return;
        if (historyIndex < inputHistory.length - 1) {
            historyIndex++;
            inputBox.setValue(inputHistory[historyIndex] || '');
        } else {
            inputBox.clearValue();
            historyIndex = inputHistory.length;
        }
        screen.render();
    });

    // Ctrl+C 退出
    screen.key(['C-c'], () => {
        if (isStreaming) {
            streamController && streamController.abort();
            isStreaming = false;
            streamBlocks = [];
        }
        messages.push({ role: 'system', content: T.bye });
        scheduleRedraw();
        setTimeout(() => process.exit(0), 300);
    });

    // 窗口大小变化时重绘
    screen.on('resize', () => {
        screen.render();
    });

    screen.render();
}