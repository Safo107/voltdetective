const EGParticles = (() => {
  let canvas, ctx, W, H;
  let mouse = { x: 0, y: 0, active: false };
  let particles = [];
  let animId;

  const CONFIG = {
    count: 120,
    baseColor: '0, 198, 255',
    accentColor: '230, 48, 48',
    maxSize: 2.5,
    minSize: 0.8,
    attractRadius: 180,
    attractStrength: 0.045,
    repelRadius: 60,
    repelStrength: 0.08,
    returnSpeed: 0.03,
    friction: 0.88,
    connectDistance: 120,
    connectOpacity: 0.12,
    maxSpeed: 4.5,
  };

  class Particle {
    constructor() { this.reset(true); }

    reset(initial = false) {
      this.ox = Math.random() * W;
      this.oy = Math.random() * H;
      this.x  = initial ? this.ox : Math.random() * W;
      this.y  = initial ? this.oy : Math.random() * H;
      this.vx = 0;
      this.vy = 0;
      this.size = CONFIG.minSize +
        Math.random() * (CONFIG.maxSize - CONFIG.minSize);
      this.baseAlpha = 0.3 + Math.random() * 0.5;
      this.alpha = this.baseAlpha;
      this.isAccent = Math.random() < 0.08;
      this.pulseOffset = Math.random() * Math.PI * 2;
      this.pulseSpeed  = 0.01 + Math.random() * 0.02;
    }

    update(t) {
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;

      if (mouse.active) {
        if (dist < CONFIG.repelRadius) {
          const force = CONFIG.repelStrength *
            (1 - dist/CONFIG.repelRadius);
          this.vx -= (dx/dist) * force * 8;
          this.vy -= (dy/dist) * force * 8;
        } else if (dist < CONFIG.attractRadius) {
          const force = CONFIG.attractStrength *
            (1 - dist/CONFIG.attractRadius);
          this.vx += (dx/dist) * force * dist * 0.05;
          this.vy += (dy/dist) * force * dist * 0.05;
        }
      }

      this.vx += (this.ox - this.x) * CONFIG.returnSpeed;
      this.vy += (this.oy - this.y) * CONFIG.returnSpeed;

      this.vx *= CONFIG.friction;
      this.vy *= CONFIG.friction;

      const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
      if (speed > CONFIG.maxSpeed) {
        this.vx = (this.vx/speed) * CONFIG.maxSpeed;
        this.vy = (this.vy/speed) * CONFIG.maxSpeed;
      }

      this.x += this.vx;
      this.y += this.vy;

      this.alpha = this.baseAlpha +
        Math.sin(t * this.pulseSpeed + this.pulseOffset) * 0.15;

      if (dist < CONFIG.attractRadius && mouse.active) {
        const proximity = 1 - dist/CONFIG.attractRadius;
        this.alpha = Math.min(1, this.alpha + proximity * 0.6);
      }
    }

    draw() {
      const color = this.isAccent ? CONFIG.accentColor : CONFIG.baseColor;

      const grad = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, this.size * 3
      );
      grad.addColorStop(0, `rgba(${color},${this.alpha})`);
      grad.addColorStop(1, `rgba(${color},0)`);

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color},${Math.min(1, this.alpha * 1.5)})`;
      ctx.fill();
    }
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i+1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < CONFIG.connectDistance) {
          const opacity = CONFIG.connectOpacity *
            (1 - dist/CONFIG.connectDistance);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${CONFIG.baseColor},${opacity})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function drawCursorGlow() {
    if (!mouse.active) return;
    const grad = ctx.createRadialGradient(
      mouse.x, mouse.y, 0,
      mouse.x, mouse.y, 80
    );
    grad.addColorStop(0, 'rgba(0,198,255,0.08)');
    grad.addColorStop(1, 'rgba(0,198,255,0)');
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 80, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  let t = 0;
  function loop() {
    animId = requestAnimationFrame(loop);
    ctx.clearRect(0, 0, W, H);
    t++;
    drawConnections();
    drawCursorGlow();
    particles.forEach(p => {
      p.update(t);
      p.draw();
    });
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      mouse.x = W / 2;
      mouse.y = H / 2;
      particles.forEach(p => {
        p.ox = Math.random() * W;
        p.oy = Math.random() * H;
      });
    };

    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < CONFIG.count; i++) {
      particles.push(new Particle());
    }

    window.addEventListener('mousemove', e => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    });

    window.addEventListener('mouseleave', () => {
      mouse.active = false;
    });

    window.addEventListener('touchmove', e => {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
      mouse.active = true;
    }, { passive: true });

    window.addEventListener('touchend', () => {
      mouse.active = false;
    });

    loop();
  }

  return { init };
})();
