import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import ModalBase from './ModalBase';
import ZoomableVideo from './ZoomableVideo';
import { API_BASE_URL } from '../config';

/**
 * Modal that plays the live Frigate stream for a patient.
 *
 * The backend hands back an HLS playlist URL pointing directly at the
 * Frigate instance (go2rtc). We attach it via hls.js (or native HLS on
 * Safari) inside a <video> element.
 */
export default function CameraLiveModal({ patientId, patientName, onClose }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/integrations/frigate/patient/${patientId}/live`,
          { credentials: 'include' }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Failed to load live URL (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        setInfo(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [patientId]);

  useEffect(() => {
    if (!info?.live_url || !videoRef.current) return;
    const video = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveDurationInfinity: true,
        lowLatencyMode: true,
        // The playlist/segments are served by our backend (a different origin
        // than the app), so hls.js's own XHRs must carry the session cookie —
        // and the Bearer token when embedded cross-origin (Home Assistant).
        xhrSetup: (xhr) => {
          xhr.withCredentials = true;
          const token = sessionStorage.getItem('auth_token');
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        },
      });
      hlsRef.current = hls;
      hls.loadSource(info.live_url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setError(`Stream error: ${data.type} / ${data.details}`);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari plays HLS natively; ask it to send credentials to our proxy.
      video.crossOrigin = 'use-credentials';
      video.src = info.live_url;
    } else {
      setError('This browser cannot play HLS streams');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [info]);

  const title = patientName ? `${patientName} — Live` : 'Live Camera';

  return (
    <ModalBase isOpen={true} onClose={onClose} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {info?.camera && (
          <div style={{ color: '#a0aec0', fontSize: 13 }}>
            Camera: <strong style={{ color: '#e6edf3' }}>{info.camera}</strong>
            {info.live_mode ? <span> &middot; {info.live_mode.toUpperCase()}</span> : null}
          </div>
        )}

        {error && (
          <div role="alert" style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(220,53,69,0.15)',
            border: '1px solid rgba(220,53,69,0.5)',
            color: '#f8d7da', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#a0aec0' }}>
            Loading stream…
          </div>
        ) : info?.live_url ? (
          <ZoomableVideo
            videoRef={videoRef}
            autoPlay
            playsInline
            muted
            controls
            containerStyle={{ maxHeight: '70vh', borderRadius: 8 }}
          />
        ) : !error ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#a0aec0' }}>
            No stream available
          </div>
        ) : null}

        {info?.snapshot_url && (
          <a
            href={info.snapshot_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#58a6ff', fontSize: 12 }}
          >
            Open snapshot
          </a>
        )}
      </div>
    </ModalBase>
  );
}
