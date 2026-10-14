// 화면과 상관없는 순수 계산만 모아둔 파일 (tests/lib.test.mjs 에서 검사)

// ── 내비 앱 딥링크 ─────────────────────────────────────────
// dest = { name, lat, lng }  (lat/lng 이 없으면 이름으로 검색)
export const NAV_APPS = [
  { id: "tmap", label: "TMAP" },
  { id: "kakao", label: "카카오맵" },
  { id: "naver", label: "네이버지도" },
  { id: "apple", label: "Apple 지도" },
];

export function hasCoords(dest) {
  return Number.isFinite(dest?.lat) && Number.isFinite(dest?.lng);
}

export function navUrl(appId, dest) {
  const name = String(dest?.name ?? "").trim();
  const q = encodeURIComponent(name);
  const c = hasCoords(dest);
  switch (appId) {
    case "tmap":
      return c
        // 개발자 자료마다 iOS 는 rGo*, 다른 곳은 goal* 형식을 쓴다고 해서 둘 다 넣음
        // (모르는 파라미터는 앱이 무시함). x=경도, y=위도
        ? `tmap://route?referrer=com.skt.Tmap&goalname=${q}&goalx=${dest.lng}&goaly=${dest.lat}&rGoName=${q}&rGoX=${dest.lng}&rGoY=${dest.lat}`
        : `tmap://search?name=${q}`;
    case "kakao":
      return c
        ? `kakaomap://route?ep=${dest.lat},${dest.lng}&by=CAR`
        : `kakaomap://search?q=${q}`;
    case "naver":
      return c
        ? `nmap://navigation?dlat=${dest.lat}&dlng=${dest.lng}&dname=${q}&appname=sportage.carplay`
        : `nmap://search?query=${q}&appname=sportage.carplay`;
    case "apple":
    default:
      return c
        ? `https://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=d`
        : `https://maps.apple.com/?daddr=${q}&dirflg=d`;
  }
}

// 주차 위치처럼 "그 지점을 지도에 찍어서 보기"
export function pinUrl(lat, lng, label = "주차 위치") {
  return `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label)}`;
}

// ── 음악 앱 ──────────────────────────────────────────────
export const MUSIC_APPS = [
  { id: "applemusic", label: "Apple Music", url: "music://" },
  { id: "melon", label: "멜론", url: "melonapp://" },
  { id: "spotify", label: "Spotify", url: "spotify://" },
  { id: "ytmusic", label: "YouTube Music", url: "youtubemusic://" },
];

// ── 전화번호 ─────────────────────────────────────────────
export function cleanPhone(raw) {
  return String(raw ?? "").replace(/[^0-9+]/g, "");
}
export function telUrl(raw) {
  const n = cleanPhone(raw);
  return n ? `tel:${n}` : "";
}
export function smsUrl(raw, body = "") {
  const n = cleanPhone(raw);
  if (!n) return "";
  return body ? `sms:${n}&body=${encodeURIComponent(body)}` : `sms:${n}`;
}

// ── 거리·속도 ────────────────────────────────────────────
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// GPS 가 주는 m/s → km/h. 값이 없거나 음수면 null
export function msToKmh(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  return ms * 3.6;
}

// 정차 중 GPS 튐(수 m)으로 거리가 쌓이지 않도록 걸러서 더한다
export function shouldAddSegment(km, accuracyM, dtSec) {
  if (!(km > 0) || !(dtSec > 0)) return false;
  if (accuracyM != null && accuracyM > 50) return false; // 정확도 나쁜 점은 버림
  if (km < 0.005) return false; // 5m 미만 이동은 잡음
  const kmh = (km / dtSec) * 3600;
  return kmh < 250; // 순간이동(GPS 튐) 제외
}

export function headingLabel(deg) {
  if (deg == null || !Number.isFinite(deg)) return "–";
  const dirs = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// ── 차량 소모품 ──────────────────────────────────────────
// 스포티지 QL 일반적인 교체 주기 (km). 정확한 값은 차량 취급설명서 기준으로 수정 가능
export const DEFAULT_ITEMS = [
  { id: "oil", label: "엔진오일·오일필터", everyKm: 10000 },
  { id: "acfilter", label: "에어컨 필터", everyKm: 15000 },
  { id: "airfilter", label: "에어클리너", everyKm: 30000 },
  { id: "brakefluid", label: "브레이크액", everyKm: 40000 },
  { id: "tire", label: "타이어 위치교환", everyKm: 10000 },
  { id: "wiper", label: "와이퍼", everyKm: 20000 },
];

// 남은 거리와 상태. lastKm 이 없으면 "기록 없음"
export function maintenanceStatus(item, lastKm, currentKm) {
  if (!Number.isFinite(lastKm) || !Number.isFinite(currentKm)) {
    return { state: "unknown", remainKm: null };
  }
  const remainKm = lastKm + item.everyKm - currentKm;
  const state = remainKm <= 0 ? "due" : remainKm <= item.everyKm * 0.1 ? "soon" : "ok";
  return { state, remainKm };
}

// ── 저장 데이터 모양 맞추기 ─────────────────────────────
// localStorage 에 남은 옛 값·깨진 값이 있어도 화면이 죽지 않도록
export function normalizeState(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const num = (v) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : null);
  const favs = Array.isArray(s.favorites) ? s.favorites : [];
  const contacts = Array.isArray(s.contacts) ? s.contacts : [];
  const maint = s.maintenance && typeof s.maintenance === "object" ? s.maintenance : {};
  const NAV_IDS = NAV_APPS.map((a) => a.id);
  const MUSIC_IDS = MUSIC_APPS.map((a) => a.id);
  return {
    navApp: NAV_IDS.includes(s.navApp) ? s.navApp : "tmap",
    musicApp: MUSIC_IDS.includes(s.musicApp) ? s.musicApp : "applemusic",
    favorites: favs
      .filter((f) => f && String(f.name ?? "").trim())
      .slice(0, 8)
      .map((f) => ({
        name: String(f.name).trim().slice(0, 40),
        icon: String(f.icon ?? "📍").slice(0, 4),
        lat: num(f.lat),
        lng: num(f.lng),
      })),
    contacts: contacts
      .filter((c) => c && String(c.name ?? "").trim() && cleanPhone(c.phone))
      .slice(0, 8)
      .map((c) => ({ name: String(c.name).trim().slice(0, 20), phone: cleanPhone(c.phone) })),
    odometer: num(s.odometer),
    maintenance: Object.fromEntries(
      DEFAULT_ITEMS.map((it) => [it.id, num(maint[it.id])]),
    ),
    parking:
      s.parking && Number.isFinite(s.parking.lat) && Number.isFinite(s.parking.lng)
        ? { lat: s.parking.lat, lng: s.parking.lng, at: Number(s.parking.at) || Date.now(), note: String(s.parking.note ?? "").slice(0, 40) }
        : null,
    hud: Boolean(s.hud),
  };
}

export function formatKm(n) {
  if (n == null || !Number.isFinite(n)) return "–";
  return `${Math.round(n).toLocaleString("ko-KR")} km`;
}

export function timeAgo(ts, now = Date.now()) {
  const m = Math.floor((now - ts) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}
