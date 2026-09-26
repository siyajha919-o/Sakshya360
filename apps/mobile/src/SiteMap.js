import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

// Leaflet + OpenStreetMap inside a WebView: registered site, its geofence and the device's live position.
const html = (site, radius) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css">
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{height:100%;margin:0}</style></head><body><div id="m"></div><script>
  var site=[${site.lat},${site.lng}];
  var map=L.map('m',{zoomControl:false}).setView(site,16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  L.circle(site,{radius:${radius},color:'#173463',fillOpacity:.12}).addTo(map).bindTooltip('Geofence ${radius} m');
  L.circleMarker(site,{radius:5,color:'#173463',fillOpacity:1}).addTo(map);
  var me=null;
  function setMe(lat,lng,ok){
    var p=[lat,lng];
    if(!me){me=L.circleMarker(p,{radius:8,weight:3,fillOpacity:.9}).addTo(map);}
    me.setLatLng(p); me.setStyle({color:ok?'#12b76a':'#d92d20',fillColor:ok?'#12b76a':'#d92d20'});
    map.fitBounds(L.latLngBounds([site,p]).pad(0.4),{maxZoom:17});
  }
  document.addEventListener('message',function(e){var d=JSON.parse(e.data);setMe(d.lat,d.lng,d.ok);});
  window.addEventListener('message',function(e){var d=JSON.parse(e.data);setMe(d.lat,d.lng,d.ok);});
</script></body></html>`;

export default function SiteMap({ site, radius, position, withinFence, height = 200 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (position && ref.current) ref.current.postMessage(JSON.stringify({ lat: position.lat, lng: position.lng, ok: withinFence }));
  }, [position, withinFence]);
  return (
    <View style={{ height, borderRadius: 10, overflow: 'hidden' }}>
      <WebView ref={ref} originWhitelist={['*']} source={{ html: html(site, radius) }} scrollEnabled={false} />
    </View>
  );
}

export function distanceM(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}
