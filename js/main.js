// Viviani Curve Lights - main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GUI } from 'lil-gui';

let scene, camera, renderer, controls, composer, bloomPass;
// let vivianiCurveMesh; // Kept hidden as per request
let curvePath; 
let gui; // Make GUI accessible globally for conditional controller visibility
let singleColorController;
const paletteControllers = {}; // To store palette color pickers and enabled checkboxes

// Initial parameters controlled by GUI
const params = {
  numParticles: 350,
  particleTrailLength: 24,
  particleSpeedFactor: 0.004,
  particleScatterRadius: 1.3,
  bloomStrength: 2.5,
  bloomRadius: 0.5,
  bloomThreshold: 0.04,
  vivianiA: 5, // Scale of the Viviani curve
  colorMode: 'palette', // 'rainbow', 'single', 'palette'
  singleColorValue: '#ffffff',
  paletteColor1: '#fff1cc',
  paletteColor1Enabled: true,
  paletteColor2: '#ffdd80',
  paletteColor2Enabled: true,
  paletteColor3: '#ffbb00',
  paletteColor3Enabled: true,
  paletteColor4: '#80bdff',
  paletteColor4Enabled: true,
  paletteColor5: '#007bff',
  paletteColor5Enabled: true,
  backgroundColor: '#000000',
  lightModeEnabled: false, // New toggle for light/dark mode behavior
};

const particles = [];

// Shader code
const particleVertexShader = `
  attribute float trailAlphaMultiplier;
  varying float vTrailAlphaMultiplier;
  void main() {
    vTrailAlphaMultiplier = trailAlphaMultiplier;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const particleFragmentShader = `
  varying float vTrailAlphaMultiplier;
  uniform vec3 color;
  uniform float uLightMode; // 0.0 for dark mode, 1.0 for light mode

  void main() {
    float alpha = vTrailAlphaMultiplier * 0.8;
    if (uLightMode > 0.5) { // If in light mode
      // Make particles a bit more solid/less transparent, especially the tail
      alpha = mix(vTrailAlphaMultiplier * 0.5, 1.0, vTrailAlphaMultiplier * vTrailAlphaMultiplier);
      alpha = max(alpha, 0.1); // Ensure a minimum visibility
      gl_FragColor = vec4(color * 0.9, alpha); // Slightly darken color, adjust alpha for light bg
    } else {
      gl_FragColor = vec4(color, alpha); // Original dark mode rendering
    }
  }
`;

function createVivianiCurvePoints(a = 2, numPoints = 200) {
  const points = [];
  const tMax = 4 * Math.PI;
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * tMax;
    const x = a * (1 + Math.cos(t));
    const y = a * Math.sin(t);
    const z = 2 * a * Math.sin(t / 2);
    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

function setParticleColor(particle) {
  switch (params.colorMode) {
    case 'rainbow':
      particle.material.uniforms.color.value.setHSL(Math.random(), 0.7, 0.6);
      break;
    case 'single':
      particle.material.uniforms.color.value.set(params.singleColorValue);
      break;
    case 'palette':
      const activePalette = [];
      if (params.paletteColor1Enabled) activePalette.push(params.paletteColor1);
      if (params.paletteColor2Enabled) activePalette.push(params.paletteColor2);
      if (params.paletteColor3Enabled) activePalette.push(params.paletteColor3);
      if (params.paletteColor4Enabled) activePalette.push(params.paletteColor4);
      if (params.paletteColor5Enabled) activePalette.push(params.paletteColor5);

      if (activePalette.length > 0) {
        const randomIndex = Math.floor(Math.random() * activePalette.length);
        particle.material.uniforms.color.value.set(activePalette[randomIndex]);
      } else {
        particle.material.uniforms.color.value.set('#ffffff'); // Fallback if no palette colors enabled
      }
      break;
    default:
      particle.material.uniforms.color.value.setHSL(Math.random(), 0.7, 0.6);
  }
}

function updateAllParticleColors() {
    particles.forEach(p => setParticleColor(p));
}

function updateAllParticleMaterialProperties() {
    console.log(`Updating all particle materials. Light Mode Enabled: ${params.lightModeEnabled}`); // DEBUG
    particles.forEach(p => {
        if (params.lightModeEnabled) { // Light Mode ON
            console.log('Setting to Light Mode for particle'); // DEBUG
            p.material.blending = THREE.NormalBlending;
            p.material.depthWrite = true;
            if (p.material.uniforms.uLightMode) {
                p.material.uniforms.uLightMode.value = 1.0;
                console.log(`Particle uLightMode set to: ${p.material.uniforms.uLightMode.value}`); // DEBUG
            } else {
                console.error('uLightMode uniform not found on particle material!'); // DEBUG
            }
        } else { // Light Mode OFF (Dark Mode)
            console.log('Setting to Dark Mode for particle'); // DEBUG
            p.material.blending = THREE.AdditiveBlending;
            p.material.depthWrite = false;
            if (p.material.uniforms.uLightMode) {
                p.material.uniforms.uLightMode.value = 0.0;
                console.log(`Particle uLightMode set to: ${p.material.uniforms.uLightMode.value}`); // DEBUG
            } else {
                console.error('uLightMode uniform not found on particle material!'); // DEBUG
            }
        }
        p.material.needsUpdate = true; // Force material update, just in case
    });
}

class Particle {
  constructor(path) {
    this.path = path;
    this.trailLength = params.particleTrailLength;
    this.currentT = Math.random(); 
    this.baseSpeedRandomness = (0.5 + Math.random() * 1.0); // Store for dynamic speed adjustment
    this.speed = params.particleSpeedFactor * this.baseSpeedRandomness;
    
    // Individual scatter offset for this particle
    this.scatterOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 2 * params.particleScatterRadius,
      (Math.random() - 0.5) * 2 * params.particleScatterRadius,
      (Math.random() - 0.5) * 2 * params.particleScatterRadius
    );

    this.trailPositions = new Float32Array(this.trailLength * 3);
    this.trailAlphas = new Float32Array(this.trailLength); 

    const segmentDeltaT = 0.001; 
    for (let i = 0; i < this.trailLength; i++) {
      let t = this.currentT - i * segmentDeltaT;
      t = ((t % 1) + 1) % 1;
      const posOnCurve = this.path.getPointAt(t);
      const scatteredPos = posOnCurve.clone().add(this.scatterOffset);
      scatteredPos.toArray(this.trailPositions, i * 3);
      this.trailAlphas[i] = 1.0 - (i / Math.max(1, this.trailLength - 1));
    }
    if(this.trailLength > 0) this.trailAlphas[0] = 1.0;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.geometry.setAttribute('trailAlphaMultiplier', new THREE.BufferAttribute(this.trailAlphas, 1));

    let initialBlending = params.lightModeEnabled ? THREE.NormalBlending : THREE.AdditiveBlending;
    let initialDepthWrite = params.lightModeEnabled ? true : false;
    let initialULightMode = params.lightModeEnabled ? 1.0 : 0.0;
    console.log(`Particle constructor: initialULightMode = ${initialULightMode}`); // DEBUG

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color() },
        uLightMode: { value: initialULightMode } 
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      blending: initialBlending,
      depthWrite: initialDepthWrite 
    });
    setParticleColor(this); // Set initial color based on mode

    this.mesh = new THREE.Line(this.geometry, this.material);
    scene.add(this.mesh);
  }

  update() {
    this.speed = params.particleSpeedFactor * this.baseSpeedRandomness;
    this.currentT += this.speed;

    const positions = this.mesh.geometry.attributes.position.array;
    const alphas = this.mesh.geometry.attributes.trailAlphaMultiplier.array;

    if (this.currentT >= 1) {
      this.currentT = 0; 
      setParticleColor(this); // Set new color on loop based on mode
      this.scatterOffset.set(
        (Math.random() - 0.5) * 2 * params.particleScatterRadius,
        (Math.random() - 0.5) * 2 * params.particleScatterRadius,
        (Math.random() - 0.5) * 2 * params.particleScatterRadius
      );

      // Re-initialize trail at the new starting point to prevent jump
      // Use the same logic as the constructor for initial trail shape
      const tempSegmentDeltaT = 0.001; // Same as in constructor for consistency
      for (let i = 0; i < this.trailLength; i++) {
        let tForSegment = this.currentT - i * tempSegmentDeltaT; // currentT is 0 here
        tForSegment = ((tForSegment % 1) + 1) % 1; // Wrap around [0,1) correctly for negative initial t
        
        const posOnCurve = this.path.getPointAt(tForSegment);
        const scatteredPos = posOnCurve.clone().add(this.scatterOffset);
        scatteredPos.toArray(positions, i * 3);
      }

    } else {
      // Normal update: shift points
      const posOnCurve = this.path.getPointAt(this.currentT);
      const newHeadPos = posOnCurve.clone().add(this.scatterOffset);

      for (let i = this.trailLength - 1; i > 0; i--) {
        positions[i * 3] = positions[(i - 1) * 3];
        positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
        positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
        // Alphas are fully recalculated below, no need to shift them here explicitly
      }
      newHeadPos.toArray(positions, 0); // Set the new head
    }

    // Recalculate all alphas for smooth fade along the current trail configuration
    for (let i = 0; i < this.trailLength; i++) {
        alphas[i] = 1.0 - (i / Math.max(1, this.trailLength -1) ); // Ensure divisor is at least 1
    }
     if (this.trailLength > 0) { // Ensure head alpha is 1.0 if trail exists
        alphas[0] = 1.0;
    }
    if (this.trailLength <= 1 && alphas.length > 0) { // Single point trail fully visible
        alphas[0] = 1.0;
    }


    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.trailAlphaMultiplier.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    scene.remove(this.mesh);
  }
}

function clearParticles() {
  particles.forEach(p => p.dispose());
  particles.length = 0;
}

function initParticles() {
  for (let i = 0; i < params.numParticles; i++) {
    particles.push(new Particle(curvePath));
  }
}

function recreateSystem() {
    clearParticles();
    // Update curve path if vivianiA changed
    const vivianiPoints = createVivianiCurvePoints(params.vivianiA, 256);
    curvePath = new THREE.CatmullRomCurve3(vivianiPoints);
    // Camera and controls might need to target the new curve center
    const curveCenter = new THREE.Vector3(params.vivianiA, 0, 0);
    camera.lookAt(curveCenter);
    controls.target.copy(curveCenter);

    initParticles();
}

function updateColorControllerVisibility() {
    singleColorController.domElement.style.display = params.colorMode === 'single' ? '' : 'none';
    for (let i = 1; i <= 5; i++) {
        if (paletteControllers[`color${i}`] && paletteControllers[`enabled${i}`]) {
            const display = params.colorMode === 'palette' ? '' : 'none';
            paletteControllers[`color${i}`].domElement.style.display = display;
            paletteControllers[`enabled${i}`].domElement.style.display = display;
        }
    }
}

function initGUI() {
  // alert("initGUI called"); // DEBUG ALERT - REMOVED
  gui = new GUI();
  
  const sceneFolder = gui.addFolder('Scene');
  // alert("Scene folder created"); // DEBUG ALERT - REMOVED
  sceneFolder.addColor(params, 'backgroundColor').name('Background').onChange(v => {
      if (renderer) { 
        renderer.setClearColor(v);
      }
  });
  sceneFolder.add(params, 'lightModeEnabled').name('Light Mode').onChange(updateAllParticleMaterialProperties);
  // sceneFolder.open(); // REMOVED - Open by default for debugging

  const particlesFolder = gui.addFolder('Particles');
  particlesFolder.add(params, 'numParticles', 10, 500, 1).name('Count').onChange(recreateSystem);
  particlesFolder.add(params, 'particleTrailLength', 1, 50, 1).name('Trail Length').onChange(recreateSystem);
  particlesFolder.add(params, 'particleSpeedFactor', 0.0001, 0.01, 0.0001).name('Speed Factor');
  particlesFolder.add(params, 'particleScatterRadius', 0, 5, 0.1).name('Scatter Radius').onChange(recreateSystem);
  particlesFolder.add(params, 'vivianiA', 1, 10, 0.1).name('Curve Scale (a)').onChange(recreateSystem);

  const colorFolder = gui.addFolder('Color');
  colorFolder.add(params, 'colorMode', ['rainbow', 'single', 'palette']).name('Mode').onChange(() => {
      updateAllParticleColors();
      updateColorControllerVisibility();
  });
  singleColorController = colorFolder.addColor(params, 'singleColorValue').name('Single Color').onChange(updateAllParticleColors);
  
  for (let i = 1; i <= 5; i++) {
      paletteControllers[`color${i}`] = colorFolder.addColor(params, `paletteColor${i}`).name(`Palette ${i}`).onChange(updateAllParticleColors);
      paletteControllers[`enabled${i}`] = colorFolder.add(params, `paletteColor${i}Enabled`).name(`Enabled ${i}`).onChange(updateAllParticleColors);
  }
  updateColorControllerVisibility(); 

  const bloomFolder = gui.addFolder('Bloom');
  bloomFolder.add(params, 'bloomStrength', 0, 3, 0.01).name('Strength').onChange(v => bloomPass.strength = v);
  bloomFolder.add(params, 'bloomRadius', 0, 1, 0.01).name('Radius').onChange(v => bloomPass.radius = v);
  bloomFolder.add(params, 'bloomThreshold', 0, 1, 0.01).name('Threshold').onChange(v => bloomPass.threshold = v);
}

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  // Adjusted initial camera position to better match the desired screenshot perspective
  camera.position.set(params.vivianiA + 22, params.vivianiA * 0.5, params.vivianiA * 0.8);
  // camera.lookAt will be set after curveCenter is defined

  const canvas = document.getElementById('webgl-canvas');
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(params.backgroundColor); 

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(2,0,0);

  // Lights (less critical for emissive particles with bloom)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
  scene.add(ambientLight);

  // Initial curve and particles setup (will also be called by recreateSystem)
  const vivianiPoints = createVivianiCurvePoints(params.vivianiA, 256);
  curvePath = new THREE.CatmullRomCurve3(vivianiPoints);
  const curveCenter = new THREE.Vector3(params.vivianiA, 0, 0);
  camera.lookAt(curveCenter);
  controls.target.copy(curveCenter);
  initParticles();

  // Post-processing - Bloom
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    params.bloomStrength,
    params.bloomRadius,
    params.bloomThreshold
  );
  composer.addPass(bloomPass);

  initGUI(); // Initialize GUI controls

  window.addEventListener('resize', onWindowResize, false);
  console.log("Three.js scene initialized with Light Mode toggle."); // Updated log message
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight); // Resize composer
}

function animate() {
  requestAnimationFrame(animate);
  for (const particle of particles) {
    particle.update();
  }
  controls.update(); 
  // renderer.render(scene, camera); // Use composer instead
  composer.render();
}

init();
animate(); 