(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      method: opts.method || 'GET',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new Error((data && data.error) || 'Something went wrong. Check your connection and try again.');
    return data;
  }

  // Build elements without innerHTML so dataset text can never run as markup.
  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids) {
      if (kid === null || kid === undefined) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return n;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  const fmt = (n) => Number(n).toLocaleString('en-IN');

  /* ---------------- ECG monitor (hero) ---------------- */
  function initECG() {
    const canvas = $('#ecg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const PERIOD = 1.15; // seconds per heartbeat
    const SPEED = 150; // pixels per second
    let w = 0, h = 0, raf = 0, visible = true;

    const g = (p, mu, s) => Math.exp(-((p - mu) ** 2) / (2 * s * s));
    const beat = (p) =>
      0.14 * g(p, 0.16, 0.03) - 0.12 * g(p, 0.305, 0.008) + 1.0 * g(p, 0.335, 0.0085) - 0.28 * g(p, 0.368, 0.009) + 0.3 * g(p, 0.6, 0.055);
    const phase = (t) => (((t % PERIOD) + PERIOD) % PERIOD) / PERIOD;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduceMotion) draw(4);
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const base = h * 0.64;
      const amp = h * 0.52;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(82,230,216,0)');
      grad.addColorStop(0.65, 'rgba(82,230,216,0.5)');
      grad.addColorStop(1, 'rgba(82,230,216,1)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const y = base - beat(phase(t - (w - x) / SPEED)) * amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const headY = base - beat(phase(t)) * amp;
      ctx.fillStyle = '#52e6d8';
      ctx.shadowColor = '#52e6d8';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(w - 3, headY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function loop(now) {
      if (visible && !document.hidden) draw(now / 1000);
      raf = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener('resize', resize);
    if (reduceMotion) return;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- stats and shared data ---------------- */
  let districts = [];
  async function loadStats() {
    try {
      const s = await api('/api/stats');
      districts = s.districts || [];
      $('#statHospitals').textContent = fmt(s.hospitals);
      $('#statDistricts').textContent = fmt(districts.length);
      const sel = $('#hospDistrict');
      for (const d of districts) sel.append(el('option', { value: d, text: d }));
    } catch {
      $('#statHospitals').textContent = '0';
      $('#statDistricts').textContent = '0';
    }
  }

  /* ---------------- triage ---------------- */
  const selected = new Set();

  async function initTriage() {
    const host = $('#symptomGroups');
    try {
      const cat = await api('/api/triage/symptoms');
      host.textContent = '';
      for (const grp of cat.groups) {
        const items = cat.symptoms.filter((s) => s.group === grp.id);
        if (!items.length) continue;
        const chips = el('div', { class: 'chips' });
        for (const s of items) {
          chips.append(
            el('button', {
              class: 'chip',
              type: 'button',
              'aria-pressed': 'false',
              'data-id': s.id,
              text: s.label,
              onclick: (e) => toggleSymptom(e.currentTarget, s.id),
            })
          );
        }
        host.append(el('fieldset', { class: 'sym-group' }, el('legend', { text: grp.label }), chips));
      }
    } catch (err) {
      host.textContent = '';
      host.append(el('p', { class: 'muted', text: 'Could not load the symptom list. Refresh the page to try again.' }));
    }

    $('#triageClear').addEventListener('click', () => {
      selected.clear();
      $$('.chip[aria-pressed="true"]').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      refreshTriageUI();
    });
    $('#triageForm').addEventListener('submit', onTriageSubmit);
    $('#resFind').addEventListener('click', async () => {
      document.getElementById('hospitals').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      if (!here) await locate();
    });
  }

  function toggleSymptom(btn, id) {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    if (on) selected.add(id); else selected.delete(id);
    refreshTriageUI();
  }

  function refreshTriageUI() {
    const n = selected.size;
    $('#triageBtn').disabled = n === 0;
    $('#triageClear').hidden = n === 0;
    $('#triageCount').textContent = n === 0 ? 'Nothing selected' : `${n} selected`;
  }

  // Gauge: score 0-100 maps to a half circle; segments match the server's thresholds.
  const SEGMENTS = [
    [0, 22, '#2b8a57'],
    [22, 45, '#b98200'],
    [45, 75, '#d9730d'],
    [75, 100, '#d62839'],
  ];
  function arc(s0, s1) {
    const R = 120, cx = 150, cy = 150;
    const pt = (s) => {
      const th = Math.PI * (1 - s / 100);
      return [(cx + R * Math.cos(th)).toFixed(2), (cy - R * Math.sin(th)).toFixed(2)];
    };
    const [x0, y0] = pt(s0);
    const [x1, y1] = pt(s1);
    return `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}`;
  }
  function buildGauge() {
    const g = $('#gaugeArcs');
    const NS = 'http://www.w3.org/2000/svg';
    for (const [a, b, color] of SEGMENTS) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', arc(a + 0.8, b - 0.8));
      p.setAttribute('class', 'seg-arc');
      p.setAttribute('stroke', color);
      g.append(p);
    }
  }

  function countUp(node, to) {
    if (reduceMotion) { node.textContent = String(to); return; }
    const start = performance.now();
    const dur = 1300;
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      node.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  async function onTriageSubmit(e) {
    e.preventDefault();
    if (!selected.size) return;
    const panel = $('#result');
    const age = (new FormData(e.currentTarget).get('age')) || 'adult';
    panel.dataset.state = 'scanning';
    if (matchMedia('(max-width: 900px)').matches) panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

    try {
      const [r] = await Promise.all([
        api('/api/triage', { method: 'POST', body: { symptoms: [...selected], age } }),
        new Promise((ok) => setTimeout(ok, reduceMotion ? 0 : 900)),
      ]);
      renderResult(r);
    } catch (err) {
      panel.dataset.state = 'idle';
      toast(err.message);
    }
  }

  function renderResult(r) {
    const panel = $('#result');
    panel.className = `result lv-${r.level}`;
    panel.dataset.state = 'done';

    $('#resTitle').textContent = r.title;
    $('#resHeadline').textContent = r.headline;
    $('#resDisclaimer').textContent = r.disclaimer;

    const support = $('#resSupport');
    support.hidden = !r.support;
    support.textContent = r.support || '';

    const steps = $('#resSteps');
    steps.textContent = '';
    r.steps.forEach((s) => steps.append(el('li', { text: s })));

    const warn = $('#resWarn');
    warn.hidden = !r.warningSigns.length;
    const wl = $('#resWarnList');
    wl.textContent = '';
    r.warningSigns.forEach((w) => wl.append(el('li', { text: w })));

    const aid = $('#resAid');
    const aidList = $('#resAidList');
    aidList.textContent = '';
    aid.hidden = !r.firstAid.length;
    r.firstAid.forEach((id) => {
      const card = $(`#aid-${id}`);
      if (!card) return;
      aidList.append(el('button', { type: 'button', text: card.dataset.title, onclick: () => openAid(id) }));
    });

    $('#resCall').hidden = !r.callNow;

    // Animate the needle from rest to the score.
    const needle = $('#needle');
    needle.style.transform = 'rotate(-90deg)';
    void needle.getBoundingClientRect();
    requestAnimationFrame(() => { needle.style.transform = `rotate(${-90 + r.score * 1.8}deg)`; });
    countUp($('#scoreNum'), r.score);
  }

  /* ---------------- hospitals ---------------- */
  let here = null; // { lat, lng }
  const hosp = { q: '', district: '', offset: 0, total: 0, loading: false };
  const PAGE = 12;

  function setStatus(msg) { $('#hospStatus').textContent = msg; }

  function locate() {
    return new Promise((resolve) => {
      const radar = $('#radar');
      if (!navigator.geolocation) {
        setStatus('This browser cannot share your location. Search by name or pick a district instead.');
        return resolve(false);
      }
      radar.classList.remove('found');
      radar.classList.add('locating');
      setStatus('Finding your location\u2026');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          radar.classList.remove('locating');
          radar.classList.add('found');
          loadHospitals(true).then(() => resolve(true));
        },
        (err) => {
          radar.classList.remove('locating');
          const msg =
            err.code === 1
              ? 'Location is blocked. Allow it in your browser settings, or search by name or district.'
              : 'Could not get your location. Search by name or pick a district instead.';
          setStatus(msg);
          loadHospitals(true);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  function phoneHref(p) {
    const m = String(p).match(/[+\d][\d\s\-()+]{5,}/);
    return m ? 'tel:' + m[0].replace(/[^\d+]/g, '') : null;
  }

  function hospitalRow(h, i) {
    const metaBits = [h.type, h.district].filter(Boolean).join(', ');
    const acts = el('div', { class: 'acts' });
    if (h.lat !== null) {
      acts.append(
        el('a', {
          class: 'primary',
          href: `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`,
          target: '_blank',
          rel: 'noopener noreferrer',
          text: 'Get directions',
        })
      );
    }
    const tel = h.phone ? phoneHref(h.phone) : null;
    if (tel) acts.append(el('a', { href: tel, text: `Call ${h.phone}` }));

    const row = el(
      'li',
      { class: 'hosp' },
      el('div', {}, el('h3', { text: h.name }), metaBits ? el('p', { class: 'meta', text: metaBits }) : null, h.address ? el('p', { class: 'meta', text: h.address }) : null),
      h.distanceKm !== null ? el('div', { class: 'dist' }, String(h.distanceKm), el('small', { text: ' km' })) : null,
      acts.childElementCount ? acts : null
    );
    row.style.setProperty('--i', String(Math.min(i, 10)));
    return row;
  }

  function showSkeleton() {
    const list = $('#hospList');
    list.textContent = '';
    for (let i = 0; i < 4; i++) list.append(el('li', { class: 'skel', 'aria-hidden': 'true' }));
  }

  async function loadHospitals(reset) {
    if (hosp.loading) return;
    hosp.loading = true;
    if (reset) { hosp.offset = 0; showSkeleton(); }
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(hosp.offset) });
    if (hosp.q) params.set('q', hosp.q);
    if (hosp.district) params.set('district', hosp.district);
    if (here) { params.set('lat', String(here.lat)); params.set('lng', String(here.lng)); }

    try {
      const data = await api('/api/hospitals?' + params);
      const list = $('#hospList');
      if (reset) list.textContent = '';
      const base = hosp.offset;
      data.items.forEach((h, i) => list.append(hospitalRow(h, i)));
      hosp.offset = base + data.items.length;
      hosp.total = data.total;
      $('#hospMore').hidden = hosp.offset >= data.total;

      if (!data.total) setStatus('No hospitals match. Try a different name or district.');
      else setStatus(`Showing ${fmt(hosp.offset)} of ${fmt(data.total)}${here ? ', nearest first' : ''}`);
    } catch (err) {
      $('#hospList').textContent = '';
      setStatus(err.message);
    } finally {
      hosp.loading = false;
    }
  }

  function initHospitals() {
    $('#locateBtn').addEventListener('click', locate);
    $('#heroLocate').addEventListener('click', () => {
      document.getElementById('hospitals').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      locate();
    });
    let t;
    $('#hospQ').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { hosp.q = e.target.value.trim(); loadHospitals(true); }, 250);
    });
    $('#hospDistrict').addEventListener('change', (e) => { hosp.district = e.target.value; loadHospitals(true); });
    $('#hospMore').addEventListener('click', () => loadHospitals(false));
    loadHospitals(true);
  }

  /* ---------------- first aid ---------------- */
  function openAid(id) {
    const card = $(`#aid-${id}`);
    if (!card) return;
    card.open = true;
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }

  async function initFirstAid() {
    const host = $('#aidList');
    try {
      const cards = await api('/api/firstaid');
      host.textContent = '';
      for (const c of cards) {
        const steps = el('ol');
        c.steps.forEach((s) => steps.append(el('li', { text: s })));
        const avoid = c.avoid && c.avoid.length ? el('div', { class: 'avoid' }, el('p', { text: 'Avoid' }), el('ul')) : null;
        if (avoid) c.avoid.forEach((a) => avoid.querySelector('ul').append(el('li', { text: a })));
        host.append(el('details', { class: 'aid-item', id: `aid-${c.id}`, 'data-title': c.title }, el('summary', { text: c.title }), steps, avoid));
      }
    } catch {
      host.textContent = '';
      host.append(el('p', { class: 'muted', text: 'Could not load first-aid cards. Refresh the page to try again.' }));
    }
  }

  /* ---------------- account ---------------- */
  let user = null;
  let googleReady = false;
  let googleClientId = null;

  const dlg = $('#auth');
  const authBody = $('#authBody');
  const TITLES = { signin: 'Sign in', signup: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password' };

  function setView(v) {
    authBody.dataset.view = v;
    $('#authTitle').textContent = TITLES[v];
    $('#googleWrap').hidden = !(googleReady && (v === 'signin' || v === 'signup'));
    authMsg('');
    const first = $(`[data-for="${v}"] input`, authBody);
    if (first) setTimeout(() => first.focus(), 30);
  }

  function authMsg(text, ok = false, link = null) {
    const m = $('#authMsg');
    m.textContent = text;
    m.classList.toggle('ok', ok);
    if (link) {
      m.append(document.createElement('br'), el('a', { href: link, text: 'Open the reset link' }));
    }
    m.hidden = !text;
  }

  function openAuth(view) {
    setView(view);
    if (!dlg.open) dlg.showModal();
  }

  function renderAccount() {
    const b = $('#accountBtn');
    b.textContent = user ? `Sign out (${user.name.split(' ')[0]})` : 'Sign in';
  }

  async function submitForm(form, path, extra = {}) {
    const btn = $('button[type="submit"]', form);
    const data = { ...Object.fromEntries(new FormData(form).entries()), ...extra };
    btn.disabled = true;
    authMsg('');
    try {
      return await api(path, { method: 'POST', body: data });
    } catch (err) {
      authMsg(err.message);
      return null;
    } finally {
      btn.disabled = false;
    }
  }

  function signedIn(u) {
    user = u;
    renderAccount();
    dlg.close();
    toast(`Signed in as ${u.name}`);
  }

  async function onGoogle(resp) {
    try {
      const r = await api('/api/auth/google', { method: 'POST', body: { credential: resp.credential } });
      signedIn(r.user);
    } catch (err) {
      authMsg(err.message);
    }
  }

  function loadGoogle() {
    if (!googleClientId) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      if (!window.google || !google.accounts) return;
      google.accounts.id.initialize({ client_id: googleClientId, callback: onGoogle });
      google.accounts.id.renderButton($('#gbtn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 320 });
      googleReady = true;
      const v = authBody.dataset.view;
      $('#googleWrap').hidden = !(v === 'signin' || v === 'signup');
    };
    document.head.append(s);
  }

  async function initAccount() {
    $('#accountBtn').addEventListener('click', async () => {
      if (user) {
        await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
        user = null;
        renderAccount();
        toast('Signed out');
      } else {
        openAuth('signin');
      }
    });
    $('#authClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    $$('[data-go]', authBody).forEach((b) => b.addEventListener('click', () => setView(b.dataset.go)));

    $('#formSignin').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await submitForm(e.currentTarget, '/api/auth/login');
      if (r) signedIn(r.user);
    });
    $('#formSignup').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await submitForm(e.currentTarget, '/api/auth/register');
      if (r) signedIn(r.user);
    });
    $('#formForgot').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await submitForm(e.currentTarget, '/api/auth/forgot');
      if (r) authMsg(r.message, true, r.demoLink || null);
    });
    const resetToken = new URLSearchParams(location.search).get('reset');
    $('#formReset').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await submitForm(e.currentTarget, '/api/auth/reset', { token: resetToken });
      if (r) {
        history.replaceState(null, '', location.pathname);
        signedIn(r.user);
      }
    });

    try {
      const [cfg, me] = await Promise.all([api('/api/config'), api('/api/me')]);
      googleClientId = cfg.googleClientId;
      user = me.user;
      renderAccount();
      loadGoogle();
    } catch { /* offline or server asleep: the rest of the app still works */ }

    if (resetToken) openAuth('reset');
  }

  /* ---------------- boot ---------------- */
  buildGauge();
  initECG();
  loadStats();
  initTriage();
  initHospitals();
  initFirstAid();
  initAccount();
})();
