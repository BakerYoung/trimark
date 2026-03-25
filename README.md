# TriMark

一个零依赖的个人 Markdown 工具，采用类似 Sublime Text 的深色三栏布局：

- 左侧文件列表
- 中间 Markdown 编辑区
- 右侧实时预览区

## 使用

直接在当前目录启动一个静态文件服务即可，例如：

```bash
python3 -m http.server 4173
```

然后打开 `http://localhost:4173`。

## 功能

- 本地 `localStorage` 持久化
- 新建、删除、重命名文档
- 导入 `.md`
- 导出当前文档
- 常用 Markdown 插入按钮
- 响应式三栏/双栏/单栏布局
