// Live CCTV on the phone: WebRTC (WHEP) runs inside a WebView, signalling through the API exactly like the
// web dashboard (auth + jurisdiction check), media straight from MediaMTX. The page is given the API origin
// as baseUrl so its fetch is same-origin. For phones on the LAN, start MediaMTX with HOST_LAN_IP set.
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE, currentSession } from './api';
import { t } from './i18n';

const html = (cameraId, token, labels) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;color:#fff;font:13px system-ui}
video{width:100%;height:100%;object-fit:contain}#s{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.6);padding:2px 6px;border-radius:4px}</style>
</head><body><video id="v" autoplay muted playsinline></video><div id="s">${labels.connecting}</div><script>
var cam=${JSON.stringify(cameraId)}, token=${JSON.stringify(token)}, L=${JSON.stringify(labels)};
var s=document.getElementById('s'), pc;
function start(){
  pc=new RTCPeerConnection({iceServers:[]});
  pc.addTransceiver('video',{direction:'recvonly'});pc.addTransceiver('audio',{direction:'recvonly'});
  pc.ontrack=function(e){document.getElementById('v').srcObject=e.streams[0];};
  pc.onconnectionstatechange=function(){
    if(pc.connectionState==='connected'){s.textContent='● '+L.live;s.style.color='#12b76a';}
    if(pc.connectionState==='failed'){s.textContent=L.retry;setTimeout(restart,3000);}
  };
  pc.createOffer().then(function(o){return pc.setLocalDescription(o);}).then(function(){
    return new Promise(function(r){if(pc.iceGatheringState==='complete')return r();
      pc.onicegatheringstatechange=function(){if(pc.iceGatheringState==='complete')r();};setTimeout(r,2000);});
  }).then(function(){
    return fetch('/api/cctv/'+encodeURIComponent(cam)+'/whep',{method:'POST',headers:{'Content-Type':'application/sdp',Authorization:'Bearer '+token},body:pc.localDescription.sdp});
  }).then(function(res){
    if(!res.ok)return res.json().then(function(b){throw new Error(b.error||res.status);});
    return res.text();
  }).then(function(sdp){return pc.setRemoteDescription({type:'answer',sdp:sdp});})
  .catch(function(e){s.textContent=L.unavailable+': '+e.message;setTimeout(restart,5000);});
}
function restart(){try{pc.close();}catch(e){}start();}
start();
</script></body></html>`;

export default function LivePlayer({ cameraId, height = 220 }) {
  const labels = { connecting: t('Connecting…'), live: t('LIVE'), retry: t('Reconnecting…'), unavailable: t('Stream unavailable') };
  return (
    <View style={{ height, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' }}>
      <WebView
        originWhitelist={['*']}
        source={{ html: html(cameraId, currentSession().token, labels), baseUrl: API_BASE }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
      />
    </View>
  );
}
