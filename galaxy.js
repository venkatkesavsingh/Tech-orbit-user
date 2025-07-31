const canvas = document.getElementById("galaxyCanvas");
const ctx = canvas.getContext("2d");
const bgImage = new Image();

bgImage.src = "Assets/Galaxy.jpg"; // Replace with your actual image path
let imageLoaded = false;

bgImage.onload = () => {
  imageLoaded = true;
};

let w = canvas.width = window.innerWidth;
let h = canvas.height = window.innerHeight;

window.addEventListener("resize", () => {
  canvas.width = w = window.innerWidth;
  canvas.height = h = window.innerHeight;
});

const stars = [];
const shootingStars = [];
const layers = 3;
const mouse = { x: w / 2, y: h / 2 };
let shootingStarTimer = 0;
let shootingStarInterval = 180 + Math.random() * 120;

for (let i = 0; i < 300; i++) {
  stars.push({
    x: Math.random() * w,
    y: Math.random() * h,
    radius: Math.random() * 0.9 + 0.4,
    alpha: Math.random(), // Start with random opacity
    twinkleSpeed: Math.random() * 0.02 + 0.005, // Twinkle speed
    twinkleDirection: Math.random() > 0.5 ? 1 : -1, // Fade in or out
    layer: Math.floor(Math.random() * layers) + 1
  });
}

function drawBackground() {
  if (imageLoaded) {
    ctx.drawImage(bgImage, 0, 0, w, h);
  } else {
    ctx.fillStyle = "#000"; // fallback in case image isn't loaded yet
    ctx.fillRect(0, 0, w, h);
  }
}
function drawNebula() {
  const nebula = ctx.createLinearGradient(0, h * 0.5, w, h * 0.5);
  nebula.addColorStop(0, "rgba(0,0,0,0)");
  nebula.addColorStop(0, "rgba(255, 0, 255, 1)");
  nebula.addColorStop(0, "rgba(0,0,0,0)");
  nebula.addColorStop(0, "rgba(0,0,0,0)");
  nebula.addColorStop(0, "rgba(0,0,0,0)");
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, w, h);
}

function drawStars() {
  for (let star of stars) {
    // Update opacity for smooth fade-in/out
    star.alpha += star.twinkleSpeed * star.twinkleDirection;

    // Reverse direction if bounds hit
    if (star.alpha >= 1) {
      star.alpha = 1;
      star.twinkleDirection = -1;
    } else if (star.alpha <= 0) {
      star.alpha = 0;
      star.twinkleDirection = 1;
    }

    // Parallax offset
    const offsetX = (mouse.x - w / 2) / (100 * star.layer);
    const offsetY = (mouse.y - h / 2) / (100 * star.layer);

    ctx.beginPath();
    ctx.arc(star.x + offsetX, star.y + offsetY, star.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.fill();
  }
}

function spawnShootingStar() {
  if (shootingStars.length === 0) {
    const startX = w + Math.random() * 100;
    const startY = Math.random() * h * 0.3 + 20;

    shootingStars.push({
      x: startX,
      y: startY,
      vx: -2.5,
      vy: 1.25,
      trail: [],
      life: 0,
      maxLife: 100 + Math.random() * 30,
      fade: 1,
      zFront: Math.random() < 0.2 // 20% of stars will be "in front"
    });
  }
}

function drawShootingStars() {
  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const s = shootingStars[i];
    s.trail.unshift({ x: s.x, y: s.y });
    if (s.trail.length > 25) s.trail.pop();

    const fadeOut = s.life > s.maxLife - 30 ? (s.maxLife - s.life) / 30 : 1;

    for (let j = 0; j < s.trail.length - 1; j++) {
      const opacity = (1 - j / s.trail.length) * fadeOut;
      ctx.beginPath();
      ctx.moveTo(s.trail[j].x, s.trail[j].y);
      ctx.lineTo(s.trail[j + 1].x, s.trail[j + 1].y);
      ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.lineWidth = 2 - j * 0.05;
      ctx.shadowBlur = 20 * opacity;
      ctx.shadowColor = "white";
      ctx.stroke();
    }

    s.x += s.vx;
    s.y += s.vy;
    s.life++;

    if (s.x < -100 || s.y > h + 100 || s.life > s.maxLife) {
      shootingStars.splice(i, 1);
      shootingStarTimer = 0;
      shootingStarInterval = 120 + Math.random() * 60;
    }
  }
}

function animate() {
  drawBackground();
  drawNebula();
  drawStars();
  drawShootingStars();

  shootingStarTimer++;
  if (shootingStarTimer > shootingStarInterval) {
    spawnShootingStar();
  }

  requestAnimationFrame(animate);
}

animate();

window.addEventListener("mousemove", e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});