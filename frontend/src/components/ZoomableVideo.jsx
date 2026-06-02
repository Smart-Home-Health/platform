import { useEffect, useRef, useState, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

/**
 * <video> wrapped in a pinch-to-zoom container with custom controls.
 *
 * Native HTML5 controls are disabled and `pointer-events: none` is set on
 * the video element so iOS Safari doesn't intercept two-finger gestures
 * to escalate into its native fullscreen player. All interaction is
 * handled by our overlay (play/pause/scrub/fullscreen) and the pinch
 * gestures land on the TransformWrapper.
 *
 * Pinch / Ctrl+wheel zoom, drag-to-pan, double-tap to reset.
 */
export default function ZoomableVideo({
  containerStyle,
  videoRef: externalRef,
  src,
  autoPlay,
  muted,
  ...videoProps
}) {
  const internalRef = useRef(null);
  const containerEl = useRef(null);
  const videoRef = externalRef || internalRef;

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(NaN);
  const [currentTime, setCurrentTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  // Wire native video events into local state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => { if (!scrubbing) setCurrentTime(v.currentTime); };
    const onMeta = () => setDuration(v.duration);
    const onEnded = () => setPlaying(false);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('durationchange', onMeta);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('durationchange', onMeta);
      v.removeEventListener('ended', onEnded);
    };
  }, [videoRef, scrubbing]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, [videoRef]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerEl.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      try { await el.requestFullscreen(); } catch { /* user denied or unsupported */ }
    } else {
      try { await document.exitFullscreen(); } catch { /* ignore */ }
    }
  }, []);

  const fmt = (s) => {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const seekFromPointer = (clientX, rect) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = pct * duration;
    setCurrentTime(t);
    const v = videoRef.current;
    if (v) v.currentTime = t;
  };

  const onScrubStart = (e) => {
    e.preventDefault();
    setScrubbing(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    seekFromPointer(clientX, rect);

    const move = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      seekFromPointer(cx, rect);
    };
    const end = () => {
      setScrubbing(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
  };

  const progress = Number.isFinite(duration) && duration > 0
    ? (currentTime / duration) * 100
    : 0;

  return (
    <div
      ref={containerEl}
      style={{
        position: 'relative',
        width: '100%',
        background: '#000',
        borderRadius: 6,
        overflow: 'hidden',
        ...containerStyle,
      }}
    >
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={6}
        doubleClick={{ mode: 'reset' }}
        wheel={{ step: 0.15 }}
        pinch={{ step: 5 }}
        panning={{ velocityDisabled: true }}
        limitToBounds={true}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '100%', height: '100%' }}
        >
          <video
            ref={videoRef}
            src={src}
            autoPlay={autoPlay}
            muted={muted}
            playsInline
            disablePictureInPicture
            controls={false}
            controlsList="nodownload nofullscreen noremoteplayback"
            {...videoProps}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              pointerEvents: 'none',  // iOS won't escalate to native player
              ...(videoProps.style || {}),
            }}
          />
        </TransformComponent>
      </TransformWrapper>

      {/* Center play button when paused */}
      {!playing && (
        <button
          onClick={togglePlay}
          aria-label="Play"
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 5,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      {/* Bottom controls bar */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '8px 10px 10px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        display: 'flex', flexDirection: 'column', gap: 6,
        zIndex: 5,
      }}>
        {/* Scrub bar */}
        <div
          onMouseDown={onScrubStart}
          onTouchStart={onScrubStart}
          style={{
            height: 18, display: 'flex', alignItems: 'center',
            cursor: 'pointer', touchAction: 'none',
          }}
        >
          <div style={{
            position: 'relative', height: 4, width: '100%',
            background: 'rgba(255,255,255,0.25)', borderRadius: 2,
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${progress}%`, background: '#58a6ff', borderRadius: 2,
            }} />
            <div style={{
              position: 'absolute', top: '50%', left: `${progress}%`,
              transform: 'translate(-50%, -50%)',
              width: 12, height: 12, borderRadius: '50%',
              background: '#fff', boxShadow: '0 0 0 2px rgba(0,0,0,0.5)',
            }} />
          </div>
        </div>

        {/* Buttons row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          color: '#fff', fontSize: 12,
        }}>
          <button
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            style={{
              background: 'transparent', border: 'none', color: '#fff',
              cursor: 'pointer', padding: 4, display: 'flex',
            }}
          >
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}>
            {fmt(currentTime)} / {fmt(duration)}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            style={{
              background: 'transparent', border: 'none', color: '#fff',
              cursor: 'pointer', padding: 4, display: 'flex',
            }}
          >
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
