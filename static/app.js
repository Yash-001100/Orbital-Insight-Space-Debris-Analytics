const palette = ["#008f7a", "#e75f58", "#e5b93d", "#3677c8", "#4f9d69", "#7c6fcb", "#d96c2f"];
const chartTitles = {
  orbit: ["Orbit Distribution", "Objects by orbit type"],
  category: ["Object Mix", "Satellites, debris, rocket bodies"],
  country: ["Country Insights", "Top owners and countries"],
  risk: ["Risk Analysis", "Highest-risk orbital zones"],
  growth: ["Growth Trend", "Cumulative launches over time"],
  altitude: ["Altitude Analysis", "Objects by altitude band"],
  status: ["Operational Status", "Objects by catalog status"],
};
const landMasses = [
  [[72, -168], [69, -140], [56, -124], [50, -90], [31, -82], [18, -96], [8, -83], [14, -105], [30, -118], [47, -124], [58, -150]],
  [[12, -81], [7, -72], [-5, -77], [-15, -74], [-34, -70], [-55, -68], [-52, -58], [-34, -52], [-16, -45], [3, -51], [11, -62]],
  [[72, -10], [63, 25], [52, 45], [45, 70], [30, 105], [16, 112], [8, 80], [22, 44], [36, 22], [50, 8], [59, -6]],
  [[35, -17], [31, 31], [12, 43], [-7, 39], [-34, 22], [-35, 17], [-17, 12], [2, 9], [12, -5]],
  [[58, 60], [70, 100], [61, 150], [45, 145], [36, 117], [22, 96], [8, 80], [20, 55], [42, 49]],
  [[9, 95], [22, 107], [13, 122], [-4, 120], [-8, 105]],
  [[-12, 113], [-22, 121], [-35, 139], [-43, 146], [-32, 153], [-18, 146], [-11, 130]],
  [[83, -52], [76, -20], [66, -38], [70, -58]],
];
const globePointLimit = 9000;
const earthTexture = new Image();
let earthTextureReady = false;

earthTexture.onload = () => {
  earthTextureReady = true;
};
earthTexture.src = "/static/images/earth-blue-marble-2048.jpg";

let dashboardData = null;
let searchTimer = null;
let globeState = null;

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return response.json();
}

async function postJson(url) {
  const response = await fetch(url, { method: "POST" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Failed to update ${url}`);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function hashNumber(value) {
  let hash = 0;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash / 4294967295;
}

function fitCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function drawNoData(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#5a6468";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText("No matching data for the selected filters", width / 2, height / 2);
  ctx.textAlign = "left";
}

function drawAxis(ctx, padding, width, height) {
  ctx.strokeStyle = "#d8ddd5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();
}

function drawBarChart(canvas, rows, labelKey, valueKey) {
  const { ctx, width, height } = fitCanvas(canvas);
  rows = rows.filter((row) => Number(row[valueKey]) > 0).slice(0, 12);
  if (!rows.length) {
    drawNoData(ctx, width, height);
    return;
  }

  const padding = { top: 22, right: 20, bottom: 62, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...rows.map((row) => Number(row[valueKey])), 1);
  const barWidth = plotWidth / rows.length * 0.62;

  ctx.clearRect(0, 0, width, height);
  drawAxis(ctx, padding, width, height);
  ctx.font = "12px Arial";

  rows.forEach((row, index) => {
    const value = Number(row[valueKey]);
    const x = padding.left + (plotWidth / rows.length) * index + (plotWidth / rows.length - barWidth) / 2;
    const h = Math.max((value / maxValue) * plotHeight, 2);
    const y = height - padding.bottom - h;
    ctx.fillStyle = palette[index % palette.length];
    ctx.fillRect(x, y, barWidth, h);
    ctx.fillStyle = "#15181a";
    ctx.fillText(formatNumber(value), x, y - 7);
    ctx.save();
    ctx.translate(x + barWidth / 2, height - padding.bottom + 18);
    ctx.rotate(-0.52);
    ctx.fillStyle = "#5a6468";
    ctx.fillText(String(row[labelKey]).slice(0, 18), 0, 0);
    ctx.restore();
  });
}

function drawHorizontalBarChart(canvas, rows, labelKey, valueKey, valueSuffix = "") {
  const { ctx, width, height } = fitCanvas(canvas);
  rows = rows.filter((row) => Number(row[valueKey]) > 0).slice(0, 10);
  if (!rows.length) {
    drawNoData(ctx, width, height);
    return;
  }

  const padding = { top: 18, right: 42, bottom: 28, left: 150 };
  const plotWidth = width - padding.left - padding.right;
  const rowHeight = (height - padding.top - padding.bottom) / rows.length;
  const maxValue = Math.max(...rows.map((row) => Number(row[valueKey])), 1);

  ctx.clearRect(0, 0, width, height);
  ctx.font = "12px Arial";

  rows.forEach((row, index) => {
    const y = padding.top + index * rowHeight + rowHeight * 0.18;
    const barHeight = Math.max(rowHeight * 0.48, 8);
    const value = Number(row[valueKey]);
    const label = String(row[labelKey]).slice(0, 22);
    const barWidth = Math.max((value / maxValue) * plotWidth, 2);

    ctx.fillStyle = "#5a6468";
    ctx.fillText(label, 10, y + barHeight * 0.8);
    ctx.fillStyle = palette[index % palette.length];
    ctx.fillRect(padding.left, y, barWidth, barHeight);
    ctx.fillStyle = "#15181a";
    ctx.fillText(`${formatNumber(value)}${valueSuffix}`, padding.left + barWidth + 8, y + barHeight * 0.8);
  });
}

function drawDonutChart(canvas, rows, labelKey, valueKey) {
  const { ctx, width, height } = fitCanvas(canvas);
  rows = rows.filter((row) => Number(row[valueKey]) > 0).slice(0, 8);
  const total = rows.reduce((sum, row) => sum + Number(row[valueKey]), 0);
  if (!rows.length || total === 0) {
    drawNoData(ctx, width, height);
    return;
  }

  const radius = Math.min(width, height) * 0.32;
  const centerX = width * 0.35;
  const centerY = height * 0.5;
  let startAngle = -Math.PI / 2;

  ctx.clearRect(0, 0, width, height);
  rows.forEach((row, index) => {
    const value = Number(row[valueKey]);
    const slice = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = palette[index % palette.length];
    ctx.fill();
    startAngle += slice;
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.fillStyle = "#15181a";
  ctx.font = "700 24px Arial";
  ctx.textAlign = "center";
  ctx.fillText(formatNumber(total), centerX, centerY + 8);
  ctx.textAlign = "left";

  ctx.font = "13px Arial";
  rows.forEach((row, index) => {
    const legendX = width * 0.64;
    const legendY = 48 + index * 28;
    ctx.fillStyle = palette[index % palette.length];
    ctx.fillRect(legendX, legendY - 10, 12, 12);
    ctx.fillStyle = "#15181a";
    ctx.fillText(`${row[labelKey]}: ${formatNumber(row[valueKey])}`, legendX + 20, legendY);
  });
}

function drawLineChart(canvas, rows) {
  const totals = new Map();
  rows.forEach((row) => {
    const year = Number(row.launch_year);
    if (year > 0) {
      totals.set(year, Number(row.cumulative_objects));
    }
  });
  const points = [...totals.entries()].sort((a, b) => a[0] - b[0]);
  const { ctx, width, height } = fitCanvas(canvas);
  if (!points.length) {
    drawNoData(ctx, width, height);
    return;
  }

  const padding = { top: 20, right: 26, bottom: 46, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const minYear = Math.min(...points.map((point) => point[0]));
  const maxYear = Math.max(...points.map((point) => point[0]));
  const maxValue = Math.max(...points.map((point) => point[1]));

  ctx.clearRect(0, 0, width, height);
  drawAxis(ctx, padding, width, height);
  ctx.strokeStyle = "#008f7a";
  ctx.lineWidth = 3;
  ctx.beginPath();

  points.forEach(([year, value], index) => {
    const x = padding.left + ((year - minYear) / Math.max(maxYear - minYear, 1)) * plotWidth;
    const y = height - padding.bottom - (value / maxValue) * plotHeight;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  points.forEach(([year, value], index) => {
    const x = padding.left + ((year - minYear) / Math.max(maxYear - minYear, 1)) * plotWidth;
    const y = height - padding.bottom - (value / maxValue) * plotHeight;
    ctx.beginPath();
    ctx.fillStyle = "#15181a";
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 6) === 0) {
      ctx.fillStyle = "#5a6468";
      ctx.fillText(year.toString(), x - 12, height - 14);
    }
  });
}

function renderPrimaryChart() {
  if (!dashboardData) {
    return;
  }
  const selection = document.querySelector("#visualizationSelect").value;
  const [eyebrow, title] = chartTitles[selection];
  const canvas = document.querySelector("#primaryChart");

  document.querySelector("#primaryEyebrow").textContent = eyebrow;
  document.querySelector("#primaryTitle").textContent = title;

  if (selection === "orbit") {
    drawBarChart(canvas, dashboardData.orbit_stats, "orbit_type", "total_objects");
  } else if (selection === "category") {
    drawDonutChart(canvas, dashboardData.category_stats, "object_category", "total_objects");
  } else if (selection === "country") {
    drawHorizontalBarChart(canvas, dashboardData.country_stats, "country", "objects");
  } else if (selection === "risk") {
    const rows = dashboardData.risk_zones.map((zone) => ({
      label: `${zone.orbit_type} / ${zone.longitude_sector}`,
      average_risk: zone.average_risk,
    }));
    drawHorizontalBarChart(canvas, rows, "label", "average_risk", " risk");
  } else if (selection === "growth") {
    drawLineChart(canvas, dashboardData.growth_trends);
  } else if (selection === "altitude") {
    drawBarChart(canvas, dashboardData.altitude_bins, "altitude_band", "total_objects");
  } else if (selection === "status") {
    drawDonutChart(canvas, dashboardData.status_stats, "status", "total_objects");
  }
}

function renderRiskZones(rows) {
  const list = document.querySelector("#riskList");
  list.innerHTML = rows.slice(0, 7).map((zone) => {
    const score = Number(zone.average_risk);
    return `
      <div class="risk-row">
        <div class="risk-label">
          <strong>${escapeHtml(zone.orbit_type)} / ${escapeHtml(zone.longitude_sector)}</strong>
          <span>${formatNumber(zone.object_count)} objects near ${formatNumber(zone.average_altitude_km)} km</span>
        </div>
        <div class="risk-bar" aria-hidden="true">
          <div class="risk-fill" style="width: ${Math.min(score, 100)}%"></div>
        </div>
        <div class="risk-score">${score.toFixed(1)}</div>
      </div>
    `;
  }).join("");
}

function renderObjectTable(rows) {
  const body = document.querySelector("#objectTable");
  body.innerHTML = rows.slice(0, 30).map((item) => {
    const level = String(item.risk_level).toLowerCase();
    return `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.object_category)}</td>
        <td>${escapeHtml(item.orbit_type)}</td>
        <td>${escapeHtml(item.country)}</td>
        <td>${formatNumber(item.altitude_km)} km</td>
        <td><span class="pill ${level}">${escapeHtml(item.risk_level)} ${Number(item.risk_score).toFixed(1)}</span></td>
      </tr>
    `;
  }).join("");
}

function orbitColor(orbitType) {
  return {
    LEO: "#ffb000",
    MEO: "#7ee000",
    GEO: "#16d59a",
    HEO: "#e75f58",
    Unknown: "#aebdb7",
  }[orbitType] || "#aebdb7";
}

function prepareGlobeSatellites(rows) {
  return rows.map((satellite) => {
    const seed = hashNumber(satellite.object_id);
    const seedTwo = hashNumber(`${satellite.object_id}-${satellite.name}`);
    const altitude = Number(satellite.altitude_km || 550);
    const inclination = Number(satellite.inclination_deg || 0) * Math.PI / 180;
    const altitudeScale = Math.log1p(Math.max(altitude, 100)) / Math.log1p(36000);
    const orbitRadius = 1.18 + altitudeScale * 0.82;
    const speedByOrbit = { LEO: 1.15, MEO: 0.58, GEO: 0.24, HEO: 0.36 };
    return {
      ...satellite,
      phase: seed * Math.PI * 2,
      raan: seedTwo * Math.PI * 2,
      inclination,
      orbitRadius,
      speed: speedByOrbit[satellite.orbit_type] || 0.5,
      color: orbitColor(satellite.orbit_type),
      screenX: 0,
      screenY: 0,
      depth: 0,
    };
  });
}

function rotateVector(point, yaw, pitch) {
  const cosy = Math.cos(yaw);
  const siny = Math.sin(yaw);
  const cosp = Math.cos(pitch);
  const sinp = Math.sin(pitch);
  const x = point.x * cosy - point.z * siny;
  const z = point.x * siny + point.z * cosy;
  const y = point.y * cosp - z * sinp;
  return { x, y, z: point.y * sinp + z * cosp };
}

function projectPoint(point, cx, cy, radius) {
  const focal = radius * 4.2;
  const scale = focal / (focal - point.z * radius);
  return {
    x: cx + point.x * radius * scale,
    y: cy + point.y * radius * scale,
    scale,
    depth: point.z,
  };
}

function latLonVector(latDeg, lonDeg) {
  const lat = latDeg * Math.PI / 180;
  const lon = lonDeg * Math.PI / 180;
  const cosLat = Math.cos(lat);
  return {
    x: cosLat * Math.sin(lon),
    y: -Math.sin(lat),
    z: cosLat * Math.cos(lon),
  };
}

function drawStarfield(ctx, width, height, time) {
  ctx.fillStyle = "#0c1113";
  ctx.fillRect(0, 0, width, height);
  for (let index = 0; index < 120; index += 1) {
    const x = (hashNumber(`star-x-${index}`) * width + time * 8 * hashNumber(index)) % width;
    const y = hashNumber(`star-y-${index}`) * height;
    const size = 0.6 + hashNumber(`star-s-${index}`) * 1.4;
    ctx.globalAlpha = 0.35 + hashNumber(`star-a-${index}`) * 0.55;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function drawEarth(ctx, cx, cy, radius) {
  const atmosphere = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.25, radius * 0.25, cx, cy, radius * 1.22);
  atmosphere.addColorStop(0, "rgba(94, 214, 255, 0.24)");
  atmosphere.addColorStop(0.72, "rgba(31, 111, 176, 0.12)");
  atmosphere.addColorStop(1, "rgba(84, 214, 255, 0)");
  ctx.fillStyle = atmosphere;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.22, 0, Math.PI * 2);
  ctx.fill();

  const ocean = ctx.createRadialGradient(cx - radius * 0.34, cy - radius * 0.28, radius * 0.1, cx, cy, radius);
  ocean.addColorStop(0, "#8fd8e8");
  ocean.addColorStop(0.34, "#2c85b8");
  ocean.addColorStop(0.72, "#185175");
  ocean.addColorStop(1, "#092332");
  ctx.fillStyle = ocean;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  if (earthTextureReady) {
    drawTexturedEarth(ctx, cx, cy, radius);
  } else {
    drawLandMasses(ctx, cx, cy, radius);
  }
  drawGraticule(ctx, cx, cy, radius);
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTexturedEarth(ctx, cx, cy, radius) {
  const textureWidth = earthTexture.width;
  const textureHeight = earthTexture.height;
  const slice = 2;
  const yawOffset = globeState.yaw / (Math.PI * 2);

  for (let screenX = -radius; screenX < radius; screenX += slice) {
    const normalizedX = screenX / radius;
    const yScale = Math.sqrt(Math.max(0, 1 - normalizedX * normalizedX));
    const longitude = Math.asin(normalizedX) / Math.PI;
    let sourceX = ((0.5 + longitude + yawOffset) % 1) * textureWidth;
    if (sourceX < 0) {
      sourceX += textureWidth;
    }
    const sourceSlice = Math.min(slice, textureWidth - sourceX);
    ctx.drawImage(
      earthTexture,
      sourceX,
      0,
      sourceSlice,
      textureHeight,
      cx + screenX,
      cy - radius * yScale,
      slice,
      radius * 2 * yScale
    );
  }

  const nightSide = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.25, radius * 0.15, cx, cy, radius * 1.05);
  nightSide.addColorStop(0, "rgba(255, 255, 255, 0.05)");
  nightSide.addColorStop(0.58, "rgba(0, 0, 0, 0.08)");
  nightSide.addColorStop(1, "rgba(0, 0, 0, 0.52)");
  ctx.fillStyle = nightSide;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawLatLonPath(ctx, cx, cy, radius, coordinates, closePath = false) {
  let drawing = false;
  coordinates.forEach(([lat, lon]) => {
    const rotated = rotateVector(latLonVector(lat, lon), globeState.yaw, globeState.pitch);
    if (rotated.z < -0.02) {
      drawing = false;
      return;
    }
    const projected = projectPoint(rotated, cx, cy, radius);
    if (!drawing) {
      ctx.moveTo(projected.x, projected.y);
      drawing = true;
    } else {
      ctx.lineTo(projected.x, projected.y);
    }
  });
  if (closePath && drawing) {
    ctx.closePath();
  }
}

function drawLandMasses(ctx, cx, cy, radius) {
  ctx.fillStyle = "rgba(69, 119, 95, 0.64)";
  ctx.strokeStyle = "rgba(220, 234, 226, 0.42)";
  ctx.lineWidth = Math.max(0.8, radius * 0.004);
  landMasses.forEach((mass) => {
    const smoothed = [];
    for (let index = 0; index < mass.length; index += 1) {
      const current = mass[index];
      const next = mass[(index + 1) % mass.length];
      for (let step = 0; step < 8; step += 1) {
        const t = step / 8;
        smoothed.push([
          current[0] + (next[0] - current[0]) * t,
          current[1] + (next[1] - current[1]) * t,
        ]);
      }
    }
    ctx.beginPath();
    drawLatLonPath(ctx, cx, cy, radius, smoothed, true);
    ctx.fill();
    ctx.stroke();
  });
}

function drawGraticule(ctx, cx, cy, radius) {
  ctx.strokeStyle = "rgba(72, 175, 194, 0.34)";
  ctx.lineWidth = 0.7;
  for (let lat = -60; lat <= 60; lat += 15) {
    const coordinates = [];
    for (let lon = -180; lon <= 180; lon += 3) {
      coordinates.push([lat, lon]);
    }
    ctx.beginPath();
    drawLatLonPath(ctx, cx, cy, radius, coordinates);
    ctx.stroke();
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const coordinates = [];
    for (let lat = -85; lat <= 85; lat += 3) {
      coordinates.push([lat, lon]);
    }
    ctx.beginPath();
    drawLatLonPath(ctx, cx, cy, radius, coordinates);
    ctx.stroke();
  }
}

function drawOrbitRings(ctx, cx, cy, radius, orbitCounts) {
  orbitCounts.forEach((orbit, index) => {
    const ringRadius = radius * (1.2 + index * 0.18);
    ctx.strokeStyle = orbitColor(orbit.orbit_type);
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringRadius, ringRadius * 0.28, -0.28 + index * 0.18, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawSatelliteGlobe(time = 0) {
  if (!globeState) {
    return;
  }
  const { canvas, satellites, orbitCounts } = globeState;
  const { ctx, width, height } = fitCanvas(canvas);
  const radius = Math.min(width, height) * 0.36 * globeState.zoom;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const seconds = time / 1000;

  drawStarfield(ctx, width, height, seconds);
  drawOrbitRings(ctx, cx, cy, radius, orbitCounts);

  const projected = satellites.map((satellite) => {
    const phase = satellite.phase + seconds * satellite.speed;
    const baseX = Math.cos(phase) * satellite.orbitRadius;
    const orbitalY = Math.sin(phase) * Math.sin(satellite.inclination) * satellite.orbitRadius;
    const baseZ = Math.sin(phase) * Math.cos(satellite.inclination) * satellite.orbitRadius;
    const raanCos = Math.cos(satellite.raan);
    const raanSin = Math.sin(satellite.raan);
    const vector = rotateVector(
      {
        x: baseX * raanCos - baseZ * raanSin,
        y: orbitalY,
        z: baseX * raanSin + baseZ * raanCos,
      },
      globeState.yaw,
      globeState.pitch
    );
    const point = projectPoint(vector, cx, cy, radius);
    satellite.screenX = point.x;
    satellite.screenY = point.y;
    satellite.depth = point.depth;
    return { satellite, point };
  }).sort((a, b) => a.point.depth - b.point.depth);

  projected.filter(({ point }) => point.depth <= 0).forEach(({ satellite, point }) => {
    const size = Math.max(0.65, 1.25 * point.scale) * (satellite.status === "Active" ? 1 : 0.78);
    ctx.globalAlpha = 0.48;
    ctx.fillStyle = satellite.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();
  });

  drawEarth(ctx, cx, cy, radius);

  projected.filter(({ point }) => point.depth > 0).forEach(({ satellite, point }) => {
    const size = Math.max(0.75, 1.45 * point.scale) * (satellite.status === "Active" ? 1 : 0.78);
    ctx.globalAlpha = satellite.status === "Active" ? 0.92 : 0.62;
    ctx.fillStyle = satellite.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  window.requestAnimationFrame(drawSatelliteGlobe);
}

function nearestSatellite(clientX, clientY) {
  if (!globeState) {
    return null;
  }
  const rect = globeState.canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let best = null;
  let bestDistance = 16;
  globeState.satellites.forEach((satellite) => {
    const distance = Math.hypot(satellite.screenX - x, satellite.screenY - y);
    if (distance < bestDistance && satellite.depth > -0.35) {
      bestDistance = distance;
      best = satellite;
    }
  });
  return best;
}

function updateGlobeTooltip(event) {
  const tooltip = document.querySelector("#globeTooltip");
  const satellite = nearestSatellite(event.clientX, event.clientY);
  if (!satellite) {
    tooltip.hidden = true;
    return;
  }
  const visualRect = document.querySelector(".globe-visual").getBoundingClientRect();
  tooltip.hidden = false;
  tooltip.style.left = `${event.clientX - visualRect.left + 14}px`;
  tooltip.style.top = `${event.clientY - visualRect.top + 14}px`;
  tooltip.innerHTML = `
    <strong>${escapeHtml(satellite.name)}</strong>
    ${escapeHtml(satellite.orbit_type)} · ${escapeHtml(satellite.status)}<br>
    ${escapeHtml(satellite.country)}<br>
    ${formatNumber(satellite.altitude_km)} km · risk ${Number(satellite.risk_score).toFixed(1)}
  `;
}

function bindGlobeInteractions() {
  const canvas = document.querySelector("#satelliteGlobe");
  canvas.addEventListener("pointerdown", (event) => {
    globeState.dragging = true;
    globeState.lastX = event.clientX;
    globeState.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (globeState.dragging) {
      const dx = event.clientX - globeState.lastX;
      const dy = event.clientY - globeState.lastY;
      globeState.yaw += dx * 0.008;
      globeState.pitch = Math.max(-0.85, Math.min(0.85, globeState.pitch + dy * 0.006));
      globeState.lastX = event.clientX;
      globeState.lastY = event.clientY;
    }
    updateGlobeTooltip(event);
  });
  canvas.addEventListener("pointerup", (event) => {
    globeState.dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerleave", () => {
    globeState.dragging = false;
    document.querySelector("#globeTooltip").hidden = true;
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    globeState.zoom = Math.max(0.72, Math.min(1.45, globeState.zoom - event.deltaY * 0.001));
  }, { passive: false });
}

function renderGlobe(globeData) {
  const summary = globeData.summary || {};
  document.querySelector("#globeSatelliteCount").textContent = formatNumber(summary.satellite_count);
  document.querySelector("#globeActiveCount").textContent = formatNumber(summary.active_satellites);
  document.querySelector("#globeAltitude").textContent = `${formatNumber(summary.average_altitude_km)} km`;
  document.querySelector("#globeNote").textContent = globeData.note;
  const renderedPoints = formatNumber(globeData.rendered_points || 0);
  document.querySelector("#globeLegend").innerHTML = globeData.orbit_counts.map((orbit) => `
    <span class="globe-chip">
      <span class="globe-dot" style="background:${orbitColor(orbit.orbit_type)}"></span>
      ${escapeHtml(orbit.orbit_type)} ${formatNumber(orbit.satellite_count)}
    </span>
  `).join("") + `
    <span class="globe-chip">
      <span class="globe-dot" style="background:#ffffff"></span>
      ${renderedPoints} plotted
    </span>
  `;

  const canvas = document.querySelector("#satelliteGlobe");
  const previous = globeState || {};
  globeState = {
    canvas,
    satellites: prepareGlobeSatellites(globeData.satellites || []),
    orbitCounts: globeData.orbit_counts || [],
    yaw: previous.yaw ?? -0.35,
    pitch: previous.pitch ?? 0.18,
    zoom: previous.zoom ?? 1,
    dragging: false,
    lastX: 0,
    lastY: 0,
  };
  if (!previous.canvas) {
    bindGlobeInteractions();
    window.requestAnimationFrame(drawSatelliteGlobe);
  }
}

function populateSelect(id, values, allLabel) {
  const select = document.querySelector(id);
  const currentValue = select.value;
  select.innerHTML = `<option value="All">${allLabel}</option>` +
    values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if ([...select.options].some((option) => option.value === currentValue)) {
    select.value = currentValue;
  }
}

async function loadOptions() {
  const options = await getJson("/api/options");
  populateSelect("#orbitFilter", options.orbit_types, "All orbits");
  populateSelect("#categoryFilter", options.object_categories, "All object types");
  populateSelect("#riskFilter", options.risk_levels, "All risk levels");
  populateSelect("#statusFilter", options.statuses, "All statuses");
  populateSelect("#countryFilter", options.countries, "All countries");
}

function currentQueryString() {
  const params = new URLSearchParams();
  const mapping = [
    ["orbit_type", "#orbitFilter"],
    ["object_category", "#categoryFilter"],
    ["risk_level", "#riskFilter"],
    ["status", "#statusFilter"],
    ["country", "#countryFilter"],
  ];

  mapping.forEach(([key, selector]) => {
    const value = document.querySelector(selector).value;
    if (value && value !== "All") {
      params.set(key, value);
    }
  });

  const search = document.querySelector("#searchInput").value.trim();
  if (search) {
    params.set("q", search);
  }
  return params.toString();
}

function renderDashboard(data) {
  dashboardData = data;
  const summary = data.summary;
  const topZone = summary.highest_risk_zone || {};

  document.querySelector("#totalObjects").textContent = formatNumber(summary.total_objects);
  document.querySelector("#satelliteCount").textContent = formatNumber(summary.satellites);
  document.querySelector("#debrisCount").textContent = formatNumber(summary.debris);
  document.querySelector("#averageRisk").textContent = Number(summary.average_risk || 0).toFixed(1);
  document.querySelector("#topRiskZone").textContent =
    topZone.orbit_type ? `${topZone.orbit_type} ${Number(topZone.average_risk).toFixed(1)}` : "--";
  document.querySelector("#datasetName").textContent = summary.dataset.source_name;
  document.querySelector("#datasetDetails").textContent =
    `${formatNumber(summary.dataset.raw_records)} raw records, ` +
    `${formatNumber(summary.dataset.dashboard_records)} current Earth-orbiting records analyzed.`;

  renderPrimaryChart();
  drawHorizontalBarChart(document.querySelector("#countryChart"), data.country_stats, "country", "objects");
  drawLineChart(document.querySelector("#growthChart"), data.growth_trends);
  renderRiskZones(data.risk_zones);
  renderObjectTable(data.objects);
}

async function loadDashboard() {
  const queryString = currentQueryString();
  const suffix = queryString ? `?${queryString}` : "";
  const globeSuffix = queryString ? `?${queryString}&max_points=${globePointLimit}` : `?max_points=${globePointLimit}`;
  const [data, globeData] = await Promise.all([
    getJson(`/api/dashboard-data${suffix}`),
    getJson(`/api/globe-data${globeSuffix}`),
  ]);
  renderDashboard(data);
  renderGlobe(globeData);
}

function bindControls() {
  [
    "#visualizationSelect",
    "#orbitFilter",
    "#categoryFilter",
    "#riskFilter",
    "#statusFilter",
    "#countryFilter",
  ].forEach((selector) => {
    document.querySelector(selector).addEventListener("change", () => {
      if (selector === "#visualizationSelect") {
        renderPrimaryChart();
      } else {
        loadDashboard().catch(showError);
      }
    });
  });

  document.querySelector("#searchInput").addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => loadDashboard().catch(showError), 280);
  });

  document.querySelector("#resetFilters").addEventListener("click", () => {
    ["#orbitFilter", "#categoryFilter", "#riskFilter", "#statusFilter", "#countryFilter"].forEach((selector) => {
      document.querySelector(selector).value = "All";
    });
    document.querySelector("#searchInput").value = "";
    loadDashboard().catch(showError);
  });

  document.querySelector("#refreshData").addEventListener("click", async () => {
    const button = document.querySelector("#refreshData");
    const status = document.querySelector("#refreshStatus");
    button.disabled = true;
    status.textContent = "Refreshing from CelesTrak...";
    try {
      await postJson("/api/refresh-live-data");
      await loadOptions();
      await loadDashboard();
      status.textContent = "Live data refreshed.";
    } catch (error) {
      status.textContent = "Refresh failed. Check network access.";
      showError(error);
    } finally {
      button.disabled = false;
    }
  });
}

function showError(error) {
  const existing = document.querySelector(".error-banner");
  if (existing) {
    existing.remove();
  }
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="error-banner" style="padding:12px;background:#ffe5e2;color:#a12824">${escapeHtml(error.message)}</div>`
  );
}

window.addEventListener("resize", () => {
  window.clearTimeout(window.__resizeTimer);
  window.__resizeTimer = window.setTimeout(() => {
    if (dashboardData) {
      renderDashboard(dashboardData);
    }
  }, 150);
});

bindControls();
loadOptions()
  .then(loadDashboard)
  .catch(showError);
