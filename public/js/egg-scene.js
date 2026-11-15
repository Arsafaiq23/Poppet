/**
 * Lazy-loaded Three.js handheld virtual-pet egg shell renderer.
 * Renders the sculpted 0.88:1 glossy injection-moulded plastic shell
 * behind the clipped SVG prints, cracked bezel, LCD screen, and A/B/C buttons.
 * Uses render-on-demand, pixel ratio capped at 1.5, and CSS gradient fallback.
 */

const THREE_CDN_URL =
  "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

function detectSoftwareWebGL(gl) {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || "");
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function cubicBezier1D(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return (
    u * u * u * p0 +
    3 * u * u * t * p1 +
    3 * u * t * t * p2 +
    t * t * t * p3
  );
}

/**
 * Matches #poppet-egg-clip 0.88:1 contour from bottom (t=0, y=-1) to top apex (t=1, y=+1):
 * narrower rounded crown on top, fuller rounded belly near 58% down from top.
 */
function eggProfilePoint(t) {
  if (t <= 0.5) {
    const s = t * 2;
    const r = cubicBezier1D(0.0, 0.56, 1.0, 1.0, s);
    const y = cubicBezier1D(-1.0, -1.0, -0.68, -0.16, s);
    return { r: Math.max(0, r), y };
  }
  const s = (t - 0.5) * 2;
  const r = cubicBezier1D(1.0, 1.0, 0.44, 0.0, s);
  const y = cubicBezier1D(-0.16, 0.44, 1.0, 1.0, s);
  return { r: Math.max(0, r), y };
}

function buildSculptedEggLathe(THREE, radialSegs, heightSegs, scaleX, scaleY, scaleZ) {
  const pts = [];
  for (let i = 0; i <= heightSegs; i++) {
    const t = i / heightSegs;
    const { r, y } = eggProfilePoint(t);
    pts.push(new THREE.Vector2(r, y));
  }
  const geo = new THREE.LatheGeometry(pts, radialSegs);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * scaleX;
    const y = pos.getY(i) * scaleY;
    let z = pos.getZ(i) * scaleZ;
    // Gently flatten front face around upper-middle LCD window & buttons while keeping plump rounded rims
    if (z > 0) {
      const nx = Math.min(1, Math.abs(x) / (0.86 * scaleX));
      const ny = Math.min(1, Math.abs(y) / (0.84 * scaleY));
      const flatMask =
        Math.max(0, 1 - Math.pow(nx, 2.6)) * Math.max(0, 1 - Math.pow(ny, 2.6));
      const targetZ = 0.72 * scaleZ;
      z = z * (1 - 0.42 * flatMask) + Math.min(z, targetZ) * (0.42 * flatMask);
    }
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function buildGradientEnvMap(THREE, renderer) {
  const width = 32;
  const height = 16;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const topGlow = Math.pow(Math.max(0, v), 1.8);
      const specBand =
        Math.exp(-Math.pow((v - 0.76) * 5.4, 2)) *
        (0.65 + 0.35 * Math.cos((u - 0.34) * Math.PI * 2));
      const r = Math.min(255, Math.round(188 + 60 * topGlow + 58 * specBand));
      const g = Math.min(255, Math.round(184 + 62 * topGlow + 58 * specBand));
      const b = Math.min(255, Math.round(198 + 52 * topGlow + 54 * specBand));
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  const equirect = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.colorSpace = THREE.SRGBColorSpace;
  equirect.magFilter = THREE.LinearFilter;
  equirect.minFilter = THREE.LinearFilter;
  equirect.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromEquirectangular(equirect);
  equirect.dispose();
  pmrem.dispose();
  return envRT;
}

export async function mountPoppetEggScene({ player, deviceEl, canvas }) {
  if (!player || !deviceEl || !canvas) return null;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("webgl") === "0") {
      return null;
    }
  } catch {
    // Ignore URL parse errors
  }

  const testCanvas = document.createElement("canvas");
  const probeGl =
    testCanvas.getContext("webgl2", { alpha: true, antialias: true }) ||
    testCanvas.getContext("webgl", { alpha: true, antialias: true });
  if (!probeGl) return null;

  const isSoftwareGl = detectSoftwareWebGL(probeGl);
  probeGl.getExtension("WEBGL_lose_context")?.loseContext();

  let THREE;
  try {
    THREE = await import(THREE_CDN_URL);
  } catch {
    return null;
  }

  if (!deviceEl.isConnected || !canvas.isConnected) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
  } catch {
    return null;
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const envRT = buildGradientEnvMap(THREE, renderer);
  scene.environment = envRT.texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  camera.position.set(0, 0, 5.4);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd8cce6, 1.18);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfffaf4, 1.48);
  dirLight.position.set(-2.3, 3.4, 4.8);
  scene.add(dirLight);

  const colorProbe = document.createElement("span");
  colorProbe.setAttribute("aria-hidden", "true");
  colorProbe.style.cssText =
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;";
  player.appendChild(colorProbe);

  const pxCanvas = document.createElement("canvas");
  pxCanvas.width = 1;
  pxCanvas.height = 1;
  const pxCtx = pxCanvas.getContext("2d", { willReadFrequently: true });

  function readThemeColor(varName, fallbackHex) {
    colorProbe.style.color = `var(${varName}, ${fallbackHex})`;
    const computed = getComputedStyle(colorProbe).color || fallbackHex;
    if (pxCtx) {
      pxCtx.clearRect(0, 0, 1, 1);
      pxCtx.fillStyle = fallbackHex;
      pxCtx.fillStyle = computed;
      pxCtx.fillRect(0, 0, 1, 1);
      const [r, g, b] = pxCtx.getImageData(0, 0, 1, 1).data;
      return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    }
    return new THREE.Color(fallbackHex);
  }

  function readThemeNumber(varName, fallbackVal) {
    const raw = getComputedStyle(player).getPropertyValue(varName).trim();
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) ? num : fallbackVal;
  }

  const shellUniforms = {
    uColorTop: { value: new THREE.Color(0xff86b6) },
    uColorBottom: { value: new THREE.Color(0xe84c90) },
    uGlitter: { value: 0.9 },
  };

  function injectPlasticShader(mat, uniforms, glitterGain = 1.0, rimGain = 1.0) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uColorTop = uniforms.uColorTop;
      shader.uniforms.uColorBottom = uniforms.uColorBottom;
      shader.uniforms.uGlitter = uniforms.uGlitter;

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vEggLocalPos;
           varying vec3 vEggViewNormal;
           varying vec3 vEggViewDir;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vEggLocalPos = position;
           vec4 mvEggPos = modelViewMatrix * vec4(transformed, 1.0);
           vEggViewNormal = normalize(normalMatrix * objectNormal);
           vEggViewDir = normalize(-mvEggPos.xyz);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform vec3 uColorTop;
           uniform vec3 uColorBottom;
           uniform float uGlitter;
           varying vec3 vEggLocalPos;
           varying vec3 vEggViewNormal;
           varying vec3 vEggViewDir;
           float poppetHash31(vec3 p) {
             p = fract(p * 0.1031);
             p += dot(p, p.yzx + 33.33);
             return fract((p.x + p.y) * p.z);
           }`
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           float gradT = smoothstep(-0.82, 0.78, vEggLocalPos.y);
           vec3 shellCol = mix(uColorBottom, uColorTop, gradT);
           // Subtle injection-moulded horizontal parting seam
           float seamBand = exp(-pow((vEggLocalPos.y + 0.08) * 95.0, 2.0)) * smoothstep(0.45, 0.85, abs(vEggLocalPos.x));
           shellCol *= (1.0 - 0.10 * seamBand);
           vec3 gCell = floor(vEggLocalPos * 320.0);
           vec3 gLocal = fract(vEggLocalPos * 320.0) - 0.5;
           float rnd = poppetHash31(gCell);
           float flake = step(0.91, rnd) * smoothstep(0.36, 0.07, length(gLocal));
           float spark = flake * 0.65 * uGlitter * ${glitterGain.toFixed(2)};
           diffuseColor.rgb *= mix(shellCol, vec3(1.0), clamp(spark * 0.6, 0.0, 0.8));`
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           float rimF = pow(1.0 - clamp(dot(normalize(vEggViewNormal), normalize(vEggViewDir)), 0.0, 1.0), 2.8);
           float topEdgeWeight = smoothstep(-0.1, 0.88, vEggLocalPos.y);
           totalEmissiveRadiance += vec3(1.0, 0.99, 1.0) * (rimF * topEdgeWeight * 0.34 * ${rimGain.toFixed(2)});`
        );
    };
    mat.customProgramCacheKey = () => `poppet-toy-egg-v3-${glitterGain}-${rimGain}`;
  }

  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    ior: 1.48,
    transmission: 0,
    transparent: false,
    opacity: 1,
    envMapIntensity: 0.96,
  });
  injectPlasticShader(shellMat, shellUniforms, 1.0, 1.0);

  const eggRoot = new THREE.Group();
  scene.add(eggRoot);

  // 0.88:1 sculpted profile
  const shellGeo = buildSculptedEggLathe(THREE, 80, 56, 0.88, 1.0, 0.36);
  const shellMesh = new THREE.Mesh(shellGeo, shellMat);
  eggRoot.add(shellMesh);

  function syncThemeColors() {
    const topCol = readThemeColor("--poppet-shell-top", "#ff86b6");
    const botCol = readThemeColor("--poppet-shell-bottom", "#e84c90");
    const glitter = readThemeNumber("--poppet-shell-glitter", 0.9);
    const theme = player.getAttribute("data-theme") || "candy";

    shellUniforms.uColorTop.value.copy(topCol);
    shellUniforms.uColorBottom.value.copy(botCol);
    shellUniforms.uGlitter.value = glitter;

    shellMat.roughness = theme === "mono" ? 0.28 : 0.18;
    shellMat.clearcoat = theme === "mono" ? 0.72 : 1.0;

    wakeAndRender();
  }

  let viewW = 1;
  let viewH = 1;
  let vFovRad = THREE.MathUtils.degToRad(30);

  function updateLayout() {
    const unscaledW = deviceEl.offsetWidth;
    const unscaledH = deviceEl.offsetHeight;
    if (!unscaledW || !unscaledH) return;

    viewW = unscaledW;
    viewH = unscaledH;

    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(viewW, viewH, false);

    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
    vFovRad = THREE.MathUtils.degToRad(camera.fov);

    const dist = Math.max(0.5, camera.position.z);
    const planeH = 2 * Math.tan(vFovRad / 2) * dist;
    const planeW = planeH * camera.aspect;

    // Fit 0.88:1 mesh cleanly across the clipped shell box with slight overfill so silhouette clip is 100% seamless
    const sy = planeH * 0.515;
    const sx = (planeW / 0.88) * 0.515;
    const sz = Math.min(sx, sy);

    shellMesh.scale.set(sx, sy, sz);
    shellMesh.position.set(0, 0, 0);

    if (firstFramePainted) {
      deviceEl.setAttribute("data-egg-mode", "webgl");
    }
    wakeAndRender();
  }

  const MAX_TILT_RAD = THREE.MathUtils.degToRad(4);
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  let targetRotX = 0;
  let targetRotY = 0;
  let curRotX = 0;
  let curRotY = 0;
  let boopStart = -1;
  let lastFrameTime = performance.now();
  let rafId = 0;
  let isTabHidden = document.hidden;
  let isOffscreen = false;
  let isFullscreen = false;
  let isLeanIn = false;
  let isDisposed = false;
  let firstFramePainted = false;

  function isReducedMotion() {
    const m = player.getAttribute("data-motion");
    return reducedMotionQuery.matches || m === "reduced" || m === "off";
  }

  function applyStaticPose() {
    curRotX = 0;
    curRotY = 0;
    targetRotX = 0;
    targetRotY = 0;
    eggRoot.rotation.set(0, 0, 0);
    eggRoot.scale.set(1, 1, 1);
  }

  function drawFrame() {
    if (isDisposed || isTabHidden || isOffscreen || isFullscreen) return;
    renderer.render(scene, camera);
    if (!firstFramePainted) {
      firstFramePainted = true;
      deviceEl.setAttribute("data-egg-mode", "webgl");
    }
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function tick(now) {
    rafId = 0;
    if (isDisposed || isTabHidden || isOffscreen || isFullscreen) return;

    if (isReducedMotion() || isLeanIn) {
      applyStaticPose();
      drawFrame();
      return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
    lastFrameTime = now;

    curRotX = THREE.MathUtils.damp(curRotX, targetRotX, 9.5, dt);
    curRotY = THREE.MathUtils.damp(curRotY, targetRotY, 9.5, dt);

    let sx = 1;
    let sy = 1;
    let sz = 1;
    let boopActive = false;
    if (boopStart >= 0) {
      const elapsed = now - boopStart;
      if (elapsed < 150) {
        boopActive = true;
        const wave = Math.sin((elapsed / 150) * Math.PI);
        sx = 1 + 0.028 * wave;
        sy = 1 - 0.036 * wave;
        sz = 1 + 0.028 * wave;
      } else {
        boopStart = -1;
      }
    }

    eggRoot.rotation.set(curRotX, curRotY, 0);
    eggRoot.scale.set(sx, sy, sz);
    drawFrame();

    const tiltSettled =
      Math.abs(targetRotX - curRotX) < 0.0004 &&
      Math.abs(targetRotY - curRotY) < 0.0004;

    if (boopActive || !tiltSettled) {
      rafId = requestAnimationFrame(tick);
    }
  }

  function wakeAndRender() {
    if (isDisposed || isTabHidden || isOffscreen || isFullscreen) return;
    if (isReducedMotion() || isLeanIn) {
      stopLoop();
      applyStaticPose();
      drawFrame();
      return;
    }
    if (!rafId) {
      lastFrameTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  const abortCtrl = new AbortController();
  const { signal } = abortCtrl;

  document.addEventListener(
    "visibilitychange",
    () => {
      isTabHidden = document.hidden;
      if (isTabHidden) stopLoop();
      else wakeAndRender();
    },
    { signal }
  );

  reducedMotionQuery.addEventListener(
    "change",
    () => {
      if (isReducedMotion()) {
        stopLoop();
        applyStaticPose();
        drawFrame();
      } else {
        wakeAndRender();
      }
    },
    { signal }
  );

  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      stopLoop();
      deviceEl.setAttribute("data-egg-mode", "css");
    },
    { signal }
  );

  canvas.addEventListener(
    "webglcontextrestored",
    () => {
      deviceEl.setAttribute("data-egg-mode", "webgl");
      wakeAndRender();
    },
    { signal }
  );

  const resizeObserver = new ResizeObserver(() => {
    updateLayout();
  });
  resizeObserver.observe(deviceEl);

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      isOffscreen = entry ? !entry.isIntersecting : false;
      if (isOffscreen) stopLoop();
      else wakeAndRender();
    },
    { threshold: 0.02 }
  );
  intersectionObserver.observe(deviceEl);

  syncThemeColors();
  updateLayout();
  drawFrame();

  return {
    setTilt(nx, ny) {
      if (isReducedMotion() || isLeanIn || isFullscreen || isDisposed) return;
      const cx = Math.max(-1, Math.min(1, nx));
      const cy = Math.max(-1, Math.min(1, ny));
      targetRotY = cx * MAX_TILT_RAD * 0.45;
      targetRotX = cy * MAX_TILT_RAD * 0.45;
      wakeAndRender();
    },
    setLeanIn(flag) {
      isLeanIn = Boolean(flag);
      wakeAndRender();
    },
    boop() {
      if (isReducedMotion() || isDisposed || isTabHidden || isOffscreen || isFullscreen || isLeanIn) {
        return;
      }
      boopStart = performance.now();
      wakeAndRender();
    },
    syncThemeColors,
    setFullscreen(flag) {
      isFullscreen = Boolean(flag);
      if (isFullscreen) stopLoop();
      else updateLayout();
    },
    dispose() {
      isDisposed = true;
      stopLoop();
      abortCtrl.abort();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      shellGeo.dispose();
      shellMat.dispose();
      envRT.dispose();
      colorProbe.remove();
      renderer.dispose();
      deviceEl.setAttribute("data-egg-mode", "css");
    },
  };
}
