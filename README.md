# sap-cli

CLI extension for super agent party！

super agent party的CLI插件！

# 使用方法

在扩展中挂载`sap`命令。然后，在终端中，使用`sap`命令，即可在终端中调用SAP。

进阶用法：

1. 连接微信

`npx wechat-acp --agent sap`

用微信扫描二维码后，即可在微信中使用SAP

2. 在zed等支持ACP的编辑器中使用sap

在编辑器的settings.json中添加以下字段：

```json
{
  "agent_servers": {
    "your_agent": {
      "type": "custom",
      "command": "sap",
    },
  }
}
```

---

# Usage

Mount the `sap` command in the extension. Then, in the terminal, use the `sap` command to invoke SAP directly in the terminal.

Advanced Usage:

1. Connect to WeChat

`npx wechat-acp --agent sap`

After scanning the QR code with WeChat, you can use SAP within WeChat.

2. Use sap in zed or other ACP-enabled editors

Add the following field to the settings.json of the editor:

```json
{
  "agent_servers": {
    "your_agent": {
      "type": "custom",
      "command": "sap",
    },
  }
}
```