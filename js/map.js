/* TODO: Refactoring.
 * Especially: The markers contain the TLEs for the orbit and there is
 * a tle Array (line 14). I don't want to store the tles twice
 */

let leafletMap;
let attribution;
let satIcon = L.icon({
  iconUrl: "img/sat_icon.png",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15]
});
let tleDate;
let tleTime;
let tles = [];
let lastUpdate;

initializeMap()
  .then(parseTles)
  .then(getPositions)
  .then(getFeatures)
  .then(drawMarkers)
  .then(updateFeatures)
  .catch(error => console.error('Fehler in der Initialisierung:', error));

function convertTime(tleDateString) {
  let d = tleDateString.split(" ");
  let formattedDateString =
    d[1] + " " + d[2] + " " + d[0] + " " + d[3] + " GMT+00";
  let time = Date.parse(formattedDateString);
  return time;
}

async function parseTles() {
  try {
    const response = await fetch("tles.txt");
    const data = await response.text();
    console.log("Geladene TLEs:", data);
    
    tleDate = new Date();
    
    let lines = data.split("\n");
    for (let i = 0; i < lines.length; i += 3) {
      if (lines[i] && lines[i + 1] && lines[i + 2]) {
        tles.push([lines[i].trim(), lines[i + 1].trim(), lines[i + 2].trim()]);
      }
    }
    console.log("Verarbeitete TLEs:", tles);
    return tles;
  } catch (error) {
    console.error("Fehler beim Laden der TLEs:", error);
    return [];
  }
}

async function getPositions(parsedTLEs) {
  try {
    let currentDate = new Date();
    const positions = parsedTLEs.reduce((result, currentEntry) => {
      let satrec = satellite.twoline2satrec(currentEntry[1], currentEntry[2]);
      if (!satrec) return result;

      let positionAndVelocity = satellite.propagate(satrec, currentDate);
      if (!positionAndVelocity.position) return result;

      let positionGd = satellite.eciToGeodetic(
        positionAndVelocity.position,
        satellite.gstime(currentDate)
      );
      result.push([currentEntry, positionGd]);
      return result;
    }, []);
    console.log("Berechnete Positionen:", positions);
    return positions;
  } catch (error) {
    console.error("Fehler bei der Positionsberechnung:", error);
    return [];
  }
}

async function getFeatures(satellites) {
  return satellites.reduce((result, currentEntry) => {
    result.push({
      type: "Feature",
      properties: {
        tle: currentEntry[0],
        height: currentEntry[1].height,
      },
      geometry: {
        type: "Point",
        coordinates: [
          satellite.degreesLong(currentEntry[1].longitude),
          satellite.degreesLat(currentEntry[1].latitude),
        ],
      },
    });
    return result;
  }, []);
}

async function updateFeatures(markers) {
  let currentDate = Date.now();
  if (lastUpdate === undefined || currentDate - lastUpdate > 1000) {
    lastUpdate = currentDate;
  } else {
    window.requestAnimationFrame(() => {
      updateFeatures(markers);
    });
    return;
  }
  lastUpdate = currentDate;

  const newPositions = await getPositions(tles);
  markers.forEach((marker, i) => {
    if (!newPositions[i]) return;
    
    marker.setLatLng([
      satellite.degreesLat(newPositions[i][1].latitude),
      satellite.degreesLong(newPositions[i][1].longitude)
    ]);
    marker.feature.properties.height = newPositions[i][1].height;
    marker.feature.geometry.coordinates = [
      satellite.degreesLong(newPositions[i][1].longitude),
      satellite.degreesLat(newPositions[i][1].latitude)
    ];
  });

  window.requestAnimationFrame(() => {
    updateFeatures(markers);
  });
}

function getOrbitFeatures(tle) {
  let orbitLines = [[]];
  let orbitLinesIndex = 0;
  let currentTime = new Date().getTime() - 2700000;
  let endTime = currentTime + 5400000;
  let step = 20000;
  let lastLon;

  for (currentTime; currentTime <= endTime; currentTime += step) {
    let satrec = satellite.twoline2satrec(tle[1], tle[2]);
    let positionAndVelocity = satellite.propagate(
      satrec,
      new Date(currentTime)
    );
    let positionGd = satellite.eciToGeodetic(
      positionAndVelocity.position,
      satellite.gstime(new Date(currentTime))
    );
    let lon = satellite.degreesLong(positionGd.longitude);
    let lat = satellite.degreesLat(positionGd.latitude);

    if (lastLon >>> 63 !== lon >>> 63 && Math.abs(lastLon) > 100) {
      orbitLinesIndex++;
      orbitLines.push([[lon, lat]]);
    } else {
      orbitLines[orbitLinesIndex].push([lon, lat]);
    }
    lastLon = lon;
  }

  let orbitFeatures = [];
  orbitLines.forEach((line) => {
    orbitFeatures.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: line,
      },
    });
  });
  return orbitFeatures;
}

async function initializeMap() {
  leafletMap = await L.map(document.getElementById("map"), {
    zoom: 4,
    center: [48.13, 11.57],
    worldCopyJump: true,
    attributionControl: false,
    layers: [L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")],
  });
  
  attribution = await L.control
    .attribution({
      position: "topright",
      prefix: "",
    })
    .addTo(leafletMap);
    
  L.control
    .locate({
      drawCircle: true,
      keepCurrentZoomLevel: true,
    })
    .addTo(leafletMap);
    
  return;
}

async function drawMarkers(features) {
  if (!features || features.length === 0) {
    console.error('Keine Features zum Zeichnen vorhanden');
    return [];
  }

  let markers = [];
  let orbitLayer = L.layerGroup();
  
  attribution.setPrefix(
    ' <a href="https://www.celestrak.com/NORAD/elements/supplemental/" target="_blank">TLE</a>: ' +
      tleDate.toLocaleTimeString() +
      " |" +
      ' <a href="privacy.html">Datenschutz</a> |' +
      ' <a href="https://leafletjs.com">Leaflet</a> |' +
      ' <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  );
  
  L.geoJSON(features, {
    pointToLayer: function (feature, latlng) {
      let marker = L.marker(latlng, { icon: satIcon }).bindPopup(
        feature.properties.tle[0] +
          " (" +
          feature.properties.height.toFixed(2) +
          " km)"
      );
      markers.push(marker);
      return marker;
    },
    onEachFeature: function (feature, layer) {
      layer.on({
        click: function () {
          layer.openPopup();
          orbitLayer
            .addLayer(
              L.geoJSON(getOrbitFeatures(feature.properties.tle), {
                style: {
                  color: "gray",
                },
              })
            )
            .addTo(leafletMap);
        },
        move: function () {
          if (layer.getPopup().isOpen()) {
            layer
              .getPopup()
              .setContent(
                feature.properties.tle[0] +
                  " (" +
                  feature.properties.height.toFixed(2) +
                  " km)"
              );
          }
        },
        popupclose: function () {
          orbitLayer.clearLayers();
        },
      });
    },
  }).addTo(leafletMap);
  
  return markers;
}