/*
 * Smart Home Health
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import ModalBase from './ModalBase';
import ZoomableVideo from './ZoomableVideo';
import { API_BASE_URL } from '../config';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

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
          <div style={{ color: 'var(--dash-text-muted)', fontSize: 13 }}>
            Camera: <strong style={{ color: 'var(--dash-text)' }}>{info.camera}</strong>
            {info.live_mode ? <span> &middot; {info.live_mode.toUpperCase()}</span> : null}
          </div>
        )}

        {error && (
          <div className="tw"><Alert variant="destructive">{error}</Alert></div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--dash-text-muted)' }}>
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
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--dash-text-muted)' }}>
            No stream available
          </div>
        ) : null}

        {info?.snapshot_url && (
          <div className="tw">
            <Button asChild variant="link" className="h-auto self-start p-0 text-xs">
              <a href={info.snapshot_url} target="_blank" rel="noopener noreferrer">Open snapshot</a>
            </Button>
          </div>
        )}
      </div>
    </ModalBase>
  );
}
