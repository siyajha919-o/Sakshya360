// Burns a visible geo/time stamp into each evidence photo on the device, before it is hashed and uploaded:
// the photo is laid out with a caption band in a hidden view and captured with react-native-view-shot.
import { useCallback, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

const STAGE_W = 360; // dp; captured at device pixel ratio (≈1080 px on most phones)

export function useWatermark() {
  const ref = useRef(null);
  const pending = useRef(null);
  const [job, setJob] = useState(null); // { uri, w, h, lines }

  const onLoad = useCallback(() => {
    // Wait a frame so the caption is laid out before capturing.
    requestAnimationFrame(async () => {
      const p = pending.current;
      if (!p) return;
      try {
        const uri = await captureRef(ref, { format: 'jpg', quality: 0.85, result: 'tmpfile' });
        p.resolve(uri);
      } catch (e) {
        p.reject(e);
      } finally {
        pending.current = null;
        setJob(null);
      }
    });
  }, []);

  // Resolves to the watermarked file URI. Falls back to the original photo if capture fails, so field
  // work is never blocked (the report still carries GPS, time and a SHA-256 fingerprint server-side).
  const stamp = useCallback((uri, w, h, lines) => new Promise((resolve) => {
    const timer = setTimeout(() => { pending.current = null; setJob(null); resolve({ uri, stamped: false }); }, 5000);
    pending.current = {
      resolve: (out) => { clearTimeout(timer); resolve({ uri: out, stamped: true }); },
      reject: () => { clearTimeout(timer); resolve({ uri, stamped: false }); },
    };
    setJob({ uri, w, h, lines });
  }), []);

  // Rendered behind the screen content (zIndex -1): laid out and drawable, but never visible.
  const stage = job ? (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, zIndex: -1, opacity: 1 }}>
      <View ref={ref} collapsable={false} style={{ width: STAGE_W, height: Math.round((STAGE_W * job.h) / job.w), backgroundColor: '#000' }}>
        <Image source={{ uri: job.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onLoad={onLoad} onError={() => pending.current && pending.current.reject()} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,29,58,0.72)', padding: 6 }}>
          <View style={{ flexDirection: 'row', height: 3, marginBottom: 4 }}>
            <View style={{ flex: 1, backgroundColor: '#ff9933' }} /><View style={{ flex: 1, backgroundColor: '#fff' }} /><View style={{ flex: 1, backgroundColor: '#138808' }} />
          </View>
          {job.lines.map((l, i) => (
            <Text key={i} style={{ color: '#fff', fontSize: i === 0 ? 10 : 9, fontWeight: i === 0 ? '700' : '400' }} numberOfLines={1}>{l}</Text>
          ))}
        </View>
      </View>
    </View>
  ) : null;

  return { stage, stamp };
}
