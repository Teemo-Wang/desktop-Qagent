# CursorLens Demo（macOS）

CursorLens 是一个以鼠标位置为上下文锚点的轻量桌面 AI 浮窗。长按快捷键后，它会截取鼠标周围的局部画面，并把截图、问题以及鼠标在截图中的精确位置一并交给支持视觉的模型。

第一版只做“看懂并回答”，不会点击、输入或修改当前界面。

## 交互闭环

1. 把鼠标停在想询问的按钮、参数、报错或其他 UI 上。
2. 按一次 `⌘⇧Space`。如果在设置中切换为长按模式，则按住约 500ms。
3. CursorLens 在鼠标旁弹出，并自动截取默认 600×600 的局部画面。
4. 输入“这个是什么？”、“这里为什么报错？”等问题并按 Enter。
5. 回答会在浮窗内流式显示。

截图只保存在内存中；只有在用户主动发送问题后，截图才会随问题发往所配置的模型接口。

## 快速运行

要求：macOS、Node.js 20 或更高版本，以及 Xcode Command Line Tools（用于编译很小的全局按键监听辅助程序）。

```bash
npm install
npm run demo
```

`npm run demo` 会在启动后自动执行一次“鼠标定位 → 局部截图 → 浮窗”的演示，适合首次验证。之后日常运行使用：

```bash
npm start
```

打包后的应用从访达启动时会立即截取并显示一次浮窗，之后同时保留 Dock 图标和菜单栏图标。再次点击应用图标或单击菜单栏图标，都可以重新截取并打开浮窗。

## 首次权限

macOS 会涉及两项权限：

- **输入监控**：只在选择“长按”触发模式时需要。默认的“按一次”模式使用 Electron 系统快捷键，不依赖这项权限。如果长按权限尚未生效，应用也会自动回退为按一次立即打开。
- **屏幕与系统音频录制**：用于读取鼠标周围的屏幕画面，不会录音。

第一次运行时按提示打开“系统设置 → 隐私与安全性”，启用对应项目，然后完全退出并重新启动 CursorLens。开发模式下，系统列表里的名称可能显示为 Electron、终端，或 `cursorlens-hotkey`。

菜单栏的 CursorLens 菜单以及应用内设置页都提供了权限入口。

## API Key 与模型配置

有三种配置方式，优先级从高到低为：

1. 环境变量；
2. 开发目录下的 `config.json`；
3. 浮窗设置页保存的本地设置。

环境变量方式：

```bash
export OPENAI_API_KEY="你的 API Key"
export OPENAI_MODEL="gpt-4.1-mini"
export OPENAI_BASE_URL="https://api.openai.com/v1"
npm start
```

界面中保存的 API Key 会使用 Electron `safeStorage` 加密后写入应用数据目录。也可以复制配置示例：

```bash
cp config.example.json config.json
```

`config.json` 已被 Git 忽略，但它是明文文件，不建议共享。接口需兼容 OpenAI Chat Completions 的视觉输入与 SSE 流式输出；更换兼容服务时只需修改模型名和 API 地址。

## 可配置项

- 快捷键：默认 `Command+Shift+Space`；支持 Command、Option、Control、Shift 与字母、数字、Space、F1–F12 的组合。
- 触发方式：默认按一次，推荐用于未签名 Demo；也可以切换到长按模式，并选择 350 / 500 / 700 / 1000ms。
- 截图尺寸：400 / 600 / 800 / 1000，靠近屏幕边缘时会自动平移截取框，保证鼠标仍在画面内。
- 模型与 API 地址。

截图针对 Retina 缩放和多显示器做了坐标换算。预览里的十字圆点是本地叠加的指代提示；发给模型的同时还有精确像素坐标与归一化坐标，不依赖模型猜测鼠标在哪里。

## 项目结构

```text
native/macos-hotkey.swift                macOS 全局按键按下/松开监听
scripts/build-native.mjs                 原生辅助程序构建
src/main/index.js                        Electron 生命周期、浮窗、IPC
src/main/services/capture-service.js     鼠标坐标与局部屏幕截图
src/main/context/                        可扩展的上下文提供器管线
src/main/providers/                      可替换的模型提供器
src/main/actions/                        预留的动作执行接口（当前禁用）
src/renderer/                            Spotlight 风格浮窗
test/                                    坐标、快捷键和流解析测试
```

后续接入 Accessibility Tree、OCR 或当前应用信息时，可以新增 `ContextProvider` 并挂进 `ContextPipeline`。接入 UI Automation / Computer Use 时应实现独立的 `ActionExecutor`，继续让 renderer 只持有最小 IPC 权限。当前版本不会把执行能力交给模型。

## 验证与打包

```bash
npm test
npm run check
npm run dist:mac
```

`dist:mac` 会生成 DMG 和 ZIP。公开分发前仍需要补充 Apple Developer 签名和 notarization；未签名构建更适合本地 Demo。

## 已知边界

- 当前只实现 macOS；Windows 方案不在这版中。
- 自定义快捷键按物理键位解析，特殊键盘布局建议使用 Space 或 F1–F12 作为主键。
- 模型必须具备视觉能力并支持兼容的流式接口。
- 屏幕权限被拒绝后，macOS 通常要求重启应用才会刷新授权状态。
