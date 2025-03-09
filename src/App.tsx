import { useState, useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import * as toGeoJSON from "@tmcw/togeojson";
import { DOMParser } from "xmldom";
import "leaflet/dist/leaflet.css";
import "./App.css";
import L from "leaflet";

interface ElementCount {
  Point: number;
  LineString: number;
  Polygon: number;
  MultiLineString: number;
}

interface DetailItem {
  type: "LineString" | "MultiLineString";
  length: string;
  name: string;
}

interface GeoJsonFeature {
  geometry: {
    type: string;
    coordinates: number[][] | number[][][];
  } | null;
  properties: {
    name?: string;
  };
}

interface GeoJsonData {
  features: GeoJsonFeature[];
}

function MapUpdater({ geoJson }: { geoJson: GeoJsonData | null }) {
  const map = useMap();

  useEffect(() => {
    if (geoJson && geoJson.features.length > 0) {
      const bounds = new L.LatLngBounds([]);
      let hasValidBounds = false;

      geoJson.features.forEach((feature) => {
        if (feature.geometry && feature.geometry.coordinates) {
          const coordinates = feature.geometry.coordinates;
          if (feature.geometry.type === "Point") {
            const [lon, lat] = coordinates as unknown as number[];
            if (typeof lat === "number" && typeof lon === "number") {
              bounds.extend([lat, lon]);
              hasValidBounds = true;
            }
          } else if (feature.geometry.type === "LineString") {
            (coordinates as number[][]).forEach((coord) => {
              const [lon, lat] = coord;
              if (typeof lat === "number" && typeof lon === "number") {
                bounds.extend([lat, lon]);
                hasValidBounds = true;
              }
            });
          } else if (feature.geometry.type === "MultiLineString") {
            (coordinates as number[][][]).forEach((line) =>
              line.forEach((coord) => {
                const [lon, lat] = coord;
                if (typeof lat === "number" && typeof lon === "number") {
                  bounds.extend([lat, lon]);
                  hasValidBounds = true;
                }
              })
            );
          }
        }
      });

      if (hasValidBounds && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [geoJson, map]);

  return null;
}

function App() {
  const [kmlData, setKmlData] = useState<Document | null>(null);
  const [geoJson, setGeoJson] = useState<GeoJsonData | null>(null);
  const [summary, setSummary] = useState<ElementCount | null>(null);
  const [details, setDetails] = useState<DetailItem[] | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        const parser = new DOMParser();
        const kmlDoc = parser.parseFromString(text, "text/xml");
        const geojson = toGeoJSON.kml(kmlDoc) as GeoJsonData;
        setKmlData(kmlDoc);
        setGeoJson(geojson);
      } catch (error) {
        console.error("Error parsing KML file:", error);
        alert("Failed to parse KML file. Please ensure it's valid.");
      }
    };

    reader.readAsText(file);
  };

  const showSummary = () => {
    if (!geoJson || !geoJson.features) return;

    const elementCount: ElementCount = {
      Point: 0,
      LineString: 0,
      Polygon: 0,
      MultiLineString: 0,
    };

    geoJson.features.forEach((feature) => {
      if (feature.geometry && feature.geometry.type) {
        const type = feature.geometry.type as keyof ElementCount;
        elementCount[type] = (elementCount[type] || 0) + 1;
      }
    });

    setSummary(elementCount);
    setDetails(null);
  };

  const showDetails = () => {
    if (!geoJson || !geoJson.features) return;

    const detailedData: DetailItem[] = [];

    geoJson.features.forEach((feature) => {
      if (!feature.geometry || !feature.geometry.type) return;

      const type = feature.geometry.type;
      let length = 0;

      if (type === "LineString" || type === "MultiLineString") {
        const coordinates =
          type === "LineString"
            ? (feature.geometry.coordinates as number[][])
            : (feature.geometry.coordinates.flat(1) as number[][]);

        if (!coordinates || coordinates.length < 2) return;

        for (let i = 0; i < coordinates.length - 1; i++) {
          const coord1 = coordinates[i];
          const coord2 = coordinates[i + 1];

          if (
            !coord1 ||
            !coord2 ||
            coord1.length < 2 ||
            coord2.length < 2 ||
            typeof coord1[0] !== "number" ||
            typeof coord1[1] !== "number" ||
            typeof coord2[0] !== "number" ||
            typeof coord2[1] !== "number"
          )
            continue;

          length += calculateDistance(
            coord1[1],
            coord1[0],
            coord2[1],
            coord2[0]
          );
        }

        detailedData.push({
          type: type as "LineString" | "MultiLineString",
          length: length.toFixed(2),
          name: feature.properties.name || "Unnamed",
        });
      }
    });

    setDetails(detailedData);
    setSummary(null);
  };

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Custom style function for GeoJSON features
  const geoJsonStyle = (feature: GeoJsonFeature) => {
    if (!feature.geometry) return {};

    switch (feature.geometry.type) {
      case "Point":
        return {
          color: "#ff7800",
          radius: 6,
          fillColor: "#ff7800",
          fillOpacity: 0.65,
          weight: 2,
        };
      case "LineString":
      case "MultiLineString":
        return {
          color: "#ff7800",
          weight: 2,
          opacity: 0.65,
        };
      default:
        return {
          color: "#ff7800",
          weight: 2,
          opacity: 0.65,
        };
    }
  };

  // Custom point rendering
  const pointToLayer = (_feature: GeoJsonFeature, latlng: L.LatLng) => {
    return L.circleMarker(latlng);
  };

  return (
    <div className="App">
      <h1>KML Viewer</h1>

      <div className="controls">
        <input type="file" accept=".kml" onChange={handleFileUpload} />
        <button onClick={showSummary} disabled={!geoJson}>
          Show Summary
        </button>
        <button onClick={showDetails} disabled={!geoJson}>
          Show Details
        </button>
      </div>

      <div className="content">
        <div className="map-container">
          <MapContainer
            center={[51.505, -0.09] as [number, number]}
            zoom={13}
            style={{ height: "400px", width: "100%" }}
            key={geoJson ? JSON.stringify(geoJson) : "empty"}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {geoJson && geoJson.features.length > 0 && (
              <GeoJSON
                key={JSON.stringify(geoJson)}
                data={geoJson}
                style={geoJsonStyle}
                pointToLayer={pointToLayer}
              />
            )}
            <MapUpdater geoJson={geoJson} />
          </MapContainer>
        </div>

        <div className="info">
          {summary && (
            <table>
              <thead>
                <tr>
                  <th>Element Type</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary).map(
                  ([type, count]) =>
                    count > 0 && (
                      <tr key={type}>
                        <td>{type}</td>
                        <td>{count}</td>
                      </tr>
                    )
                )}
              </tbody>
            </table>
          )}

          {details && (
            <>
              {details.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Length (km)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((item, index) => (
                      <tr key={index}>
                        <td>{item.name}</td>
                        <td>{item.type}</td>
                        <td>{item.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No line elements found to calculate lengths.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
