const STORAGE_KEY = "trimark.workspace.v3";
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
  createMenuBtn: document.querySelector("#create-menu-btn"),
  createMenu: document.querySelector("#create-menu"),
  createFileAction: document.querySelector("#create-file-action"),
  createFolderAction: document.querySelector("#create-folder-action"),
  openMenuBtn: document.querySelector("#open-menu-btn"),
  openMenu: document.querySelector("#open-menu"),
  pickFileBtn: document.querySelector("#pick-file-btn"),
  pickFolderBtn: document.querySelector("#pick-folder-btn"),
  deleteBtn: document.querySelector("#delete-btn"),
  fileInput: document.querySelector("#file-input"),
  folderInput: document.querySelector("#folder-input"),
  saveIndicator: document.querySelector("#save-indicator"),
  wordCount: document.querySelector("#word-count"),
  workspaceHint: document.querySelector("#workspace-hint"),
  toolbarButtons: document.querySelectorAll(".editor-toolbar button"),
  appShell: document.querySelector(".app-shell"),
  sidebar: document.querySelector(".sidebar"),
  sidebarResizer: document.querySelector("#sidebar-resizer"),
  resizer: document.querySelector("#panel-resizer"),
  mainPanel: document.querySelector("#main-panel"),
  editorPanel: document.querySelector(".editor-panel"),
  previewPanel: document.querySelector(".preview-panel"),
  contextMenu: document.querySelector("#context-menu"),
  contextRename: document.querySelector("#context-rename"),
  contextMove: document.querySelector("#context-move"),
  contextDelete: document.querySelector("#context-delete"),
  contextCreateFile: document.querySelector("#context-create-file"),
  contextCreateFolder: document.querySelector("#context-create-folder"),
  moveDialog: document.querySelector("#move-dialog"),
  moveDialogFile: document.querySelector("#move-dialog-file"),
  moveTargetSelect: document.querySelector("#move-target-select"),
  moveDialogClose: document.querySelector("#move-dialog-close"),
  moveCancel: document.querySelector("#move-cancel"),
  moveConfirm: document.querySelector("#move-confirm"),
};

const runtime = {
  supportsFileSystemAccess: typeof window.showOpenFilePicker === "function" && typeof window.showDirectoryPicker === "function",
  fileHandles: new Map(),
  folderHandles: new Map(),
};

const state = loadWorkspace();
let saveTimer = null;
let diskSaveTimer = null;
let panelResizerState = null;
let sidebarResizerState = null;
let activeMenu = null;
let contextTarget = null;
let movingFileId = null;

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
        source: "workspace",
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
        source: file.source === "local" ? "local" : "workspace",
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
    activeFolderId: folderIds.has(data.activeFolderId) ? data.activeFolderId : defaultFolderId,
    sidebarWidth: clamp(Number(data.sidebarWidth) || 280, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH),
    panelRatio: clamp(Number(data.panelRatio) || 0.5, 0.32, 0.68),
    expandedFolders,
    folders,
    files,
  };
}

function bindEvents() {
  elements.createMenuBtn.addEventListener("click", (event) => toggleMenu(event, elements.createMenu));
  elements.openMenuBtn.addEventListener("click", (event) => toggleMenu(event, elements.openMenu));
  elements.createFileAction.addEventListener("click", () => {
    closeFloatingMenus();
    createFile();
  });
  elements.createFolderAction.addEventListener("click", () => {
    closeFloatingMenus();
    createFolder();
  });
  elements.pickFileBtn.addEventListener("click", () => {
    closeFloatingMenus();
    chooseLocalFiles();
  });
  elements.pickFolderBtn.addEventListener("click", () => {
    closeFloatingMenus();
    chooseLocalFolder();
  });
  elements.deleteBtn.addEventListener("click", deleteActiveFile);
  elements.fileInput.addEventListener("change", importFiles);
  elements.folderInput.addEventListener("change", importFolder);

  elements.titleInput.addEventListener("blur", commitTitleRename);
  elements.titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTitleRename();
      elements.titleInput.blur();
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveActiveFile();
    }
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
      saveActiveFile();
    }
  });

  elements.toolbarButtons.forEach((button) => {
    button.addEventListener("click", () => insertAtCursor(button.dataset.insert || ""));
  });

  elements.sidebarResizer.addEventListener("pointerdown", startSidebarResize);
  elements.resizer.addEventListener("pointerdown", startResize);
  elements.contextRename.addEventListener("click", triggerRenameFromContext);
  elements.contextMove.addEventListener("click", openMoveDialogFromContext);
  elements.contextDelete.addEventListener("click", deleteFileFromContext);
  elements.contextCreateFile.addEventListener("click", createFileFromContextFolder);
  elements.contextCreateFolder.addEventListener("click", createFolderFromContextFolder);
  elements.moveDialogClose.addEventListener("click", closeMoveDialog);
  elements.moveCancel.addEventListener("click", closeMoveDialog);
  elements.moveConfirm.addEventListener("click", confirmMoveFile);
  elements.moveDialog.addEventListener("click", (event) => {
    if (event.target === elements.moveDialog) {
      closeMoveDialog();
    }
  });
  window.addEventListener("pointermove", onSidebarResize);
  window.addEventListener("pointermove", onResize);
  window.addEventListener("pointerup", stopSidebarResize);
  window.addEventListener("pointerup", stopResize);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);
  window.addEventListener("resize", () => {
    applySidebarWidth();
    applyPanelRatio();
  });
}

function render() {
  renderWorkspaceHint();
  renderFileTree();
  renderActiveFile();
  applySidebarWidth();
  applyPanelRatio();
}

function renderWorkspaceHint() {
  if (!runtime.supportsFileSystemAccess) {
    elements.workspaceHint.textContent = "当前浏览器不支持本地直写。请使用 Chrome / Edge，并通过“打开文件夹”接入本地目录。";
    return;
  }

  const hasWritableFolder = state.folders.some((folder) => runtime.folderHandles.has(folder.id));
  elements.workspaceHint.textContent = hasWritableFolder
    ? "当前已连接本地文件夹，创建和保存会直接写入磁盘。"
    : "当前未连接本地文件夹。请先使用“打开 -> 打开文件夹”，否则无法创建本地文件。";
}

function toggleMenu(event, menu) {
  event.stopPropagation();
  event.preventDefault();
  if (activeMenu === menu) {
    closeFloatingMenus();
    return;
  }
  closeFloatingMenus();
  menu.hidden = false;
  activeMenu = menu;
}

function closeFloatingMenus() {
  elements.createMenu.hidden = true;
  elements.openMenu.hidden = true;
  activeMenu = null;
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
  row.className = `tree-row tree-folder${folder.id === state.activeFolderId ? " is-active" : ""}${contextTarget?.type === "folder" && folder.id === contextTarget.id ? " is-context" : ""}`;
  row.style.setProperty("--depth", depth);
  row.addEventListener("click", () => selectFolder(folder.id));
  row.addEventListener("contextmenu", (event) => openFolderContextMenu(event, folder.id));

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "tree-toggle";
  toggle.textContent = isFolderExpanded(folder.id) ? "▾" : "▸";
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFolder(folder.id);
  });

  const name = document.createElement("button");
  name.type = "button";
  name.className = "tree-label";
  name.innerHTML = `<span class="tree-icon">⌘</span><span>${escapeHtml(folder.name)}</span>`;
  name.addEventListener("click", (event) => {
    event.stopPropagation();
    selectFolder(folder.id);
  });
  name.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    toggleFolder(folder.id);
  });

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
  button.className = `tree-row tree-file${file.id === state.activeId ? " is-active" : ""}${contextTarget?.type === "file" && file.id === contextTarget.id ? " is-context" : ""}`;
  button.style.setProperty("--depth", depth);
  button.innerHTML = [
    '<span class="tree-file-mark"></span>',
    `<span class="tree-label"><span class="tree-icon">#</span><span>${escapeHtml(file.name)}</span></span>`,
    `<span class="tree-meta">${file.source === "local" ? "LOCAL" : formatTime(file.updatedAt)}</span>`,
  ].join("");

  button.addEventListener("click", () => {
    state.activeId = file.id;
    state.activeFolderId = file.folderId;
    ensureFolderPathExpanded(file.folderId);
    persistWorkspace();
    render();
  });
  button.addEventListener("contextmenu", (event) => openFileContextMenu(event, file.id));

  return button;
}

function renderActiveFile() {
  const activeFile = getActiveFile();
  if (!activeFile) {
    return;
  }

  elements.titleInput.value = activeFile.name;
  elements.titleInput.dataset.originalName = activeFile.name;
  elements.titleInput.readOnly = false;
  elements.titleInput.title = activeFile.source === "local" && !runtime.folderHandles.has(activeFile.folderId)
    ? "这个本地文件缺少父目录权限，暂时不能在网页内重命名"
    : "";
  elements.editor.value = activeFile.content;
  elements.preview.innerHTML = renderMarkdown(activeFile.content);
  elements.wordCount.textContent = `${countWords(activeFile.content)} 字`;
}

function getActiveFile() {
  return state.files.find((file) => file.id === state.activeId) || state.files[0] || null;
}

async function createFile(parentFolderId = state.activeFolderId || getActiveFile()?.folderId || getDefaultFolderId()) {
  const resolvedFolderId = resolveWritableFolderId(parentFolderId);
  const parentHandle = runtime.folderHandles.get(resolvedFolderId);
  if (!parentHandle) {
    elements.saveIndicator.textContent = "请先打开本地文件夹";
    return;
  }
  const id = crypto.randomUUID();
  const name = nextUntitledName(resolvedFolderId);
  let fileHandle = null;

  if (parentHandle) {
    try {
      fileHandle = await parentHandle.getFileHandle(name, { create: true });
    } catch (error) {
      elements.saveIndicator.textContent = "创建失败";
      console.error("Failed to create local file", error);
      return;
    }
  }

  state.files.unshift({
    id,
    folderId: resolvedFolderId,
    name,
    content: "",
    updatedAt: Date.now(),
    source: "local",
  });

  if (fileHandle) {
    runtime.fileHandles.set(id, fileHandle);
    try {
      await writeFileHandle(fileHandle, "");
    } catch (error) {
      elements.saveIndicator.textContent = "初始化失败";
      console.error("Failed to initialize local file", error);
    }
  }
  state.activeId = id;
  state.activeFolderId = resolvedFolderId;
  ensureFolderPathExpanded(resolvedFolderId);
  persistWorkspace();
  render();
  elements.editor.focus();
  elements.saveIndicator.textContent = "本地已创建";
}

async function createFolder(parentFolderId = state.activeFolderId || getActiveFile()?.folderId || null) {
  const resolvedParentId = resolveWritableFolderId(parentFolderId);
  const id = crypto.randomUUID();
  const name = nextFolderName(resolvedParentId);
  const parentHandle = resolvedParentId ? runtime.folderHandles.get(resolvedParentId) : null;
  if (!parentHandle) {
    elements.saveIndicator.textContent = "请先打开本地文件夹";
    return;
  }
  let folderHandle = null;

  if (resolvedParentId && parentHandle) {
    try {
      folderHandle = await parentHandle.getDirectoryHandle(name, { create: true });
    } catch (error) {
      elements.saveIndicator.textContent = "创建失败";
      console.error("Failed to create local folder", error);
      return;
    }
  }

  state.folders.push({
    id,
    name,
    parentId: resolvedParentId,
  });

  if (folderHandle) {
    runtime.folderHandles.set(id, folderHandle);
  }
  state.activeFolderId = id;
  state.expandedFolders.push(id);
  if (resolvedParentId) {
    ensureFolderPathExpanded(resolvedParentId);
  }
  persistWorkspace();
  render();
}

async function deleteActiveFile() {
  const activeFile = getActiveFile();
  if (!activeFile) {
    return;
  }
  closeContextMenu();

  if (activeFile.source === "local") {
    try {
      await deleteLocalFile(activeFile);
    } catch (error) {
      elements.saveIndicator.textContent = "删除失败";
      console.error("Failed to delete local file", error);
      return;
    }
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
    state.activeFolderId = fallbackFolderId;
    ensureFolderPathExpanded(fallbackFolderId);
    persistWorkspace();
    render();
    return;
  }

  state.files = state.files.filter((file) => file.id !== activeFile.id);
  state.activeId = state.files[0]?.id || null;
  state.activeFolderId = getActiveFile()?.folderId || getDefaultFolderId();
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
  queueDiskSync(state.activeId);
}

function toggleFolder(folderId) {
  closeContextMenu();
  if (isFolderExpanded(folderId)) {
    state.expandedFolders = state.expandedFolders.filter((id) => id !== folderId);
  } else {
    state.expandedFolders.push(folderId);
  }
  persistWorkspace();
  render();
}

function selectFolder(folderId) {
  state.activeFolderId = folderId;
  ensureFolderPathExpanded(folderId);
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

function queueDiskSync(fileId) {
  clearTimeout(diskSaveTimer);
  const file = state.files.find((entry) => entry.id === fileId);
  if (!file || file.source !== "local" || !runtime.fileHandles.has(file.id)) {
    return;
  }

  diskSaveTimer = window.setTimeout(async () => {
    try {
      await writeFileHandle(runtime.fileHandles.get(file.id), file.content);
      elements.saveIndicator.textContent = "已同步";
    } catch (error) {
      elements.saveIndicator.textContent = "同步失败";
      console.error("Failed to sync file to disk", error);
    }
  }, 280);
}

async function saveActiveFile() {
  clearTimeout(diskSaveTimer);
  const activeFile = getActiveFile();
  if (!activeFile) {
    return;
  }

  persistWorkspace();

  if (activeFile.source !== "local") {
    elements.saveIndicator.textContent = "已保存";
    return;
  }

  const handle = runtime.fileHandles.get(activeFile.id);
  if (!handle) {
    elements.saveIndicator.textContent = "无法写回本地";
    return;
  }

  try {
    await writeFileHandle(handle, activeFile.content);
    elements.saveIndicator.textContent = "已同步";
  } catch (error) {
    elements.saveIndicator.textContent = "同步失败";
    console.error("Failed to save active local file", error);
  }
}

async function commitTitleRename() {
  const activeFile = getActiveFile();
  if (!activeFile) {
    return;
  }

  const nextName = normalizeFileName(elements.titleInput.value) || activeFile.name;
  const prevName = elements.titleInput.dataset.originalName || activeFile.name;
  if (nextName === prevName) {
    elements.titleInput.value = activeFile.name;
    return;
  }

  if (activeFile.source === "local") {
    try {
      await renameLocalFile(activeFile, nextName);
    } catch (error) {
      elements.saveIndicator.textContent = "重命名失败";
      elements.titleInput.value = activeFile.name;
      console.error("Failed to rename local file", error);
      return;
    }
  }

  state.files = state.files.map((file) => (
    file.id === activeFile.id
      ? { ...file, name: nextName, updatedAt: Date.now() }
      : file
  ));
  persistWorkspace();
  render();
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

async function chooseLocalFiles() {
  if (runtime.supportsFileSystemAccess) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "Markdown Files",
            accept: { "text/markdown": [".md", ".markdown"], "text/plain": [".txt"] },
          },
        ],
      });
      await ingestPickedFiles(handles);
      return;
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Failed to pick local files", error);
      }
      return;
    }
  }
  elements.fileInput.click();
}

async function chooseLocalFolder() {
  if (runtime.supportsFileSystemAccess) {
    try {
      const handle = await window.showDirectoryPicker();
      await ingestPickedDirectory(handle);
      return;
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Failed to pick local folder", error);
      }
      return;
    }
  }
  elements.folderInput.click();
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
        source: "workspace",
      });
    });
    state.activeId = state.files[0].id;
    state.activeFolderId = targetFolderId;
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
        source: "workspace",
      });
    });

    state.activeId = state.files[state.files.length - files.length]?.id || state.activeId;
    state.activeFolderId = getActiveFile()?.folderId || rootImportId;
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

async function ingestPickedFiles(handles) {
  let rootFolderId = state.folders.find((folder) => folder.name === "Picked Files" && folder.parentId === null)?.id;
  if (!rootFolderId) {
    rootFolderId = crypto.randomUUID();
    state.folders.push({
      id: rootFolderId,
      name: "Picked Files",
      parentId: null,
    });
  }

  state.expandedFolders.push(rootFolderId);
  for (const handle of handles) {
    const file = await handle.getFile();
    const id = crypto.randomUUID();
    state.files.unshift({
      id,
      folderId: rootFolderId,
      name: normalizeFileName(handle.name),
      content: await file.text(),
      updatedAt: Date.now(),
      source: "local",
    });
    runtime.fileHandles.set(id, handle);
    state.activeId = id;
    state.activeFolderId = rootFolderId;
  }

  ensureFolderPathExpanded(rootFolderId);
  persistWorkspace();
  render();
}

async function ingestPickedDirectory(directoryHandle) {
  const rootFolderId = crypto.randomUUID();
  state.folders.push({
    id: rootFolderId,
    name: directoryHandle.name,
    parentId: null,
  });
  runtime.folderHandles.set(rootFolderId, directoryHandle);
  state.expandedFolders.push(rootFolderId);
  state.activeFolderId = rootFolderId;

  await walkDirectoryHandle(directoryHandle, rootFolderId);

  const newestLocalFile = [...state.files].reverse().find((file) => file.folderId === rootFolderId || isFolderDescendant(file.folderId, rootFolderId));
  if (newestLocalFile) {
    state.activeId = newestLocalFile.id;
  }
  ensureFolderPathExpanded(rootFolderId);
  persistWorkspace();
  render();
}

async function walkDirectoryHandle(directoryHandle, parentFolderId) {
  for await (const entry of directoryHandle.values()) {
    if (entry.kind === "directory") {
      const folderId = crypto.randomUUID();
      state.folders.push({
        id: folderId,
        name: entry.name,
        parentId: parentFolderId,
      });
      runtime.folderHandles.set(folderId, entry);
      state.expandedFolders.push(folderId);
      await walkDirectoryHandle(entry, folderId);
      continue;
    }

    if (!/\.(md|markdown|txt)$/i.test(entry.name)) {
      continue;
    }

    const file = await entry.getFile();
    const fileId = crypto.randomUUID();
    state.files.push({
      id: fileId,
      folderId: parentFolderId,
      name: normalizeFileName(entry.name),
      content: await file.text(),
      updatedAt: Date.now(),
      source: "local",
    });
    runtime.fileHandles.set(fileId, entry);
  }
}

async function writeFileHandle(handle, content) {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function renameLocalFile(file, nextName) {
  const fileHandle = runtime.fileHandles.get(file.id);
  const folderHandle = runtime.folderHandles.get(file.folderId);
  if (!fileHandle || !folderHandle) {
    throw new Error("Missing local file or folder handle");
  }

  const sourceFile = await fileHandle.getFile();
  const nextHandle = await folderHandle.getFileHandle(nextName, { create: true });
  await writeFileHandle(nextHandle, await sourceFile.text());
  if (nextName !== file.name) {
    await folderHandle.removeEntry(file.name);
  }
  runtime.fileHandles.set(file.id, nextHandle);
}

function startResize(event) {
  closeContextMenu();
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
  closeContextMenu();
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

function openContextMenu(event, fileId) {
  event.preventDefault();
  closeFloatingMenus();
  const file = state.files.find((entry) => entry.id === fileId);
  const canMutateOnDisk = file?.source !== "local" || runtime.folderHandles.has(file.folderId);
  contextTarget = { type: "file", id: fileId };
  state.activeId = fileId;
  state.activeFolderId = file.folderId;
  elements.contextRename.hidden = false;
  elements.contextMove.disabled = !canMutateOnDisk;
  elements.contextMove.hidden = false;
  elements.contextDelete.disabled = !canMutateOnDisk;
  elements.contextDelete.hidden = false;
  elements.contextCreateFile.hidden = true;
  elements.contextCreateFolder.hidden = true;
  elements.contextMenu.hidden = false;
  positionContextMenu(event.clientX, event.clientY);
  persistWorkspace();
  render();
}

function openFileContextMenu(event, fileId) {
  openContextMenu(event, fileId);
}

function openFolderContextMenu(event, folderId) {
  event.preventDefault();
  closeFloatingMenus();
  contextTarget = { type: "folder", id: folderId };
  elements.contextRename.hidden = true;
  elements.contextMove.hidden = true;
  elements.contextDelete.hidden = true;
  elements.contextCreateFile.hidden = false;
  elements.contextCreateFolder.hidden = false;
  elements.contextMenu.hidden = false;
  positionContextMenu(event.clientX, event.clientY);
  render();
}

function positionContextMenu(x, y) {
  const menuWidth = 180;
  const menuHeight = contextTarget?.type === "folder" ? 96 : 144;
  const left = Math.min(x, window.innerWidth - menuWidth - 12);
  const top = Math.min(y, window.innerHeight - menuHeight - 12);
  elements.contextMenu.style.left = `${Math.max(12, left)}px`;
  elements.contextMenu.style.top = `${Math.max(12, top)}px`;
}

function closeContextMenu() {
  if (contextTarget === null && elements.contextMenu.hidden) {
    return false;
  }
  contextTarget = null;
  elements.contextMenu.hidden = true;
  return true;
}

function openMoveDialogFromContext() {
  if (!contextTarget || contextTarget.type !== "file") {
    return;
  }
  const file = state.files.find((entry) => entry.id === contextTarget.id);
  if (!file) {
    closeContextMenu();
    return;
  }

  movingFileId = file.id;
  elements.moveDialogFile.textContent = `当前文件：${file.name}`;
  const folderOptions = state.folders
    .slice()
    .sort(sortByName)
    .map((folder) => {
      const disabled = file.source === "local" && !runtime.folderHandles.has(folder.id);
      return `<option value="${folder.id}"${folder.id === file.folderId ? " selected" : ""}${disabled ? " disabled" : ""}>${escapeHtml(getFolderPathLabel(folder.id))}${disabled ? " (不可写)" : ""}</option>`;
    })
    .join("");
  elements.moveTargetSelect.innerHTML = folderOptions;
  elements.moveDialog.hidden = false;
  closeContextMenu();
}

function closeMoveDialog() {
  elements.moveDialog.hidden = true;
  movingFileId = null;
}

async function confirmMoveFile() {
  if (!movingFileId) {
    return;
  }
  const file = state.files.find((entry) => entry.id === movingFileId);
  if (!file) {
    closeMoveDialog();
    return;
  }
  const nextFolderId = elements.moveTargetSelect.value;
  if (file.source === "local") {
    try {
      await moveLocalFile(file, nextFolderId);
    } catch (error) {
      elements.saveIndicator.textContent = "移动失败";
      console.error("Failed to move local file", error);
      return;
    }
  }
  file.folderId = nextFolderId;
  file.updatedAt = Date.now();
  state.activeId = file.id;
  state.activeFolderId = nextFolderId;
  ensureFolderPathExpanded(nextFolderId);
  persistWorkspace();
  closeMoveDialog();
  render();
}

function deleteFileFromContext() {
  if (!contextTarget || contextTarget.type !== "file") {
    return;
  }
  const fileId = contextTarget.id;
  closeContextMenu();
  deleteFileById(fileId);
}

function triggerRenameFromContext() {
  if (!contextTarget || contextTarget.type !== "file") {
    return;
  }
  const file = state.files.find((entry) => entry.id === contextTarget.id);
  closeContextMenu();
  if (!file) {
    return;
  }
  state.activeId = file.id;
  state.activeFolderId = file.folderId;
  render();
  elements.titleInput.focus();
  elements.titleInput.select();
}

function createFileFromContextFolder() {
  if (!contextTarget || contextTarget.type !== "folder") {
    return;
  }
  const folderId = contextTarget.id;
  closeContextMenu();
  state.activeFolderId = folderId;
  createFile(folderId);
}

function createFolderFromContextFolder() {
  if (!contextTarget || contextTarget.type !== "folder") {
    return;
  }
  const folderId = contextTarget.id;
  closeContextMenu();
  state.activeFolderId = folderId;
  createFolder(folderId);
}

async function deleteFileById(fileId) {
  const targetFile = state.files.find((file) => file.id === fileId);
  if (!targetFile) {
    return;
  }
  if (targetFile.source === "local") {
    try {
      await deleteLocalFile(targetFile);
    } catch (error) {
      elements.saveIndicator.textContent = "删除失败";
      console.error("Failed to delete local file", error);
      return;
    }
  }
  if (state.files.length === 1) {
    state.activeId = targetFile.id;
    deleteActiveFile();
    return;
  }
  state.files = state.files.filter((file) => file.id !== fileId);
  if (state.activeId === fileId) {
    state.activeId = state.files[0]?.id || null;
  }
  state.activeFolderId = getActiveFile()?.folderId || getDefaultFolderId();
  ensureFolderPathExpanded(getActiveFile()?.folderId);
  persistWorkspace();
  render();
}

async function moveLocalFile(file, nextFolderId) {
  const sourceHandle = runtime.fileHandles.get(file.id);
  const targetFolderHandle = runtime.folderHandles.get(nextFolderId);
  const sourceFolderHandle = runtime.folderHandles.get(file.folderId);
  if (!sourceHandle || !targetFolderHandle || !sourceFolderHandle) {
    throw new Error("Missing local file handles");
  }

  const sourceFile = await sourceHandle.getFile();
  const nextHandle = await targetFolderHandle.getFileHandle(file.name, { create: true });
  await writeFileHandle(nextHandle, await sourceFile.text());
  await sourceFolderHandle.removeEntry(file.name);
  runtime.fileHandles.set(file.id, nextHandle);
}

async function deleteLocalFile(file) {
  const folderHandle = runtime.folderHandles.get(file.folderId);
  if (!folderHandle) {
    throw new Error("Missing local folder handle");
  }
  await folderHandle.removeEntry(file.name);
  runtime.fileHandles.delete(file.id);
}

function handleDocumentClick(event) {
  if (!event.target.closest(".menu-anchor")) {
    closeFloatingMenus();
  }
  if (!event.target.closest(".context-menu")) {
    if (closeContextMenu()) {
      render();
    }
  }
}

function handleDocumentKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveActiveFile();
    return;
  }

  if (event.key !== "Escape") {
    return;
  }
  closeFloatingMenus();
  const closedContextMenu = closeContextMenu();
  closeMoveDialog();
  if (closedContextMenu) {
    render();
  }
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

function getFolderPathLabel(folderId) {
  const segments = [];
  let current = getFolderById(folderId);
  while (current) {
    segments.unshift(current.name);
    current = getFolderById(current.parentId);
  }
  return segments.join(" / ");
}

function isFolderDescendant(folderId, ancestorId) {
  let currentId = folderId;
  while (currentId) {
    if (currentId === ancestorId) {
      return true;
    }
    currentId = getFolderById(currentId)?.parentId || null;
  }
  return false;
}

function getDefaultFolderId() {
  return state.folders[0]?.id;
}

function resolveWritableFolderId(folderId) {
  let currentId = folderId;
  while (currentId) {
    if (runtime.folderHandles.has(currentId)) {
      return currentId;
    }
    currentId = getFolderById(currentId)?.parentId || null;
  }
  return folderId;
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
