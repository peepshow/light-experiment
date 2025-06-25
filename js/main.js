// Viviani Curve Lights - main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GUI } from 'lil-gui';

let scene, camera, renderer, controls, composer, bloomPass;
let curvePath;
let gui;
let singleColorController;
const paletteControllers = {}; 

// Particle system manager
let particleSystem;

const params = {
  // System params
  particleType: 'glow', // 'glow', 'weldingSpark', or 'comet'
  curveType: 'lorenz', // 'viviani', 'lorenz', or 'juggling'
  // Common params for all particle types
  numParticles: 406,
  particleScatterRadius: 1.1,
  vivianiA: 5,
  // Lorenz Attractor params
  lorenz: {
    sigma: 9.5,
    rho: 26.2, 
    beta: 2.5,
    scale: 1.0,
    timeStep: 0.012,
    numPoints: 1600,
  },
  // Juggling Pattern params (3-ball cascade)
  juggling: {
    balls: 4,             // Number of balls
    throwHeight: 15,      // Height of throws
    handSeparation: 3.9,  // Distance between hands
    throwAngle: 0.41,     // Throw angle (radians from vertical)
    gravity: 9.3,         // Gravity constant
    scale: 1.1,           // Overall scale of the pattern
    numPoints: 1500,      // Points per trajectory
    pattern: '3',         // Siteswap pattern (3 = cascade)
  },
  // Lifecycle params
  lifecycle: {
    enabled: true,       // Enable particle lifecycle (fade in/out)
    fadeInTime: 0.09,     // How quickly particles fade in (0-1)
    stableTime: 0.9,     // How long particles stay visible (0-1)
    fadeOutTime: 0.2,    // How quickly particles fade out (0-1)
    randomOffset: 1.0,   // Random offset for lifecycle start (0-1)
  },
  // Theme & Background Params
  currentTheme: 'dark', // 'dark' or 'light'
  backgroundColor: '#000000',
  useDirectRendering: false, // Bypass composer for better transparency
  // Glow particle specific params
  glow: {
    trailLength: 22,
    speedFactor: 0.0007,
    boldness: 1.0,
    lineWidth: 2.0, // Controls the thickness of the glow lines
  },
  // Welding spark specific params
  weldingSpark: {
    trailLength: 16,
    speedFactor: 0.006,
    sparkSize: 0.5,
    sparkHeat: 0.8, // Controls the "temperature" effect
    pathFollowing: 0.7, // Controls how closely sparks follow the curve (0-1)
  },
  // Comet particle specific params
  comet: {
    headSize: 1.0, // Size of the comet head
    tailLength: 20, // Length of the comet tail
    tailWidth: 0.8, // Width/thickness of the tail
    tailFade: 0.8, // How quickly the tail fades (lower = faster fade)
    glowIntensity: 0.8, // Brightness of the glow
    speedFactor: 0.005, // Speed of comets
    colorMode: 'single', // 'rainbow', 'single', 'palette'
    cometColor: '#80ffff', // Default cyan-blue color for comets
  },
  // Color Params (currently used by glow particles)
  colorMode: 'palette',
  singleColorValue: '#ffffff',
  paletteColor1: '#667fff',
  paletteColor1Enabled: true,
  paletteColor2: '#734ef9',
  paletteColor2Enabled: true,
  paletteColor3: '#ffc21a',
  paletteColor3Enabled: true,
  paletteColor4: '#b39eff',
  paletteColor4Enabled: true,
  paletteColor5: '#007bff',
  paletteColor5Enabled: true,
  // Bloom Params
  bloomStrength: 2.5,
  bloomRadius: 0.5,
  bloomThreshold: 0.04,
  darkBloomStrength: 2.5,
  darkBloomRadius: 0.5,
  darkBloomThreshold: 0.04,
};

// ParticleSystem serves as the base class and manager for all particle types
class ParticleSystem {
  constructor(type) {
    this.type = type;
    this.particles = [];
  }

  // Factory method that creates the right ParticleSystem based on type
  static create(type) {
    switch(type) {
      case 'glow':
        return new GlowParticleSystem();
      case 'weldingSpark':
        // For now this will just be a placeholder until we implement it
        return new WeldingSparkParticleSystem();
      case 'comet':
        return new CometParticleSystem();
      default:
        console.warn(`Unknown particle type: ${type}, defaulting to glow`);
        return new GlowParticleSystem();
    }
  }

  // Common interface methods that all particle systems must implement
  init() {
    this.clear(); // Ensure we clean up any existing particles
    this.createParticles();
  }

  clear() {
    this.particles.forEach(p => p.dispose());
    this.particles.length = 0;
  }

  createParticles() {
    // To be implemented by subclasses
    console.warn('createParticles() not implemented');
  }

  update() {
    // To be implemented by subclasses
    console.warn('update() not implemented');
  }

  updateColors() {
    // To be implemented by subclasses
    console.warn('updateColors() not implemented');
  }

  // Apply theme-specific settings to this particle type
  applyTheme(theme) {
    // To be implemented by subclasses
    console.warn('applyTheme() not implemented');
  }
  
  // Calculate lifecycle alpha modifier for particles
  // Returns alpha multiplier (0-1) based on particle lifecycle stage
  calculateLifecycleAlpha(particle) {
    if (!params.lifecycle.enabled) return 1.0;
    
    // Extract lifecycle times from params
    const fadeInTime = params.lifecycle.fadeInTime;
    const stableTime = params.lifecycle.stableTime;
    const fadeOutTime = params.lifecycle.fadeOutTime;
    
    // Total lifecycle duration
    const totalDuration = fadeInTime + stableTime + fadeOutTime;
    
    // Calculate normalized lifecycle position (0-1)
    const lifecyclePos = ((particle.lifecycleOffset + particle.currentT) % 1.0);
    
    // Calculate alpha based on lifecycle stage
    let alpha = 1.0;
    
    if (lifecyclePos < fadeInTime) {
      // Fade in stage
      alpha = lifecyclePos / fadeInTime;
    } else if (lifecyclePos >= fadeInTime + stableTime) {
      // Fade out stage
      const fadeOutPosition = (lifecyclePos - fadeInTime - stableTime) / fadeOutTime;
      alpha = 1.0 - fadeOutPosition;
    }
    
    // Ensure alpha is between 0 and 1
    return Math.max(0, Math.min(1, alpha));
  }
}

// GlowParticleSystem implements the current line-based glow effect
class GlowParticleSystem extends ParticleSystem {
  constructor() {
    super('glow');
    
    // Shader for the glow particles
    this.vertexShader = `
      attribute float trailAlphaMultiplier;
      varying float vTrailAlphaMultiplier;
      void main() {
        vTrailAlphaMultiplier = trailAlphaMultiplier;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
    this.fragmentShader = `
      varying float vTrailAlphaMultiplier;
      uniform vec3 color;
      uniform float uBoldness;
      uniform float uLifecycleAlpha;
      void main() {
        gl_FragColor = vec4(color, vTrailAlphaMultiplier * uBoldness * uLifecycleAlpha);
      }
    `;
  }

  createParticles() {
    for (let i = 0; i < params.numParticles; i++) {
      this.particles.push(new GlowParticle(curvePath, {
        trailLength: params.glow.trailLength,
        speedFactor: params.glow.speedFactor,
        boldness: params.glow.boldness,
        lineWidth: params.glow.lineWidth,
        scatterRadius: params.particleScatterRadius,
        vertexShader: this.vertexShader,
        fragmentShader: this.fragmentShader
      }));
    }
  }

  update() {
    this.particles.forEach(p => {
      // Update particle motion (which may set the justReset flag)
      p.update();
      
      // Apply lifecycle alpha, with special handling for open curves
      if (params.lifecycle.enabled && p.material.uniforms.uLifecycleAlpha) {
        let finalAlpha = this.calculateLifecycleAlpha(p);

        // For open curves, add fade-out/fade-in to hide the jump
        if (!p.path.closed) {
          const fadeOutTime = params.lifecycle.fadeOutTime;
          const fadeInTime = params.lifecycle.fadeInTime;
          const fadeOutStartT = 1.0 - fadeOutTime; // Start fading out in the last portion
          
          if (p.currentT > fadeOutStartT) {
            // Fading out as it approaches the end
            const fadeOutProgress = (p.currentT - fadeOutStartT) / fadeOutTime;
            finalAlpha *= (1.0 - fadeOutProgress);

          } else if (p.justReset && p.currentT < fadeInTime) {
            // Fading in after a reset
            const fadeInProgress = p.currentT / fadeInTime;
            finalAlpha *= fadeInProgress;
            
            // If fade-in is complete, turn off the reset flag
            if (fadeInProgress >= 1.0) {
              p.justReset = false;
            }
          } else if (p.justReset) {
            // It has been reset, but we are past the fade-in time
            p.justReset = false;
          }
        }
        
        p.material.uniforms.uLifecycleAlpha.value = finalAlpha;
      }
    });
  }

  updateColors() {
    this.particles.forEach(p => this.setParticleColor(p));
  }

  updateBoldness() {
    this.particles.forEach(p => {
      if (p.material.uniforms.uBoldness) {
        p.material.uniforms.uBoldness.value = params.glow.boldness;
      }
    });
  }

  updateLineWidth() {
    this.particles.forEach(p => {
      if (p.mesh) {
        p.mesh.material.linewidth = params.glow.lineWidth;
      }
    });
  }

  applyTheme(theme) {
    if (theme === 'dark') {
      this.particles.forEach(p => p.material.blending = THREE.AdditiveBlending);
    } else { // light theme
      this.particles.forEach(p => p.material.blending = THREE.NormalBlending);
    }
    this.updateColors(); // Update colors based on theme
    this.updateBoldness();
    this.updateLineWidth(); // Update line width
  }

  // Color setting logic for glow particles
  setParticleColor(particle) {
    if (params.currentTheme === 'light') {
      // For light theme, force particles to a contrasting dark color for now
      particle.material.uniforms.color.value.set(0x222222);
      return;
    }
    
    // Dark theme color logic
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
          particle.material.uniforms.color.value.set('#ffffff'); 
        }
        break;
      default:
        particle.material.uniforms.color.value.setHSL(Math.random(), 0.7, 0.6);
    }
  }
}

// The individual glow particle (was previously just "Particle")
class GlowParticle {
  constructor(path, options) {
    this.path = path;
    this.trailLength = options.trailLength;
    this.currentT = Math.random();
    this.baseSpeedRandomness = (0.5 + Math.random() * 1.0);
    this.speed = options.speedFactor * this.baseSpeedRandomness;
    
    // Add lifecycle offset (random starting point in lifecycle)
    this.lifecycleOffset = Math.random() * params.lifecycle.randomOffset;
    
    // Track reset state to handle open curves gracefully
    this.justReset = false; 
    
    this.scatterOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 2 * options.scatterRadius,
      (Math.random() - 0.5) * 2 * options.scatterRadius,
      (Math.random() - 0.5) * 2 * options.scatterRadius
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

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color() },
        uBoldness: { value: options.boldness },
        uLifecycleAlpha: { value: 1.0 } // Add lifecycle alpha uniform
      },
      vertexShader: options.vertexShader,
      fragmentShader: options.fragmentShader,
      transparent: true,
      // Blending will be set by applyThemeSettings
      depthWrite: false
    });
    
    // Color will be set by the ParticleSystem
    this.mesh = new THREE.Line(this.geometry, this.material);
    // Set line width (note: this only works in WebGL2 on some browsers)
    this.mesh.material.linewidth = options.lineWidth || 1.0;
    scene.add(this.mesh);
  }

  update() {
    // Update speed in case speedFactor changed
    this.speed = params.glow.speedFactor * this.baseSpeedRandomness;
    this.currentT += this.speed;

    const positions = this.mesh.geometry.attributes.position.array;
    const alphas = this.mesh.geometry.attributes.trailAlphaMultiplier.array;

    if (this.currentT >= 1) {
      this.currentT = 0;
      
      // When looping, get a new random scatter offset
      this.scatterOffset.set(
        (Math.random() - 0.5) * 2 * params.particleScatterRadius,
        (Math.random() - 0.5) * 2 * params.particleScatterRadius,
        (Math.random() - 0.5) * 2 * params.particleScatterRadius
      );
      
      // For open curves, flag that a reset just happened to handle fading
      if (!this.path.closed) {
        this.justReset = true;
      }

      // To prevent a line from the old end to the new start, teleport the whole trail
      const startPos = this.path.getPointAt(0).clone().add(this.scatterOffset);
      for (let i = 0; i < this.trailLength; i++) {
        startPos.toArray(positions, i * 3);
      }
    }
    
    // Normal trail update: move the trail forward
    const posOnCurve = this.path.getPointAt(this.currentT);
    const newHeadPos = posOnCurve.clone().add(this.scatterOffset);
    
    // Shift existing points down the trail
    for (let i = this.trailLength - 1; i > 0; i--) {
      positions[i * 3] = positions[(i - 1) * 3];
      positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
      positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
    }
    
    // Add the new head position
    newHeadPos.toArray(positions, 0);

    // Recalculate all alphas for smooth fade
    for (let i = 0; i < this.trailLength; i++) {
      alphas[i] = 1.0 - (i / Math.max(1, this.trailLength - 1));
    }
    if (this.trailLength > 0) alphas[0] = 1.0;
    if (this.trailLength <= 1 && alphas.length > 0) alphas[0] = 1.0;

    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.trailAlphaMultiplier.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    scene.remove(this.mesh);
  }
}

// Placeholder for the WeldingSparkParticleSystem - will be implemented in next phase
class WeldingSparkParticleSystem extends ParticleSystem {
  constructor() {
    super('weldingSpark');
    
    // Shader for the welding sparks with point sprites
    this.vertexShader = `
      attribute float size;
      attribute float sparkLife;
      varying float vSparkLife;
      
      void main() {
        vSparkLife = sparkLife;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    
    this.fragmentShader = `
      varying float vSparkLife;
      uniform vec3 sparkColor;
      uniform float sparkHeat;
      uniform float lifecycleAlpha;
      
      void main() {
        // Calculate distance from center of point
        vec2 center = vec2(0.5, 0.5);
        float dist = distance(gl_PointCoord, center);
        
        // Discard pixels outside the circular point
        if (dist > 0.5) discard;
        
        // Color based on heat (yellow-white center, orange-red edges)
        vec3 innerColor = mix(vec3(1.0, 0.9, 0.5), vec3(1.0, 1.0, 1.0), sparkHeat);
        vec3 outerColor = mix(vec3(1.0, 0.3, 0.0), vec3(1.0, 0.6, 0.0), sparkHeat);
        vec3 finalColor = mix(outerColor, innerColor, 1.0 - dist * 2.0);
        
        // Fade based on spark life and apply lifecycle alpha
        float alpha = vSparkLife * (1.0 - dist * 1.5) * lifecycleAlpha;
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `;
  }

  createParticles() {
    for (let i = 0; i < params.numParticles; i++) {
      this.particles.push(new WeldingSpark(curvePath, {
        trailLength: params.weldingSpark.trailLength,
        speedFactor: params.weldingSpark.speedFactor,
        sparkSize: params.weldingSpark.sparkSize,
        sparkHeat: params.weldingSpark.sparkHeat,
        scatterRadius: params.particleScatterRadius,
        vertexShader: this.vertexShader,
        fragmentShader: this.fragmentShader
      }));
    }
  }

  update() {
    this.particles.forEach(p => {
      // Update particle motion
      p.update();
      
      // Apply lifecycle alpha
      if (params.lifecycle.enabled && p.material.uniforms.lifecycleAlpha) {
        p.material.uniforms.lifecycleAlpha.value = this.calculateLifecycleAlpha(p);
      }
    });
  }

  updateColors() {
    // Nothing special needed for welding sparks as they use a heat-based coloring
  }
  
  updateSparkParams() {
    this.particles.forEach(p => {
      if (p.material.uniforms.sparkHeat) {
        p.material.uniforms.sparkHeat.value = params.weldingSpark.sparkHeat;
      }
    });
  }

  applyTheme(theme) {
    // Welding sparks look best with additive blending in both themes
    this.particles.forEach(p => p.material.blending = THREE.AdditiveBlending);
  }
}

// The individual welding spark particle
class WeldingSpark {
  constructor(path, options) {
    this.path = path;
    this.maxLife = options.trailLength;
    this.currentT = Math.random();
    this.baseSpeedRandomness = (0.5 + Math.random() * 1.5); // More speed variation than glow
    this.speed = options.speedFactor * this.baseSpeedRandomness;
    
    // Add lifecycle offset (random starting point in lifecycle)
    this.lifecycleOffset = Math.random() * params.lifecycle.randomOffset;
    
    this.scatterOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 2 * options.scatterRadius,
      (Math.random() - 0.5) * 2 * options.scatterRadius,
      (Math.random() - 0.5) * 2 * options.scatterRadius
    );

    // For welding sparks, we store both positions and 'life' of each particle
    const maxParticles = this.maxLife * 3; // Generate more particles for effect
    this.positions = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);
    this.sparkLives = new Float32Array(maxParticles);
    this.velocities = [];
    this.activeParticles = 0;
    
    // Prepare geometry with empty buffers that will be filled during update
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('sparkLife', new THREE.BufferAttribute(this.sparkLives, 1));
    
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        sparkColor: { value: new THREE.Color(1.0, 0.6, 0.1) },
        sparkHeat: { value: options.sparkHeat },
        lifecycleAlpha: { value: 1.0 } // Add lifecycle alpha
      },
      vertexShader: options.vertexShader,
      fragmentShader: options.fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.mesh = new THREE.Points(this.geometry, this.material);
    scene.add(this.mesh);
    
    // Initial emission of particles
    this.emitSparks();
  }
  
  emitSparks() {
    // Get position on the curve
    const posOnCurve = this.path.getPointAt(this.currentT);
    const origin = posOnCurve.clone().add(this.scatterOffset);
    
    // Get curve tangent at this point to bias spark direction
    const tangent = this.path.getTangentAt(this.currentT).normalize();
    
    // Emit a burst of sparks
    const numNewSparks = Math.floor(2 + Math.random() * 5);
    for (let i = 0; i < numNewSparks; i++) {
      if (this.activeParticles >= this.positions.length / 3) break;
      
      // Random direction with some bias toward curve tangent
      const tangentInfluence = params.weldingSpark.pathFollowing * (0.7 + Math.random() * 0.3); // Controlled by pathFollowing
      const randomInfluence = 1.0 - tangentInfluence;
      
      // Random component (spherical coordinates)
      const angle = Math.random() * Math.PI * 2;
      const elevation = Math.random() * Math.PI - Math.PI/2; // Full sphere
      const randomDir = new THREE.Vector3(
        Math.cos(angle) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(angle) * Math.cos(elevation)
      ).normalize();
      
      // Mix random direction with tangent based on influence
      const direction = new THREE.Vector3()
        .addScaledVector(tangent, tangentInfluence)
        .addScaledVector(randomDir, randomInfluence)
        .normalize();
      
      // Add some gravity bias in y direction
      direction.y -= 0.2 * (1 - params.weldingSpark.pathFollowing); // Less gravity when following path closely
      direction.normalize();
      
      // Vary the speed
      const speed = 0.05 + Math.random() * 0.15;
      const velocity = direction.multiplyScalar(speed);
      
      // Set the position at the emission point
      const idx = this.activeParticles * 3;
      this.positions[idx] = origin.x;
      this.positions[idx + 1] = origin.y;
      this.positions[idx + 2] = origin.z;
      
      // Set initial properties
      this.sizes[this.activeParticles] = (0.2 + Math.random() * 0.8) * params.weldingSpark.sparkSize;
      this.sparkLives[this.activeParticles] = 1.0;
      this.velocities[this.activeParticles] = velocity;
      
      this.activeParticles++;
    }
    
    // Update the geometry to reflect new particle count
    this.geometry.setDrawRange(0, this.activeParticles);
  }

  update() {
    // Update speed in case speedFactor changed
    this.speed = params.weldingSpark.speedFactor * this.baseSpeedRandomness;
    this.currentT += this.speed;
    
    if (this.currentT >= 1) {
      this.currentT = 0;
      // Update scatter offset for new emission point
      this.scatterOffset.set(
        (Math.random() - 0.5) * 2 * params.particleScatterRadius,
        (Math.random() - 0.5) * 2 * params.particleScatterRadius,
        (Math.random() - 0.5) * 2 * params.particleScatterRadius
      );
    }
    
    // Always emit sparks at the current location (more frequent than glow)
    if (Math.random() > 0.7) {
      this.emitSparks();
    }
    
    // Update all active particles
    let aliveCount = 0;
    for (let i = 0; i < this.activeParticles; i++) {
      // Reduce spark life
      this.sparkLives[i] -= 0.03 + Math.random() * 0.02;
      
      if (this.sparkLives[i] > 0) {
        const idx = i * 3;
        
        // Apply velocity and gravity
        this.velocities[i].y -= 0.001; // Gravity effect
        
        this.positions[idx] += this.velocities[i].x;
        this.positions[idx + 1] += this.velocities[i].y;
        this.positions[idx + 2] += this.velocities[i].z;
        
        // Reduce size as life decreases
        this.sizes[i] *= 0.98;
        
        // Keep this particle alive
        if (i !== aliveCount) {
          // Move this particle data to the position of the alive count
          this.positions[aliveCount * 3] = this.positions[idx];
          this.positions[aliveCount * 3 + 1] = this.positions[idx + 1];
          this.positions[aliveCount * 3 + 2] = this.positions[idx + 2];
          this.sizes[aliveCount] = this.sizes[i];
          this.sparkLives[aliveCount] = this.sparkLives[i];
          this.velocities[aliveCount] = this.velocities[i];
        }
        aliveCount++;
      }
    }
    
    // Update active count and draw range
    this.activeParticles = aliveCount;
    this.geometry.setDrawRange(0, this.activeParticles);
    
    // Mark attributes as needing update
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.sparkLife.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    scene.remove(this.mesh);
  }
}

// CometParticleSystem creates and manages comet particles
class CometParticleSystem extends ParticleSystem {
  constructor() {
    super('comet');
    
    // Shader for the comet head (point sprite)
    this.headVertexShader = `
      uniform float headSize;
      
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = headSize * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    
    this.headFragmentShader = `
      uniform vec3 cometColor;
      uniform float glowIntensity;
      uniform float lifecycleAlpha;
      
      void main() {
        // Calculate distance from center of point
        vec2 center = vec2(0.5, 0.5);
        float dist = distance(gl_PointCoord, center);
        
        // Create a glow effect that fades at edges
        float brightness = 1.0 - (dist * 2.0);
        brightness = pow(brightness, 1.5) * glowIntensity;
        
        // Discard pixels outside the circular point
        if (dist > 0.5) discard;
        
        // Apply lifecycle alpha to the final color
        float finalAlpha = brightness * lifecycleAlpha;
        
        // Center is brightest, edge fades out
        gl_FragColor = vec4(cometColor, finalAlpha);
      }
    `;
    
    // Shader for the comet tail (line)
    this.tailVertexShader = `
      attribute float tailFade;
      varying float vTailFade;
      uniform float tailWidth;
      
      void main() {
        vTailFade = tailFade;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
    this.tailFragmentShader = `
      varying float vTailFade;
      uniform vec3 cometColor;
      uniform float glowIntensity;
      uniform float tailFade;
      uniform float lifecycleAlpha;
      
      void main() {
        // Fade based on position in the tail, affected by tailFade parameter
        float fadeEffect = pow(vTailFade, 1.0 / tailFade);
        float alpha = fadeEffect * glowIntensity * 1.5 * lifecycleAlpha;
        
        // Enhance brightness for bolder tails
        vec3 enhancedColor = mix(cometColor, vec3(1.0, 1.0, 1.0), 0.2 * fadeEffect);
        
        // Tail color is the same as head but with transparency
        gl_FragColor = vec4(enhancedColor, alpha);
      }
    `;
  }

  createParticles() {
    for (let i = 0; i < params.numParticles; i++) {
      this.particles.push(new Comet(curvePath, {
        tailLength: params.comet.tailLength,
        headSize: params.comet.headSize,
        tailWidth: params.comet.tailWidth,
        tailFade: params.comet.tailFade,
        glowIntensity: params.comet.glowIntensity,
        speedFactor: params.comet.speedFactor,
        scatterRadius: params.particleScatterRadius,
        headVertexShader: this.headVertexShader,
        headFragmentShader: this.headFragmentShader,
        tailVertexShader: this.tailVertexShader,
        tailFragmentShader: this.tailFragmentShader,
        color: params.comet.cometColor
      }));
    }
  }

  update() {
    this.particles.forEach(p => {
      // Update particle motion
      p.update();
      
      // Apply lifecycle alpha to both head and tail
      if (params.lifecycle.enabled) {
        const lifecycleAlpha = this.calculateLifecycleAlpha(p);
        if (p.headMaterial.uniforms.lifecycleAlpha) {
          p.headMaterial.uniforms.lifecycleAlpha.value = lifecycleAlpha;
        }
        if (p.tailMaterial.uniforms.lifecycleAlpha) {
          p.tailMaterial.uniforms.lifecycleAlpha.value = lifecycleAlpha;
        }
        
        // Also apply to all wide tail meshes if they exist
        if (p.wideTailMeshes) {
          p.wideTailMeshes.forEach(mesh => {
            if (mesh.material.uniforms.lifecycleAlpha) {
              mesh.material.uniforms.lifecycleAlpha.value = lifecycleAlpha;
            }
          });
        }
      }
    });
  }

  updateColors() {
    this.particles.forEach(p => this.setCometColor(p));
  }
  
  updateCometParams() {
    this.particles.forEach(p => {
      // Update uniform values from params
      if (p.headMaterial.uniforms.headSize) {
        p.headMaterial.uniforms.headSize.value = params.comet.headSize;
      }
      if (p.headMaterial.uniforms.glowIntensity) {
        p.headMaterial.uniforms.glowIntensity.value = params.comet.glowIntensity;
        p.tailMaterial.uniforms.glowIntensity.value = params.comet.glowIntensity;
      }
      if (p.tailMaterial.uniforms.tailWidth) {
        p.tailMaterial.uniforms.tailWidth.value = params.comet.tailWidth;
      }
      if (p.tailMaterial.uniforms.tailFade) {
        p.tailMaterial.uniforms.tailFade.value = params.comet.tailFade;
      }
      
      // Also update the line width for the tail (when supported by browser)
      if (p.tailMesh && p.tailMesh.material) {
        p.tailMesh.material.linewidth = params.comet.tailWidth;
      }
      
      // Update all additional wide tail meshes
      if (p.wideTailMeshes) {
        // If the tail width has changed dramatically, recreate the system
        const targetExtraLines = Math.floor(params.comet.tailWidth * 2);
        if (Math.abs(targetExtraLines - p.wideTailMeshes.length) > 2) {
          recreateSystem();
          return;
        }
        
        // Otherwise update the existing meshes
        for (let i = 0; i < p.wideTailMeshes.length; i++) {
          if (p.wideTailMeshes[i].material.uniforms.tailFade) {
            p.wideTailMeshes[i].material.uniforms.tailFade.value = params.comet.tailFade;
          }
          if (p.wideTailMeshes[i].material.uniforms.glowIntensity) {
            // Decrease intensity for outer lines
            const intensityFactor = 1 - i / p.wideTailMeshes.length * 0.5;
            p.wideTailMeshes[i].material.uniforms.glowIntensity.value = 
              params.comet.glowIntensity * intensityFactor;
          }
        }
      }
    });
  }

  applyTheme(theme) {
    // Comets look best with additive blending in dark theme
    if (theme === 'dark') {
      this.particles.forEach(p => {
        p.headMaterial.blending = THREE.AdditiveBlending;
        p.tailMaterial.blending = THREE.AdditiveBlending;
      });
    } else {
      // For light theme, use normal blending
      this.particles.forEach(p => {
        p.headMaterial.blending = THREE.NormalBlending;
        p.tailMaterial.blending = THREE.NormalBlending;
      });
    }
    
    // Update colors based on theme
    this.updateColors();
  }
  
  // Set comet colors based on color mode
  setCometColor(comet) {
    let color;
    
    if (params.currentTheme === 'light') {
      // Use a darker color for light theme
      color = new THREE.Color(0x0066cc);
    } else {
      // For dark theme, use the selected color mode
      switch (params.comet.colorMode) {
        case 'rainbow':
          color = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
          break;
        case 'single':
          color = new THREE.Color(params.comet.cometColor);
          break;
        case 'palette':
          // Use the same palette system as glow particles
          const activePalette = [];
          if (params.paletteColor1Enabled) activePalette.push(params.paletteColor1);
          if (params.paletteColor2Enabled) activePalette.push(params.paletteColor2);
          if (params.paletteColor3Enabled) activePalette.push(params.paletteColor3);
          if (params.paletteColor4Enabled) activePalette.push(params.paletteColor4);
          if (params.paletteColor5Enabled) activePalette.push(params.paletteColor5);
          
          if (activePalette.length > 0) {
            const randomIndex = Math.floor(Math.random() * activePalette.length);
            color = new THREE.Color(activePalette[randomIndex]);
          } else {
            color = new THREE.Color(params.comet.cometColor);
          }
          break;
        default:
          color = new THREE.Color(params.comet.cometColor);
      }
    }
    
    // Apply color to both head and tail
    comet.headMaterial.uniforms.cometColor.value.copy(color);
    comet.tailMaterial.uniforms.cometColor.value.copy(color);
  }
}

// Individual comet particle with head and tail
class Comet {
  constructor(path, options) {
    this.path = path;
    this.tailLength = options.tailLength;
    this.currentT = Math.random();
    this.baseSpeedRandomness = (0.5 + Math.random() * 1.0);
    this.speed = options.speedFactor * this.baseSpeedRandomness;
    
    // Add lifecycle offset (random starting point in lifecycle)
    this.lifecycleOffset = Math.random() * params.lifecycle.randomOffset;
    
    // Scatter offset for the comet's path
    this.scatterOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 2 * options.scatterRadius,
      (Math.random() - 0.5) * 2 * options.scatterRadius,
      (Math.random() - 0.5) * 2 * options.scatterRadius
    );

    // Create the head (a point)
    this.headGeometry = new THREE.BufferGeometry();
    this.headPosition = new Float32Array(3);
    
    // Initialize head position
    const initialPos = this.path.getPointAt(this.currentT).clone().add(this.scatterOffset);
    initialPos.toArray(this.headPosition);
    
    this.headGeometry.setAttribute('position', new THREE.BufferAttribute(this.headPosition, 3));
    
    // Create the tail (a line)
    this.tailPositions = new Float32Array(this.tailLength * 3);
    this.tailFades = new Float32Array(this.tailLength);
    
    // Initialize tail with head position
    for (let i = 0; i < this.tailLength; i++) {
      initialPos.toArray(this.tailPositions, i * 3);
      this.tailFades[i] = 1.0 - (i / Math.max(1, this.tailLength - 1));
    }
    
    this.tailGeometry = new THREE.BufferGeometry();
    this.tailGeometry.setAttribute('position', new THREE.BufferAttribute(this.tailPositions, 3));
    this.tailGeometry.setAttribute('tailFade', new THREE.BufferAttribute(this.tailFades, 1));
    
    // Create materials with shaders
    this.headMaterial = new THREE.ShaderMaterial({
      uniforms: {
        cometColor: { value: new THREE.Color(options.color) },
        headSize: { value: options.headSize },
        glowIntensity: { value: options.glowIntensity },
        lifecycleAlpha: { value: 1.0 } // Add lifecycle alpha uniform
      },
      vertexShader: options.headVertexShader,
      fragmentShader: options.headFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.tailMaterial = new THREE.ShaderMaterial({
      uniforms: {
        cometColor: { value: new THREE.Color(options.color) },
        tailWidth: { value: options.tailWidth },
        tailFade: { value: options.tailFade || 0.8 },
        glowIntensity: { value: options.glowIntensity },
        lifecycleAlpha: { value: 1.0 } // Add lifecycle alpha uniform
      },
      vertexShader: options.tailVertexShader,
      fragmentShader: options.tailFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    // Create meshes for head and tail
    this.headMesh = new THREE.Points(this.headGeometry, this.headMaterial);
    
    // For better visual effect, create a fat line (using THREE.MeshLine or custom LineSegments)
    // This works better than just setting linewidth which has browser limitations
    this.tailMesh = new THREE.Line(this.tailGeometry, this.tailMaterial);
    this.tailMesh.material.linewidth = options.tailWidth;
    
    // Add to scene
    scene.add(this.headMesh);
    scene.add(this.tailMesh);
    
    // Create a series of additional lines for a thicker tail effect
    this.wideTailMeshes = [];
    const numExtraLines = Math.floor(options.tailWidth * 2); // Scale number of lines with desired width
    
    if (numExtraLines > 0) {
      // Create offset positions for additional lines to make a thicker tail
      for (let i = 0; i < numExtraLines; i++) {
        // Create a slight offset for each additional line
        const offset = (i + 1) * 0.05;
        const angle = (i / numExtraLines) * Math.PI * 2;
        const offsetX = Math.cos(angle) * offset;
        const offsetY = Math.sin(angle) * offset;
        
        // Clone the tail geometry and offset positions
        const offsetGeometry = this.tailGeometry.clone();
        const positions = offsetGeometry.attributes.position.array;
        
        // Apply offset to each position
        for (let j = 0; j < positions.length; j += 3) {
          positions[j] += offsetX; // X position
          positions[j + 1] += offsetY; // Y position
        }
        
        // Create a mesh with the offset geometry
        const offsetMesh = new THREE.Line(offsetGeometry, this.tailMaterial.clone());
        scene.add(offsetMesh);
        
        // Add alpha multiplier based on distance from center
        offsetMesh.material.uniforms.glowIntensity.value *= (1 - i / numExtraLines * 0.5);
        
        this.wideTailMeshes.push(offsetMesh);
      }
    }
  }

  update() {
    // Update speed in case speedFactor changed
    this.speed = params.comet.speedFactor * this.baseSpeedRandomness;
    this.currentT += this.speed;
    
    if (this.currentT >= 1) {
      this.currentT = 0;
      // Update scatter offset when completing a loop
      this.scatterOffset.set(
        (Math.random() - 0.5) * 2 * params.particleScatterRadius,
        (Math.random() - 0.5) * 2 * params.particleScatterRadius,
        (Math.random() - 0.5) * 2 * params.particleScatterRadius
      );
    }
    
    // Update head position
    const headPos = this.path.getPointAt(this.currentT).clone().add(this.scatterOffset);
    headPos.toArray(this.headPosition);
    this.headGeometry.attributes.position.needsUpdate = true;
    
    // Calculate segment size for tail
    const tailSegmentLength = this.speed * 0.95;
    
    // Update main tail positions
    this.updateTailGeometry(this.tailMesh.geometry, tailSegmentLength, new THREE.Vector3(0, 0, 0));
    
    // Update all wide tail meshes
    if (this.wideTailMeshes.length > 0) {
      const numExtraLines = this.wideTailMeshes.length;
      
      for (let i = 0; i < numExtraLines; i++) {
        // Create a slight offset for each additional line
        const offset = (i + 1) * 0.05;
        const angle = (i / numExtraLines) * Math.PI * 2;
        const offsetVector = new THREE.Vector3(
          Math.cos(angle) * offset,
          Math.sin(angle) * offset,
          0
        );
        
        this.updateTailGeometry(this.wideTailMeshes[i].geometry, tailSegmentLength, offsetVector);
      }
    }
  }
  
  // Update a tail geometry with given offset
  updateTailGeometry(geometry, tailSegmentLength, offsetVector) {
    const positions = geometry.attributes.position.array;
    
    // Create a smooth tail by sampling points along the curve
    for (let i = 0; i < this.tailLength; i++) {
      // Calculate t value for this tail segment by going backwards along the curve
      let t = this.currentT - (i * tailSegmentLength);
      
      // Handle wrapping around the curve (t < 0)
      t = ((t % 1) + 1) % 1; 
      
      // Get position on curve and add scatter offset
      const posOnCurve = this.path.getPointAt(t).clone().add(this.scatterOffset);
      
      // Add additional offset for wide tails
      posOnCurve.add(offsetVector);
      
      // Set position in tail
      posOnCurve.toArray(positions, i * 3);
    }
    
    geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.headGeometry.dispose();
    this.tailGeometry.dispose();
    this.headMaterial.dispose();
    this.tailMaterial.dispose();
    scene.remove(this.headMesh);
    scene.remove(this.tailMesh);
    
    // Dispose all wide tail meshes
    for (let i = 0; i < this.wideTailMeshes.length; i++) {
      scene.remove(this.wideTailMeshes[i]);
      this.wideTailMeshes[i].geometry.dispose();
      this.wideTailMeshes[i].material.dispose();
    }
    this.wideTailMeshes = [];
  }
}

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

function createLorenzAttractorPoints(sigma = 10, rho = 28, beta = 8/3, scale = 1.0, timeStep = 0.01, numPoints = 2000) {
  const points = [];
  
  // Initial conditions
  let x = 1.0;
  let y = 1.0; 
  let z = 1.0;
  
  // Generate points by numerically integrating the Lorenz equations
  for (let i = 0; i < numPoints; i++) {
    // Lorenz equations:
    // dx/dt = sigma * (y - x)
    // dy/dt = x * (rho - z) - y  
    // dz/dt = x * y - beta * z
    
    const dx = sigma * (y - x);
    const dy = x * (rho - z) - y;
    const dz = x * y - beta * z;
    
    // Euler integration step
    x += dx * timeStep;
    y += dy * timeStep;
    z += dz * timeStep;
    
    // Scale and add point, swapping y and z for the classic orientation
    // where the "height" of the butterfly is along the y-axis in Three.js
    points.push(new THREE.Vector3(x * scale, z * scale, y * scale));
  }
  
  return points;
}

function createJugglingPatternPoints(balls = 3, throwHeight = 8.0, handSeparation = 6.0, 
                                   throwAngle = 0.3, gravity = 9.8, scale = 1.0, numPoints = 1200, pattern = '3') {
  const points = [];
  
  // Create a figure-8 (infinity symbol) pattern that represents the visual flow of juggling
  // This is what your eyes naturally track when watching someone juggle
  
  const width = handSeparation * scale;
  const height = throwHeight * scale;
  const centerY = height * 0.4; // Crossover point slightly above center
  
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * 4 * Math.PI; // Two complete loops for figure-8
    
    // Parametric equations for a figure-8 (lemniscate of Gerono)
    // Modified to be vertically oriented like juggling
    const x = (width * Math.sin(t)) / (1 + Math.cos(t) * Math.cos(t));
    const y = (height * Math.sin(t) * Math.cos(t)) / (1 + Math.cos(t) * Math.cos(t)) + centerY;
    const z = 0; // Keep it in the x-y plane
    
    points.push(new THREE.Vector3(x, y, z));
  }
  
  return points;
}

function updateColorControllerVisibility() {
  // Safety check: ensure GUI is initialized
  if (!gui) return;
  
  // Only show color controls for glow particles
  const showColorControls = params.particleType === 'glow';
  
  // Header visibility first
  const colorFolder = gui.folders.find(f => f.title === 'Color (Dark Theme)');
  if (colorFolder) {
    // Hide entire color folder if not glow
    colorFolder.domElement.style.display = showColorControls ? '' : 'none';
    
    // Within the color folder, handle singleColor/palette controllers
    if (showColorControls) {
      singleColorController.domElement.style.display = params.colorMode === 'single' ? '' : 'none';
      for (let i = 1; i <= 5; i++) {
        if (paletteControllers[`color${i}`] && paletteControllers[`enabled${i}`]) {
          const display = params.colorMode === 'palette' ? '' : 'none';
          paletteControllers[`color${i}`].domElement.style.display = display;
          paletteControllers[`enabled${i}`].domElement.style.display = display;
        }
      }
    }
  }
}

function applyThemeSettings() {
  // Maintain transparency instead of setting background color
  renderer.setClearColor(0x000000, 0);
  
  // Apply theme settings to the current particle system
  if (particleSystem) {
    particleSystem.applyTheme(params.currentTheme);
  }
  
  // Handle bloom settings based on theme
  if (bloomPass) {
    if (params.currentTheme === 'dark') {
      bloomPass.enabled = true;
      bloomPass.strength = params.darkBloomStrength;
      bloomPass.radius = params.darkBloomRadius;
      bloomPass.threshold = params.darkBloomThreshold;
      // Ensure bloom doesn't affect background
      bloomPass.clearColor = new THREE.Color(0x000000);
      bloomPass.clearAlpha = 0;
    } else { // light theme
      bloomPass.enabled = false; // Disabled for light theme by default
    }
  }
}

function recreateSystem() {
  // Create curve based on selected type
  let curvePoints;
  let curveCenter;
  let isCurveClosed = false; // By default, curves are not closed
  
  if (params.curveType === 'lorenz') {
    curvePoints = createLorenzAttractorPoints(
      params.lorenz.sigma, 
      params.lorenz.rho, 
      params.lorenz.beta, 
      params.lorenz.scale, 
      params.lorenz.timeStep, 
      params.lorenz.numPoints
    );
    // Center the camera on the visual center of the attractor
    const visualCenterY = (params.lorenz.rho - 1) * params.lorenz.scale;
    curveCenter = new THREE.Vector3(0, visualCenterY, 0);
    isCurveClosed = false; // Lorenz attractor is not a closed loop
  } else if (params.curveType === 'juggling') {
    curvePoints = createJugglingPatternPoints(
      params.juggling.balls,
      params.juggling.throwHeight,
      params.juggling.handSeparation,
      params.juggling.throwAngle,
      params.juggling.gravity,
      params.juggling.scale,
      params.juggling.numPoints,
      params.juggling.pattern
    );
    // Center the camera on the juggling pattern (slightly above center)
    curveCenter = new THREE.Vector3(0, params.juggling.throwHeight * 0.4, 0);
    isCurveClosed = true; // Juggling pattern is a closed loop
  } else {
    // Default to Viviani curve
    curvePoints = createVivianiCurvePoints(params.vivianiA, 256);
    curveCenter = new THREE.Vector3(params.vivianiA, 0, 0);
    isCurveClosed = true; // Viviani curve should be a closed loop
  }
  
  curvePath = new THREE.CatmullRomCurve3(curvePoints, isCurveClosed);
  
  // Update camera target
  camera.lookAt(curveCenter);
  controls.target.copy(curveCenter);
  
  // Create the appropriate particle system based on type
  if (particleSystem) {
    particleSystem.clear(); // Clean up old system
  }
  particleSystem = ParticleSystem.create(params.particleType);
  particleSystem.init();
  
  // Apply theme settings to the new particles
  applyThemeSettings();
  
  // Update GUI for the new particle type
  updateGUIVisibility();
}

function updateGUIVisibility() {
  // Safety check: ensure GUI is initialized
  if (!gui) return;
  
  // Update color controls visibility
  updateColorControllerVisibility();
  
  // Update curve parameters visibility  
  if (typeof updateCurveParametersVisibility === 'function') {
    updateCurveParametersVisibility();
  }
  
  // Update particle-type specific folders
  const glowFolder = gui.folders.find(f => f.title === 'Glow Particles');
  const sparkFolder = gui.folders.find(f => f.title === 'Welding Spark Particles');
  const cometFolder = gui.folders.find(f => f.title === 'Comet Particles');
  
  if (glowFolder) {
    glowFolder.domElement.style.display = params.particleType === 'glow' ? '' : 'none';
  }
  
  if (sparkFolder) {
    sparkFolder.domElement.style.display = params.particleType === 'weldingSpark' ? '' : 'none';
  }
  
  if (cometFolder) {
    cometFolder.domElement.style.display = params.particleType === 'comet' ? '' : 'none';
  }
}

function initGUI() {
  gui = new GUI();
  
  // Theme and Background (top level)
  gui.add(params, 'currentTheme', ['dark', 'light']).name('Theme').onChange(applyThemeSettings);
  gui.addColor(params, 'backgroundColor').name('Background').onChange(value => {
    // Update CSS background color
    document.body.style.backgroundColor = value;
    applyThemeSettings();
  });

  gui.add(params, 'useDirectRendering').name('Direct Rendering').onChange(() => {
    // No action needed, animate() will use the new setting immediately
  });

  // Particle Type selector (top level)
  gui.add(params, 'particleType', ['glow', 'weldingSpark', 'comet']).name('Particle Type').onChange(() => {
    recreateSystem();
  });

  // Common particle parameters
  const commonFolder = gui.addFolder('Common Parameters');
  commonFolder.add(params, 'numParticles', 10, 500, 1).name('Count').onChange(recreateSystem);
  commonFolder.add(params, 'particleScatterRadius', 0, 5, 0.1).name('Scatter Radius').onChange(recreateSystem);
  
  // Curve type selector
  commonFolder.add(params, 'curveType', ['viviani', 'lorenz', 'juggling']).name('Curve Type').onChange(() => {
    recreateSystem();
    updateCurveParametersVisibility();
  });
  
  // Viviani curve parameters
  const vivianiController = commonFolder.add(params, 'vivianiA', 1, 10, 0.1).name('Curve Scale (a)').onChange(recreateSystem);
  
  // Lorenz Attractor parameters
  const lorenzFolder = commonFolder.addFolder('Lorenz Attractor');
  const sigmaController = lorenzFolder.add(params.lorenz, 'sigma', 5, 15, 0.1).name('Sigma (σ)').onChange(recreateSystem);
  const rhoController = lorenzFolder.add(params.lorenz, 'rho', 20, 35, 0.1).name('Rho (ρ)').onChange(recreateSystem);
  const betaController = lorenzFolder.add(params.lorenz, 'beta', 1, 4, 0.1).name('Beta (β)').onChange(recreateSystem);
  const scaleController = lorenzFolder.add(params.lorenz, 'scale', 0.1, 3.0, 0.1).name('Scale').onChange(recreateSystem);
  const timeStepController = lorenzFolder.add(params.lorenz, 'timeStep', 0.005, 0.02, 0.001).name('Time Step').onChange(recreateSystem);
  const numPointsController = lorenzFolder.add(params.lorenz, 'numPoints', 1000, 5000, 100).name('Points').onChange(recreateSystem);
  
  // Juggling Pattern parameters
  const jugglingFolder = commonFolder.addFolder('Juggling Pattern');
  const ballsController = jugglingFolder.add(params.juggling, 'balls', 3, 7, 1).name('Number of Balls').onChange(recreateSystem);
  const throwHeightController = jugglingFolder.add(params.juggling, 'throwHeight', 3, 15, 0.1).name('Throw Height').onChange(recreateSystem);
  const handSeparationController = jugglingFolder.add(params.juggling, 'handSeparation', 2, 12, 0.1).name('Hand Separation').onChange(recreateSystem);
  const throwAngleController = jugglingFolder.add(params.juggling, 'throwAngle', 0, 0.8, 0.01).name('Throw Angle').onChange(recreateSystem);
  const gravityController = jugglingFolder.add(params.juggling, 'gravity', 5, 15, 0.1).name('Gravity').onChange(recreateSystem);
  const jugglingScaleController = jugglingFolder.add(params.juggling, 'scale', 0.5, 2.0, 0.1).name('Scale').onChange(recreateSystem);
  const jugglingPointsController = jugglingFolder.add(params.juggling, 'numPoints', 600, 2400, 100).name('Points').onChange(recreateSystem);
  
  // Function to update curve parameter visibility
  function updateCurveParametersVisibility() {
    const isViviani = params.curveType === 'viviani';
    const isLorenz = params.curveType === 'lorenz';
    const isJuggling = params.curveType === 'juggling';
    
    // Show/hide Viviani parameters
    vivianiController.domElement.style.display = isViviani ? '' : 'none';
    
    // Show/hide Lorenz folder
    lorenzFolder.domElement.style.display = isLorenz ? '' : 'none';
    
    // Show/hide Juggling folder
    jugglingFolder.domElement.style.display = isJuggling ? '' : 'none';
  }
  
  // Set initial visibility
  updateCurveParametersVisibility();

  // Lifecycle settings
  const lifecycleFolder = gui.addFolder('Lifecycle Settings');
  lifecycleFolder.add(params.lifecycle, 'enabled').name('Enable Lifecycle');
  lifecycleFolder.add(params.lifecycle, 'fadeInTime', 0.01, 0.5, 0.01).name('Fade In Time');
  lifecycleFolder.add(params.lifecycle, 'stableTime', 0.1, 0.9, 0.01).name('Stable Time');
  lifecycleFolder.add(params.lifecycle, 'fadeOutTime', 0.01, 0.5, 0.01).name('Fade Out Time');
  lifecycleFolder.add(params.lifecycle, 'randomOffset', 0, 1, 0.05).name('Random Offset').onChange(recreateSystem);
  
  // Glow particle specific parameters
  const glowFolder = gui.addFolder('Glow Particles');
  glowFolder.add(params.glow, 'trailLength', 1, 50, 1).name('Trail Length').onChange(recreateSystem);
  glowFolder.add(params.glow, 'speedFactor', 0.0001, 0.01, 0.0001).name('Speed Factor');
  glowFolder.add(params.glow, 'boldness', 0.1, 3.0, 0.1).name('Boldness').onChange(() => {
    if (particleSystem && particleSystem.type === 'glow') {
      particleSystem.updateBoldness();
    }
  });
  glowFolder.add(params.glow, 'lineWidth', 0.1, 5.0, 0.1).name('Line Width').onChange(() => {
    if (particleSystem && particleSystem.type === 'glow') {
      particleSystem.updateLineWidth();
    }
  });
  
  // Welding Spark specific parameters (placeholder for next phase)
  const sparkFolder = gui.addFolder('Welding Spark Particles');
  sparkFolder.add(params.weldingSpark, 'trailLength', 1, 50, 1).name('Trail Length').onChange(recreateSystem);
  sparkFolder.add(params.weldingSpark, 'speedFactor', 0.0001, 0.01, 0.0001).name('Speed Factor');
  sparkFolder.add(params.weldingSpark, 'sparkSize', 0.1, 2.0, 0.1).name('Spark Size').onChange(recreateSystem);
  sparkFolder.add(params.weldingSpark, 'sparkHeat', 0.1, 1.0, 0.1).name('Spark Heat').onChange(() => {
    if (particleSystem && particleSystem.type === 'weldingSpark') {
      particleSystem.updateSparkParams();
    }
  });
  sparkFolder.add(params.weldingSpark, 'pathFollowing', 0, 1, 0.1).name('Path Following');
  
  // Comet specific parameters
  const cometFolder = gui.addFolder('Comet Particles');
  cometFolder.add(params.comet, 'headSize', 0.1, 3.0, 0.1).name('Head Size').onChange(() => {
    if (particleSystem && particleSystem.type === 'comet') {
      particleSystem.updateCometParams();
    }
  });
  cometFolder.add(params.comet, 'tailLength', 1, 50, 1).name('Tail Length').onChange(recreateSystem);
  cometFolder.add(params.comet, 'tailWidth', 0.1, 10.0, 0.1).name('Tail Width').onChange(() => {
    if (particleSystem && particleSystem.type === 'comet') {
      particleSystem.updateCometParams();
    }
  });
  cometFolder.add(params.comet, 'tailFade', 0.1, 2.0, 0.05).name('Tail Fade').onChange(() => {
    if (particleSystem && particleSystem.type === 'comet') {
      particleSystem.updateCometParams();
    }
  });
  cometFolder.add(params.comet, 'glowIntensity', 0.1, 2.0, 0.05).name('Glow Intensity').onChange(() => {
    if (particleSystem && particleSystem.type === 'comet') {
      particleSystem.updateCometParams();
    }
  });
  cometFolder.add(params.comet, 'speedFactor', 0.0001, 0.01, 0.0001).name('Speed Factor');
  cometFolder.add(params.comet, 'colorMode', ['rainbow', 'single', 'palette']).name('Color Mode').onChange(() => {
    if (particleSystem && particleSystem.type === 'comet') {
      particleSystem.updateColors();
    }
  });
  cometFolder.addColor(params.comet, 'cometColor').name('Comet Color').onChange(() => {
    if (particleSystem && particleSystem.type === 'comet' && params.comet.colorMode === 'single') {
      particleSystem.updateColors();
    }
  });

  // Color settings (for glow particles)
  const colorFolder = gui.addFolder('Color (Dark Theme)');
  colorFolder.add(params, 'colorMode', ['rainbow', 'single', 'palette']).name('Mode').onChange(() => {
    if (particleSystem && particleSystem.type === 'glow') {
      particleSystem.updateColors();
    }
    updateColorControllerVisibility();
  });
  
  singleColorController = colorFolder.addColor(params, 'singleColorValue').name('Single Color').onChange(() => {
    if (particleSystem && particleSystem.type === 'glow') {
      particleSystem.updateColors();
    }
  });
  
  for (let i = 1; i <= 5; i++) {
    paletteControllers[`color${i}`] = colorFolder.addColor(params, `paletteColor${i}`).name(`Palette ${i}`).onChange(() => {
      if (particleSystem && particleSystem.type === 'glow') {
        particleSystem.updateColors();
      }
    });
    paletteControllers[`enabled${i}`] = colorFolder.add(params, `paletteColor${i}Enabled`).name(`Enabled ${i}`).onChange(() => {
      if (particleSystem && particleSystem.type === 'glow') {
        particleSystem.updateColors();
      }
    });
  }

  // Bloom settings (mainly for dark theme)
  const bloomFolder = gui.addFolder('Bloom (Dark Theme)');
  bloomFolder.add(params, 'bloomStrength', 0, 3, 0.01).name('Strength').onChange(v => {
    params.darkBloomStrength = v;
    if(params.currentTheme === 'dark') bloomPass.strength = v;
  });
  bloomFolder.add(params, 'bloomRadius', 0, 1, 0.01).name('Radius').onChange(v => {
    params.darkBloomRadius = v;
    if(params.currentTheme === 'dark') bloomPass.radius = v;
  });
  bloomFolder.add(params, 'bloomThreshold', 0, 1, 0.01).name('Threshold').onChange(v => {
    params.darkBloomThreshold = v;
    if(params.currentTheme === 'dark') bloomPass.threshold = v;
  });
  
  // Set initial visibility state
  updateGUIVisibility();
}

function init() {
  scene = new THREE.Scene();
  scene.background = null; // Ensure scene has no background
  
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  // Set a good default camera for the Lorenz attractor
  camera.position.set(0, 24, 45);

  const canvas = document.getElementById('webgl-canvas');
  renderer = new THREE.WebGLRenderer({ 
    canvas: canvas, 
    antialias: true,
    alpha: true,  // Enable transparency
    premultipliedAlpha: false
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);  // Set clear color with 0 alpha (fully transparent)

  // Set initial background color
  document.body.style.backgroundColor = params.backgroundColor;
  document.body.style.backgroundImage = 'none';

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
  scene.add(ambientLight);

  // Set up post-processing with transparency support
  composer = new EffectComposer(renderer);
  composer.renderTarget1.texture.format = THREE.RGBAFormat;
  composer.renderTarget2.texture.format = THREE.RGBAFormat;
  
  const renderPass = new RenderPass(scene, camera);
  renderPass.clearColor = new THREE.Color(0x000000);
  renderPass.clearAlpha = 0;
  composer.addPass(renderPass);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    params.bloomStrength,
    params.bloomRadius,
    params.bloomThreshold
  );
  // Ensure bloom preserves transparency
  bloomPass.renderTargetBright.texture.format = THREE.RGBAFormat;
  bloomPass.clearColor = new THREE.Color(0x000000);
  bloomPass.clearAlpha = 0;
  composer.addPass(bloomPass);
  
  // Store initial bloom settings as dark mode defaults
  params.darkBloomStrength = params.bloomStrength;
  params.darkBloomRadius = params.bloomRadius;
  params.darkBloomThreshold = params.bloomThreshold;

  // Create the initial curve and particle system using recreateSystem
  recreateSystem();
  
  // Apply initial theme settings
  applyThemeSettings();
  
  // Initialize GUI after all systems are set up
  initGUI();

  window.addEventListener('resize', onWindowResize, false);
  console.log("Three.js scene initialized with multi-particle system support");
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  
  // Update the current particle system
  if (particleSystem) {
    particleSystem.update();
  }
  
  controls.update();
  
  // Clear with transparency before rendering
  renderer.setClearColor(0x000000, 0);
  
  // Use direct rendering or composer based on setting
  if (params.useDirectRendering) {
    renderer.render(scene, camera);
  } else {
    composer.render();
  }
}

init();
animate(); 