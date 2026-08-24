(function () {
  const nav = document.querySelector("body > .site-nav");
  const desktopLinks = nav?.querySelector(".nav-links");
  if (!nav || !desktopLinks || nav.querySelector(".site-mobile-menu")) return;

  desktopLinks.querySelectorAll("a[target='_blank']").forEach((link) => {
    link.removeAttribute("target");
    link.removeAttribute("rel");
    link.removeAttribute("aria-label");
  });

  const current = desktopLinks.querySelector("a[aria-current='page']")?.textContent.trim() || "导航";
  const menu = document.createElement("details");
  menu.className = "site-mobile-menu";

  const summary = document.createElement("summary");
  const currentLabel = document.createElement("span");
  currentLabel.className = "site-mobile-current";
  currentLabel.textContent = current;
  summary.append(currentLabel);

  const panel = document.createElement("div");
  panel.className = "site-mobile-panel";
  Array.from(desktopLinks.querySelectorAll("a")).forEach((link) => {
    const clone = link.cloneNode(true);
    clone.removeAttribute("target");
    clone.removeAttribute("rel");
    clone.removeAttribute("aria-label");
    clone.addEventListener("click", () => menu.removeAttribute("open"));
    panel.append(clone);
  });

  menu.append(summary, panel);
  nav.append(menu);

  document.addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target)) menu.removeAttribute("open");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.removeAttribute("open");
      summary.focus();
    }
  });
})();
