(function () {
  const source = window.VCT_DATA || { teams: [], rosters: {}, matches: [] };
  const personnel = window.VCT_PERSONNEL || {};
  const state = { query: "", region: "all", lastTrigger: null };
  const logoPath = (abbr) => `/projects/valorant-teams/assets/logos/${encodeURIComponent(abbr)}.png`;
  const winRate = (team) => {
    const total = team.wins + team.losses;
    return total ? Math.round((team.wins / total) * 1000) / 10 : 0;
  };
  const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function teamButton(team, index, top = false) {
    const rate = winRate(team);
    if (top) return `<button class="top-card" type="button" data-team="${escapeHtml(team.abbr)}"><span class="ghost-rank">${index + 1}</span><img class="team-logo" src="${logoPath(team.abbr)}" alt="${escapeHtml(team.name)} 队标"><h3>${escapeHtml(team.name)}</h3><div class="points">${team.score} pts</div><p class="small">${escapeHtml(team.region)} · ${team.wins}胜 ${team.losses}负 · ${rate}%</p></button>`;
    return `<button class="team-card" type="button" data-team="${escapeHtml(team.abbr)}"><img class="team-logo" src="${logoPath(team.abbr)}" alt="${escapeHtml(team.name)} 队标"><span><span class="team-name">${escapeHtml(team.name)}</span><span class="team-meta">${escapeHtml(team.abbr)} · ${escapeHtml(team.region)}</span><span class="team-metrics"><span>${team.wins} 胜</span><span>${team.losses} 负</span><span>${rate}% 胜率</span></span></span><span class="right"><span class="rank">#${team.rank}</span><span class="points">${team.score} pts</span></span></button>`;
  }

  function renderTop() {
    document.querySelector("#topTeams").innerHTML = source.teams.slice(0, 3).map((team, index) => teamButton(team, index, true)).join("");
    document.querySelector("#teamCount").textContent = source.teams.length;
  }

  function renderTeams() {
    const query = state.query.toLowerCase();
    const filtered = source.teams.filter((team) => (state.region === "all" || team.region === state.region) && `${team.name} ${team.abbr}`.toLowerCase().includes(query));
    document.querySelector("#teamGrid").innerHTML = filtered.map((team) => teamButton(team)).join("");
    document.querySelector("#resultCount").textContent = `共 ${filtered.length} 支战队`;
    document.querySelector("#emptyState").hidden = filtered.length > 0;
  }

  function renderMatches() {
    document.querySelector("#matchGrid").innerHTML = source.matches.map((match) => `<article class="match-card"><div><b>${escapeHtml(match.date)}</b><p class="small">${escapeHtml(match.event)}</p></div><div class="match-score"><span>${escapeHtml(match.a)}</span><span class="score">${match.sa} : ${match.sb}</span><span>${escapeHtml(match.b)}</span></div></article>`).join("");
  }

  function openTeam(abbr, trigger) {
    const team = source.teams.find((item) => item.abbr === abbr);
    if (!team) return;
    const info = personnel[abbr] || { players: (source.rosters[abbr] || []).map((name) => ({ name, status: "阵容快照" })), staff: [] };
    state.lastTrigger = trigger;
    document.querySelector("#dialogLogo").src = logoPath(team.abbr);
    document.querySelector("#dialogLogo").alt = `${team.name} 队标`;
    document.querySelector("#dialogRegion").textContent = `${team.region} · #${team.rank}`;
    document.querySelector("#dialogTitle").textContent = team.name;
    document.querySelector("#dialogStats").textContent = `${team.score} pts · ${team.wins}胜 ${team.losses}负 · ${winRate(team)}% 胜率`;
    document.querySelector("#playerList").innerHTML = info.players.length ? info.players.map((person) => `<span class="person">${escapeHtml(person.name)}<em>${escapeHtml(person.status || "选手")}</em></span>`).join("") : '<span class="small">当前快照没有阵容记录。</span>';
    document.querySelector("#staffList").innerHTML = info.staff.length ? info.staff.map((person) => `<span class="person">${escapeHtml(person.name)}<em>${escapeHtml(person.role || "工作人员")}</em></span>`).join("") : '<span class="small">当前快照没有工作人员记录。</span>';
    const dialog = document.querySelector("#teamDialog");
    dialog.classList.add("open");
    dialog.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.querySelector("#closeDialog").focus();
  }

  function closeTeam() {
    const dialog = document.querySelector("#teamDialog");
    dialog.classList.remove("open");
    dialog.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (state.lastTrigger) state.lastTrigger.focus();
  }

  document.addEventListener("click", (event) => {
    const team = event.target.closest("[data-team]");
    if (team) openTeam(team.dataset.team, team);
  });
  document.querySelector("#teamSearch").addEventListener("input", (event) => { state.query = event.target.value.trim(); renderTeams(); });
  document.querySelector("#regionFilter").addEventListener("change", (event) => { state.region = event.target.value; renderTeams(); });
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", item === button ? "true" : "false"); });
    document.querySelector("#teamView").hidden = button.dataset.view !== "teams";
    document.querySelector("#matchView").hidden = button.dataset.view !== "matches";
  }));
  document.querySelector("#closeDialog").addEventListener("click", closeTeam);
  document.querySelector("#teamDialog").addEventListener("click", (event) => { if (event.target.id === "teamDialog") closeTeam(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && document.querySelector("#teamDialog").classList.contains("open")) closeTeam(); });

  renderTop();
  renderTeams();
  renderMatches();
})();
