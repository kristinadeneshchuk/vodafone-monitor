'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  key: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
  avgRisk: number;
  topCause: string;
  samples: string[];
}

/** Колір за рівнем ризику — та сама шкала, що й у решті системи. */
function riskColor(risk: number) {
  if (risk >= 80) return '#b91c1c';
  if (risk >= 60) return '#dc2626';
  if (risk >= 30) return '#f59e0b';
  return '#64748b';
}

/**
 * Радіус за кількістю скарг. Квадратний корінь, а не лінійна шкала:
 * інакше Київ із сотнями згадок закриває собою пів карти, а міста
 * з десятком скарг стають невидимі.
 */
function radiusFor(count: number) {
  return Math.max(6, Math.min(34, Math.sqrt(count) * 3.2));
}

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [40, 40] },
    );
  }, [points, map]);
  return null;
}

export default function MapView({ points }: { points: MapPoint[] }) {
  return (
    <MapContainer
      center={[48.9, 31.2]}
      zoom={6}
      scrollWheelZoom
      className="relative z-0"
      style={{ height: '100%', width: '100%', borderRadius: '0.75rem', zIndex: 0 }}
    >
      {/* Звичайний OpenStreetMap: безкоштовно й без ключа.
          Плитки CartoDB виглядають краще, але тепер вимагають API-ключ
          і малюють "API KEY REQUIRED" просто поверх карти. */}
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {points.map(p => (
        <CircleMarker
          key={p.key}
          center={[p.lat, p.lng]}
          radius={radiusFor(p.count)}
          pathOptions={{
            color: riskColor(p.avgRisk),
            fillColor: riskColor(p.avgRisk),
            fillOpacity: 0.45,
            weight: 2,
          }}
        >
          <Popup>
            <div style={{ minWidth: 220 }}>
              <strong>{p.name}</strong>
              <div style={{ marginTop: 4, fontSize: 13 }}>
                Згадок: <b>{p.count}</b><br />
                Середній ризик: <b>{p.avgRisk}</b> / 100<br />
                Головна причина: <b>{p.topCause}</b>
              </div>
              {p.samples.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                  {p.samples.map((s, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>— {s}</div>
                  ))}
                </div>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
