/* DW2 Ladder dashboard — vanilla JS */
(() => {
  "use strict";

  const state = {
    data: null,
    mode: "PL",
    search: "",
    sort: "elo",
  };

  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat("en-US");
  const FALLBACK = "assets/ladder-logo.png";

  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const avatar = (url, alt = "") => {
    const src = url || FALLBACK;
    return `<img class="avatar" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">`;
  };

  const dateShort = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const modeData = () => state.data?.modes?.[state.mode] || null;

  function renderStats() {
    const m = modeData();
    if (!m) return;
    const top = m.leaderboard?.[0];
    const cards = [
      ["Players", fmt.format(m.players || 0), "rated on this ladder"],
      ["Matches", fmt.format(m.matches || 0), "recorded"],
      ["Top rating", fmt.format(m.top_elo || 0), "Elo"],
      ["Ladder leader", top ? esc(top.display_name) : "—", top ? top.rank_name : "no matches yet"],
    ];
    $("stats").innerHTML = cards
      .map(
        ([label, value, sub]) => `
        <div class="stat-card">
          <div class="stat-label">${label}</div>
          <div class="stat-value">${value}</div>
          <div class="stat-sub">${sub}</div>
        </div>`
      )
      .join("");
  }

  function renderPodium() {
    const m = modeData();
    const podium = $("podium");
    const top = (m?.leaderboard || []).slice(0, 3);
    if (!top.length) {
      podium.innerHTML = `
        <div class="podium-card first">
          <div class="podium-place">#1</div>
          <div class="podium-avatar" style="display:grid;place-items:center;background:rgba(255,255,255,.04);font-size:24px">🏆</div>
          <div class="podium-name">Waiting for the first match</div>
          <div class="podium-rank">Play a ranked match to take the top spot.</div>
        </div>`;
      return;
    }
    const classes = ["first", "second", "third"];
    const cards = top
      .map(
        (p, i) => `
        <button class="podium-card ${classes[i]}" data-player="${esc(p.id)}" type="button">
          <div class="podium-place">#${p.rank}</div>
          <img class="podium-avatar" src="${esc(p.avatar || FALLBACK)}" alt="${esc(p.display_name)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">
          <div class="podium-name">${esc(p.display_name)}</div>
          <div class="podium-rank">${esc(p.rank_name)}</div>
          <div class="podium-bottom">
            <span class="podium-elo">${fmt.format(p.elo)}</span>
            <span class="podium-record">${p.wins}W · ${p.losses}L</span>
          </div>
        </button>`
      )
      .join("");
    const open = Array.from({ length: Math.max(0, 3 - top.length) }, (_, i) => {
      const place = top.length + i + 1;
      return `<div class="podium-card open ${classes[place - 1]}">
        <div class="podium-place">#${place}</div>
        <div class="open-icon">◇</div>
        <div class="podium-name">Open slot</div>
        <div class="podium-rank">Win a ranked match to claim it.</div>
      </div>`;
    }).join("");
    podium.innerHTML = cards + open;
  }

  function sortedBoard() {
    const m = modeData();
    let rows = [...(m?.leaderboard || [])];
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.display_name.toLowerCase().includes(q) ||
          p.username.toLowerCase().includes(q) ||
          p.rank_name.toLowerCase().includes(q)
      );
    }
    const key = state.sort;
    rows.sort((a, b) => {
      if (key === "wins") return b.wins - a.wins || b.elo - a.elo;
      if (key === "winrate") return b.winrate - a.winrate || b.elo - a.elo;
      if (key === "matches") return b.wins + b.losses - (a.wins + a.losses) || b.elo - a.elo;
      return b.elo - a.elo;
    });
    return rows;
  }

  function renderBoard() {
    const rows = sortedBoard();
    const body = $("boardBody");
    const empty = $("boardEmpty");
    if (!rows.length) {
      body.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    body.innerHTML = rows
      .map(
        (p, i) => `
        <tr data-player="${esc(p.id)}">
          <td><span class="rank-num ${p.rank === 1 ? "top1" : p.rank === 2 ? "top2" : p.rank === 3 ? "top3" : ""}">${p.rank}</span></td>
          <td>
            <div class="player-cell">
              ${avatar(p.avatar, p.display_name)}
              <div style="min-width:0">
                <div class="player-name">${esc(p.display_name)}</div>
                <div class="player-sub">@${esc(p.username)}</div>
              </div>
            </div>
          </td>
          <td><span class="rank-badge">${esc(p.rank_name)}</span></td>
          <td class="num"><span class="elo">${fmt.format(p.elo)}</span></td>
          <td class="num"><span class="record">${p.wins} / ${p.losses}</span></td>
          <td class="col-wide">
            <div class="winbar"><div class="winbar-fill" style="width:${Math.max(0, Math.min(100, p.winrate))}%"></div></div>
            <div class="winrate-text">${p.winrate}% · ${p.wins + p.losses} games</div>
          </td>
          <td class="num"><span class="streak ${p.streak > 0 ? "hot" : ""}">${p.streak > 0 ? "W" + p.streak : p.streak < 0 ? "L" + Math.abs(p.streak) : "—"}</span></td>
        </tr>`
      )
      .join("");
  }

  function renderMatches() {
    const m = modeData();
    const list = m?.recent_matches || [];
    const box = $("matchesList");
    $("matchCount").textContent = fmt.format(list.length);
    $("matchesEmpty").hidden = list.length > 0;
    box.innerHTML = list
      .slice(0, 10)
      .map(
        (x) => `
        <div class="match-row">
          <div class="match-side">
            ${avatar(x.winner_avatar, x.winner_name)}
            <div style="min-width:0"><div class="match-name">${esc(x.winner_name)}</div><div class="match-delta up">+${x.winner_delta}</div></div>
          </div>
          <div class="match-vs">VS</div>
          <div class="match-side right">
            <div style="min-width:0"><div class="match-name">${esc(x.loser_name)}</div><div class="match-delta down">${x.loser_delta}</div></div>
            ${avatar(x.loser_avatar, x.loser_name)}
          </div>
          <div class="match-meta"><span>${esc(x.lobby_code || x.id)}</span><span>${dateShort(x.completed_at)}</span></div>
        </div>`
      )
      .join("");
  }

  function rankColor(index, total) {
    const palette = ["#ffd166", "#c9d1e3", "#d08a5a", "#ff7a18", "#ff3b4e", "#8a93a8"];
    return palette[Math.min(index, palette.length - 1)];
  }

  function renderRanks() {
    const ranks = state.data?.ranks?.[state.mode] || [];
    const box = $("rankList");
    box.innerHTML = ranks
      .map((r, i) => {
        const next = ranks[i - 1];
        const range = r.threshold === 0 ? "1132 or below" : next ? `${r.threshold}–${next.threshold - 1}` : `${r.threshold}+`;
        return `<div class="rank-row"><span class="rank-swatch" style="background:${rankColor(i, ranks.length)}"></span><span class="rank-name">${esc(r.name)}</span><span class="rank-range">${range}</span></div>`;
      })
      .join("");
  }

  function renderTournaments() {
    const all = state.data?.tournaments || [];
    const list = all.filter((t) => t.mode === state.mode);
    const grid = $("tournamentGrid");
    const empty = $("tournamentsEmpty");
    empty.hidden = list.length > 0;
    grid.innerHTML = list
      .map(
        (t) => `
        <div class="tournament-card">
          <div class="t-head">
            <div>
              <div class="t-title">${esc(t.name)}</div>
              <div class="t-mode">${t.mode} Ranked · ${t.size} players</div>
            </div>
            <span class="t-status ${esc(t.status)}">${esc(t.status)}</span>
          </div>
          <div class="t-meta"><span>${t.entries}/${t.size} registered</span><span>${dateShort(t.created_at)}</span></div>
          <div class="t-champion">${t.champion_name ? `Champion: <strong>${esc(t.champion_name)}</strong>` : "Champion: —"}</div>
        </div>`
      )
      .join("");
  }

  function sparkline(values) {
    const vals = (values && values.length ? values : [1200]).map(Number);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = Math.max(1, max - min);
    const w = 600;
    const h = 78;
    const pad = 6;
    const pts = vals.map((v, i) => {
      const x = vals.length === 1 ? w / 2 : (i / (vals.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return [x, y];
    });
    const line = pts.map((p) => p.join(",")).join(" ");
    const area = `M ${pts[0][0]},${h} L ${pts.map((p) => p.join(",")).join(" L ")} L ${pts[pts.length - 1][0]},${h} Z`;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff7a18"/><stop offset="100%" stop-color="#ff7a18" stop-opacity="0"/></linearGradient></defs>
      <path class="spark-area" d="${area}"></path>
      <polyline class="spark-line" points="${line}"></polyline>
    </svg>`;
  }

  function openPlayer(id) {
    const p = state.data?.players?.[id];
    if (!p) return;
    const rating = p.ratings?.[state.mode];
    if (!rating) return;
    const modal = $("playerModal");
    $("modalAvatar").src = p.avatar || FALLBACK;
    $("modalAvatar").onerror = () => { $("modalAvatar").src = FALLBACK; };
    $("modalName").textContent = p.display_name;
    $("modalMode").textContent = `${state.mode} Ranked`;
    $("modalRank").textContent = rating.rank_name;
    const games = rating.wins + rating.losses;
    const wr = games ? Math.round((rating.wins / games) * 100) : 0;
    $("modalStats").innerHTML = [
      ["Rating", fmt.format(rating.elo)],
      ["Peak", fmt.format(rating.peak)],
      ["Record", `${rating.wins}W / ${rating.losses}L`],
      ["Win rate", `${wr}%`],
    ]
      .map(([label, value]) => `<div class="modal-stat"><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
    $("modalPeak").textContent = `Peak ${fmt.format(rating.peak)}`;
    $("modalSpark").innerHTML = sparkline(rating.history);

    const h2h = p.head_to_head?.[state.mode] || [];
    $("modalH2H").innerHTML = h2h.length
      ? h2h
          .map(
            (r) => `<div class="h2h-row">${avatar(r.opponent_avatar, r.opponent_name)}<span>${esc(r.opponent_name)}</span><span class="h2h-score">${r.wins}-${r.losses}</span></div>`
          )
          .join("")
      : `<div class="h2h-row" style="color:var(--faint)">No head-to-head yet.</div>`;

    const recent = (modeData()?.recent_matches || []).filter((x) => x.winner_id === id || x.loser_id === id).slice(0, 6);
    $("modalRecent").innerHTML = recent.length
      ? recent
          .map((x) => {
            const won = x.winner_id === id;
            const opp = won ? x.loser_name : x.winner_name;
            const oppAvatar = won ? x.loser_avatar : x.winner_avatar;
            return `<div class="recent-row">${avatar(oppAvatar, opp)}<span>vs ${esc(opp)}</span><span class="recent-result ${won ? "win" : "loss"}">${won ? "WIN" : "LOSS"}</span></div>`;
          })
          .join("")
      : `<div class="recent-row" style="color:var(--faint)">No recent matches.</div>`;

    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("playerModal").hidden = true;
    document.body.style.overflow = "";
  }

  function renderAll() {
    $("modePill").textContent = `${state.mode} Ranked`;
    document.querySelectorAll("#modeSwitch button").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === state.mode);
    });
    renderStats();
    renderPodium();
    renderBoard();
    renderMatches();
    renderRanks();
    renderTournaments();
  }

  async function init() {
    try {
      const res = await fetch(`data/ladder.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
    } catch (err) {
      $("updated").textContent = "data unavailable";
      $("boardEmpty").hidden = false;
      $("boardEmpty").querySelector("p").textContent = "Could not load data/ladder.json. Run the bot publish script.";
      console.error(err);
      return;
    }

    $("updated").textContent = `updated ${dateShort(state.data.generated_at)}`;
    $("year").textContent = new Date().getFullYear();
    renderAll();

    $("modeSwitch").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-mode]");
      if (!btn) return;
      state.mode = btn.dataset.mode;
      state.search = "";
      $("search").value = "";
      renderAll();
    });

    $("search").addEventListener("input", (e) => {
      state.search = e.target.value.trim();
      renderBoard();
    });

    $("sort").addEventListener("change", (e) => {
      state.sort = e.target.value;
      renderBoard();
    });

    document.addEventListener("click", (e) => {
      const target = e.target.closest("[data-player]");
      if (target) {
        openPlayer(target.dataset.player);
        return;
      }
      if (e.target.closest("[data-close]")) closeModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  init();
})();
