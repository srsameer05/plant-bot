import React, { useState } from 'react';
import { Thermometer, Droplet, Sun, Eye, Activity, Sliders, ListCollapse, BellRing } from 'lucide-react';

export default function Dashboard({ 
  data, 
  history, 
  simulatorActive, 
  setSimulatorActive, 
  updateSimulatedSensor, 
  setSimulatedExpression, 
  triggerSimulatorTouch,
  logs 
}) {
  const [activeTab, setActiveTab] = useState('soil');

  // Alarm threshold indicators
  const tempAlert = data.temp > 32;
  const soilAlert = data.soil < 25;

  // Chart configuration
  const tabConfigs = {
    temp: { label: 'Temperature', key: 'temp', min: 0, max: 50, unit: '°C', color: '#f97316' },
    hum: { label: 'Humidity', key: 'hum', min: 0, max: 100, unit: '%', color: '#06b6d4' },
    soil: { label: 'Soil Moisture', key: 'soil', min: 0, max: 100, unit: '%', color: '#10b981' },
    light: { label: 'Light Level', key: 'light', min: 0, max: 100, unit: '%', color: '#facc15' },
  };

  const currentTab = tabConfigs[activeTab];

  // Generate SVG Sparkline Path
  const getChartPaths = () => {
    if (!history || history.length < 2) return { line: '', area: '', points: [] };
    
    const width = 600;
    const height = 140;
    const padding = 15;
    
    const minVal = currentTab.min;
    const maxVal = currentTab.max;
    
    const points = history.map((item, index) => {
      const x = padding + (index / (history.length - 1)) * (width - 2 * padding);
      const val = item[currentTab.key] !== undefined ? item[currentTab.key] : 50;
      // Invert Y for SVG coordinates
      const y = height - padding - ((val - minVal) / (maxVal - minVal)) * (height - 2 * padding);
      return { x, y, value: val, time: new Date(item.timestamp).toLocaleTimeString() };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return { line: linePath, area: areaPath, points };
  };

  const { line, area, points } = getChartPaths();

  return (
    <div className="dashboard-details">
      
      {/* 1. Large Sensor Cards Grid */}
      <div className="dashboard-grid">
        
        {/* Soil Moisture */}
        <div className={`glass-panel dashboard-card card-soil ${soilAlert ? 'alert' : ''}`}>
          <div className="card-header">
            <span className="card-title">Soil Moisture</span>
            <Droplet className="card-icon" style={{ color: soilAlert ? '#ef4444' : '#10b981' }} />
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: soilAlert ? '#ef4444' : '#10b981' }}>
              {data.soil !== undefined ? Math.round(data.soil) : '--'}
            </span>
            <span className="card-unit">%</span>
          </div>
          <div className="card-progress-container">
            <div 
              className="card-progress-bar" 
              style={{ 
                width: `${data.soil || 0}%`
              }}
            />
          </div>
        </div>

        {/* Temperature */}
        <div className={`glass-panel dashboard-card card-temp ${tempAlert ? 'alert' : ''}`}>
          <div className="card-header">
            <span className="card-title">Temperature</span>
            <Thermometer className="card-icon" style={{ color: tempAlert ? '#ef4444' : '#f97316' }} />
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: tempAlert ? '#ef4444' : '#f97316' }}>
              {data.temp !== undefined ? data.temp.toFixed(1) : '--'}
            </span>
            <span className="card-unit">°C</span>
          </div>
          <div className="card-progress-container">
            <div 
              className="card-progress-bar" 
              style={{ 
                width: `${Math.min(100, Math.max(0, ((data.temp || 25) / 50) * 100))}%`
              }}
            />
          </div>
        </div>

        {/* Humidity */}
        <div className="glass-panel dashboard-card card-hum">
          <div className="card-header">
            <span className="card-title">Humidity</span>
            <Activity className="card-icon" style={{ color: '#06b6d4' }} />
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: '#06b6d4' }}>
              {data.hum !== undefined ? Math.round(data.hum) : '--'}
            </span>
            <span className="card-unit">%</span>
          </div>
          <div className="card-progress-container">
            <div 
              className="card-progress-bar" 
              style={{ 
                width: `${data.hum || 0}%`
              }}
            />
          </div>
        </div>

        {/* Light Level */}
        <div className="glass-panel dashboard-card card-light">
          <div className="card-header">
            <span className="card-title">Ambient Light</span>
            <Sun className="card-icon" style={{ color: '#facc15' }} />
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: '#facc15' }}>
              {data.light !== undefined ? Math.round(data.light) : '--'}
            </span>
            <span className="card-unit">%</span>
          </div>
          <div className="card-progress-container">
            <div 
              className="card-progress-bar" 
              style={{ 
                width: `${data.light || 0}%`
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. Sparkline Chart Panel */}
      <div className="glass-panel chart-panel">
        <div className="chart-header">
          <h3 className="panel-title" style={{ marginBottom: 0 }}>
            <Activity size={18} style={{ color: currentTab.color }} />
            Sensor Telemetry Trends
          </h3>
          
          <div className="chart-tabs">
            {Object.entries(tabConfigs).map(([key, config]) => (
              <button
                key={key}
                className={`chart-tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-container">
          {history && history.length >= 2 ? (
            <svg viewBox="0 0 600 140" className="chart-svg-elem">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={currentTab.color} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={currentTab.color} stopOpacity="0.0" />
                </linearGradient>
              </defs>
              
              {/* Grid Lines */}
              <line x1="15" y1="15" x2="585" y2="15" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
              <line x1="15" y1="70" x2="585" y2="70" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
              <line x1="15" y1="125" x2="585" y2="125" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
              
              {/* Fill Area */}
              <path d={area} fill="url(#chartGradient)" />
              {/* Line */}
              <path d={line} fill="none" stroke={currentTab.color} strokeWidth="2" strokeLinecap="round" />
              
              {/* Points & Interactive Tooltips (latest dots) */}
              {points.map((p, i) => (
                <g key={i}>
                  {i === points.length - 1 && (
                    <circle cx={p.x} cy={p.y} r="6" fill={currentTab.color} opacity="0.4" className="anim-pulse-heart" />
                  )}
                  <circle 
                    cx={p.x} 
                    cy={p.y} 
                    r={i === points.length - 1 ? '4' : '2'} 
                    fill={currentTab.color} 
                  />
                </g>
              ))}
              
              {/* Y Axis Labels */}
              <text x="590" y="20" fill="rgba(255, 255, 255, 0.3)" fontSize="8" textAnchor="start">{currentTab.max}{currentTab.unit}</text>
              <text x="590" y="73" fill="rgba(255, 255, 255, 0.3)" fontSize="8" textAnchor="start">{(currentTab.max + currentTab.min) / 2}{currentTab.unit}</text>
              <text x="590" y="128" fill="rgba(255, 255, 255, 0.3)" fontSize="8" textAnchor="start">{currentTab.min}{currentTab.unit}</text>
            </svg>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8c9ba5', fontSize: '13px' }}>
              Waiting for telemetry data streams to generate history chart...
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Panels: Control & Logs */}
      <div className="control-columns">
        
        {/* Hardware Simulator Panel */}
        <div className="glass-panel control-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 className="panel-title" style={{ marginBottom: 0 }}>
              <Sliders size={18} style={{ color: '#3ed6d6' }} />
              Device Simulator
            </h3>
            
            {/* Simulator Mode Toggle */}
            <button 
              className="status-badge"
              style={{ 
                cursor: 'pointer',
                borderColor: simulatorActive ? 'rgba(62, 214, 214, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                background: simulatorActive ? 'rgba(62, 214, 214, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                color: simulatorActive ? '#3ed6d6' : '#8c9ba5'
              }}
              onClick={() => setSimulatorActive(!simulatorActive)}
            >
              <div className="dot" style={{ backgroundColor: simulatorActive ? '#3ed6d6' : '#8c9ba5' }} />
              {simulatorActive ? 'Simulator Active' : 'Enable Simulator'}
            </button>
          </div>

          <div className="sim-grid" style={{ opacity: simulatorActive ? 1 : 0.4, pointerEvents: simulatorActive ? 'all' : 'none' }}>
            
            {/* Temp Slider */}
            <div className="sim-control">
              <div className="sim-label-row">
                <span>Temperature</span>
                <span>{data.temp !== undefined ? data.temp.toFixed(1) : 25}°C</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="50" 
                step="0.5" 
                className="sim-slider" 
                value={data.temp || 25}
                onChange={(e) => updateSimulatedSensor('temp', parseFloat(e.target.value))}
              />
            </div>

            {/* Humidity Slider */}
            <div className="sim-control">
              <div className="sim-label-row">
                <span>Humidity</span>
                <span>{data.hum !== undefined ? Math.round(data.hum) : 60}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                className="sim-slider" 
                value={data.hum || 60}
                onChange={(e) => updateSimulatedSensor('hum', parseInt(e.target.value))}
              />
            </div>

            {/* Soil Slider */}
            <div className="sim-control">
              <div className="sim-label-row">
                <span>Soil Moisture</span>
                <span style={{ color: soilAlert ? '#f38a8a' : '#8c9ba5' }}>
                  {data.soil !== undefined ? data.soil : 50}% {soilAlert && '(Dry)'}
                </span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                className="sim-slider" 
                value={data.soil !== undefined ? data.soil : 50}
                onChange={(e) => updateSimulatedSensor('soil', parseInt(e.target.value))}
              />
            </div>

            {/* Light Slider */}
            <div className="sim-control">
              <div className="sim-label-row">
                <span>Light Level</span>
                <span>{data.light !== undefined ? data.light : 50}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                className="sim-slider" 
                value={data.light !== undefined ? data.light : 50}
                onChange={(e) => updateSimulatedSensor('light', parseInt(e.target.value))}
              />
            </div>

            {/* Expression Overrides */}
            <div className="sim-control" style={{ marginTop: '6px' }}>
              <span className="sim-label-row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Set Expressions Preset
              </span>
              <div className="sim-buttons-row">
                {['HAPPY', 'CURIOUS', 'SLEEPY', 'LAZY', 'CONFUSED', 'SURPRISED', 'HOT', 'TOUCH'].map(mood => (
                  <button
                    key={mood}
                    className={`sim-btn ${data.expression === mood ? 'active' : ''}`}
                    onClick={() => setSimulatedExpression(mood)}
                  >
                    {mood}
                  </button>
                ))}
              </div>
              <button 
                className="sim-btn" 
                style={{ width: '100%', marginTop: '8px', padding: '6px', background: 'rgba(244, 179, 179, 0.08)', borderColor: 'rgba(244, 179, 179, 0.2)', color: '#f4b3b3' }}
                onClick={triggerSimulatorTouch}
              >
                👋 Touch interaction (❤️ shower)
              </button>
            </div>

          </div>
          {!simulatorActive && (
            <div style={{ marginTop: '12px', fontSize: '11px', color: '#8c9ba5', textAlign: 'center', fontStyle: 'italic' }}>
              Turn on "Simulator Active" to test alerts, sounds, and facial changes manually.
            </div>
          )}
        </div>

        {/* Real-time Telemetry Logs */}
        <div className="glass-panel control-panel">
          <h3 className="panel-title">
            <ListCollapse size={18} style={{ color: '#5ffa9a' }} />
            Telemetry Connections Log
          </h3>

          <div className="logs-list">
            {logs.length > 0 ? (
              logs.map((log, idx) => (
                <div key={idx} className="log-item">
                  <span className="log-time-stamp">{log.time}</span>
                  
                  <span style={{ fontSize: '10px', color: '#ffffff' }}>
                    T:{Math.round(log.temp)}°C H:{Math.round(log.hum)}% S:{log.soil}% L:{log.light}%
                  </span>

                  <span className={`log-expression mood-${log.expression.toLowerCase()}`}>
                    {log.expression}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', color: '#8c9ba5', gap: '8px' }}>
                <Activity size={32} strokeWidth="1" className="anim-pulse-heart" />
                <span style={{ fontSize: '12px' }}>Waiting for connection updates...</span>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
