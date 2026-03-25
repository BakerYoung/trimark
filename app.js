const STORAGE_KEY = "trimark.workspace.v2";
const LEGACY_STORAGE_KEY = "trimark.workspace.v1";
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const MIN_EDITOR_WIDTH = 320;
const MIN_PREVIEW_WIDTH = 320;

const elements = {
  fileTree: document.querySelector("#file-list"),
  editor: document.querySelector("#editor"),
  preview: document.querySelector("#preview"),
  titleInput: document.querySelector("#title-input"),
  newFileBtn: document.querySelector("#new-file-btn"),
  newFolderBtn: document.querySelector("#new-folder-btn"),
  deleteBtn: document.querySelector("#delete-btn"),
  importBtn: document.querySelector("#import-btn"),
  importFolderBtn: document.querySelector("#import-folder-btn"),
  exportBtn: document.querySelector("#export-btn"),
  fileInput: document.querySelector("#file-input"),
  folderInput: document.querySelector("#folder-input"),
  saveIndicator: document.querySelector("#save-indicator"),
  wordCount: document.querySelector("#word-count"),
  toolbarButtons: document.querySelectorAll(".editor-toolbar button"),
  appShell: document.querySelector(".app-shell"),
  sidebar: document.querySelector(".sidebar"),
  sidebarResizer: document.querySelector("#sidebar-resizer"),
  resizer: document.querySelector("#panel-resizer"),
  mainPanel: document.querySelector("#main-panel"),
  editorPanel: document.querySelector(".editor-panel"),
  previewPanel: document.querySelector(".preview-panel"),
};

const state = loadWorkspace();
let saveTimer = null;
let panelResizerState = null;
let sidebarResizerState = null;

render();
bindEvents();

function loadWorkspace() {
  const restored = readWorkspace(STORAGE_KEY);
  if (restored) {
    return normalizeWorkspace(restored);
  }

  const legacy = readWorkspace(LEGACY_STORAGE_KEY);
  if (legacy) {
    return migrateLegacyWorkspace(legacy);
  }

  return createStarterWorkspace();
}

function readWorkspace(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Failed to restore workspace", error);
    return null;
  }
}

function createStarterWorkspace() {
  const rootId = crypto.randomUUID();
  const starterId = crypto.randomUUID();

  return {
    activeId: starterId,
    sidebarWidth: 280,
    panelRatio: 0.5,
    expandedFolders: [rootId],
    folders: [
      {
        id: rootId,
        name: "notes",
        parentId: null,
      },
    ],
    files: [
      {
        id: starterId,
        folderId: rootId,
        name: "welcome.md",
        content: [
          "# TriMark",
          "",
          "这是一个三栏式 Markdown 工作区：",
          "",
          "- 左侧支持文件夹和文件",
          "- 中间专注写作",
          "- 右侧实时预览",
          "",
          "```js",
          "const note = '像 Sublime Text 一样干净直接';",
          "```",
          "",
          "> 你现在也可以导入整个文件夹。",
        ].join("\n"),
        updatedAt: Date.now(),
      },
    ],
  };
}

function migrateLegacyWorkspace(legacy) {
  const rootId = crypto.randomUUID();
  const files = Array.isArray(legacy.files)
    ? legacy.files.map((file) => ({
        ...file,
        folderId: rootId,
      }))
    : [];

  return normalizeWorkspace({
    activeId: legacy.activeId || files[0]?.id || null,
    sidebarWidth: 280,
    panelRatio: 0.5,
    expandedFolders: [rootId],
    folders: [
      {
        id: rootId,
        name: "Imported",
        parentId: null,
      },
    ],
    files,
  });
}

function normalizeWorkspace(data) {
  const folders = Array.isArray(data.folders) && data.folders.length > 0 ? data.folders : createStarterWorkspace().folders;
  const folderIds = new Set(folders.map((folder) => folder.id));
  const defaultFolderId = folders[0].id;
  const files = Array.isArray(data.files) && data.files.length > 0
    ? data.files.map((file) => ({
        ...file,
        folderId: folderIds.has(file.folderId) ? file.folderId : defaultFolderId,
        updatedAt: Number(file.updatedAt) || Date.now(),
      }))
    : createStarterWorkspace().files.map((file) => ({
        ...file,
        folderId: defaultFolderId,
      }));

  const activeId = files.some((file) => file.id === data.activeId) ? data.activeId : files[0].id;
  const expandedFolders = Array.isArray(data.expandedFolders)
    ? [...new Set(data.expandedFolders.filter((id) => folderIds.has(id)))]
    : [defaultFolderId];

  if (!expandedFolders.length) {
    expandedFolders.push(defaultFolderId);
  }

  return {
    activeId,
    sidebarWidth: clamp(Number(data.sidebarWidth) || 280, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH),
    panelRatio: clamp(Number(data.panelRatio) || 0.5, 0.32, 0.68),
    expandedFolders,
    folders,
    files,
  };
}

function bindEvents() {
  elements.newFileBtn.addEventListener("click", createFile);
  elements.newFolderBtn.addEventListener("click", createFolder);
  elements.deleteBtn.addEventListener("click", deleteActiveFile);
  elements.importBtn.addEventListener("click", () => elements.fileInput.click());
  elements.importFolderBtn.addEventListener("click", () => elements.folderInput.click());
  elements.exportBtn.addEventListener("click", exportActiveFile);
  elements.fileInput.addEventListener("change", importFiles);
  elements.folderInput.addEventListener("change", importFolder);

  elements.titleInput.addEventListener("input", (event) => {
    updateActiveFile({ name: normalizeFileName(event.target.value) || "untitled.md" });
  });

  elements.editor.addEventListener("input", (event) => {
    markSaving();
    updateActiveFile({ content: event.target.value });
  });

  elements.editor.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      insertAtCursor("  ");
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      persistWorkspace();
      elements.saveIndicator.textContent = "已保存";
    }
  });

  elements.toolbarButtons.forEach((button) => {
    button.addEventListener("click", () => insertAtCursor(button.dataset.insert || ""));
  });

  elements.sidebarResizer.addEventListener("pointerdown", startSidebarResize);
  elements.resizer.addEventListener("pointerdown", startResize);
  window.addEventListener("pointermove", onSidebarResize);
  window.addEventListener("pointermove", onResize);
  window.addEventListener("pointerup", stopSidebarResize);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("resize", () => {
    applySidebarWidth();
    applyPanelRatio();
  });
}

function render() {
  renderFileTree();
  renderActiveFile();
  applySidebarWidth();
  applyPanelRatio();
}

function renderFileTree() {
  elements.fileTree.innerHTML = "";

  getRootFolders()
    .sort(sortByName)
    .forEach((folder) => {
      elements.fileTree.appendChild(buildFolderNode(folder, 0));
    });
}

function buildFolderNode(folder, depth) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";

  const row = document.createElement("div");
  row.className = "tree-row tree-folder";
  row.style.setProperty("--depth", depth);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "tree-toggle";
  toggle.textContent = isFolderExpanded(folder.id) ? "▾" : "▸";
  toggle.addEventListener("click", () => toggleFolder(folder.id));

  const name = document.createElement("button");
  name.type = "button";
  name.className = "tree-label";
  name.innerHTML = `<span class="tree-icon">⌘</span><span>${escapeHtml(folder.name)}</span>`;
  name.addEventListener("click", () => toggleFolder(folder.id));

  const meta = document.createElement("span");
  meta.className = "tree-meta";
  meta.textContent = `${countFilesInFolder(folder.id)}`;

  row.append(toggle, name, meta);
  wrapper.appendChild(row);

  if (isFolderExpanded(folder.id)) {
    const children = document.createElement("div");
    children.className = "tree-children";

    getChildFolders(folder.id)
      .sort(sortByName)
      .forEach((childFolder) => {
        children.appendChild(buildFolderNode(childFolder, depth + 1));
      });

    getFilesByFolder(folder.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach((file) => {
        children.appendChild(buildFileNode(file, depth + 1));
      });

    wrapper.appendChild(children);
  }

  return wrapper;
}

function buildFileNode(file, depth) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `tree-row tree-file${file.id === state.activeId ? " is-active" : ""}`;
  button.style.setProperty("--depth", depth);
  button.innerHTML = [
    '<span class="tree-file-mark"></span>',
    `<span class="tree-label"><span class="tree-icon">#</span><span>${escapeHtml(file.name)}</span></span>`,
    `<span class="tree-meta">${formatTime(file.updatedAt)}</span>`,
  ].join("");

  button.addEventListener("click", () => {
    state.activeId = file.id;
    ensureFolderPathExpanded(file.folderId);
    persistWorkspace();
    render();
  });

  return button;
}

function renderActiveFile() {
  const activeFile = getActiveFile();
  if (!activeFile) {
    return;
  }

  elements.titleInput.value = activeFile.name;
  elements.editor.value = activeFile.content;
  elements.preview.innerHTML = renderMarkdown(activeFile.content);
  elements.wordCount.textContent = `${countWords(activeFile.content)} 字`;
}

function getActiveFile() {
  return state.files.find((file) => file.id === state.activeId) || state.files[0] || null;
}

function createFile() {
  const parentFolderId = getActiveFile()?.folderId || getDefaultFolderId();
  const id = crypto.randomUUID();

  state.files.unshift({
    id,
    folderId: parentFolderId,
    name: nextUntitledName(parentFolderId),
    content: "",
    updatedAt: Date.now(),
  });

  state.activeId = id;
  ensureFolderPathExpanded(parentFolderId);
  persistWorkspace();
  render();
  elements.titleInput.focus();
  elements.titleInput.select();
}

function createFolder() {
  const parentFolderId = getActiveFile()?.folderId || null;
  const id = crypto.randomUUID();

  state.folders.push({
    id,
    name: nextFolderName(parentFolderId),
    parentId: parentFolderId,
  });

  state.expandedFolders.push(id);
  if (parentFolderId) {
    ensureFolderPathExpanded(parentFolderId);
  }
  persistWorkspace();
  render();
}

function deleteActiveFile() {
  const activeFile = getActiveFile();
  if (!activeFile) {
    return;
  }

  if (state.files.length === 1) {
    const fallbackFolderId = getDefaultFolderId();
    const id = crypto.randomUUID();
    state.files = [
      {
        id,
        folderId: fallbackFolderId,
        name: nextUntitledName(fallbackFolderId),
        content: "",
        updatedAt: Date.now(),
      },
    ];
    state.activeId = id;
    ensureFolderPathExpanded(fallbackFolderId);
    persistWorkspace();
    render();
    return;
  }

  state.files = state.files.filter((file) => file.id !== activeFile.id);
  state.activeId = state.files[0]?.id || null;
  ensureFolderPathExpanded(getActiveFile()?.folderId);
  persistWorkspace();
  render();
}

function updateActiveFile(patch) {
  state.files = state.files.map((file) => {
    if (file.id !== state.activeId) {
      return file;
    }

    return {
      ...file,
      ...patch,
      updatedAt: Date.now(),
    };
  });

  persistWorkspace();
  render();
}

function toggleFolder(folderId) {
  if (isFolderExpanded(folderId)) {
    state.expandedFolders = state.expandedFolders.filter((id) => id !== folderId);
  } else {
    state.expandedFolders.push(folderId);
  }
  persistWorkspace();
  render();
}

function isFolderExpanded(folderId) {
  return state.expandedFolders.includes(folderId);
}

function persistWorkspace() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function markSaving() {
  clearTimeout(saveTimer);
  elements.saveIndicator.textContent = "保存中...";
  saveTimer = window.setTimeout(() => {
    elements.saveIndicator.textContent = "已保存";
  }, 260);
}

function normalizeFileName(name) {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]/g, "-");
  if (!trimmed) {
    return "";
  }
  return /\.(md|markdown|txt)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

function normalizeFolderName(name) {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]/g, "-");
  return trimmed || "New Folder";
}

function nextUntitledName(folderId) {
  const existing = new Set(getFilesByFolder(folderId).map((file) => file.name));
  let index = 1;
  let candidate = `note-${index}.md`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `note-${index}.md`;
  }
  return candidate;
}

function nextFolderName(parentId) {
  const existing = new Set(getChildFolders(parentId).map((folder) => folder.name));
  let index = 1;
  let candidate = `Folder-${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `Folder-${index}`;
  }
  return candidate;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function countWords(text) {
  return text.trim().length;
}

function insertAtCursor(snippet) {
  const normalizedSnippet = snippet.replace(/\\n/g, "\n");
  const start = elements.editor.selectionStart;
  const end = elements.editor.selectionEnd;
  const content = elements.editor.value;
  const next = `${content.slice(0, start)}${normalizedSnippet}${content.slice(end)}`;
  elements.editor.value = next;
  elements.editor.focus();
  const cursor = start + normalizedSnippet.length;
  elements.editor.setSelectionRange(cursor, cursor);
  markSaving();
  updateActiveFile({ content: next });
}

function importFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  Promise.all(files.map((file) => readTextFile(file))).then((entries) => {
    const targetFolderId = getActiveFile()?.folderId || getDefaultFolderId();
    entries.forEach(({ file, content }) => {
      state.files.unshift({
        id: crypto.randomUUID(),
        folderId: targetFolderId,
        name: normalizeFileName(file.name) || nextUntitledName(targetFolderId),
        content,
        updatedAt: Date.now(),
      });
    });
    state.activeId = state.files[0].id;
    ensureFolderPathExpanded(targetFolderId);
    persistWorkspace();
    render();
    elements.fileInput.value = "";
  });
}

function importFolder(event) {
  const files = Array.from(event.target.files || []).filter((file) => /\.(md|markdown|txt)$/i.test(file.name));
  if (!files.length) {
    return;
  }

  const topFolderName = normalizeFolderName(files[0].webkitRelativePath.split("/")[0] || "Imported Folder");
  const rootImportId = crypto.randomUUID();
  state.folders.push({
    id: rootImportId,
    name: topFolderName,
    parentId: null,
  });
  state.expandedFolders.push(rootImportId);

  const folderMap = new Map([[topFolderName, rootImportId]]);

  Promise.all(files.map((file) => readTextFile(file))).then((entries) => {
    entries.forEach(({ file, content }) => {
      const parts = file.webkitRelativePath.split("/");
      const relativeFolders = parts.slice(1, -1);
      let parentId = rootImportId;
      let currentPath = topFolderName;

      relativeFolders.forEach((segment) => {
        currentPath = `${currentPath}/${segment}`;
        if (!folderMap.has(currentPath)) {
          const folderId = crypto.randomUUID();
          state.folders.push({
            id: folderId,
            name: normalizeFolderName(segment),
            parentId,
          });
          state.expandedFolders.push(folderId);
          folderMap.set(currentPath, folderId);
        }
        parentId = folderMap.get(currentPath);
      });

      state.files.push({
        id: crypto.randomUUID(),
        folderId: parentId,
        name: normalizeFileName(parts.at(-1)) || nextUntitledName(parentId),
        content,
        updatedAt: Date.now(),
      });
    });

    state.activeId = state.files[state.files.length - files.length]?.id || state.activeId;
    ensureFolderPathExpanded(getActiveFile()?.folderId);
    persistWorkspace();
    render();
    elements.folderInput.value = "";
  });
}

function readTextFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        file,
        content: String(reader.result || ""),
      });
    };
    reader.readAsText(file, "utf-8");
  });
}

function exportActiveFile() {
  const activeFile = getActiveFile();
  if (!activeFile) {
    return;
  }
  const blob = new Blob([activeFile.content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = activeFile.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function startResize(event) {
  if (window.innerWidth <= 800) {
    return;
  }
  panelResizerState = true;
  document.body.classList.add("is-resizing");
  elements.resizer.setPointerCapture(event.pointerId);
}

function onResize(event) {
  if (!panelResizerState) {
    return;
  }

  const bounds = elements.mainPanel.getBoundingClientRect();
  const offset = event.clientX - bounds.left;
  const ratio = clamp(offset / bounds.width, MIN_EDITOR_WIDTH / bounds.width, 1 - MIN_PREVIEW_WIDTH / bounds.width);
  state.panelRatio = ratio;
  applyPanelRatio();
}

function stopResize(event) {
  if (!panelResizerState) {
    return;
  }
  panelResizerState = null;
  document.body.classList.remove("is-resizing");
  if (event) {
    elements.resizer.releasePointerCapture(event.pointerId);
  }
  persistWorkspace();
}

function startSidebarResize(event) {
  if (window.innerWidth <= 1080) {
    return;
  }
  sidebarResizerState = true;
  document.body.classList.add("is-resizing");
  elements.sidebarResizer.setPointerCapture(event.pointerId);
}

function onSidebarResize(event) {
  if (!sidebarResizerState) {
    return;
  }
  const appWidth = elements.appShell.getBoundingClientRect().width;
  const remainingMinWidth = MIN_EDITOR_WIDTH + MIN_PREVIEW_WIDTH + 24;
  const maxWidth = Math.min(MAX_SIDEBAR_WIDTH, appWidth - remainingMinWidth);
  state.sidebarWidth = clamp(event.clientX, MIN_SIDEBAR_WIDTH, maxWidth);
  applySidebarWidth();
  applyPanelRatio();
}

function stopSidebarResize(event) {
  if (!sidebarResizerState) {
    return;
  }
  sidebarResizerState = null;
  document.body.classList.remove("is-resizing");
  if (event) {
    elements.sidebarResizer.releasePointerCapture(event.pointerId);
  }
  persistWorkspace();
}

function applySidebarWidth() {
  if (window.innerWidth <= 1080) {
    elements.appShell.style.removeProperty("--sidebar-width");
    return;
  }
  elements.appShell.style.setProperty("--sidebar-width", `${state.sidebarWidth}px`);
}

function applyPanelRatio() {
  if (window.innerWidth <= 800) {
    elements.mainPanel.style.removeProperty("--editor-width");
    return;
  }

  const width = elements.mainPanel.getBoundingClientRect().width;
  if (!width) {
    return;
  }
  const ratio = clamp(state.panelRatio || 0.5, MIN_EDITOR_WIDTH / width, 1 - MIN_PREVIEW_WIDTH / width);
  elements.mainPanel.style.setProperty("--editor-width", `${ratio * 100}%`);
}

function getRootFolders() {
  return state.folders.filter((folder) => !folder.parentId);
}

function getChildFolders(parentId) {
  return state.folders.filter((folder) => folder.parentId === parentId);
}

function getFilesByFolder(folderId) {
  return state.files.filter((file) => file.folderId === folderId);
}

function countFilesInFolder(folderId) {
  return getDescendantFolderIds(folderId)
    .flatMap((id) => getFilesByFolder(id))
    .length;
}

function getDescendantFolderIds(folderId) {
  const ids = [folderId];
  getChildFolders(folderId).forEach((folder) => {
    ids.push(...getDescendantFolderIds(folder.id));
  });
  return ids;
}

function getFolderById(folderId) {
  return state.folders.find((folder) => folder.id === folderId) || null;
}

function getDefaultFolderId() {
  return state.folders[0]?.id;
}

function ensureFolderPathExpanded(folderId) {
  let currentId = folderId;
  while (currentId) {
    if (!state.expandedFolders.includes(currentId)) {
      state.expandedFolders.push(currentId);
    }
    currentId = getFolderById(currentId)?.parentId || null;
  }
}

function sortByName(a, b) {
  return a.name.localeCompare(b.name, "zh-CN", { sensitivity: "base" });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function renderMarkdown(markdown) {
  const blocks = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let listType = null;

  const flushCodeBlock = () => {
    if (!inCodeBlock) {
      return;
    }
    html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
    codeBuffer = [];
    inCodeBlock = false;
  };

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  blocks.forEach((line) => {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        closeList();
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    if (!line.trim()) {
      closeList();
      html.push("");
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      return;
    }

    if (/^(-|\*)\s+/.test(line)) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${formatInline(line.replace(/^(-|\*)\s+/, ""))}</li>`);
      return;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${formatInline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      return;
    }

    closeList();

    if (/^>\s?/.test(line)) {
      html.push(`<blockquote>${formatInline(line.replace(/^>\s?/, ""))}</blockquote>`);
      return;
    }

    if (/^---+$/.test(line.trim())) {
      html.push("<hr />");
      return;
    }

    html.push(`<p>${formatInline(line)}</p>`);
  });

  flushCodeBlock();
  closeList();
  return html.join("");
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
