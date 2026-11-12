"""Monta no QGIS o mapa baixado do site "Mapas QGIS" e exporta PDF, PNG e o projeto (.qgz).

Como usar no QGIS (3.22 ou mais novo):
  1. Descompacte o pacote .zip numa pasta.
  2. No QGIS: menu Complementos > Terminal Python > botão "Mostrar editor".
  3. No editor, abra este arquivo (gerar_mapa_qgis.py) e clique em "Executar script".
  O mapa é carregado no QGIS, um layout de impressão é criado e os arquivos
  mapa.pdf, mapa.png e mapa.qgz são salvos na mesma pasta.

Também roda fora da interface:  python3 gerar_mapa_qgis.py   (com o PyQGIS instalado)
"""
import json
import os
import sys

from qgis.core import (
    QgsApplication, QgsCoordinateReferenceSystem, QgsCoordinateTransform, QgsFillSymbol, QgsLayoutExporter,
    QgsLayoutItemLabel, QgsLayoutItemLegend, QgsLayoutItemMap, QgsLayoutItemMapGrid, QgsLayoutItemMapOverview,
    QgsLayoutItemPage, QgsLayoutItemPicture, QgsLayoutItemScaleBar, QgsLayoutItemShape, QgsLayoutMeasurement,
    QgsLayoutPoint, QgsLayoutSize, QgsLayerTree, QgsLegendStyle, QgsMarkerSymbol, QgsPalLayerSettings, QgsPrintLayout,
    QgsProject, QgsRasterLayer, QgsRectangle, QgsSingleSymbolRenderer, QgsTextBufferSettings, QgsTextFormat,
    QgsUnitTypes, QgsVectorLayer, QgsVectorLayerSimpleLabeling, QgsSymbolLayerUtils, QgsPathResolver,
)
from qgis.PyQt.QtCore import Qt
from qgis.PyQt.QtGui import QColor, QFont

BASES = {
    "osm": ("OpenStreetMap", "https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© colaboradores do OpenStreetMap"),
    "satelite": ("Imagem de satélite (Esri)",
                 "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                 "Esri World Imagery (Esri, Maxar, Earthstar Geographics)"),
    "topo": ("OpenTopoMap", "https://tile.opentopomap.org/{z}/{x}/{y}.png", "© OpenTopoMap (CC-BY-SA), © OpenStreetMap"),
}
VERDE, OURO, TXT = "#3e5a1e", "#795c01", "#333333"


def pasta_do_pacote():
    if "__file__" in globals():
        return os.path.dirname(os.path.abspath(__file__))
    from qgis.PyQt.QtWidgets import QFileDialog
    return QFileDialog.getExistingDirectory(None, "Selecione a pasta do pacote descompactado")


def fmt(tam, cor=TXT, negrito=False, buffer=False):
    f = QgsTextFormat()
    fonte = QFont("Arial")
    fonte.setBold(negrito)
    f.setFont(fonte)
    f.setSize(tam)
    f.setColor(QColor(cor))
    if buffer:
        b = QgsTextBufferSettings()
        b.setEnabled(True)
        b.setSize(0.8)
        b.setColor(QColor("white"))
        f.setBuffer(b)
    return f


def camada(pasta, arq, nome, geo):
    caminho = os.path.join(pasta, arq)
    if not os.path.exists(caminho):
        return None
    lyr = QgsVectorLayer(caminho, nome, "ogr")
    if not lyr.isValid():
        return None
    if lyr.crs().authid() in ("EPSG:4326", ""):
        lyr.setCrs(geo)  # GeoJSON em graus; tratado como SIRGAS 2000 (diferença centimétrica)
    QgsProject.instance().addMapLayer(lyr, False)
    return lyr


def preencher(lyr, cor, borda, larg):
    lyr.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple(
        {"color": cor, "outline_color": borda, "outline_width": str(larg)})))


def rotulo(lyr, texto, tam=8, cor="#b00000"):
    s = QgsPalLayerSettings()
    s.fieldName = texto
    s.isExpression = True
    s.setFormat(fmt(tam, cor, True, True))
    s.placement = QgsPalLayerSettings.AroundPoint if lyr.geometryType() == 0 else QgsPalLayerSettings.OverPoint
    lyr.setLabeling(QgsVectorLayerSimpleLabeling(s))
    lyr.setLabelsEnabled(True)


def mm(x, y):
    return QgsLayoutPoint(x, y, QgsUnitTypes.LayoutMillimeters)


def tam(w, h):
    return QgsLayoutSize(w, h, QgsUnitTypes.LayoutMillimeters)


def caixa(lay, x, y, w, h, cor="white", borda="#777777", larg=0.25):
    r = QgsLayoutItemShape(lay)
    r.setShapeType(QgsLayoutItemShape.Rectangle)
    r.setSymbol(QgsFillSymbol.createSimple({"color": cor, "outline_color": borda, "outline_width": str(larg)}))
    lay.addLayoutItem(r)
    r.attemptMove(mm(x, y))
    r.attemptResize(tam(w, h))


def texto(lay, x, y, w, h, conteudo, t=8, cor=TXT, negrito=False, html=False, valign=Qt.AlignTop):
    lb = QgsLayoutItemLabel(lay)
    if html:
        lb.setMode(QgsLayoutItemLabel.ModeHtml)
        conteudo = f"<div style='font-family:Arial;font-size:{t}pt;color:{cor};line-height:125%'>{conteudo}</div>"
    lb.setText(conteudo)
    lb.setTextFormat(fmt(t, cor, negrito))
    lb.setVAlign(valign)
    lay.addLayoutItem(lb)
    lb.attemptMove(mm(x, y))
    lb.attemptResize(tam(w, h))


def escala_redonda(largura_m):
    """Segmento redondo (km): os 4 segmentos ocupam no máximo ~1/3 da largura do mapa (cabem na caixa da escala)."""
    alvo = largura_m / 16.0
    for p in range(0, 7):
        for v in (1, 2, 2.5, 5):
            if v * 10 ** p >= alvo:
                return v * 10 ** p / 1000.0
    return 1000.0


def esc(t):
    return str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main():
    pasta = pasta_do_pacote()
    cfg = json.load(open(os.path.join(pasta, "mapa.json"), encoding="utf-8"))
    proj = QgsProject.instance()
    proj.clear()
    geo = QgsCoordinateReferenceSystem("EPSG:4674")
    lon, lat = cfg["centro"]
    zona = int((lon + 180) / 6) + 1
    utm = QgsCoordinateReferenceSystem(f"EPSG:{(31960 if lat < 0 else 31954) + zona}")
    proj.setCrs(utm)
    proj.setEllipsoid("GRS80")

    # camadas (de cima para baixo)
    cam, leg = [], []
    ponto = camada(pasta, "camadas/ponto.geojson", cfg.get("nome_ponto") or "Empreendimento", geo)
    if ponto:
        ponto.setRenderer(QgsSingleSymbolRenderer(QgsMarkerSymbol.createSimple(
            {"name": "circle", "color": "#e31a1c", "outline_color": "white", "outline_width": "0.5", "size": "3.6"})))
        if cfg.get("rotulo_ponto"):
            rotulo(ponto, "'" + cfg["rotulo_ponto"].replace("'", " ") + "'")
        cam.append(ponto)
        leg.append(ponto)
    for arq, nome, cor, borda in (("camadas/lote.geojson", "ADA – área do empreendimento", "255,140,0,150", "#c2410c"),
                                  ("camadas/aid.geojson", f"AID – raio de {cfg['raios'][0]:g} m", "155,120,200,70", "#5b3f8c"),
                                  ("camadas/aii.geojson", f"AII – faixa de {cfg['raios'][0]:g} a {cfg['raios'][1]:g} m",
                                   "230,230,120,60", "#8a8a1f")):
        if cfg["modelo"] != "influencia" and "ai" in arq:
            continue
        lyr = camada(pasta, arq, nome, geo)
        if lyr:
            preencher(lyr, cor, borda, 0.6)
            cam.append(lyr)
            leg.append(lyr)
    mun = camada(pasta, "camadas/municipio.geojson", f"Limite municipal – {cfg.get('municipio') or ''}".strip(" –"), geo)
    if mun:
        preencher(mun, "0,0,0,0", "#111111", 0.9)
        cam.append(mun)
        leg.append(mun)
    nome_base, url, credito = BASES.get(cfg.get("base", "osm"), BASES["osm"])
    base = QgsRasterLayer(f"type=xyz&url={url}&zmax=19&zmin=0", nome_base, "wms")
    proj.addMapLayer(base, False)
    cam.append(base)
    ufs = camada(pasta, "camadas/brasil_ufs.geojson", "UFs", geo)
    if ufs:
        preencher(ufs, "#eeeeee", "#9e9e9e", 0.1)

    # layout A4 paisagem
    lay = QgsPrintLayout(proj)
    lay.initializeDefaults()
    lay.setName(cfg.get("titulo", "Mapa")[:60])
    lay.pageCollection().page(0).setPageSize("A4", QgsLayoutItemPage.Landscape)
    caixa(lay, 4, 4, 289, 202, "white", "#333333", 0.5)
    caixa(lay, 4, 4, 289, 17, VERDE, VERDE, 0.1)
    caixa(lay, 4, 21, 289, 1.0, OURO, OURO, 0.1)
    texto(lay, 9, 5.2, 279, 9, (cfg.get("titulo") or "Mapa").upper(), 15, "white", True, valign=Qt.AlignVCenter)
    texto(lay, 9, 13.2, 279, 7, cfg.get("subtitulo", ""), 8.5, "#e8e2c8", valign=Qt.AlignVCenter)

    mx, my, mw, mh = 13, 29, 188, 168
    mapa = QgsLayoutItemMap(lay)
    mapa.setCrs(utm)
    mapa.setLayers(cam)
    mapa.setKeepLayerSet(True)
    mapa.setFrameEnabled(True)
    mapa.setFrameStrokeWidth(QgsLayoutMeasurement(0.4))
    lay.addLayoutItem(mapa)
    mapa.attemptMove(mm(mx, my))
    mapa.attemptResize(tam(mw, mh))
    e = cfg["extent"]
    ext = QgsCoordinateTransform(geo, utm, proj).transformBoundingBox(QgsRectangle(e[0], e[1], e[2], e[3]))
    mapa.zoomToExtent(ext)
    larg_graus = e[2] - e[0]
    g = QgsLayoutItemMapGrid("Coordenadas", mapa)
    g.setCrs(geo)
    passo = max(larg_graus / 4.0, 1e-4)
    g.setIntervalX(passo)
    g.setIntervalY(passo)
    g.setStyle(QgsLayoutItemMapGrid.Cross)
    g.setCrossLength(1.6)
    g.setAnnotationEnabled(True)
    g.setAnnotationFormat(QgsLayoutItemMapGrid.DegreeMinuteSecond if passo < 0.05 else QgsLayoutItemMapGrid.DegreeMinute)
    g.setAnnotationPrecision(0)
    g.setAnnotationTextFormat(fmt(6.5))
    for lado in (QgsLayoutItemMapGrid.Left, QgsLayoutItemMapGrid.Right):
        g.setAnnotationDirection(QgsLayoutItemMapGrid.VerticalDescending, lado)
    g.setFrameStyle(QgsLayoutItemMapGrid.InteriorTicks)
    g.setFrameWidth(1.5)
    mapa.grids().addGrid(g)

    caixa(lay, mx + mw - 15, my + 3, 12, 15, "255,255,255,215", "#999999", 0.15)
    norte = QgsLayoutItemPicture(lay)
    norte.setPicturePath(QgsSymbolLayerUtils.svgSymbolNameToPath("arrows/NorthArrow_02.svg", QgsPathResolver()))
    lay.addLayoutItem(norte)
    norte.attemptMove(mm(mx + mw - 13.5, my + 4))
    norte.attemptResize(tam(9, 13))

    largura_m = ext.width() * (mw / max(mw, mh * ext.width() / max(ext.height(), 1)))
    caixa(lay, mx + 3, my + mh - 16, 86, 13, "255,255,255,215", "#999999", 0.15)
    sb = QgsLayoutItemScaleBar(lay)
    sb.setStyle("Single Box")
    sb.setLinkedMap(mapa)
    sb.setUnits(QgsUnitTypes.DistanceKilometers)
    sb.setUnitLabel("km")
    sb.setNumberOfSegments(4)
    sb.setNumberOfSegmentsLeft(0)
    sb.setUnitsPerSegment(escala_redonda(largura_m))
    sb.setHeight(1.8)
    sb.setTextFormat(fmt(7))
    lay.addLayoutItem(sb)
    sb.attemptMove(mm(mx + 5, my + mh - 15.5))
    texto(lay, mx + 5, my + mh - 6.6, 60, 3, "Escala aprox. 1:" + f"{int(round(mapa.scale(), -2)):,}".replace(",", "."), 6.5)

    px, pw = 207, 83
    caixa(lay, px, 26, pw, 44)
    texto(lay, px + 2, 26.8, pw - 4, 4, "Situação no Brasil", 7.5, VERDE, True)
    if ufs:
        ins = QgsLayoutItemMap(lay)
        ins.setCrs(geo)
        ins.setLayers([ufs])
        ins.setKeepLayerSet(True)
        lay.addLayoutItem(ins)
        ins.attemptMove(mm(px + 1.5, 31))
        ins.attemptResize(tam(pw - 3, 38))
        ins.zoomToExtent(QgsRectangle(-74.5, -34.5, -34.0, 5.8))
        ov = QgsLayoutItemMapOverview("local", ins)
        ins.overviews().addOverview(ov)
        ov.setLinkedMap(mapa)
        ov.setFrameSymbol(QgsFillSymbol.createSimple({"color": "227,26,28,200", "outline_color": "#e31a1c", "outline_width": "1.2"}))

    caixa(lay, px, 72, pw, 84)
    lg = QgsLayoutItemLegend(lay)
    lg.setTitle("LEGENDA")
    lg.setLinkedMap(mapa)
    lg.setAutoUpdateModel(False)
    raiz = QgsLayerTree()
    for lyr in leg:
        raiz.addLayer(lyr)
    lg.model().setRootGroup(raiz)
    main.raiz = raiz  # mantém a árvore viva enquanto o layout existir
    lg.setFrameEnabled(False)
    lg.rstyle(QgsLegendStyle.Title).setTextFormat(fmt(9, VERDE, True))
    lg.rstyle(QgsLegendStyle.SymbolLabel).setTextFormat(fmt(7))
    lay.addLayoutItem(lg)
    lg.attemptMove(mm(px + 1.5, 73))
    lg.setResizeToContents(False)
    lg.attemptResize(tam(pw - 3, 82))

    caixa(lay, px, 158, pw, 44, "#f7f5ec")
    info = "".join(f"<b>{esc(r)}:</b> {esc(v)}<br>" for r, v in (
        ("Empreendimento", cfg.get("empreendimento")), ("Endereço", cfg.get("endereco")),
        ("Coordenadas", f"{lat:.6f}, {lon:.6f}"), ("Responsável", cfg.get("responsavel")), ("Data", cfg.get("data"))) if v)
    texto(lay, px + 2, 159.2, pw - 4, 25, info, 6.6, html=True)
    texto(lay, px + 2, 183, pw - 4, 18.5,
          f"<b>Sistema de referência:</b> SIRGAS 2000 / UTM {zona}{'S' if lat < 0 else 'N'} ({utm.authid()})<br>"
          f"<b>Fonte:</b> {esc(credito)}" + (" ; limite municipal: IBGE" if mun else "") +
          (f"; {esc(cfg['fonte_extra'])}" if cfg.get("fonte_extra") else "") + ". Gerado com QGIS.", 6.3, html=True)

    proj.layoutManager().addLayout(lay)
    exp = QgsLayoutExporter(lay)
    pdf = exp.exportToPdf(os.path.join(pasta, "mapa.pdf"), QgsLayoutExporter.PdfExportSettings())
    st = QgsLayoutExporter.ImageExportSettings()
    st.dpi = 200
    png = exp.exportToImage(os.path.join(pasta, "mapa.png"), st)
    proj.write(os.path.join(pasta, "mapa.qgz"))
    ok = pdf == QgsLayoutExporter.Success and png == QgsLayoutExporter.Success
    print("Mapa gerado:" if ok else "Houve um problema ao exportar:", os.path.join(pasta, "mapa.pdf"))
    try:
        from qgis.utils import iface
        if iface:
            iface.mapCanvas().setDestinationCrs(utm)
            for lyr in reversed(cam):
                proj.layerTreeRoot().insertLayer(0, lyr)
            iface.mapCanvas().setExtent(ext)
            iface.mapCanvas().refresh()
            iface.openLayoutDesigner(lay)
    except Exception:
        pass


if __name__ == "__main__" and QgsApplication.instance() is None:
    QgsApplication.setPrefixPath("/usr", True)
    _app = QgsApplication([], False)
    _app.initQgis()
    main()
    _app.exitQgis()
else:
    main()
