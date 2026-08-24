(function () {
  const audio = document.querySelector("[data-course-audio]");
  const toggle = document.querySelector("[data-player-toggle]");
  const seek = document.querySelector("[data-player-seek]");
  const current = document.querySelector("[data-player-current]");
  const duration = document.querySelector("[data-player-duration]");
  const state = document.querySelector("[data-player-state]");
  const player = document.querySelector("[data-player]");

  if (!audio || !toggle || !seek || !current || !duration || !state || !player) return;

  const formatTime = (value) => {
    if (!Number.isFinite(value) || value < 0) return "00:00";
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const setPlaying = (playing) => {
    player.dataset.status = playing ? "playing" : "paused";
    toggle.setAttribute("aria-label", playing ? "暂停课程" : "播放课程");
    toggle.querySelector("span").textContent = playing ? "暂停" : "播放";
    state.textContent = playing ? "正在播放" : audio.ended ? "播放完成" : "准备播放";
  };

  const syncProgress = () => {
    const total = Number.isFinite(audio.duration) ? audio.duration : 0;
    seek.max = String(total || 1);
    if (!seek.matches(":active")) seek.value = String(audio.currentTime || 0);
    seek.style.setProperty("--progress", `${total ? (audio.currentTime / total) * 100 : 0}%`);
    current.textContent = formatTime(audio.currentTime);
    duration.textContent = formatTime(total);
  };

  toggle.addEventListener("click", async () => {
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      if (audio.ended || audio.currentTime >= audio.duration - 0.1) audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      player.dataset.status = "error";
      state.textContent = "暂时无法播放，请稍后重试";
    }
  });

  seek.addEventListener("input", () => {
    audio.currentTime = Number(seek.value);
    syncProgress();
  });

  document.querySelectorAll("[data-chapter-time]").forEach((button) => {
    button.addEventListener("click", async () => {
      const chapterTime = Number(button.dataset.chapterTime || 0);
      try {
        if (audio.ended) audio.currentTime = 0;
        await audio.play();
        audio.currentTime = chapterTime;
        syncProgress();
      } catch (error) {
        player.dataset.status = "error";
        state.textContent = "暂时无法播放，请稍后重试";
      }
    });
  });

  audio.addEventListener("loadedmetadata", syncProgress);
  audio.addEventListener("durationchange", syncProgress);
  audio.addEventListener("timeupdate", syncProgress);
  audio.addEventListener("play", () => setPlaying(true));
  audio.addEventListener("pause", () => setPlaying(false));
  audio.addEventListener("ended", () => setPlaying(false));
  audio.addEventListener("error", () => {
    player.dataset.status = "error";
    toggle.disabled = true;
    state.textContent = "音频加载失败，逐字稿仍可阅读";
  });

  syncProgress();
})();
