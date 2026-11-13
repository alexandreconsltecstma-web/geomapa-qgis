# GeoMapa QGIS

Site gratuito para gerar mapas de **localização**, **áreas de influência (ADA, AID e AII)**, **meio físico**,
**clima**, **qualidade do ar** e **biomas** direto no navegador, e baixar um **pacote pronto para o QGIS**.

**Acesse:** https://alexandreconsltecstma-web.github.io/geomapa-qgis/

**Painel de condicionantes (PA Consultoria):** https://alexandreconsltecstma-web.github.io/geomapa-qgis/painel/ – dashboard,
agenda de entregas, licenças e calendário; o botão "Fazer mapas" de cada licença abre o GeoMapa com os dados da empresa.

## O que faz

- Marca o local por endereço, coordenadas, clique no mapa ou arquivo **KML, KMZ ou GeoJSON** (ponto e lote).
- Três tipos de mapa: localização (ruas), áreas de influência (satélite, raios configuráveis) e situação no município
  (limite municipal do IBGE identificado a partir do ponto).
- Mapas temáticos, com legenda das classes presentes e o valor no ponto:
  - **Uso e cobertura do solo** – Esri / Impact Observatory, Sentinel-2 10 m (2024)
  - **Hidrografia** – base oficial da ANA (trechos de drenagem com nome e dominialidade, massas d'água), completada com o
    OpenStreetMap; distâncias medidas a partir do lote (KML), faixa marginal de 30 m opcional, região hidrográfica e ottobacia
  - **Áreas protegidas** – UCs federais e cavernas (ICMBio/CANIE), UCs estaduais/municipais e terras indígenas (ANA/SNIRH),
    com a distância até o lote e alertas de 3 km (CONAMA 428/2010) e 250 m de cavernas (CONAMA 347/2004)
  - **Hipsometria** e **declividade** (classes da Embrapa) – Mapzen Terrain Tiles (SRTM ~30 m)
  - **Solos** – IBGE/BDiA, pedologia 1:250.000 (SiBCS), servida por este site em blocos de 5°
  - **Geologia** – SGB/CPRM, litoestratigrafia 1:1.000.000
  - **Clima (Köppen)**, **precipitação** e **temperatura** – CHELSA v2.1 (1981–2010), com **climograma** do ponto
    (distribuição mensal do ERA5 ajustada aos totais da CHELSA)
  - **Qualidade do ar** – aerossóis MERRA-2 (NASA GIBS) e concentrações médias de MP2,5, MP10, NO₂, O₃, SO₂ e CO (CAMS)
  - **Biomas** – IBGE (2019)
- Baixa o mapa em **PNG ou PDF A4** com título, grade de coordenadas, norte, escala, situação no Brasil, legenda e dados.
- Baixa um **pacote .zip para o QGIS** com as camadas (GeoJSON), os parâmetros (`mapa.json`) e o script
  `gerar_mapa_qgis.py`, que monta o mesmo layout no QGIS e salva `mapa.pdf`, `mapa.png` e `mapa.qgz`.

## Usar o pacote no QGIS

1. Descompacte o .zip numa pasta.
2. No QGIS (3.22 ou mais novo): *Complementos › Terminal Python › Mostrar editor*.
3. Abra `gerar_mapa_qgis.py` e clique em *Executar script*.

## Dados e privacidade

Tudo roda no navegador; os dados digitados não são enviados a nenhum servidor deste site.
Fundos de mapa: © colaboradores do OpenStreetMap, Esri World Imagery, OpenTopoMap.
Malhas territoriais: API de Malhas do IBGE. Fontes dos temas: ver a lista acima.
Os temas são bases de escala regional: servem para caracterização e não substituem levantamento de campo. Busca de endereço: Nominatim (OpenStreetMap).
Bibliotecas: OpenLayers, Turf, toGeoJSON, JSZip e jsPDF.
