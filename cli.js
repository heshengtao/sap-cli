#!/usr/bin/env node
const readline = require('readline');
const { program } = require('commander');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// 1. 加载配置
const configPath = path.join(__dirname, 'config.json');
let config = { backendUrl: 'http://127.0.0.1:3456', lang: 'zh' };
if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
}

const i18n = {
    zh: { 
        welcome: "🚀 SAP CLI 控制台",
        info: "输入 /help 查看指令列表",
        you: "你: ", ai: "SAP: ", bye: "再见! 👋", error: "请求失败: ",
        reset: "🧹 会话已重置 (上下文已清空)",
        statusTitle: "📊 当前会话状态",
        helpTitle: "💡 可用指令列表",
        cmdHelp: [
            { cmd: "/help", desc: "显示此帮助菜单" },
            { cmd: "/clear", desc: "清空当前对话上下文 (开启新话题)" },
            { cmd: "/status", desc: "查看当前模型、后端地址及上下文轮数" },
            { cmd: "/exit", desc: "退出程序" }
        ],
        paramTitle: "⚙️ 启动参数 (运行 sap 时使用)",
        params: [
            { p: "-m <name>", d: "指定模型/Agent (默认: super-model)" },
            { p: "-t", d: "开启深度思考 (Thinking Mode)" },
            { p: "-w", d: "开启联网搜索 (Web Search)" }
        ]
    },
    en: { 
        welcome: "🚀 SAP CLI Console",
        info: "Type /help for command list",
        you: "You: ", ai: "SAP: ", bye: "Bye! 👋", error: "Error: ",
        reset: "🧹 Session reset (Context cleared)",
        statusTitle: "📊 Session Status",
        helpTitle: "💡 Commands List",
        cmdHelp: [
            { cmd: "/help", desc: "Show this help menu" },
            { cmd: "/clear", desc: "Clear context (Start new topic)" },
            { cmd: "/status", desc: "Show model, URL and context rounds" },
            { cmd: "/exit", desc: "Exit program" }
        ],
        paramTitle: "⚙️ Startup Flags (Use with 'sap' command)",
        params: [
            { p: "-m <name>", d: "Specify Model/Agent (Default: super-model)" },
            { p: "-t", d: "Enable Thinking Mode" },
            { p: "-w", d: "Enable Web Search" }
        ]
    }
};
const T = i18n[config.lang] || i18n.en;

// 2. 命令行启动参数定义
program
  .option('-m, --model <type>', 'Model/Agent Name', 'super-model')
  .option('-t, --think', 'Enable Deep Thinking', false)
  .option('-w, --web', 'Enable Web Search', false)
  .helpOption('-h, --help', 'Display help for command')
  .parse(process.argv);

const options = program.opts();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// 存储上下文
let messages = []; 

// --- 功能函数：打印帮助菜单 ---
function printHelp() {
    console.log(chalk.yellow(`\n${T.helpTitle}:`));
    T.cmdHelp.forEach(c => {
        console.log(`  ${chalk.cyan(c.cmd.padEnd(10))} ${chalk.gray(c.desc)}`);
    });
    console.log(chalk.yellow(`\n${T.paramTitle}:`));
    T.params.forEach(p => {
        console.log(`  ${chalk.cyan(p.p.padEnd(10))} ${chalk.gray(p.d)}`);
    });
    console.log();
}

// --- 功能函数：打印状态 ---
function printStatus() {
    console.log(chalk.blue(`\n${T.statusTitle}:`));
    console.log(`  ${chalk.gray("URL:")}   ${config.backendUrl}`);
    console.log(`  ${chalk.gray("Model:")} ${options.model}`);
    console.log(`  ${chalk.gray("Flags:")} ${options.think ? '🧠 Thinking' : ''} ${options.web ? '🌐 Web' : ''} ${(!options.think && !options.web) ? 'None' : ''}`);
    console.log(`  ${chalk.gray("Context:")} ${messages.length / 2} rounds`);
    console.log();
}

// 3. 启动界面
console.clear();
console.log(chalk.bold.cyan(`\n${T.welcome}`));
console.log(chalk.dim(`──────────────────────────────────────────`));
console.log(`${chalk.gray("Backend:")} ${chalk.white(config.backendUrl)}`);
console.log(`${chalk.gray("Model:")}   ${chalk.green(options.model)}`);
if(options.think) console.log(chalk.magenta("✨ Thinking Mode Enabled"));
if(options.web)   console.log(chalk.blue("🌐 Web Search Enabled"));
console.log(chalk.dim(`──────────────────────────────────────────`));
console.log(chalk.italic.yellow(T.info + "\n"));

// 4. 对话循环
async function chat() {
  rl.question(chalk.green.bold(T.you), async (input) => {
    const text = input.trim();
    
    // --- 指令路由 ---
    const lowerText = text.toLowerCase();
    if (lowerText === 'exit' || lowerText === '/exit') {
      console.log(chalk.yellow(T.bye));
      process.exit();
    }
    if (lowerText === '/help') {
      printHelp();
      return chat();
    }
    if (lowerText === '/clear') {
      messages = [];
      console.log(chalk.magenta(T.reset + "\n"));
      return chat();
    }
    if (lowerText === '/status') {
      printStatus();
      return chat();
    }

    if (!text) return chat();

    // --- 正常聊天逻辑 ---
    messages.push({ role: 'user', content: text });

    try {
      process.stdout.write(chalk.blue.bold(T.ai));
      
      const response = await fetch(`${config.backendUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          messages: messages,
          stream: true,
          enable_thinking: options.think,
          enable_web_search: options.web
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullAssistantReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    const content = data.choices[0]?.delta?.content || "";
                    process.stdout.write(content);
                    fullAssistantReply += content;
                } catch (e) {}
            }
        }
      }
      messages.push({ role: 'assistant', content: fullAssistantReply });
      console.log("\n"); 

    } catch (error) {
      console.log(chalk.red(`\n${T.error}${error.message}`));
      messages.pop(); 
    }
    chat();
  });
}

chat();