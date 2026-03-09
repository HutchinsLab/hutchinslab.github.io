(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Colorscale: 14 stops, t=0 → black (no density), t=1 → white (peak density)
  // ---------------------------------------------------------------------------
  const CS = [
    [0,   0,   0  ],  // 0.000 – black
    [0,   0,   170],  // 0.077 – dark blue
    [0,   0,   223],  // 0.154 – blue
    [0,   109, 254],  // 0.231 – medium blue
    [0,   167, 253],  // 0.308 – cyan-blue
    [0,   253, 0  ],  // 0.385 – green
    [189, 254, 0  ],  // 0.462 – yellow-green
    [254, 254, 0  ],  // 0.538 – yellow
    [254, 223, 0  ],  // 0.615 – yellow-orange
    [253, 140, 0  ],  // 0.692 – orange
    [244, 0,   0  ],  // 0.769 – red
    [244, 0,   161],  // 0.846 – magenta
    [221, 179, 221],  // 0.923 – lavender
    [254, 254, 254],  // 1.000 – white
  ];

  function colorAt(t) {
    t = Math.max(0, Math.min(1, t));
    const n = CS.length - 1;
    const i = Math.min(Math.floor(t * n), n - 1);
    const f = t * n - i;
    return [
      (CS[i][0] + f * (CS[i + 1][0] - CS[i][0])) | 0,
      (CS[i][1] + f * (CS[i + 1][1] - CS[i][1])) | 0,
      (CS[i][2] + f * (CS[i + 1][2] - CS[i][2])) | 0,
    ];
  }

  // ---------------------------------------------------------------------------
  // Triangle geometry  (logical / barycentric space)
  // ---------------------------------------------------------------------------
  const SQRT3_2 = Math.sqrt(3) / 2;
  const VH = [0,        1   ];   // Human     (top)
  const VA = [ SQRT3_2, -0.5];   // Animal    (bottom-right)
  const VM = [-SQRT3_2, -0.5];   // Mol/Cell  (bottom-left)

  function triSign(ax, ay, bx, by, qx, qy) {
    return (qx - bx) * (ay - by) - (ax - bx) * (qy - by);
  }
  function inTriangle(bx, by) {
    const d1 = triSign(VH[0], VH[1], VA[0], VA[1], bx, by);
    const d2 = triSign(VA[0], VA[1], VM[0], VM[1], bx, by);
    const d3 = triSign(VM[0], VM[1], VH[0], VH[1], bx, by);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }

  // ---------------------------------------------------------------------------
  // Layout  – horizontal three-column badge
  //
  //   |  col 1: Triangle  |  col 2: NIH%ile arc  |  col 3: APT/Clin arc  |
  //
  // All three columns share the same top alignment (arch top = triangle top).
  // ---------------------------------------------------------------------------
  const W          = 300;   // total badge width
  const BADGE_PAD  = 8;     // top / bottom padding
  const LABEL_TOP  = 12;    // space above triangle apex for "H" label
  const LABEL_BOT  = 14;    // space below triangle base for "A" / "M/C" labels

  // ---- Triangle (column 1) ----
  const COL1_LEFT  = 10;
  const COL_W      = 88;    // each column width
  const TW         = 62;    // triangle pixel-width  (fits within COL_W with margin)
  const SC         = TW / (2 * SQRT3_2);    // ≈ 35.8 px per logical unit
  const TH         = 1.5 * SC;              // ≈ 53.7 px
  const TRI_LEFT   = COL1_LEFT + (COL_W - TW) / 2;   // ≈ 23 px
  const TRI_TOP    = BADGE_PAD + LABEL_TOP;            // = 20 px
  const SIGMA      = 10;    // Gaussian σ in pixels

  // Logical ↔ pixel (triangle column only)
  function tpx(bx) { return TRI_LEFT + (bx + SQRT3_2) * SC; }
  function tpy(by) { return TRI_TOP  + (1.0 - by) * SC; }
  function tbx(pixX) { return (pixX - TRI_LEFT) / SC - SQRT3_2; }
  function tby(pixY) { return 1.0 - (pixY - TRI_TOP) / SC; }

  // ---- Arc gauges (columns 2 & 3) ----
  const COL2_CX    = COL1_LEFT + COL_W + 8 + COL_W / 2;   // ≈ 152
  const COL3_CX    = COL1_LEFT + 2 * (COL_W + 8) + COL_W / 2; // ≈ 248
  const ARC_R      = 30;
  const ARC_CY     = TRI_TOP + ARC_R;   // = 50  (arc apex aligns with triangle apex)

  // Text positions inside the ∩ arc bowl
  const ARC_VAL_Y  = ARC_CY - ARC_R + 15;   // ≈ 35  large value text baseline
  const ARC_LBL_Y  = ARC_VAL_Y + 12;         // ≈ 47  small label text baseline
  const ARC_SUB_Y  = ARC_CY + ARC_R + 11;    // ≈ 91  identifier below arc

  const H = Math.ceil(TRI_TOP + TH + LABEL_BOT + BADGE_PAD);  // ≈ 97

  // ---------------------------------------------------------------------------
  // Triangle renderer
  // ---------------------------------------------------------------------------
  function drawTriangle(ctx, pub) {
    // Papers with no relevant MeSH terms have all-zero scores → grey out
    const noMesh = !pub.human && !pub.animal && !pub.molecular_cellular;
    const hasCoords = !noMesh && pub.x_coord != null && pub.y_coord != null;
    const dotPx = hasCoords ? tpx(pub.x_coord) : null;
    const dotPy = hasCoords ? tpy(pub.y_coord) : null;

    if (noMesh) {
      // Grey fill — no position data available for this paper
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tpx(VH[0]), tpy(VH[1]));
      ctx.lineTo(tpx(VA[0]), tpy(VA[1]));
      ctx.lineTo(tpx(VM[0]), tpy(VM[1]));
      ctx.closePath();
      ctx.fillStyle = '#c8c8c8';
      ctx.fill();
      ctx.restore();
    } else {
      // Gaussian kernel fill – pixel by pixel inside the triangle
      const imgData = ctx.createImageData(W, H);
      const buf = imgData.data;
      const yTop = Math.floor(TRI_TOP);
      const yBot = Math.ceil(TRI_TOP + TH);

      for (let iy = yTop; iy <= yBot; iy++) {
        for (let ix = COL1_LEFT; ix < COL1_LEFT + COL_W; ix++) {
          if (!inTriangle(tbx(ix), tby(iy))) continue;
          const dx = ix - dotPx, dy = iy - dotPy;
          const t = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
          const [r, g, b] = colorAt(t);
          const idx = (iy * W + ix) * 4;
          buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // Triangle outline
    ctx.beginPath();
    ctx.moveTo(tpx(VH[0]), tpy(VH[1]));
    ctx.lineTo(tpx(VA[0]), tpy(VA[1]));
    ctx.lineTo(tpx(VM[0]), tpy(VM[1]));
    ctx.closePath();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Abbreviated vertex labels (full names are in the tooltip)
    ctx.fillStyle = '#333';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('H', tpx(VH[0]), tpy(VH[1]) - 3);
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('A', tpx(VA[0]) + 3, tpy(VA[1]) + 10);
    ctx.textAlign = 'right';
    ctx.fillText('M/C', tpx(VM[0]) - 3, tpy(VM[1]) + 10);

    // Paper dot (only when position is meaningful)
    if (hasCoords) {
      ctx.beginPath();
      ctx.arc(dotPx, dotPy, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Arc gauge  (∩ shape, counter-clockwise from left → top → right)
  // ---------------------------------------------------------------------------
  function drawArc(ctx, cx, cy, r, progress, color) {
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';

    // Background (full semi-circle)
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, true);
    ctx.strokeStyle = '#ddd';
    ctx.stroke();

    // Filled portion
    if (progress > 0.001) {
      const endAngle = Math.PI * (1 - Math.max(0, Math.min(1, progress)));
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, endAngle, true);
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Metrics – both arc gauges
  // ---------------------------------------------------------------------------
  function drawMetrics(ctx, pub) {
    const clinCount = Array.isArray(pub.cited_by_clin) ? pub.cited_by_clin.length : 0;
    const nihPct    = pub.nih_percentile;           // 0–100
    const rcr       = pub.relative_citation_ratio;  // field-normalized float
    const apt       = pub.apt;                       // 0–1

    // ---- Gauge 1: arc = NIH percentile, interior = RCR value ----
    drawArc(ctx, COL2_CX, ARC_CY, ARC_R,
      nihPct != null ? nihPct / 100 : 0,
      '#662f6c');  // iCite brand purple

    ctx.textAlign = 'center';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#222';
    ctx.fillText(rcr != null ? rcr.toFixed(2) : '—', COL2_CX, ARC_VAL_Y);

    ctx.font = '8px sans-serif';
    ctx.fillStyle = '#555';
    ctx.fillText('RCR', COL2_CX, ARC_LBL_Y);

    ctx.font = '8px sans-serif';
    ctx.fillStyle = '#999';
    ctx.fillText('NIH %ile', COL2_CX, ARC_SUB_Y);

    // ---- Gauge 2: APT (predicted) or clinical citations (confirmed) ----
    if (clinCount > 0) {
      // Clinical citations confirmed → max the arc, show count inside
      drawArc(ctx, COL3_CX, ARC_CY, ARC_R, 1.0, '#E91E63');

      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#222';
      ctx.textAlign = 'center';
      ctx.fillText(clinCount, COL3_CX, ARC_VAL_Y);

      ctx.font = '8px sans-serif';
      ctx.fillStyle = '#555';
      ctx.fillText('Clin. Cit.', COL3_CX, ARC_LBL_Y);

      ctx.font = '8px sans-serif';
      ctx.fillStyle = '#999';
      ctx.fillText('Confirmed', COL3_CX, ARC_SUB_Y);

    } else if (apt != null) {
      // No clinical citations yet → show APT prediction
      drawArc(ctx, COL3_CX, ARC_CY, ARC_R, apt, '#c2185b');  // rose — bridges toward clinical pink

      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#222';
      ctx.textAlign = 'center';
      ctx.fillText((apt * 100).toFixed(0) + '%', COL3_CX, ARC_VAL_Y);

      ctx.font = '8px sans-serif';
      ctx.fillStyle = '#555';
      ctx.fillText('APT', COL3_CX, ARC_LBL_Y);

      ctx.font = '8px sans-serif';
      ctx.fillStyle = '#999';
      ctx.fillText('Predicted', COL3_CX, ARC_SUB_Y);
    }
  }

  // ---------------------------------------------------------------------------
  // "iC" branding mark + paper-identity tooltip
  // ---------------------------------------------------------------------------
  function formatAuthors(authors) {
    if (!authors) return '';
    const raw = Array.isArray(authors) ? authors : authors.split(', ');
    const parts = raw
      .map(a => typeof a === 'string' ? a.trim() : (a.fullName || a.lastName || ''))
      .filter(Boolean);
    if (parts.length <= 3) return parts.join(', ');
    return parts[0] + '; ' + parts[1] + '; \u2026 ' + parts[parts.length - 1];
  }

  // Position of the "iC" mark: left whitespace beside the triangle
  const IC_X = COL1_LEFT + 1;   // 11 px from left
  const IC_Y = BADGE_PAD + 27;  // 35 px baseline (for 22px font)

  function drawBranding(ctx) {
    ctx.save();
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Gray arc behind "iC" — mirrors the swoosh in the iCite wordmark.
    // anticlockwise from -30° to +30° sweeps 300° through top, left, and bottom → "(" shape
    const arcCX = IC_X + 9;
    const arcCY = IC_Y - 8;
    const arcR  = 11;
    ctx.beginPath();
    ctx.arc(arcCX, arcCY, arcR, -Math.PI / 6, Math.PI / 6, true);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // "i" in iCite gray
    ctx.fillStyle = '#65666A';
    ctx.fillText('i', IC_X, IC_Y);

    // "C" in iCite purple, immediately after "i"
    ctx.fillStyle = '#662f6c';
    ctx.fillText('C', IC_X + ctx.measureText('i').width, IC_Y);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Tooltip hit regions
  // ---------------------------------------------------------------------------
  function makeRegions(pub) {
    const noMesh   = !pub.human && !pub.animal && !pub.molecular_cellular;
    const clinCount = Array.isArray(pub.cited_by_clin) ? pub.cited_by_clin.length : 0;
    const hitR = ARC_R + 10;

    const authorsLine = formatAuthors(pub.authors);
    const titleLine   = pub.title  || '';
    const journalLine = [pub.journal, pub.year].filter(Boolean).join(' · ');
    const pmidLine    = pub.pmid   ? 'PMID ' + pub.pmid : '';
    const paperTip    = [authorsLine, titleLine, journalLine, pmidLine]
                          .filter(Boolean).join('\n');

    return [
      {
        // "iC" mark hit area: generous rectangle covering the top-left corner
        test: (mx, my) => mx >= COL1_LEFT && mx < COL1_LEFT + 32 && my >= BADGE_PAD && my < IC_Y + 6,
        tip: paperTip,
        clickable: true,
      },
      {
        test: (mx, my) =>
          mx >= COL1_LEFT && mx < COL1_LEFT + COL_W &&
          my >= TRI_TOP   && my <= TRI_TOP + TH &&
          inTriangle(tbx(mx), tby(my)),
        tip: noMesh
          ? 'Triangle of Biomedicine\nH = Human, A = Animal, M/C = Molecular/Cellular\nNo MeSH classification available — this paper could not be placed in the Triangle of Biomedicine'
          : 'Triangle of Biomedicine\nH = Human, A = Animal, M/C = Molecular/Cellular\nPosition reflects the balance of research focus across these three domains',
      },
      {
        test: (mx, my) => Math.hypot(mx - COL2_CX, my - ARC_CY) <= hitR,
        tip: 'Arc: NIH Percentile — Paper\'s RCR rank compared to NIH-funded papers\nRCR (Relative Citation Ratio): citation rate normalized to the expected rate for papers in the same field (1.0 = field average)',
      },
      {
        test: (mx, my) => Math.hypot(mx - COL3_CX, my - ARC_CY) <= hitR,
        tip: clinCount > 0
          ? `Clinical Citations: ${clinCount} Clinical study/studies cite this paper\nArc is maxed — clinical translation has occurred`
          : 'APT (Approximate Potential to Translate): Predicted probability that this research will be cited by a clinical article\nArc and percentage reflect the predicted value',
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Open paper in iCite (POST pmid → get search_id → open results tab)
  // ---------------------------------------------------------------------------
  function openInICite(pmid) {
    // Open a blank window synchronously so browsers don't block it as a popup,
    // then redirect it once the POST resolves.
    const win = window.open('', '_blank');
    fetch('https://icite.od.nih.gov/iciterest/store-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userType: 'app',
        searchType: 'List of PMIDs input',
        searchRequest: {
          pubmedQueryStr: '',
          uploadedFileName: '',
          pmids: [String(pmid)],
          activeTab: 'infl',
          papersSearch: '',
          filters: [],
        },
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        win.location = 'https://icite.od.nih.gov/results?searchId=' + encodeURIComponent(data.id);
      })
      .catch(function () {
        win.location = 'https://icite.od.nih.gov/';
      });
  }

  // ---------------------------------------------------------------------------
  // Badge assembly
  // ---------------------------------------------------------------------------
  function renderBadge(container, pub) {
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    canvas.style.cssText = 'display:block;cursor:default;';
    const ctx = canvas.getContext('2d');

    drawTriangle(ctx, pub);
    drawMetrics(ctx, pub);
    drawBranding(ctx);

    // Hover tooltip
    const tipEl = document.createElement('div');
    tipEl.style.cssText = [
      'position:fixed',
      'background:rgba(30,30,30,0.92)',
      'color:#fff',
      'padding:6px 9px',
      'border-radius:5px',
      'font:11px/1.5 sans-serif',
      'max-width:240px',
      'pointer-events:none',
      'display:none',
      'z-index:99999',
      'white-space:pre-wrap',
      'box-shadow:0 2px 6px rgba(0,0,0,0.3)',
    ].join(';');
    document.body.appendChild(tipEl);

    const regions = makeRegions(pub);

    canvas.addEventListener('mousemove', function (e) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const region = regions.find(r => r.test(mx, my));
      if (region) {
        tipEl.textContent = region.tip;
        tipEl.style.display = 'block';
        tipEl.style.left = Math.min(e.clientX + 14, window.innerWidth - 260) + 'px';
        tipEl.style.top  = (e.clientY - 10) + 'px';
        canvas.style.cursor = region.clickable ? 'pointer' : 'default';
      } else {
        tipEl.style.display = 'none';
        canvas.style.cursor = 'default';
      }
    });
    canvas.addEventListener('mouseleave', () => { tipEl.style.display = 'none'; canvas.style.cursor = 'default'; });

    canvas.addEventListener('click', function (e) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const region = regions.find(r => r.clickable && r.test(mx, my));
      if (region) openInICite(pub.pmid);
    });

    container.appendChild(canvas);
  }

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------
  function showError(el, message) {
    el.style.cssText = 'font:12px sans-serif;color:#999;padding:4px;';
    el.textContent = message;
  }

  function initBadges() {
    document.querySelectorAll('.icite-badge[data-pmid]').forEach(function (el) {
      const pmid = el.dataset.pmid.trim();
      if (!pmid) return;

      el.style.cssText = 'display:inline-block;font:12px sans-serif;color:#aaa;';
      el.textContent = 'Loading…';

      fetch('https://icite.od.nih.gov/api/pubs?pmids=' + encodeURIComponent(pmid))
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (json) {
          if (!json.data || !json.data.length) {
            showError(el, 'No iCite data for PMID ' + pmid);
            return;
          }
          el.textContent = '';
          el.style.cssText = 'display:inline-block;';
          renderBadge(el, json.data[0]);
        })
        .catch(function (err) {
          showError(el, 'iCite badge error: ' + err.message);
          console.error('iCite badge [PMID ' + pmid + ']:', err);
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBadges);
  } else {
    initBadges();
  }

  // Public API
  window.iCiteBadge = { render: renderBadge };

})();
