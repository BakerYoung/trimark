# TriMark

一个可打包为桌面应用、也可部署为 GitHub Pages 官网的个人 Markdown 工具，采用类似 Sublime Text 的深色三栏布局：

- 左侧文件夹/文件树
- 中间 Markdown 编辑区
- 右侧实时预览区

## 桌面运行

先安装依赖：

```bash
npm install
```

本地运行桌面版：

```bash
npm run dev
```

## 官网与在线体验

- GitHub Pages 官网首页使用根路径 [`index.html`](./index.html)
- 在线体验页使用 [`editor.html`](./editor.html)
- 官网会展示仓库地址和 GitHub star 数
- 当前仓库地址：`https://github.com/BakerYoung/trimark`

## GitHub Pages 部署

按下面步骤发布官网：

1. 打开仓库：`https://github.com/BakerYoung/trimark`
2. 进入 `Settings`
3. 在左侧进入 `Pages`
4. 在 `Build and deployment` 中选择：
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
5. 点击 `Save`

GitHub Pages 启用后，默认地址通常是：

```text
https://bakeryoung.github.io/trimark/
```

页面路径说明：

- 官网首页：`https://bakeryoung.github.io/trimark/`
- 在线体验：`https://bakeryoung.github.io/trimark/editor.html`

如果首次开启后没有立即生效，通常等待 1-5 分钟即可。

## 打包

打包当前系统安装包：

```bash
npm run dist
```

仅打包 macOS：

```bash
npm run dist:mac
```

仅打包 Windows：

```bash
npm run dist:win
```

产物会输出到 `dist/`。

## 跨平台说明

- 在 macOS 上可以直接生成 `.dmg`
- 在 Windows 上可以直接生成 `.exe`
- 如果你要同时稳定产出 macOS 和 Windows 安装包，最稳妥的是分别在对应系统打包，或者接 GitHub Actions 做双平台构建

## 功能

- 本地 `localStorage` 持久化
- 左侧文件夹树和文件夹导入
- 新建、删除、重命名文档
- 导入 `.md`
- 导出当前文档
- 左侧栏宽度拖拽
- 编辑区/预览区宽度拖拽
- 常用 Markdown 插入按钮
- 响应式三栏/双栏/单栏布局
