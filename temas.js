/* GeoMapa QGIS – mapas temáticos (meio físico, clima, ar e biomas).
   Cada tema cria a(s) camada(s) em grupoTema, monta a legenda com as classes presentes no
   enquadramento e informa o valor no ponto. Usa só serviços abertos com CORS ou dados deste site. */
"use strict";

const grupoTema = new ol.layer.Group({ layers: [] });
const temaEstado = {
  id: null, legenda: [], info: [], quadro: null, fonte: "", vetor: null, geom: null,
  carregando: false, aviso: "",
};
const cacheTema = { clima: null, solos: null, biomas: null, saneamento: null, normais: {}, ar: {}, imgs: {} };

const RES_Z = (z) => 156543.03392804097 / 2 ** z;
const hex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
const fmtN = (v, d = 0) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function vistaBBox(margem = 0) {
  const ext = mapa.getView().calculateExtent(mapa.getSize());
  const [w, s, e, n] = ol.proj.transformExtent(ext, "EPSG:3857", "EPSG:4326");
  const mx = (e - w) * margem, my = (n - s) * margem;
  return [w - mx, s - my, e + mx, n + my];
}

/* ── imagens PNG paletadas (solos e clima): leitura de pixel e classes presentes ── */

function carregarImg(url) {
  if (!cacheTema.imgs[url]) {
    cacheTema.imgs[url] = new Promise((ok, erro) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => ok(im);
      im.onerror = () => erro(new Error("imagem indisponível: " + url));
      im.src = url;
    });
  }
  return cacheTema.imgs[url];
}

// Lê a janela [w,s,e,n] de uma imagem georreferenciada (ext = [w,s,e,n] da imagem) numa grade de amostras.
async function amostrarImg(url, extImg, janela, n = 160) {
  const im = await carregarImg(url);
  const [W, S, E, N] = extImg;
  const w = Math.max(janela[0], W), e = Math.min(janela[2], E), s = Math.max(janela[1], S), nn = Math.min(janela[3], N);
  if (w >= e || s >= nn) return null;
  const sx = ((w - W) / (E - W)) * im.width, sw = Math.max(1, ((e - w) / (E - W)) * im.width);
  const sy = ((N - nn) / (N - S)) * im.height, sh = Math.max(1, ((nn - s) / (N - S)) * im.height);
  const cw = Math.max(1, Math.min(n, Math.round(sw))), ch = Math.max(1, Math.min(n, Math.round(sh)));
  const cv = document.createElement("canvas");
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch).data;
}

async function corNoPonto(url, extImg, [lon, lat]) {
  const [W, S, E, N] = extImg;
  if (lon < W || lon >= E || lat < S || lat >= N) return null;
  const im = await carregarImg(url);
  const x = Math.floor(((lon - W) / (E - W)) * im.width), y = Math.floor(((N - lat) / (N - S)) * im.height);
  const cv = document.createElement("canvas");
  cv.width = 1; cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(im, x, y, 1, 1, 0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return d[3] > 0 ? hex(d[0], d[1], d[2]) : null;
}

function contarCores(dados, contagem) {
  if (!dados) return;
  for (let i = 0; i < dados.length; i += 4) {
    if (dados[i + 3] < 200) continue;
    const c = hex(dados[i], dados[i + 1], dados[i + 2]);
    contagem.set(c, (contagem.get(c) || 0) + 1);
  }
}

function classesPresentes(contagem, classes, minimo = 0.002) {
  const total = [...contagem.values()].reduce((a, b) => a + b, 0) || 1;
  return classes.filter((c) => (contagem.get(c.cor.toLowerCase()) || 0) / total >= minimo);
}

function camadaPNG(url, ext4326) {
  return new ol.layer.Image({
    className: "tema",
    source: new ol.source.ImageStatic({
      url, imageExtent: ext4326, projection: "EPSG:4326", crossOrigin: "anonymous", interpolate: false,
    }),
  });
}

/* ── dados do próprio site ──────────────────────────────────────────── */

async function dadosClima() {
  if (!cacheTema.clima) cacheTema.clima = json("dados/clima/classes.json");
  return cacheTema.clima;
}
async function dadosSolos() {
  if (!cacheTema.solos) cacheTema.solos = json("dados/solos/classes.json");
  return cacheTema.solos;
}
async function dadosBiomas() {
  if (!cacheTema.biomas) cacheTema.biomas = json("dados/biomas.json");
  return cacheTema.biomas;
}
const EXT_CLIMA = [-74.2, -34.0, -34.6, 5.6];

// Valores exatos da normal CHELSA no ponto (chuva anual em mm e temperatura média em °C).
async function valoresCHELSA([lon, lat]) {
  const [W, S, E, N] = EXT_CLIMA;
  if (lon < W || lon >= E || lat < S || lat >= N) return null;
  const im = await carregarImg("dados/clima/valores.png");
  const cv = document.createElement("canvas");
  cv.width = 1; cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(im, Math.floor(((lon - W) / (E - W)) * im.width), Math.floor(((N - lat) / (N - S)) * im.height), 1, 1, 0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return d[3] === 255 ? { prec: d[0] * 256 + d[1], temp: d[2] / 5 } : null;
}

/* ── normais climatológicas no ponto (ERA5, 1991–2020) para o climograma ── */

async function normaisNoPonto([lon, lat]) {
  const k = `${lon.toFixed(2)},${lat.toFixed(2)}`;
  if (!cacheTema.normais[k]) {
    cacheTema.normais[k] = (async () => {
      const d = await json(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        "&start_date=1991-01-01&end_date=2020-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=GMT");
      const t = Array(12).fill(0), nt = Array(12).fill(0), p = Array(12).fill(0);
      d.daily.time.forEach((dia, i) => {
        const m = Number(dia.slice(5, 7)) - 1;
        const tv = d.daily.temperature_2m_mean[i], pv = d.daily.precipitation_sum[i];
        if (tv != null) { t[m] += tv; nt[m]++; }
        if (pv != null) p[m] += pv;
      });
      let temp = t.map((v, i) => v / (nt[i] || 1));
      let prec = p.map((v) => v / 30);
      // O ERA5 (~25 km) suaviza chuva e temperatura no litoral e nas serras: mantém a distribuição mensal
      // do ERA5 e ajusta os totais anuais à normal CHELSA (~1 km) do ponto.
      let ajustado = false;
      try {
        const ch = await valoresCHELSA([lon, lat]);
        const tp = prec.reduce((a, b) => a + b), tm = temp.reduce((a, b) => a + b) / 12;
        if (ch && tp > 0) { prec = prec.map((v) => (v * ch.prec) / tp); temp = temp.map((v) => v + ch.temp - tm); ajustado = true; }
      } catch (e) { /* sem ajuste */ }
      return { temp, prec, mediaT: temp.reduce((a, b) => a + b) / 12, totalP: prec.reduce((a, b) => a + b),
               elevacao: d.elevation, ajustado };
    })().catch((e) => { delete cacheTema.normais[k]; throw e; });
  }
  return cacheTema.normais[k];
}

const MESES = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

// Climograma: barras de precipitação e linha de temperatura (x, y, w, h em px do canvas).
function desenharClimograma(ctx, x, y, w, h, nm, escalaFonte = 1) {
  const pt = (v) => v * escalaFonte;
  const ml = pt(34), mr = pt(30), mt = pt(10), mb = pt(22);
  const gx = x + ml, gy = y + mt, gw = w - ml - mr, gh = h - mt - mb;
  const pMax = Math.max(50, Math.ceil(Math.max(...nm.prec) / 50) * 50);
  const tMin = Math.floor(Math.min(...nm.temp) / 5) * 5 - 5, tMax = Math.ceil(Math.max(...nm.temp) / 5) * 5 + 5;
  ctx.save();
  ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#ddd"; ctx.lineWidth = pt(0.8);
  ctx.font = `${pt(9)}px Arial, sans-serif`; ctx.fillStyle = "#444";
  for (let i = 0; i <= 5; i++) {
    const yy = gy + gh - (gh * i) / 5;
    ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx + gw, yy); ctx.stroke();
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(fmtN((pMax * i) / 5), gx - pt(3), yy);
    ctx.textAlign = "left";
    ctx.fillText(fmtN(tMin + ((tMax - tMin) * i) / 5), gx + gw + pt(3), yy);
  }
  const bw = gw / 12;
  ctx.fillStyle = "#4a90c8";
  nm.prec.forEach((v, i) => { const bh = (v / pMax) * gh; ctx.fillRect(gx + i * bw + bw * 0.15, gy + gh - bh, bw * 0.7, bh); });
  ctx.strokeStyle = "#d7301f"; ctx.lineWidth = pt(2); ctx.beginPath();
  nm.temp.forEach((v, i) => {
    const xx = gx + i * bw + bw / 2, yy = gy + gh - ((v - tMin) / (tMax - tMin)) * gh;
    i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
  });
  ctx.stroke();
  ctx.fillStyle = "#d7301f";
  nm.temp.forEach((v, i) => {
    ctx.beginPath(); ctx.arc(gx + i * bw + bw / 2, gy + gh - ((v - tMin) / (tMax - tMin)) * gh, pt(2.2), 0, 2 * Math.PI); ctx.fill();
  });
  ctx.fillStyle = "#444"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  MESES.forEach((m, i) => ctx.fillText(m, gx + i * bw + bw / 2, gy + gh + pt(3)));
  ctx.strokeStyle = "#888"; ctx.lineWidth = pt(0.8); ctx.strokeRect(gx, gy, gw, gh);
  ctx.font = `${pt(8)}px Arial, sans-serif`; ctx.textBaseline = "bottom";
  ctx.fillStyle = "#2f6d9e"; ctx.textAlign = "left"; ctx.fillText("mm", x + pt(2), y + h - pt(1));
  ctx.fillStyle = "#b52617"; ctx.textAlign = "right"; ctx.fillText("°C", x + w - pt(2), y + h - pt(1));
  ctx.restore();
}

function quadroClima(nm) {
  return {
    titulo: nm.ajustado ? "Climograma no ponto (ERA5 ajustado à normal CHELSA)" : "Climograma no ponto (ERA5, 1991–2020)",
    tipo: "climograma", dados: nm,
    rodape: `Média anual ${fmtN(nm.mediaT, 1)} °C; chuva ${fmtN(nm.totalP)} mm/ano`,
  };
}

/* ── definição dos temas ────────────────────────────────────────────── */

const ESRI_LC = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer";
const USO_CLASSES = [
  { v: 1, nome: "Água", cor: "#1a5bab" }, { v: 2, nome: "Vegetação arbórea (florestas)", cor: "#358221" },
  { v: 4, nome: "Vegetação alagável (mangue, várzea)", cor: "#87d19e" }, { v: 5, nome: "Agricultura", cor: "#ffdb5c" },
  { v: 7, nome: "Área construída (urbana)", cor: "#ed022a" }, { v: 8, nome: "Solo exposto", cor: "#ede9e4" },
  { v: 9, nome: "Neve ou gelo", cor: "#f2faff" }, { v: 10, nome: "Nuvens", cor: "#c8c8c8" },
  { v: 11, nome: "Campo, pastagem e vegetação baixa", cor: "#efcfa8" },
];
const DECLIV = [
  { lim: 3, nome: "0 a 3% – plano", cor: "#1a9850" }, { lim: 8, nome: "3 a 8% – suave ondulado", cor: "#91cf60" },
  { lim: 20, nome: "8 a 20% – ondulado", cor: "#fee08b" }, { lim: 45, nome: "20 a 45% – forte ondulado", cor: "#fc8d59" },
  { lim: 75, nome: "45 a 75% – montanhoso", cor: "#d73027" }, { lim: 1e9, nome: "Acima de 75% – escarpado", cor: "#7f0000" },
];
const HIPSO_RAMPA = ["#0a6e31", "#3d9a40", "#8cc63f", "#d9e46a", "#f6d860", "#e8a94a", "#c8763a", "#9c5a3c", "#7a4a3a", "#bfb3a8", "#f2f2f2"];
const GEO_ERA = {
  "Cenozóico": "#fde66b", "Mesozóico": "#7fd0c6", "Paleozóico": "#9ec48c", "Neoproterozóico": "#f9b45a",
  "Mesoproterozóico": "#f6a07a", "Paleoproterozóico": "#ef7f8c", "Neoarqueano": "#e47bb5", "Mesoarqueano": "#d86aa8",
  "Paleoarqueano": "#cc5a9c", "Eoarqueano": "#c04a90",
};
const BIOMA_COR = { "Amazônia": "#2d6a4f", "Caatinga": "#e9c46a", "Cerrado": "#c9a66b", "Mata Atlântica": "#7fb069",
                    "Pampa": "#b5e48c", "Pantanal": "#5fb3c9" };
const AOD = [
  { lim: 0.1, nome: "Até 0,10 – muito baixa", cor: "#fff7bc" }, { lim: 0.2, nome: "0,10 a 0,20 – baixa", cor: "#fee596" },
  { lim: 0.3, nome: "0,20 a 0,30 – moderada", cor: "#feb23f" }, { lim: 0.5, nome: "0,30 a 0,50 – alta", cor: "#f3801c" },
  { lim: 9, nome: "Acima de 0,50 – muito alta", cor: "#b64102" },
];
const OMS = [  // valores-guia anuais/curto prazo da OMS (2021), µg/m³
  { v: "pm2_5", nome: "MP2,5", anual: 5 }, { v: "pm10", nome: "MP10", anual: 15 },
  { v: "nitrogen_dioxide", nome: "NO₂", anual: 10 }, { v: "ozone", nome: "O₃", anual: null },
  { v: "sulphur_dioxide", nome: "SO₂", anual: null }, { v: "carbon_monoxide", nome: "CO", anual: null },
];

function mesGIBS() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 10);
}

const TEMAS = {
  uso: {
    nome: "Uso e cobertura do solo", titulo: "Uso e cobertura do solo no entorno do empreendimento", base: "claro", escala: 1500,
    fonte: "Esri / Impact Observatory – Sentinel-2 Land Cover 10 m (2024)", opacidade: 0.75,
    camadas() {
      return [new ol.layer.Image({
        className: "tema",
        source: new ol.source.ImageArcGISRest({
          url: ESRI_LC, crossOrigin: "anonymous", interpolate: false, ratio: 1,
          params: { renderingRule: JSON.stringify({ rasterFunction: "Cartographic Renderer for Visualization and Analysis" }),
                    time: `${Date.UTC(2024, 0, 1)},${Date.UTC(2024, 11, 31, 23, 59, 59)}`, FORMAT: "png32", interpolation: "RSP_NearestNeighbor" },
        }),
      })];
    },
    async legenda() { return legendaDaTela(USO_CLASSES.map((c) => ({ ...c, rotulo: c.nome }))); },
    async info(p) {
      const g = encodeURIComponent(JSON.stringify({ x: p[0], y: p[1], spatialReference: { wkid: 4326 } }));
      const regra = encodeURIComponent(JSON.stringify({ mosaicMethod: "esriMosaicAttribute", sortField: "Year", sortValue: "2024", where: "Year=2024" }));
      const r = await json(`${ESRI_LC}/identify?geometry=${g}&geometryType=esriGeometryPoint&returnGeometry=false` +
        `&returnCatalogItems=false&mosaicRule=${regra}&f=json`);
      const v = Number(r.value);
      const c = USO_CLASSES.find((x) => x.v === v);
      return c ? [["Cobertura no ponto", c.nome]] : [];
    },
  },

  hidrografia: {
    nome: "Hidrografia", titulo: "Hidrografia no entorno do empreendimento", base: "claro", escala: 1500, dinamico: true, vetorial: true,
    get fonte() {
      const f = temaEstado.fontesHidro || ["ANA"];
      return [f.includes("FBDS") && "FBDS – hidrografia em alta resolução, 1:25.000 (geo.fbds.org.br)",
              "ANA – Base Hidrográfica Ottocodificada (nomes, domínio e massas d'água, SNIRH)",
              f.includes("OSM") && "© colaboradores do OpenStreetMap (detalhes)"].filter(Boolean).join("; ");
    },
    opcoes: `<label class="check"><input type="checkbox" id="opOSM" checked> Completar com o OpenStreetMap onde não houver dados da FBDS</label>
             <label class="check"><input type="checkbox" id="opFaixa"> Mostrar faixas de referência para APP (30 m dos cursos d'água e 50 m das nascentes)</label>`,
    camadas() {
      const estilos = {};
      const faixa = new ol.layer.Vector({ className: "tema", source: new ol.source.Vector(), opacity: 0.45,
        style: new ol.style.Style({ fill: new ol.style.Fill({ color: "#f4a3a3" }) }) });
      faixa.set("papel", "faixa");
      const hidro = new ol.layer.Vector({
        className: "tema", source: new ol.source.Vector(), declutter: false,
        style: (f) => {
          const c = HIDRO_CLASSES.find((x) => x.classe === f.get("classe")) || HIDRO_CLASSES[1];
          const larg = c.classe.startsWith("ana_") && c.classe !== "ana_rotulo" ? f.get("larg") || c.larg : c.larg;
          const k = `${c.classe}|${larg}|${K}`;
          if (!estilos[k] && c.tipo === "ponto") {
            estilos[k] = new ol.style.Style({ image: new ol.style.Circle({ radius: 4 * K, fill: new ol.style.Fill({ color: c.fill }),
              stroke: new ol.style.Stroke({ color: "#fff", width: 1.4 * K }) }) });
          }
          if (!estilos[k]) {
            estilos[k] = new ol.style.Style({
              fill: c.tipo === "area" ? new ol.style.Fill({ color: c.fill }) : undefined,
              stroke: new ol.style.Stroke({ color: c.stroke, width: larg * K, lineDash: c.tracejado ? [6 * K, 4 * K] : undefined }),
            });
          }
          const nome = f.get("nome");
          if (!nome || c.tipo !== "linha" || mapa.getView().getResolution() > 25 * K) return estilos[k];
          return [estilos[k], new ol.style.Style({
            text: new ol.style.Text({ text: nome, placement: "line", font: `italic ${Math.round(11 * K)}px Arial`, repeat: 400 * K,
              fill: new ol.style.Fill({ color: "#1f4e79" }), stroke: new ol.style.Stroke({ color: "#fff", width: 3 * K }) }),
          })];
        },
      });
      hidro.set("papel", "hidro");
      return [faixa, hidro];
    },
    async atualizar(camadas) {
      const [faixa, hidro] = camadas;
      const bb = vistaBBox(0.1);
      const larguraKm = turf.distance([bb[0], bb[1]], [bb[2], bb[1]]);
      if (larguraKm > 60) { temaEstado.aviso = "Aproxime o mapa (menos de 60 km de largura) para carregar a hidrografia."; return; }
      const comOSM = $("opOSM")?.checked !== false, comFaixa = !!$("opFaixa")?.checked;
      const chave = `${comOSM}|${comFaixa}`;
      if (hidro.get("bbox") && contem(hidro.get("bbox"), bb) && hidro.get("chave") === chave) return;
      const fbds = await fbdsNaVista(bb).catch(() => ({ feats: [], cobre: false, municipios: [] }));
      const [trechos, massas, osm] = await Promise.all([
        arcgisGeo(ANA_BASE, 1, bb, "TDR_NM_COMPLETO,TDR_DS_DOMINIALIDADE,TDR_AR_MONTANTE", "TDR_DS_DOMINIALIDADE <> 'Linha de Costa'").catch(() => null),
        arcgisGeo(ANA_BASE, 3, bb, "ESP_NM_RESERVATORIO,ESP_TP_RESERVATORIO,ESP_DS_DOMINIO").catch(() => null),
        comOSM && !fbds.cobre && larguraKm <= 40 ? hidroOSM(bb).catch(() => null) : Promise.resolve([]),
      ]);
      if (!trechos && !massas && !osm && !fbds.feats.length) throw new Error("a FBDS, a ANA e o OpenStreetMap não responderam");
      const feats = [...fbds.feats];
      for (const f of trechos || []) {
        const p = f.properties, nome = (p.TDR_NM_COMPLETO || "").trim(), dom = p.TDR_DS_DOMINIALIDADE || "";
        const area = Number(p.TDR_AR_MONTANTE) || 0;
        const larg = area > 5000 ? 3.4 : area > 500 ? 2.6 : area > 50 ? 1.9 : 1.3;
        // onde há FBDS, a ANA entra só com o nome do rio (linha invisível com rótulo), para não duplicar o traçado
        const classe = fbds.cobre ? (nome ? "ana_rotulo" : null) : /federal/i.test(dom) ? "ana_fed" : nome ? "ana_est" : "ana_sn";
        if (!classe) continue;
        for (const g of turf.flatten(f).features) feats.push(turf.feature(g.geometry, { classe, nome, dominio: dom, area_km2: area, larg, fonte: "ANA" }));
      }
      if (fbds.cobre && massas) {
        // a FBDS não traz nomes: as lagoas e açudes recebem o nome da massa d'água da ANA que as cobre
        const nomeadas = massas.filter((m) => (m.properties.ESP_NM_RESERVATORIO || "").trim());
        for (const f of feats) {
          if (f.properties.classe !== "fbds_massa" && f.properties.classe !== "fbds_duplo") continue;
          let c; try { c = turf.pointOnFeature(f); } catch (e) { continue; }
          const m = nomeadas.find((x) => { try { return turf.booleanPointInPolygon(c, x); } catch (e) { return false; } });
          if (m) f.properties.nome = m.properties.ESP_NM_RESERVATORIO.trim();
        }
      }
      for (const f of fbds.cobre ? [] : massas || []) {
        const p = f.properties;
        for (const g of turf.flatten(f).features)
          feats.push(turf.feature(g.geometry, { classe: "ana_massa", nome: (p.ESP_NM_RESERVATORIO || "").trim(), dominio: p.ESP_DS_DOMINIO || "",
                                               tipo_reserv: p.ESP_TP_RESERVATORIO || "", fonte: "ANA" }));
      }
      feats.push(...(osm || []));
      temaEstado.fontesHidro = [fbds.feats.length && "FBDS", "ANA", (osm || []).length && "OSM"].filter(Boolean);
      temaEstado.fbdsMun = fbds.municipios;
      hidro.getSource().clear();
      hidro.getSource().addFeatures(feats.map((f) => fmtGeo.readFeature(f)));
      hidro.set("bbox", bb); hidro.set("chave", chave);
      // faixa marginal de referência (30 m) perto do empreendimento
      faixa.getSource().clear();
      if (comFaixa && estado.ponto) {
        const perto = turf.buffer(turf.point(estado.ponto), Math.max(1.5, larguraKm / 2), { units: "kilometers" });
        const bufs = [];
        for (const f of feats) {
          const cl = f.properties.classe;
          if (cl === "alagado" || cl === "mangue" || cl === "ana_rotulo") continue;
          try {
            if (!turf.booleanIntersects(f, perto)) continue;
            const b = turf.buffer(f, cl === "fbds_nasc" ? 50 : 30, { units: "meters", steps: 8 });
            if (b) bufs.push(b);
          } catch (e) { /* geometria inválida */ }
        }
        faixa.getSource().addFeatures(bufs.map((b) => fmtGeo.readFeature(b)));
      }
      temaEstado.vetor = turf.featureCollection(feats.map((f) => {
        const c = HIDRO_CLASSES.find((x) => x.classe === f.properties.classe);
        return turf.feature(f.geometry, { ...f.properties, rotulo: c.rotulo, cor: c.tipo === "linha" ? c.stroke : c.fill });
      }));
      for (const b of faixa.getSource().getFeatures())  // a faixa também vai para o pacote do QGIS
        temaEstado.vetor.features.unshift(turf.feature(fmtGeo.writeFeatureObject(b).geometry, { classe: "faixa30", rotulo: "Faixa de referência p/ APP (30 m; nascentes 50 m)", cor: "#f4a3a3" }));
      const falhas = [!trechos && "trechos da ANA", !massas && "massas d'água da ANA", comOSM && larguraKm <= 40 && !osm && "OpenStreetMap"].filter(Boolean);
      temaEstado.aviso = falhas.length ? `Sem resposta de: ${falhas.join(", ")}. O mapa mostra o que carregou; mova o mapa para tentar de novo.`
        : feats.length ? "" : "Nenhum curso ou corpo d'água mapeado neste enquadramento.";
    },
    async legenda(camadas) {
      const [faixa, hidro] = camadas;
      const presentes = new Set(hidro.getSource().getFeatures().map((f) => f.get("classe")));
      const it = HIDRO_CLASSES.filter((c) => presentes.has(c.classe) && !c.semLegenda)
        .map((c) => ({ tipo: c.tipo === "area" ? "area" : c.tipo === "ponto" ? "bola" : "linha", fill: c.fill, stroke: c.stroke, rotulo: c.rotulo, tracejado: c.tracejado }));
      if (faixa.getSource().getFeatures().length) it.push({ tipo: "area", fill: "rgba(244,163,163,0.55)", stroke: "#e07a7a", rotulo: "Faixa de referência p/ APP (30 m; nascentes 50 m)" });
      return it;
    },
    async info(p, camadas) {
      const hidro = camadas[1];
      const ref = estado.lote || turf.point(p);
      const daRef = estado.lote ? "do lote" : "do ponto";
      let rio = null, massa = null, qualquer = null, nasc = null;
      for (const f of hidro.getSource().getFeatures()) {
        const g = fmtGeo.writeFeatureObject(f);
        const d = distanciaM(ref, g);
        const pr = g.properties;
        if (pr.classe !== "ana_rotulo" && pr.classe !== "fbds_nasc" && (!qualquer || d < qualquer.d)) qualquer = { d, pr };
        if (pr.classe === "fbds_nasc") { if (!nasc || d < nasc.d) nasc = { d, pr }; continue; }
        if (pr.classe === "ana_massa" || pr.classe === "fbds_massa" || (pr.classe === "agua" && pr.nome)) { if (!massa || d < massa.d) massa = { d, pr }; }
        else if (pr.nome && /^(ana_fed|ana_est|ana_rotulo|rio|corrego)$/.test(pr.classe)) { if (!rio || d < rio.d) rio = { d, pr }; }
      }
      const m = (d) => (d < 1 ? "dentro ou junto" : `a cerca de ${fmtN(d < 1000 ? Math.round(d / 5) * 5 : Math.round(d / 50) * 50)} m`);
      const dom = (pr) => (pr.dominio && !/linha de costa/i.test(pr.dominio) ? ` (domínio ${pr.dominio.toLowerCase()})` : "");
      const linhas = [];
      if (rio) linhas.push(["Curso d'água mais próximo", `${rio.pr.nome}${dom(rio.pr)} – ${m(rio.d)} ${daRef}`]);
      if (massa) linhas.push(["Massa d'água mais próxima", `${massa.pr.nome || (massa.pr.natureza ? `sem nome, ${massa.pr.natureza}` : "sem nome")} – ${m(massa.d)} ${daRef}`]);
      if (nasc) linhas.push(["Nascente mais próxima (FBDS)", `${m(nasc.d)} ${daRef}`]);
      if (qualquer && (!rio || qualquer.d < rio.d - 1) && qualquer.d < 500) {
        const c = HIDRO_CLASSES.find((x) => x.classe === qualquer.pr.classe);
        linhas.push(["Drenagem mais próxima", `${qualquer.pr.nome || c.rotulo.replace(/\s*\(.*\)$/, "").toLowerCase()} – ${m(qualquer.d)} ${daRef}`]);
      }
      if (qualquer && qualquer.d < 30) linhas.push(["Atenção", `há drenagem a menos de 30 m ${daRef}: verificar APP (Lei 12.651/2012, art. 4º) em campo`]);
      if (nasc && nasc.d < 50) linhas.push(["Atenção", `há nascente a menos de 50 m ${daRef}: verificar APP (Lei 12.651/2012, art. 4º, IV)`]);
      if (temaEstado.fbdsMun && temaEstado.fbdsMun.length) linhas.push(["Base de detalhe", `FBDS 1:25.000 – ${temaEstado.fbdsMun.join(", ")}`]);
      try {
        const [rh, ob] = await Promise.all([arcgisPonto(ANA_BASE, 8, p, "RHI_NM"), arcgisPonto(ANA_BASE, 2, p, "ACH_CD,ACH_NU_NIVEL_OTTO")]);
        if (rh) linhas.push(["Região hidrográfica", titulo(rh.RHI_NM).replace(/^Região Hidrográfica\s*/i, "").replace(/^(do|da|de)\s+/i, "")]);
        if (ob) linhas.push(["Ottobacia (ANA)", `${ob.ACH_CD} (nível ${ob.ACH_NU_NIVEL_OTTO})`]);
      } catch (e) { /* informação opcional */ }
      return linhas;
    },
  },

  protegidas: {
    nome: "Áreas protegidas", titulo: "Áreas protegidas na região do empreendimento", base: "claro", escala: 25000, raio: true, dinamico: true, vetorial: true,
    fonte: "ICMBio – UCs federais e cavernas (CANIE), via INDE; UCs estaduais e municipais e terras indígenas: ANA/SNIRH (bases MMA e FUNAI)",
    opacidade: 0.6,
    camadas() {
      const estilos = {};
      return [new ol.layer.Vector({
        className: "tema", source: new ol.source.Vector(), declutter: true,
        style: (f) => {
          const c = PROT_CLASSES.find((x) => x.classe === f.get("classe"));
          const k = `${c.classe}|${K}`;
          if (!estilos[k]) {
            estilos[k] = c.tipo === "ponto"
              ? new ol.style.Style({ image: new ol.style.RegularShape({ points: 3, radius: 6 * K, fill: new ol.style.Fill({ color: c.fill }),
                  stroke: new ol.style.Stroke({ color: "#fff", width: 1.2 * K }) }) })
              : new ol.style.Style({ fill: new ol.style.Fill({ color: c.fill }), stroke: new ol.style.Stroke({ color: c.stroke, width: 1.6 * K }) });
          }
          if (c.tipo === "ponto" || mapa.getView().getResolution() > 120 * K) return estilos[k];
          return [estilos[k], new ol.style.Style({ text: new ol.style.Text({ text: f.get("nome"), font: `bold ${Math.round(10.5 * K)}px Arial`,
            overflow: false, fill: new ol.style.Fill({ color: c.stroke }), stroke: new ol.style.Stroke({ color: "#fff", width: 3 * K }) }) })];
        },
      })];
    },
    async atualizar(camadas) {
      const bb = vistaBBox(0.25);
      if (bb[2] - bb[0] > 6) { temaEstado.aviso = "Aproxime o mapa (menos de 6° de largura) para carregar as áreas protegidas."; return; }
      if (camadas[0].get("bbox") && contem(camadas[0].get("bbox"), bb)) return;
      const [ucf, ucs, tis, cav] = await Promise.all([
        wfsINDE("ICMBio:limiteucsfederais_a", bb).catch(() => null),
        arcgisGeo(ANA_BASE, 6, bb, "UNC_NM,UNC_CA,UNC_GP,UNC_DS_ESFERA,UNC_AA_CRIACAO", "UNC_DS_ESFERA <> 'Federal'").catch(() => null),
        arcgisGeo(ANA_BASE, 7, bb, "TIN_NM,TIN_DS_GRUPO_ETNICO,TIN_DS_SITUACAO_JURIDICA").catch(() => null),
        wfsINDE("ICMBio:canie_052026_p", bb).catch(() => null),
      ]);
      if (!ucf && !ucs && !tis && !cav) throw new Error("ICMBio e ANA não responderam");
      const feats = [];
      for (const f of ucf || []) {
        const p = f.properties;
        feats.push(turf.feature(f.geometry, { classe: p.grupouc === "PI" ? "uc_pi" : "uc_us", nome: titulo(p.nomeuc || ""), categoria: p.categoria_ || "",
          esfera: "Federal", ato: p.criacaoato || "", grupo: p.grupouc || "" }));
      }
      for (const f of ucs || []) {
        const p = f.properties;
        feats.push(turf.feature(f.geometry, { classe: p.UNC_GP === "PI" ? "uc_pi" : "uc_us", nome: titulo(p.UNC_NM || ""), categoria: p.UNC_CA || "",
          esfera: p.UNC_DS_ESFERA || "", ato: "", grupo: p.UNC_GP || "" }));
      }
      for (const f of tis || []) {
        const p = f.properties;
        feats.push(turf.feature(f.geometry, { classe: "ti", nome: `TI ${p.TIN_NM || ""}`.trim(), categoria: "Terra Indígena", esfera: p.TIN_DS_SITUACAO_JURIDICA || "" }));
      }
      for (const f of cav || []) {
        const p = f.properties;
        for (const g of turf.flatten(f).features) feats.push(turf.feature(g.geometry, { classe: "caverna", nome: p.nome || "Caverna", categoria: "Cavidade natural (CANIE)", esfera: p.municipio || "" }));
      }
      camadas[0].getSource().clear();
      camadas[0].getSource().addFeatures(feats.map((f) => fmtGeo.readFeature(f)));
      camadas[0].set("bbox", bb);
      temaEstado.vetor = turf.featureCollection(feats.map((f) => {
        const c = PROT_CLASSES.find((x) => x.classe === f.properties.classe);
        return turf.feature(f.geometry, { ...f.properties, rotulo: c.rotulo, cor: c.fill });
      }));
      const falhas = [!ucf && "UCs federais (ICMBio)", !ucs && "UCs estaduais/municipais (ANA)", !tis && "terras indígenas", !cav && "cavernas"].filter(Boolean);
      temaEstado.aviso = falhas.length ? `Sem resposta de: ${falhas.join(", ")}.` : feats.length ? "" : "Nenhuma área protegida ou caverna cadastrada neste enquadramento.";
    },
    async legenda(camadas) {
      const pres = new Set(camadas[0].getSource().getFeatures().map((f) => f.get("classe")));
      return PROT_CLASSES.filter((c) => pres.has(c.classe)).map((c) => ({ tipo: c.tipo === "ponto" ? "marca" : "area", fill: c.fill, stroke: c.stroke, rotulo: c.rotulo }));
    },
    async info(p, camadas) {
      const ref = estado.lote || turf.point(p);
      const daRef = estado.lote ? "do lote" : "do ponto";
      let uc = null, ti = null, cav = null;
      for (const f of camadas[0].getSource().getFeatures()) {
        const g = fmtGeo.writeFeatureObject(f), c = g.properties.classe;
        const d = distanciaM(ref, g);
        if (c === "caverna") { if (!cav || d < cav.d) cav = { d, pr: g.properties }; }
        else if (c === "ti") { if (!ti || d < ti.d) ti = { d, pr: g.properties }; }
        else if (!uc || d < uc.d) uc = { d, pr: g.properties };
      }
      const km = (d) => (d < 1 ? `${daRef.replace("do ", "o ")} está dentro` : d < 1000 ? `a ${fmtN(Math.round(d / 10) * 10)} m ${daRef}` : `a ${fmtN(d / 1000, 1)} km ${daRef}`);
      const l = [];
      if (uc) l.push(["UC mais próxima", `${uc.pr.nome} (${uc.pr.categoria}, ${uc.pr.esfera.toLowerCase()}) – ${km(uc.d)}`]);
      if (uc && uc.d <= 3000) l.push(["Atenção", "a menos de 3 km de UC: verificar zona de amortecimento e ciência do órgão gestor (Res. CONAMA 428/2010)"]);
      if (ti) l.push(["Terra indígena mais próxima", `${ti.pr.nome} – ${km(ti.d)}`]);
      if (cav) l.push(["Caverna mais próxima (CANIE)", `${cav.pr.nome} – ${km(cav.d)}`]);
      if (cav && cav.d <= 250) l.push(["Atenção", "caverna a menos de 250 m: área de influência provisória (Res. CONAMA 347/2004)"]);
      if (!l.length) l.push(["Áreas protegidas", "nenhuma no enquadramento atual"]);
      return l;
    },
  },

  saneamento: {
    nome: "Saneamento (água e esgoto)", titulo: "Prestadores de saneamento na região do empreendimento", base: "claro", escala: "uf", vetorial: true,
    fonte: "CASAL – Plano de Negócios 2024 e aditivo do Bloco B (29/08/2025); limites municipais: IBGE; ETEs e ETAs: OpenStreetMap",
    opacidade: 0.6,
    camadas() {
      const estilos = {};
      return [new ol.layer.Vector({
        className: "tema", source: new ol.source.Vector(), declutter: true,
        style: (f) => {
          const c = SAN_EMPRESAS[f.get("empresa")] || SAN_PONTOS[f.get("classe")];
          if (!c) return null;
          const ponto = !!SAN_PONTOS[f.get("classe")];
          const k = `${f.get("empresa") || f.get("classe")}|${K}`;
          if (!estilos[k]) estilos[k] = ponto
            ? new ol.style.Style({ image: f.get("classe") === "eta"
                ? new ol.style.Circle({ radius: 5.5 * K, fill: new ol.style.Fill({ color: c.fill }), stroke: new ol.style.Stroke({ color: "#fff", width: 1.4 * K }) })
                : new ol.style.RegularShape({ points: 3, radius: 7 * K, fill: new ol.style.Fill({ color: c.fill }), stroke: new ol.style.Stroke({ color: "#fff", width: 1.4 * K }) }) })
            : new ol.style.Style({ fill: new ol.style.Fill({ color: c.fill }), stroke: new ol.style.Stroke({ color: "#ffffff", width: 1 * K }) });
          const res = mapa.getView().getResolution() / K;
          if (ponto ? res > 60 : res > 400) return estilos[k];
          return [estilos[k], new ol.style.Style({ text: new ol.style.Text({
            text: ponto ? f.get("nome") || "" : f.get("nome"), font: `${ponto ? "" : "bold "}${Math.round((ponto ? 9.5 : 10) * K)}px Arial`,
            offsetY: ponto ? -12 * K : 0, overflow: false,
            fill: new ol.style.Fill({ color: ponto ? c.stroke : "#222" }), stroke: new ol.style.Stroke({ color: "#fff", width: 3 * K }) }) })];
        },
      })];
    },
    async atualizar(camadas) {
      const src = camadas[0].getSource();
      if (!src.getFeatures().some((f) => f.get("empresa"))) {
        const d = await dadosSaneamento();
        src.addFeatures(d.features.map((f) => {
          const g = d.grupos[f.properties.grupo];
          return fmtGeo.readFeature(turf.feature(f.geometry, { ...f.properties, empresa: g.empresa, modo: g.modo }));
        }));
      }
      // ETEs e ETAs do OpenStreetMap num raio de 15 km do ponto
      let pts = [];
      temaEstado.aviso = "";
      if (estado.ponto) {
        try { pts = await saneamentoOSM(estado.ponto); }
        catch (e) { temaEstado.aviso = "As ETEs e ETAs do OpenStreetMap não carregaram agora (Overpass sem resposta)."; }
      }
      src.getFeatures().filter((f) => f.get("classe")).forEach((f) => src.removeFeature(f));
      src.addFeatures(pts.map((f) => fmtGeo.readFeature(f)));
      const d = await dadosSaneamento();
      temaEstado.vetor = turf.featureCollection([
        ...d.features.map((f) => { const e = d.grupos[f.properties.grupo].empresa;
          return turf.feature(f.geometry, { nome: f.properties.nome, codigo: f.properties.codigo, empresa: e,
            modo: d.grupos[f.properties.grupo].modo, rotulo: e, cor: SAN_EMPRESAS[e].fill }); }),
        ...pts.map((f) => turf.feature(f.geometry, { ...f.properties, rotulo: SAN_PONTOS[f.properties.classe].rotulo, cor: SAN_PONTOS[f.properties.classe].fill })),
      ]);
      if (estado.ponto && estado.municipio && estado.municipio.uf !== "AL")
        temaEstado.aviso = "Os prestadores de saneamento estão cadastrados só para Alagoas por enquanto.";
    },
    async legenda(camadas) {
      const ext = mapa.getView().calculateExtent(mapa.getSize());
      const s = new Set();
      camadas[0].getSource().forEachFeatureIntersectingExtent(ext, (f) => { s.add(f.get("empresa") || f.get("classe")); });
      return [
        ...Object.entries(SAN_EMPRESAS).filter(([e]) => s.has(e)).map(([e, c]) => ({ tipo: "area", fill: c.fill, stroke: "#ffffff", rotulo: e })),
        ...Object.entries(SAN_PONTOS).filter(([k]) => s.has(k)).map(([k, c]) => ({ tipo: k === "eta" ? "bola" : "marca", fill: c.fill, stroke: c.stroke, rotulo: c.rotulo })),
      ];
    },
    async info(p, camadas) {
      const d = await dadosSaneamento();
      const pt = turf.point(p);
      const m = d.features.find((f) => turf.booleanPointInPolygon(pt, f))
        || (estado.municipio && d.features.find((f) => f.properties.codigo === String(estado.municipio.feature.properties.codarea)));
      const l = [];
      if (m) {
        const g = d.grupos[m.properties.grupo];
        l.push(["Prestador em " + m.properties.nome, g.empresa]);
        l.push(["Como funciona", g.modo]);
        if (SAN_AGRESTE.has(m.properties.nome)) l.push(["Água tratada", "Sistema Coletivo do Agreste (PPP CASAL/Agreste Saneamento)"]);
      } else l.push(["Prestador", "sem cadastro para este local (só Alagoas por enquanto)"]);
      const ref = estado.lote || pt, daRef = estado.lote ? "da ADA" : "do ponto";
      const perto = (cl) => {
        let b = null;
        for (const f of camadas[0].getSource().getFeatures()) {
          if (f.get("classe") !== cl) continue;
          const g = fmtGeo.writeFeatureObject(f), dist = distanciaM(ref, g);
          if (!b || dist < b.d) b = { d: dist, p: g.properties };
        }
        return b;
      };
      const km = (x) => (x < 1000 ? `${fmtN(Math.round(x / 10) * 10)} m` : `${fmtN(x / 1000, 1)} km`);
      for (const cl of ["ete", "eta"]) {
        const b = perto(cl);
        const nome = cl === "ete" ? "ETE (esgoto) mais próxima" : "ETA (água) mais próxima";
        if (b) l.push([nome, `${b.p.nome || "sem nome"}${b.p.operador ? " – " + b.p.operador : ""}, a ${km(b.d)} ${daRef}`]);
        else if (estado.ponto && !temaEstado.aviso) l.push([nome, "nenhuma mapeada no OpenStreetMap num raio de 15 km"]);
      }
      return l;
    },
  },

  prioritarias: {
    nome: "Áreas prioritárias para conservação", titulo: "Áreas prioritárias para a conservação da biodiversidade na região do empreendimento",
    base: "claro", escala: 30000, raio: true, dinamico: true, vetorial: true, opacidade: 0.75,
    fonte: "MMA – Áreas Prioritárias para a Conservação da Biodiversidade, 2ª atualização (Portaria MMA nº 463/2018), via INDE/ICMBio",
    camadas() {
      return [new ol.layer.Vector({ className: "tema", source: new ol.source.Vector(), declutter: true,
        style: estiloClasses(PRIOR_CLASSES, (f) => (mapa.getView().getResolution() / K < 150 ? f.get("nome") : "")) })];
    },
    async atualizar(camadas) {
      const bb = vistaBBox(0.25);
      if (bb[2] - bb[0] > 8) { temaEstado.aviso = "Aproxime o mapa (menos de 8° de largura) para carregar as áreas prioritárias."; return; }
      if (camadas[0].get("bbox") && contem(camadas[0].get("bbox"), bb)) return;
      const res = await Promise.all(Object.keys(PRIOR_BIOMAS).map((c) => wfsINDE(`ICMBio:${c}`, bb).then((fs) => ({ c, fs })).catch(() => null)));
      if (res.every((r) => !r)) throw new Error("o INDE/ICMBio não respondeu");
      const feats = [];
      for (const r of res.filter(Boolean)) for (const f of r.fs) {
        const p = f.properties, prio = campoQue(p, /^prio/i), imp = campoQue(p, /^imp/i);
        const classe = /extrem/i.test(prio) ? "pr_ea" : /muito/i.test(prio) ? "pr_ma" : "pr_a";
        feats.push(turf.feature(f.geometry, { classe, nome: (p.nome_area || p.nome_ap || "").trim(), codigo: p.cod_area || p.id_ap || "",
          bioma: PRIOR_BIOMAS[r.c], importancia: imp, prioridade: prio, acao: (p.acao_princ || p.nomeacao || p.acaoprinc || "").trim() }));
      }
      const src = camadas[0].getSource();
      src.clear();
      src.addFeatures(feats.map((f) => fmtGeo.readFeature(f)));
      camadas[0].set("bbox", bb);
      temaEstado.vetor = vetorQGIS(PRIOR_CLASSES, feats);
      temaEstado.aviso = feats.length ? "" : "Nenhuma área prioritária para conservação neste enquadramento.";
    },
    async legenda(camadas) { return legendaClasses(PRIOR_CLASSES, camadas[0]); },
    async info(p, camadas) {
      const ref = estado.lote || turf.point(p), daRef = estado.lote ? "da ADA" : "do ponto";
      let b = null;
      for (const f of camadas[0].getSource().getFeatures()) {
        const g = fmtGeo.writeFeatureObject(f), d = distanciaM(ref, g);
        if (!b || d < b.d) b = { d, p: g.properties };
      }
      if (!b) return [["Áreas prioritárias", "nenhuma no enquadramento atual"]];
      const nome = `${b.p.nome || "sem nome"}${b.p.codigo ? ` (${b.p.codigo})` : ""} – ${b.p.bioma}`;
      const l = b.d < 1 ? [["Área prioritária no local", nome]] : [["Área prioritária mais próxima", `${nome}, a ${textoDist(b.d)} ${daRef}`]];
      if (b.p.importancia) l.push(["Importância biológica", b.p.importancia]);
      if (b.p.prioridade) l.push(["Prioridade de ação", b.p.prioridade]);
      if (b.p.acao) l.push(["Ação indicada pelo MMA", b.p.acao]);
      return l;
    },
  },

  car: {
    nome: "Imóveis rurais (CAR)", titulo: "Imóveis do Cadastro Ambiental Rural no entorno do empreendimento",
    base: "satelite", escala: 2500, raio: true, dinamico: true, vetorial: true, opacidade: 1,
    fonte: "SFB/MGI – Sistema Nacional de Cadastro Ambiental Rural (SICAR), base pública de imóveis",
    camadas() {
      return [new ol.layer.Vector({ className: "tema", source: new ol.source.Vector(), style: estiloClasses(CAR_CLASSES) })];
    },
    async atualizar(camadas) {
      const bb = vistaBBox(0.1);
      if (bb[2] - bb[0] > 0.3) { temaEstado.aviso = "Aproxime o mapa (até uns 30 km de largura) para carregar os imóveis do CAR."; return; }
      const uf = (estado.municipio?.uf || "").toLowerCase();
      if (!uf) { temaEstado.aviso = "Marque o ponto para saber o estado e carregar o CAR."; return; }
      const chave = `${uf}|${estado.ponto}|${estado.lote ? turf.area(estado.lote) : 0}`;
      if (camadas[0].get("bbox") && contem(camadas[0].get("bbox"), bb) && camadas[0].get("chave") === chave) return;
      const u = "https://geoserver.car.gov.br/geoserver/sicar/wfs?" + new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature",
        typeNames: `sicar:sicar_imoveis_${uf}`, outputFormat: "application/json", srsName: "EPSG:4326", count: "3000",
        bbox: `${bb[1]},${bb[0]},${bb[3]},${bb[2]},urn:ogc:def:crs:EPSG::4326` });
      const r = await jsonTempo(u, 45000);
      const ref = estado.lote || (estado.ponto && turf.point(estado.ponto));
      const feats = (r.features || []).filter((f) => f.geometry).map((f) => {
        const p = f.properties;
        let toca = false;
        try { toca = !!ref && turf.booleanIntersects(ref, f); } catch (e) { /* geometria inválida */ }
        const classe = toca ? "car_local" : p.tipo_imovel === "AST" ? "car_ast" : p.tipo_imovel === "PCT" ? "car_pct" : "car_iru";
        return turf.feature(f.geometry, { classe, codigo: p.cod_imovel || "", area_ha: Number(p.area) || 0, modulos: Number(p.m_fiscal) || 0,
          situacao: CAR_STATUS[p.status_imovel] || p.status_imovel || "", condicao: p.condicao || "", tipo: p.tipo_imovel || "", municipio: p.municipio || "" });
      }).sort((a, b) => (a.properties.classe === "car_local") - (b.properties.classe === "car_local"));
      const src = camadas[0].getSource();
      src.clear();
      src.addFeatures(feats.map((f) => fmtGeo.readFeature(f)));
      camadas[0].set("bbox", bb); camadas[0].set("chave", chave);
      temaEstado.vetor = vetorQGIS(CAR_CLASSES, feats);
      temaEstado.aviso = feats.length >= 3000 ? "Muitos imóveis neste enquadramento: aproxime o mapa para ver todos." : "";
    },
    async legenda(camadas) { return legendaClasses(CAR_CLASSES, camadas[0]); },
    async info(p, camadas) {
      const fs = camadas[0].getSource().getFeatures().map((f) => f.getProperties());
      const loc = fs.filter((f) => f.classe === "car_local");
      const l = [["Imóveis do CAR no enquadramento", fmtN(fs.length)]];
      if (!loc.length) l.push([estado.lote ? "Imóvel que contém a ADA" : "Imóvel que contém o ponto", "nenhum cadastrado no CAR (em área urbana isso é o esperado)"]);
      for (const f of loc.slice(0, 3)) {
        l.push([`Imóvel no local (${f.tipo || "CAR"})`, `${f.codigo} – ${fmtN(f.area_ha, 2)} ha (${fmtN(f.modulos, 2)} módulo fiscal), situação ${f.situacao}`]);
        if (f.condicao) l.push(["Condição do cadastro", f.condicao]);
      }
      if (loc.length > 3) l.push(["Outros imóveis no local", `mais ${loc.length - 3}`]);
      return l;
    },
  },

  acesso: {
    nome: "Acesso ao empreendimento", titulo: "Mapa de acesso ao empreendimento", base: "osm", escala: 4000, raio: true, vetorial: true, opacidade: 1,
    fonte: "Rota: OSRM sobre o OpenStreetMap; localização da sede/capital: Nominatim (OpenStreetMap)",
    opcoes: '<label>Partindo de<select id="opAcesso"><option value="sede">sede do município</option><option value="capital">capital do estado</option></select></label>',
    camadas() {
      return [new ol.layer.Vector({ className: "tema", source: new ol.source.Vector(), declutter: true,
        style: estiloClasses(ACESSO_CLASSES, (f) => (f.get("classe") === "origem" ? f.get("nome") : "")) })];
    },
    async atualizar(camadas) {
      if (!estado.ponto || !estado.municipio) { temaEstado.aviso = "Marque o ponto para traçar o acesso."; return; }
      const op = $("opAcesso")?.value || "sede", uf = estado.municipio.uf;
      const chave = `${op}|${estado.ponto}`;
      if (camadas[0].get("chave") === chave) return;
      const lugar = op === "capital" ? CAPITAIS[uf] : estado.municipio.nome;
      const geo = await json(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(`${lugar}, ${uf}, Brasil`)}`);
      if (!geo.length) throw new Error(`não achei ${lugar}/${uf} no OpenStreetMap`);
      const o = [Number(geo[0].lon), Number(geo[0].lat)];
      const r = await jsonTempo(`https://router.project-osrm.org/route/v1/driving/${o[0]},${o[1]};${estado.ponto[0]},${estado.ponto[1]}?overview=full&geometries=geojson&steps=true`, 30000);
      if (r.code !== "Ok" || !r.routes?.length) throw new Error("o roteador (OSRM) não achou caminho");
      const rota = r.routes[0];
      const vias = {};
      for (const s of rota.legs[0].steps) {
        const n = s.ref ? s.ref.replace(/;/g, "/") + (s.name ? ` (${s.name})` : "") : s.name;
        if (n) vias[n] = (vias[n] || 0) + s.distance;
      }
      const principais = Object.entries(vias).filter(([, d]) => d > 200).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
      const nomeOrigem = `${lugar}/${uf}`;
      const rotRota = `Rota de acesso a partir de ${nomeOrigem}`, rotOrigem = `${nomeOrigem} – ponto de partida`;
      const feats = [turf.feature(rota.geometry, { classe: "rota", nome: "", rotulo: rotRota, cor: ACESSO_CLASSES[0].stroke }),
                     turf.point(o, { classe: "origem", nome: lugar, rotulo: rotOrigem, cor: ACESSO_CLASSES[1].fill })];
      const src = camadas[0].getSource();
      src.clear();
      src.addFeatures(feats.map((f) => fmtGeo.readFeature(f)));
      camadas[0].set("chave", chave);
      camadas[0].set("dados", { nomeOrigem, op, km: rota.distance / 1000, min: rota.duration / 60, principais, reta: turf.distance(turf.point(o), turf.point(estado.ponto)),
                                 legenda: [{ tipo: "linha", stroke: ACESSO_CLASSES[0].stroke, rotulo: rotRota }, { tipo: "bola", fill: ACESSO_CLASSES[1].fill, stroke: "#fff", rotulo: rotOrigem }] });
      temaEstado.vetor = turf.featureCollection(feats);
      temaEstado.aviso = "";
      const ext = ol.extent.buffer(src.getExtent(), 0);
      ol.extent.extend(ext, ol.extent.boundingExtent([ol.proj.fromLonLat(estado.ponto)]));
      mapa.getView().fit(ext, { padding: [60, 60, 60, 60], maxZoom: 17 });
    },
    async legenda(camadas) { return camadas[0].get("dados")?.legenda || []; },
    async info(p, camadas) {
      const d = camadas[0].get("dados");
      if (!d) return [];
      const l = [["Ponto de partida", `${d.nomeOrigem} (${d.op === "capital" ? "capital do estado" : "sede do município"})`],
                 ["Percurso de carro", `${fmtN(d.km, 1)} km, cerca de ${d.min < 90 ? fmtN(Math.round(d.min)) + " min" : fmtN(d.min / 60, 1) + " h"}`],
                 ["Distância em linha reta", `${fmtN(d.reta, 1)} km`]];
      if (d.principais.length) l.push(["Principais vias", d.principais.join("; ")]);
      return l;
    },
  },

  entorno: {
    nome: "Entorno e receptores sensíveis", titulo: "Equipamentos sociais e receptores sensíveis no entorno do empreendimento",
    base: "osm", raio: true, vetorial: true, opacidade: 1,
    get escala() { return Number(document.getElementById("opRaioEntorno")?.value || 500) * 1.15; },
    fonte: "OpenStreetMap (escolas, creches, unidades de saúde, templos e assistência social), via Overpass",
    opcoes: '<label>Raio de análise<select id="opRaioEntorno"><option value="250">250 m</option><option value="500" selected>500 m</option><option value="1000">1 km</option><option value="2000">2 km</option></select></label>',
    camadas() {
      return [new ol.layer.Vector({ className: "tema", source: new ol.source.Vector(), declutter: true,
        style: estiloClasses(ENTORNO_CLASSES, (f) => (f.get("classe") !== "raio" && mapa.getView().getResolution() / K < 3 ? f.get("nome") : "")) })];
    },
    async atualizar(camadas) {
      if (!estado.ponto) { temaEstado.aviso = "Marque o ponto para buscar o entorno."; return; }
      const R = Number($("opRaioEntorno")?.value || 500), [lon, lat] = estado.ponto;
      const chave = `${R}|${estado.ponto}|${estado.lote ? turf.area(estado.lote) : 0}`;
      if (camadas[0].get("chave") === chave) return;
      const q = `[out:json][timeout:40];(nwr["amenity"~"^(school|kindergarten|college|university|hospital|clinic|doctors|dentist|place_of_worship|social_facility|nursing_home|community_centre)$"](around:${R + 100},${lat},${lon});` +
                `nwr["healthcare"~"^(hospital|clinic|centre|doctor)$"](around:${R + 100},${lat},${lon}););out center tags;`;
      const r = await overpass(q);
      const centro = turf.point(estado.ponto), ref = estado.lote || centro;
      const vistos = new Set(), feats = [];
      for (const el of r.elements) {
        const c = el.type === "node" ? [el.lon, el.lat] : el.center ? [el.center.lon, el.center.lat] : null;
        if (!c) continue;
        const tg = el.tags || {}, a = tg.amenity || "";
        const classe = /school|kindergarten|college|university/.test(a) ? "educacao" : a === "place_of_worship" ? "culto"
          : /social_facility|nursing_home|community_centre/.test(a) ? "assistencia" : "saude";
        const pt = turf.point(c);
        if (turf.distance(centro, pt, { units: "meters" }) > R) continue;
        const k = `${classe}|${tg.name || ""}|${c[0].toFixed(4)},${c[1].toFixed(4)}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        feats.push(turf.point(c, { classe, nome: tg.name || "", tipo: TIPO_OSM[a] || TIPO_OSM[tg.healthcare] || "", dist_m: Math.round(distanciaM(ref, pt)), osm: `${el.type}/${el.id}` }));
      }
      const anel = turf.polygonToLine(turf.circle(centro, R / 1000, { steps: 128, units: "kilometers" }));
      const raio = turf.feature(anel.geometry, { classe: "raio", nome: "" });
      const todos = [raio, ...feats];
      const src = camadas[0].getSource();
      src.clear();
      src.addFeatures(todos.map((f) => fmtGeo.readFeature(f)));
      camadas[0].set("chave", chave);
      camadas[0].set("raio", R);
      const cl = ENTORNO_CLASSES.map((c) => (c.classe === "raio" ? { ...c, rotulo: `Raio de análise – ${textoDist(R)}` } : c));
      camadas[0].set("classes", cl);
      temaEstado.vetor = vetorQGIS(cl, todos);
      temaEstado.aviso = "";
      mapa.getView().fit(fmtGeo.readFeature(raio).getGeometry().getExtent(), { padding: [40, 40, 40, 40], maxZoom: 18 });
    },
    async legenda(camadas) { return legendaClasses(camadas[0].get("classes") || ENTORNO_CLASSES, camadas[0]); },
    async info(p, camadas) {
      const R = camadas[0].get("raio");
      if (!R) return [];
      const fs = camadas[0].getSource().getFeatures().map((f) => f.getProperties()).filter((f) => f.classe !== "raio");
      const daRef = estado.lote ? "da ADA" : "do ponto";
      const l = [];
      for (const c of ENTORNO_CLASSES.filter((x) => x.classe !== "raio")) {
        const g = fs.filter((f) => f.classe === c.classe).sort((a, b) => a.dist_m - b.dist_m);
        if (!g.length) { l.push([c.curto, `nenhum mapeado em ${textoDist(R)}`]); continue; }
        l.push([c.curto, `${g.length} em ${textoDist(R)}; o mais perto: ${g[0].nome || g[0].tipo || "sem nome"}, a ${textoDist(g[0].dist_m)} ${daRef}`]);
      }
      const perto = fs.filter((f) => f.dist_m <= 100 && f.classe !== "culto").length + fs.filter((f) => f.dist_m <= 100 && f.classe === "culto").length;
      if (perto) l.push(["Atenção", `${perto} receptor(es) sensível(is) a até 100 m: considerar ruído, poeira, odor e tráfego no estudo`]);
      l.push(["Observação", "levantamento do OpenStreetMap: confirmar em campo, pois pode haver equipamentos não mapeados"]);
      return l;
    },
  },

  relevo: {
    nome: "Hipsometria (relevo)", titulo: "Hipsometria do entorno do empreendimento", base: "claro", escala: 6000, dinamico: true,
    fonte: "Mapzen Terrain Tiles (SRTM/NASA, ~30 m) e Esri World Hillshade; altitude no ponto: Copernicus DEM (Open-Meteo)",
    opacidade: 0.85,
    camadas() {
      const terr = new ol.source.XYZ({ url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
                                      maxZoom: 15, crossOrigin: "anonymous", interpolate: false });
      const ras = new ol.source.Raster({ sources: [terr], operationType: "image", threads: 0, operation: opHipsometria });
      ras.on("afteroperations", agendarLegenda);
      ras.on("beforeoperations", (e) => { e.data.quebras = temaEstado.quebras || [0, 100, 200, 400, 800]; e.data.cores = temaEstado.coresHipso || HIPSO_RAMPA; });
      return [
        new ol.layer.Image({ className: "tema", source: ras }),
        new ol.layer.Tile({ className: "tema-sombra", opacity: 0.35, source: new ol.source.XYZ({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
          crossOrigin: "anonymous", maxZoom: 16 }) }),
      ];
    },
    async atualizar(camadas) {
      const bb = vistaBBox(0);
      const lats = [], lons = [];
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
        lats.push((bb[1] + ((bb[3] - bb[1]) * (i + 0.5)) / 10).toFixed(5));
        lons.push((bb[0] + ((bb[2] - bb[0]) * (j + 0.5)) / 10).toFixed(5));
      }
      const r = await json(`https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lons.join(",")}`);
      const el = r.elevation.filter((v) => v != null && v > -50);
      if (!el.length) return;
      let mn = Math.max(0, Math.min(...el)), mx = Math.max(...el);
      mn = Math.max(0, mn - (mx - mn) * 0.15); mx = mx + (mx - mn) * 0.15 + 1;
      const passos = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
      const passo = passos.find((p) => (mx - mn) / p <= 9) || 1000;
      const ini = Math.floor(mn / passo) * passo;
      const q = [];
      for (let v = ini; v <= mx + passo; v += passo) q.push(v);
      const n = q.length - 1;
      temaEstado.quebras = q;
      temaEstado.coresHipso = Array.from({ length: n }, (_, i) => HIPSO_RAMPA[Math.round((i * (HIPSO_RAMPA.length - 2)) / Math.max(1, n - 1))]);
      camadas[0].getSource().changed();
    },
    async legenda() {
      const q = temaEstado.quebras || [], c = temaEstado.coresHipso || [];
      return legendaRaster("relevo", c.map((cor, i) => ({ cor, rotulo: `${fmtN(q[i])} a ${fmtN(q[i + 1])} m` })), 0.001);
    },
    async info(p) {
      const r = await json(`https://api.open-meteo.com/v1/elevation?latitude=${p[1]}&longitude=${p[0]}`);
      const linhas = [["Altitude no ponto", `cerca de ${fmtN(r.elevation[0])} m`]];
      if (temaEstado.quebras) linhas.push(["Faixa no mapa", `${fmtN(temaEstado.quebras[0])} a ${fmtN(temaEstado.quebras.at(-1))} m`]);
      return linhas;
    },
  },

  declividade: {
    nome: "Declividade", titulo: "Declividade do terreno no entorno do empreendimento", base: "claro", escala: 2500,
    fonte: "Mapzen Terrain Tiles (SRTM/NASA, ~30 m); classes de relevo: Embrapa (1979)", opacidade: 0.8,
    camadas() {
      const terr = new ol.source.XYZ({ url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
                                      maxZoom: 15, crossOrigin: "anonymous", interpolate: false });
      const ras = new ol.source.Raster({ sources: [terr], operationType: "image", threads: 0, operation: opDeclividade });
      ras.on("afteroperations", agendarLegenda);
      ras.on("beforeoperations", (e) => {
        const c = ol.extent.getCenter(e.extent);
        const lat = ol.proj.toLonLat(c)[1];
        e.data.res = e.resolution * Math.cos((lat * Math.PI) / 180);    // metros por pixel no terreno
        e.data.resFonte = RES_Z(15) * Math.cos((lat * Math.PI) / 180) / e.resolution;  // pixels por célula da fonte
        e.data.lims = DECLIV.map((d) => d.lim);
        e.data.cores = DECLIV.map((d) => d.cor);
      });
      return [new ol.layer.Image({ className: "tema", source: ras })];
    },
    async legenda() { return legendaRaster("declividade", DECLIV.map((d) => ({ cor: d.cor, rotulo: d.nome }))); },
    async info(p) {
      const dg = 60 / 111320, dl = dg / Math.cos((p[1] * Math.PI) / 180);
      const pts = [[0, 0], [dl, 0], [-dl, 0], [0, dg], [0, -dg]].map(([a, b]) => [p[0] + a, p[1] + b]);
      const r = await json(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map((x) => x[1].toFixed(6)).join(",")}` +
                           `&longitude=${pts.map((x) => x[0].toFixed(6)).join(",")}`);
      const [, e, w, n, s] = r.elevation;
      const pct = (Math.hypot((e - w) / 120, (n - s) / 120)) * 100;
      const c = DECLIV.find((d) => pct < d.lim);
      return [["Declividade no ponto", `cerca de ${fmtN(pct, 1)}% (${c.nome.split("– ")[1]})`]];
    },
  },

  solos: {
    nome: "Solos (pedologia)", titulo: "Pedologia (classes de solo) da região do empreendimento", base: "claro", escala: 12000, dinamico: true,
    fonte: "IBGE – BDiA, Pedologia 1:250.000 (SiBCS), rasterizada a ~110 m", opacidade: 0.75,
    camadas() { return []; },
    async atualizar() {
      const d = await dadosSolos();
      const bb = vistaBBox(0.2);
      for (const [o, s] of d.blocos) {
        if (o > bb[2] || o + d.passo < bb[0] || s > bb[3] || s + d.passo < bb[1]) continue;
        const nome = `${o}_${s}`;
        if (grupoTema.getLayers().getArray().some((l) => l.get("bloco") === nome)) continue;
        const l = camadaPNG(`dados/solos/${nome}.png`, [o, s, o + d.passo, s + d.passo]);
        l.set("bloco", nome);
        l.setOpacity(Number($("opacidade").value) / 100);
        grupoTema.getLayers().push(l);
      }
    },
    async legenda() {
      const d = await dadosSolos();
      const bb = vistaBBox(0), cont = new Map();
      for (const [o, s] of d.blocos) {
        if (o > bb[2] || o + d.passo < bb[0] || s > bb[3] || s + d.passo < bb[1]) continue;
        contarCores(await amostrarImg(`dados/solos/${o}_${s}.png`, [o, s, o + d.passo, s + d.passo], bb), cont);
      }
      return classesPresentes(cont, d.classes).map((c) => ({ tipo: "area", fill: c.cor, stroke: "#777", rotulo: tituloSolo(c.nome) }));
    },
    async info(p) {
      const d = await dadosSolos();
      const o = Math.floor(p[0] / d.passo) * d.passo, s = Math.floor(p[1] / d.passo) * d.passo;
      if (!d.blocos.some(([a, b]) => a === o && b === s)) return [];
      const cor = await corNoPonto(`dados/solos/${o}_${s}.png`, [o, s, o + d.passo, s + d.passo], p);
      const c = d.classes.find((x) => x.cor.toLowerCase() === cor);
      return c ? [["Solo no ponto", tituloSolo(c.nome)]] : [];
    },
  },

  geologia: {
    nome: "Geologia", titulo: "Geologia da região do empreendimento", base: "claro", escala: 15000, dinamico: true,
    fonte: "Serviço Geológico do Brasil (SGB/CPRM) – Litoestratigrafia 1:1.000.000 (GeoSGB)", opacidade: 0.7, vetorial: true,
    camadas() {
      const estilos = {};
      return [new ol.layer.Vector({
        className: "tema", source: new ol.source.Vector(), declutter: true,
        style: (f) => {
          const k = `${f.get("cor")}|${f.get("sigla")}|${K}`;
          if (!estilos[k]) estilos[k] = new ol.style.Style({
            fill: new ol.style.Fill({ color: f.get("cor") }),
            stroke: new ol.style.Stroke({ color: "#6b6b6b", width: 0.6 * K }),
            text: new ol.style.Text({ text: f.get("sigla") || "", font: `bold ${Math.round(11 * K)}px Arial`, overflow: false,
              fill: new ol.style.Fill({ color: "#222" }), stroke: new ol.style.Stroke({ color: "rgba(255,255,255,0.8)", width: 2.5 * K }) }),
          });
          return estilos[k];
        },
      })];
    },
    async atualizar(camadas) {
      const bb = vistaBBox(0.15);
      if (bb[2] - bb[0] > 4) { temaEstado.aviso = "Aproxime o mapa (menos de 4° de largura) para carregar a geologia."; return; }
      if (camadas[0].get("bbox") && contem(camadas[0].get("bbox"), bb)) return;
      const url = "https://geoservicos.sgb.gov.br/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature" +
        "&typeNames=geosgb:litoestratigrafia_1m&outputFormat=application/json&srsName=EPSG:4326&count=4000" +
        `&bbox=${bb[1]},${bb[0]},${bb[3]},${bb[2]},urn:ogc:def:crs:EPSG::4326`;
      const r = await json(url);
      const cores = {};
      const porEra = {};
      const feats = r.features.filter((f) => f.geometry).map((f) => {
        const pr = f.properties;
        const sig = pr.sigla || "?";
        if (!cores[sig]) {
          const era = pr.era_max || pr.era_min || "";
          const baseCor = GEO_ERA[era] || "#d9d9d9";
          porEra[era] = (porEra[era] || 0) + 1;
          cores[sig] = variarCor(baseCor, porEra[era] - 1);
        }
        return turf.feature(f.geometry, { sigla: sig, nome: pr.nome || "", era: pr.era_max || "", litotipos: pr.litotipos || "",
                                          idade: Number(pr.idade_max) || 0, cor: cores[sig] });
      });
      const src = camadas[0].getSource();
      src.clear();
      src.addFeatures(feats.map((f) => fmtGeo.readFeature(f)));
      camadas[0].set("bbox", bb);
      temaEstado.vetor = turf.featureCollection(feats.map((f) => turf.feature(f.geometry, { ...f.properties, rotulo: `${f.properties.sigla} – ${f.properties.nome}` })));
      temaEstado.aviso = feats.length ? "" : "O SGB não retornou unidades geológicas para este enquadramento.";
    },
    async legenda(camadas) {
      const ext = mapa.getView().calculateExtent(mapa.getSize());
      const vistos = new Map();
      camadas[0].getSource().forEachFeatureIntersectingExtent(ext, (f) => {
        if (!vistos.has(f.get("sigla"))) vistos.set(f.get("sigla"), f);
      });
      return [...vistos.values()].sort((a, b) => a.get("idade") - b.get("idade"))
        .map((f) => ({ tipo: "area", fill: f.get("cor"), stroke: "#6b6b6b", rotulo: `${f.get("sigla")} – ${f.get("nome")}` }));
    },
    async info(p, camadas) {
      const px = ol.proj.fromLonLat(p);
      const f = camadas[0].getSource().getFeaturesAtCoordinate(px)[0];
      if (!f) return [];
      const l = [["Unidade geológica no ponto", `${f.get("sigla")} – ${f.get("nome")}${f.get("era") ? " (" + f.get("era") + ")" : ""}`]];
      if (f.get("litotipos")) l.push(["Litotipos", f.get("litotipos")]);
      return l;
    },
  },

  biomas: {
    nome: "Biomas", titulo: "Biomas na região do empreendimento", base: "claro", escala: "uf",
    fonte: "IBGE – Biomas e Sistema Costeiro-Marinho do Brasil 1:250.000 (2019), generalizado", opacidade: 0.65, vetorial: true,
    camadas() {
      return [new ol.layer.Vector({
        className: "tema", source: new ol.source.Vector(),
        style: (f) => new ol.style.Style({ fill: new ol.style.Fill({ color: BIOMA_COR[f.get("Bioma")] || "#ccc" }),
                                           stroke: new ol.style.Stroke({ color: "#555", width: 0.8 * K }) }),
      })];
    },
    async atualizar(camadas) {
      if (camadas[0].getSource().getFeatures().length) return;
      const d = await dadosBiomas();
      camadas[0].getSource().addFeatures(d.features.map((f) => fmtGeo.readFeature(f)));
      temaEstado.vetor = turf.featureCollection(d.features.map((f) => turf.feature(f.geometry, {
        Bioma: f.properties.Bioma, rotulo: f.properties.Bioma, cor: BIOMA_COR[f.properties.Bioma] || "#cccccc" })));
    },
    async legenda(camadas) {
      const ext = mapa.getView().calculateExtent(mapa.getSize());
      const s = new Set();
      camadas[0].getSource().forEachFeatureIntersectingExtent(ext, (f) => { s.add(f.get("Bioma")); });
      return Object.keys(BIOMA_COR).filter((b) => s.has(b)).map((b) => ({ tipo: "area", fill: BIOMA_COR[b], stroke: "#555", rotulo: b }));
    },
    async info(p) {
      const d = await dadosBiomas();
      const pt = turf.point(p);
      let f = d.features.find((x) => turf.booleanPointInPolygon(pt, x));
      if (!f) {  // ponto no litoral, fora do limite generalizado: bioma mais próximo (até 10 km)
        let dm = 10;
        for (const x of d.features) {
          const polis = x.geometry.type === "Polygon" ? [x.geometry.coordinates] : x.geometry.coordinates;
          for (const poli of polis) for (const anel of poli) {
            if (anel.length < 2) continue;
            const dist = turf.pointToLineDistance(pt, turf.lineString(anel), { units: "kilometers" });
            if (dist < dm) { dm = dist; f = x; }
          }
        }
      }
      return f ? [["Bioma no ponto", f.properties.Bioma]] : [];
    },
  },

  koppen: climaPNG("koppen", "Clima (classificação de Köppen)", "Classificação climática de Köppen-Geiger na região do empreendimento",
    (c) => `${c.sigla} – ${c.nome}`, "Clima no ponto (Köppen)"),
  precipitacao: climaPNG("precipitacao", "Precipitação média anual", "Precipitação média anual na região do empreendimento",
    (c) => c.nome, "Precipitação no ponto (CHELSA)"),
  temperatura: climaPNG("temperatura", "Temperatura média anual", "Temperatura média anual na região do empreendimento",
    (c) => c.nome, "Temperatura no ponto (CHELSA)"),

  ar: {
    nome: "Qualidade do ar", titulo: "Qualidade do ar na região do empreendimento", base: "claro", escala: "uf",
    get fonte() { return `NASA GIBS – MERRA-2, espessura óptica de aerossóis a 550 nm (média mensal de ${mesGIBS().slice(5, 7)}/${mesGIBS().slice(0, 4)}); concentrações no ponto: CAMS/Copernicus (Open-Meteo), últimos 12 meses`; },
    opacidade: 0.7,
    camadas() {
      return [new ol.layer.Tile({ className: "tema", source: new ol.source.XYZ({
        url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly/default/${mesGIBS()}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
        crossOrigin: "anonymous", maxZoom: 6 }) })];
    },
    async legenda() { return AOD.map((a) => ({ tipo: "area", fill: a.cor, stroke: "#999", rotulo: a.nome })); },
    async info(p) {
      const k = `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
      if (!cacheTema.ar[k]) {
        const fim = new Date(Date.now() - 2 * 864e5), ini = new Date(fim.getTime() - 364 * 864e5);
        const d = (x) => x.toISOString().slice(0, 10);
        cacheTema.ar[k] = json(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p[1]}&longitude=${p[0]}` +
          `&hourly=${OMS.map((o) => o.v).join(",")}&start_date=${d(ini)}&end_date=${d(fim)}&timezone=GMT`)
          .catch((e) => { delete cacheTema.ar[k]; throw e; });
      }
      const r = await cacheTema.ar[k];
      const linhas = OMS.map((o) => {
        const v = r.hourly[o.v].filter((x) => x != null);
        const m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
        const ref = o.anual ? ` (OMS: ${o.anual})` : "";
        return [o.nome, `${fmtN(m, o.v === "carbon_monoxide" ? 0 : 1)} µg/m³${ref}`];
      });
      temaEstado.quadro = { titulo: "Concentração média no ponto (CAMS, 12 meses)", tipo: "tabela", linhas,
                            rodape: "Referência: valores-guia anuais da OMS (2021), µg/m³." };
      const pm = linhas[0][1];
      return [["MP2,5 médio no ponto", pm]];
    },
  },
};

const HIDRO_CLASSES = [
  { classe: "fbds_duplo", rotulo: "Rio com mais de 10 m de largura (FBDS)", tipo: "area", fill: "rgba(107,174,214,0.95)", stroke: "#08519c", larg: 0.8 },
  { classe: "fbds_massa", rotulo: "Massa d'água – lagoa, açude, represa (FBDS)", tipo: "area", fill: "rgba(158,202,225,0.95)", stroke: "#2171b5", larg: 0.8 },
  { classe: "fbds_rio", rotulo: "Curso d'água até 10 m de largura (FBDS)", tipo: "linha", stroke: "#2171b5", larg: 1.5 },
  { classe: "fbds_nasc", rotulo: "Nascente (FBDS)", tipo: "ponto", fill: "#08519c", stroke: "#fff", larg: 1 },
  { classe: "ana_rotulo", rotulo: "Nome do rio (ANA)", tipo: "linha", stroke: "rgba(0,0,0,0)", larg: 6, semLegenda: true },
  { classe: "ana_fed", rotulo: "Rio de domínio federal (ANA)", tipo: "linha", stroke: "#08519c", larg: 3 },
  { classe: "ana_est", rotulo: "Rio ou riacho com nome (ANA)", tipo: "linha", stroke: "#2171b5", larg: 2 },
  { classe: "ana_sn", rotulo: "Curso d'água sem nome (ANA)", tipo: "linha", stroke: "#5b9fd1", larg: 1.3 },
  { classe: "ana_massa", rotulo: "Massa d'água – lagoa, açude, represa (ANA)", tipo: "area", fill: "rgba(158,202,225,0.9)", stroke: "#2171b5", larg: 0.8 },
  { classe: "rio", rotulo: "Rio (OpenStreetMap)", tipo: "linha", stroke: "#3f8fd0", larg: 1.6 },
  { classe: "corrego", rotulo: "Córrego ou riacho (OpenStreetMap)", tipo: "linha", stroke: "#74a9cf", larg: 1.1 },
  { classe: "canal", rotulo: "Canal ou vala de drenagem (OpenStreetMap)", tipo: "linha", stroke: "#7fb3dd", larg: 1, tracejado: true },
  { classe: "agua", rotulo: "Lago, lagoa ou açude (OpenStreetMap)", tipo: "area", fill: "rgba(186,220,240,0.85)", stroke: "#74a9cf", larg: 0.6 },
  { classe: "alagado", rotulo: "Área úmida ou alagável (OpenStreetMap)", tipo: "area", fill: "rgba(178,223,219,0.75)", stroke: "#4f9e95", larg: 0.6 },
  { classe: "mangue", rotulo: "Manguezal (OpenStreetMap)", tipo: "area", fill: "rgba(122,135,198,0.6)", stroke: "#4a568f", larg: 0.6 },
];

const PROT_CLASSES = [
  { classe: "uc_pi", rotulo: "Unidade de conservação – proteção integral", tipo: "area", fill: "rgba(35,139,69,0.45)", stroke: "#1b6b3a" },
  { classe: "uc_us", rotulo: "Unidade de conservação – uso sustentável", tipo: "area", fill: "rgba(166,206,57,0.45)", stroke: "#5d7f16" },
  { classe: "ti", rotulo: "Terra indígena", tipo: "area", fill: "rgba(217,142,73,0.45)", stroke: "#8b4513" },
  { classe: "caverna", rotulo: "Caverna cadastrada (CANIE)", tipo: "ponto", fill: "#6d4c41", stroke: "#3e2723" },
];

/* ── saneamento (Alagoas): prestador por município e ETEs/ETAs do OpenStreetMap ── */

const SAN_EMPRESAS = {
  "BRK Ambiental (Bloco A)": { fill: "rgba(31,120,180,0.55)" },
  "Águas do Sertão (Bloco B)": { fill: "rgba(240,140,40,0.55)" },
  "Verde Alagoas (Bloco C)": { fill: "rgba(51,160,44,0.55)" },
  "CASAL": { fill: "rgba(0,131,143,0.55)" },
  "SAAE (autarquia municipal)": { fill: "rgba(123,82,171,0.55)" },
};
const SAN_PONTOS = {
  ete: { rotulo: "ETE – estação de tratamento de esgoto (OSM)", fill: "#8d5a2b", stroke: "#5d3a1a" },
  eta: { rotulo: "ETA – estação de tratamento de água (OSM)", fill: "#0b5fa5", stroke: "#083f6e" },
};
// municípios abastecidos pelo Sistema Coletivo do Agreste (PPP CASAL/Agreste Saneamento, contrato 090/2012)
const SAN_AGRESTE = new Set(["Arapiraca", "Craíbas", "Igaci", "Coité do Nóia", "Girau do Ponciano", "Feira Grande", "São Brás",
  "Campo Grande", "Lagoa da Canoa", "Olho d'Água Grande"]);

async function dadosSaneamento() {
  if (!cacheTema.saneamento) cacheTema.saneamento = json("dados/saneamento_al.json");
  return cacheTema.saneamento;
}

// consulta todos os espelhos do Overpass ao mesmo tempo e fica com a primeira resposta válida
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
                  "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
async function overpass(q, ms = 60000) {
  const ctls = OVERPASS.map(() => new AbortController());
  const tm = setTimeout(() => ctls.forEach((c) => c.abort()), ms);
  try {
    return await Promise.any(OVERPASS.map(async (srv, i) => {
      const resp = await fetch(srv, { method: "POST", body: new URLSearchParams({ data: q }), signal: ctls[i].signal });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const r = await resp.json();
      if (!r || !Array.isArray(r.elements)) throw new Error("resposta inválida");
      return r;
    }));
  } catch (e) {
    throw new Error("os servidores do OpenStreetMap (Overpass) não responderam");
  } finally { clearTimeout(tm); ctls.forEach((c) => c.abort()); }
}

const cacheSanOSM = {};
async function saneamentoOSM([lon, lat]) {
  const k = `${lon.toFixed(3)},${lat.toFixed(3)}`;
  if (!cacheSanOSM[k]) cacheSanOSM[k] = (async () => {
    const r = await overpass(`[out:json][timeout:40];nwr["man_made"~"^(wastewater_plant|water_works)$"](around:15000,${lat},${lon});out center tags;`);
    return r.elements.map((el) => {
      const c = el.type === "node" ? [el.lon, el.lat] : el.center ? [el.center.lon, el.center.lat] : null;
      if (!c) return null;
      const tg = el.tags || {};
      return turf.point(c, { classe: tg.man_made === "wastewater_plant" ? "ete" : "eta", nome: tg.name || "",
                             operador: tg.operator || "", osm: `${el.type}/${el.id}` });
    }).filter(Boolean);
  })().catch((e) => { delete cacheSanOSM[k]; throw e; });
  return cacheSanOSM[k];
}

/* ── estudos ambientais: áreas prioritárias (MMA), CAR, acesso e receptores sensíveis ── */

const PRIOR_BIOMAS = { caatinga_2a_atualizacao: "Caatinga", mataatlantica_2a_atualiz: "Mata Atlântica", zcm_2a_atualiz: "Zona Costeira e Marinha",
  cerrado_pantanal_2a_atualizacao: "Cerrado e Pantanal", amazonia_2a_atualizacao: "Amazônia", pampa_2a_atualizacao: "Pampa",
  areas_hibridas_2a_atualizacao: "Zonas híbridas" };
const PRIOR_CLASSES = [
  { classe: "pr_ea", rotulo: "Prioridade de ação extremamente alta", tipo: "area", fill: "rgba(178,24,43,0.42)", stroke: "#8b1020" },
  { classe: "pr_ma", rotulo: "Prioridade de ação muito alta", tipo: "area", fill: "rgba(239,138,98,0.45)", stroke: "#b85a30" },
  { classe: "pr_a", rotulo: "Prioridade de ação alta", tipo: "area", fill: "rgba(250,205,90,0.5)", stroke: "#a8861c" },
];
const CAR_CLASSES = [
  { classe: "car_local", rotulo: "Imóvel do CAR onde está o empreendimento", tipo: "area", fill: "rgba(255,215,0,0.30)", stroke: "#ff2a00", larg: 2.6 },
  { classe: "car_iru", rotulo: "Imóvel rural (CAR)", tipo: "area", fill: "rgba(255,255,255,0.12)", stroke: "#ffd23f", larg: 1.3 },
  { classe: "car_ast", rotulo: "Assentamento da reforma agrária (CAR)", tipo: "area", fill: "rgba(230,120,30,0.25)", stroke: "#ff8c1a", larg: 1.6 },
  { classe: "car_pct", rotulo: "Território de povos e comunidades tradicionais (CAR)", tipo: "area", fill: "rgba(160,90,190,0.28)", stroke: "#c77dff", larg: 1.6 },
];
const CAR_STATUS = { AT: "ativo", PE: "pendente", SU: "suspenso", CA: "cancelado" };
const ACESSO_CLASSES = [
  { classe: "rota", rotulo: "Rota de acesso", tipo: "linha", stroke: "#d7301f", larg: 4.5 },
  { classe: "origem", rotulo: "Ponto de partida", tipo: "bola", fill: "#1f4e79", stroke: "#0d2a45" },
];
const ENTORNO_CLASSES = [
  { classe: "raio", rotulo: "Raio de análise", tipo: "linha", stroke: "#444444", larg: 1.6, tracejado: true },
  { classe: "educacao", curto: "Escolas e creches", rotulo: "Escola, creche ou faculdade", tipo: "bola", fill: "#1f78b4", stroke: "#0e4a73" },
  { classe: "saude", curto: "Unidades de saúde", rotulo: "Hospital, clínica ou posto de saúde", tipo: "bola", fill: "#d81b60", stroke: "#8a0f3c" },
  { classe: "culto", curto: "Templos e igrejas", rotulo: "Templo ou igreja", tipo: "bola", fill: "#6a3d9a", stroke: "#40235e" },
  { classe: "assistencia", curto: "Assistência social", rotulo: "Asilo, abrigo ou centro comunitário", tipo: "bola", fill: "#ff7f00", stroke: "#a85300" },
];
const TIPO_OSM = { school: "escola", kindergarten: "creche", college: "faculdade", university: "universidade", hospital: "hospital", clinic: "clínica",
  doctors: "consultório", dentist: "dentista", place_of_worship: "templo", social_facility: "assistência social", nursing_home: "asilo",
  community_centre: "centro comunitário", centre: "posto de saúde", doctor: "consultório" };
const CAPITAIS = { AC: "Rio Branco", AL: "Maceió", AP: "Macapá", AM: "Manaus", BA: "Salvador", CE: "Fortaleza", DF: "Brasília", ES: "Vitória",
  GO: "Goiânia", MA: "São Luís", MT: "Cuiabá", MS: "Campo Grande", MG: "Belo Horizonte", PA: "Belém", PB: "João Pessoa", PR: "Curitiba",
  PE: "Recife", PI: "Teresina", RJ: "Rio de Janeiro", RN: "Natal", RS: "Porto Alegre", RO: "Porto Velho", RR: "Boa Vista",
  SC: "Florianópolis", SP: "São Paulo", SE: "Aracaju", TO: "Palmas" };

function campoQue(p, re) { const k = Object.keys(p).find((x) => re.test(x)); return k ? String(p[k] ?? "").trim() : ""; }
function textoDist(m) { return m < 1000 ? `${fmtN(Math.round(m / 10) * 10)} m` : `${fmtN(m / 1000, 1)} km`; }

// estilo por classe (área, linha, bola ou marca) com rótulo opcional
function estiloClasses(CL, rotular) {
  const cache = {};
  return (f) => {
    const c = CL.find((x) => x.classe === f.get("classe"));
    if (!c) return null;
    const k = `${c.classe}|${K}`;
    if (!cache[k]) {
      const ponto = c.tipo === "bola" || c.tipo === "marca";
      cache[k] = ponto
        ? new ol.style.Style({ image: c.tipo === "bola"
            ? new ol.style.Circle({ radius: 6 * K, fill: new ol.style.Fill({ color: c.fill }), stroke: new ol.style.Stroke({ color: "#fff", width: 1.6 * K }) })
            : new ol.style.RegularShape({ points: 3, radius: 7 * K, fill: new ol.style.Fill({ color: c.fill }), stroke: new ol.style.Stroke({ color: "#fff", width: 1.4 * K }) }) })
        : c.tipo === "linha"
          ? new ol.style.Style({ stroke: new ol.style.Stroke({ color: c.stroke, width: (c.larg || 2) * K, lineDash: c.tracejado ? [8 * K, 6 * K] : undefined }) })
          : new ol.style.Style({ fill: new ol.style.Fill({ color: c.fill }), stroke: new ol.style.Stroke({ color: c.stroke, width: (c.larg || 1.6) * K }) });
    }
    const t = rotular ? rotular(f, c) : "";
    if (!t) return cache[k];
    const ponto = c.tipo === "bola" || c.tipo === "marca";
    return [cache[k], new ol.style.Style({ text: new ol.style.Text({ text: t, font: `bold ${Math.round(10 * K)}px Arial`, offsetY: ponto ? -13 * K : 0,
      overflow: false, fill: new ol.style.Fill({ color: c.stroke || "#222" }), stroke: new ol.style.Stroke({ color: "#fff", width: 3 * K }) }) })];
  };
}
function legendaClasses(CL, camada) {
  const pres = new Set(camada.getSource().getFeatures().map((f) => f.get("classe")));
  return CL.filter((c) => pres.has(c.classe)).map((c) => ({ tipo: c.tipo, fill: c.fill, stroke: c.stroke, rotulo: c.rotulo, tracejado: c.tracejado }));
}
function vetorQGIS(CL, feats) {
  return turf.featureCollection(feats.map((f) => {
    const c = CL.find((x) => x.classe === f.properties.classe);
    return turf.feature(f.geometry, { ...f.properties, rotulo: c.rotulo, cor: c.tipo === "linha" ? c.stroke : c.fill });
  }));
}

/* ── serviços oficiais (ANA/SNIRH e INDE) ───────────────────────────── */

const ANA_BASE = "https://www.snirh.gov.br/arcgis/rest/services/IG/Servicos_Base_IG_v6/MapServer";

async function jsonTempo(url, ms = 30000) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally { clearTimeout(tm); }
}

async function arcgisGeo(base, camada, bb, campos, where = "1=1") {
  const u = `${base}/${camada}/query?` + new URLSearchParams({ where, geometry: bb.map((v) => v.toFixed(5)).join(","),
    geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: campos,
    returnGeometry: "true", outSR: "4326", geometryPrecision: "6", f: "geojson" });
  const r = await jsonTempo(u);
  if (r.error) throw new Error(r.error.message || "erro no serviço");
  return (r.features || []).filter((f) => f.geometry);
}

async function arcgisPonto(base, camada, p, campos) {
  const u = `${base}/${camada}/query?` + new URLSearchParams({ geometry: `${p[0]},${p[1]}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: campos, returnGeometry: "false", f: "json" });
  const r = await jsonTempo(u, 20000);
  return r.features && r.features[0] ? r.features[0].attributes : null;
}

async function wfsINDE(tipo, bb) {
  const u = "https://geoservicos.inde.gov.br/geoserver/ows?" + new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature",
    typeNames: tipo, outputFormat: "application/json", srsName: "EPSG:4326", count: "2000",
    bbox: `${bb[1]},${bb[0]},${bb[3]},${bb[2]},urn:ogc:def:crs:EPSG::4326` });
  const r = await jsonTempo(u, 40000);
  return (r.features || []).filter((f) => f.geometry);
}

async function hidroOSM(bb) {
      const q = `[out:json][timeout:40];(way["waterway"~"^(river|stream|canal|ditch|drain|brook)$"](${bb[1]},${bb[0]},${bb[3]},${bb[2]});` +
        `way["natural"~"^(water|wetland)$"](${bb[1]},${bb[0]},${bb[3]},${bb[2]});way["waterway"="riverbank"](${bb[1]},${bb[0]},${bb[3]},${bb[2]});` +
        `relation["natural"="water"](${bb[1]},${bb[0]},${bb[3]},${bb[2]}););out geom;`;
      const r = await overpass(q, 45000);
      const feats = [];
      for (const el of r.elements) {
        const tg = el.tags || {};
        const wet = tg.natural === "wetland";
        const nome = tg.name || "";
        if (el.type === "way" && el.geometry) {
          const co = el.geometry.map((g) => [g.lon, g.lat]);
          const fechado = co.length > 3 && co[0][0] === co[co.length - 1][0] && co[0][1] === co[co.length - 1][1];
          if ((tg.natural || tg.waterway === "riverbank") && fechado)
            feats.push(turf.polygon([co], { classe: wet ? (tg.wetland === "mangrove" ? "mangue" : "alagado") : "agua", nome, tipo: "area" }));
          else if (tg.waterway) {
            const cl = tg.waterway === "river" ? "rio" : (tg.waterway === "canal" || tg.waterway === "ditch" || tg.waterway === "drain") ? "canal" : "corrego";
            feats.push(turf.lineString(co, { classe: cl, nome, tipo: "linha", intermitente: tg.intermittent === "yes" }));
          }
        } else if (el.type === "relation" && el.members) {
          for (const m of el.members) {
            if (m.role !== "outer" || !m.geometry) continue;
            const co = m.geometry.map((g) => [g.lon, g.lat]);
            if (co.length > 3 && co[0][0] === co[co.length - 1][0] && co[0][1] === co[co.length - 1][1])
              feats.push(turf.polygon([co], { classe: "agua", nome, tipo: "area" }));
          }
        }
      }
      return feats;
}

// FBDS: arquivos por município hospedados no site (dados/fbds_UF_geocódigo.json e dados/fbds_indice.json)
const cacheFBDS = {};
async function fbdsNaVista(bb) {
  if (!cacheFBDS.indice) cacheFBDS.indice = json("dados/fbds_indice.json").catch(() => ({}));
  const indice = await cacheFBDS.indice;
  const caixa = turf.bboxPolygon(bb);
  const feats = [], municipios = [];
  let cobertos = 0, total = 0;
  for (const [codUF, malha] of Object.entries(cache.mun)) {
    for (const mun of malha.features) {
      const cod = String(mun.properties.codarea);
      let toca = false;
      try { toca = turf.booleanIntersects(mun, caixa); } catch (e) { toca = false; }
      if (!toca) continue;
      total++;
      const uf = Object.keys(indice).find((u) => indice[u][cod]);
      if (!uf) continue;
      cobertos++;
      if (!cacheFBDS[cod]) cacheFBDS[cod] = json(`dados/fbds_${uf}_${cod}.json`).catch((e) => { delete cacheFBDS[cod]; throw e; });
      const d = await cacheFBDS[cod];
      municipios.push((cache.nomes[cod] || {}).nome || d.municipio);
      for (const f of d.features) {
        const p = f.properties;
        const classe = { rio: "fbds_rio", rio_duplo: "fbds_duplo", massa: "fbds_massa", nascente: "fbds_nasc" }[p.c];
        if (!classe) continue;
        let dentro = true;
        try { dentro = turf.booleanIntersects(f, caixa); } catch (e) { dentro = true; }
        if (!dentro) continue;
        for (const g of turf.flatten(f).features)
          feats.push(turf.feature(g.geometry, { classe, nome: "", natureza: p.n || "", area_ha: p.ha ?? null, fonte: "FBDS" }));
      }
    }
  }
  return { feats, municipios, cobre: total > 0 && cobertos === total };
}

// Menor distância (m) entre a referência (ponto ou polígono do lote) e uma feição qualquer.
function distanciaM(ref, g) {
  try { if (turf.booleanIntersects(ref, g)) return 0; } catch (e) { /* segue com o cálculo */ }
  const linhas = (f) => {
    if (/Point/.test(f.geometry.type)) return [];
    return turf.flatten(/Polygon/.test(f.geometry.type) ? turf.polygonToLine(f) : f).features.filter((x) => x.geometry && /LineString/.test(x.geometry.type))
      .flatMap((x) => (x.geometry.type === "MultiLineString" ? turf.flatten(x).features : [x]));
  };
  const vertices = (f) => turf.explode(f).features;
  const lg = linhas(g), lr = linhas(ref);
  let min = Infinity;
  for (const v of vertices(ref)) {
    if (lg.length) for (const l of lg) min = Math.min(min, turf.pointToLineDistance(v, l, { units: "meters" }));
    else for (const w of vertices(g)) min = Math.min(min, turf.distance(v, w, { units: "meters" }));
  }
  if (lr.length) {
    const vs = vertices(g);
    const passo = Math.max(1, Math.floor(vs.length / 1500));
    for (let i = 0; i < vs.length; i += passo) for (const l of lr) min = Math.min(min, turf.pointToLineDistance(vs[i], l, { units: "meters" }));
  }
  return min;
}

function titulo(n) {
  const peq = new Set(["de", "da", "do", "das", "dos", "e"]);
  return n.toLowerCase().split(/\s+/).map((w, i) => (i && peq.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

function climaPNG(id, nome, titulo, rotulo, rotuloInfo) {
  return {
    nome, titulo, base: "claro", escala: "uf", opacidade: 0.75, climograma: true,
    get fonte() { return "CHELSA v2.1 – Karger et al. (2017, 2021), normal 1981–2010; climograma: distribuição mensal do ERA5/Copernicus 1991–2020 (Open-Meteo) ajustada aos totais anuais da CHELSA no ponto"; },
    camadas() { return [camadaPNG(`dados/clima/${id}.png`, EXT_CLIMA)]; },
    async legenda() {
      const d = await dadosClima();
      const cont = new Map();
      contarCores(await amostrarImg(`dados/clima/${id}.png`, EXT_CLIMA, vistaBBox(0)), cont);
      return classesPresentes(cont, d[id], 0.003).map((c) => ({ tipo: "area", fill: c.cor, stroke: "#888", rotulo: rotulo(c) }));
    },
    async info(p) {
      const d = await dadosClima();
      const cor = await corNoPonto(`dados/clima/${id}.png`, EXT_CLIMA, p);
      const c = d[id].find((x) => x.cor.toLowerCase() === cor);
      let linhas = c ? [[rotuloInfo, rotulo(c)]] : [];
      const v = await valoresCHELSA(p).catch(() => null);
      if (v && id === "precipitacao") linhas = [[rotuloInfo, `cerca de ${fmtN(Math.round(v.prec / 10) * 10)} mm/ano`]];
      if (v && id === "temperatura") linhas = [[rotuloInfo, `cerca de ${fmtN(v.temp, 1)} °C`]];
      try {
        const nm = await normaisNoPonto(p);
        temaEstado.quadro = quadroClima(nm);
      } catch (e) { temaEstado.quadro = null; }
      return linhas;
    },
  };
}

function tituloSolo(n) {
  return n.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

function contem(a, b) { return a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3]; }

function variarCor(h, i) {
  if (!i) return h;
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const f = [0, 0.18, -0.15, 0.32, -0.28, 0.45, -0.38][i % 7];
  const aj = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  return hex(aj(r), aj(g), aj(b));
}

// Classes de um raster colorido presentes na tela (lê o canvas da camada temática).
// A transparência da camada já vem aplicada no canvas, então a cor é comparada pela mais próxima.
function legendaDaTela(classes, minimo = 0.002) {
  const cont = new Map();
  const ref = classes.map((c) => [c.cor.toLowerCase(), [1, 3, 5].map((k) => parseInt(c.cor.slice(k, k + 2), 16))]);
  const maisProxima = (r, g, b) => {
    let m = null, dm = 1e9;
    for (const [h, [R, G, B]] of ref) { const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (d < dm) { dm = d; m = h; } }
    return dm <= 300 ? m : null;
  };
  mapa.getViewport().querySelectorAll(".tema canvas").forEach((cv) => {
    try {
      if (!cv.width || !cv.height) return;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const passo = Math.max(1, Math.floor(Math.sqrt((cv.width * cv.height) / 60000)));
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      for (let y = 0; y < cv.height; y += passo) for (let x = 0; x < cv.width; x += passo) {
        const i = (y * cv.width + x) * 4;
        const a = d[i + 3];
        if (a < 60) continue;
        const k = 255 / a;  // desfaz a pré-multiplicação pela opacidade
        const c = maisProxima(d[i], d[i + 1], d[i + 2]) || maisProxima(d[i] * k, d[i + 1] * k, d[i + 2] * k);
        if (c) cont.set(c, (cont.get(c) || 0) + 1);
      }
    } catch (e) { /* canvas sem leitura */ }
  });
  if (!cont.size) return classes.map((c) => ({ tipo: "area", fill: c.cor, stroke: "#888", rotulo: c.rotulo }));
  return classesPresentes(cont, classes, minimo).map((c) => ({ tipo: "area", fill: c.cor, stroke: "#888", rotulo: c.rotulo }));
}

function legendaRaster(tipo, classes, minimo = 0.002) {
  const cnt = contRaster[tipo];
  if (!cnt || cnt.length !== classes.length) return classes.map((c) => ({ tipo: "area", fill: c.cor, stroke: "#888", rotulo: c.rotulo }));
  const tot = cnt.reduce((a, b) => a + b, 0) || 1;
  return classes.filter((c, i) => cnt[i] / tot >= minimo).map((c) => ({ tipo: "area", fill: c.cor, stroke: "#888", rotulo: c.rotulo }));
}

/* ── operações de raster (rodam no navegador, sobre os blocos de elevação) ── */

const contRaster = {};  // pixels por classe, preenchido pelas operações de raster (rodam na thread principal)

function opHipsometria(imgs, data) {
  const src = imgs[0], d = src.data, out = new ImageData(src.width, src.height), o = out.data;
  const q = data.quebras, cores = data.cores.map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
  const cnt = new Array(cores.length).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const z = d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
    if (z <= 0.5) continue;  // mar e lagoas costeiras ficam transparentes
    let k = 0;
    while (k < cores.length - 1 && z >= q[k + 1]) k++;
    o[i] = cores[k][0]; o[i + 1] = cores[k][1]; o[i + 2] = cores[k][2]; o[i + 3] = 255;
    cnt[k]++;
  }
  contRaster.relevo = cnt;
  return out;
}

function opDeclividade(imgs, data) {
  const src = imgs[0], d = src.data, w = src.width, h = src.height;
  const out = new ImageData(w, h), o = out.data;
  // método de Horn sobre uma janela de pelo menos ~90 m (3 células do SRTM), para não realçar o ruído do modelo
  const passo = Math.max(1, Math.round(data.resFonte), Math.round(45 / data.res));
  const dist = 8 * passo * data.res;
  const cores = data.cores.map((hx) => [1, 3, 5].map((k) => parseInt(hx.slice(k, k + 2), 16)));
  const cnt = new Array(cores.length).fill(0);
  let zc = 0;
  const z = (x, y) => {
    const i = (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4;
    return d[i + 3] === 0 ? zc : d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;  // bloco ainda não carregado: sem degrau
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] === 0) continue;
    zc = d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
    if (zc <= 0.5) continue;
    const a = z(x - passo, y - passo), b = z(x, y - passo), c = z(x + passo, y - passo);
    const dd = z(x - passo, y), f = z(x + passo, y);
    const g = z(x - passo, y + passo), hh = z(x, y + passo), ii = z(x + passo, y + passo);
    const dzdx = ((c + 2 * f + ii) - (a + 2 * dd + g)) / dist, dzdy = ((g + 2 * hh + ii) - (a + 2 * b + c)) / dist;
    const pct = Math.hypot(dzdx, dzdy) * 100;
    let k = 0;
    while (k < data.lims.length - 1 && pct >= data.lims[k]) k++;
    o[i] = cores[k][0]; o[i + 1] = cores[k][1]; o[i + 2] = cores[k][2]; o[i + 3] = 255;
    cnt[k]++;
  }
  contRaster.declividade = cnt;
  return out;
}

/* ── ciclo de vida do tema ──────────────────────────────────────────── */

let temaCamadas = [];
let temaSeq = 0;

function ativarTema(id) {
  grupoTema.getLayers().clear();
  temaCamadas = [];
  Object.assign(temaEstado, { id: TEMAS[id] ? id : null, legenda: [], info: [], quadro: null, vetor: null, aviso: "",
                              quebras: null, coresHipso: null });
  $("bloco-tema").hidden = !TEMAS[id];
  $("tema-opcoes").innerHTML = (TEMAS[id] && TEMAS[id].opcoes) || "";
  if (!TEMAS[id]) { mostrarTema(); return; }
  const t = TEMAS[id];
  $("opacidade").value = Math.round((t.opacidade ?? 0.8) * 100);
  temaCamadas = t.camadas();
  temaCamadas.forEach((l) => {
    if (l.getClassName() === "tema") l.setOpacity(Number($("opacidade").value) / 100);
    grupoTema.getLayers().push(l);
  });
}

async function atualizarTema() {
  const id = temaEstado.id;
  if (!id) return;
  const t = TEMAS[id], seq = ++temaSeq;
  temaEstado.carregando = true;
  mostrarTema();
  try {
    if (t.atualizar) await t.atualizar(temaCamadas);
    await esperarRender();
    if (seq !== temaSeq || id !== temaEstado.id) return;
    temaEstado.legenda = await t.legenda(temaCamadas);
    if (!estado.ponto) temaEstado.info = [];
    if (estado.ponto && !t.climograma && id !== "ar") temaEstado.quadro = null;
    if (estado.ponto) {
      let info = [];
      try { info = await t.info(estado.ponto, temaCamadas); } catch (e) { console.warn(e); }
      if (seq !== temaSeq || id !== temaEstado.id) return;
      temaEstado.info = info;
    }
    if (seq !== temaSeq) return;
    if (t.vetorial && !temaEstado.vetor) temaEstado.vetor = null;
  } catch (e) {
    console.error(e);
    if (seq === temaSeq && id === temaEstado.id) {
      temaEstado.aviso = `Não foi possível carregar este tema agora (${e.message}). Mova o mapa ou escolha o tema de novo em instantes.`;
      temaEstado.info = [];
    }
  } finally {
    if (seq === temaSeq) { temaEstado.carregando = false; mostrarTema(); }
  }
}

function esperarRender() {
  return new Promise((ok) => {
    let feito = false;
    const fim = () => { if (!feito) { feito = true; ok(); } };
    mapa.once("rendercomplete", fim);
    setTimeout(fim, 12000);
    mapa.render();
  });
}

let temporizadorLeg = null;
function agendarLegenda() {
  clearTimeout(temporizadorLeg);
  temporizadorLeg = setTimeout(async () => {
    const id = temaEstado.id;
    if (!id || temaEstado.carregando) return;
    try { temaEstado.legenda = await TEMAS[id].legenda(temaCamadas); mostrarTema(); } catch (e) { /* mantém a anterior */ }
  }, 400);
}

let temporizadorTema = null;
function agendarTema() {
  clearTimeout(temporizadorTema);
  temporizadorTema = setTimeout(atualizarTema, 450);
}

function mostrarTema() {
  const caixa = $("tema-info");
  if (!caixa) return;
  if (!temaEstado.id) { caixa.innerHTML = ""; return; }
  const partes = [];
  if (temaEstado.carregando) partes.push('<p class="info">Carregando o tema…</p>');
  if (temaEstado.aviso) partes.push(`<p class="info erro">${esc(temaEstado.aviso)}</p>`);
  if (temaEstado.legenda.length) {
    partes.push('<ul class="leg">' + temaEstado.legenda.slice(0, 30).map((it) =>
      `<li><i style="background:${it.fill || it.cor};border-color:${it.stroke || "#888"}${it.tipo === "linha" ? ";height:3px;border:0;background:" + it.stroke : ""}"></i>${esc(it.rotulo)}</li>`).join("") + "</ul>");
  }
  for (const [r, v] of temaEstado.info) partes.push(`<p class="info"><b>${esc(r)}:</b> ${esc(v)}</p>`);
  if (temaEstado.quadro?.tipo === "tabela")
    partes.push(`<p class="info"><b>${esc(temaEstado.quadro.titulo)}:</b> ${temaEstado.quadro.linhas.map(([a, b]) => `${esc(a)} ${esc(b)}`).join("; ")}</p>`);
  if (temaEstado.quadro?.tipo === "climograma") partes.push(`<p class="info"><b>Climograma:</b> ${esc(temaEstado.quadro.rodape)}</p>`);
  if (!estado.ponto) partes.push('<p class="dica">Marque o ponto para ver os dados do local.</p>');
  caixa.innerHTML = partes.join("");
  $("btn-clima").hidden = !(temaEstado.quadro && temaEstado.quadro.tipo === "climograma");
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function extensaoTema(id) {
  const t = TEMAS[id];
  if (!t || !estado.ponto) return null;
  if (t.escala === "uf") {
    const uf = estado.ufs?.features.find((f) => turf.booleanPointInPolygon(turf.point(estado.ponto), f));
    if (uf) return fmtGeo.readFeature(uf).getGeometry().getExtent();
    return ol.extent.buffer(ol.extent.boundingExtent([ol.proj.fromLonLat(estado.ponto)]), 250000);
  }
  if (t.escala >= 10000 && estado.municipio && !t.raio)
    return fmtGeo.readFeature(estado.municipio.feature).getGeometry().getExtent();
  const fator = 1 / Math.cos((estado.ponto[1] * Math.PI) / 180);
  return ol.extent.buffer(ol.extent.boundingExtent([ol.proj.fromLonLat(estado.ponto)]), t.escala * fator);
}

/* ── exportação: climograma em PNG e arquivos do tema para o QGIS ────── */

async function exportarClimograma() {
  const q = temaEstado.quadro;
  if (!q || q.tipo !== "climograma") throw new Error("climograma indisponível para este ponto");
  const cv = document.createElement("canvas");
  cv.width = 1600; cv.height = 1000;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#3e5a1e"; ctx.font = "bold 40px Arial"; ctx.fillText("Climograma", 60, 70);
  ctx.fillStyle = "#444"; ctx.font = "26px Arial";
  const loc = `${estado.municipio ? estado.municipio.nome + "/" + estado.municipio.uf + " – " : ""}${dms(estado.ponto[1], "lat")} / ${dms(estado.ponto[0], "lon")}`;
  ctx.fillText(loc, 60, 112);
  desenharClimograma(ctx, 40, 140, 1520, 760, q.dados, 2.6);
  ctx.fillStyle = "#555"; ctx.font = "22px Arial";
  ctx.fillText(`${q.rodape}. Fonte: ERA5/Copernicus 1991–2020 (Open-Meteo)${q.dados.ajustado ? ", ajustado aos totais da normal CHELSA v2.1 (1981–2010)" : ""}. GeoMapa QGIS.`, 60, 950);
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  baixar(blob, nomeArquivo("png").replace(".png", "_climograma.png"));
}

function corHex(c) {
  const m = String(c || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? hex(+m[1], +m[2], +m[3]) : c;
}

function csvClimograma(nm) {
  const m = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return "mes;temperatura_media_c;precipitacao_mm\r\n" +
    m.map((x, i) => `${x};${nm.temp[i].toFixed(1).replace(".", ",")};${nm.prec[i].toFixed(0)}`).join("\r\n") + "\r\n";
}

async function arquivosTemaQGIS(zip) {
  if (!temaEstado.id) return null;
  const t = TEMAS[temaEstado.id];
  const cfg = { id: temaEstado.id, nome: t.nome, fonte: t.fonte, info: temaEstado.info,
                legenda: temaEstado.legenda.map((i) => ({ ...i, cor: corHex(i.cor || i.fill || i.stroke), fill: corHex(i.fill), stroke: corHex(i.stroke) })),
                opacidade: Number($("opacidade").value) / 100, raster: null, vetor: null };
  if (temaEstado.vetor && temaEstado.vetor.features.length) {
    const ext = ol.proj.transformExtent(mapa.getView().calculateExtent(mapa.getSize()), "EPSG:3857", "EPSG:4326");
    const caixa = turf.bboxPolygon(ext);
    const fs = temaEstado.vetor.features.filter((f) => { try { return turf.booleanIntersects(f, caixa); } catch (e) { return true; } });
    const paraQGIS = (f) => turf.feature(f.geometry, { ...f.properties, cor: corHex(f.properties.cor) });
    const sóRotulo = (f) => f.properties.classe === "ana_rotulo";  // nomes dos rios (ANA): só rótulo, sem traço
    const rotulos = fs.filter(sóRotulo).map(paraQGIS);
    const linhas = fs.filter((f) => !sóRotulo(f) && /LineString/.test(f.geometry.type)).map(paraQGIS);
    const areas = fs.filter((f) => /Polygon/.test(f.geometry.type)).map(paraQGIS);
    const pontos = fs.filter((f) => /Point/.test(f.geometry.type)).map(paraQGIS);
    cfg.vetor = [];  // de cima para baixo no mapa: rótulos, pontos, linhas, áreas
    const salvar = (lista, nome) => { if (lista.length) { zip.file(`camadas/${nome}.geojson`, JSON.stringify(turf.featureCollection(lista))); cfg.vetor.push(`camadas/${nome}.geojson`); } };
    salvar(rotulos, "tema_rotulos"); salvar(pontos, "tema_pontos"); salvar(linhas, "tema_linhas"); salvar(areas, "tema_areas");
  } else {
    const Q = { w: Math.round(QUADRO.w * MM), h: Math.round(QUADRO.h * MM) };
    const { tela, geo } = await renderizarMapa(Q.w, Q.h, true);
    const blob = await new Promise((r) => tela.toBlob(r, "image/png"));
    zip.file("camadas/tema.png", blob);
    // world file em EPSG:3857 (canto superior esquerdo do pixel 0,0)
    const e = geo.extensao;
    const px = (e[2] - e[0]) / Q.w, py = -(e[3] - e[1]) / Q.h;
    zip.file("camadas/tema.pgw", [px, 0, 0, py, e[0] + px / 2, e[3] + py / 2].map((v) => v.toFixed(6)).join("\r\n") + "\r\n");
    zip.file("camadas/tema.prj", 'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1],EXTENSION["PROJ4","+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs"]]');
    cfg.raster = "camadas/tema.png";
  }
  if (temaEstado.quadro?.tipo === "climograma") {
    zip.file("climograma.csv", csvClimograma(temaEstado.quadro.dados));
    const cv = document.createElement("canvas");
    cv.width = 900; cv.height = 470;
    const ctx = cv.getContext("2d");
    desenharClimograma(ctx, 0, 0, 900, 470, temaEstado.quadro.dados, 1.9);
    zip.file("climograma.png", await new Promise((r) => cv.toBlob(r, "image/png")));
    cfg.climograma = "climograma.png";
  }
  if (temaEstado.quadro?.tipo === "tabela") cfg.tabela = temaEstado.quadro;
  return cfg;
}
