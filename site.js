const repo = {
  owner: "BakerYoung",
  name: "trimark",
  url: "https://github.com/BakerYoung/trimark",
  pagesUrl: "./editor.html",
};

const els = {
  starCount: document.querySelector("#repo-stars"),
  starCountInline: document.querySelector("#repo-stars-inline"),
  repoUrl: document.querySelector("#repo-url"),
  repoUpdated: document.querySelector("#repo-updated"),
  repoVisibility: document.querySelector("#repo-visibility"),
  experienceLinks: document.querySelectorAll("[data-experience-link]"),
  repoLinks: document.querySelectorAll("[data-repo-link]"),
};

bootstrap();

async function bootstrap() {
  applyStaticLinks();
  await loadRepoMeta();
}

function applyStaticLinks() {
  els.repoUrl.textContent = repo.url;
  els.repoUrl.href = repo.url;

  els.experienceLinks.forEach((link) => {
    link.href = repo.pagesUrl;
  });

  els.repoLinks.forEach((link) => {
    link.href = repo.url;
  });
}

async function loadRepoMeta() {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`);
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const starText = formatNumber(data.stargazers_count ?? 0);
    els.starCount.textContent = starText;
    els.starCountInline.textContent = starText;
    els.repoUpdated.textContent = formatDate(data.pushed_at);
    els.repoVisibility.textContent = data.visibility || "public";
  } catch (error) {
    console.error("Failed to load repo metadata", error);
    els.starCount.textContent = "--";
    els.starCountInline.textContent = "--";
    els.repoUpdated.textContent = "加载失败";
    els.repoVisibility.textContent = "unknown";
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDate(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
