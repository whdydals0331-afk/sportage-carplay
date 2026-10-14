import {
  NAV_APPS, MUSIC_APPS, DEFAULT_ITEMS,
  navUrl, pinUrl, telUrl, msToKmh, haversineKm, shouldAddSegment,
  headingLabel, maintenanceStatus, normalizeState, formatKm, timeAgo,
} from "./lib.js";

const VERSION = "1.0.1";
const KEY = "sportage-carplay:v1";
const $ = (s) => document.querySelector(s);

// ── 저장 ────────────────────────────────────────────────
function load() {
  try { return normalizeState(JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch { return normalizeState({}); }
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { toast("저장 공간에 쓸 수 없습니다 (개인정보 보호 모드인지 확인)"); }
}

// ── 작은 도우미 ─────────────────────────────────────────
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "style") n.setAttribute("style", v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function tap() { try { navigator.vibrate?.(15); } catch { /* iOS 는 미지원 */ } }
function openUrl(url) { if (url) window.location.href = url; }

// 다른 앱(내비·음악)으로 넘기기. 1.5초 뒤에도 이 화면이 그대로 보이면
// 앱이 안 열린 것 → 설치 여부를 안내 (iOS 는 미설치 앱이면 아무 반응이 없음)
function openApp(url, label) {
  if (!url) return;
  let left = false;
  const mark = () => { left = true; };
  document.addEventListener("visibilitychange", mark, { once: true });
  window.addEventListener("pagehide", mark, { once: true });
  window.addEventListener("blur", mark, { once: true });
  openUrl(url);
  setTimeout(() => {
    document.removeEventListener("visibilitychange", mark);
    window.removeEventListener("pagehide", mark);
    window.removeEventListener("blur", mark);
    if (!left && document.visibilityState === "visible") toast(`${label} 앱이 열리지 않았습니다. 설치되어 있는지 확인하거나 다른 앱을 골라주세요`);
  }, 1500);
}

// ── 화면 전환 ───────────────────────────────────────────
const RENDER = {};
const SCREENS = [...document.querySelectorAll(".screen")].map((s) => s.dataset.screen);
function go(name) {
  if (!SCREENS.includes(name)) name = "home";
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
  RENDER[name]?.();
  $(".stage").scrollTop = 0;
  if (location.hash.slice(1) !== name || location.search) history.replaceState(null, "", location.pathname + (name === "home" ? "" : `#${name}`)); // ?dest= 등은 지워서 새로고침 때 다시 실행되지 않게
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-go]");
  if (b) { tap(); go(b.dataset.go); }
});

// ── 시계 ────────────────────────────────────────────────
function tick() {
  const d = new Date();
  $("#clock").textContent = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  $("#date").textContent = d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
}
tick();
setInterval(tick, 10_000);

// ── GPS (속도·방향·주행거리) ─────────────────────────────
const trip = { km: 0, max: 0, movingSec: 0, last: null };
let lastPos = null;
function onPos(p) {
  const { latitude: lat, longitude: lng, speed, heading, accuracy } = p.coords;
  const now = p.timestamp || Date.now();
  lastPos = { lat, lng, accuracy };
  let kmh = msToKmh(speed);
  if (trip.last) {
    const dt = (now - trip.last.t) / 1000;
    const seg = haversineKm(trip.last, { lat, lng });
    if (shouldAddSegment(seg, accuracy, dt)) {
      trip.km += seg;
      trip.movingSec += dt;
      if (kmh == null) kmh = (seg / dt) * 3600; // 속도를 안 주는 기기 대비
    }
  }
  trip.last = { lat, lng, t: now };
  const shown = kmh == null || kmh < 2 ? 0 : Math.round(kmh);
  trip.max = Math.max(trip.max, shown);
  $("#speedNum").textContent = shown;
  $("#barSpeed").textContent = shown;
  $("#heading").textContent = headingLabel(heading);
  $("#maxSpeed").textContent = trip.max;
  $("#tripKm").textContent = trip.km.toFixed(1);
  $("#avgSpeed").textContent = trip.movingSec > 0 ? Math.round(trip.km / (trip.movingSec / 3600)) : 0;
  const chip = $("#gpsChip");
  chip.textContent = accuracy <= 30 ? "GPS 양호" : `GPS ±${Math.round(accuracy)}m`;
  chip.className = "chip ok";
}
function onPosErr(err) {
  const chip = $("#gpsChip");
  chip.className = "chip bad";
  // 원인별로 안내 (권한 차단 / 위치 못 잡음 / 시간초과)
  if (err.code === 1) {
    chip.textContent = "위치 권한 꺼짐";
    toast("설정 > 개인정보 보호 > 위치 서비스 > Safari 웹사이트 를 '앱을 사용하는 동안'으로 바꿔주세요");
  } else if (err.code === 2) chip.textContent = "위치 못 잡음";
  else chip.textContent = "GPS 응답 없음";
}
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
} else {
  $("#gpsChip").textContent = "GPS 미지원";
}
$("#tripReset").addEventListener("click", () => {
  Object.assign(trip, { km: 0, max: 0, movingSec: 0 });
  ["#maxSpeed", "#avgSpeed"].forEach((s) => ($(s).textContent = "0"));
  $("#tripKm").textContent = "0.0";
  toast("주행 기록을 초기화했습니다");
});
function applyHud() {
  $("#speedo").classList.toggle("hud", state.hud);
  $("#hudBtn").classList.toggle("primary", state.hud);
}
$("#hudBtn").addEventListener("click", () => { state.hud = !state.hud; save(); applyHud(); });
applyHud();

// ── 화면 켜두기 (Wake Lock, iOS 16.4+) ──────────────────
let wakeLock = null;
async function setWake(on, silent = false) {
  try {
    if (on) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; $("#wakeBtn").classList.remove("on"); });
      $("#wakeBtn").classList.add("on");
    } else {
      await wakeLock?.release();
      wakeLock = null;
      $("#wakeBtn").classList.remove("on");
    }
  } catch {
    if (silent) return; // 자동 시도는 조용히 (iOS 는 터치 후에만 허용하는 경우가 있음)
    toast("이 기기는 화면 켜두기를 지원하지 않습니다. 설정 > 디스플레이 > 자동 잠금 을 '안 함'으로 해주세요");
  }
}
let wantWake = true;
$("#wakeBtn").addEventListener("click", () => { wantWake = !wakeLock; setWake(wantWake); toast(wantWake ? "화면을 켜둡니다" : "화면 켜두기 해제"); });
// 앱으로 돌아오면 다시 켬 (다른 앱 갔다 오면 자동 해제되기 때문)
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && wantWake && !wakeLock) setWake(true, true); });
if ("wakeLock" in navigator) {
  setWake(true, true);
  // 첫 터치 때 한 번 더 (사용자 동작이 있어야 허용되는 경우)
  document.addEventListener("pointerdown", () => { if (wantWake && !wakeLock) setWake(true, true); }, { once: true });
}

// ── 홈 ─────────────────────────────────────────────────
RENDER.home = () => {
  const q = $("#quickFavs");
  q.replaceChildren(
    ...state.favorites.slice(0, 4).map((f) =>
      el("button", { class: "item", onclick: () => { tap(); openApp(navUrl(state.navApp, f), NAV_APPS.find((a) => a.id === state.navApp).label); } },
        el("span", { class: "em" }, f.icon), el("span", { class: "grow" }, f.name))),
  );
};

// ── 길안내 ──────────────────────────────────────────────
function segment(container, options, current, onPick) {
  container.replaceChildren(
    ...options.map((o) => el("button", { class: o.id === current ? "on" : "", type: "button", onclick: () => { tap(); onPick(o.id); } }, o.label)),
  );
}
RENDER.nav = () => {
  segment($("#navAppSeg"), NAV_APPS, state.navApp, (id) => { state.navApp = id; save(); RENDER.nav(); });
  const list = $("#favList");
  if (!state.favorites.length) {
    list.replaceChildren(el("div", { class: "empty" }, "설정에서 집·회사 같은 목적지를 등록하면 여기서 한 번에 안내가 시작됩니다."));
    return;
  }
  list.replaceChildren(
    ...state.favorites.map((f) =>
      el("button", { class: "item", onclick: () => { tap(); openApp(navUrl(state.navApp, f), NAV_APPS.find((a) => a.id === state.navApp).label); } },
        el("span", { class: "em" }, f.icon),
        el("span", { class: "grow" }, f.name,
          el("span", { class: "sub" }, f.lat != null ? "좌표 저장됨" : "이름으로 검색")),
        el("span", { class: "em" }, "›"))),
  );
};
$("#navSearch").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#navQuery").value.trim();
  if (!name) return;
  openApp(navUrl(state.navApp, { name }), NAV_APPS.find((a) => a.id === state.navApp).label);
});

// ── 음악 ────────────────────────────────────────────────
const MUSIC_COLORS = { applemusic: "#fa2d48", melon: "#00cd3c", spotify: "#1db954", ytmusic: "#ff0000" };
RENDER.music = () => {
  $("#musicList").replaceChildren(
    ...MUSIC_APPS.map((m) =>
      el("button", { class: "music-tile", type: "button", style: `--c:${MUSIC_COLORS[m.id]}`, onclick: () => { tap(); state.musicApp = m.id; save(); openApp(m.url, m.label); } }, m.label)),
  );
};

// ── 전화 ────────────────────────────────────────────────
RENDER.phone = () => {
  const list = $("#contactList");
  if (!state.contacts.length) {
    list.replaceChildren(el("div", { class: "empty" }, "설정에서 자주 거는 번호를 등록하세요."));
    return;
  }
  list.replaceChildren(
    ...state.contacts.map((c) =>
      el("a", { class: "item", href: telUrl(c.phone) },
        el("span", { class: "em" }, "✆"),
        el("span", { class: "grow" }, c.name, el("span", { class: "sub" }, c.phone)))),
  );
};

// ── 주차 위치 ───────────────────────────────────────────
RENDER.parking = () => {
  const p = state.parking;
  $("#parkCard").replaceChildren(
    p
      ? el("div", {}, el("b", {}, `${timeAgo(p.at)} 저장`), el("br"), p.note || "메모 없음",
          el("div", { class: "hint" }, `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`))
      : el("div", {}, "저장된 주차 위치가 없습니다."),
  );
  $("#parkActions").replaceChildren(
    ...(p
      ? [
          el("a", { class: "btn wide", href: pinUrl(p.lat, p.lng, p.note || "주차 위치") }, "지도에서 보기"),
          el("a", { class: "btn wide", href: `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=w` }, "걸어서 찾아가기"),
          el("button", { class: "btn", onclick: () => { state.parking = null; save(); RENDER.parking(); } }, "삭제"),
        ]
      : []),
  );
};
function currentPosition() {
  return new Promise((resolve, reject) => {
    if (lastPos && lastPos.accuracy <= 50) return resolve(lastPos);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      reject, { enableHighAccuracy: true, timeout: 15000 });
  });
}
$("#parkSave").addEventListener("click", async () => {
  tap();
  try {
    const p = await currentPosition();
    state.parking = { lat: p.lat, lng: p.lng, at: Date.now(), note: $("#parkNote").value.trim() };
    $("#parkNote").value = "";
    save(); RENDER.parking(); toast("주차 위치를 저장했습니다");
  } catch (err) { onPosErr(err); toast("위치를 가져오지 못했습니다"); }
});

// ── 차량관리 ────────────────────────────────────────────
RENDER.car = () => {
  $("#odo").value = state.odometer ?? "";
  $("#maintList").replaceChildren(
    ...DEFAULT_ITEMS.map((it) => {
      const last = state.maintenance[it.id];
      const st = maintenanceStatus(it, last, state.odometer);
      const tag = { unknown: "기록 없음", ok: "양호", soon: "곧 교체", due: "교체 필요" }[st.state];
      const pct = st.remainKm == null ? 0 : Math.max(0, Math.min(100, (st.remainKm / it.everyKm) * 100));
      return el("div", { class: `item maint ${st.state}` },
        el("span", { class: "grow" }, it.label,
          el("span", { class: "sub" },
            last != null ? `마지막 ${formatKm(last)} · ${st.remainKm > 0 ? `${formatKm(st.remainKm)} 남음` : `${formatKm(-st.remainKm)} 지남`}` : `주기 ${formatKm(it.everyKm)}`),
          el("div", { class: "bar-line" }, el("i", { style: `width:${pct}%` }))),
        el("span", { class: "tag" }, tag),
        el("button", { class: "btn", style: "min-height:40px;padding:0 12px", onclick: () => {
          if (state.odometer == null) return toast("먼저 현재 주행거리를 입력하세요");
          state.maintenance[it.id] = state.odometer; save(); RENDER.car(); toast(`${it.label}: ${formatKm(state.odometer)}에 교체 기록`);
        } }, "교체함"));
    }),
  );
};
$("#odoSave").addEventListener("click", () => {
  const v = Number($("#odo").value);
  if (!Number.isFinite(v) || v <= 0) return toast("숫자로 입력하세요");
  state.odometer = Math.round(v); save(); RENDER.car(); toast("주행거리를 저장했습니다");
});

// ── 설정 ────────────────────────────────────────────────
RENDER.settings = () => {
  $("#favEdit").replaceChildren(
    ...state.favorites.map((f, i) =>
      el("div", { class: "item" }, el("span", { class: "em" }, f.icon), el("span", { class: "grow" }, f.name,
        el("span", { class: "sub" }, f.lat != null ? `${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}` : "이름으로 검색")),
      el("button", { class: "x", "aria-label": "삭제", onclick: () => { state.favorites.splice(i, 1); save(); RENDER.settings(); } }, "✕"))),
  );
  $("#contactEdit").replaceChildren(
    ...state.contacts.map((c, i) =>
      el("div", { class: "item" }, el("span", { class: "grow" }, c.name, el("span", { class: "sub" }, c.phone)),
        el("button", { class: "x", "aria-label": "삭제", onclick: () => { state.contacts.splice(i, 1); save(); RENDER.settings(); } }, "✕"))),
  );
  segment($("#musicAppSeg"), MUSIC_APPS, state.musicApp, (id) => { state.musicApp = id; save(); RENDER.settings(); });
  $("#ver").textContent = `버전 ${VERSION}`;
};
function showFavCoords() {
  const f = $("#favForm");
  const lat = Number(f.elements.lat.value), lng = Number(f.elements.lng.value);
  $("#favCoords").hidden = f.elements.lat.value === "";
  $("#favCoordsText").textContent = `📍 현재 위치 좌표(${lat.toFixed(4)}, ${lng.toFixed(4)})가 함께 저장됩니다`;
}
function clearFavCoords() {
  const f = $("#favForm");
  f.elements.lat.value = ""; f.elements.lng.value = "";
  showFavCoords();
}
$("#favCoordsClear").addEventListener("click", clearFavCoords);
$("#favHere").addEventListener("click", async () => {
  try {
    const p = await currentPosition();
    const f = $("#favForm");
    f.elements.lat.value = p.lat; f.elements.lng.value = p.lng;
    if (!f.elements.name.value) f.elements.name.value = "현재 위치";
    showFavCoords();
    toast("현재 위치 좌표를 넣었습니다");
  } catch (err) { onPosErr(err); }
});
$("#favForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (state.favorites.length >= 8) return toast("목적지는 8개까지입니다");
  state.favorites.push({ name: f.elements.name.value, icon: f.elements.icon.value || "📍", lat: f.elements.lat.value === "" ? null : Number(f.elements.lat.value), lng: f.elements.lng.value === "" ? null : Number(f.elements.lng.value) });
  state = normalizeState(state); save(); f.reset(); clearFavCoords(); RENDER.settings();
});
$("#contactForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (state.contacts.length >= 8) return toast("연락처는 8개까지입니다");
  state.contacts.push({ name: f.elements.name.value, phone: f.elements.phone.value });
  const before = state.contacts.length;
  state = normalizeState(state);
  if (state.contacts.length < before) toast("전화번호 형식을 확인하세요");
  save(); f.reset(); RENDER.settings();
});
$("#exportBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(state)); toast("백업을 복사했습니다. 메모 앱에 붙여넣어 보관하세요"); }
  catch { toast("복사하지 못했습니다"); }
});
$("#importBtn").addEventListener("click", () => {
  const raw = prompt("백업 내용을 붙여넣으세요");
  if (!raw) return;
  try { state = normalizeState(JSON.parse(raw)); save(); applyHud(); RENDER.settings(); toast("백업을 불러왔습니다"); }
  catch { toast("백업 형식이 올바르지 않습니다"); }
});

// ── 시작: ?go=nav&dest=집 (iOS 단축어 자동화용) ───────────
const params = new URLSearchParams(location.search);
const destName = params.get("dest");
go(params.get("go") || (destName ? "nav" : "") || location.hash.slice(1) || "home"); // 여기서 ?dest 는 주소에서 지워짐
if (destName) {
  // 화면이 다 뜬 뒤에 내비를 연다 (로딩 중에 다른 앱을 열면 막히는 경우가 있음)
  const fav = state.favorites.find((f) => f.name === destName) || { name: destName };
  window.addEventListener("load", () => setTimeout(() => openApp(navUrl(state.navApp, fav), NAV_APPS.find((a) => a.id === state.navApp).label), 300), { once: true });
}
window.addEventListener("hashchange", () => go(location.hash.slice(1) || "home"));

// ── 오프라인 껍데기 캐시 ─────────────────────────────────
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
