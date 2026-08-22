import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, LayoutDashboard, Bell, BellOff, RefreshCw, ShoppingCart, ArrowRight, ShieldCheck, Heart, Leaf, X, Plus, Minus } from 'lucide-react';
import MirrorDisplay from './components/MirrorDisplay';
import Dashboard from './components/Dashboard';

const PRODUCTS = [
  { id: 1, name: 'MOA Plant Bot v2', price: 129.0, desc: 'Interactive AI plant companion with TFT screen, soil probe, and LDR light sensor.', emoji: '🤖', tag: 'Best Seller' },
  { id: 2, name: 'Nutrient Bio-Pods', price: 19.0, desc: 'Slow-release organic plant supplement optimized for smart hydroponic containers.', emoji: '💊', tag: 'New Release' },
  { id: 3, name: 'Capacitive Soil Probe', price: 12.0, desc: 'Replacement high-accuracy corrosion-resistant gold-finish moisture sensor.', emoji: '🔌', tag: 'Spare Part' },
  { id: 4, name: 'Smart Walnut Stand', price: 45.0, desc: 'Eco-sourced solid walnut base with built-in full spectrum grow lighting.', emoji: '🪵', tag: 'Accessories' }
];

export default function App() {
  const [currentPage, setCurrentPage] = useState('home'); // home | shop | dashboard
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

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
    if (simulatorActive) return; 

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

    const eventSource = new EventSource('/api/events');

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      
      if (payload.type === 'init' || payload.type === 'telemetry') {
        const latest = payload.data;
        setTelemetry(latest);
        
        if (payload.history) {
          setHistory(payload.history);
        }

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

        if (latest.soil < 25 && latest.deviceConnected) {
          const now = Date.now();
          if (now - lastAlarmTimeRef.current > 30000) { 
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

    if (simulatedData.soil < 25) {
      const now = Date.now();
      if (now - lastAlarmTimeRef.current > 20000) { 
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
      let size = Math.floor(Math.random() * 3) + 1; 

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
        vy = 0.8 + Math.random() * 0.5; 
      }

      setParticles(prev => [...prev, { id, x, y, vx, vy, type, size, spawnTime: Date.now() }]);
    }, 1500);

    const physicsTimer = setInterval(() => {
      setParticles(prev => 
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
          }))
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
      
      if (next.soil < 25) {
        next.expression = 'THIRSTY';
      } else if (next.temp > 32) {
        next.expression = 'HOT';
      } else if (next.light < 12) {
        next.expression = 'SLEEPY';
      } else if (next.light > 85) {
        next.expression = 'EXCITED';
      } else {
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
    playHappyChime();

    if (simulatorActive) {
      setSimulatedData(prev => ({ ...prev, expression: 'TOUCH' }));
      setTimeout(() => {
        setSimulatedData(prev => ({ ...prev, expression: prev.soil < 25 ? 'THIRSTY' : 'HAPPY' }));
      }, 2500);
    } else {
      fetch('/api/simulator/touch', { method: 'POST' })
        .catch(err => console.log('Error triggering simulator touch:', err));
    }

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

  // Active data selection
  const activeData = simulatorActive 
    ? { ...simulatedData, deviceConnected: true } 
    : telemetry;

  // Cart Helper functions
  const addToCart = (product) => {
    playHappyChime();
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setCartOpen(true);
  };

  const updateCartQuantity = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const nextQty = item.quantity + delta;
        return nextQty > 0 ? { ...item, quantity: nextQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const handleCheckout = () => {
    setCheckoutSuccess(true);
    setTimeout(() => {
      setCart([]);
      setCartOpen(false);
      setCheckoutSuccess(false);
    }, 3000);
  };

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  return (
    <div style={{ position: 'relative' }}>
      
      {/* 1. App Navigation Header */}
      <header className="app-header">
        <div className="brand-logo" onClick={() => setCurrentPage('home')} style={{ cursor: 'pointer' }}>
          <div className="logo-dot"></div>
          MOA Life
        </div>

        <nav className="nav-links">
          <button className={`nav-link ${currentPage === 'home' ? 'active' : ''}`} onClick={() => setCurrentPage('home')}>
            Home
          </button>
          <button className={`nav-link ${currentPage === 'shop' ? 'active' : ''}`} onClick={() => setCurrentPage('shop')}>
            Shop
          </button>
          <button className={`nav-link ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentPage('dashboard')}>
            Live Telemetry
          </button>
        </nav>

        <div className="header-actions">
          <button 
            className="status-badge" 
            onClick={() => setAudioAlerts(!audioAlerts)} 
            style={{ cursor: 'pointer', border: '2px solid #0b0f19' }}
          >
            {audioAlerts ? "🔊 Audio On" : "🔇 Audio Off"}
          </button>

          <button 
            className="btn-neon"
            onClick={() => setCartOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <ShoppingCart size={15} />
            Cart ({totalItems})
          </button>
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

      {/* 2. Main Routing Section */}
      <main>
        
        {/* A. HOME LANDING VIEW */}
        {currentPage === 'home' && (
          <div className="home-container anim-float">
            <section className="hero-section">
              <div className="hero-content">
                <h1 className="display-giant">
                  Intelligent<br />
                  Green<br />
                  Living.
                </h1>
                <p className="hero-subtitle">
                  Meet MOA—a revolutionary smart plant companion. Powered by real-time IoT sensors and animated expressions, MOA monitors soil moisture, light levels, and air environments to interactively guide you in nurturing organic plant health.
                </p>
                <div className="hero-buttons">
                  <button className="btn-neon" onClick={() => setCurrentPage('shop')}>
                    Shop Bot & Spares <ArrowRight size={14} style={{ display: 'inline', marginLeft: '6px' }} />
                  </button>
                  <button className="btn-outline" onClick={() => setCurrentPage('dashboard')}>
                    View Live Feed
                  </button>
                </div>
              </div>

              {/* Right Side Animated Interactive Showcase */}
              <div className="hero-showcase">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="status-badge connected">
                    <span className="dot pulse"></span> Live System Online
                  </div>
                  <span className="showcase-stat">98%</span>
                </div>
                
                {/* Mirror display inside hero container */}
                <div style={{ alignSelf: 'center', transform: 'scale(1.1)', margin: '20px 0' }}>
                  <MirrorDisplay 
                    data={activeData}
                    activeParticles={particles}
                    triggerSimulatorTouch={triggerSimulatorTouch}
                  />
                </div>

                <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>
                  Tap MOA's screen to trigger interactive expressions and heart animations!
                </div>
              </div>
            </section>

            {/* Feature Grid Section */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              <h2 className="display-large" style={{ color: '#0b0f19' }}>Key Innovations</h2>
              <div className="feature-grid">
                <div className="feature-card">
                  <div className="feature-tag">Smart Sensors</div>
                  <h3>Capacitive Probe & DHT22</h3>
                  <p className="feature-desc">MOA measures soil water levels corrosion-free, tracking environmental moisture and ambient heat continuously.</p>
                </div>
                <div className="feature-card">
                  <div className="feature-tag">Human UI</div>
                  <h3>11+ Emotional Expressions</h3>
                  <p className="feature-desc">Blinking eye states, happy gaze vectors, surprised alerts, and crying thirsty frames change dynamically based on care.</p>
                </div>
                <div className="feature-card">
                  <div className="feature-tag">Captive Web</div>
                  <h3>Auto-AP WiFi Portal</h3>
                  <p className="feature-desc">Hold the screen for 3s to boot MOA-Plant-Bot WebServer setup page. Change your SSID persistently over local web forms.</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* B. SHOP PAGE VIEW */}
        {currentPage === 'shop' && (
          <div className="shop-container anim-float">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', color: '#bffd05', backgroundColor: '#0b0f19', padding: '4px 10px', borderRadius: '20px', alignSelf: 'flex-start' }}>
                Store Catalog
              </span>
              <h1 className="display-giant">Smart Gear.</h1>
            </div>

            <div className="shop-grid">
              {PRODUCTS.map(product => (
                <div key={product.id} className="product-card">
                  <div className="product-image-container">
                    <span className="product-tag">{product.tag}</span>
                    <span style={{ fontSize: '72px' }}>{product.emoji}</span>
                  </div>
                  <div className="product-info">
                    <h3 className="product-title">{product.name}</h3>
                    <p className="product-desc">{product.desc}</p>
                    <div className="product-footer">
                      <span className="product-price">${product.price.toFixed(2)}</span>
                      <button className="btn-add-cart" onClick={() => addToCart(product)}>
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* C. LIVE DASHBOARD PANEL (Original Telemetry Feature Wrapper in Odama Dark Style) */}
        {currentPage === 'dashboard' && (
          <div className="dashboard-page-wrapper anim-float">
            <div className="dashboard-page-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: '#bffd05', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    AgriTech Client Area
                  </span>
                  <h2 className="display-large">System Telemetry.</h2>
                </div>
                
                {/* Real-time Status Badge controls */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={notificationsAllowed ? undefined : requestNotificationPermission}
                    className="status-badge"
                    style={{ 
                      cursor: notificationsAllowed ? 'default' : 'pointer',
                      borderColor: notificationsAllowed ? 'rgba(191, 253, 5, 0.3)' : 'rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    {notificationsAllowed ? "Web Alerts Enabled" : "Enable Web Alerts"}
                  </button>
                  
                  <span className={`status-badge ${simulatorActive ? 'simulated' : (activeData.deviceConnected ? 'connected' : 'disconnected')}`}>
                    <span className="dot pulse"></span>
                    {simulatorActive ? 'Simulator Active' : (activeData.deviceConnected ? 'ESP32 Online' : 'ESP32 Offline')}
                  </span>
                </div>
              </div>
            </div>

            <div className="main-layout">
              {/* Left Column: TFT Mirror */}
              <MirrorDisplay 
                data={activeData}
                activeParticles={particles}
                triggerSimulatorTouch={triggerSimulatorTouch}
              />

              {/* Right Column: Graphs, Simulators, Logs */}
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
            </div>
          </div>
        )}

      </main>

      {/* 3. SLIDING SHOPPING CART DRAWER */}
      {cartOpen && (
        <div className="cart-overlay" onClick={() => setCartOpen(false)}>
          <div className="cart-drawer open" onClick={(e) => e.stopPropagation()}>
            <div className="cart-header">
              <span className="cart-title">My Cart ({totalItems})</span>
              <button className="btn-close-cart" onClick={() => setCartOpen(false)}>
                ✕
              </button>
            </div>

            {checkoutSuccess ? (
              <div className="success-overlay">
                <span style={{ fontSize: '64px' }}>🎉</span>
                <h2 className="display-large" style={{ color: '#bffd05' }}>Ordered!</h2>
                <p style={{ color: '#94a3b8' }}>Thank you for supporting MOA. Your greenhouse parcel is prepping for shipping!</p>
              </div>
            ) : (
              <>
                <div className="cart-items-list">
                  {cart.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', color: '#94a3b8', gap: '16px' }}>
                      <span style={{ fontSize: '48px' }}>🛒</span>
                      <p>Your cart is empty. Add farm tech gear from the Shop page!</p>
                    </div>
                  ) : (
                    cart.map(item => (
                      <div key={item.id} className="cart-item">
                        <div className="cart-item-img">{item.emoji}</div>
                        <div className="cart-item-details">
                          <span className="cart-item-name">{item.name}</span>
                          <span className="cart-item-price">${(item.price * item.quantity).toFixed(2)}</span>
                          <div className="cart-qty-control">
                            <button className="btn-qty" onClick={() => updateCartQuantity(item.id, -1)}>-</button>
                            <span>{item.quantity}</span>
                            <button className="btn-qty" onClick={() => updateCartQuantity(item.id, 1)}>+</button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="cart-summary">
                    <div className="summary-row">
                      <span>Subtotal</span>
                      <span style={{ color: '#bffd05' }}>${cartSubtotal.toFixed(2)}</span>
                    </div>
                    <button className="btn-checkout" onClick={handleCheckout}>
                      Confirm Order & Pay
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
