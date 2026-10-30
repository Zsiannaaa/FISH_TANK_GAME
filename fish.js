/* Canvas art and motion for FinFriends. Classic script so file:// works offline. */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function hexToRgb(hex) {
    const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "ff8e7a";
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function rgba(hex, alpha) {
    const c = hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${alpha})`;
  }

  function shade(hex, amount) {
    const c = hexToRgb(hex);
    const adjust = (channel) => clamp(Math.round(channel + (amount > 0 ? (255 - channel) * amount : channel * amount)), 0, 255);
    return `rgb(${adjust(c.r)},${adjust(c.g)},${adjust(c.b)})`;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  class Fish {
    constructor(group, index, width, height, reducedMotion) {
      this.group = group;
      this.x = width * (0.18 + Math.random() * 0.64);
      this.y = height * (0.2 + Math.random() * 0.45);
      this.vx = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 12);
      this.vy = (Math.random() - 0.5) * 12;
      this.heading = Math.atan2(this.vy, this.vx);
      this.phase = Math.random() * TAU + index;
      this.tailPhase = Math.random() * TAU;
      this.displaySize = 48;
      this.targetSize = 48;
      this.reducedMotion = reducedMotion;
      this.foodTarget = null;
    }

    setSize(size, immediate) {
      this.targetSize = size;
      if (immediate) this.displaySize = size;
    }

    update(dt, time, bounds, neighbors, foods) {
      const size = this.displaySize;
      const margin = size * 0.62 + 14;
      let desiredX = Math.cos(time * 0.48 + this.phase) * 0.55 + Math.sin(time * 0.19 + this.phase * 2) * 0.35;
      let desiredY = Math.sin(time * 0.63 + this.phase) * 0.42;
      let speed = this.reducedMotion ? 12 : 31 + Math.sin(this.phase) * 5;

      // A nearby falling flake becomes a temporary destination.
      this.foodTarget = null;
      let nearestDistance = Infinity;
      for (const food of foods) {
        if (food.eaten) continue;
        const distance = Math.hypot(food.x - this.x, food.y - this.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          this.foodTarget = food;
        }
      }
      if (this.foodTarget) {
        const dx = this.foodTarget.x - this.x;
        const dy = this.foodTarget.y - this.y;
        const length = Math.hypot(dx, dy) || 1;
        desiredX = dx / length;
        desiredY = dy / length;
        speed = this.reducedMotion ? 22 : 72;
        if (length < size * 0.42 + 8) {
          this.foodTarget.eaten = true;
          this.foodTarget = null;
        }
      } else {
        // Soft wall repulsion keeps turns smooth instead of bouncing.
        if (this.x < bounds.left + margin) desiredX += (bounds.left + margin - this.x) / margin * 2.2;
        if (this.x > bounds.right - margin) desiredX -= (this.x - (bounds.right - margin)) / margin * 2.2;
        if (this.y < bounds.top + margin) desiredY += (bounds.top + margin - this.y) / margin * 2.2;
        if (this.y > bounds.bottom - margin) desiredY -= (this.y - (bounds.bottom - margin)) / margin * 2.2;

        // Gentle personal space, scaled to each fish's current size.
        for (const other of neighbors) {
          if (other === this) continue;
          const dx = this.x - other.x;
          const dy = this.y - other.y;
          const distance = Math.hypot(dx, dy) || 1;
          const personalSpace = (size + other.displaySize) * 0.56 + 24;
          if (distance < personalSpace) {
            const push = (personalSpace - distance) / personalSpace * 2.1;
            desiredX += dx / distance * push;
            desiredY += dy / distance * push;
          }
        }
      }

      const desiredLength = Math.hypot(desiredX, desiredY) || 1;
      const targetVx = desiredX / desiredLength * speed;
      const targetVy = desiredY / desiredLength * speed;
      const steering = 1 - Math.exp(-dt * (this.foodTarget ? 5 : 1.9));
      this.vx += (targetVx - this.vx) * steering;
      this.vy += (targetVy - this.vy) * steering;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.x = clamp(this.x, bounds.left + margin * 0.55, bounds.right - margin * 0.55);
      this.y = clamp(this.y, bounds.top + margin * 0.55, bounds.bottom - margin * 0.55);

      const targetHeading = Math.atan2(this.vy, this.vx);
      let angleDifference = ((targetHeading - this.heading + Math.PI * 3) % TAU) - Math.PI;
      this.heading += angleDifference * (1 - Math.exp(-dt * 5));
      this.tailPhase += dt * (this.reducedMotion ? 3 : 7 + Math.hypot(this.vx, this.vy) * 0.045);

      // Exponential easing makes growth smooth and frame-rate independent.
      const growthEase = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 4.2);
      this.displaySize += (this.targetSize - this.displaySize) * growthEase;
      if (Math.abs(this.targetSize - this.displaySize) < 0.02) this.displaySize = this.targetSize;
    }

    draw(ctx, isLeader) {
      const s = this.displaySize;
      const color = this.group.color;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.heading);

      // Tail sits behind the body and wiggles from its base.
      const wag = Math.sin(this.tailPhase) * (this.reducedMotion ? 0.07 : 0.2);
      ctx.save();
      ctx.translate(-s * 0.37, 0);
      ctx.rotate(wag);
      ctx.fillStyle = shade(color, -0.08);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-s * 0.28, -s * 0.37, -s * 0.46, -s * 0.32);
      ctx.quadraticCurveTo(-s * 0.39, 0, -s * 0.46, s * 0.32);
      ctx.quadraticCurveTo(-s * 0.28, s * 0.37, 0, 0);
      ctx.fill();
      ctx.restore();

      // Top fin.
      ctx.fillStyle = shade(color, -0.1);
      ctx.beginPath();
      ctx.moveTo(-s * 0.14, -s * 0.25);
      ctx.quadraticCurveTo(-s * 0.04, -s * 0.55, s * 0.18, -s * 0.28);
      ctx.closePath();
      ctx.fill();

      // Rounded cartoon body.
      const bodyGradient = ctx.createLinearGradient(0, -s * 0.32, 0, s * 0.35);
      bodyGradient.addColorStop(0, shade(color, 0.25));
      bodyGradient.addColorStop(0.55, color);
      bodyGradient.addColorStop(1, shade(color, -0.12));
      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.moveTo(-s * 0.38, 0);
      ctx.bezierCurveTo(-s * 0.35, -s * 0.37, s * 0.16, -s * 0.43, s * 0.46, -s * 0.13);
      ctx.quadraticCurveTo(s * 0.57, 0, s * 0.46, s * 0.13);
      ctx.bezierCurveTo(s * 0.16, s * 0.43, -s * 0.35, s * 0.37, -s * 0.38, 0);
      ctx.fill();

      // Soft side fin.
      ctx.fillStyle = rgba(color, 0.78);
      ctx.beginPath();
      ctx.moveTo(-s * 0.03, s * 0.05);
      ctx.quadraticCurveTo(-s * 0.12, s * 0.4, s * 0.18, s * 0.19);
      ctx.quadraticCurveTo(s * 0.13, s * 0.06, -s * 0.03, s * 0.05);
      ctx.fill();

      // A small shine, eye, and smile make the direction unmistakable.
      ctx.strokeStyle = "rgba(255,255,255,.45)";
      ctx.lineWidth = Math.max(1.5, s * 0.018);
      ctx.beginPath();
      ctx.arc(s * 0.08, -s * 0.08, s * 0.23, Math.PI * 1.1, Math.PI * 1.55);
      ctx.stroke();

      const eyeX = s * 0.3;
      const eyeY = -s * 0.1;
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, s * 0.075, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#123247";
      ctx.beginPath();
      ctx.arc(eyeX + s * 0.018, eyeY, s * 0.038, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(eyeX + s * 0.03, eyeY - s * 0.018, s * 0.012, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = "rgba(50,40,45,.55)";
      ctx.lineWidth = Math.max(1.2, s * 0.015);
      ctx.beginPath();
      ctx.arc(s * 0.36, s * 0.045, s * 0.09, 0.25, 1.65);
      ctx.stroke();
      ctx.restore();

      this.drawLabel(ctx, isLeader);
    }

    drawLabel(ctx, isLeader) {
      const s = this.displaySize;
      const fontSize = clamp(s * 0.16, 16, 21);
      ctx.save();
      ctx.font = `800 ${fontSize}px "Trebuchet MS", system-ui, sans-serif`;
      let name = this.group.name || "Group";
      const maxNameWidth = 155;
      if (ctx.measureText(name).width > maxNameWidth) {
        while (name.length > 2 && ctx.measureText(name + "…").width > maxNameWidth) name = name.slice(0, -1);
        name += "…";
      }
      const label = `${name}  ·  ${this.group.points} pts`;
      const width = Math.min(230, ctx.measureText(label).width + 24);
      const height = fontSize + 13;
      const x = this.x - width / 2;
      const y = this.y - s * 0.63 - height - (isLeader ? 17 : 7);

      ctx.fillStyle = "rgba(5,48,65,.78)";
      roundedRect(ctx, x, y, width, height, height / 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, this.x, y + height / 2 + 0.5, width - 16);

      if (isLeader) drawCrown(ctx, this.x, y - 8, 24);
      ctx.restore();
    }
  }

  function drawCrown(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.fillStyle = "#ffd166";
    ctx.strokeStyle = "rgba(98,67,5,.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, size * 0.72);
    ctx.lineTo(0, size * 0.2);
    ctx.lineTo(size * 0.25, size * 0.43);
    ctx.lineTo(size * 0.5, 0);
    ctx.lineTo(size * 0.75, size * 0.43);
    ctx.lineTo(size, size * 0.2);
    ctx.lineTo(size - 1, size * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    roundedRect(ctx, 1, size * 0.72, size - 2, size * 0.2, 2);
    ctx.fill();
    ctx.restore();
  }

  class TankScene {
    constructor(reducedMotion) {
      this.reducedMotion = reducedMotion;
      this.width = 1;
      this.height = 1;
      this.sandHeight = 75;
      this.bubbles = [];
      this.decor = [];
      this.effects = [];
      this.foods = [];
    }

    resize(width, height) {
      this.width = width;
      this.height = height;
      this.sandHeight = clamp(height * 0.1, 55, 100);
      const bubbleCount = this.reducedMotion ? 12 : clamp(Math.round(width / 24), 30, 70);
      this.bubbles = Array.from({ length: bubbleCount }, () => this.makeBubble(true));
      this.decor = Array.from({ length: clamp(Math.round(width / 170), 5, 11) }, (_, i) => ({
        x: (i + 0.35 + Math.random() * 0.3) / clamp(Math.round(width / 170), 5, 11) * width,
        height: 35 + Math.random() * 75,
        width: 9 + Math.random() * 10,
        phase: Math.random() * TAU,
        color: ["#176f67", "#238b72", "#396f78"][i % 3]
      }));
    }

    makeBubble(anywhere) {
      return {
        x: Math.random() * this.width,
        y: anywhere ? Math.random() * this.height : this.height + 10,
        radius: 1.5 + Math.random() * 4,
        speed: 8 + Math.random() * 19,
        drift: Math.random() * TAU,
        alpha: 0.12 + Math.random() * 0.25
      };
    }

    burst(x, y, color, text) {
      this.effects.push({ type: "text", x, y, text, color: "#ffffff", life: 1.25, age: 0 });
      const count = this.reducedMotion ? 4 : 12;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * TAU;
        const speed = 20 + Math.random() * 55;
        this.effects.push({
          type: i % 3 === 0 ? "bubble" : "spark",
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18,
          color, life: 0.7 + Math.random() * 0.45, age: 0, size: 2 + Math.random() * 3
        });
      }
    }

    feed(groupCount) {
      const count = Math.max(8, groupCount * 4);
      for (let i = 0; i < count; i++) {
        this.foods.push({
          x: this.width * (0.08 + Math.random() * 0.84),
          y: 70 - Math.random() * 170,
          vy: 25 + Math.random() * 14,
          phase: Math.random() * TAU,
          rotation: Math.random() * TAU,
          eaten: false
        });
      }
    }

    update(dt) {
      for (const bubble of this.bubbles) {
        bubble.y -= bubble.speed * dt;
        bubble.x += Math.sin(bubble.y * 0.018 + bubble.drift) * dt * 4;
        if (bubble.y < -10) Object.assign(bubble, this.makeBubble(false));
      }
      for (const food of this.foods) {
        food.y += food.vy * dt;
        food.x += Math.sin(food.y * 0.035 + food.phase) * dt * 9;
        food.rotation += dt * 1.4;
      }
      this.foods = this.foods.filter((food) => !food.eaten && food.y < this.height - this.sandHeight + 10);
      for (const effect of this.effects) {
        effect.age += dt;
        if (effect.type === "text") effect.y -= dt * 35;
        else {
          effect.x += effect.vx * dt;
          effect.y += effect.vy * dt;
          effect.vy -= dt * 12;
        }
      }
      this.effects = this.effects.filter((effect) => effect.age < effect.life);
    }

    drawBackground(ctx, time) {
      const water = ctx.createLinearGradient(0, 0, 0, this.height);
      water.addColorStop(0, "#087f9d");
      water.addColorStop(0.48, "#086f8d");
      water.addColorStop(1, "#07546f");
      ctx.fillStyle = water;
      ctx.fillRect(0, 0, this.width, this.height);

      // Wide translucent light shafts from the surface.
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 5; i++) {
        const drift = this.reducedMotion ? 0 : Math.sin(time * 0.09 + i) * 28;
        const x = this.width * (0.05 + i * 0.22) + drift;
        const ray = ctx.createLinearGradient(0, 0, 0, this.height * 0.78);
        ray.addColorStop(0, "rgba(174,241,226,.12)");
        ray.addColorStop(1, "rgba(174,241,226,0)");
        ctx.fillStyle = ray;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + this.width * 0.075, 0);
        ctx.lineTo(x + this.width * 0.19, this.height * 0.8);
        ctx.lineTo(x + this.width * 0.06, this.height * 0.8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      for (const bubble of this.bubbles) {
        ctx.strokeStyle = `rgba(215,249,246,${bubble.alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.radius, 0, TAU);
        ctx.stroke();
      }

      this.drawSeaFloor(ctx, time);
    }

    drawSeaFloor(ctx, time) {
      const floorY = this.height - this.sandHeight;
      ctx.fillStyle = "#d8bd79";
      ctx.beginPath();
      ctx.moveTo(0, floorY + 10);
      for (let x = 0; x <= this.width + 30; x += 30) {
        ctx.lineTo(x, floorY + Math.sin(x * 0.018) * 6);
      }
      ctx.lineTo(this.width, this.height);
      ctx.lineTo(0, this.height);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,231,166,.25)";
      ctx.fillRect(0, floorY + 18, this.width, 3);

      // Rocks and small coral silhouettes are generated entirely in canvas.
      for (let i = 0; i < 5; i++) {
        const x = this.width * (0.08 + i * 0.21);
        const y = floorY + 15;
        ctx.fillStyle = i % 2 ? "#718b85" : "#82958a";
        ctx.beginPath();
        ctx.ellipse(x, y, 24 + i % 3 * 7, 13 + i % 2 * 5, -0.1, Math.PI, TAU);
        ctx.fill();
        if (i % 2 === 0) {
          ctx.strokeStyle = "#d77f70";
          ctx.lineWidth = 6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x + 32, floorY + 13);
          ctx.lineTo(x + 32, floorY - 24);
          ctx.moveTo(x + 32, floorY - 10);
          ctx.lineTo(x + 20, floorY - 20);
          ctx.moveTo(x + 32, floorY - 16);
          ctx.lineTo(x + 44, floorY - 29);
          ctx.stroke();
        }
      }

      for (const plant of this.decor) {
        const sway = this.reducedMotion ? 0 : Math.sin(time * 0.75 + plant.phase) * 10;
        ctx.strokeStyle = plant.color;
        ctx.lineWidth = plant.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(plant.x, floorY + 18);
        ctx.bezierCurveTo(plant.x - sway, floorY - plant.height * 0.25, plant.x + sway, floorY - plant.height * 0.7, plant.x + sway, floorY - plant.height);
        ctx.stroke();
        ctx.lineWidth = Math.max(3, plant.width * 0.35);
        ctx.beginPath();
        ctx.moveTo(plant.x, floorY - plant.height * 0.35);
        ctx.quadraticCurveTo(plant.x + 20, floorY - plant.height * 0.45, plant.x + 24 + sway * 0.3, floorY - plant.height * 0.58);
        ctx.stroke();
      }
    }

    drawFoods(ctx) {
      for (const food of this.foods) {
        ctx.save();
        ctx.translate(food.x, food.y);
        ctx.rotate(food.rotation);
        ctx.fillStyle = "#f5cf73";
        roundedRect(ctx, -4, -2.5, 8, 5, 2);
        ctx.fill();
        ctx.restore();
      }
    }

    drawEffects(ctx) {
      for (const effect of this.effects) {
        const progress = effect.age / effect.life;
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        if (effect.type === "text") {
          ctx.font = '900 25px "Trebuchet MS", system-ui, sans-serif';
          ctx.textAlign = "center";
          ctx.lineWidth = 5;
          ctx.strokeStyle = "rgba(5,48,65,.55)";
          ctx.strokeText(effect.text, effect.x, effect.y);
          ctx.fillStyle = effect.color;
          ctx.fillText(effect.text, effect.x, effect.y);
        } else if (effect.type === "bubble") {
          ctx.strokeStyle = "rgba(230,255,250,.8)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(effect.x, effect.y, effect.size + progress * 3, 0, TAU);
          ctx.stroke();
        } else {
          ctx.translate(effect.x, effect.y);
          ctx.rotate(progress * 2);
          ctx.fillStyle = effect.color;
          const s = effect.size * (1 - progress * 0.4);
          ctx.beginPath();
          ctx.moveTo(0, -s * 1.8);
          ctx.lineTo(s * 0.55, -s * 0.5);
          ctx.lineTo(s * 1.8, 0);
          ctx.lineTo(s * 0.55, s * 0.5);
          ctx.lineTo(0, s * 1.8);
          ctx.lineTo(-s * 0.55, s * 0.5);
          ctx.lineTo(-s * 1.8, 0);
          ctx.lineTo(-s * 0.55, -s * 0.5);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  window.FishTankArt = { Fish, TankScene, sizeClamp: clamp };
})();
