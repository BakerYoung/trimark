# TriMark

一个可打包为桌面应用的个人 Markdown 工具，采用类似 Sublime Text 的深色三栏布局：

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
