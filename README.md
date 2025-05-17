# Viviani Curve Light Particle Effect

A Three.js experiment to create a dynamic animated light particle effect with particles flying around a Viviani curve in 3D space. The particles will be scattered from the center of the path and have a trailing glow, mimicking a low shutter speed effect.

Inspired by examples like [santosharron/infinite-lights](https://github.com/santosharron/infinite-lights).

## Project Plan

1.  **Foundation: Basic Three.js Setup** - **COMPLETED**
    *   [x] Create `index.html` with a canvas and Three.js (via importmap).
    *   [x] Create `css/style.css` for full-screen dark background.
    *   [x] Initialize `WebGLRenderer`, `Scene`, `PerspectiveCamera` in `js/main.js`.
    *   [x] Add `OrbitControls` for navigation.
    *   [x] Implement a basic animation loop.

2.  **The Path: Viviani Curve** - **COMPLETED**
    *   [x] Implement the parametric equations for a Viviani curve (`x(t) = a * (1 + cos(t))`, `y(t) = a * sin(t)`, `z(t) = 2a * sin(t/2)`).
    *   [x] Create a function to generate an array of `Vector3` points along the curve.
    *   [x] (Optional) Visualize the curve using `THREE.Line` or `THREE.TubeGeometry` (Path data used, mesh kept hidden).

3.  **Light Particles with Trails** - **COMPLETED**
    *   [x] Design particle structure: each particle is a short, moving line segment (trail).
    *   [x] Create `BufferGeometry` for particle trails.
    *   [x] Implement movement: trail head follows the Viviani curve (or a scattered path near it).
    *   [x] Develop `ShaderMaterial` for trails:
        *   [x] Vertex Shader: Control trail width (implicit via alpha attribute prep).
        *   [x] Fragment Shader: Implement color, glow, and fade-out effect.
    *   [x] Use `THREE.AdditiveBlending` for accumulating light effects.

4.  **Animation and Dynamics** - **COMPLETED**
    *   [x] Update particle trail positions in the animation loop.
    *   [x] Implement scattering: particles deviate from the exact Viviani curve for a chaotic effect.
    *   [x] Manage particle lifecycle: recycle particles (reinitialize at the start of the path with new color/scatter).

5.  **Polishing the Aesthetics** - **COMPLETED**
    *   [x] Refine color palette for lights (randomized HSL).
    *   [x] Implement post-processing for enhanced glow:
        *   [x] Use `EffectComposer`.
        *   [x] Add `UnrealBloomPass`.
        *   [ ] (Optional) Experiment with `AfterimagePass`.

6.  **Interactive Controls (Optional Enhancement)**
    *   [ ] Integrate a GUI library (e.g., `lil-gui`).
    *   [ ] Add controls for: number of particles, speed, trail length, scattering, colors, bloom parameters.

## Development Notes

-   Refer to `.cursor/rules/threejs_guidelines.mdc` for Three.js specific best practices.
-   Refer to `.cursor/rules/code_style.mdc` for general code styling. 