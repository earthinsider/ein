/* EarthInsider MGID loader.
   Places widget slots from the page's JSON config (#mgid-config), then loads MGID right after
   window "load", one widget every few ms. Fails open: any error leaves the page untouched.
   Debug: ?noads=1 disables ads, ?adaudit=1 prints the ad share of the page to the console. */
(function (root) {
  'use strict';

  function words(s) { s = (s || '').trim(); return s ? s.split(/\s+/).length : 0; }

  /* % positions of in-article slots by article length (words) */
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

  /* blocks: [{words, tag, colon}] -> index of the block each slot goes BEFORE (-1 = no valid spot) */
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

  /* card counts -> "insert after card p" positions */
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

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { inlineTargets: inlineTargets, chooseBoundaries: chooseBoundaries, feedPositions: feedPositions, words: words };
    return;
  }

  try {
    var cfgEl = document.getElementById('mgid-config');
    if (!cfgEl) return;
    var C = JSON.parse(cfgEl.textContent);
    var qs = location.search;

    function dropAnchors() {
      var a = document.querySelectorAll('[data-ad-anchor]');
      for (var i = 0; i < a.length; i++) a[i].parentNode.removeChild(a[i]);
    }
    if (/[?&]noads=1/.test(qs) || C.hosts.indexOf(location.hostname) < 0) { dropAnchors(); return; }

    var dev = (window.matchMedia && window.matchMedia('(min-width:1024px)').matches) ? 'desktop' : 'mobile';
    var slots = [], overlays = [];

    function mkSlot(def, key) {
      var s = document.createElement('div');
      s.className = 'mgid-slot';
      s.setAttribute('data-mgid-slot', key);
      if (def.panel) s.setAttribute('data-panel', '1');
      if (def.reserve && dev === 'desktop') s.style.minHeight = def.reserve + 'px';
      var w = document.createElement('div');
      w.setAttribute('data-type', '_mgwidget');
      w.setAttribute('data-widget-id', def.id);
      s.appendChild(w);
      slots.push(s);
      return s;
    }

    /* article body: in-article slots by % of the text */
    var body = document.getElementById('article-body'), W = null;
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
      var targets = inlineTargets(W, C.inline.length);
      var picks = chooseBoundaries(blocks, targets, C.minWords || 220);
      for (var i = 0; i < picks.length; i++) {
        if (picks[i] < 0) continue;
        root.insertBefore(mkSlot(C.inline[i], 'inline-' + (i + 1)), els[picks[i]]);
      }
    } else if (body) {
      W = words(body.textContent);
    }

    /* anchors (under-article, sidebar, ends of lists ...) */
    var anchors = C.anchors || {}, key;
    for (key in anchors) {
      if (!anchors.hasOwnProperty(key)) continue;
      var def = anchors[key], a = document.querySelector('[data-ad-anchor="' + key + '"]');
      if (!a) continue;
      var skip = (def.device && def.device !== 'all' && def.device !== dev) || (def.minWords && W !== null && W < def.minWords);
      if (skip) { a.parentNode.removeChild(a); continue; }
      a.parentNode.replaceChild(mkSlot(def, key), a);
    }

    /* feeds: slots between cards */
    var feeds = C.feeds || {}, fk;
    for (fk in feeds) {
      if (!feeds.hasOwnProperty(fk)) continue;
      var box = document.querySelector('[data-ad-feed="' + fk + '"]');
      if (!box) continue;
      var cards = [].filter.call(box.children, function (e) { return e.nodeType === 1; });
      var pos = feedPositions(feeds[fk], cards.length);
      for (var j = 0; j < pos.length && j < feeds[fk].slots.length; j++) {
        var s2 = mkSlot(feeds[fk].slots[j], fk + '-' + (j + 1));
        s2.style.gridColumn = '1 / -1';
        box.insertBefore(s2, cards[pos[j] - 1].nextSibling);
      }
    }
    dropAnchors();

    /* overlay formats (Swipe Up, notification, Exit Story) */
    (C.overlays || []).forEach(function (o) {
      if (!o.enabled || (o.device && o.device !== 'all' && o.device !== dev)) return;
      var e = document.createElement('div');
      e.setAttribute('data-type', '_mgwidget');
      e.setAttribute('data-widget-id', o.id);
      document.body.appendChild(e);
      overlays.push(e);
    });

    function top(e) { return e.getBoundingClientRect().top + (window.pageYOffset || 0); }

    function run() {
      var order = slots.slice().sort(function (a, b) { return top(a) - top(b); });
      var count = order.length + overlays.length;
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
      /* tidy: slots that never got an ad give their space back */
      setTimeout(function () {
        slots.forEach(function (sl) {
          if (!sl.parentNode) return;
          var w = sl.firstChild;
          if (w && !w.childNodes.length) sl.parentNode.removeChild(sl); else sl.style.minHeight = '';
        });
      }, 12000);
      if (/[?&]adaudit=1/.test(qs)) setTimeout(audit, 15000);
    }

    function audit() {
      var docH = document.documentElement.scrollHeight, sum = 0, rows = [];
      slots.forEach(function (sl) {
        if (!sl.parentNode) return;
        var h = sl.getBoundingClientRect().height; sum += h;
        rows.push({ slot: sl.getAttribute('data-mgid-slot'), height: Math.round(h) });
      });
      if (window.console && console.table) console.table(rows);
      if (window.console) console.log('[mgid] ad share of page: ' + (100 * sum / docH).toFixed(1) + '% (MGID limit: 30%)');
    }

    if (document.readyState === 'complete') run(); else window.addEventListener('load', run);
  } catch (err) {
    /* fail open */
  }
})(this);
