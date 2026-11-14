/* Painel de condicionantes – PA Consultoria Ambiental
   Dados: data.json (licenças da PA) + licenças adicionadas neste navegador (localStorage "pa_custom").
   Marcações de entregue: localStorage "pa_done". As mesmas chaves da versão anterior, para não perder nada. */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const HOJE = new Date(); HOJE.setHours(0, 0, 0, 0);
const D = (s) => { const [a, b, c] = s.split("-"); return new Date(+a, +b - 1, +c); };
const fd = (s) => { const [a, b, c] = s.split("-"); return `${c}/${b}/${a}`; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dif = (s) => Math.round((D(s) - HOJE) / 864e5);
const addD = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
const addM = (s, n) => { const d = D(s), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MES_C = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = (k) => { const m = MESES[+k.slice(5, 7) - 1]; return `${m[0].toUpperCase()}${m.slice(1)} de ${k.slice(0, 4)}`; };
// nome curto da empresa: sem o que vem entre parênteses, até ~26 letras, sem terminar em "E", "DE", "DA"...
const curto = (n) => {
  const ps = n.replace(/\s*\(.*?\)\s*/g, " ").trim().split(/\s+/);
  const out = [];
  for (const p of ps) { if (out.length && (out.join(" ") + " " + p).length > 26) break; out.push(p); }
  while (out.length > 1 && /^(E|DE|DA|DO|DOS|DAS|&|-|–)$/i.test(out[out.length - 1])) out.pop();
  return out.join(" ");
};
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

const ST = {
  atr: { rot: "Atrasada", tag: "t-atr", cor: "#c0392b", cls: "atr" },
  sem: { rot: "Nesta semana", tag: "t-sem", cor: "#e06a10", cls: "sem" },
  d30: { rot: "Em até 30 dias", tag: "t-30", cor: "#e3a508", cls: "d30" },
  ok: { rot: "No prazo", tag: "t-ok", cor: "#2e8b57", cls: "ok" },
  ent: { rot: "Entregue", tag: "t-ent", cor: "#2d6cdf", cls: "feito" },
};

/* ── estado ─────────────────────────────────────────────────────────── */

const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch (e) { return padrao; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
let done = ler("pa_done", {});
let CUS = ler("pa_custom", []);
let BASE = [], DATA = [], ENT = [], LIC = [];
const F = { q: "", st: "pend", emp: "", per: "", mes: "", lim: 120 };  // filtros da agenda
const FL = { q: "", st: "", ord: "ren" };                             // filtros das licenças
let aba = "dash", mesCal = new Date(HOJE.getFullYear(), HOJE.getMonth(), 1), ganttTodas = false;

function status(e) {
  if (done[e.id]) return "ent";
  if (e.dias < 0) return "atr";
  if (e.dias <= 7) return "sem";
  if (e.dias <= 30) return "d30";
  return "ok";
}

function montar() {
  DATA = BASE.concat(CUS.map((l) => ({ ...l, custom: 1 })));
  if (typeof aplicarRenovacao === "function") DATA = DATA.map(aplicarRenovacao);  // licenca.js: renovações registradas
  ENT = [];
  DATA.forEach((l, i) => l.rows.forEach((r, j) => ENT.push({ ...r, i, id: l.renov ? `${i}r${l.renov}_${j}` : `${i}_${j}`, emp: l.nome, lic: `${l.tipo} ${l.num}`, dias: dif(r.data) })));
  ENT.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  LIC = DATA.map((l, i) => {
    const dv = dif(l.ven), dr = dif(l.ren);
    const s = dv < 0 ? ["VENCIDA", "t-atr", "atr"] : dr < 0 ? ["RENOVAÇÃO ATRASADA", "t-atr", "atr"]
      : dr <= 60 ? ["RENOVAR EM BREVE", "t-30", "a"] : ["EM DIA", "t-ok", "o"];
    return { ...l, i, dv, dr, s };
  });
}

function contar() {
  const c = { atr: 0, sem: 0, d30: 0, ok: 0, ent: 0, devidas: 0, entDevidas: 0 };
  for (const e of ENT) {
    c[status(e)]++;
    if (e.dias < 0) { c.devidas++; if (done[e.id]) c.entDevidas++; }
  }
  c.total = ENT.length;
  c.pend = c.total - c.ent;
  c.cumpr = c.devidas ? Math.round((c.entDevidas / c.devidas) * 100) : 100;
  c.lic = LIC.length;
  c.licVenc = LIC.filter((l) => l.dv < 0).length;
  c.ren60 = LIC.filter((l) => l.dv >= 0 && l.dr <= 60).length;
  c.renAtr = LIC.filter((l) => l.dv >= 0 && l.dr < 0).length;
  return c;
}

/* ── navegação ──────────────────────────────────────────────────────── */

function ir(t, filtro) {
  aba = t;
  $$("#abas button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  ["dash", "ag", "li", "cl", "doc", "ger"].forEach((x) => { $("#" + x).hidden = x !== t; });
  if (filtro) Object.assign(t === "li" ? FL : F, filtro, t === "ag" ? { lim: 120 } : {});
  desenhar();
  window.scrollTo({ top: 0 });
  try { history.replaceState(null, "", "#" + t); } catch (e) { /* sem histórico */ }
}

function desenhar() {
  const c = contar();
  $("#cAg").textContent = c.atr || "";
  $("#cAg").title = c.atr ? `${c.atr} entregas atrasadas` : "";
  $("#cLi").textContent = c.licVenc + c.renAtr || "";
  ({ dash: dashboard, ag: agenda, li: licencas, cl: calendario, doc: () => documentos(), ger: () => gerador() })[aba](c);
}

/* ── dashboard ──────────────────────────────────────────────────────── */

function dashboard(c) {
  const ajuda = ler("pa_help", "1") !== "0";
  const prox = ENT.filter((e) => !done[e.id] && e.dias >= 0 && e.dias <= 30);
  const atrRec = ENT.filter((e) => !done[e.id] && e.dias < 0).slice(-5).reverse();
  const grave = c.atr > 0 || c.sem > 0 || c.licVenc + c.renAtr > 0;
  const partes = [];
  if (c.atr) partes.push(plural(c.atr, "entrega atrasada", "entregas atrasadas"));
  if (c.sem) partes.push(`${plural(c.sem, "entrega", "entregas")} nesta semana`);
  if (c.renAtr + c.licVenc) partes.push(plural(c.renAtr + c.licVenc, "licença com renovação atrasada ou vencida", "licenças com renovação atrasada ou vencida"));

  $("#dash").innerHTML = `
  ${ajuda ? `<div class="alerta bom" id="boasVindas"><span class="ic" aria-hidden="true">👋</span><div><h2>Bem-vindo ao painel</h2>
    <p>Clique em qualquer número, fatia ou barra para abrir a lista correspondente. Marque ✔ na agenda quando a entrega for feita.</p></div>
    <div class="acoes"><button class="btn claro" data-acao="ajuda">Ver guia rápido</button><button class="btn" data-acao="fecharAjuda">Entendi</button></div></div>` : ""}
  <div class="alerta ${grave ? "" : "bom"}">
    <span class="ic" aria-hidden="true">${grave ? "⚠️" : "✅"}</span>
    <div><h2>${grave ? "Atenção hoje: " + partes.join(", ") : "Tudo em dia"}</h2>
    <p>${c.pend ? `${plural(c.pend, "entrega pendente", "entregas pendentes")} no total · cumprimento das entregas já vencidas: <b>${c.cumpr}%</b>` : "Nenhuma entrega pendente."}</p></div>
    <div class="acoes">
      ${c.atr ? `<button class="btn" data-ir="ag" data-st="atr">Ver atrasadas</button>` : ""}
      ${c.sem ? `<button class="btn claro" data-ir="ag" data-st="sem">Ver esta semana</button>` : ""}
      <button class="btn claro" data-acao="resumo">📋 Resumo para WhatsApp</button>
    </div>
  </div>

  <div class="kpis">
    <button class="k" data-ir="li"><b>${c.lic}</b><span>licenças acompanhadas</span><small>${c.licVenc ? `${c.licVenc} vencida(s)` : "nenhuma vencida"}</small></button>
    <button class="k r" data-ir="ag" data-st="atr"><b>${c.atr}</b><span>entregas atrasadas</span><small>clique para ver a lista</small></button>
    <button class="k l" data-ir="ag" data-st="sem"><b>${c.sem}</b><span>nos próximos 7 dias</span><small>${c.d30} entre 8 e 30 dias</small></button>
    <button class="k o" data-ir="ag" data-st="ok"><b>${c.ok}</b><span>no prazo</span><small>após 30 dias</small></button>
    <button class="k b" data-ir="ag" data-st="ent"><b>${c.ent}</b><span>entregues</span><small>${c.cumpr}% das já vencidas</small></button>
    <button class="k a" data-ir="li" data-lst="ren"><b>${c.ren60 + c.renAtr}</b><span>renovações em até 60 dias</span><small>${c.renAtr ? `${c.renAtr} com prazo perdido` : "pedir 120 dias antes"}</small></button>
  </div>

  <div class="grade">
    <div class="card c4"><div class="card-cab"><h3>Situação das entregas</h3></div><div class="card-corpo">${rosca(c)}</div></div>
    <div class="card c8"><div class="card-cab"><h3>Entregas por mês</h3><span class="mut">clique numa barra para ver o mês</span></div>
      <div class="card-corpo barras">${barrasMes()}</div></div>

    <div class="card c7"><div class="card-cab"><h3>Próximas entregas (30 dias)</h3><button class="btn claro peq" data-ir="ag" data-st="pend" style="margin-left:auto">Abrir agenda</button></div>
      <div class="card-corpo">${prox.length ? `<ul class="lista">${prox.slice(0, 8).map(itemLista).join("")}</ul>${prox.length > 8 ? `<button class="btn claro peq mais" data-ir="ag" data-st="pend" data-per="30">Ver todas as ${prox.length}</button>` : ""}`
        : `<p class="vazio">Nenhuma entrega nos próximos 30 dias. 🎉</p>`}
      ${atrRec.length ? `<h3 style="font-size:14px;margin:14px 0 4px;color:var(--red)">Atrasadas mais recentes</h3><ul class="lista">${atrRec.map(itemLista).join("")}</ul>` : ""}</div></div>

    <div class="card c5"><div class="card-cab"><h3>Empresas com pendências</h3><span class="mut">entregas atrasadas</span></div>
      <div class="card-corpo">${ranking()}</div></div>

    <div class="card c12"><div class="card-cab"><h3>Validade das licenças e prazo para pedir renovação</h3>
      <span class="leg-linha"><span><i style="background:#b8d6c6"></i>validade</span><span><i style="background:var(--amb)"></i>pedir renovação</span><span><i style="background:var(--t)"></i>hoje</span></span></div>
      <div class="card-corpo">${gantt()}</div></div>
  </div>`;
}

function itemLista(e, semEmpresa) {
  const s = status(e);
  return `<li data-ent="${e.id}"><button class="marcar ${done[e.id] ? "on" : ""}" data-marcar="${e.id}" title="Marcar como entregue" aria-label="Marcar como entregue">✔</button>
    <div class="data"><b>${fd(e.data)}</b><span class="mut">${quando(e)}</span></div>
    <div class="txt">${semEmpresa ? `<b class="sem-emp">Cond. ${esc(e.cond)} – ${esc(e.texto)}</b><span class="mut">${esc(e.tipo)}</span>`
      : `<b title="${esc(e.emp)}">${esc(e.emp)}</b><span class="mut">Cond. ${esc(e.cond)} · ${esc(e.texto)}</span>`}</div>
    <span class="tag ${ST[s].tag}">${ST[s].rot}</span></li>`;
}

function quando(e) {
  if (done[e.id]) return "entregue";
  if (e.dias < 0) return `${-e.dias} d de atraso`;
  if (e.dias === 0) return "hoje";
  if (e.dias === 1) return "amanhã";
  return `em ${e.dias} dias`;
}

function rosca(c) {
  const seg = ["atr", "sem", "d30", "ok", "ent"].map((k) => ({ k, v: c[k] })).filter((s) => s.v);
  const tot = seg.reduce((a, s) => a + s.v, 0) || 1;
  const R = 70, r = 46, cx = 85, cy = 85;
  let ang = -Math.PI / 2;
  const arcos = seg.map((s) => {
    const a2 = ang + (s.v / tot) * Math.PI * 2 - (seg.length > 1 ? 0.012 : 0);
    const p = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    const big = a2 - ang > Math.PI ? 1 : 0;
    const [x1, y1] = p(ang, R), [x2, y2] = p(a2, R), [x3, y3] = p(a2, r), [x4, y4] = p(ang, r);
    const d = seg.length === 1
      ? `M${cx - R},${cy}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0M${cx - r},${cy}a${r},${r} 0 1,1 ${2 * r},0a${r},${r} 0 1,1 ${-2 * r},0`
      : `M${x1},${y1}A${R},${R} 0 ${big} 1 ${x2},${y2}L${x3},${y3}A${r},${r} 0 ${big} 0 ${x4},${y4}Z`;
    ang = a2 + (seg.length > 1 ? 0.012 : 0);
    return `<path class="fatia" d="${d}" fill="${ST[s.k].cor}" fill-rule="evenodd" data-ir="ag" data-st="${s.k}"><title>${ST[s.k].rot}: ${s.v}</title></path>`;
  }).join("");
  return `<div class="rosca"><svg viewBox="0 0 170 170" role="img" aria-label="Situação das entregas">${arcos}
    <text x="85" y="82" text-anchor="middle" font-size="28" font-weight="700" fill="#17231e">${c.total}</text>
    <text x="85" y="102" text-anchor="middle" font-size="12" fill="#5d6b64">entregas</text></svg>
    <ul class="leg-lista">${["atr", "sem", "d30", "ok", "ent"].map((k) => `<li data-ir="ag" data-st="${k}"><i style="background:${ST[k].cor}"></i>${ST[k].rot}<b>${c[k]}</b></li>`).join("")}</ul></div>`;
}

function barrasMes() {
  const ini = new Date(HOJE.getFullYear(), HOJE.getMonth() - 5, 1);
  const meses = Array.from({ length: 18 }, (_, k) => iso(new Date(ini.getFullYear(), ini.getMonth() + k, 1)).slice(0, 7));
  const dados = meses.map((m) => {
    const es = ENT.filter((e) => e.data.slice(0, 7) === m);
    return { m, ent: es.filter((e) => done[e.id]).length, atr: es.filter((e) => !done[e.id] && e.dias < 0).length,
             pen: es.filter((e) => !done[e.id] && e.dias >= 0).length };
  });
  const mx = Math.max(4, ...dados.map((d) => d.ent + d.atr + d.pen));
  const passo = mx <= 10 ? 2 : mx <= 25 ? 5 : 10;
  const topo = Math.ceil(mx / passo) * passo;
  const W = 760, H = 230, ml = 30, mb = 34, mt = 10, gw = W - ml - 6, gh = H - mb - mt, bw = gw / meses.length;
  const y = (v) => mt + gh - (v / topo) * gh;
  let g = "";
  for (let v = 0; v <= topo; v += passo)
    g += `<line x1="${ml}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="#e6ece8"/><text x="${ml - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#5d6b64">${v}</text>`;
  const mesHoje = iso(HOJE).slice(0, 7);
  dados.forEach((d, k) => {
    const x = ml + k * bw + bw * 0.18, w = bw * 0.64;
    let base = 0, rects = "";
    for (const [v, cor] of [[d.ent, ST.ent.cor], [d.atr, ST.atr.cor], [d.pen, d.m === mesHoje ? ST.sem.cor : "#7fb79a"]]) {
      if (!v) continue;
      rects += `<rect x="${x}" y="${y(base + v)}" width="${w}" height="${y(base) - y(base + v)}" fill="${cor}" rx="2"/>`;
      base += v;
    }
    const tot = d.ent + d.atr + d.pen;
    const rot = MES_C[+d.m.slice(5) - 1] + (d.m.endsWith("-01") || k === 0 ? `/${d.m.slice(2, 4)}` : "");
    g += `<g class="col" data-ir="ag" data-st="todas" data-mes="${d.m}"><title>${nomeMes(d.m)}: ${tot} entregas (${d.ent} entregues, ${d.atr} atrasadas, ${d.pen} a vencer)</title>
      <rect x="${ml + k * bw}" y="${mt}" width="${bw}" height="${gh}" fill="${d.m === mesHoje ? "#eef5f1" : "transparent"}"/>${rects}
      ${tot ? `<text x="${x + w / 2}" y="${y(tot) - 4}" font-size="11" text-anchor="middle" fill="#17231e">${tot}</text>` : ""}
      <text x="${x + w / 2}" y="${H - mb + 16}" font-size="11" text-anchor="middle" fill="${d.m === mesHoje ? "#1f4e3d" : "#5d6b64"}" font-weight="${d.m === mesHoje ? 700 : 400}">${rot}</text></g>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entregas por mês">${g}</svg>
    <div class="leg-linha"><span><i style="background:${ST.ent.cor}"></i>entregues</span><span><i style="background:${ST.atr.cor}"></i>atrasadas</span>
    <span><i style="background:${ST.sem.cor}"></i>a vencer neste mês</span><span><i style="background:#7fb79a"></i>a vencer</span></div>`;
}

function ranking() {
  const por = {};
  for (const e of ENT) if (!done[e.id] && e.dias < 0) (por[e.i] = por[e.i] || { n: 0, mais: 0 }), por[e.i].n++, (por[e.i].mais = Math.max(por[e.i].mais, -e.dias));
  const top = Object.entries(por).sort((a, b) => b[1].n - a[1].n || b[1].mais - a[1].mais).slice(0, 10);
  if (!top.length) return `<p class="vazio">Nenhuma empresa com entrega atrasada. ✅</p>`;
  const mx = top[0][1].n;
  return `<ul class="lista rank">${top.map(([i, v]) => `<li data-det="${i}" title="Abrir ${esc(DATA[i].nome)}">
    <span class="nome"><b>${esc(curto(DATA[i].nome))}</b><br><span class="mut">mais antiga: ${v.mais} d</span></span>
    <span class="bar"><i style="width:${(v.n / mx) * 100}%"></i>${v.n}</span></li>`).join("")}</ul>
    ${Object.keys(por).length > 10 ? `<p class="mut">e mais ${Object.keys(por).length - 10} empresas.</p>` : ""}`;
}

function gantt() {
  const ls = [...LIC].sort((a, b) => (a.ren < b.ren ? -1 : 1));
  const vis = ganttTodas ? ls : ls.slice(0, 10);
  const t0 = D(iso(new Date(HOJE.getFullYear() - 1, 0, 1))), t1 = D(iso(new Date(HOJE.getFullYear() + 3, 0, 1)));
  const pos = (s) => Math.max(0, Math.min(100, ((D(s) - t0) / (t1 - t0)) * 100));
  const ph = pos(iso(HOJE));
  const anos = [];
  for (let a = t0.getFullYear(); a <= t1.getFullYear(); a++) anos.push(`<span style="left:${pos(`${a}-01-01`)}%">${a}</span>`);
  return `<div class="gantt-eixo"><span></span><div class="eixo">${anos.join("")}</div><span></span></div><div class="gantt">${vis.map((l) => `
    <div class="gl" data-det="${l.i}" title="Abrir detalhes">
      <span class="nome">${esc(curto(l.nome))}<small>${l.tipo} ${esc(l.num)}</small></span>
      <div class="gt"><span class="v" style="left:${pos(l.emi)}%;width:${pos(l.ven) - pos(l.emi)}%"></span>
        <span class="r" style="left:${pos(l.ren)}%" title="pedir renovação até ${fd(l.ren)}"></span><span class="h" style="left:${ph}%"></span></div>
      <span class="quando"><span class="tag ${l.s[1]}">${l.dr < 0 && l.dv >= 0 ? "pedir já" : l.dv < 0 ? "vencida" : `renovar em ${l.dr} d`}</span></span>
    </div>`).join("")}</div>
    ${ls.length > 10 ? `<button class="btn claro peq mais" data-acao="ganttTodas">${ganttTodas ? "Mostrar só as 10 primeiras" : `Mostrar todas as ${ls.length} licenças`}</button>` : ""}`;
}

/* ── agenda ─────────────────────────────────────────────────────────── */

function filtrarAgenda() {
  const q = F.q.toLowerCase().trim();
  return ENT.filter((e) => {
    const s = status(e);
    if (F.st === "pend" && s === "ent") return false;
    if (F.st === "ate30" && !(s === "sem" || s === "d30")) return false;
    if (!["", "todas", "pend", "ate30"].includes(F.st) && s !== F.st) return false;
    if (F.emp !== "" && +F.emp !== e.i) return false;
    if (F.per && (done[e.id] || e.dias < 0 || e.dias > +F.per)) return false;
    if (F.mes && e.data.slice(0, 7) !== F.mes) return false;
    if (q && !`${e.emp} ${e.texto} ${e.lic} ${e.cond} ${DATA[e.i].cnpj}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function agenda(c) {
  const el = $("#ag");
  if (!el.dataset.ok) {
    el.dataset.ok = 1;
    el.innerHTML = `<div class="chips" id="chips"></div>
    <div class="filtros">
      <input type="search" id="q" placeholder="Buscar empresa, CNPJ, condicionante…  (atalho: /)" aria-label="Buscar">
      <select id="fe" aria-label="Empresa"><option value="">Todas as empresas</option></select>
      <select id="fp" aria-label="Período"><option value="">Qualquer data</option><option value="7">Próximos 7 dias</option><option value="15">Próximos 15 dias</option><option value="30">Próximos 30 dias</option><option value="90">Próximos 90 dias</option></select>
      <select id="fm" aria-label="Mês"><option value="">Todos os meses</option></select>
      <button class="btn claro peq" id="limpar" type="button">Limpar filtros</button>
    </div>
    <p class="resumo-filtro" id="resF"></p>
    <div id="lista"></div>
    <div class="ferramentas">
      <button class="btn claro" data-acao="resumo">📋 Copiar resumo (WhatsApp)</button>
      <button class="btn claro" data-acao="csv">⬇ Baixar planilha (CSV)</button>
      <button class="btn claro" data-acao="imprimir">🖨 Imprimir lista</button>
    </div>`;
    $("#q").addEventListener("input", (e) => { F.q = e.target.value; F.lim = 120; agenda(contar()); });
    $("#fe").addEventListener("change", (e) => { F.emp = e.target.value; F.lim = 120; agenda(contar()); });
    $("#fp").addEventListener("change", (e) => { F.per = e.target.value; if (F.per && F.st !== "pend") F.st = "pend"; F.lim = 120; agenda(contar()); });
    $("#fm").addEventListener("change", (e) => { F.mes = e.target.value; F.lim = 120; agenda(contar()); });
    $("#limpar").addEventListener("click", () => { Object.assign(F, { q: "", st: "pend", emp: "", per: "", mes: "", lim: 120 }); agenda(contar()); });
  }
  // opções que dependem dos dados
  $("#fe").innerHTML = `<option value="">Todas as empresas</option>` +
    DATA.map((l, i) => [l.nome, i]).sort((a, b) => a[0].localeCompare(b[0])).map(([n, i]) => `<option value="${i}">${esc(n)}</option>`).join("");
  const meses = [...new Set(ENT.map((e) => e.data.slice(0, 7)))].sort();
  $("#fm").innerHTML = `<option value="">Todos os meses</option>` + meses.map((m) => `<option value="${m}">${nomeMes(m)}</option>`).join("");
  $("#q").value = F.q; $("#fe").value = F.emp; $("#fp").value = F.per; $("#fm").value = F.mes;

  const chips = [["pend", "Pendentes", "", c.pend], ["atr", "Atrasadas", "r", c.atr], ["sem", "Nesta semana", "l", c.sem],
    ["ate30", "Em até 30 dias", "a", c.sem + c.d30], ["ok", "No prazo", "o", c.ok], ["ent", "Entregues", "b", c.ent], ["todas", "Todas", "", c.total]];
  $("#chips").innerHTML = chips.map(([v, r, cl, n]) => `<button class="chip ${cl} ${F.st === v || (!F.st && v === "todas") ? "on" : ""}" data-chip="${v}">${r}<b>${n}</b></button>`).join("");

  const rows = filtrarAgenda();
  agenda.ultimas = rows;
  const descr = [];
  if (F.emp !== "") descr.push(DATA[+F.emp]?.nome);
  if (F.mes) descr.push(nomeMes(F.mes));
  if (F.per) descr.push(`próximos ${F.per} dias`);
  if (F.q) descr.push(`“${F.q}”`);
  $("#resF").innerHTML = `${plural(rows.length, "entrega", "entregas")}${descr.length ? " · " + esc(descr.join(" · ")) : ""}`;

  const vis = rows.slice(0, F.lim);
  let html = "", mesAtual = "";
  for (const e of vis) {
    const m = e.data.slice(0, 7);
    if (m !== mesAtual) {
      mesAtual = m;
      const n = rows.filter((x) => x.data.slice(0, 7) === m).length;
      html += `<div class="mes-cab">${nomeMes(m)} <span class="mut">${plural(n, "entrega", "entregas")}</span></div>`;
    }
    html += linhaAgenda(e);
  }
  $("#lista").innerHTML = html || `<div class="card"><p class="vazio">Nada encontrado com esses filtros. <button class="btn claro peq" id="limpar2">Limpar filtros</button></p></div>`;
  if (rows.length > F.lim) $("#lista").insertAdjacentHTML("beforeend", `<button class="btn claro mais" data-acao="maisAgenda">Mostrar mais ${Math.min(120, rows.length - F.lim)} de ${rows.length - F.lim} restantes</button>`);
  $("#limpar2")?.addEventListener("click", () => $("#limpar").click());
}

function linhaAgenda(e) {
  const s = status(e);
  return `<div class="ent ${ST[s].cls}" data-ent="${e.id}">
    <button class="marcar ${done[e.id] ? "on" : ""}" data-marcar="${e.id}" title="${done[e.id] ? "Desmarcar" : "Marcar como entregue"}" aria-pressed="${!!done[e.id]}" aria-label="Marcar como entregue">✔</button>
    <div class="data"><b>${fd(e.data)}</b><span class="mut">${quando(e)}</span></div>
    <div class="oque"><b>Cond. ${esc(e.cond)} – ${esc(e.texto)}</b><a href="#" data-det="${e.i}">${esc(e.emp)}</a> <span class="mut">· ${esc(e.lic)} · ${esc(e.tipo)}</span></div>
    <div class="lado"><span class="tag ${ST[s].tag}">${ST[s].rot}</span></div></div>`;
}

/* ── licenças ───────────────────────────────────────────────────────── */

function licencas() {
  const el = $("#li");
  if (!el.dataset.ok) {
    el.dataset.ok = 1;
    el.innerHTML = `<div class="filtros">
      <input type="search" id="ql" placeholder="Buscar empresa, CNPJ ou nº da licença…" aria-label="Buscar licença">
      <select id="fls" aria-label="Situação"><option value="">Todas as situações</option><option value="atrasos">Com entregas atrasadas</option><option value="ren">Renovar em até 60 dias</option><option value="venc">Vencidas ou renovação atrasada</option><option value="dia">Em dia</option><option value="custom">Adicionadas neste navegador</option></select>
      <select id="flo" aria-label="Ordenar"><option value="ren">Ordenar: renovação mais próxima</option><option value="atr">Ordenar: mais atrasos</option><option value="nome">Ordenar: nome</option><option value="emi">Ordenar: emissão mais recente</option></select>
      <button class="btn" data-acao="nova">＋ Nova licença</button>
      <button class="btn claro" data-acao="backup" title="Salva as licenças adicionadas e as entregas marcadas num arquivo">💾 Backup</button>
      <label class="btn claro">📂 Restaurar<input type="file" accept=".json" hidden id="restaurar"></label>
    </div><p class="resumo-filtro" id="resL"></p><div class="lic-grade" id="licG"></div>`;
    $("#ql").addEventListener("input", (e) => { FL.q = e.target.value; licencas(); });
    $("#fls").addEventListener("change", (e) => { FL.st = e.target.value; licencas(); });
    $("#flo").addEventListener("change", (e) => { FL.ord = e.target.value; licencas(); });
    $("#restaurar").addEventListener("change", (e) => restaurar(e.target.files[0]));
  }
  $("#ql").value = FL.q; $("#fls").value = FL.st; $("#flo").value = FL.ord;
  const q = FL.q.toLowerCase();
  const info = LIC.map((l) => {
    const es = ENT.filter((e) => e.i === l.i);
    return { l, es, ent: es.filter((e) => done[e.id]).length, atr: es.filter((e) => !done[e.id] && e.dias < 0).length };
  });
  let ls = info.filter(({ l, atr }) => {
    if (q && !`${l.nome} ${l.cnpj} ${l.num} ${l.cnae}`.toLowerCase().includes(q)) return false;
    if (FL.st === "atrasos" && !atr) return false;
    if (FL.st === "ren" && !(l.dv >= 0 && l.dr <= 60)) return false;
    if (FL.st === "venc" && !(l.dv < 0 || l.dr < 0)) return false;
    if (FL.st === "dia" && l.s[2] !== "o") return false;
    if (FL.st === "custom" && !l.custom) return false;
    return true;
  });
  const ord = { ren: (a, b) => (a.l.ren < b.l.ren ? -1 : 1), atr: (a, b) => b.atr - a.atr, nome: (a, b) => a.l.nome.localeCompare(b.l.nome),
                emi: (a, b) => (a.l.emi > b.l.emi ? -1 : 1) }[FL.ord];
  ls.sort(ord);
  $("#resL").textContent = `${plural(ls.length, "licença", "licenças")}`;
  $("#licG").innerHTML = ls.map(cartaoLic).join("") || `<div class="card"><p class="vazio">Nenhuma licença encontrada.</p></div>`;
}

function cartaoLic({ l, es, ent, atr }) {
  const n = es.length, pend = n - ent - atr;
  const pct = (v) => (n ? (v / n) * 100 : 0);
  const pv = Math.max(0, Math.min(100, ((HOJE - D(l.emi)) / (D(l.ven) - D(l.emi))) * 100));
  return `<article class="card lic ${atr || l.s[2] === "atr" ? "atr" : l.s[2] === "a" ? "a" : ""}">
    <div class="linha"><span class="tag ${l.s[1]}">${l.s[0]}</span>${atr ? `<span class="tag t-atr">${plural(atr, "atrasada", "atrasadas")}</span>` : ""}${l.custom ? `<span class="tag t-ven">adicionada aqui</span>` : ""}${l.renov ? `<span class="tag t-ok">renovada</span>` : ""}</div>
    <h3>${esc(l.nome)}</h3>
    <div class="linha">${l.tipo} nº ${esc(l.num)} · CNPJ ${esc(l.cnpj)}</div>
    <div><div class="val"><span>Emissão ${fd(l.emi)}</span><span>${l.dv < 0 ? "venceu em" : "vence em"} ${fd(l.ven)}</span></div>
      <div class="trilho" title="${Math.round(pv)}% da validade já decorrida"><i style="width:${pv}%;background:${l.s[2] === "atr" ? "var(--red)" : l.s[2] === "a" ? "var(--amb)" : "var(--g2)"}"></i></div>
      <div class="val"><span>Pedir renovação até <b>${fd(l.ren)}</b></span><span>${l.dr >= 0 ? `faltam ${l.dr} d` : l.dv >= 0 ? "<b style='color:var(--red)'>prazo perdido</b>" : ""}</span></div></div>
    <div><div class="val"><span>Entregas: <b>${ent}</b> de ${n} entregues</span><span>${pend} a vencer</span></div>
      <div class="prog"><i style="width:${pct(ent)}%;background:${ST.ent.cor}"></i><i style="width:${pct(atr)}%;background:${ST.atr.cor}"></i><i style="width:${pct(pend)}%;background:#b8d6c6"></i></div></div>
    <div class="acoes"><button class="btn peq" data-det="${l.i}">Detalhes</button><button class="btn claro peq" data-gen="${l.i}">🖨 Calendário</button>
      ${l.file ? `<a class="btn claro peq" href="${esc(l.file)}" target="_blank" rel="noopener" download="${esc(l.pdf || "")}">PDF pronto</a>` : ""}
      ${l.custom ? `<button class="btn perigo peq" data-excluir="${l.i}">Excluir</button>` : ""}</div>
  </article>`;
}

function detalhe(i) {
  const l = LIC[i], es = ENT.filter((e) => e.i === i);
  const ent = es.filter((e) => done[e.id]).length, atr = es.filter((e) => !done[e.id] && e.dias < 0).length;
  $("#detT").textContent = l.nome;
  $("#detS").textContent = `${l.tipoLong} nº ${l.num}`;
  $("#detB").innerHTML = `<div class="det-id">
      <div><b>Situação</b><span class="tag ${l.s[1]}">${l.s[0]}</span></div><div><b>CNPJ/CPF</b>${esc(l.cnpj)}</div>
      <div><b>Emissão</b>${fd(l.emi)}</div><div><b>Vencimento</b>${fd(l.ven)} <span class="mut">(${l.dv < 0 ? "vencida" : `em ${l.dv} d`})</span></div>
      <div><b>${l.tipo === "LP" ? "Pedir a LI até" : "Pedir renovação até"}</b>${fd(l.ren)}</div><div><b>Entregas</b>${ent} de ${es.length} entregues${atr ? ` · <span style="color:var(--red)">${atr} atrasadas</span>` : ""}</div>
    </div>
    <p class="mut">${esc(l.cnae)}</p>
    <div class="ferramentas"><button class="btn" data-gen="${i}">🖨 Gerar calendário (PDF)</button>
      ${l.file ? `<a class="btn claro" href="${esc(l.file)}" target="_blank" rel="noopener">Abrir PDF pronto</a>` : ""}
      <button class="btn claro" data-acao="resumoEmp" data-i="${i}">📋 Resumo desta empresa</button>
      <button class="btn claro" data-doc="${i}" title="Checklist do órgão e pasta de arquivos desta empresa">📁 Documentos</button>
      <button class="btn claro" data-ir="ag" data-emp="${i}">Ver na agenda</button>
      <a class="btn claro" href="../?${new URLSearchParams({ empreendimento: l.nome, cnpj: l.cnpj === "—" ? "" : l.cnpj, licenca: `${l.tipo} nº ${l.num}` })}" title="Abre o GeoMapa com os dados desta licença">🗺 Fazer mapas</a></div>
    <div id="licBox"></div>
    <ul class="lista" data-sem-emp>${es.map((e) => itemLista(e, true)).join("")}</ul>`;
  if (typeof caixaLicenca === "function") caixaLicenca(i);
  if (!$("#dDet").open) $("#dDet").showModal();
}

/* ── calendário ─────────────────────────────────────────────────────── */

function calendario() {
  const y = mesCal.getFullYear(), m = mesCal.getMonth(), ini = new Date(y, m, 1).getDay(), nd = new Date(y, m + 1, 0).getDate();
  const k = `${y}-${String(m + 1).padStart(2, "0")}`;
  const doMes = ENT.filter((e) => e.data.slice(0, 7) === k);
  let h = `<div class="mh"><button class="btn claro" data-cal="-1" aria-label="Mês anterior">◀</button><h3>${nomeMes(k)}</h3>
    <button class="btn claro" data-cal="1" aria-label="Próximo mês">▶</button><button class="btn claro" data-cal="0">Hoje</button>
    <span class="mut" style="margin-left:auto">${plural(doMes.length, "entrega", "entregas")} no mês · clique num dia para ver</span></div>
    <div class="leg-linha" style="margin-bottom:8px"><span><i style="background:var(--red2)"></i>atrasada</span><span><i style="background:var(--amb2)"></i>em até 30 dias</span>
    <span><i style="background:var(--ok2)"></i>no prazo</span><span><i style="background:var(--blu2)"></i>entregue</span><span><i style="background:#ecdcf8"></i>vencimento da licença</span></div>
    <div class="cal">${"Dom Seg Ter Qua Qui Sex Sáb".split(" ").map((x) => `<div class="h">${x}</div>`).join("")}`;
  for (let d = 0; d < ini; d++) h += `<div class="o"></div>`;
  for (let d = 1; d <= nd; d++) {
    const s = `${k}-${String(d).padStart(2, "0")}`;
    const es = doMes.filter((e) => e.data === s), vs = DATA.filter((l) => l.ven === s);
    h += `<div class="${s === iso(HOJE) ? "hoje" : ""}" data-dia="${s}" tabindex="0" aria-label="${d} de ${MESES[m]}: ${es.length} entregas"><span class="dn">${d}</span>
      ${es.slice(0, 3).map((e) => `<span class="ev ${ST[status(e)].cls}" title="${esc(e.emp)} – cond. ${esc(e.cond)}">${esc(curto(e.emp))} · ${esc(e.cond)}</span>`).join("")}
      ${es.length > 3 ? `<span class="mut">+${es.length - 3} mais</span>` : ""}
      ${vs.map((l) => `<span class="ev ven">vence: ${esc(curto(l.nome))}</span>`).join("")}</div>`;
  }
  const resto = (7 - ((ini + nd) % 7)) % 7;
  for (let d = 0; d < resto; d++) h += `<div class="o"></div>`;
  $("#cl").innerHTML = h + "</div>";
}

function abrirDia(s) {
  const es = ENT.filter((e) => e.data === s), vs = DATA.filter((l) => l.ven === s);
  $("#diaT").textContent = `${fd(s)} – ${plural(es.length, "entrega", "entregas")}`;
  $("#diaB").innerHTML = (es.length ? `<ul class="lista">${es.map(itemLista).join("")}</ul>` : `<p class="vazio">Nenhuma entrega neste dia.</p>`) +
    vs.map((l) => `<p><span class="tag t-ven">Vencimento</span> <a href="#" data-det="${l.i}">${esc(l.nome)} – ${l.tipo} ${esc(l.num)}</a></p>`).join("");
  $("#dDia").showModal();
}

/* ── marcar entregue (com desfazer) ─────────────────────────────────── */

let desfazer = null;
function marcar(id, valor) {
  const antes = !!done[id];
  if (valor === undefined) valor = !antes;
  valor ? (done[id] = 1) : delete done[id];
  gravar("pa_done", done);
  const e = ENT.find((x) => x.id === id);
  // atualiza só as linhas desta entrega (a lista não "pula")
  $$(`[data-ent="${id}"]`).forEach((el) => {
    el.outerHTML = el.classList.contains("ent") ? linhaAgenda(e) : itemLista(e, !!el.closest("[data-sem-emp]"));
  });
  const c = contar();
  $("#cAg").textContent = c.atr || "";
  if (aba === "ag") { $$("#chips .chip b").forEach((b, k) => { b.textContent = [c.pend, c.atr, c.sem, c.sem + c.d30, c.ok, c.ent, c.total][k]; }); }
  else if (aba !== "dash" || !$("#dDet").open) desenhar();
  desfazer = () => marcar(id, antes);
  aviso(valor ? `✔ Entrega marcada: ${curto(e.emp)} · cond. ${e.cond}` : "Marcação removida", true);
}

let tAviso;
function aviso(t, comDesfazer) {
  $("#toastTxt").textContent = t;
  $("#toastDesf").hidden = !comDesfazer;
  $("#toast").classList.add("on");
  clearTimeout(tAviso);
  tAviso = setTimeout(() => $("#toast").classList.remove("on"), comDesfazer ? 5000 : 2600);
}

/* ── resumo, CSV, backup ────────────────────────────────────────────── */

function copiar(t, msg) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
    .then(() => aviso(msg)).catch(() => prompt("Copie o texto:", t));
}

function resumoGeral() {
  const p = ENT.filter((e) => !done[e.id]), atr = p.filter((e) => e.dias < 0), prox = p.filter((e) => e.dias >= 0 && e.dias <= 15);
  const f = (e) => `• ${fd(e.data)} – ${e.emp} (cond. ${e.cond}): ${e.texto}`;
  const ren = LIC.filter((l) => l.dv >= 0 && l.dr <= 60).sort((a, b) => (a.ren < b.ren ? -1 : 1));
  copiar(`*Resumo de condicionantes – ${HOJE.toLocaleDateString("pt-BR")}*\n\n*Atrasadas (${atr.length})*\n${atr.slice(0, 25).map(f).join("\n") || "nenhuma"}` +
    `${atr.length > 25 ? `\n… e mais ${atr.length - 25}` : ""}\n\n*Próximos 15 dias (${prox.length})*\n${prox.map(f).join("\n") || "nenhuma"}` +
    `\n\n*Renovações em até 60 dias (${ren.length})*\n${ren.map((l) => `• ${l.nome} – ${l.tipo} ${l.num}: pedir até ${fd(l.ren)}`).join("\n") || "nenhuma"}`,
  "Resumo copiado! Cole no WhatsApp.");
}

function resumoEmpresa(i) {
  const l = LIC[i], es = ENT.filter((e) => e.i === i && !done[e.id]);
  const f = (e) => `• ${fd(e.data)} – cond. ${e.cond}: ${e.texto}${e.dias < 0 ? " *(atrasada)*" : ""}`;
  copiar(`*${l.nome}* – ${l.tipoLong} nº ${l.num}\nVencimento: ${fd(l.ven)} · pedir renovação até ${fd(l.ren)}\n\n*Entregas pendentes (${es.length})*\n${es.map(f).join("\n") || "nenhuma"}`,
    "Resumo da empresa copiado!");
}

function baixar(nome, tipo, conteudo) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

function csv() {
  const c = (x) => { x = String(x ?? ""); return /[";\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const L = (agenda.ultimas || ENT).map((e) => [fd(e.data), e.emp, DATA[e.i].cnpj, e.lic, e.cond, e.texto, e.tipo, ST[status(e)].rot.toUpperCase()]);
  baixar("agenda-condicionantes.csv", "text/csv;charset=utf-8",
    "﻿" + [["Prazo", "Empresa", "CNPJ", "Licença", "Cond.", "O que entregar", "Tipo", "Status"]].concat(L).map((r) => r.map(c).join(";")).join("\r\n"));
  aviso("Planilha baixada (abre no Excel)");
}

function backup() {
  baixar(`backup-painel-pa-${iso(HOJE)}.json`, "application/json", JSON.stringify({ custom: CUS, done, docs: ler("pa_docs", {}), ren: ler("pa_ren", {}), ger: ler("pa_ger", {}), gerado: new Date().toISOString() }, null, 1));
  aviso("Backup salvo na pasta de downloads");
}

function restaurar(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const o = JSON.parse(r.result);
      if (!confirm(`Restaurar o backup? Isso troca as marcações (${Object.keys(o.done || {}).length}) e as licenças adicionadas (${(o.custom || []).length}) deste navegador.`)) return;
      CUS = o.custom || []; done = o.done || {};
      gravar("pa_custom", CUS); gravar("pa_done", done);
      if (o.docs) { gravar("pa_docs", o.docs); if (typeof DOCS !== "undefined") DOCS = o.docs; }
      if (o.ren) { gravar("pa_ren", o.ren); if (typeof REN !== "undefined") REN = o.ren; }
      montar(); desenhar(); aviso("Backup restaurado ✔");
    } catch (e) { alert("Arquivo de backup inválido."); }
  };
  r.readAsText(f);
}

/* ── nova licença ───────────────────────────────────────────────────── */

const TL = { LO: "Licença Ambiental de Operação", LI: "Licença Ambiental de Instalação", LP: "Licença Ambiental Prévia" };
const PRE = [
  ["Placa da licença (30 dias)", "Instalar placa com nº do processo, data de expedição e validade da licença", "u", 30],
  ["Cópia da licença visível (30 dias)", "Instalar a cópia da licença em local visível (art. 38, Lei 2.221/2001)", "u", 30],
  ["Contrato de coleta (60 dias)", "Contrato com empresa de coleta de resíduos, com a licença dela", "u", 60],
  ["AVCB / Bombeiros (90 dias)", "Auto de Vistoria do Corpo de Bombeiros (AVCB)", "u", 90],
  ["Uso e ocupação do solo (90 dias)", "Certidão de Uso e Ocupação do Solo", "u", 90],
  ["PGRS atualizado (anual)", "PGRS atualizado, assinado pelo responsável técnico, com ART", "a"],
  ["MTR + CDF (anual)", "MTR + CDF (SGORS) dos resíduos gerados", "a"],
  ["MTR + CDF (semestral)", "MTR + CDF (SGORS) dos resíduos gerados", "s"],
  ["Limpeza da fossa (na renovação)", "MTR + CDF (SGORS) – esgotamento sanitário (limpeza da fossa)", "r"],
  ["Relatório de atendimento (na renovação)", "Relatório de Atendimento das Condicionantes", "r"],
];

function novaCond(v) {
  const r = document.createElement("div");
  r.className = "cr";
  r.innerHTML = `<input placeholder="Nº" class="cn" aria-label="Número da condicionante"><input placeholder="O que entregar" class="ct" aria-label="O que entregar">
    <select class="cp" aria-label="Periodicidade"><option value="u">Único – X dias após emissão</option><option value="a">Anual</option><option value="s">Semestral</option>
    <option value="t">Trimestral</option><option value="r">Na renovação</option><option value="f">Data fixa</option></select>
    <input class="cx" type="number" min="1" placeholder="dias" aria-label="Dias após a emissão ou data"><button type="button" class="x" title="Remover" aria-label="Remover">×</button>`;
  const p = $(".cp", r), x = $(".cx", r);
  p.onchange = () => { x.type = p.value === "f" ? "date" : "number"; x.style.visibility = p.value === "u" || p.value === "f" ? "visible" : "hidden"; previa(); };
  $(".x", r).onclick = () => { r.remove(); previa(); };
  r.addEventListener("input", previa);
  if (v) { $(".ct", r).value = v[1]; p.value = v[2]; if (v[3]) x.value = v[3]; }
  p.onchange();
  $("#cRows").appendChild(r);
  return r;
}

function lerConds() {
  return $$("#cRows .cr").map((r) => ({ n: $(".cn", r).value.trim(), t: $(".ct", r).value.trim(), p: $(".cp", r).value, x: $(".cx", r).value })).filter((c) => c.t);
}

function gerarLinhas(emi, ven, conds, ren) {
  const out = [], rd = addD(ven, -120);
  conds.forEach((c) => {
    const base = { cond: c.n || "—", texto: c.t };
    if (c.p === "u") out.push({ ...base, data: addD(emi, +c.x || 30), tipo: `Único – ${+c.x || 30} dias` });
    else if (c.p === "f") { if (c.x) out.push({ ...base, data: c.x, tipo: "Data fixa" }); }
    else if (c.p === "r") out.push({ ...base, data: rd, tipo: "Na renovação" });
    else {
      const step = { a: 12, s: 6, t: 3 }[c.p], nm = { a: "Anual", s: "Semestral", t: "Trimestral" }[c.p], dts = [];
      for (let k = 1; ; k++) { const d = addM(emi, step * k); if (d > ven) break; dts.push(d); }
      dts.forEach((d, k) => out.push({ ...base, data: d, tipo: `${nm} ${k + 1}/${dts.length}` }));
    }
  });
  if (ren) out.push({ cond: "—", texto: "Pedir a renovação da licença (120 dias antes do vencimento)", data: rd, tipo: "Renovação" });
  return out.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

function previa() {
  const emi = $("#fEmi").value, ven = $("#fVen").value;
  if (!emi || !ven) { $("#prev").innerHTML = `<span class="mut">Preencha emissão e vencimento para ver as datas calculadas.</span>`; return; }
  if (ven <= emi) { $("#prev").innerHTML = `<span style="color:var(--red)">O vencimento deve ser depois da emissão.</span>`; return; }
  const rs = gerarLinhas(emi, ven, lerConds(), $("#fRen").checked);
  $("#prev").innerHTML = rs.length ? `<b>${plural(rs.length, "entrega será criada", "entregas serão criadas")}:</b><table>${rs.map((r) =>
    `<tr><td><b>${fd(r.data)}</b></td><td>Cond. ${esc(r.cond)} – ${esc(r.texto)}</td><td class="mut">${esc(r.tipo)}</td></tr>`).join("")}</table>`
    : `<span class="mut">Nenhuma entrega ainda: adicione condicionantes acima.</span>`;
}

function abrirNova() {
  $("#fAdd").reset();
  $("#cRows").innerHTML = "";
  novaCond(); novaCond();
  if (!$("#pre").dataset.ok) {
    $("#pre").dataset.ok = 1;
    $("#pre").innerHTML = `<span class="mut" style="align-self:center">Atalhos:</span>` + PRE.map((p, i) => `<button type="button" data-pre="${i}">＋ ${p[0]}</button>`).join("");
  }
  previa();
  $("#dAdd").showModal();
  setTimeout(() => $("#fNome").focus(), 50);
}

function salvarNova(ev) {
  ev.preventDefault();
  const emi = $("#fEmi").value, ven = $("#fVen").value;
  if (ven <= emi) { alert("O vencimento deve ser depois da emissão."); return; }
  const tp = $("#fTipo").value;
  const l = { nome: $("#fNome").value.trim().toUpperCase(), tipo: tp, tipoLong: TL[tp], num: $("#fNum").value.trim(), cnpj: $("#fCnpj").value.trim() || "—",
              emi, ven, ren: addD(ven, -120), cnae: $("#fCnae").value.trim() || "—", rows: gerarLinhas(emi, ven, lerConds(), $("#fRen").checked), custom: 1 };
  CUS.push(l);
  if (!gravar("pa_custom", CUS)) alert("Não foi possível salvar neste navegador.");
  $("#dAdd").close();
  montar();
  aviso(`Licença de ${curto(l.nome)} salva com ${plural(l.rows.length, "entrega", "entregas")}`);
  if (ev.submitter && ev.submitter.value === "1") gerarCalendario(DATA.length - 1);
  ir("li", { q: "", st: "custom" });
}

function excluir(i) {
  const l = DATA[i];
  if (!l.custom || !confirm(`Remover a licença de ${l.nome}? Ela foi adicionada só neste navegador.`)) return;
  CUS.splice(i - BASE.length, 1);
  gravar("pa_custom", CUS);
  montar(); desenhar(); aviso("Licença removida");
}

/* ── calendário para imprimir (PDF) ─────────────────────────────────── */

function abrirGerar() {
  $("#gLista").innerHTML = DATA.map((l, i) => `<option value="${esc(`${l.nome} – ${l.tipo} ${l.num}`)}" data-i="${i}"></option>`).join("");
  $("#gBusca").value = "";
  $("#dGen").showModal();
  setTimeout(() => $("#gBusca").focus(), 50);
}

function gerarSelecionada() {
  const v = $("#gBusca").value.trim().toLowerCase();
  const i = DATA.findIndex((l) => `${l.nome} – ${l.tipo} ${l.num}`.toLowerCase() === v) >= 0
    ? DATA.findIndex((l) => `${l.nome} – ${l.tipo} ${l.num}`.toLowerCase() === v)
    : DATA.findIndex((l) => l.nome.toLowerCase().includes(v));
  if (!v || i < 0) { aviso("Escolha uma licença da lista"); return; }
  $("#dGen").close();
  gerarCalendario(i);
}

function gerarCalendario(i) {
  const l = DATA[i], W = window.open("", "_blank");
  if (!W) { alert("Libere as janelas pop-up deste site para gerar o calendário."); return; }
  const ev = {};
  l.rows.forEach((r) => (ev[r.data] = ev[r.data] || []).push(r.cond));
  const MN = MESES.map((m) => m[0].toUpperCase() + m.slice(1));
  const lp = l.tipo === "LP", ren = addD(l.ven, -120);
  const logo = new URL("logo.png", location.href).href;
  let ms = "", y = D(l.emi).getFullYear(), m = D(l.emi).getMonth();
  const ey = D(l.ven).getFullYear(), em = D(l.ven).getMonth();
  while (y < ey || (y === ey && m <= em)) {
    const first = new Date(y, m, 1).getDay(), nd = new Date(y, m + 1, 0).getDate();
    let t = `<div class="m"><div class="mh">${MN[m]} ${y}</div><table><tr>${"DSTQQSS".split("").map((x) => `<th>${x}</th>`).join("")}</tr><tr>`, c = 0;
    for (; c < first; c++) t += '<td class="o"></td>';
    for (let d = 1; d <= nd; d++) {
      const k = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      let cl = "", sm = "";
      if (k === l.emi) { cl = "em"; sm = "emissão"; }
      if (ev[k]) { cl = "ev"; sm = "cond. " + ev[k].join(","); }
      if (k === ren) { cl = "k"; sm = (lp ? "pedir a LI" : "renovação") + (ev[k] ? " · cond. " + ev[k].join(",") : ""); }
      if (k === l.ven) { cl = "v"; sm = "vence"; }
      t += `<td class="${cl}">${d}${sm ? `<small>${sm}</small>` : ""}</td>`; c++;
      if (c % 7 === 0 && d < nd) t += "</tr><tr>";
    }
    while (c % 7) { t += '<td class="o"></td>'; c++; }
    ms += t + "</tr></table></div>";
    m++; if (m > 11) { m = 0; y++; }
  }
  const tr = l.rows.map((r) => `<tr><td class="dt">${fd(r.data)}</td><td>${r.data > addD(l.emi, 30) ? fd(addD(r.data, -30)) : "—"}</td><td class="c">${esc(r.cond)}</td><td>${esc(r.texto)}</td><td>${esc(r.tipo)}</td><td class="box">${done[`${i}_${l.rows.indexOf(r)}`] ? "✔" : ""}</td><td class="line"></td></tr>`).join("");
  W.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Calendário – ${esc(l.nome)} – ${l.tipo} ${esc(l.num)}</title><style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:11px/1.35 system-ui,Segoe UI,Arial,sans-serif;color:#17231e;margin:0}
.hd{display:flex;justify-content:space-between;align-items:flex-start}.hd img{height:62px}h1{font-size:20px;margin:0;color:#1F4E3D}.sub{color:#5d6b64}h2{font-size:14px;margin:14px 0 6px;color:#1F4E3D}
.id{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}.id div{background:#e8f0ec;border-radius:6px;padding:6px 8px}.id b{display:block;font-size:8px;text-transform:uppercase;color:#5d6b64}
table.t{width:100%;border-collapse:collapse}.t th{background:#1F4E3D;color:#fff;text-align:left;padding:5px 6px;font-size:10px}.t td{border-bottom:1px solid #dfe7e2;padding:5px 6px;vertical-align:top}.dt{font-weight:700;white-space:nowrap}.c{text-align:center}.box{width:60px;text-align:center;color:#1f4fa8;font-weight:700}.line{width:140px}
.note{color:#5d6b64;font-size:9px;margin-top:6px}.pg{page-break-after:always;padding-bottom:26px}.pg:last-of-type{page-break-after:auto}
.leg{display:flex;gap:14px;margin:4px 0 8px;font-size:10px}.leg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:4px;vertical-align:-2px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.m{break-inside:avoid}.mh{background:#1F4E3D;color:#fff;text-align:center;font-weight:700;padding:3px;border-radius:5px 5px 0 0}
.m table{width:100%;border-collapse:collapse;table-layout:fixed}.m th{font-size:8px;background:#e8f0ec;padding:2px}.m td{border:1px solid #e3e9e5;height:30px;vertical-align:top;padding:1px 3px;font-size:9px;overflow:hidden}.m td small{display:block;font-size:5.5px;line-height:1.1}
.m td.em{background:#C6EFCE}.m td.ev{background:#FFE9A8}.m td.k{background:#F8C9C9}.m td.v{background:#E0B3FF}.m td.o{background:#f6f8f7}
.ft{position:fixed;bottom:0;left:0;right:0;text-align:center;font-size:8px;color:#1F4E3D;border-top:2px solid #1F4E3D;padding-top:3px;background:#fff}.ft b{display:block;letter-spacing:.03em}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>
<div class="ft"><b>PA CONSULTORIA AMBIENTAL | CNPJ 50.849.738/0001-04</b>E-mail: paconsultoriaambiental.stma@gmail.com</div>
<div class="pg"><div class="hd"><div><h1>Calendário de condicionantes</h1><div class="sub">${esc(l.nome)} · ${esc(l.tipoLong)} nº ${esc(l.num)} · SMDUMA Arapiraca</div></div><img src="${logo}"></div>
<div class="id"><div><b>CNPJ</b>${esc(l.cnpj)}</div><div><b>Emissão</b>${fd(l.emi)}</div><div><b>Vencimento</b>${fd(l.ven)}</div><div><b>${lp ? "Pedir a Licença de Instalação até" : "Pedir renovação até"}</b>${fd(ren)}</div></div>
<h2>Entregas e prazos</h2><table class="t"><tr><th>Data limite</th><th>Avisar em</th><th>Cond.</th><th>O que entregar</th><th>Tipo</th><th>Entregue?</th><th>Evidência / observação</th></tr>${tr}</table>
<p class="note">Datas contadas a partir da emissão (${fd(l.emi)}); "na renovação" considerada 120 dias antes do vencimento (${fd(l.ven)}). "Avisar em" = 30 dias antes do prazo. Confirme as datas com a SMDUMA.</p></div>
<div class="pg"><h2>Calendário mensal</h2><div class="leg"><span><i style="background:#C6EFCE"></i>Emissão</span><span><i style="background:#FFE9A8"></i>Entrega de condicionante</span><span><i style="background:#F8C9C9"></i>${lp ? "Prazo para pedir a LI" : "Prazo para pedir renovação"}</span><span><i style="background:#E0B3FF"></i>Vencimento da licença</span></div><div class="grid">${ms}</div></div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`);
  W.document.close();
}

/* ── eventos (delegação) ────────────────────────────────────────────── */

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-marcar],[data-ir],[data-det],[data-gen],[data-excluir],[data-acao],[data-chip],[data-cal],[data-dia],[data-pre],[data-fecha]");
  if (!t) return;
  const d = t.dataset;
  if (d.marcar) { ev.preventDefault(); marcar(d.marcar); return; }
  if (d.fecha !== undefined) { t.closest("dialog").close(); return; }
  if (d.det !== undefined) { ev.preventDefault(); $("#dDia").open && $("#dDia").close(); detalhe(+d.det); return; }
  if (d.gen !== undefined) { gerarCalendario(+d.gen); return; }
  if (d.excluir !== undefined) { excluir(+d.excluir); return; }
  if (d.pre !== undefined) {
    const p = PRE[+d.pre];
    const vazio = $$("#cRows .cr").find((r) => !$(".ct", r).value.trim()) || novaCond();
    $(".ct", vazio).value = p[1]; $(".cp", vazio).value = p[2]; $(".cp", vazio).onchange(); if (p[3]) $(".cx", vazio).value = p[3];
    previa(); return;
  }
  if (d.chip !== undefined) { F.st = d.chip; F.lim = 120; if (d.chip !== "pend") F.per = ""; agenda(contar()); return; }
  if (d.cal !== undefined) {
    mesCal = +d.cal === 0 ? new Date(HOJE.getFullYear(), HOJE.getMonth(), 1) : new Date(mesCal.getFullYear(), mesCal.getMonth() + +d.cal, 1);
    calendario(); return;
  }
  if (d.dia) { abrirDia(d.dia); return; }
  if (d.ir) {
    $$("dialog[open]").forEach((x) => x.close());
    if (d.ir === "ag") ir("ag", { st: d.st || "pend", mes: d.mes || "", per: d.per || "", emp: d.emp ?? "", q: "" });
    else if (d.ir === "li") ir("li", { st: d.lst || "", q: "" });
    else ir(d.ir);
    return;
  }
  const acoes = {
    resumo: resumoGeral, csv, backup, nova: abrirNova, imprimir: () => window.print(), ajuda: () => $("#dAjuda").showModal(),
    resumoEmp: () => resumoEmpresa(+d.i), maisAgenda: () => { F.lim += 120; agenda(contar()); },
    ganttTodas: () => { ganttTodas = !ganttTodas; dashboard(contar()); },
    fecharAjuda: () => { gravar("pa_help", "0"); $("#boasVindas")?.remove(); },
  };
  acoes[d.acao]?.();
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.dataset?.dia) { abrirDia(ev.target.dataset.dia); return; }
  if (ev.target.closest("input,select,textarea") || ev.ctrlKey || ev.metaKey || ev.altKey || $("dialog[open]")) return;
  if (ev.key === "/") { ev.preventDefault(); if (aba !== "ag") ir("ag"); $("#q").focus(); }
  else if (["1", "2", "3", "4", "5", "6"].includes(ev.key)) ir(["dash", "ag", "li", "cl", "doc", "ger"][+ev.key - 1]);
  else if (ev.key.toLowerCase() === "n") abrirNova();
});

$$("#abas button").forEach((b) => b.addEventListener("click", () => ir(b.dataset.t)));
$("#bAdd").addEventListener("click", abrirNova);
$("#bGen").addEventListener("click", abrirGerar);
$("#bGenOk").addEventListener("click", gerarSelecionada);
$("#gBusca").addEventListener("keydown", (e) => { if (e.key === "Enter") gerarSelecionada(); });
$("#bAjuda").addEventListener("click", () => $("#dAjuda").showModal());
$("#bCond").addEventListener("click", () => novaCond());
$("#fAdd").addEventListener("submit", salvarNova);
$("#fRen").addEventListener("change", previa);
$("#fVen").addEventListener("change", previa);
$("#fEmi").addEventListener("change", (e) => {
  if (e.target.value && !$("#fVen").value) {
    const d = D(e.target.value); d.setFullYear(d.getFullYear() + 2); $("#fVen").value = iso(d);
    aviso("Vencimento preenchido com 2 anos – ajuste se precisar");
  }
  previa();
});
$("#toastDesf").addEventListener("click", () => { const f = desfazer; desfazer = null; $("#toast").classList.remove("on"); f && f(); });
$$("dialog").forEach((dl) => dl.addEventListener("click", (e) => { if (e.target === dl) dl.close(); }));  // clicar fora fecha
$("#dDet").addEventListener("close", () => { if (aba === "dash" || aba === "li" || aba === "cl") desenhar(); });
$("#dDia").addEventListener("close", () => { if (aba === "cl" || aba === "dash") desenhar(); });
document.addEventListener("click", (e) => { const m = $(".menu[open]"); if (m && !m.contains(e.target)) m.open = false; });

$("#hoje").textContent = "hoje: " + HOJE.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

fetch("data.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
  BASE = d;
  montar();
  const h = location.hash.slice(1);
  ir(["dash", "ag", "li", "cl", "doc", "ger"].includes(h) ? h : "dash");
}).catch(() => {
  $("#dash").innerHTML = `<div class="alerta"><span class="ic">⚠️</span><div><h2>Não foi possível carregar os dados</h2><p>Abra o painel pelo endereço do site (não pelo arquivo no computador) e atualize a página.</p></div></div>`;
});
