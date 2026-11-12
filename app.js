/* GeoMapa QGIS – gera mapas de localização / áreas de influência no navegador
   e um pacote (camadas + script PyQGIS) para refinar o mapa no QGIS. */
"use strict";

const IBGE = "https://servicodados.ibge.gov.br/api";
const BASES = {
  osm: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", max: 19,
         credito: "© colaboradores do OpenStreetMap",
         attr: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  satelite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", max: 19,
              credito: "Esri World Imagery (Esri, Maxar, Earthstar Geographics)",
              attr: "Imagem © Esri, Maxar, Earthstar Geographics" },
  topo: { url: "https://tile.opentopomap.org/{z}/{x}/{y}.png", max: 17,
          credito: "© OpenTopoMap (CC-BY-SA), © OpenStreetMap",
          attr: '© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), © OpenStreetMap' },
};
const COR = { verde: "#3e5a1e", ouro: "#795c01", texto: "#333333" };

const $ = (id) => document.getElementById(id);
const fmtGeo = new ol.format.GeoJSON({ featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" });

const estado = {
  ponto: null,      // [lon, lat]
  lote: null,       // GeoJSON Feature (Polygon/MultiPolygon)
  municipio: null,  // { feature, nome, uf }
  ufs: null,        // FeatureCollection das UFs (malha mínima)
};

/* ── mapa ─────────────────────────────────────────────────────────────── */

// Fator de escala dos símbolos: 1 na tela; maior ao exportar em 200 dpi, para manter o tamanho impresso.
let K = 1;

function estilo(fill, stroke, width) {
  return () => new ol.style.Style({
    fill: new ol.style.Fill({ color: fill }),
    stroke: new ol.style.Stroke({ color: stroke, width: width * K }),
  });
}

const fonteBase = new ol.source.XYZ({ crossOrigin: "anonymous" });
const camadaBase = new ol.layer.Tile({ source: fonteBase });
const camadas = {
  municipio: new ol.layer.Vector({ source: new ol.source.Vector(), style: estilo("rgba(0,0,0,0)", "#111", 2.2) }),
  aii: new ol.layer.Vector({ source: new ol.source.Vector(), style: estilo("rgba(230,230,120,0.24)", "#8a8a1f", 1.6) }),
  aid: new ol.layer.Vector({ source: new ol.source.Vector(), style: estilo("rgba(155,120,200,0.28)", "#5b3f8c", 1.6) }),
  lote: new ol.layer.Vector({ source: new ol.source.Vector(), style: estilo("rgba(255,140,0,0.6)", "#c2410c", 2) }),
  ponto: new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: (f) => new ol.style.Style({
      image: new ol.style.Circle({ radius: 7 * K, fill: new ol.style.Fill({ color: "#e31a1c" }),
                                   stroke: new ol.style.Stroke({ color: "#fff", width: 2 * K }) }),
      text: new ol.style.Text({
        text: $("rotulo").value.trim(), offsetY: -16 * K, font: `bold ${Math.round(13 * K)}px Arial`,
        fill: new ol.style.Fill({ color: "#b00000" }), stroke: new ol.style.Stroke({ color: "#fff", width: 3 * K }),
      }),
    }),
  }),
};

const mapa = new ol.Map({
  target: "mapa",
  layers: [camadaBase, camadas.municipio, camadas.aii, camadas.aid, camadas.lote, camadas.ponto],
  view: new ol.View({ center: ol.proj.fromLonLat([-47.9, -15.8]), zoom: 4, maxZoom: 19 }),
  controls: ol.control.defaults.defaults({ attributionOptions: { collapsible: false } })
    .extend([new ol.control.ScaleLine({ units: "metric" })]),
});

function aplicarBase() {
  const b = BASES[$("base").value];
  fonteBase.setUrl(b.url);
  fonteBase.setAttributions(b.attr);
  mapa.getView().setMaxZoom(b.max);
}

/* ── geometria derivada ───────────────────────────────────────────────── */

const modelo = () => document.querySelector("input[name=modelo]:checked").value;
const raios = () => {
  const r1 = Math.max(1, Number($("raio1").value) || 100);
  const r2 = Math.max(r1 + 1, Number($("raio2").value) || 200);
  return [r1, r2];
};

function geometrias() {
  if (!estado.ponto) return {};
  const [r1, r2] = raios();
  const centro = turf.point(estado.ponto);
  const c1 = turf.circle(centro, r1 / 1000, { steps: 128, units: "kilometers" });
  const c2 = turf.circle(centro, r2 / 1000, { steps: 128, units: "kilometers" });
  const anel = turf.difference(turf.featureCollection([c2, c1]));
  return { ponto: centro, aid: c1, aii: anel };
}

function desenhar(enquadrar) {
  for (const c of Object.values(camadas)) c.getSource().clear();
  const g = geometrias();
  const m = modelo();
  if (g.ponto) camadas.ponto.getSource().addFeature(fmtGeo.readFeature(g.ponto));
  if (estado.lote) camadas.lote.getSource().addFeature(fmtGeo.readFeature(estado.lote));
  if (m === "influencia" && g.aid) {
    camadas.aid.getSource().addFeature(fmtGeo.readFeature(g.aid));
    camadas.aii.getSource().addFeature(fmtGeo.readFeature(g.aii));
  }
  const mostrarMun = m === "municipio" || $("mostrar-mun").checked;
  if (mostrarMun && estado.municipio) camadas.municipio.getSource().addFeature(fmtGeo.readFeature(estado.municipio.feature));
  $("raios").style.display = m === "influencia" ? "" : "none";
  const ok = !!estado.ponto;
  for (const id of ["btn-png", "btn-pdf", "btn-qgis"]) $(id).disabled = !ok;
  if (ok && $("status").dataset.inicial !== "0") { status(""); $("status").dataset.inicial = "0"; }
  if (enquadrar && ok) enquadrarMapa();
}

function enquadrarMapa() {
  const m = modelo();
  let ext;
  if (m === "municipio" && estado.municipio) ext = camadas.municipio.getSource().getExtent();
  else if (m === "influencia") ext = camadas.aii.getSource().getExtent();
  else {
    const raio = estado.lote ? Math.max(250, turf.length(turf.polygonToLine(estado.lote), { units: "meters" })) : 450;
    ext = ol.extent.buffer(ol.extent.boundingExtent([ol.proj.fromLonLat(estado.ponto)]), raio * 1.4);
  }
  if (!ext || !isFinite(ext[0])) return;
  mapa.getView().cancelAnimations();
  mapa.getView().fit(ext, { padding: [40, 40, 40, 40], maxZoom: 19 });
}

/* ── localização ──────────────────────────────────────────────────────── */

function status(txt, erro) {
  $("status").textContent = txt;
  $("status").classList.toggle("erro", !!erro);
}

async function definirPonto(lon, lat, origem) {
  if (!isFinite(lon) || !isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    $("info-local").textContent = "Coordenadas inválidas.";
    $("info-local").classList.add("erro");
    return;
  }
  estado.ponto = [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
  $("lat").value = estado.ponto[1];
  $("lon").value = estado.ponto[0];
  $("info-local").classList.remove("erro");
  $("info-local").textContent = "Procurando o município…";
  estado.municipio = null;
  desenhar(origem !== "clique");
  try {
    estado.municipio = await acharMunicipio(estado.ponto);
    $("info-local").textContent = estado.municipio
      ? `Município: ${estado.municipio.nome}/${estado.municipio.uf}`
      : "Fora do território brasileiro: o limite municipal não estará disponível.";
  } catch (e) {
    $("info-local").textContent = "Não foi possível consultar o IBGE agora; o mapa funciona sem o limite municipal.";
  }
  desenhar(origem !== "clique" && modelo() === "municipio");
}

const cache = { mun: {}, nomes: {} };

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function malhaUFs() {
  if (!estado.ufs) estado.ufs = await json(`${IBGE}/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&intrarregiao=UF&qualidade=minima`);
  return estado.ufs;
}

async function acharMunicipio([lon, lat]) {
  const pt = turf.point([lon, lat]);
  const ufs = await malhaUFs();
  const uf = ufs.features.find((f) => turf.booleanPointInPolygon(pt, f));
  if (!uf) return null;
  const cod = uf.properties.codarea;
  if (!cache.mun[cod]) {
    cache.mun[cod] = await json(`${IBGE}/v3/malhas/estados/${cod}?formato=application/vnd.geo%2Bjson&intrarregiao=municipio&qualidade=intermediaria`);
    const nomes = await json(`${IBGE}/v1/localidades/estados/${cod}/municipios`);
    for (const m of nomes) cache.nomes[String(m.id)] = { nome: m.nome, uf: m.microrregiao?.mesorregiao?.UF?.sigla || "" };
  }
  const f = cache.mun[cod].features.find((x) => turf.booleanPointInPolygon(pt, x));
  if (!f) return null;
  const n = cache.nomes[f.properties.codarea] || { nome: f.properties.codarea, uf: "" };
  return { feature: f, nome: n.nome, uf: n.uf };
}

async function buscarEndereco(q) {
  const ul = $("resultados");
  ul.hidden = false;
  ul.innerHTML = "<li><button disabled>Buscando…</button></li>";
  try {
    const r = await json(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`);
    ul.innerHTML = "";
    if (!r.length) { ul.innerHTML = "<li><button disabled>Nada encontrado. Tente rua, número e cidade.</button></li>"; return; }
    for (const it of r) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = it.display_name;
      b.onclick = () => {
        ul.hidden = true;
        if (!$("endereco").value) $("endereco").value = it.display_name.split(", ").slice(0, 4).join(", ");
        definirPonto(Number(it.lon), Number(it.lat), "busca");
      };
      li.appendChild(b);
      ul.appendChild(li);
    }
  } catch (e) {
    ul.innerHTML = "<li><button disabled>A busca de endereço não respondeu. Digite as coordenadas.</button></li>";
  }
}

async function lerArquivo(arq) {
  let texto, nome = arq.name.toLowerCase();
  if (nome.endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(arq);
    const kml = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml"));
    if (!kml) throw new Error("KMZ sem arquivo KML dentro");
    texto = await kml.async("string");
    nome = "x.kml";
  } else texto = await arq.text();
  const gj = nome.endsWith(".kml")
    ? toGeoJSON.kml(new DOMParser().parseFromString(texto, "text/xml"))
    : JSON.parse(texto);
  const feats = (gj.type === "FeatureCollection" ? gj.features : [gj.type === "Feature" ? gj : turf.feature(gj)])
    .filter((f) => f && f.geometry);
  const poli = feats.find((f) => /Polygon/.test(f.geometry.type));
  const pt = feats.find((f) => f.geometry.type === "Point");
  if (!poli && !pt) throw new Error("O arquivo não tem ponto nem polígono");
  estado.lote = poli ? turf.feature(poli.geometry, { nome: "Lote" }) : null;
  const c = pt ? pt.geometry.coordinates : turf.centroid(poli).geometry.coordinates;
  const desc = [poli ? "polígono do lote" : null, pt ? "ponto" : "ponto no centro do lote"].filter(Boolean).join(" e ");
  await definirPonto(c[0], c[1], "arquivo");
  $("info-local").textContent = `Arquivo carregado (${desc}). ` + $("info-local").textContent;
}

/* ── exportação do layout (A4 paisagem, 200 dpi) ──────────────────────── */

const DPI = 200, MM = DPI / 25.4;
const PAG = { w: Math.round(297 * MM), h: Math.round(210 * MM) };
const QUADRO = { x: 13, y: 29, w: 188, h: 168 };  // mm, igual ao script do QGIS

function renderizarMapa(larguraPx, alturaPx) {
  // Renderiza o mapa no tamanho do quadro do layout, mantendo o centro e a área visível na tela.
  return new Promise((resolve, reject) => {
    const view = mapa.getView();
    view.cancelAnimations();  // o enquadramento salvo não pode ser o de uma animação em curso
    const tamOrig = mapa.getSize();
    const resOrig = view.getResolution();
    const ext = view.calculateExtent(tamOrig);
    const res = Math.max(ol.extent.getWidth(ext) / larguraPx, ol.extent.getHeight(ext) / alturaPx);
    const div = mapa.getTargetElement();
    const timeout = setTimeout(() => { restaurar(); reject(new Error("O fundo do mapa demorou demais para carregar.")); }, 45000);
    function restaurar() {
      div.style.width = ""; div.style.height = ""; div.style.flex = "";
      K = 1;
      Object.values(camadas).forEach((c) => c.changed());
      mapa.updateSize();
      view.setResolution(resOrig);
    }
    mapa.once("rendercomplete", () => {
      clearTimeout(timeout);
      try {
        const tela = document.createElement("canvas");
        tela.width = larguraPx; tela.height = alturaPx;
        const ctx = tela.getContext("2d");
        ctx.fillStyle = "#dde3d6";
        ctx.fillRect(0, 0, larguraPx, alturaPx);
        const proporcao = larguraPx / div.clientWidth;
        mapa.getViewport().querySelectorAll(".ol-layer canvas, canvas.ol-layer").forEach((cv) => {
          if (cv.width === 0) return;
          const op = cv.parentNode.style.opacity || cv.style.opacity;
          ctx.globalAlpha = op === "" ? 1 : Number(op);
          const m = (cv.style.transform || "").match(/^matrix\(([^(]*)\)$/);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (m) {
            const t = m[1].split(",").map(Number);
            ctx.setTransform(t[0] * proporcao, t[1], t[2], t[3] * proporcao, t[4] * proporcao, t[5] * proporcao);
          } else ctx.scale(proporcao, proporcao);
          ctx.drawImage(cv, 0, 0);
        });
        ctx.globalAlpha = 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const centro = view.getCenter();
        const geo = {
          canto: (px, py) => ol.proj.toLonLat(mapa.getCoordinateFromPixel([px / proporcao, py / proporcao])),
          pixel: (lon, lat) => mapa.getPixelFromCoordinate(ol.proj.fromLonLat([lon, lat])).map((v) => v * proporcao),
          mPorPx: ol.proj.getPointResolution(view.getProjection(), view.getResolution(), centro, "m") / proporcao,
        };
        restaurar();
        resolve({ tela, geo });
      } catch (e) { restaurar(); reject(e); }
    });
    // Ajusta o elemento do mapa à proporção do quadro, com largura de tela razoável.
    const larguraCss = Math.min(1600, larguraPx / 1.0);
    const fator = larguraCss / larguraPx;
    div.style.flex = "none";  // o contêiner flexível não pode limitar a altura durante a exportação
    div.style.width = `${larguraCss}px`;
    div.style.height = `${alturaPx * fator}px`;
    K = (DPI / 96) * fator;
    Object.values(camadas).forEach((c) => c.changed());
    mapa.updateSize();
    view.setResolution(res / fator);
    mapa.renderSync();
  });
}

function dms(v, eixo) {
  const s = v < 0 ? (eixo === "lat" ? "S" : "O") : (eixo === "lat" ? "N" : "L");
  let a = Math.abs(v), g = Math.floor(a), m = Math.floor((a - g) * 60), sec = Math.round(((a - g) * 60 - m) * 60);
  if (sec === 60) { sec = 0; m += 1; }
  if (m === 60) { m = 0; g += 1; }
  return `${g}°${String(m).padStart(2, "0")}'${String(sec).padStart(2, "0")}" ${s}`;
}

function passoGrade(intervalo) {
  const op = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 18000, 36000].map((s) => s / 3600);
  return op.find((p) => intervalo / p <= 5) || 10;
}

function passoEscala(larguraM) {
  const alvo = larguraM / 16;
  for (let p = 0; p < 8; p++) for (const v of [1, 2, 2.5, 5]) if (v * 10 ** p >= alvo) return v * 10 ** p;
  return 1e7;
}

function quebrar(ctx, texto, largura) {
  const linhas = [];
  for (const par of String(texto).split("\n")) {
    let atual = "";
    for (const p of par.split(" ")) {
      const t = atual ? `${atual} ${p}` : p;
      if (ctx.measureText(t).width > largura && atual) { linhas.push(atual); atual = p; } else atual = t;
    }
    linhas.push(atual);
  }
  return linhas;
}

function caixa(ctx, x, y, w, h, fundo = "#fff", borda = "#888", larg = 0.25) {
  ctx.fillStyle = fundo;
  ctx.fillRect(x * MM, y * MM, w * MM, h * MM);
  ctx.strokeStyle = borda;
  ctx.lineWidth = larg * MM;
  ctx.strokeRect(x * MM, y * MM, w * MM, h * MM);
}

function fonte(ctx, pt, negrito) { ctx.font = `${negrito ? "bold " : ""}${pt * DPI / 72}px Arial, Helvetica, sans-serif`; }

async function montarLayout() {
  const Q = { x: QUADRO.x * MM, y: QUADRO.y * MM, w: Math.round(QUADRO.w * MM), h: Math.round(QUADRO.h * MM) };
  const { tela, geo } = await renderizarMapa(Q.w, Q.h);
  const cv = document.createElement("canvas");
  cv.width = PAG.w; cv.height = PAG.h;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PAG.w, PAG.h);
  caixa(ctx, 4, 4, 289, 202, "#fff", "#333", 0.5);
  caixa(ctx, 4, 4, 289, 17, COR.verde, COR.verde, 0.1);
  caixa(ctx, 4, 21, 289, 1, COR.ouro, COR.ouro, 0.1);
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
  fonte(ctx, 15, true);
  ctx.fillText(($("titulo").value || "Mapa").toUpperCase(), 9 * MM, 9.6 * MM, 279 * MM);
  fonte(ctx, 8.5); ctx.fillStyle = "#e8e2c8";
  ctx.fillText($("subtitulo").value, 9 * MM, 16.8 * MM, 279 * MM);

  // mapa + moldura
  ctx.drawImage(tela, Q.x, Q.y);
  ctx.strokeStyle = "#222"; ctx.lineWidth = 0.4 * MM;
  ctx.strokeRect(Q.x, Q.y, Q.w, Q.h);

  // grade de coordenadas (marcas e rótulos nas bordas)
  const nw = geo.canto(0, 0), se = geo.canto(Q.w, Q.h);
  const passo = passoGrade(Math.max(se[0] - nw[0], nw[1] - se[1]));
  fonte(ctx, 6.5); ctx.fillStyle = COR.texto; ctx.strokeStyle = "#333"; ctx.lineWidth = 0.25 * MM;
  for (let lon = Math.ceil(nw[0] / passo) * passo; lon < se[0]; lon += passo) {
    const x = Q.x + geo.pixel(lon, (nw[1] + se[1]) / 2)[0];
    ctx.beginPath(); ctx.moveTo(x, Q.y); ctx.lineTo(x, Q.y + 1.5 * MM); ctx.moveTo(x, Q.y + Q.h); ctx.lineTo(x, Q.y + Q.h - 1.5 * MM); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(dms(lon, "lon"), x, Q.y - 0.8 * MM);
    ctx.textBaseline = "top"; ctx.fillText(dms(lon, "lon"), x, Q.y + Q.h + 0.8 * MM);
  }
  for (let lat = Math.ceil(se[1] / passo) * passo; lat < nw[1]; lat += passo) {
    const y = Q.y + geo.pixel((nw[0] + se[0]) / 2, lat)[1];
    ctx.beginPath(); ctx.moveTo(Q.x, y); ctx.lineTo(Q.x + 1.5 * MM, y); ctx.moveTo(Q.x + Q.w, y); ctx.lineTo(Q.x + Q.w - 1.5 * MM, y); ctx.stroke();
    for (const [xx, ang] of [[Q.x - 1 * MM, -Math.PI / 2], [Q.x + Q.w + 1 * MM, Math.PI / 2]]) {
      ctx.save(); ctx.translate(xx, y); ctx.rotate(ang); ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(dms(lat, "lat"), 0, 0); ctx.restore();
    }
  }
  ctx.textAlign = "left";

  // seta norte
  const nx = Q.x + Q.w - 15 * MM, ny = Q.y + 3 * MM;
  caixa(ctx, nx / MM, ny / MM, 12, 15, "rgba(255,255,255,0.85)", "#999", 0.15);
  ctx.fillStyle = "#222"; ctx.beginPath();
  ctx.moveTo(nx + 6 * MM, ny + 4 * MM); ctx.lineTo(nx + 9 * MM, ny + 13 * MM); ctx.lineTo(nx + 6 * MM, ny + 11 * MM); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#222"; ctx.lineWidth = 0.25 * MM; ctx.beginPath();
  ctx.moveTo(nx + 6 * MM, ny + 4 * MM); ctx.lineTo(nx + 3 * MM, ny + 13 * MM); ctx.lineTo(nx + 6 * MM, ny + 11 * MM); ctx.closePath(); ctx.fill(); ctx.stroke();
  fonte(ctx, 8, true); ctx.fillStyle = "#222"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("N", nx + 6 * MM, ny + 2.2 * MM); ctx.textAlign = "left";

  // barra de escala
  const seg = passoEscala(Q.w * geo.mPorPx);
  const segPx = seg / geo.mPorPx;
  const bx = Q.x + 5 * MM, by = Q.y + Q.h - 9 * MM;
  caixa(ctx, QUADRO.x + 3, QUADRO.y + QUADRO.h - 16, Math.max(40, (segPx * 4) / MM + 14), 13, "rgba(255,255,255,0.85)", "#999", 0.15);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? "#fff" : "#222"; ctx.fillRect(bx + i * segPx, by, segPx, 1.8 * MM);
  }
  ctx.strokeStyle = "#222"; ctx.lineWidth = 0.2 * MM; ctx.strokeRect(bx, by, segPx * 4, 1.8 * MM);
  fonte(ctx, 7); ctx.fillStyle = "#222"; ctx.textBaseline = "bottom"; ctx.textAlign = "center";
  const unidade = seg * 4 >= 1000 ? "km" : "m";
  for (let i = 0; i <= 4; i++) {
    const v = unidade === "km" ? (seg * i) / 1000 : seg * i;
    ctx.fillText(`${String(Number(v.toFixed(3))).replace(".", ",")}${i === 4 ? " " + unidade : ""}`, bx + i * segPx, by - 0.8 * MM);
  }
  ctx.textAlign = "left"; ctx.textBaseline = "top"; fonte(ctx, 6.5);
  const escalaNum = Math.round((geo.mPorPx * DPI / 0.0254) / 100) * 100;
  ctx.fillText(`Escala aprox. 1:${escalaNum.toLocaleString("pt-BR")}`, bx, by + 2.8 * MM);

  // painel lateral: situação no Brasil
  const px = 207, pw = 83;
  caixa(ctx, px, 26, pw, 44);
  fonte(ctx, 7.5, true); ctx.fillStyle = COR.verde; ctx.textBaseline = "top";
  ctx.fillText("Situação no Brasil", (px + 2) * MM, 27.3 * MM);
  try { desenharSituacao(ctx, await malhaUFs(), (px + 1.5) * MM, 31 * MM, (pw - 3) * MM, 38 * MM); } catch (e) { /* sem situação */ }

  // legenda
  caixa(ctx, px, 72, pw, 84);
  fonte(ctx, 9, true); ctx.fillStyle = COR.verde;
  ctx.fillText("LEGENDA", (px + 4) * MM, 75 * MM);
  let ly = 82;
  for (const it of itensLegenda()) {
    desenharSimbolo(ctx, it, (px + 4) * MM, ly * MM);
    fonte(ctx, 7.5); ctx.fillStyle = COR.texto; ctx.textBaseline = "middle";
    ctx.fillText(it.rotulo, (px + 13) * MM, (ly + 1.8) * MM, (pw - 16) * MM);
    ctx.textBaseline = "top";
    ly += 6.5;
  }

  // dados e fontes
  caixa(ctx, px, 158, pw, 44, "#f7f5ec");
  const lat = estado.ponto[1], lon = estado.ponto[0];
  const linhas = [
    ["Empreendimento", $("empreendimento").value], ["Endereço", $("endereco").value],
    ["Coordenadas", `${dms(lat, "lat")} / ${dms(lon, "lon")}`],
    ["Município", estado.municipio ? `${estado.municipio.nome}/${estado.municipio.uf}` : ""],
    ["Responsável", $("responsavel").value], ["Data", $("data").value],
  ].filter(([, v]) => v);
  let ty = 160 * MM;
  for (const [r, v] of linhas) {
    fonte(ctx, 6.6, true); ctx.fillStyle = COR.texto;
    const w = ctx.measureText(`${r}: `).width;
    ctx.fillText(`${r}: `, (px + 2) * MM, ty);
    fonte(ctx, 6.6);
    const partes = quebrar(ctx, v, (pw - 4) * MM - w);
    partes.forEach((t, i) => ctx.fillText(t, (px + 2) * MM + (i ? 0 : w), ty + i * 3.1 * MM));
    ty += partes.length * 3.1 * MM + 0.4 * MM;
  }
  ty = Math.max(ty + 1.5 * MM, 183 * MM);
  fonte(ctx, 6.3);
  const fontes = `Sistema de referência: WGS 84 / Pseudo-Mercator (EPSG:3857) na imagem; coordenadas geográficas. ` +
    `Fonte: ${BASES[$("base").value].credito}` + (camadas.municipio.getSource().getFeatures().length ? "; limite municipal: IBGE" : "") +
    `. Gerado com GeoMapa QGIS.`;
  for (const t of quebrar(ctx, fontes, (pw - 4) * MM)) { ctx.fillText(t, (px + 2) * MM, ty); ty += 2.9 * MM; }
  return cv;
}

function desenharSituacao(ctx, ufs, x, y, w, h) {
  const bb = [-74.5, -34.5, -34.0, 5.8];
  const k = Math.min(w / (bb[2] - bb[0]), h / (bb[3] - bb[1]));
  const ox = x + (w - (bb[2] - bb[0]) * k) / 2, oy = y + (h - (bb[3] - bb[1]) * k) / 2;
  const P = ([lo, la]) => [ox + (lo - bb[0]) * k, oy + (bb[3] - la) * k];
  ctx.fillStyle = "#eeeeee"; ctx.strokeStyle = "#9e9e9e"; ctx.lineWidth = 0.15 * MM;
  for (const f of ufs.features) {
    const polis = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poli of polis) {
      ctx.beginPath();
      for (const anel of poli) anel.forEach((c, i) => { const [a, b] = P(c); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
      ctx.fill(); ctx.stroke();
    }
  }
  const [a, b] = P(estado.ponto);
  ctx.fillStyle = "#e31a1c"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.4 * MM;
  ctx.beginPath(); ctx.arc(a, b, 1.6 * MM, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
}

function itensLegenda() {
  const [r1, r2] = raios();
  const it = [{ tipo: "ponto", rotulo: $("rotulo").value.trim() || $("empreendimento").value.trim() || "Empreendimento" }];
  if (estado.lote) it.push({ tipo: "area", fill: "rgba(255,140,0,0.6)", stroke: "#c2410c", rotulo: "ADA – área do empreendimento" });
  if (modelo() === "influencia") {
    it.push({ tipo: "area", fill: "rgba(155,120,200,0.35)", stroke: "#5b3f8c", rotulo: `AID – raio de ${r1} m` });
    it.push({ tipo: "area", fill: "rgba(230,230,120,0.35)", stroke: "#8a8a1f", rotulo: `AII – faixa de ${r1} a ${r2} m` });
  }
  if (camadas.municipio.getSource().getFeatures().length)
    it.push({ tipo: "area", fill: "rgba(255,255,255,0)", stroke: "#111", rotulo: `Limite municipal – ${estado.municipio.nome}` });
  return it;
}

function desenharSimbolo(ctx, it, x, y) {
  if (it.tipo === "ponto") {
    ctx.fillStyle = "#e31a1c"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.5 * MM;
    ctx.beginPath(); ctx.arc(x + 3 * MM, y + 1.8 * MM, 1.7 * MM, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    return;
  }
  ctx.fillStyle = it.fill; ctx.fillRect(x, y, 6 * MM, 3.6 * MM);
  ctx.strokeStyle = it.stroke; ctx.lineWidth = 0.5 * MM; ctx.strokeRect(x, y, 6 * MM, 3.6 * MM);
}

function nomeArquivo(ext) {
  const base = ($("empreendimento").value || $("titulo").value || "mapa").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "mapa";
  return `${base}.${ext}`;
}

function baixar(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

async function comBotao(id, rotulo, fn) {
  const b = $(id), txt = b.textContent;
  for (const x of ["btn-png", "btn-pdf", "btn-qgis"]) $(x).disabled = true;
  b.textContent = rotulo;
  status("Preparando o arquivo… (o fundo do mapa é baixado em alta resolução)");
  try { await fn(); status("Arquivo pronto. Confira a pasta de downloads."); }
  catch (e) { console.error(e); status(`Não foi possível gerar o arquivo: ${e.message}`, true); }
  finally { b.textContent = txt; for (const x of ["btn-png", "btn-pdf", "btn-qgis"]) $(x).disabled = !estado.ponto; }
}

async function exportarPNG() {
  const cv = await montarLayout();
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  baixar(blob, nomeArquivo("png"));
}

async function exportarPDF() {
  const cv = await montarLayout();
  const pdf = new jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pdf.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 297, 210);
  pdf.setProperties({ title: $("titulo").value, creator: "GeoMapa QGIS" });
  pdf.save(nomeArquivo("pdf"));
}

/* ── pacote para o QGIS ───────────────────────────────────────────────── */

async function exportarQGIS() {
  const zip = new JSZip();
  const g = geometrias();
  const fc = (f) => JSON.stringify(turf.featureCollection([f]));
  const rot = $("rotulo").value.trim();
  zip.file("camadas/ponto.geojson", fc(turf.point(estado.ponto, { nome: rot || $("empreendimento").value || "Empreendimento" })));
  if (estado.lote) zip.file("camadas/lote.geojson", fc(estado.lote));
  if (modelo() === "influencia") {
    zip.file("camadas/aid.geojson", fc(turf.feature(g.aid.geometry, { area: "AID" })));
    zip.file("camadas/aii.geojson", fc(turf.feature(g.aii.geometry, { area: "AII" })));
  }
  if (camadas.municipio.getSource().getFeatures().length)
    zip.file("camadas/municipio.geojson", fc(turf.feature(estado.municipio.feature.geometry,
      { nome: estado.municipio.nome, uf: estado.municipio.uf, codigo_ibge: estado.municipio.feature.properties.codarea })));
  try { zip.file("camadas/brasil_ufs.geojson", JSON.stringify(await malhaUFs())); } catch (e) { /* situação opcional */ }
  const v = mapa.getView();
  const ext = ol.proj.transformExtent(v.calculateExtent(mapa.getSize()), "EPSG:3857", "EPSG:4326").map((n) => Number(n.toFixed(6)));
  const cfg = {
    titulo: $("titulo").value, subtitulo: $("subtitulo").value, empreendimento: $("empreendimento").value,
    endereco: $("endereco").value, responsavel: $("responsavel").value, data: $("data").value,
    rotulo_ponto: rot, nome_ponto: rot || "Empreendimento", modelo: modelo(), base: $("base").value,
    centro: estado.ponto, extent: ext, raios: raios(),
    municipio: estado.municipio ? `${estado.municipio.nome}/${estado.municipio.uf}` : "",
    gerado_em: new Date().toISOString(),
  };
  zip.file("mapa.json", JSON.stringify(cfg, null, 1));
  const script = await (await fetch("gerar_mapa_qgis.py")).text();
  zip.file("gerar_mapa_qgis.py", script);
  zip.file("LEIA-ME.txt", [
    "PACOTE PARA O QGIS – GeoMapa QGIS",
    "",
    "1. Descompacte este arquivo numa pasta.",
    "2. Abra o QGIS (versão 3.22 ou mais nova).",
    "3. Menu Complementos > Terminal Python > botão 'Mostrar editor'.",
    "4. No editor, abra gerar_mapa_qgis.py e clique em 'Executar script'.",
    "",
    "O QGIS carrega as camadas, cria um layout de impressão A4 (título, mapa, situação no Brasil,",
    "legenda, escala, norte, grade de coordenadas e dados) e salva nesta pasta:",
    "  mapa.pdf, mapa.png e mapa.qgz (projeto editável).",
    "",
    "Conteúdo:",
    "  mapa.json          textos, enquadramento, tipo de mapa e fundo escolhidos no site",
    "  camadas/*.geojson  ponto, lote, AID/AII, limite municipal (IBGE) e UFs (situação)",
    "",
    "Fontes: " + BASES[$("base").value].credito + "; malhas territoriais: IBGE.",
  ].join("\r\n"));
  baixar(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), nomeArquivo("zip").replace(".zip", "_qgis.zip"));
}

/* ── eventos ──────────────────────────────────────────────────────────── */

mapa.on("singleclick", (e) => {
  const [lon, lat] = ol.proj.toLonLat(e.coordinate);
  definirPonto(lon, lat, "clique");
});
$("form-busca").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("busca").value.trim();
  if (q.length >= 3) buscarEndereco(q);
});
for (const id of ["lat", "lon"]) $(id).addEventListener("change", () => {
  const la = Number(String($("lat").value).replace(",", ".")), lo = Number(String($("lon").value).replace(",", "."));
  if ($("lat").value && $("lon").value) definirPonto(lo, la, "coordenadas");
});
$("arquivo").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { await lerArquivo(f); }
  catch (err) { $("info-local").textContent = `Não foi possível ler o arquivo: ${err.message}.`; $("info-local").classList.add("erro"); }
});
document.querySelectorAll("input[name=modelo]").forEach((r) => r.addEventListener("change", () => {
  const m = modelo();
  $("base").value = m === "influencia" ? "satelite" : "osm";
  const titulos = { localizacao: "Mapa de localização do empreendimento", influencia: "Áreas de influência do empreendimento",
                    municipio: "Situação do empreendimento no município" };
  if (Object.values(titulos).includes($("titulo").value) || !$("titulo").value) $("titulo").value = titulos[m];
  aplicarBase();
  desenhar(true);
}));
for (const id of ["raio1", "raio2"]) $(id).addEventListener("change", () => desenhar(true));
$("mostrar-mun").addEventListener("change", () => desenhar(false));
$("base").addEventListener("change", aplicarBase);
$("rotulo").addEventListener("input", () => camadas.ponto.changed());
$("btn-png").addEventListener("click", () => comBotao("btn-png", "Gerando PNG…", exportarPNG));
$("btn-pdf").addEventListener("click", () => comBotao("btn-pdf", "Gerando PDF…", exportarPDF));
$("btn-qgis").addEventListener("click", () => comBotao("btn-qgis", "Montando o pacote…", exportarQGIS));
$("btn-ajuda").addEventListener("click", () => $("ajuda").showModal());

$("data").value = new Date().toLocaleDateString("pt-BR");
aplicarBase();
desenhar(false);
malhaUFs().catch(() => {});
