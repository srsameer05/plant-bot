import React, { useState, useEffect } from 'react';

// Color Mapping matching C++ definitions
const COLORS = {
  C_BACKGROUND: '#101c2c',
  C_CARD_BG: '#213147',
  C_CARD_BORDER: '#31cdcd',
  C_WHITE: '#ffffff',
  C_CREAM: '#ffdf7a',
  C_LIGHT_CREAM: '#f7be7a',
  C_PUPIL: '#10141b',
  C_TEAL: '#3ed6d6',
  C_MINT: '#5ffa9a',
  C_CORAL: '#f38a8a',
  C_GOLD: '#fe2020',
  C_GOLD_BEAK: '#ffc107',
  C_SKY_BLUE: '#6efeef',
  C_PINK: '#f4b3b3',
  C_PURPLE: '#b3dfff',
  C_TEXT_MUTED: '#8c9ba5',
  C_ALERT_RED: '#e14444'
};

export default function MirrorDisplay({ data, activeParticles, triggerSimulatorTouch }) {
  const [timeStr, setTimeStr] = useState('00:00:00');
  const [ampmStr, setAmpmStr] = useState('AM');
  const [dateStr, setDateStr] = useState('01/01/26');
  const [pulse, setPulse] = useState(false);

  // Local Blink & Gaze states to keep the face animated smoothly between telemetry updates
  const [isBlinking, setIsBlinking] = useState(false);
  const [blinkState, setBlinkState] = useState(0); // 0: open, 1: half, 2: closed, 3: half
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });

  // Clock Update
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      let hr = now.getHours();
      const min = String(now.getMinutes()).padStart(2, '0');
      const sec = String(now.getSeconds()).padStart(2, '0');
      const pm = hr >= 12;
      const displayHr = String(hr % 12 || 12).padStart(2, '0');
      
      setTimeStr(`${displayHr}:${min}:${sec}`);
      setAmpmStr(pm ? 'PM' : 'AM');
      
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = String(now.getFullYear()).substring(2);
      setDateStr(`${day}/${month}/${year}`);
      
      setPulse(p => !p);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Web Animations: Blinking & Gazing loop (runs locally to keep UI fluid)
  useEffect(() => {
    const expr = data.expression;
    if (expr === 'SLEEPY' || expr === 'LAZY') {
      setIsBlinking(false);
      return;
    }

    // Gaze Look-Around Loop
    const gazeInterval = setInterval(() => {
      if (['TOUCH', 'THIRSTY', 'HOT'].includes(expr)) {
        setPupilOffset({ x: 0, y: 0 });
        return;
      }
      // Random look offset
      const x = Math.floor(Math.random() * 21) - 10; // -10 to 10
      const y = Math.floor(Math.random() * 9) - 4;   // -4 to 4
      setPupilOffset({ x, y });
    }, 4000);

    // Blinking Loop
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      // Sequence: Half Open -> Closed -> Half Open -> Open
      setBlinkState(1);
      setTimeout(() => setBlinkState(2), 50);
      setTimeout(() => setBlinkState(3), 120);
      setTimeout(() => {
        setIsBlinking(false);
        setBlinkState(0);
      }, 170);

    }, Math.random() * 4000 + 3000);

    return () => {
      clearInterval(gazeInterval);
      clearInterval(blinkInterval);
    };
  }, [data.expression]);

  const expr = data.expression;
  const isDeviceConnected = data.deviceConnected;

  // Determine sensor color levels based on current readings
  const tempAlert = data.temp > 32;
  const soilAlert = data.soil < 25;
  const lightGold = data.light > 80;

  // Render SVG Heart path helper
  const renderHeartShape = (cx, cy, size) => {
    const r = size / 4;
    return (
      <g>
        <circle cx={cx - r} cy={cy - r} r={r + 0.5} fill={COLORS.C_PINK} />
        <circle cx={cx + r} cy={cy - r} r={r + 0.5} fill={COLORS.C_PINK} />
        <polygon 
          points={`${cx - 2 * r},${cy} ${cx + 2 * r},${cy} ${cx},${cy + size / 2 + 1}`} 
          fill={COLORS.C_PINK} 
        />
      </g>
    );
  };

  // Render Beak (Mouth) based on Expression
  const renderBeak = (y) => {
    if (expr === 'EXCITED' || expr === 'TOUCH') {
      return (
        <g>
          <polygon points={`148,${y} 172,${y} 160,${y - 6}`} fill={COLORS.C_GOLD_BEAK} />
          <polygon points={`148,${y} 172,${y} 160,${y + 12}`} fill={COLORS.C_GOLD_BEAK} />
        </g>
      );
    }
    if (expr === 'HOT') {
      // Sweating red tongue beak
      return (
        <rect x="152" y={y} width="16" height="16" rx="4" ry="4" fill={COLORS.C_CORAL} />
      );
    }
    if (expr === 'THIRSTY') {
      return (
        <polygon points={`148,${y} 172,${y} 160,${y + 14}`} fill={COLORS.C_SKY_BLUE} />
      );
    }
    if (expr === 'LAZY' || expr === 'SLEEPY') {
      return (
        <polygon points={`148,${y + 1} 172,${y + 1} 160,${y + 15}`} fill={COLORS.C_TEXT_MUTED} />
      );
    }
    if (expr === 'CONFUSED' || expr === 'SURPRISED') {
      const radius = expr === 'CONFUSED' ? 6 : 9;
      return (
        <circle cx="160" cy={y + 6} r={radius} fill={COLORS.C_CORAL} />
      );
    }
    // Default Beak
    return (
      <polygon points={`148,${y} 172,${y} 160,${y + 14}`} fill={COLORS.C_GOLD_BEAK} />
    );
  };

  // Render SVG Eyes depending on state
  const renderEyes = () => {
    const eyeY = 60; // Shifted slightly up from TFT layout (104) to center in 120px tall SVG canvas
    const leftX = 92;
    const rightX = 228;

    // 1. Sleey / Lazy / Blinking closed
    if (expr === 'SLEEPY' || expr === 'LAZY' || (isBlinking && blinkState === 2)) {
      return (
        <g>
          {/* Left Closed Eye */}
          <line x1={leftX - 24} y1={eyeY} x2={leftX + 24} y2={eyeY} className="eye-closed-path" />
          <line x1={leftX - 20} y1={eyeY} x2={leftX - 24} y2={eyeY - 5} className="eye-lash-path" />
          <line x1={leftX + 20} y1={eyeY} x2={leftX + 24} y2={eyeY - 5} className="eye-lash-path" />
          <line x1={leftX} y1={eyeY + 1} x2={leftX} y2={eyeY + 6} className="eye-lash-path" />

          {/* Right Closed Eye */}
          <line x1={rightX - 24} y1={eyeY} x2={rightX + 24} y2={eyeY} className="eye-closed-path" />
          <line x1={rightX - 20} y1={eyeY} x2={rightX - 24} y2={eyeY - 5} className="eye-lash-path" />
          <line x1={rightX + 20} y1={eyeY} x2={rightX + 24} y2={eyeY - 5} className="eye-lash-path" />
          <line x1={rightX} y1={eyeY + 1} x2={rightX} y2={eyeY + 6} className="eye-lash-path" />
        </g>
      );
    }

    // 2. Blinking Half Open
    if (isBlinking && (blinkState === 1 || blinkState === 3)) {
      const drawHalfEye = (cx) => (
        <g>
          <rect x={cx - 36} y={eyeY - 18} width="72" height="36" rx="12" fill={COLORS.C_CREAM} />
          <rect x={cx - 28} y={eyeY - 12} width="56" height="24" rx="8" fill={COLORS.C_SKY_BLUE} />
          <circle cx={cx} cy={eyeY} r="10" fill={COLORS.C_PUPIL} />
          <circle cx={cx - 4} cy={eyeY - 4} r="4" fill={COLORS.C_WHITE} />
        </g>
      );
      return (
        <g>
          {drawHalfEye(leftX)}
          {drawHalfEye(rightX)}
        </g>
      );
    }

    // 3. Touch Heart Eyes
    if (expr === 'TOUCH') {
      return (
        <g>
          {renderHeartShape(leftX, eyeY, 32)}
          {renderHeartShape(rightX, eyeY, 32)}
        </g>
      );
    }

    // 4. Surprised Circular Eyes
    if (expr === 'SURPRISED') {
      const drawSurprisedEye = (cx) => (
        <g>
          <circle cx={cx} cy={eyeY} r="36" fill={COLORS.C_CREAM} />
          <circle cx={cx} cy={eyeY} r="12" fill={COLORS.C_PUPIL} />
          <circle cx={cx - 4} cy={eyeY - 4} r="4" fill={COLORS.C_WHITE} />
        </g>
      );
      return (
        <g>
          {drawSurprisedEye(leftX)}
          {drawSurprisedEye(rightX)}
        </g>
      );
    }

    // 5. Standard Big Eyes (HAPPY, CURIOUS, CONFUSED, SHY, THIRSTY, HOT, EXCITED)
    let irisColor = COLORS.C_SKY_BLUE;
    let pX = pupilOffset.x;
    let pY = pupilOffset.y;
    let showBrows = false;
    let browType = 'normal'; // normal, curious, confused, thirsty

    if (expr === 'CURIOUS') {
      irisColor = COLORS.C_TEAL;
      pX = 5; // looking side
      pY = -3;
      showBrows = true;
      browType = 'curious';
    } else if (expr === 'CONFUSED') {
      irisColor = COLORS.C_GOLD;
      pX = 6;
      pY = -3;
      showBrows = true;
      browType = 'confused';
    } else if (expr === 'SHY') {
      pX = 10;
      pY = 4;
    } else if (expr === 'THIRSTY') {
      pX = 0;
      pY = 8; // looking down sad
      showBrows = true;
      browType = 'thirsty';
    } else if (expr === 'HOT') {
      irisColor = COLORS.C_CORAL;
      pX = 0;
      pY = -4; // looking up panting
    } else if (expr === 'EXCITED') {
      irisColor = COLORS.C_GOLD;
      pX = 0;
      pY = 0;
    }

    const drawBigEye = (cx, sideFactor) => {
      // Calculate pupil look vector (using local state offsets)
      const curPupilX = cx + pX * sideFactor;
      const curPupilY = eyeY + pY;

      return (
        <g>
          {/* Outer white */}
          <rect x={cx - 36} y={eyeY - 40} width="72" height="80" rx="24" fill={COLORS.C_CREAM} />
          {/* Iris color */}
          <rect x={cx - 28} y={eyeY - 32} width="56" height="64" rx="18" fill={irisColor} />
          {/* Pupil */}
          <circle cx={curPupilX} cy={curPupilY} r="15" fill={COLORS.C_PUPIL} />
          {/* Highlights */}
          <circle cx={curPupilX - 6} cy={curPupilY - 8} r="6" fill={COLORS.C_WHITE} />
          <circle cx={curPupilX + 8} cy={curPupilY + 8} r="3" fill={COLORS.C_WHITE} />
        </g>
      );
    };

    return (
      <g>
        {/* Draw brows first if needed */}
        {showBrows && browType === 'curious' && (
          <g stroke={COLORS.C_LIGHT_CREAM} strokeWidth="2.5" strokeLinecap="round">
            <line x1={leftX - 25} y1={eyeY - 48} x2={leftX + 20} y2={eyeY - 43} />
            <line x1={rightX - 20} y1={eyeY - 43} x2={rightX + 25} y2={eyeY - 48} />
          </g>
        )}
        {showBrows && browType === 'confused' && (
          <g stroke={COLORS.C_LIGHT_CREAM} strokeWidth="2.5" strokeLinecap="round">
            <line x1={leftX - 20} y1={eyeY - 46} x2={leftX + 20} y2={eyeY - 42} />
            <line x1={rightX - 20} y1={eyeY - 42} x2={rightX + 20} y2={eyeY - 46} />
          </g>
        )}
        {showBrows && browType === 'thirsty' && (
          <g stroke={COLORS.C_LIGHT_CREAM} strokeWidth="2.5" strokeLinecap="round">
            <line x1={leftX - 25} y1={eyeY - 43} x2={leftX + 20} y2={eyeY - 48} />
            <line x1={rightX - 20} y1={eyeY - 48} x2={rightX + 25} y2={eyeY - 43} />
          </g>
        )}

        {/* Eyes */}
        {drawBigEye(leftX, -1)}
        {drawBigEye(rightX, 1)}
      </g>
    );
  };

  return (
    <div className="tft-container">
      {/* Physical Device Frame Bezel */}
      <div className="tft-bezel">
        <div className="tft-screen" onClick={triggerSimulatorTouch}>
          
          {/* 1. Header panel */}
          <div className="tft-header">
            <div className="tft-logo">
              MOA
              <span className={`tft-heartbeat ${pulse ? 'anim-pulse-heart' : ''}`} style={{ backgroundColor: pulse ? COLORS.C_PINK : '#2b3a4a' }}></span>
            </div>
            
            <div className="tft-header-right">
              {/* WiFi Strength Icon */}
              <div className="tft-wifi-icon">
                <svg width="14" height="10" viewBox="0 0 14 10" style={{ overflow: 'visible' }}>
                  {!isDeviceConnected ? (
                    <>
                      {/* Disconnected Cross Sign */}
                      <rect x="0" y="8" width="2" height="2" fill={COLORS.C_TEXT_MUTED} />
                      <rect x="4" y="6" width="2" height="4" fill={COLORS.C_TEXT_MUTED} />
                      <rect x="8" y="4" width="2" height="6" fill={COLORS.C_TEXT_MUTED} />
                      <rect x="12" y="2" width="2" height="8" fill={COLORS.C_TEXT_MUTED} />
                      <line x1="-1" y1="9" x2="15" y2="1" stroke={COLORS.C_ALERT_RED} strokeWidth="1.5" />
                    </>
                  ) : (
                    <>
                      {/* Connected Wifi strength bars */}
                      <rect x="0" y="8" width="2" height="2" fill={COLORS.C_MINT} />
                      <rect x="4" y="6" width="2" height="4" fill={COLORS.C_MINT} />
                      <rect x="8" y="4" width="2" height="6" fill={COLORS.C_MINT} />
                      <rect x="12" y="2" width="2" height="8" fill={COLORS.C_MINT} />
                    </>
                  )}
                </svg>
              </div>
              <div className="tft-time">{timeStr} <span className="tft-ampm">{ampmStr}</span></div>
              <div className="tft-date">{dateStr}</div>
            </div>
          </div>

          {/* 2. Face expression arena */}
          <div className="tft-face-area">
            {/* Animated Face */}
            <div className="anim-breathe character-svg" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center' }}>
              <svg width="320" height="120" viewBox="0 0 320 120" style={{ overflow: 'visible' }}>
                {/* Cheeks for Happy / Shy / Hot / Excited / Touch */}
                {['HAPPY', 'SHY', 'HOT', 'EXCITED', 'TOUCH'].includes(expr) && (
                  <g fill={COLORS.C_PINK} opacity="0.65">
                    <circle cx="40" cy="96" r="10" />
                    <circle cx="280" cy="96" r="10" />
                  </g>
                )}

                {/* Beak / Mouth */}
                {renderBeak(109 - 44)} {/* Offset beak coordinate y */}

                {/* Eyes */}
                {renderEyes()}
                
                {/* Labels/Expressions Overlays */}
                {expr === 'CURIOUS' && (
                  <text x="160" y="25" fill={COLORS.C_GOLD_BEAK} fontSize="18" fontWeight="800" textAnchor="middle">?</text>
                )}
                {expr === 'SURPRISED' && (
                  <text x="160" y="23" fill={COLORS.C_GOLD_BEAK} fontSize="18" fontWeight="800" textAnchor="middle">!</text>
                )}
                {expr === 'TOUCH' && (
                  <text x="160" y="23" fill={COLORS.C_PINK} fontSize="10" fontWeight="700" textAnchor="middle">HEllo!</text>
                )}
              </svg>
            </div>

            {/* Particle floating animations */}
            {activeParticles.map(p => (
              <div 
                key={p.id}
                className="tft-particle"
                style={{
                  left: `${p.x}px`,
                  top: `${p.y}px`,
                  '--float-x': `${p.vx * 30}px`,
                  fontSize: p.type === 'Z' ? `${p.size * 5 + 8}px` : 'inherit',
                  color: p.type === 'Z' ? COLORS.C_PURPLE : (p.type === 'H' ? COLORS.C_PINK : COLORS.C_SKY_BLUE)
                }}
              >
                {p.type === 'Z' && 'z'}
                {p.type === 'H' && '❤️'}
                {p.type === 'S' && '💧'}
              </div>
            ))}
          </div>

          {/* 3. Sensors Dashboard Grid */}
          <div className="tft-sensors-grid">
            {/* TEMP CARD */}
            <div className={`tft-sensor-card ${tempAlert ? 'alert' : ''}`}>
              <div className="tft-sensor-label">Temp</div>
              <div className="tft-sensor-value">{data.temp ? Math.round(data.temp) : 25}°C</div>
              <div className="tft-sensor-gauge">
                <div 
                  className="tft-sensor-gauge-fill" 
                  style={{
                    width: `${Math.min(100, Math.max(0, (data.temp / 50) * 100))}%`,
                    backgroundColor: tempAlert ? COLORS.C_CORAL : COLORS.C_MINT
                  }}
                />
              </div>
            </div>

            {/* HUMID CARD */}
            <div className="tft-sensor-card">
              <div className="tft-sensor-label">Humid</div>
              <div className="tft-sensor-value">{data.hum ? Math.round(data.hum) : 60}%</div>
              <div className="tft-sensor-gauge">
                <div 
                  className="tft-sensor-gauge-fill" 
                  style={{
                    width: `${data.hum || 60}%`,
                    backgroundColor: COLORS.C_SKY_BLUE
                  }}
                />
              </div>
            </div>

            {/* SOIL MOISTURE CARD */}
            <div className={`tft-sensor-card ${soilAlert ? 'alert' : ''}`}>
              <div className="tft-sensor-label">Soil</div>
              <div className="tft-sensor-value">{data.soil !== undefined ? data.soil : 50}%</div>
              <div className="tft-sensor-gauge">
                <div 
                  className="tft-sensor-gauge-fill" 
                  style={{
                    width: `${data.soil !== undefined ? data.soil : 50}%`,
                    backgroundColor: soilAlert ? COLORS.C_CORAL : COLORS.C_MINT
                  }}
                />
              </div>
            </div>

            {/* LIGHT CARD */}
            <div className="tft-sensor-card">
              <div className="tft-sensor-label">Light</div>
              <div className="tft-sensor-value">{data.light !== undefined ? data.light : 50}%</div>
              <div className="tft-sensor-gauge">
                <div 
                  className="tft-sensor-gauge-fill" 
                  style={{
                    width: `${data.light !== undefined ? data.light : 50}%`,
                    backgroundColor: lightGold ? COLORS.C_GOLD_BEAK : '#ffffff'
                  }}
                />
              </div>
            </div>
          </div>

        </div>
      </div>
      
      {/* Device details & Helper IP */}
      <div className="ip-info-box">
        💡 <strong>Mirror Mode Active</strong>. Click screen to trigger a capacitive "Touch" interaction.<br />
        {!isDeviceConnected ? (
          <span>Waiting for ESP32 connect... Set server target to: <code>{window.location.origin.replace('3000', '5000')}/api/telemetry</code></span>
        ) : (
          <span>Connected to ESP32! Telemetry updates streamed live.</span>
        )}
      </div>
    </div>
  );
}
