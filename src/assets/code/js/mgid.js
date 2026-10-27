/* EarthInsider MGID loader.
   Places widget slots from the page's JSON config (#mgid-config) and loads MGID only after the
   first user interaction (scroll / touch / key) or 5 s after window "load", whichever is first.
   Never removes an ad that has been filled. Fails open: any error leaves the page untouched.
   Debug: ?noads=1 disables ads, ?adaudit=1 shows an on-screen report (slots, fill times, CLS). */
(function (root) {
  'use strict';

  function words(s) { s = (s || '').trim(); return s ? s.split(/\s+/).length : 0; }

  function inlineTargets(W, max) {
    var t;
    if (W < 300) t = [];
    else if (W < 700) t = [35];
    else if (W < 1200) t = [14, 55];
    else if (W < 2000) t = [12, 38, 64];
    else t = [10, 32, 54, 76];
    return t.slice(0, Math.max(0, max));
  }

  var HEAD = /^H[1-6]$/, LISTY = /^(UL|OL|TABLE|PRE)$/;

  function chooseBoundaries(blocks, targets, minGap) {
    var n = blocks.length, cum = [0], i, k, b, u;
    for (i = 0; i < n; i++) cum.push(cum[i] + blocks[i].words);
    var W = cum[n], used = [], out = [];
    function valid(x) {
      if (x < 1 || x >= n) return false;
      if (cum[x] < 60 || W - cum[x] < 120) return false;
      var p = blocks[x - 1], q = blocks[x];
      if (HEAD.test(p.tag)) return false;
      if (p.colon && LISTY.test(q.tag)) return false;
      if (q.tag === 'FIGCAPTION') return false;
      return true;
    }
    for (k = 0; k < targets.length; k++) {
      var want = targets[k] / 100 * W, best = -1, bestScore = 1e12;
      for (b = 1; b < n; b++) {
        if (!valid(b)) continue;
        var ok = true;
        for (u = 0; u < used.length; u++) if (Math.abs(cum[b] - cum[used[u]]) < minGap) { ok = false; break; }
        if (!ok) continue;
        var score = Math.abs(cum[b] - want) - (HEAD.test(blocks[b].tag) ? 0.04 * W : 0);
        if (score < bestScore) { bestScore = score; best = b; }
      }
      if (best > -1) used.push(best);
      out.push(best);
    }
    return out;
  }

  function feedPositions(feed, N) {
    var out = [], i, p;
    if (feed.rule === 'category') {
      if (N < 3) return out;
      out.push(2);
      if (N >= 9) { p = Math.round(N * 0.4); if (p >= out[out.length - 1] + 3 && p <= N - 2) out.push(p); }
      if (N >= 21) { p = Math.round(N * 0.7); if (p >= out[out.length - 1] + 3 && p <= N - 2) out.push(p); }
      return out;
    }
    if (feed.minCards && N < feed.minCards) return out;
    var at = feed.at || [];
    for (i = 0; i < at.length; i++) if (at[i] >= 1 && at[i] <= N) out.push(at[i]);
    return out;
  }

  function feedPlan(feed, N, dev) {
    var out = [], i;
    if (feed.items) {
      for (i = 0; i < feed.items.length; i++) {
        var it = feed.items[i];
        if (it.device && it.device !== 'all' && it.device !== dev) continue;
        if (it.at >= 1 && it.at <= N) out.push({ pos: it.at, def: it });
      }
      return out;
    }
    var pos = feedPositions(feed, N), slots = feed.slots || [];
    for (i = 0; i < pos.length && i < slots.length; i++) out.push({ pos: pos[i], def: slots[i] });
    return out;
  }

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { inlineTargets: inlineTargets, chooseBoundaries: chooseBoundaries, feedPositions: feedPositions, feedPlan: feedPlan, words: words };
    return;
  }

  try {
    var cfgEl = document.getElementById('mgid-config');
    if (!cfgEl) return;
    var C = JSON.parse(cfgEl.textContent);
    var qs = location.search;
    var audit = /[?&]adaudit=1/.test(qs);
    var html = document.documentElement;

    function dropAnchors() {
      var a = document.querySelectorAll('[data-ad-anchor]');
      for (var i = 0; i < a.length; i++) if (!a[i].getAttribute('data-ad-used')) a[i].parentNode.removeChild(a[i]);
    }
    if (/[?&]noads=1/.test(qs) || C.hosts.indexOf(location.hostname) < 0) {
      html.className = html.className.replace(' ads-on', '');
      var all = document.querySelectorAll('[data-ad-anchor]');
      for (var z = 0; z < all.length; z++) all[z].parentNode.removeChild(all[z]);
      return;
    }

    var dev = (window.matchMedia && window.matchMedia('(min-width:1024px)').matches) ? 'desktop' : 'mobile';
    var slots = [], overlays = [], reserved = [], W = null;

    function mkSlot(def, key) {
      var s = document.createElement('div');
      s.className = 'mgid-slot';
      s.setAttribute('data-mgid-slot', key);
      if (def.panel) s.setAttribute('data-panel', '1');
      var w = document.createElement('div');
      w.setAttribute('data-type', '_mgwidget');
      w.setAttribute('data-widget-id', def.id);
      s.appendChild(w);
      slots.push(s);
      return s;
    }

    var body = document.getElementById('article-body');
    if (body && C.inline && C.inline.length) {
      var root = body, d;
      for (d = 0; d < 3; d++) {
        var kids = [].filter.call(root.children, function (e) { return e.nodeType === 1; });
        if (kids.length === 1 && kids[0].tagName === 'DIV' && kids[0].children.length > 3) root = kids[0]; else break;
      }
      var els = [].filter.call(root.children, function (e) { return e.nodeType === 1 && !/mgid-slot/.test(e.className || ''); });
      var blocks = els.map(function (e) {
        var t = e.textContent || '';
        return { words: words(t), tag: e.tagName, colon: /:\s*$/.test(t.trim()) };
      });
      W = blocks.reduce(function (a, b) { return a + b.words; }, 0);
      var picks = chooseBoundaries(blocks, inlineTargets(W, C.inline.length), C.minWords || 220);
      for (var i = 0; i < picks.length; i++) {
        if (picks[i] < 0) continue;
        root.insertBefore(mkSlot(C.inline[i], 'inline-' + (i + 1)), els[picks[i]]);
      }
    } else if (body) {
      W = words(body.textContent);
    }

    var anchors = C.anchors || {}, key;
    for (key in anchors) {
      if (!anchors.hasOwnProperty(key)) continue;
      var def = anchors[key], a = document.querySelector('[data-ad-anchor="' + key + '"]');
      if (!a) continue;
      var skip = (def.device && def.device !== 'all' && def.device !== dev) || (def.minWords && W !== null && W < def.minWords);
      if (skip) { a.parentNode.removeChild(a); continue; }
      var sl = mkSlot(def, key);
      if (def.reserve) { a.setAttribute('data-ad-used', '1'); a.appendChild(sl); reserved.push(a); }
      else a.parentNode.replaceChild(sl, a);
    }

    var feeds = C.feeds || {}, fk;
    for (fk in feeds) {
      if (!feeds.hasOwnProperty(fk)) continue;
      var box = document.querySelector('[data-ad-feed="' + fk + '"]');
      if (!box) continue;
      var cards = [].filter.call(box.children, function (e) { return e.nodeType === 1; });
      var plan = feedPlan(feeds[fk], cards.length, dev);
      for (var j = 0; j < plan.length; j++) {
        var s2 = mkSlot(plan[j].def, fk + '-' + plan[j].pos);
        s2.style.gridColumn = '1 / -1';
        box.insertBefore(s2, cards[plan[j].pos - 1].nextSibling);
      }
    }
    dropAnchors();

    (C.overlays || []).forEach(function (o) {
      if (!o.enabled || (o.device && o.device !== 'all' && o.device !== dev)) return;
      var e = document.createElement('div');
      e.setAttribute('data-type', '_mgwidget');
      e.setAttribute('data-widget-id', o.id);
      e.setAttribute('data-mgid-overlay', o.name || o.id);
      document.body.appendChild(e);
      overlays.push(e);
    });

    /* ---------- when to load: first interaction, or 5 s after window load ---------- */
    var loaded = false, wanted = false, started = false, startMode = '-', startAt = null;
    var EVENTS = ['scroll', 'touchstart', 'pointerdown', 'keydown', 'wheel'];
    function untrack() { EVENTS.forEach(function (ev) { window.removeEventListener(ev, onInteract, { passive: true }); }); }
    function onInteract() { if (loaded) start('interaction'); else wanted = true; }
    function start(mode) {
      if (started) return;
      started = true; startMode = mode; startAt = performance.now();
      untrack();
      run();
    }
    EVENTS.forEach(function (ev) { window.addEventListener(ev, onInteract, { passive: true }); });
    function onLoaded() {
      loaded = true;
      if (wanted) start('interaction');
      else setTimeout(function () { start('timer'); }, C.startAfterMs || 5000);
    }
    if (document.readyState === 'complete') onLoaded(); else window.addEventListener('load', onLoaded);

    function run() {
      var count = slots.length + overlays.length;
      if (!count) return;
      window._mgq = window._mgq || [];
      var s = document.createElement('script');
      s.async = true; s.src = C.loader;
      document.head.appendChild(s);
      var n = 0;
      (function next() {
        if (n >= count) return;
        window._mgq.push(['_mgc.load']);
        n++;
        setTimeout(next, C.gapMs || 100);
      })();
      setTimeout(function () {
        reserved.forEach(function (an) {
          var w = an.querySelector('[data-type="_mgwidget"]');
          if (w && !w.childNodes.length) an.className += ' ad-empty';
        });
      }, 15000);
    }

    /* ---------- on-screen audit (?adaudit=1) ---------- */
    if (audit) {
      var L = { cls: 0, shifts: [], fills: {}, gone: {} };
      var secs = function () { return (performance.now() / 1000).toFixed(1) + 's'; };
      var desc = function (n) {
        if (!n || !n.tagName) return '?';
        var t = n.tagName.toLowerCase();
        if (n.id) t += '#' + n.id;
        var c = (typeof n.className === 'string' ? n.className : '').trim().split(/\s+/).slice(0, 2).join('.');
        return c ? t + '.' + c : t;
      };
      try {
        new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (e) {
            if (e.hadRecentInput) return;
            L.cls += e.value;
            L.shifts.push(e.value.toFixed(3) + ' ' + (e.sources || []).slice(0, 2).map(function (x) { return desc(x.node); }).join(' | '));
            if (L.shifts.length > 4) L.shifts.shift();
          });
        }).observe({ type: 'layout-shift', buffered: true });
      } catch (e1) { /* unsupported */ }
      slots.forEach(function (sl) {
        var k = sl.getAttribute('data-mgid-slot');
        try {
          new MutationObserver(function () {
            var w = sl.firstChild, filled = w && w.childNodes.length > 0;
            if (filled && !L.fills[k]) L.fills[k] = secs();
            if (!filled && L.fills[k] && !L.gone[k]) L.gone[k] = secs();
          }).observe(sl, { childList: true, subtree: true });
        } catch (e2) { /* ignore */ }
      });
      var box2 = document.createElement('div');
      box2.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:2147483000;max-width:94vw;max-height:50vh;overflow:auto;font:11px/1.35 monospace;background:rgba(0,0,0,.86);color:#9f9;padding:6px 8px;border-radius:6px;white-space:pre-wrap';
      box2.addEventListener('click', function () { box2.style.maxHeight = box2.style.maxHeight === '18px' ? '50vh' : '18px'; });
      document.body.appendChild(box2);
      setInterval(function () {
        var docH = document.documentElement.scrollHeight, sum = 0, lines = [];
        slots.forEach(function (sl) {
          var k = sl.getAttribute('data-mgid-slot'), inDom = document.body.contains(sl);
          var h = inDom ? Math.round(sl.getBoundingClientRect().height) : 0;
          if (inDom) sum += h;
          lines.push((inDom ? '' : 'X ') + k + ' h=' + h + ' fill=' + (L.fills[k] || '-') + (L.gone[k] ? ' GONE@' + L.gone[k] : ''));
        });
        box2.textContent = 'ADAUDIT ' + dev + ' page=' + C.page + ' words=' + W + '\n' +
          'start=' + (started ? startMode + '@' + (startAt / 1000).toFixed(1) + 's' : 'waiting') + ' now=' + secs() + '\n' +
          'ad share=' + (100 * sum / docH).toFixed(1) + '% (MGID max 30%)\n' +
          'CLS=' + L.cls.toFixed(3) + (L.shifts.length ? '\n' + L.shifts.join('\n') : '') + '\n' + lines.join('\n') + '\n(tap to fold)';
      }, 1000);
    }
  } catch (err) {
    /* fail open */
  }
})(this);
