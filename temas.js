/* GeoMapa QGIS – mapas temáticos (meio físico, clima, ar e biomas).
   Cada tema cria a(s) camada(s) em grupoTema, monta a legenda com as classes presentes no
   enquadramento e informa o valor no ponto. Usa só serviços abertos com CORS ou dados deste site. */
"use strict";

const grupoTema = new ol.layer.Group({ layers: [] });
const temaEstado = {
  id: null, legenda: [], info: [], quadro: null, fonte: "", vetor: null, geom: null,
  carregando: false, aviso: "",
};
const cacheTema = { clima: null, solos: null, biomas: null, normais: {}, ar: {}, imgs: {} };

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
    nome: "Hidrografia", titulo: "Hidrografia no entorno do empreendimento", base: "claro", escala: 1500, dinamico: true,
    fonte: "© colaboradores do OpenStreetMap (cursos d'água e massas d'água, via Overpass API)",
    vetorial: true,
    camadas() {
      const estilos = {};
      return [new ol.layer.Vector({
        className: "tema", source: new ol.source.Vector(), declutter: false,
        style: (f) => {
          const t = f.get("classe");
          const k = `${t}|${K}`;
          if (!estilos[k]) {
            const c = HIDRO_CLASSES.find((x) => x.classe === t) || HIDRO_CLASSES[1];
            estilos[k] = new ol.style.Style({
              fill: c.tipo === "area" ? new ol.style.Fill({ color: c.fill }) : undefined,
              stroke: new ol.style.Stroke({ color: c.stroke, width: c.larg * K, lineDash: c.tracejado ? [6 * K, 4 * K] : undefined }),
            });
          }
          const nome = f.get("nome");
          if (!nome || f.get("tipo") !== "linha" || mapa.getView().getResolution() > 15 * K) return estilos[k];
          return [estilos[k], new ol.style.Style({
            text: new ol.style.Text({ text: nome, placement: "line", font: `italic ${Math.round(11 * K)}px Arial`,
              fill: new ol.style.Fill({ color: "#1f4e79" }), stroke: new ol.style.Stroke({ color: "#fff", width: 3 * K }) }),
          })];
        },
      })];
    },
    async atualizar(camadas) {
      const bb = vistaBBox(0.1);
      const larguraKm = turf.distance([bb[0], bb[1]], [bb[2], bb[1]]);
      if (larguraKm > 40) { temaEstado.aviso = "Aproxime o mapa (menos de 40 km de largura) para carregar a hidrografia."; return; }
      const chave = bb.map((v) => v.toFixed(3)).join(",");
      if (camadas[0].get("bbox") && contem(camadas[0].get("bbox"), bb)) return;
      const q = `[out:json][timeout:40];(way["waterway"~"^(river|stream|canal|ditch|drain|brook)$"](${bb[1]},${bb[0]},${bb[3]},${bb[2]});` +
        `way["natural"~"^(water|wetland)$"](${bb[1]},${bb[0]},${bb[3]},${bb[2]});way["waterway"="riverbank"](${bb[1]},${bb[0]},${bb[3]},${bb[2]});` +
        `relation["natural"="water"](${bb[1]},${bb[0]},${bb[3]},${bb[2]}););out geom;`;
      let r = null, ultimoErro;
      for (const srv of ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
                         "https://overpass.private.coffee/api/interpreter"]) {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000);
        try {
          const resp = await fetch(`${srv}?data=${encodeURIComponent(q)}`, { signal: ctl.signal });
          if (!resp.ok) throw new Error(`${resp.status} ${srv}`);
          r = await resp.json();
          break;
        } catch (e) { ultimoErro = e; } finally { clearTimeout(tm); }
      }
      if (!r) throw new Error("os servidores do OpenStreetMap (Overpass) não responderam");
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
      const src = camadas[0].getSource();
      src.clear();
      src.addFeatures(feats.map((f) => fmtGeo.readFeature(f)));
      camadas[0].set("bbox", bb);
      temaEstado.vetor = turf.featureCollection(feats.map((f) => {
        const c = HIDRO_CLASSES.find((x) => x.classe === f.properties.classe);
        return turf.feature(f.geometry, { ...f.properties, rotulo: c.rotulo, cor: c.tipo === "area" ? c.fill : c.stroke });
      }));
      temaEstado.aviso = feats.length ? "" : "Nenhum curso ou corpo d'água mapeado no OpenStreetMap neste enquadramento.";
      void chave;
    },
    async legenda(camadas) {
      const presentes = new Set(camadas[0].getSource().getFeatures().map((f) => f.get("classe")));
      return HIDRO_CLASSES.filter((c) => presentes.has(c.classe))
        .map((c) => ({ tipo: c.tipo === "area" ? "area" : "linha", fill: c.fill, stroke: c.stroke, rotulo: c.rotulo, tracejado: c.tracejado }));
    },
    async info(p, camadas) {
      const pt = turf.point(p);
      let melhor = null;
      for (const f of camadas[0].getSource().getFeatures()) {
        const g = fmtGeo.writeFeatureObject(f);
        const linha = g.geometry.type === "LineString" ? g : turf.polygonToLine(g);
        const linhas = linha.type === "FeatureCollection" ? linha.features : [linha];
        for (const l of linhas) {
          if (!l.geometry || l.geometry.type !== "LineString") continue;
          const d = turf.pointToLineDistance(pt, l, { units: "meters" });
          if (!melhor || d < melhor.d) melhor = { d, nome: g.properties.nome, classe: g.properties.classe };
        }
      }
      if (!melhor) return [];
      const c = HIDRO_CLASSES.find((x) => x.classe === melhor.classe);
      return [["Corpo hídrico mais próximo", `${melhor.nome || c.rotulo.toLowerCase()} – a cerca de ${fmtN(Math.round(melhor.d / 5) * 5)} m`]];
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
  { classe: "rio", rotulo: "Rio", tipo: "linha", stroke: "#1f78b4", larg: 2.6 },
  { classe: "corrego", rotulo: "Córrego, riacho ou canal natural", tipo: "linha", stroke: "#3a8fd6", larg: 1.4 },
  { classe: "canal", rotulo: "Canal ou vala de drenagem", tipo: "linha", stroke: "#5aa9e6", larg: 1.2, tracejado: true },
  { classe: "agua", rotulo: "Massa d'água (lago, lagoa, represa, rio largo)", tipo: "area", fill: "rgba(166,206,227,0.9)", stroke: "#3a8fd6", larg: 0.8 },
  { classe: "alagado", rotulo: "Área úmida ou alagável", tipo: "area", fill: "rgba(178,223,219,0.75)", stroke: "#4f9e95", larg: 0.6 },
  { classe: "mangue", rotulo: "Manguezal", tipo: "area", fill: "rgba(122,135,198,0.6)", stroke: "#4a568f", larg: 0.6 },
];

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
    temaEstado.info = [];
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
  if (t.escala >= 10000 && estado.municipio)
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
    const linhas = fs.filter((f) => /LineString/.test(f.geometry.type)).map(paraQGIS);
    const areas = fs.filter((f) => /Polygon/.test(f.geometry.type)).map(paraQGIS);
    cfg.vetor = [];
    if (areas.length) { zip.file("camadas/tema_areas.geojson", JSON.stringify(turf.featureCollection(areas))); cfg.vetor.push("camadas/tema_areas.geojson"); }
    if (linhas.length) { zip.file("camadas/tema_linhas.geojson", JSON.stringify(turf.featureCollection(linhas))); cfg.vetor.push("camadas/tema_linhas.geojson"); }
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
