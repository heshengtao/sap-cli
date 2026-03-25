#!/usr/bin/env node

const readline = require('readline');
const { program } = require('commander');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// 读取由前端动态配置的 URL
const configPath = path.join(__dirname, 'config.json');
let BASE_URL = 'http://127.0.0.1:3456'; // 默认值
if (fs.existsSync(configPath)) {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.backendUrl) BASE_URL = config.backendUrl;
    } catch (e) {
        // 忽略解析错误
    }
}

program
  .option('-m, --model <type>', '指定模型或 Agent 名称', 'super-model')
  .option('-t, --think', '开启深度思考', false)
  .option('-r, --research', '开启深度研究', false)
  .option('-w, --web', '开启网络搜索', false)
  .option('--memory <id>', '指定记忆 ID')
  .parse(process.argv);

const options = program.opts();
let actualModel = options.model;
if (options.memory) actualModel = `memory/${options.memory}/${options.model}`;

const messages = [];
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(chalk.cyan(`\n🚀 欢迎使用 SAP CLI (Super Agent Party)`));
console.log(chalk.gray(`当前后端: ${BASE_URL}`));
console.log(chalk.gray(`当前模型: ${actualModel}\n`));

async function chat() {
  rl.question(chalk.green('You: '), async (input) => {
    if (['exit', 'quit'].includes(input.trim().toLowerCase())) {
      console.log(chalk.yellow('Bye! 👋'));
      rl.close();
      return;
    }
    if (!input.trim()) return chat();

    messages.push({ role: 'user', content: input });
    const payload = {
      model: actualModel,
      messages: messages,
      stream: true,
      enable_thinking: options.think,
      enable_deep_research: options.research,
      enable_web_search: options.web
    };

    try {
      process.stdout.write(chalk.blue('SAP: '));
      const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let aiFullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.slice(6).trim());
              const content = data.choices[0]?.delta?.content || "";
              process.stdout.write(content);
              aiFullResponse += content;
            } catch (e) {}
          }
        }
      }
      console.log();
      messages.push({ role: 'assistant', content: aiFullResponse });
    } catch (error) {
      console.log(chalk.red(`\n请求失败: ${error.message}`));
    }
    chat();
  });
}

chat();