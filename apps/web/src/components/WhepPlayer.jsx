import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../api';

// WebRTC WHEP player. The SDP offer is sent through the API (auth + scope check), which relays to MediaMTX.
const WhepPlayer = forwardRef(function WhepPlayer({ camera }, ref) {
  const videoRef = useRef(null);
  const [state, setState] = useState(camera.online ? 'connecting' : 'offline');
  const [detail, setDetail] = useState('');

  useImperativeHandle(ref, () => ({ video: videoRef.current }), []);

  useEffect(() => {
    if (!camera.online) return undefined;
    let pc, cancelled = false, retry;

    const start = async () => {
      setState('connecting');
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (e) => { if (videoRef.current && e.streams[0]) videoRef.current.srcObject = e.streams[0]; };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setState('live');
        if (['failed', 'disconnected'].includes(pc.connectionState) && !cancelled) { setState('reconnecting'); retry = setTimeout(restart, 3000); }
      };
      await pc.setLocalDescription(await pc.createOffer());
      // Non-trickle WHEP: wait for ICE gathering so the offer carries all candidates.
      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); resolve(); } };
        pc.addEventListener('icegatheringstatechange', done);
        setTimeout(resolve, 2000);
      });
      const res = await api(`/cctv/${camera.id}/whep`, { form: pc.localDescription.sdp, raw: true, method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      if (cancelled) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
    };
    const restart = () => { if (pc) pc.close(); start().catch(fail); };
    const fail = (e) => { if (cancelled) return; setState('error'); setDetail(e.message); retry = setTimeout(restart, 5000); };

    start().catch(fail);
    return () => { cancelled = true; clearTimeout(retry); if (pc) pc.close(); };
  }, [camera.id, camera.online]);

  return (
    <>
      <video ref={videoRef} autoPlay muted playsInline />
      <span className={`state ${state === 'live' ? 'live' : ''}`}>{state === 'live' ? <><i className="dot on pulse" />LIVE</> : state.toUpperCase()}</span>
      {state !== 'live' && (
        <div className="msg">
          {state === 'offline' ? 'Camera reported offline – downtime feeds the risk model'
            : state === 'error' ? `Stream unavailable: ${detail}. Retrying…` : 'Connecting over WebRTC…'}
        </div>
      )}
    </>
  );
});

export default WhepPlayer;
