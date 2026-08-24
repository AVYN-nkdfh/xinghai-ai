(function () {
  const list = document.querySelector("[data-course-list]");
  const count = document.querySelector("[data-course-count]");
  const courses = Array.isArray(window.TODO_COURSES) ? window.TODO_COURSES : [];

  if (count) count.textContent = `${courses.length} 份`;
  if (!list) return;

  if (!courses.length) {
    list.innerHTML = '<div class="catalog-empty" role="status">课程作品正在准备中。</div>';
    return;
  }

  list.innerHTML = courses.map((course, index) => `
    <article class="course-card" style="--card-index:'${String(index + 1).padStart(2, "0")}'">
      <a class="course-cover" href="${course.href}" aria-label="打开课程作品：${course.title}">
        <img src="${course.cover}" alt="${course.title}作品封面" loading="eager" decoding="async">
        <span>${course.status}</span>
      </a>
      <div class="course-copy">
        <div class="course-kicker">${course.tags.join(" · ")}</div>
        <h2 class="serif"><a href="${course.href}">${course.title}</a></h2>
        <p>${course.question}</p>
        <div class="course-meta">
          <span>作者：${course.author}</span>
          <span>${course.duration}</span>
          <span>${course.voiceMode}</span>
        </div>
      </div>
      <a class="course-open" href="${course.href}">打开作品 <span aria-hidden="true">→</span></a>
    </article>
  `).join("");

  list.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => image.closest(".course-cover")?.classList.add("is-missing"), { once: true });
  });
})();
