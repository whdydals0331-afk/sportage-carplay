import { test } from "node:test";
import assert from "node:assert/strict";
import {
  navUrl, telUrl, smsUrl, haversineKm, msToKmh, shouldAddSegment,
  headingLabel, maintenanceStatus, normalizeState, DEFAULT_ITEMS, timeAgo,
} from "../lib.js";

const seoul = { name: "서울역", lat: 37.5547, lng: 126.9707 };

test("내비 딥링크 — 좌표 있을 때", () => {
  const tm = new URL(navUrl("tmap", seoul).replace("tmap://", "https://x/"));
  assert.equal(tm.searchParams.get("goalx"), "126.9707", "TMAP x = 경도");
  assert.equal(tm.searchParams.get("goaly"), "37.5547", "TMAP y = 위도");
  assert.equal(tm.searchParams.get("rGoX"), "126.9707");
  assert.equal(tm.searchParams.get("rGoY"), "37.5547");
  assert.equal(tm.searchParams.get("goalname"), "서울역");
  assert.equal(navUrl("kakao", seoul), "kakaomap://route?ep=37.5547,126.9707&by=CAR");
  assert.match(navUrl("naver", seoul), /^nmap:\/\/navigation\?dlat=37.5547&dlng=126.9707&dname=/);
  assert.equal(navUrl("apple", seoul), "https://maps.apple.com/?daddr=37.5547,126.9707&dirflg=d");
});

test("내비 딥링크 — 이름만 있을 때는 검색", () => {
  const d = { name: "이마트 성수점" };
  assert.equal(navUrl("tmap", d), `tmap://search?name=${encodeURIComponent("이마트 성수점")}`);
  assert.equal(navUrl("kakao", d), `kakaomap://search?q=${encodeURIComponent("이마트 성수점")}`);
  assert.match(navUrl("unknown-app", d), /^https:\/\/maps\.apple\.com\/\?daddr=/);
  assert.ok(!navUrl("apple", { name: "a&b" }).includes("a&b"), "특수문자는 인코딩");
});

test("전화·문자 링크", () => {
  assert.equal(telUrl("010-1234-5678"), "tel:01012345678");
  assert.equal(telUrl("abc"), "");
  assert.equal(smsUrl("010 1234 5678", "곧 도착"), `sms:01012345678&body=${encodeURIComponent("곧 도착")}`);
});

test("거리·속도 계산", () => {
  const km = haversineKm({ lat: 37.5547, lng: 126.9707 }, { lat: 35.1151, lng: 129.0422 }); // 서울역→부산역
  assert.ok(km > 320 && km < 330, `직선거리 ${km}`);
  assert.equal(msToKmh(10), 36);
  assert.equal(msToKmh(-1), null);
  assert.equal(msToKmh(null), null);
});

test("GPS 잡음 걸러내기", () => {
  assert.equal(shouldAddSegment(0.002, 5, 1), false, "정차 중 2m 튐");
  assert.equal(shouldAddSegment(0.02, 80, 1), false, "정확도 나쁨");
  assert.equal(shouldAddSegment(1, 5, 1), false, "1초에 1km = 순간이동");
  assert.equal(shouldAddSegment(0.02, 5, 1), true, "시속 72km 정상 주행");
});

test("방향 표시", () => {
  assert.equal(headingLabel(0), "북");
  assert.equal(headingLabel(90), "동");
  assert.equal(headingLabel(359), "북");
  assert.equal(headingLabel(-90), "서");
  assert.equal(headingLabel(null), "–");
});

test("소모품 상태", () => {
  const oil = DEFAULT_ITEMS.find((i) => i.id === "oil");
  assert.deepEqual(maintenanceStatus(oil, null, 100000), { state: "unknown", remainKm: null });
  assert.equal(maintenanceStatus(oil, 100000, 101000).state, "ok");
  assert.equal(maintenanceStatus(oil, 100000, 109500).state, "soon");
  assert.equal(maintenanceStatus(oil, 100000, 110500).state, "due");
  assert.equal(maintenanceStatus(oil, 100000, 110500).remainKm, -500);
});

test("깨진 저장값이어도 화면용 모양으로 맞춤", () => {
  for (const raw of [null, undefined, 42, "x", [], { favorites: "nope", contacts: null, maintenance: 3 }]) {
    const s = normalizeState(raw);
    assert.equal(s.navApp, "tmap");
    assert.deepEqual(s.favorites, []);
    assert.deepEqual(s.contacts, []);
    assert.equal(s.odometer, null);
    assert.equal(s.parking, null);
    assert.equal(Object.keys(s.maintenance).length, DEFAULT_ITEMS.length);
  }
  const s = normalizeState({
    navApp: "kakao",
    favorites: [{ name: "  집 ", lat: "37.5", lng: 127 }, { name: "" }, null, { name: "회사", lat: "", lng: null }],
    contacts: [{ name: "아내", phone: "010-1111-2222" }, { name: "번호없음", phone: "abc" }],
    odometer: "123456",
    maintenance: { oil: "120000", bogus: 1 },
    parking: { lat: 37.1, lng: 127.1, at: 5 },
  });
  assert.equal(s.navApp, "kakao");
  assert.deepEqual(s.favorites, [
    { name: "집", icon: "📍", lat: 37.5, lng: 127 },
    { name: "회사", icon: "📍", lat: null, lng: null },
  ]);
  assert.deepEqual(s.contacts, [{ name: "아내", phone: "01011112222" }]);
  assert.equal(s.odometer, 123456);
  assert.equal(s.maintenance.oil, 120000);
  assert.ok(!("bogus" in s.maintenance));
  assert.equal(s.parking.note, "");
});

test("시간 표시", () => {
  const now = 10 * 86400000;
  assert.equal(timeAgo(now - 10000, now), "방금");
  assert.equal(timeAgo(now - 5 * 60000, now), "5분 전");
  assert.equal(timeAgo(now - 3 * 3600000, now), "3시간 전");
  assert.equal(timeAgo(now - 2 * 86400000, now), "2일 전");
});
