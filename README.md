# X Auto Translator

用于在 X (Twitter) 中自动将外语推文和评论翻译为目标语言的浏览器插件。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)

## 功能

- **自动翻译**: 检测并翻译推文与评论。
- **自定义目标语言**: 支持简体中文、繁体中文、英文、日文与韩文。
- **按需过滤**: 支持“仅自动翻译评论区”。

## 安装

**手动安装：**

适用于基于 Chromium 的浏览器（如 Chrome、Edge）：

1. 下载或克隆本项目代码。
2. 打开扩展程序页面：`chrome://extensions/` 或 `edge://extensions/`。
3. 开启页面右上角的 **开发者模式**。
4. 点击 **加载已解压的扩展程序**，选择下载的 `x-auto-translate` 文件夹。

## 使用

- **全局控制**: 点击扩展图标，通过总开关快速启用或关闭插件。
- **参数配置**: 在弹窗界面中选择目标语言，或勾选“仅自动翻译评论区”。所有更改自动保存。

## 隐私

插件所有页面解析逻辑均在本地进行。翻译请求通过 Microsoft Edge 提供的公共翻译接口（Microsoft Translator API）处理，不收集任何账号信息或浏览记录。

## 协议

本项目基于 [MIT License](./LICENSE) 协议开源。