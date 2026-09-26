import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { Link } from 'react-router-dom';

const COLOR = { high: '#d92d20', medium: '#f79009', low: '#12b76a', unknown: '#667085' };
const OSM = { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' };

export function RiskMap({ projects }) {
  return (
    <MapContainer className="map" center={[22.5, 80]} zoom={5} scrollWheelZoom={false}>
      <TileLayer {...OSM} />
      {projects.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={8 + (p.analysis.risk || 0) / 8}
          pathOptions={{ color: COLOR[p.analysis.band], fillColor: COLOR[p.analysis.band], fillOpacity: 0.7, weight: 2 }}>
          <Popup>
            <b>{p.name}</b><br />{p.scheme} · {p.district}, {p.state}<br />
            Risk {p.analysis.risk ?? '—'} · {p.analysis.flags.length} flag(s)<br />
            <Link to={`/projects/${p.id}`}>Open project →</Link>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

// Shows the registered site, its geofence, and where the report was actually filed.
export function GeofenceMap({ site, geofence, point, withinFence }) {
  return (
    <MapContainer className="map small" bounds={[site, point]} boundsOptions={{ padding: [40, 40], maxZoom: 16 }} scrollWheelZoom={false}>
      <TileLayer {...OSM} />
      <Circle center={site} radius={geofence} pathOptions={{ color: '#173463', fillOpacity: 0.1 }}>
        <Tooltip permanent direction="top">Site geofence {geofence} m</Tooltip>
      </Circle>
      <CircleMarker center={point} radius={7} pathOptions={{ color: withinFence ? '#12b76a' : '#d92d20', fillOpacity: 1 }}>
        <Tooltip>Report location</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
