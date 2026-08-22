import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, LayoutDashboard, Bell, BellOff, RefreshCw } from 'lucide-react';
import MirrorDisplay from './components/MirrorDisplay';
import Dashboard from './components/Dashboard';

export default function App() {
  const [viewMode, setViewMode] = useState('dashboard'); // dashboard or mirror
  
  // Real-time telemetry data state
  const [telemetry, setTelemetry] = useState({
    temp: 25.0,
    hum: 60.0,
    soil: 50,
    light: 50,
    expression: 'HAPPY',
    lastUpdated: new Date().toISOString(),
    deviceConnected: false
  });

  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);

  // Simulator mode states
  const [simulatorActive, setSimulatorActive] = useState(false);
  const [simulatedData, setSimulatedData] = useState({
    temp: 25.0,
    hum: 60.0,
    soil: 50,
    light: 50,
    expression: 'HAPPY'
  });

  // Notifications toggles
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);
  const [audioAlerts, setAudioAlerts] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const [lastBannerMessage, setLastBannerMessage] = useState('');

  // Floating particles array
  const [particles, setParticles] = useState([]);
  const particleIdRef = useRef(0);

  // Prevent spamming alarm notifications
  const lastAlarmTimeRef = useRef(0);

  // Ask for Web Notification Permissions
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setNotificationsAllowed(true);
      }
    }
  }, []);

  const requestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationsAllowed(permission === 'granted');
      });
    }
  };

  // Synthesize Warning Chime using Web Audio API
  const playWarningChime = () => {
    if (!audioAlerts) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      
      // Double beep chime
      const beep = (freq, delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        
        gain.gain.setValueAtTime(0.0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + delay + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.25);
        
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.3);
      };
      
      beep(520, 0);
      beep(660, 0.12);
    } catch (e) {
      console.log('Web Audio blocked or not supported', e);
    }
  };

  // Synthesize Touch Success Chime using Web Audio API
  const playHappyChime = () => {
    if (!audioAlerts) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      
      // Fast upward sweeping pitch
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(960, ctx.currentTime + 0.18);
      
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.28);
    } catch (e) {
      console.log('Web Audio blocked or not supported', e);
    }
  };

  // 1. Establish SSE Server connection
  useEffect(() => {
    if (simulatorActive) return; // Disable event listening if in simulator mode

    // Fetch initial state first
    fetch('/api/telemetry')
      .then(res => res.json())
      .then(initData => {
        if (initData.latest) {
          setTelemetry(initData.latest);
        }
        if (initData.history) {
          setHistory(initData.history);
        }
      })
      .catch(err => console.log('Error fetching initial telemetry:', err));

    // Open EventSource SSE stream
    const eventSource = new EventSource('/api/events');

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      
      if (payload.type === 'init' || payload.type === 'telemetry') {
        const latest = payload.data;
        setTelemetry(latest);
        
        if (payload.history) {
          setHistory(payload.history);
        }

        // Add to active log list
        const logTime = new Date(latest.lastUpdated).toLocaleTimeString();
        setLogs(prev => [
          {
            time: logTime,
            temp: latest.temp,
            hum: latest.hum,
            soil: latest.soil,
            light: latest.light,
            expression: latest.expression
          },
          ...prev.slice(0, 19)
        ]);

        // Evaluate Alarm for Low Soil Moisture (< 25%)
        if (latest.soil < 25 && latest.deviceConnected) {
          const now = Date.now();
          if (now - lastAlarmTimeRef.current > 30000) { // Cooldown 30 seconds
            lastAlarmTimeRef.current = now;
            
            const title = "🚨 Plant Bot Needs Water!";
            const message = `Soil moisture is dangerously low (${latest.soil}%). Please water MOA!`;
            
            setLastBannerMessage(message);
            setShowBanner(true);
            playWarningChime();

            if (Notification.permission === 'granted') {
              new Notification(title, { body: message });
            }
          }
        }
      } else if (payload.type === 'deviceStatus') {
        setTelemetry(prev => ({ ...prev, deviceConnected: payload.data.connected }));
      }
    };

    eventSource.onerror = () => {
      console.log('SSE connection error. Retrying...');
      setTelemetry(prev => ({ ...prev, deviceConnected: false }));
    };

    return () => {
      eventSource.close();
    };
  }, [simulatorActive]);

  // 2. Evaluates Alarm for SIMULATOR changes
  useEffect(() => {
    if (!simulatorActive) return;

    // Simulate logs immediately
    const logTime = new Date().toLocaleTimeString();
    setLogs(prev => [
      {
        time: logTime,
        temp: simulatedData.temp,
        hum: simulatedData.hum,
        soil: simulatedData.soil,
        light: simulatedData.light,
        expression: simulatedData.expression
      },
      ...prev.slice(0, 19)
    ]);

    // Check low soil alarm
    if (simulatedData.soil < 25) {
      const now = Date.now();
      if (now - lastAlarmTimeRef.current > 20000) { // 20 seconds cooldown
        lastAlarmTimeRef.current = now;
        
        const title = "🚨 Simulator: Plant Needs Water!";
        const message = `Simulated soil moisture is at ${simulatedData.soil}%. Water the plant!`;
        
        setLastBannerMessage(message);
        setShowBanner(true);
        playWarningChime();

        if (Notification.permission === 'granted') {
          new Notification(title, { body: message });
        }
      }
    }
  }, [simulatedData, simulatorActive]);

  // 3. Floating Particles Simulation Animation Loops
  useEffect(() => {
    const activeExpr = simulatorActive ? simulatedData.expression : telemetry.expression;

    // Timer to spawn particles based on expression
    const spawnTimer = setInterval(() => {
      let type = '';
      if (activeExpr === 'SLEEPY' || activeExpr === 'LAZY') type = 'Z';
      else if (activeExpr === 'EXCITED' || activeExpr === 'TOUCH') type = 'H';
      else if (activeExpr === 'THIRSTY' || activeExpr === 'HOT') type = 'S';

      if (!type) return;

      const id = particleIdRef.current++;
      let x = 160;
      let y = 50;
      let vx = (Math.random() - 0.5) * 1.5;
      let vy = -0.5 - Math.random() * 0.8;
      let size = Math.floor(Math.random() * 3) + 1; // 1-3

      if (type === 'Z') {
        x = 180 + Math.random() * 15;
        y = 60;
        vx = 0.5 + Math.random() * 0.5;
        vy = -0.5 - Math.random() * 0.4;
      } else if (type === 'H') {
        x = (Math.random() > 0.5 ? 55 : 265) + (Math.random() * 10 - 5);
        y = 80;
        vy = -0.7 - Math.random() * 0.5;
      } else if (type === 'S') {
        x = (Math.random() > 0.5 ? 80 : 240) + (Math.random() * 10 - 5);
        y = 35;
        vx = 0;
        vy = 0.8 + Math.random() * 0.5; // sweat drops drop down
      }

      setParticles(prev => [...prev, { id, x, y, vx, vy, type, size, spawnTime: Date.now() }]);
    }, 1500);

    // Frame update physics loop (runs at 40ms intervals)
    const physicsTimer = setInterval(() => {
      setParticles(prev => 
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
          }))
          // Prune particles older than 2.2 seconds or out of screen bounds
          .filter(p => Date.now() - p.spawnTime < 2200 && p.y > 10 && p.y < 118 && p.x > 10 && p.x < 310)
      );
    }, 40);

    return () => {
      clearInterval(spawnTimer);
      clearInterval(physicsTimer);
    };
  }, [telemetry.expression, simulatedData.expression, simulatorActive]);

  // Simulator helper: updates mock sensor values
  const updateSimulatedSensor = (key, value) => {
    setSimulatedData(prev => {
      const next = { ...prev, [key]: value };
      
      // Auto-update mood based on mock thresholds
      if (next.soil < 25) {
        next.expression = 'THIRSTY';
      } else if (next.temp > 32) {
        next.expression = 'HOT';
      } else if (next.light < 12) {
        next.expression = 'SLEEPY';
      } else if (next.light > 85) {
        next.expression = 'EXCITED';
      } else {
        // Shift back to Happy if all normal
        if (prev.expression === 'THIRSTY' || prev.expression === 'HOT' || prev.expression === 'SLEEPY' || prev.expression === 'EXCITED') {
          next.expression = 'HAPPY';
        }
      }
      return next;
    });
  };

  // Simulator helper: force expression change
  const setSimulatedExpression = (mood) => {
    setSimulatedData(prev => ({ ...prev, expression: mood }));
    if (mood === 'TOUCH') {
      triggerSimulatorTouch();
    } else {
      playHappyChime();
    }
  };

  // Simulator helper: force capacitive Touch heart shower
  const triggerSimulatorTouch = () => {
    // Play happy audio feedback
    playHappyChime();

    // Trigger simulation state
    if (simulatorActive) {
      setSimulatedData(prev => ({ ...prev, expression: 'TOUCH' }));
      // Return to happy in 2.5s
      setTimeout(() => {
        setSimulatedData(prev => ({ ...prev, expression: prev.soil < 25 ? 'THIRSTY' : 'HAPPY' }));
      }, 2500);
    } else {
      // Trigger touch on backend for physical device (will broadcast back to us)
      fetch('/api/simulator/touch', { method: 'POST' })
        .catch(err => console.log('Error triggering simulator touch:', err));
    }

    // Spawn 4 immediate hearts!
    const sideCoords = [55, 60, 260, 265];
    const newHearts = Array.from({ length: 4 }).map((_, i) => ({
      id: particleIdRef.current++ + '_' + i,
      x: sideCoords[i] + Math.random() * 6 - 3,
      y: 80,
      vx: (Math.random() - 0.5) * 1.0,
      vy: -0.8 - Math.random() * 0.5,
      type: 'H',
      size: 2,
      spawnTime: Date.now()
    }));
    setParticles(prev => [...prev, ...newHearts]);
  };

  // Active data selection (Simulated or Real Hardware telemetry)
  const activeData = simulatorActive 
    ? { ...simulatedData, deviceConnected: true } 
    : telemetry;

  return (
    <div className="app-wrapper">
      {/* Calm Drifting Clouds */}
      <div className="bg-clouds-container">
        <div className="cloud cloud-1">
          <svg viewBox="0 0 100 60" width="140" fill="rgba(255,255,255,0.75)">
            <path d="M 20,40 A 15,15 0 0,1 35,20 A 20,20 0 0,1 70,20 A 15,15 0 0,1 85,40 A 10,10 0 0,1 75,55 L 25,55 A 10,10 0 0,1 20,40 Z" />
          </svg>
        </div>
        <div className="cloud cloud-2">
          <svg viewBox="0 0 100 60" width="200" fill="rgba(255,255,255,0.6)">
            <path d="M 20,40 A 15,15 0 0,1 35,20 A 20,20 0 0,1 70,20 A 15,15 0 0,1 85,40 A 10,10 0 0,1 75,55 L 25,55 A 10,10 0 0,1 20,40 Z" />
          </svg>
        </div>
        <div className="cloud cloud-3">
          <svg viewBox="0 0 100 60" width="110" fill="rgba(255,255,255,0.5)">
            <path d="M 20,40 A 15,15 0 0,1 35,20 A 20,20 0 0,1 70,20 A 15,15 0 0,1 85,40 A 10,10 0 0,1 75,55 L 25,55 A 10,10 0 0,1 20,40 Z" />
          </svg>
        </div>
      </div>

      {/* Swaying Grass Silhouette at Bottom */}
      <div className="bg-grass-container">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="grass-svg">
          <path 
            d="M0,120 L0,80 Q20,45 40,90 Q60,35 80,100 Q100,25 120,95 Q140,45 160,85 Q180,35 200,90 Q220,15 240,100 Q260,35 280,85 Q300,50 320,95 Q340,25 360,90 Q380,45 400,80 Q420,35 440,95 Q460,20 480,90 Q500,45 520,85 Q540,30 560,95 Q580,40 600,80 Q620,25 640,90 Q660,45 680,85 Q700,35 720,100 Q740,25 760,95 Q780,50 800,90 Q820,15 840,85 Q860,35 880,95 Q900,45 920,80 Q940,30 960,90 Q980,40 1000,85 Q1020,20 1040,95 Q1060,45 1080,80 Q1100,35 1120,90 Q1140,25 1160,95 Q1180,50 1200,80 L1200,120 Z" 
            fill="#5b9654"
            opacity="0.12"
          />
          <path 
            d="M0,120 L0,90 Q15,65 30,100 Q45,55 60,105 Q75,45 90,95 Q105,55 120,100 Q135,40 150,90 Q165,65 180,105 Q195,35 210,95 Q225,55 240,100 Q255,45 270,90 Q285,60 300,105 Q315,35 330,95 Q345,60 360,100 Q375,40 390,90 Q405,65 420,105 Q435,45 450,95 Q465,60 480,100 Q495,30 510,90 Q525,65 540,105 Q555,45 577,95 Q590,55 600,100 Q615,40 630,90 Q645,65 660,105 Q675,35 690,95 Q705,55 720,100 Q735,45 750,90 Q765,60 780,105 Q795,35 810,95 Q825,60 840,100 Q855,40 870,90 Q885,65 900,105 Q915,45 930,95 Q945,60 960,100 Q975,30 990,90 Q1005,65 1020,105 Q1035,45 1050,95 Q1065,55 1080,100 Q1095,40 1110,90 Q1125,65 1140,105 Q1155,35 1170,95 Q1185,55 1200,100 L1200,120 Z" 
            fill="#2d5a27"
            opacity="0.18"
          />
        </svg>
      </div>

      <div className="app-container">
      
      {/* App Header */}
      <header className="app-header">
        <div className="app-title-section">
          <h1>MOA Companion</h1>
          <span className={`status-badge ${simulatorActive ? 'simulated' : (activeData.deviceConnected ? 'connected' : 'disconnected')}`}>
            <span className="dot pulse"></span>
            {simulatorActive ? 'Simulator Active' : (activeData.deviceConnected ? 'ESP32 Online' : 'ESP32 Offline')}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          
          {/* Notification Permission Toggle */}
          <button 
            onClick={notificationsAllowed ? undefined : requestNotificationPermission}
            className="status-badge"
            style={{ 
              cursor: notificationsAllowed ? 'default' : 'pointer',
              borderColor: notificationsAllowed ? 'rgba(95, 250, 154, 0.2)' : 'rgba(255, 255, 255, 0.08)'
            }}
            title={notificationsAllowed ? "Browser notifications enabled" : "Enable browser notifications"}
          >
            {notificationsAllowed ? <Bell size={12} /> : <BellOff size={12} />}
            {notificationsAllowed ? "Alerts Enabled" : "Enable Alerts"}
          </button>

          {/* Sound Toggle */}
          <button 
            onClick={() => setAudioAlerts(!audioAlerts)}
            className="status-badge"
            style={{ 
              cursor: 'pointer',
              borderColor: audioAlerts ? 'rgba(95, 250, 154, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              background: audioAlerts ? 'rgba(95, 250, 154, 0.03)' : 'transparent'
            }}
          >
            {audioAlerts ? "🔊 Sound On" : "🔇 Sound Off"}
          </button>
          
          {/* View Toggler */}
          <div className="view-toggle">
            <button 
              className={`view-btn ${viewMode === 'dashboard' ? 'active' : ''}`}
              onClick={() => setViewMode('dashboard')}
            >
              <LayoutDashboard size={14} />
              Dashboard
            </button>
            <button 
              className={`view-btn ${viewMode === 'mirror' ? 'active' : ''}`}
              onClick={() => setViewMode('mirror')}
            >
              <Smartphone size={14} />
              TFT Mirror
            </button>
          </div>
        </div>
      </header>

      {/* Alarm Banner Overlay */}
      {showBanner && (
        <div className="alert-banner">
          <div className="alert-message">
            <span>{lastBannerMessage}</span>
          </div>
          <button className="alert-close" onClick={() => setShowBanner(false)}>✕</button>
        </div>
      )}

      {/* Main Content Layout */}
      <main className={`main-layout ${viewMode === 'mirror' ? 'full-mirror' : ''}`}>
        
        {/* Left Column: Mirror TFT Display (Always shown on Mirror tab, or left-aligned on Dashboard tab) */}
        <MirrorDisplay 
          data={activeData}
          activeParticles={particles}
          triggerSimulatorTouch={triggerSimulatorTouch}
        />

        {/* Right Column: Detailed graphs and controls (Hidden on Mirror tab) */}
        {viewMode === 'dashboard' && (
          <Dashboard 
            data={activeData}
            history={history}
            simulatorActive={simulatorActive}
            setSimulatorActive={setSimulatorActive}
            updateSimulatedSensor={updateSimulatedSensor}
            setSimulatedExpression={setSimulatedExpression}
            triggerSimulatorTouch={triggerSimulatorTouch}
            logs={logs}
          />
        )}

      </main>

      </div>
    </div>
  );
}
