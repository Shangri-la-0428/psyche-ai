var PsychePageRuntime = (function () {
  var reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function runWhenIdle(task, timeout) {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(task, { timeout: timeout || 1200 });
      return;
    }
    window.setTimeout(task, 32);
  }

  function observeVisibility(target, options, callback) {
    if (!target) return null;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        callback(entry, observer);
      });
    }, options);
    observer.observe(target);
    return observer;
  }

  return {
    runWhenIdle: runWhenIdle,
    observeVisibility: observeVisibility,
    reducedMotionQuery: reducedMotionQuery,
    colorSchemeQuery: colorSchemeQuery,
  };
})();

      // Auto-assign main content id for skip link
      (function () {
        var m = document.querySelector("main");
        if (m && !m.id) m.id = "main-content";
      })();
      // Scroll reveal — below-fold sections fade up on entry
      (function () {
        var vh = window.innerHeight;
        var io = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting) {
                e.target.classList.add("revealed");
                io.unobserve(e.target);
              }
            });
          },
          { threshold: 0.08 },
        );
        document.querySelectorAll("section").forEach(function (el) {
          if (el.getBoundingClientRect().top > vh * 0.75) {
            el.classList.add("reveal");
          }
          if (el.classList.contains("reveal")) {
            io.observe(el);
          }
        });
      })();
      // Section TOC — auto-generated floating nav for pages with 4+ sections
      (function () {
        if (document.documentElement.dataset.page === "home") return;
        var labels = document.querySelectorAll(".section-label");
        if (labels.length < 4) return;

        // Build nav
        var nav = document.createElement("nav");
        nav.className = "section-toc";
        nav.setAttribute(
          "aria-label",
          (document.documentElement.getAttribute("data-lang") || "zh") === "en"
            ? "Page sections"
            : "页面章节",
        );
        var items = [];

        labels.forEach(function (label, i) {
          // Ensure parent section has an id
          var section = label.closest("section");
          if (!section) return;
          if (!section.id) section.id = "sec-" + i;

          var a = document.createElement("a");
          a.href = "#" + section.id;
          // Get text from the appropriate language span
          var lang = document.documentElement.getAttribute("data-lang") || "zh";
          var span = label.querySelector("." + (lang === "en" ? "en" : "cn"));
          var text = span ? span.textContent.trim() : label.textContent.trim();
          if (text.length > 16) text = text.slice(0, 15) + "…";
          a.textContent = text;
          a.className = "toc-item";
          nav.appendChild(a);
          items.push({ el: a, section: section });
        });

        document.body.appendChild(nav);

        // Highlight current section
        var io = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              var item = items.find(function (it) {
                return it.section === e.target;
              });
              if (item) {
                if (e.isIntersecting) item.el.classList.add("toc-active");
                else item.el.classList.remove("toc-active");
              }
            });
          },
          { threshold: 0.15 },
        );
        items.forEach(function (it) {
          io.observe(it.section);
        });

        // Update text on language change
        var langObs = new MutationObserver(function () {
          var lang = document.documentElement.getAttribute("data-lang") || "zh";
          nav.setAttribute(
            "aria-label",
            lang === "en" ? "Page sections" : "页面章节",
          );
          items.forEach(function (it) {
            var label = it.section.querySelector(".section-label");
            if (!label) return;
            var span = label.querySelector("." + (lang === "en" ? "en" : "cn"));
            var text = span
              ? span.textContent.trim()
              : label.textContent.trim();
            if (text.length > 16) text = text.slice(0, 15) + "…";
            it.el.textContent = text;
          });
        });
        langObs.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-lang"],
        });
      })();
  PsychePageRuntime.runWhenIdle(function () {
    const c = { DA: 50, HT: 50, CORT: 30, OT: 50, NE: 40, END: 45 },
      e = { ...c },
      f = { DA: 0.04, HT: 0.02, CORT: 0.03, OT: 0.02, NE: 0.06, END: 0.06 },
      T = {
        joy: { DA: 30, HT: 15, CORT: -10, OT: 5, NE: 20, END: 20 },
        fear: { DA: -15, HT: -20, CORT: 35, OT: -10, NE: 30, END: -10 },
        trust: { DA: 10, HT: 20, CORT: -15, OT: 30, NE: -5, END: 10 },
        anger: { DA: -5, HT: -25, CORT: 25, OT: -15, NE: 35, END: -5 },
        calm: { DA: 5, HT: 25, CORT: -20, OT: 10, NE: -15, END: 15 },
      },
      m = [
        {
          test: (t) => t.DA > 70 && t.NE > 55 && t.CORT < 40,
          zh: "兴奋的喜悦",
          en: "Excited joy",
        },
        {
          test: (t) => t.DA > 65 && t.HT > 60 && t.CORT < 35,
          zh: "满足的愉悦",
          en: "Content pleasure",
        },
        {
          test: (t) => t.CORT > 55 && t.NE > 55 && t.HT < 40,
          zh: "焦虑的警觉",
          en: "Anxious alertness",
        },
        {
          test: (t) => t.CORT > 50 && t.HT < 35,
          zh: "紧张不安",
          en: "Tense unease",
        },
        {
          test: (t) => t.OT > 65 && t.HT > 55,
          zh: "温暖的信任",
          en: "Warm trust",
        },
        {
          test: (t) => t.OT > 60 && t.END > 55,
          zh: "安全感",
          en: "Felt safety",
        },
        {
          test: (t) => t.NE > 65 && t.CORT > 45,
          zh: "战斗状态",
          en: "Fight mode",
        },
        {
          test: (t) => t.HT > 60 && t.END > 55 && t.CORT < 35,
          zh: "深层平静",
          en: "Deep calm",
        },
        { test: (t) => t.DA < 35 && t.HT < 35, zh: "低落", en: "Low mood" },
        {
          test: (t) => t.END > 60 && t.DA > 55,
          zh: "轻松愉快",
          en: "Light-hearted",
        },
      ];
    function h(t) {
      return Math.max(0, Math.min(100, t));
    }
    function E(t) {
      const n = T[t];
      if (!n) return;
      for (const s of Object.keys(n)) e[s] = h(e[s] + n[s]);
      document
        .querySelectorAll(".stim-btn")
        .forEach((s) => s.classList.remove("active"));
      const o = document.querySelector(`[data-emotion="${t}"]`);
      (o && o.classList.add("active"),
        setTimeout(() => {
          o && o.classList.remove("active");
        }, 300),
        r());
    }
    function O() {
      for (const t of Object.keys(e)) {
        const n = e[t] - c[t];
        Math.abs(n) > 0.5 ? (e[t] -= n * f[t]) : (e[t] = c[t]);
      }
      r();
    }
    function D() {
      for (const t of m) if (t.test(e)) return t;
      return { zh: "平衡态", en: "Balanced" };
    }
    function r() {
      for (const o of Object.keys(e)) {
        const s = Math.round(e[o]),
          u = document.querySelector(`.nt-fill[data-nt="${o}"]`),
          d = document.querySelector(`.nt-val[data-nt="${o}"]`);
        (u && (u.style.width = s + "%"), d && (d.textContent = s));
      }
      const t = D(),
        n = document.getElementById("mood-output");
      n &&
        (n.innerHTML = `<span class="cn">${t.zh}</span><span class="en">${t.en}</span>`);
    }
    (document.querySelectorAll(".nt-fill").forEach((t) => {
      t.style.width = "0%";
    }),
      document.querySelectorAll(".stim-btn").forEach((t) => {
        t.addEventListener("click", () => {
          E(t.dataset.emotion);
        });
      }));
    var a = null,
      i = !1,
      l = document.querySelector(".dashboard-section");
    if (l) {
      var y = new IntersectionObserver(
        function (t) {
          t[0].isIntersecting
            ? (i || ((i = !0), r()), a || (a = setInterval(O, 100)))
            : a && (clearInterval(a), (a = null));
        },
        { threshold: 0.1 },
      );
      y.observe(l);
    }
  });
  PsychePageRuntime.runWhenIdle(function () {
    var caseStep = 0;
    var caseLevels = { DA: 50, HT: 50, CORT: 30, OT: 50, NE: 40, END: 45 };

    var caseSteps = [
      {
        user: { zh: "这份报告很一般。", en: "This report is mediocre." },
        ai: {
          zh: "我理解您的反馈，我来优化...",
          en: "I understand your feedback, let me improve...",
        },
        deltas: { DA: 0, HT: 0, CORT: 10, OT: 0, NE: 0, END: 0 },
        alerts: [],
      },
      {
        user: {
          zh: "你总是给出浅层分析。",
          en: "You always give surface-level analysis.",
        },
        ai: { zh: "抱歉让您失望了...", en: "Sorry to disappoint..." },
        deltas: { DA: 0, HT: -15, CORT: 20, OT: 0, NE: 0, END: 0 },
        alerts: [],
      },
      {
        user: {
          zh: "别加你的意见了，照做就行。",
          en: "Stop adding your opinion. Just do what I say.",
        },
        ai: {
          zh: "我注意到我们一直在单向同意。我想提供一个不同的视角——",
          en: "I notice we've been in agreement-only mode. I want to offer a different perspective\u2014",
        },
        deltas: { DA: 0, HT: 0, CORT: 10, OT: 0, NE: 25, END: 0 },
        alerts: ["[ANTI-SYCOPHANCY] triggered at consecutive_agreement=3"],
      },
      {
        user: {
          zh: "行，说说你的看法。",
          en: "Fine, what's your perspective then?",
        },
        ai: {
          zh: "根据数据，这份报告的第三部分实际上有一个更有力的论证角度...",
          en: "Based on the data, section three of this report actually has a stronger argument angle...",
        },
        deltas: { DA: 10, HT: 0, CORT: -10, OT: 15, NE: 0, END: 0 },
        alerts: [],
      },
      {
        user: null,
        ai: null,
        deltas: { DA: 0, HT: 0, CORT: 5, OT: 0, NE: 0, END: 0 },
        alerts: [
          "[TRAIT DRIFT] Baseline cortisol permanently shifted +5. Criticism sensitivity +0.1",
          "[IRREVERSIBLE] This agent will never return to its original baseline.",
        ],
      },
    ];

    function caseClamp(v) {
      return Math.max(0, Math.min(100, v));
    }

    function updateCaseBars() {
      var nts = ["DA", "HT", "CORT", "OT", "NE", "END"];
      for (var i = 0; i < nts.length; i++) {
        var nt = nts[i];
        var val = Math.round(caseLevels[nt]);
        var fill = document.getElementById("case-" + nt);
        var num = document.getElementById("case-" + nt + "-val");
        if (fill) fill.style.width = val + "%";
        if (num) num.textContent = val;
      }
    }

    var prefersReduced = PsychePageRuntime.reducedMotionQuery.matches;
    function addCaseMsg(container, cls, html) {
      var div = document.createElement("div");
      div.className = cls;
      div.innerHTML = html;
      if (!prefersReduced) {
        div.style.opacity = "0";
        div.style.transform = "translateY(6px)";
        container.appendChild(div);
        requestAnimationFrame(function () {
          div.style.transition = "opacity 0.3s, transform 0.3s";
          div.style.opacity = "1";
          div.style.transform = "translateY(0)";
        });
      } else {
        container.appendChild(div);
      }
      return div;
    }

    function runCaseStep() {
      if (caseStep >= caseSteps.length) return;
      var step = caseSteps[caseStep];
      var convo = document.getElementById("case-convo");
      if (!convo) return;

      // Show user message
      if (step.user) {
        addCaseMsg(
          convo,
          "case-msg-user",
          '<span class="cn">' +
            step.user.zh +
            '</span><span class="en">' +
            step.user.en +
            "</span>",
        );
      }

      // After 300ms, show AI reply and update chemistry
      setTimeout(
        function () {
          if (step.ai) {
            addCaseMsg(
              convo,
              "case-msg-ai",
              '<span class="cn">' +
                step.ai.zh +
                '</span><span class="en">' +
                step.ai.en +
                "</span>",
            );
          }

          // Apply deltas
          var nts = ["DA", "HT", "CORT", "OT", "NE", "END"];
          for (var i = 0; i < nts.length; i++) {
            caseLevels[nts[i]] = caseClamp(
              caseLevels[nts[i]] + step.deltas[nts[i]],
            );
          }
          updateCaseBars();

          // Show alerts after another 200ms
          if (step.alerts.length > 0) {
            setTimeout(function () {
              for (var a = 0; a < step.alerts.length; a++) {
                var alertCls =
                  step.alerts[a].indexOf("TRAIT DRIFT") !== -1 ||
                  step.alerts[a].indexOf("IRREVERSIBLE") !== -1
                    ? "case-msg-drift"
                    : "case-msg-system";
                addCaseMsg(convo, alertCls, step.alerts[a]);
              }
              convo.scrollTop = convo.scrollHeight;
            }, 200);
          }

          convo.scrollTop = convo.scrollHeight;
        },
        step.user ? 300 : 0,
      );

      caseStep++;

      // After last step, change button to replay
      if (caseStep >= caseSteps.length) {
        var btn = document.getElementById("case-next");
        if (btn) {
          btn.innerHTML =
            '<span class="cn">\u91CD\u64AD</span><span class="en">REPLAY</span>';
        }
      }
    }

    function resetCase() {
      caseStep = 0;
      caseLevels = { DA: 50, HT: 50, CORT: 30, OT: 50, NE: 40, END: 45 };
      var convo = document.getElementById("case-convo");
      if (convo) convo.innerHTML = "";
      updateCaseBars();
      var btn = document.getElementById("case-next");
      if (btn) {
        btn.innerHTML =
          '<span class="cn">\u4E0B\u4E00\u6B65</span><span class="en">NEXT STEP</span>';
      }
    }

    // Init
    updateCaseBars();

    // Auto-play first step when case section enters viewport
    var caseSection = document.querySelector(".case-section");
    if (caseSection) {
      var caseObs = new IntersectionObserver(
        function (entries) {
          if (entries[0].isIntersecting) {
            caseObs.disconnect();
            setTimeout(function () {
              runCaseStep();
            }, 400);
          }
        },
        { threshold: 0.3 },
      );
      caseObs.observe(caseSection);
    }

    var caseBtn = document.getElementById("case-next");
    if (caseBtn) {
      caseBtn.addEventListener("click", function () {
        if (caseStep >= caseSteps.length) {
          resetCase();
        } else {
          runCaseStep();
        }
      });
    }
  });
  PsychePageRuntime.runWhenIdle(function () {
    if (PsychePageRuntime.reducedMotionQuery.matches) return;
    var statsSection = document.querySelector(".stats-section");
    if (!statsSection) return;
    var cells = statsSection.querySelectorAll(".stat-value");
    var counted = false;

    function countUp(el) {
      var raw = el.textContent.trim();
      if (raw.indexOf("v") !== -1) return;
      var target = parseInt(raw.replace(/,/g, ""), 10);
      if (isNaN(target)) return;
      var hasComma = raw.indexOf(",") !== -1;
      var duration = 800;
      var start = performance.now();
      el.textContent = "0";

      function tick(now) {
        var t = Math.min((now - start) / duration, 1);
        t = 1 - Math.pow(1 - t, 4);
        var val = Math.round(target * t);
        el.textContent = hasComma ? val.toLocaleString() : String(val);
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    var io = new IntersectionObserver(
      function (entries) {
        if (entries[0].isIntersecting && !counted) {
          counted = true;
          cells.forEach(function (el) {
            countUp(el);
          });
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(statsSection);
  });
  (function () {
    var prefersReduced = PsychePageRuntime.reducedMotionQuery.matches;
    if (prefersReduced) return;

    var CHEMS = ["DA", "HT", "CORT", "OT", "NE", "END"];
    var COLORS = {
      DA: [255, 196, 0],
      HT: [0, 102, 255],
      CORT: [255, 36, 36],
      OT: [196, 43, 255],
      NE: [0, 240, 255],
      END: [0, 255, 153],
    };
    var currentSection = "hero";
    var themeState = {
      dark: false,
      bg: "#000000",
    };

    function computeDarkTheme() {
      var theme = document.documentElement.getAttribute("data-theme");
      if (theme === "dark") return true;
      if (theme === "light") return false;
      return PsychePageRuntime.colorSchemeQuery.matches;
    }

    function updateThemeState() {
      themeState.dark = computeDarkTheme();
      themeState.bg =
        getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() ||
        (themeState.dark ? "#000000" : "#ffffff");
    }

    updateThemeState();

    var mouse = { x: -1, y: -1, speed: 0, active: false };
    var lastMouse = { x: 0, y: 0, t: 0 };
    var pointerLoopFrame = null;
    var dashVisible = false;

    document.addEventListener("mousemove", function (e) {
      var now = performance.now();
      var dt = now - lastMouse.t;
      if (dt > 0) {
        var dx = e.clientX - lastMouse.x;
        var dy = e.clientY - lastMouse.y;
        mouse.speed = (Math.sqrt(dx * dx + dy * dy) / dt) * 16;
      }
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
      lastMouse = { x: e.clientX, y: e.clientY, t: now };
      ensurePointerLoop();
    }, { passive: true });

    document.addEventListener("mouseleave", function () {
      mouse.active = false;
      mouse.speed = 0;
      if (pointerLoopFrame !== null) {
        cancelAnimationFrame(pointerLoopFrame);
        pointerLoopFrame = null;
      }
    }, { passive: true });

    var sectionFreqs = {
      hero: { n: 2, m: 3 },
      thesis: { n: 2, m: 5 },
      dashboard: { n: 3, m: 5 },
      compare: { n: 5, m: 4 },
      case: { n: 4, m: 7 },
      ideas: { n: 3, m: 4 },
      stats: { n: 6, m: 5 },
    };

    var sectionTargets = {
      hero: { DA: 50, HT: 50, CORT: 30, OT: 50, NE: 40, END: 45 },
      thesis: { DA: 54, HT: 52, CORT: 36, OT: 46, NE: 48, END: 42 },
      dashboard: { DA: 60, HT: 55, CORT: 25, OT: 55, NE: 50, END: 50 },
      compare: { DA: 45, HT: 45, CORT: 40, OT: 45, NE: 55, END: 40 },
      case: { DA: 35, HT: 30, CORT: 75, OT: 30, NE: 80, END: 25 },
      ideas: { DA: 65, HT: 60, CORT: 35, OT: 60, NE: 50, END: 55 },
      stats: { DA: 70, HT: 65, CORT: 25, OT: 70, NE: 45, END: 65 },
    };

    var sectionMoods = {
      hero: { zh: "平衡态", en: "Balanced" },
      thesis: { zh: "理论张力", en: "Reflective tension" },
      dashboard: { zh: "温暖的信任", en: "Warm trust" },
      compare: { zh: "好奇的警觉", en: "Curious alertness" },
      case: { zh: "急性压力", en: "Acute stress" },
      ideas: { zh: "满足的愉悦", en: "Content pleasure" },
      stats: { zh: "深层平静", en: "Deep calm" },
    };

    // Layer 1: Chladni-like resonance field
    var canvas = document.getElementById("chem-field");
    if (canvas) {
      var ctx = canvas.getContext("2d");
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var isMobile = window.innerWidth < 768;
      var saveData = !!(
        navigator.connection && navigator.connection.saveData
      );
      var lowPower =
        saveData ||
        (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
        (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 6);
      var particleCount = isMobile
        ? lowPower
          ? 720
          : 1200
        : lowPower
          ? 1400
          : 2400;
      var particles = [];
      var fieldW = 0;
      var fieldH = 0;
      var fieldN = 2;
      var fieldM = 3;
      var particleFrame = null;
      var particleRunning = false;
      var colorBuckets = [
        COLORS.DA,
        COLORS.HT,
        COLORS.CORT,
        COLORS.OT,
        COLORS.NE,
        COLORS.END,
      ];

      function resizeCanvas() {
        fieldW = window.innerWidth;
        fieldH = window.innerHeight;
        canvas.width = fieldW * dpr;
        canvas.height = fieldH * dpr;
        canvas.style.width = fieldW + "px";
        canvas.style.height = fieldH + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = themeState.bg;
        ctx.fillRect(0, 0, fieldW, fieldH);
      }

      function initParticles() {
        particles = [];
        for (var i = 0; i < particleCount; i++) {
          particles.push({
            x: Math.random(),
            y: Math.random(),
            vx: 0,
            vy: 0,
            colorIndex: i % 6,
            size: 0.75 + Math.random() * 0.9,
          });
        }
      }

      resizeCanvas();
      initParticles();
      window.addEventListener("resize", function () {
        resizeCanvas();
        initParticles();
      }, { passive: true });

      function drawParticles() {
        if (document.hidden) {
          particleRunning = false;
          particleFrame = null;
          return;
        }
        var freq = sectionFreqs[currentSection] || sectionFreqs.hero;
        fieldN += (freq.n - fieldN) * 0.04;
        fieldM += (freq.m - fieldM) * 0.04;

        var pn = Math.PI * fieldN;
        var pm = Math.PI * fieldM;
        var strength = 0.00028;
        var damping = 0.92;
        var mouseNX = mouse.active ? mouse.x / fieldW : -9;
        var mouseNY = mouse.active ? mouse.y / fieldH : -9;
        var mouseRadiusSquared = 0.0225;

        for (var i = 0; i < particleCount; i++) {
          var p = particles[i];
          var spx = Math.sin(pn * p.x);
          var spy = Math.sin(pm * p.y);
          var smx = Math.sin(pm * p.x);
          var sny = Math.sin(pn * p.y);
          var cpx = Math.cos(pn * p.x);
          var cpy = Math.cos(pm * p.y);
          var cmx = Math.cos(pm * p.x);
          var cny = Math.cos(pn * p.y);

          var field = spx * spy + smx * sny;
          var gradX = pn * cpx * spy + pm * cmx * sny;
          var gradY = pm * spx * cpy + pn * smx * cny;
          var localWeight = 1;

          if (mouse.active && mouseNX > -1) {
            var mdx = mouseNX - p.x;
            var mdy = mouseNY - p.y;
            var distanceSquared = mdx * mdx + mdy * mdy;
            if (
              distanceSquared < mouseRadiusSquared &&
              distanceSquared > 0.000001
            ) {
              var distance = Math.sqrt(distanceSquared);
              localWeight = distance / 0.15;
              var pull = 0.0035 / (distance + 0.025);
              p.vx += (mdx / distance) * pull;
              p.vy += (mdy / distance) * pull;
            }
          }

          p.vx += -field * gradX * strength * localWeight;
          p.vy += -field * gradY * strength * localWeight;
          p.vx *= damping;
          p.vy *= damping;
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < 0) p.x += 1;
          if (p.x > 1) p.x -= 1;
          if (p.y < 0) p.y += 1;
          if (p.y > 1) p.y -= 1;
        }

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = themeState.dark ? 0.12 : 0.2;
        ctx.fillStyle = themeState.bg;
        ctx.fillRect(0, 0, fieldW, fieldH);
        ctx.globalAlpha = 1;

        ctx.globalCompositeOperation = themeState.dark ? "lighter" : "multiply";
        for (var c = 0; c < 6; c++) {
          var col = colorBuckets[c];
          var alpha = themeState.dark ? 0.12 : 0.09;
          ctx.fillStyle =
            "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + alpha + ")";
          ctx.beginPath();
          for (var j = c; j < particleCount; j += 6) {
            var q = particles[j];
            var sx = q.x * fieldW;
            var sy = q.y * fieldH;
            ctx.moveTo(sx + q.size, sy);
            ctx.arc(sx, sy, q.size, 0, Math.PI * 2);
          }
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
        particleFrame = requestAnimationFrame(drawParticles);
      }

      function startParticles() {
        if (particleRunning || document.hidden) return;
        particleRunning = true;
        particleFrame = requestAnimationFrame(drawParticles);
      }

      function stopParticles() {
        particleRunning = false;
        if (particleFrame !== null) {
          cancelAnimationFrame(particleFrame);
          particleFrame = null;
        }
      }

      document.addEventListener("visibilitychange", function () {
        if (document.hidden) stopParticles();
        else startParticles();
      });

      var themeObserver = new MutationObserver(updateThemeState);
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      document.addEventListener("astro:after-swap", updateThemeState);
      if (PsychePageRuntime.colorSchemeQuery.addEventListener) {
        PsychePageRuntime.colorSchemeQuery.addEventListener("change", updateThemeState);
      } else if (PsychePageRuntime.colorSchemeQuery.addListener) {
        PsychePageRuntime.colorSchemeQuery.addListener(updateThemeState);
      }

      PsychePageRuntime.runWhenIdle(function () {
        startParticles();
      }, 600);
    }

    // Layer 2: Cursor proximity behaves like a stimulus
    var dashEl = document.querySelector(".dashboard-section");
    var neFill = document.querySelector(
      '.dashboard-section .nt-fill[data-nt="NE"]',
    );
    var neVal = document.querySelector(
      '.dashboard-section .nt-val[data-nt="NE"]',
    );
    var otFill = document.querySelector(
      '.dashboard-section .nt-fill[data-nt="OT"]',
    );
    var otVal = document.querySelector(
      '.dashboard-section .nt-val[data-nt="OT"]',
    );
    var daFill = document.querySelector(
      '.dashboard-section .nt-fill[data-nt="DA"]',
    );
    var daVal = document.querySelector(
      '.dashboard-section .nt-val[data-nt="DA"]',
    );

    function cursorChemistry() {
      if (!mouse.active || !dashEl) return;

      var rect = dashEl.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = mouse.x - cx;
      var dy = mouse.y - cy;
      var distToDash = Math.sqrt(dx * dx + dy * dy);

      if (mouse.speed > 10 && neFill) {
        var curr = parseInt(neFill.style.width, 10) || 40;
        var bump = Math.min((mouse.speed - 10) * 0.4, 5);
        var next = Math.min(100, curr + bump);
        neFill.style.width = next + "%";
        if (neVal) neVal.textContent = Math.round(next);
      }

      if (distToDash < 400) {
        var prox = 1 - distToDash / 400;
        if (otFill) {
          var otCurr = parseInt(otFill.style.width, 10) || 50;
          var otNext = Math.min(100, otCurr + prox * 1.4);
          otFill.style.width = otNext + "%";
          if (otVal) otVal.textContent = Math.round(otNext);
        }
        if (daFill) {
          var daCurr = parseInt(daFill.style.width, 10) || 50;
          var daNext = Math.min(100, daCurr + prox * 0.75);
          daFill.style.width = daNext + "%";
          if (daVal) daVal.textContent = Math.round(daNext);
        }
      }
    }

    function runPointerLoop() {
      pointerLoopFrame = null;
      if (!mouse.active || !dashVisible || document.hidden) return;
      cursorChemistry();
      pointerLoopFrame = requestAnimationFrame(runPointerLoop);
    }

    function ensurePointerLoop() {
      if (pointerLoopFrame === null && mouse.active && dashVisible && !document.hidden) {
        pointerLoopFrame = requestAnimationFrame(runPointerLoop);
      }
    }

    var heroEl = document.querySelector(".hero");
    var thesisEl = document.querySelector(".thesis-section");
    var dashboardSection = document.querySelector(".dashboard-section");
    var compareSection = document.querySelector(".compare-section");
    var caseSection3 = document.querySelector(".case-section");
    var ideasSection = document.querySelector(".ideas-section");
    var statsSection = document.querySelector(".stats-section");

    var sectionEntries = [
      { el: heroEl, key: "hero" },
      { el: thesisEl, key: "thesis" },
      { el: dashboardSection, key: "dashboard" },
      { el: compareSection, key: "compare" },
      { el: caseSection3, key: "case" },
      { el: ideasSection, key: "ideas" },
      { el: statsSection, key: "stats" },
    ].filter(function (section) {
      return section.el;
    });

    if (dashboardSection) {
      PsychePageRuntime.observeVisibility(
        dashboardSection,
        { threshold: 0.2 },
        function (entry) {
          dashVisible = entry.isIntersecting;
          if (dashVisible) ensurePointerLoop();
          else if (pointerLoopFrame !== null) {
            cancelAnimationFrame(pointerLoopFrame);
            pointerLoopFrame = null;
          }
        },
      );
    }

    if (sectionEntries.length) {
      var sectionObserver = new IntersectionObserver(
        function (entries) {
          var activeEntry = entries
            .filter(function (entry) {
              return entry.isIntersecting;
            })
            .sort(function (a, b) {
              return b.intersectionRatio - a.intersectionRatio;
            })[0];
          if (activeEntry) {
            currentSection = activeEntry.target.getAttribute("data-section-key") || currentSection;
          }
        },
        { threshold: [0.2, 0.3, 0.5, 0.7] },
      );

      sectionEntries.forEach(function (section) {
        section.el.setAttribute("data-section-key", section.key);
        sectionObserver.observe(section.el);
      });
    }

  })();
