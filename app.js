(() => {
  'use strict';
  const T = window.TRIP;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');

  // localStorage 可能在私密視窗或清除資料後失效，所有讀寫都包在 try 裡，失敗就退回預設值
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ynh.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ynh.' + k, JSON.stringify(v)); } catch { /* 無法保存時只影響本機紀錄 */ } }
  };

  // ?now=2026-11-23T14:00 可預覽旅途中的畫面；行程一律以 UTC+8 計算，與手機所在時區無關
  const params = new URLSearchParams(location.search);
  const now = () => {
    const o = params.get('now');
    if (!o) return new Date();
    const d = new Date(/[+Z]/.test(o.slice(10)) ? o : o + '+08:00');
    return isNaN(d) ? new Date() : d;
  };
  const cst = (d = now()) => { const x = new Date(d.getTime() + 8 * 3600e3).toISOString(); return { date: x.slice(0, 10), hm: x.slice(11, 16) }; };

  const onColor = hex => {
    const n = parseInt(hex.slice(1), 16);
    const lin = c => (c /= 255) <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
    const L = .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255);
    return L > .3 ? '#242426' : '#F3E7CC';
  };
  const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const cnDay = d => { const n = +d.slice(8); return n <= 10 ? '初' + CN_NUM[n] : n < 20 ? '十' + CN_NUM[n - 10] : n === 20 ? '二十' : n < 30 ? '廿' + CN_NUM[n - 20] : '三十'; };
  const cnDate = d => '十一月' + cnDay(d);
  const DOW_EN = { '日': 'SUN', '一': 'MON', '二': 'TUE', '三': 'WED', '四': 'THU', '五': 'FRI', '六': 'SAT' };
  const dayOf = date => T.days.find(d => d.date === date);
  const dayColor = date => (dayOf(date) || T.days[0]).color.hex;
  const amap = (q, city) => `https://uri.amap.com/search?keyword=${encodeURIComponent(q)}&city=${encodeURIComponent(city || '')}&src=yunnan-handbook&callnative=1`;
  const icao = no => no.replace(/^CI/, 'CAL').replace(/^MU/, 'CES');
  const fmtAlt = m => m.toLocaleString('en-US') + ' m';

  const ICON = {
    flight: '<path d="M21 15.5 13.5 11V4.8a1.5 1.5 0 0 0-3 0V11L3 15.5v2l7.5-2.3v3.6L8.5 20.5V22l3.5-1 3.5 1v-1.5l-2-1.7v-3.6l7.5 2.3z"/>',
    train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>',
    drive: '<path d="M4 16V11l2-5h12l2 5v5z"/><path d="M4 11h16"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/>',
    sight: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    meal: '<path d="M4 11h16a8 8 0 0 1-16 0zM9 3c0 1.5 1 1.5 1 3s-1 1.5-1 3M14 3c0 1.5 1 1.5 1 3s-1 1.5-1 3"/>',
    free: '<path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
    exp: '<path d="M12 3l2.2 5.5L20 9l-4.4 3.8L17 19l-5-3.2L7 19l1.4-6.2L4 9l5.8-.5z"/>',
    transfer: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    tip: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'
  };
  const svg = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const outLink = (href, text) => `<a class="link" href="${href}" target="_blank" rel="noopener">${esc(text)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${ICON.out}</svg></a>`;

  let toastTimer;
  const toast = msg => {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  };

  /* ================= 天氣 ================= */
  const WMO = c => c === 0 ? '晴' : c <= 2 ? '晴時多雲' : c === 3 ? '陰' : c <= 48 ? '霧' : c <= 57 ? '毛毛雨' : c <= 67 ? '雨' : c <= 77 ? '雪' : c <= 82 ? '陣雨' : c <= 86 ? '陣雪' : '雷雨';
  let WX = store.get('wx', null);

  async function loadWeather(force) {
    if (!force && WX && Date.now() - WX.at < 3 * 3600e3) return WX;
    if (!navigator.onLine) return WX;
    const keys = Object.keys(T.places), P = keys.map(k => T.places[k]);
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + P.map(p => p.lat) + '&longitude=' + P.map(p => p.lon) +
      '&elevation=' + P.map(p => p.alt) +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset' +
      '&timezone=Asia%2FShanghai&forecast_days=16';
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      const arr = Array.isArray(j) ? j : [j];
      const data = {};
      keys.forEach((k, i) => {
        const dl = arr[i].daily;
        data[k] = Object.fromEntries(dl.time.map((t, x) => [t, {
          code: dl.weather_code[x], hi: dl.temperature_2m_max[x], lo: dl.temperature_2m_min[x],
          pop: dl.precipitation_probability_max[x], uv: dl.uv_index_max[x],
          rise: (dl.sunrise[x] || '').slice(11), set: (dl.sunset[x] || '').slice(11)
        }]));
      });
      WX = { at: Date.now(), data };
      store.set('wx', WX);
    } catch { /* 離線或 API 失敗時沿用上次快取，再不行就用去年同週參考值 */ }
    return WX;
  }
  const forecast = (place, date) => WX && WX.data[place] && WX.data[place][date];
  const fetchedAt = () => WX ? new Date(WX.at + 8 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : '';

  function wxCard(place, date) {
    const p = T.places[place], f = forecast(place, date);
    if (f && f.hi != null) {
      return `<article class="wx"><h3>${esc(p.name)}<span class="mono">${date.slice(5).replace('-', '/')}</span></h3>
        <p class="t">${Math.round(f.hi)}°<small> / ${Math.round(f.lo)}°</small></p>
        <p>${WMO(f.code)}・降雨 ${f.pop ?? '—'}%</p><p class="mono">海拔 ${fmtAlt(p.alt)}</p></article>`;
    }
    return `<article class="wx"><h3>${esc(p.name)}<span class="mono">${date.slice(5).replace('-', '/')}</span></h3>
      <p class="t">${p.ref.hi}°<small> / ${p.ref.lo}°</small></p><p>去年同週參考</p><p class="mono">海拔 ${fmtAlt(p.alt)}</p></article>`;
  }

  function wxDay(d) {
    const line = (place, label) => {
      const p = T.places[place], f = forecast(place, d.date);
      if (f && f.hi != null) {
        return `<p><b>${Math.round(f.hi)}° / ${Math.round(f.lo)}°</b>${esc(label || p.name)}・${WMO(f.code)}・降雨 ${f.pop ?? '—'}%・UV ${f.uv != null ? Math.round(f.uv) : '—'}${f.set ? '・日落 ' + f.set : ''}</p>`;
      }
      return `<p><b>${p.ref.hi}° / ${p.ref.lo}°</b>${esc(label || p.name)}・去年同週參考</p>`;
    };
    const has = forecast(d.place, d.date);
    return line(d.place) + (d.extra ? line(d.extra) : '') +
      `<p class="src">${has ? '預報：Open-Meteo，更新於 ' + fetchedAt() : '尚無當日預報，數值為 2025/11/21–28 再分析資料'}</p>`;
  }

  /* ================= 封面 ================= */
  function renderHome() {
    const c = T.cover, { date } = cst();
    const firstAt = place => (T.days.find(d => d.place === place) || T.days[0]).date;
    $('#v-home').innerHTML = `
      <figure class="hero">
        <img id="hero-img" src="assets/img/hero.webp" width="1086" height="1448" alt="剪紙風格的雲南：玉龍雪山、洱海、白族民居與麗江水車，一架紙飛機飛過天空">
        <figcaption class="hero-text">
          <p class="kicker">${esc(T.en)}</p>
          <h1 class="serif">${esc(T.title)}<br>${esc(T.subtitle)}</h1>
          <p class="kw">${c.keywords.map(esc).join('<i>／</i>')}</p>
          <p class="serif poem">${esc(c.poem)}</p>
        </figcaption>
        <div class="hero-v" aria-hidden="true"><span class="kai v">雲南・八日行旅</span></div>
      </figure>
      <div class="card status" id="status"></div>

      <div class="sect-h"><h2 class="serif">八日色票</h2><span class="mono">8 days / 8 colors</span></div>
      <div class="strip">${T.days.map(d => `
        <a class="swatch${d.date === date ? ' is-today' : ''}" href="#day/${d.n}" style="--c:${d.color.hex}" aria-label="第 ${d.n} 天 ${esc(d.city)}">
          <span class="sw"></span><span class="mono">${d.date.slice(5).replace('-', '.')}</span><span class="kai v">${esc(d.city)}</span></a>`).join('')}
      </div>

      <div class="sect-h"><h2 class="serif">此行天氣</h2><span class="mono" id="wx-at"></span></div>
      <div class="wx-grid" id="wx-home">${['kunming', 'dali', 'lijiang', 'shangrila'].map(k => wxCard(k, firstAt(k))).join('')}</div>
      <p class="src-note">各城市以行程中第一天到訪的日期顯示。雪山與普達措的溫度在「錦囊」。</p>

      <div class="sect-h"><h2 class="serif">這趟團</h2><span class="mono">tour ${esc(T.tour.id)}</span></div>
      <div class="card tour">
        <h3>${esc(T.tour.name)}</h3>
        <ul>${T.tour.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
        ${outLink(T.tour.url, 'Trip.com 產品頁')}
      </div>
      <div class="card install" id="install" hidden></div>`;
    renderStatus();
    $('#wx-at').textContent = WX ? 'updated ' + fetchedAt() : 'reference';
  }

  function renderStatus() {
    const el = $('#status');
    if (!el) return;
    const n = now(), s = new Date(T.start), e = new Date(T.end), { date, hm } = cst(n);
    let html, color = T.cover.color.hex;
    if (n < s) {
      const ms = s - n, d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
      html = `<p class="lbl">Countdown・距離 CI501 起飛</p>
        <p class="cd"><b>${d}</b><small>天</small><b>${h}</b><small>時</small><b>${m}</b><small>分</small></p>
        <a class="btn" href="#day/1">看第一天</a>`;
    } else if (n <= e) {
      const day = dayOf(date) || T.days[T.days.length - 1];
      const next = day.items.find(it => it.t >= hm);
      color = day.color.hex;
      html = `<p class="lbl">Today・Day ${pad(day.n)} / 08</p>
        <p class="today serif">${esc(day.route)}</p>
        <p class="next">${next ? `下一站 <span class="mono">${next.t}</span>${esc(next.title)}` : '今天的行程都走完了，早點休息。'}</p>
        <a class="btn" href="#day/${day.n}">今日行程</a>`;
    } else {
      html = `<p class="lbl">Archive</p><p class="today serif">旅程平安結束</p><p class="next">行程和旅記都還在，隨時回來翻。</p><a class="btn ghost" href="#day/1">從第一天看起</a>`;
    }
    el.style.setProperty('--c', color);
    el.innerHTML = html;
  }

  /* ================= 行程 ================= */
  const doneSet = new Set(store.get('done', []));
  const notes = store.get('notes', {});
  let currentDay = 1;

  function renderDaysShell() {
    $('#v-days').innerHTML = `
      <div class="chips" role="tablist" aria-label="選擇日期">${T.days.map(d => `
        <a role="tab" class="chip" href="#day/${d.n}" data-n="${d.n}" style="--c:${d.color.hex}" aria-selected="false" aria-label="第 ${d.n} 天 ${esc(d.city)}">
          <span class="sw"></span><span class="kai v">${esc(d.city)}</span><span class="mono">${pad(d.n)}</span></a>`).join('')}
      </div>
      <div id="day-card"></div>`;
  }

  function itemHTML(d, it, i) {
    const id = `d${d.n}-${i}`;
    const tags = (it.tag || '').split('・').filter(Boolean).map(t => `<span class="tag${/自費/.test(t) ? ' self' : ''}">${esc(t)}</span>`).join('');
    return `<li class="ti type-${it.type}${doneSet.has(id) ? ' done' : ''}" data-id="${id}" data-t="${it.t}">
      <time>${it.t}</time>
      <span class="dot">${svg(it.type)}</span>
      <div class="body">
        <h4>${esc(it.title)}${tags}</h4>
        ${it.sub ? `<p class="sub">${esc(it.sub)}</p>` : ''}
        ${it.dur ? `<p class="dur">${esc(it.dur)}</p>` : ''}
        ${it.desc ? `<p class="desc">${esc(it.desc)}</p>` : ''}
        ${it.q ? `<div class="nav">${outLink(amap(it.q, it.city), '高德地圖')}</div>` : ''}
      </div>
      <button class="check" type="button" aria-pressed="${doneSet.has(id)}" aria-label="標記完成：${esc(it.title)}">${svg('check')}</button>
    </li>`;
  }

  function showDay(n) {
    const d = T.days[n - 1];
    if (!d) return;
    currentDay = n;
    store.set('lastDay', n);
    document.documentElement.style.setProperty('--c', d.color.hex);
    $$('.chip').forEach(c => c.setAttribute('aria-selected', String(+c.dataset.n === n)));
    const on = onColor(d.color.hex);
    const word = d.en.split(' / ')[0].replace(' STUDY', '');
    // 直排城市名與左下的英文字詞共用左欄，長名字要縮小才不會相撞
    const fs = d.city.length >= 4 ? 46 : d.city.length === 3 ? 56 : 64;
    const wfs = word.length > 8 ? 16 : 20;
    const prev = T.days[n - 2], next = T.days[n];
    const h = d.hotel;
    $('#day-card').innerHTML = `
      <article class="day" style="--c:${d.color.hex};--on:${on};--city-fs:${fs}px;--word-fs:${wfs}px">
        <header class="band">
          <h2 class="kai v city">${esc(d.city)}</h2>
          <p class="kai v cname">${cnDate(d.date)}</p>
          <div class="m-tr" aria-hidden="true"><span class="m-no"><span>${pad(n)}</span><span>/</span><span>${pad(T.days.length)}</span></span></div>
          <span class="m-word" aria-hidden="true">${esc(word)}</span>
          <img class="vig" src="assets/img/${d.img}.webp" width="800" height="800" alt="">
        </header>
        <div class="ed">
          <p class="kicker">${esc(d.en)}・${d.date.replaceAll('-', '.')} ${DOW_EN[d.dow]}</p>
          <h3 class="serif">${esc(d.title[0])}<br>${esc(d.title[1])}</h3>
          <p class="kw">${d.keywords.map(esc).join('<i>／</i>')}</p>
          <p class="serif poem">${esc(d.poem)}</p>
        </div>
        <p class="route-line">${esc(d.route)}・星期${d.dow}</p>
        <dl class="facts">
          <div><dt>Max alt</dt><dd><span class="mono">${fmtAlt(d.alt.max)}</span></dd></div>
          <div><dt>Sleep</dt><dd>${d.alt.sleep ? `<span class="mono">${fmtAlt(d.alt.sleep)}</span>` : '回家'}</dd></div>
          <div><dt>Meals</dt><dd class="meals"><span>早 ${esc(d.meals.b)}</span><span>午 ${esc(d.meals.l)}</span><span>晚 ${esc(d.meals.d)}</span></dd></div>
        </dl>
        <div class="wx-day">${wxDay(d)}</div>
        <ol class="tl">${d.items.map((it, i) => itemHTML(d, it, i)).join('')}</ol>
        ${h ? `<section class="card hotel"><p class="lbl">Stay・住宿${h.same ? '（同前晚）' : ''}</p>
          <h4>${esc(h.name)}</h4>
          ${h.alts.length ? `<details><summary>或同級飯店 ${h.alts.length} 間（出團通知為準）</summary><ul>${h.alts.map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}
          ${outLink(amap(h.q, h.city), '高德地圖')}</section>` : ''}
        <label class="journal"><span class="lbl">Journal・旅記</span>
          <textarea data-n="${n}" placeholder="今天記住的一件事……">${esc(notes[n] || '')}</textarea></label>
        <nav class="pager" aria-label="切換日期">
          ${prev ? `<a href="#day/${prev.n}"><span class="mono">← DAY ${pad(prev.n)}</span><span class="kai">${esc(prev.city)}</span></a>` : '<span class="sp"></span>'}
          ${next ? `<a class="next-day" href="#day/${next.n}"><span class="mono">DAY ${pad(next.n)} →</span><span class="kai">${esc(next.city)}</span></a>` : '<span class="sp"></span>'}
        </nav>
      </article>`;
    markNow();
  }

  function markNow() {
    const { date, hm } = cst();
    const d = T.days[currentDay - 1];
    $$('.ti.now').forEach(li => li.classList.remove('now'));
    if (!d || d.date !== date) return;
    const items = $$('#day-card .ti');
    let cur = null;
    items.forEach(li => { if (li.dataset.t <= hm) cur = li; });
    if (cur) cur.classList.add('now');
  }

  /* ================= 交通 ================= */
  function renderTransit() {
    const flight = f => `
      <article class="pass" style="--c:${dayColor(f.date)}">
        <header><span class="no">${f.no}</span><span>${esc(f.airline)}</span><span class="date">${f.date.replaceAll('-', '/')} ${dayOf(f.date).dow}</span></header>
        <div class="route">
          <div class="end"><b class="code">${f.from.code}</b><span>${esc(f.from.city)} ${f.from.term}</span><time>${f.dep}</time></div>
          <div class="mid"><svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(90deg)">${ICON.flight}</svg><span class="mono">${f.dur}</span></div>
          <div class="end r"><b class="code">${f.to.code}</b><span>${esc(f.to.city)} ${f.to.term}</span><time>${f.arr}</time></div>
        </div>
        <footer><span>${esc(f.cabin)}</span>${outLink('https://www.flightaware.com/live/flight/' + icao(f.no), '航班動態')}</footer>
        <p class="note">${esc(f.note)}</p>
      </article>`;
    const train = t => `
      <article class="pass train" style="--c:${dayColor(t.date)}">
        <header><span class="no">${t.no}</span><span>${esc(t.kind)}・二等座</span><span class="date">${t.date.replaceAll('-', '/')} ${dayOf(t.date).dow}</span></header>
        <div class="route">
          <div class="end"><b class="code">${esc(t.from)}</b><time>${t.dep}</time></div>
          <div class="mid"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">${ICON.train}</svg><span class="mono">${t.dur}</span></div>
          <div class="end r"><b class="code">${esc(t.to)}</b><time>${t.arr}</time></div>
        </div>
        <p class="note">${esc(t.note)}</p>
      </article>`;
    const xfer = x => `
      <article class="card xfer ${x.level}">
        <h3>${x.date.slice(5).replace('-', '/')} ${esc(x.at)}<span class="badge">${x.level === 'tight' ? '緊' : '充裕'}・${esc(x.window)}</span></h3>
        <p class="span">${esc(x.from)} → ${esc(x.to)}</p>
        <ol>${x.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        ${x.warn ? `<p class="warn">${esc(x.warn)}</p>` : ''}
      </article>`;
    const go = T.flights.filter(f => f.date === T.days[0].date), back = T.flights.filter(f => f.date !== T.days[0].date);
    $('#v-transit').innerHTML = `
      <header class="page-h" style="--c:#A7BADF"><span class="bar"></span><div><h1 class="serif">交通</h1><p>四段航班、兩段鐵路，浦東與香港各轉機一次。</p></div></header>
      <div class="sect-h"><h2 class="serif">去程</h2><span class="mono">11.21 sat</span></div>
      ${go.map(flight).join('')}${xfer(T.transfers[0])}
      <div class="sect-h"><h2 class="serif">省內鐵路</h2><span class="mono">rail</span></div>
      ${T.trains.map(train).join('')}
      <div class="sect-h"><h2 class="serif">回程</h2><span class="mono">11.28 sat</span></div>
      ${back.map(flight).join('')}${xfer(T.transfers[1])}`;
  }

  /* ================= 行李 ================= */
  const packState = store.get('pack', { checked: {}, custom: {} });
  function renderPack() {
    const total = [], cats = T.packing.map((c, ci) => {
      const items = [...c.items, ...(packState.custom[c.cat] || [])];
      items.forEach(t => total.push(c.cat + '|' + t));
      const done = items.filter(t => packState.checked[c.cat + '|' + t]).length;
      return `<details class="card cat"${ci === 0 ? ' open' : ''}>
        <summary><img src="assets/img/obj-${c.icon}.webp" width="160" height="160" alt=""><h3>${esc(c.cat)}</h3><span class="mono">${done}/${items.length}</span></summary>
        <ul>${items.map(t => {
          const key = c.cat + '|' + t, custom = !c.items.includes(t);
          return `<li><label><input type="checkbox" data-key="${esc(key)}"${packState.checked[key] ? ' checked' : ''}><span>${esc(t)}</span>${custom ? `<button class="del" type="button" data-cat="${esc(c.cat)}" data-text="${esc(t)}" aria-label="刪除 ${esc(t)}">×</button>` : ''}</label></li>`;
        }).join('')}</ul>
        <form class="add" data-cat="${esc(c.cat)}"><input name="t" placeholder="加一項自己的……" aria-label="新增到${esc(c.cat)}"><button>加入</button></form>
      </details>`;
    });
    const done = total.filter(k => packState.checked[k]).length, pct = total.length ? done / total.length : 0;
    const C = 2 * Math.PI * 36;
    $('#v-pack').innerHTML = `
      <header class="page-h" style="--c:#8DA288"><span class="bar"></span><div><h1 class="serif">行李</h1><p>雪山與香格里拉會低於 0°C，羽絨外套請放隨身。</p></div></header>
      <div class="card pack-top" style="margin-top:18px">
        <svg class="ring" viewBox="0 0 86 86" role="img" aria-label="已準備 ${Math.round(pct * 100)}%">
          <circle class="bg" cx="43" cy="43" r="36"/><circle class="fg" cx="43" cy="43" r="36" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
          <text x="43" y="50" text-anchor="middle">${Math.round(pct * 100)}%</text></svg>
        <div><p class="serif">${pct === 1 ? '都打包好了' : '還差 ' + (total.length - done) + ' 項'}</p><p>勾選只存在這支手機上；可以自己加項目。</p></div>
      </div>
      ${cats.join('')}
      <p class="src-note" style="text-align:center"><button class="btn ghost" type="button" id="pack-reset">全部取消勾選</button></p>`;
  }

  /* ================= 錦囊 ================= */
  function altChart() {
    const W = 340, H = 190, L = 36, R = 12, Tp = 18, B = 34, max = 5000;
    const x = i => L + (W - L - R) * i / (T.days.length - 1);
    const y = m => Tp + (H - Tp - B) * (1 - m / max);
    const pts = T.days.map((d, i) => [x(i), y(d.alt.max)]);
    const sleep = T.days.filter(d => d.alt.sleep).map(d => [x(d.n - 1), y(d.alt.sleep)]);
    const path = p => p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const grid = [0, 1000, 2000, 3000, 4000, 5000].map(m => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(m)}" y2="${y(m)}"/><text x="${L - 6}" y="${y(m) + 3}" text-anchor="end">${m ? m / 1000 + 'k' : 0}</text>`).join('');
    const peaks = T.days.filter(d => d.alt.peak).map(d => `<text x="${x(d.n - 1)}" y="${y(d.alt.max) - 8}" text-anchor="middle">${fmtAlt(d.alt.max)}</text>`).join('');
    const dots = T.days.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.alt.max)}" r="4.5" fill="${d.color.hex}" stroke="#242426" stroke-width=".8"/><text class="day-l" x="${x(i)}" y="${H - 12}" text-anchor="middle">${esc(d.city.slice(0, 2))}</text><text x="${x(i)}" y="${H - 1}" text-anchor="middle">${pad(d.n)}</text>`).join('');
    return `<svg class="alt-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="每日最高海拔與過夜海拔：最高為第 4 天玉龍雪山 4,680 公尺">
      <defs><linearGradient id="altfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#74647D" stop-opacity=".28"/><stop offset="1" stop-color="#74647D" stop-opacity="0"/></linearGradient></defs>
      ${grid}
      <line class="warn" x1="${L}" x2="${W - R}" y1="${y(2500)}" y2="${y(2500)}"/><text x="${L + 4}" y="${y(2500) - 5}" style="fill:#B94135">2,500 m</text>
      <path class="area" d="${path(pts)} L${x(T.days.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z"/>
      <path class="ln-max" d="${path(pts)}"/><path class="ln-sleep" d="${path(sleep)}"/>
      ${peaks}${dots}</svg>`;
  }

  function renderTips() {
    const contacts = store.get('contacts', {});
    const rate = store.get('rate', { v: 4.93, at: '2026-11-16' });
    const P = T.places;
    const wxRows = [['kunming', '2026-11-21'], ['dali', '2026-11-23'], ['lijiang', '2026-11-24'], ['glacier', '2026-11-24'], ['shangrila', '2026-11-26'], ['pudacuo', '2026-11-26']].map(([k, date]) => {
      const f = forecast(k, date);
      return `<tr><td>${esc(P[k].name)}</td><td class="mono">${fmtAlt(P[k].alt)}</td>
        <td class="mono">${f && f.hi != null ? Math.round(f.hi) + '° / ' + Math.round(f.lo) + '°' : '—'}</td>
        <td class="mono">${P[k].ref.hi}° / ${P[k].ref.lo}°</td></tr>`;
    }).join('');
    const ct = (key, label) => `<label>${esc(label)}<input type="tel" inputmode="tel" data-contact="${key}" value="${esc(contacts[key] || '')}" placeholder="出發前填入" autocomplete="off"><a href="tel:${esc(contacts[key] || '')}" data-call="${key}" aria-disabled="${!contacts[key]}">撥打</a></label>`;
    $('#v-tips').innerHTML = `
      <header class="page-h" style="--c:#B94135"><span class="bar"></span><div><h1 class="serif">錦囊</h1><p>高原、天氣、匯率、緊急電話，離線也打得開。</p></div></header>

      <div class="sect-h"><h2 class="serif">海拔曲線</h2><span class="mono">altitude</span></div>
      <div class="card">${altChart()}
        <div class="legend"><span><i></i>當日最高</span><span><i class="s"></i>過夜</span><span><i class="w"></i>2,500 m 以上留意高山症</span></div>
      </div>

      <div class="sect-h"><h2 class="serif">溫度</h2><span class="mono">°C</span></div>
      <div class="card"><table class="wx-table"><thead><tr><th>地點</th><th>海拔</th><th>預報</th><th>去年同週</th></tr></thead><tbody>${wxRows}</tbody></table>
        <p class="src-note" style="margin:8px 0 0">預報來自 Open-Meteo（${WX ? '更新於 ' + fetchedAt() : '尚未下載'}）；去年同週為 2025/11/21–28 再分析資料，已依海拔校正。</p>
        <p style="margin:10px 0 0"><button class="btn ghost" type="button" id="wx-refresh">更新天氣</button></p>
      </div>

      <div class="sect-h"><h2 class="serif">匯率換算</h2><span class="mono">cny ⇄ twd</span></div>
      <div class="card">
        <div class="fx"><label>人民幣 CNY<input id="fx-cny" inputmode="decimal" value="100"></label><label>新台幣 TWD<input id="fx-twd" inputmode="decimal"></label></div>
        <div class="fx-quick">${[10, 30, 50, 100, 300, 1000].map(v => `<button type="button" data-cny="${v}">¥${v}</button>`).join('')}</div>
        <p class="fx-meta">1 CNY ≈ <span id="fx-rate">${rate.v}</span> TWD（${esc(rate.at)}）<button type="button" id="fx-up">更新匯率</button></p>
      </div>

      <div class="sect-h"><h2 class="serif">旅途須知</h2><span class="mono">notes</span></div>
      <div class="card tips">${T.tips.map((t, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(t.h)}</summary><ul>${t.p.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>`).join('')}</div>

      <div class="sect-h"><h2 class="serif">緊急聯絡</h2><span class="mono">sos</span></div>
      <div class="card">
        <div class="sos">${T.emergency.map(e => `<a class="${e.show ? 'wide' : ''}" href="tel:${e.num}"><b>${esc(e.show || e.num)}</b><span>${esc(e.label)}</span></a>`).join('')}</div>
        <div class="contacts">${ct('guide', '導遊')}${ct('driver', '接送機')}${ct('mate', '同行旅伴')}</div>
      </div>

      <div class="sect-h"><h2 class="serif">關於這本手冊</h2><span class="mono">about</span></div>
      <div class="card about">
        <p>行程依 Trip.com 參考行程整理，實際時間、飯店、車次以出團通知與導遊安排為準。</p>
        <p id="offline-state">離線狀態檢查中……</p>
        <p><button class="btn ghost" type="button" id="reset-all">清除這支手機上的勾選與旅記</button></p>
      </div>`;
    updateFx('cny');
    updateOfflineState();
  }

  function updateFx(from) {
    const rate = +(store.get('rate', { v: 4.93 }).v);
    const cny = $('#fx-cny'), twd = $('#fx-twd');
    if (!cny) return;
    const num = v => parseFloat(String(v).replace(/,/g, ''));
    if (from === 'cny') { const v = num(cny.value); twd.value = isFinite(v) ? Math.round(v * rate).toLocaleString('en-US') : ''; }
    else { const v = num(twd.value); cny.value = isFinite(v) ? (v / rate).toFixed(1) : ''; }
  }

  async function updateOfflineState() {
    const el = $('#offline-state');
    if (!el) return;
    if (!('serviceWorker' in navigator)) { el.textContent = '這個瀏覽器不支援離線模式。'; return; }
    const reg = await navigator.serviceWorker.getRegistration();
    el.textContent = reg && reg.active ? '已可離線使用：行程、圖片與字型都存在手機裡。' : '首次開啟後會自動下載離線資料。';
  }

  /* ================= 字型（子集化 + 離線快取） ================= */
  // Google Fonts 的 text= 只回傳用到的字，CJK 字型因此只有幾十 KB；同一段文字產生同一個網址，快取才會命中
  const MONO_TEXT = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~°·←→⇄¥';
  function fontURLs() {
    const uniq = s => [...new Set(s)].filter(ch => ch.trim()).sort().join('');
    const textOf = sel => $$(sel).map(e => e.textContent).join('');
    // 數字會隨勾選數量變動，先剔除再固定補上，網址才不會每次都不同
    const serif = uniq((textOf('.serif') + T.days.map(d => d.title.join('') + d.poem + d.route).join('') + '旅程平安結束都打包好了還差項').replace(/\d/g, '')) + '0123456789';
    const kai = uniq(textOf('.kai') + T.days.map(d => d.city + cnDate(d.date)).join(''));
    const gf = (family, text) => `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}&display=swap`;
    return [gf('Noto+Serif+TC:wght@500;600', serif), gf('LXGW+WenKai+TC', kai), gf('IBM+Plex+Mono:wght@200;300;400', MONO_TEXT)];
  }
  async function loadFonts() {
    const urls = fontURLs();
    urls.forEach(u => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; document.head.append(l); });
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open('ynh-fonts');
      for (const u of urls) {
        let css = await cache.match(u);
        if (!css) { const r = await fetch(u); if (!r.ok) continue; await cache.put(u, r.clone()); css = r; }
        const files = [...(await css.text()).matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        for (const f of files) if (!(await cache.match(f))) { const r = await fetch(f); if (r.ok) await cache.put(f, r); }
      }
    } catch { /* 字型抓不到時用系統字，不影響內容 */ }
  }

  /* ================= 路由與事件 ================= */
  const VIEWS = ['home', 'days', 'transit', 'pack', 'tips'];
  function route() {
    const [v, arg] = (location.hash.slice(1) || 'home').split('/');
    let view = v === 'day' || v === 'today' ? 'days' : VIEWS.includes(v) ? v : 'home';
    VIEWS.forEach(k => { $('#v-' + k).hidden = k !== view; });
    $$('.tabbar a').forEach(a => { if (a.dataset.tab === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (view === 'days') {
      const today = dayOf(cst().date);
      const n = v === 'today' ? (today ? today.n : 1) : +arg || (today ? today.n : store.get('lastDay', 1));
      showDay(Math.min(Math.max(n, 1), T.days.length));
    } else {
      document.documentElement.style.setProperty('--c', view === 'home' ? T.cover.color.hex : '#74647D');
    }
    if (view === 'pack') renderPack();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function bind() {
    window.addEventListener('hashchange', route);
    document.addEventListener('click', e => {
      const chk = e.target.closest('.check');
      if (chk) {
        const li = chk.closest('.ti'), id = li.dataset.id;
        doneSet.has(id) ? doneSet.delete(id) : doneSet.add(id);
        li.classList.toggle('done', doneSet.has(id));
        chk.setAttribute('aria-pressed', String(doneSet.has(id)));
        store.set('done', [...doneSet]);
        return;
      }
      const q = e.target.closest('[data-cny]');
      if (q) { $('#fx-cny').value = q.dataset.cny; updateFx('cny'); return; }
      const del = e.target.closest('.del');
      if (del) {
        e.preventDefault();
        const list = packState.custom[del.dataset.cat] || [];
        packState.custom[del.dataset.cat] = list.filter(t => t !== del.dataset.text);
        delete packState.checked[del.dataset.cat + '|' + del.dataset.text];
        store.set('pack', packState); keepOpen(renderPack);
        return;
      }
      if (e.target.id === 'pack-reset') { packState.checked = {}; store.set('pack', packState); renderPack(); toast('已全部取消勾選'); return; }
      if (e.target.id === 'fx-up') { refreshRate(); return; }
      if (e.target.id === 'wx-refresh') { loadWeather(true).then(() => { renderTips(); toast(WX ? '天氣已更新' : '目前無法取得天氣'); }); return; }
      if (e.target.id === 'reset-all' && confirm('清除這支手機上的行程勾選、行李勾選與旅記？此動作無法復原。')) {
        ['done', 'pack', 'notes', 'contacts'].forEach(k => { try { localStorage.removeItem('ynh.' + k); } catch { /* 忽略 */ } });
        location.reload();
      }
    });
    document.addEventListener('change', e => {
      if (e.target.matches('.cat input[type=checkbox]')) {
        packState.checked[e.target.dataset.key] = e.target.checked;
        if (!e.target.checked) delete packState.checked[e.target.dataset.key];
        store.set('pack', packState); keepOpen(renderPack);
      }
    });
    document.addEventListener('submit', e => {
      const f = e.target.closest('.add');
      if (!f) return;
      e.preventDefault();
      const t = f.t.value.trim();
      if (!t) return;
      const cat = f.dataset.cat;
      packState.custom[cat] = [...(packState.custom[cat] || []), t].filter((v, i, a) => a.indexOf(v) === i);
      store.set('pack', packState); keepOpen(renderPack);
    });
    document.addEventListener('input', e => {
      if (e.target.matches('.journal textarea')) { notes[e.target.dataset.n] = e.target.value; store.set('notes', notes); }
      if (e.target.id === 'fx-cny') updateFx('cny');
      if (e.target.id === 'fx-twd') updateFx('twd');
      if (e.target.dataset.contact) {
        const c = store.get('contacts', {}); c[e.target.dataset.contact] = e.target.value.trim(); store.set('contacts', c);
        const a = $(`[data-call="${e.target.dataset.contact}"]`);
        a.href = 'tel:' + c[e.target.dataset.contact]; a.setAttribute('aria-disabled', String(!c[e.target.dataset.contact]));
      }
    });

    // 左右滑動切換日期
    let sx = 0, sy = 0;
    $('#v-days').addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    $('#v-days').addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        const n = currentDay + (dx < 0 ? 1 : -1);
        if (n >= 1 && n <= T.days.length) location.hash = '#day/' + n;
      }
    }, { passive: true });

    // 封面插圖的輕微視差
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking || $('#v-home').hidden) return;
      ticking = true;
      requestAnimationFrame(() => { const img = $('#hero-img'); if (img) img.style.setProperty('--py', Math.min(window.scrollY * .12, 60) + 'px'); ticking = false; });
    }, { passive: true });

    window.addEventListener('online', () => toast('已連線'));
    window.addEventListener('offline', () => toast('離線中：內容照常可用'));
  }

  function keepOpen(render) {
    const open = $$('#v-pack details.cat').map(d => d.open), y = window.scrollY;
    render();
    $$('#v-pack details.cat').forEach((d, i) => { d.open = open[i] ?? d.open; });
    window.scrollTo(0, y);
  }

  async function refreshRate() {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/CNY');
      const j = await r.json();
      const v = j && j.rates && j.rates.TWD;
      if (!v) throw new Error('no rate');
      const at = new Date((j.time_last_update_unix || Date.now() / 1000) * 1000 + 8 * 3600e3).toISOString().slice(0, 10);
      store.set('rate', { v: +v.toFixed(3), at });
      $('#fx-rate').textContent = v.toFixed(3);
      updateFx('cny'); toast('匯率已更新');
    } catch { toast('目前無法更新匯率，沿用上次數值'); }
  }

  /* ================= 安裝提示 ================= */
  let deferredPrompt = null;
  function renderInstall() {
    const el = $('#install');
    if (!el) return;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (standalone) { el.hidden = true; return; }
    if (deferredPrompt) {
      el.innerHTML = '<p>裝到主畫面，飛機上、山上沒網路也能翻。</p><button class="btn" type="button" id="do-install">安裝</button>';
      el.hidden = false;
      $('#do-install').onclick = async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; el.hidden = true; };
    } else if (ios) {
      el.innerHTML = '<p>用 Safari 開啟，點「分享」→「加入主畫面」，就能像 App 一樣離線使用。</p>';
      el.hidden = false;
    }
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; renderInstall(); });

  /* ================= 啟動 ================= */
  function init() {
    renderHome();
    renderDaysShell();
    renderTransit();
    renderPack();
    renderTips();
    bind();
    route();
    renderInstall();
    // 預先渲染全部視圖後再抓字型，子集才涵蓋每一頁的標題字
    loadFonts();
    loadWeather().then(w => {
      if (!w) return;
      const home = $('#wx-home');
      if (home) {
        const firstAt = place => (T.days.find(d => d.place === place) || T.days[0]).date;
        home.innerHTML = ['kunming', 'dali', 'lijiang', 'shangrila'].map(k => wxCard(k, firstAt(k))).join('');
        $('#wx-at').textContent = 'updated ' + fetchedAt();
      }
      const wd = $('.wx-day');
      if (wd) wd.innerHTML = wxDay(T.days[currentDay - 1]);
      renderTips();
    });
    setInterval(() => { renderStatus(); markNow(); }, 30e3);

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      // 要在註冊前記下：新 SW 的 clients.claim() 會讓 controller 在 activated 前就有值
      const firstInstall = !navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w && w.addEventListener('statechange', () => { if (w.state === 'activated') { toast(firstInstall ? '已可離線使用' : '手冊已更新，下次開啟生效'); updateOfflineState(); } });
        });
      }).catch(() => { /* 不支援時仍可線上使用 */ });
    }
  }

  init();
})();
