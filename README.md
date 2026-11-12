# GeoMapa QGIS

Site gratuito para gerar mapas de **localização** e de **áreas de influência (ADA, AID e AII)** direto no navegador,
e baixar um **pacote pronto para o QGIS**.

**Acesse:** https://alexandreconsltecstma-web.github.io/geomapa-qgis/

## O que faz

- Marca o local por endereço, coordenadas, clique no mapa ou arquivo **KML, KMZ ou GeoJSON** (ponto e lote).
- Três tipos de mapa: localização (ruas), áreas de influência (satélite, raios configuráveis) e situação no município
  (limite municipal do IBGE identificado a partir do ponto).
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
Malhas territoriais: API de Malhas do IBGE. Busca de endereço: Nominatim (OpenStreetMap).
Bibliotecas: OpenLayers, Turf, toGeoJSON, JSZip e jsPDF.
