const state = { cars: [] };
let lastTrigger = null;

function cardTemplate(car) {
  return `
    <button class="card reveal" type="button" data-id="${car.id}" data-type="${car.type}" aria-label="查看概念汽车：${car.name}">
      <div class="imgbox">
        <img src="${car.image}" alt="${car.name}">
        <div class="badge">${car.type}</div>
        <div class="num">${String(car.id).padStart(2, "0")}</div>
      </div>
      <div class="body">
        <p class="animal">${car.animal}灵感 · ${car.series}</p>
        <h3>${car.name}</h3>
        <p class="desc">${car.desc}</p>
        <div class="specs">
          <div><span>最高时速</span><strong>${car.speed}</strong></div>
          <div><span>0-100</span><strong>${car.accel}</strong></div>
          <div><span>动力</span><strong>${car.power}</strong></div>
        </div>
        <p class="feature">动物元素：${car.feature}</p>
      </div>
    </button>
  `;
}

function renderCars(cars) {
  const classic = cars.filter(car => car.series === "经典系列");
  const added = cars.filter(car => car.series === "新增系列");

  document.querySelector("#classicGrid").innerHTML = classic.map(cardTemplate).join("");
  document.querySelector("#newGrid").innerHTML = added.map(cardTemplate).join("");

  bindCards();
  bindReveal();
}

function bindCards() {
  document.querySelectorAll(".card").forEach(card => {
    const open = () => openCar(Number(card.dataset.id), card);
    card.addEventListener("click", open);
  });
}

function openCar(id, trigger) {
  const car = state.cars.find(item => item.id === id);
  if (!car) return;

  document.querySelector("#mImg").src = car.image;
  document.querySelector("#mImg").alt = car.name;
  document.querySelector("#mAnimal").textContent = `${car.animal}灵感 · ${car.series} · ${car.type}`;
  document.querySelector("#mTitle").textContent = car.name;
  document.querySelector("#mDesc").textContent = car.desc;
  document.querySelector("#mSpeed").textContent = car.speed;
  document.querySelector("#mAccel").textContent = car.accel;
  document.querySelector("#mPower").textContent = car.power;
  document.querySelector("#mFeature").textContent = `动物元素：${car.feature}`;

  lastTrigger = trigger || document.activeElement;
  document.querySelector("#modal").classList.add("show");
  document.querySelector("#modal").setAttribute("aria-hidden", "false");
  document.body.classList.add("lock");
  document.querySelector("#close").focus();
}

function closeCar() {
  document.querySelector("#modal").classList.remove("show");
  document.querySelector("#modal").setAttribute("aria-hidden", "true");
  document.body.classList.remove("lock");
  if (lastTrigger && typeof lastTrigger.focus === "function") lastTrigger.focus();
}

function bindFilters() {
  document.querySelectorAll(".filter").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach(item => item.classList.remove("active"));
      button.classList.add("active");

      const target = button.dataset.target;
      document.querySelectorAll(".card").forEach(card => {
        card.style.display = target === "all" || card.dataset.type.includes(target) ? "" : "none";
      });
    });
  });
}

function bindReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add("show");
    });
  }, { threshold: 0.07 });

  document.querySelectorAll(".reveal").forEach(element => observer.observe(element));
}

async function init() {
  try {
    const response = await fetch("data/cars.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.cars = await response.json();
    renderCars(state.cars);
  } catch (error) {
    console.error(error);
    document.querySelector("#classicGrid").innerHTML =
      '<div class="loading">读取车型数据失败。请使用本地服务器打开项目，不要直接双击 index.html。</div>';
  }

  bindFilters();
  document.querySelector("#close").addEventListener("click", closeCar);
  document.querySelector("#modal").addEventListener("click", event => {
    if (event.target.id === "modal") closeCar();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeCar();
  });
}

init();
