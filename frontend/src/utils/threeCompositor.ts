import * as THREE from 'three';

// Custom shaders for GPU color grading and cinematic styling
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D videoTexture;
  uniform vec4 uCoverCrop; // x, y, w, h of source UVs (cover into 9:16)
  uniform float brightness; // 0.0 to 2.0 (1.0 default)
  uniform float contrast;   // 0.0 to 2.0 (1.0 default)
  uniform float saturation; // 0.0 to 2.0 (1.0 default)
  uniform float hue;        // in degrees (-180 to 180, 0 default)
  uniform float vignette;   // 0.0 to 1.0 (0.0 default)
  uniform float filmGrain;  // 0.0 to 0.1 (0.0 default)
  uniform float time;
  varying vec2 vUv;

  // Helper to shift hue
  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    vec2 uv = vec2(
      uCoverCrop.x + vUv.x * uCoverCrop.z,
      uCoverCrop.y + vUv.y * uCoverCrop.w
    );
    vec4 color = texture2D(videoTexture, uv);
    vec3 rgb = color.rgb;

    // Apply brightness
    rgb *= brightness;

    // Apply contrast
    rgb = (rgb - 0.5) * contrast + 0.5;

    // Apply saturation & hue
    if (hue != 0.0 || saturation != 1.0) {
      vec3 hsv = rgb2hsv(rgb);
      hsv.x = fract(hsv.x + hue / 360.0);
      hsv.y *= saturation;
      rgb = hsv2rgb(hsv);
    }

    // Apply vignette (soft cinematic shadow edges)
    if (vignette > 0.0) {
      vec2 uv = vUv - 0.5;
      float dist = length(uv);
      float vig = smoothstep(0.8, 0.4, dist);
      rgb *= mix(1.0, vig, vignette);
    }

    // Apply subtle film grain
    if (filmGrain > 0.0) {
      float grain = fract(sin(dot(vUv + time * 0.01, vec2(12.9898, 78.233))) * 43758.5453);
      rgb += (grain - 0.5) * filmGrain;
    }

    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
  }
`;

export interface ThreeCompositorSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  vignette: number;
  filmGrain: number;
  zoom: number;
  templateId?: string;
  coverCrop?: { x: number; y: number; w: number; h: number };
  videoLayout?: { x: number; y: number; w: number; h: number };
}

function cleanColorHex(color: string): string {
  if (color.startsWith('rgba')) {
    const matches = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (matches) {
      const r = parseInt(matches[1]).toString(16).padStart(2, '0');
      const g = parseInt(matches[2]).toString(16).padStart(2, '0');
      const b = parseInt(matches[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }
  return color;
}

export class ThreeCompositor {
  private canvas: HTMLCanvasElement;
  private video: HTMLVideoElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  
  // Textures and Materials
  private videoTexture: THREE.VideoTexture;
  private videoMaterial: THREE.ShaderMaterial;
  private videoMesh: THREE.Mesh;

  // Subtitles / 2D Overlay texture
  private overlayCanvas: HTMLCanvasElement;
  private overlayTexture: THREE.CanvasTexture;
  private overlayMaterial: THREE.MeshBasicMaterial;
  private overlayMesh: THREE.Mesh;

  // 3D Motion Graphics Overlay
  private scene3d: THREE.Scene;
  private camera3d: THREE.PerspectiveCamera;
  private activeStyle: string | null = null;
  private mesh3d: THREE.Object3D | null = null;
  private gridHelper3d: THREE.GridHelper | null = null;
  private speakerMesh: THREE.Mesh | null = null;
  private speakerMaterial: THREE.ShaderMaterial | null = null;
  private activeSignature = "";

  constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement, overlayCanvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.video = video;
    this.overlayCanvas = overlayCanvas;

    // 1. Initialize WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. Setup Orthographic Camera for pixel-perfect 2D compositing in WebGL
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 1;

    this.scene = new THREE.Scene();

    // 3. Setup Video Texture & Plane
    this.videoTexture = new THREE.VideoTexture(this.video);
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.format = THREE.RGBAFormat;

    this.videoMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        videoTexture: { value: this.videoTexture },
        uCoverCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
        brightness: { value: 1.0 },
        contrast: { value: 1.0 },
        saturation: { value: 1.0 },
        hue: { value: 0.0 },
        vignette: { value: 0.0 },
        filmGrain: { value: 0.0 },
        time: { value: 0.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.videoMesh = new THREE.Mesh(geometry, this.videoMaterial);
    this.scene.add(this.videoMesh);

    // 4. Setup Subtitles Overlay Canvas Texture & Plane
    this.overlayTexture = new THREE.CanvasTexture(this.overlayCanvas);
    this.overlayTexture.minFilter = THREE.LinearFilter;
    this.overlayTexture.magFilter = THREE.LinearFilter;
    
    this.overlayMaterial = new THREE.MeshBasicMaterial({
      map: this.overlayTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.overlayMesh = new THREE.Mesh(geometry, this.overlayMaterial);
    this.scene.add(this.overlayMesh);

    // 5. Setup 3D Overlay Scene & Camera
    this.scene3d = new THREE.Scene();
    this.camera3d = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.1, 1000);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene3d.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 5, 5);
    this.scene3d.add(dirLight);
  }

  // Set sizing and maintain target aspect ratio
  public resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera3d.aspect = width / height;
    this.camera3d.updateProjectionMatrix();
  }

  // Manage 3D Mesh initialization and animation based on style
  private update3dScene(activeMG: any, frame: number, isYoutubeLong: boolean, settings: ThreeCompositorSettings) {
    const style = activeMG.style || 'cinematic';
    const colorHex = activeMG.accent_color || '#a78bfa';
    const geometryType = activeMG.geometry || '';
    const materialType = activeMG.material || '';
    const animType = activeMG.animation || '';
    const speed = activeMG.speed !== undefined ? activeMG.speed : 1.0;
    const shaderLen = activeMG.custom_shader ? activeMG.custom_shader.length : 0;

    const signature = `${style}_${colorHex}_${geometryType}_${materialType}_${animType}_${speed}_${shaderLen}_${activeMG.particle_count || 0}`;

    if (this.activeSignature !== signature) {
      // Clean up previous meshes
      this.clear3dScene();
      this.activeSignature = signature;
      this.activeStyle = style;
      const accentColor = new THREE.Color(cleanColorHex(colorHex));

      if (style === 'blueprint') {
        this.camera3d.position.set(0, 2, 4);
        this.camera3d.lookAt(0, 0, 0);

        const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        const material = new THREE.MeshBasicMaterial({
          color: accentColor,
          wireframe: true,
        });
        const cubeMesh = new THREE.Mesh(geometry, material);
        this.scene3d.add(cubeMesh);
        this.mesh3d = cubeMesh;

        const outerGeo = new THREE.SphereGeometry(1.0, 16, 16);
        const outerMat = new THREE.MeshBasicMaterial({
          color: accentColor,
          wireframe: true,
          transparent: true,
          opacity: 0.3,
        });
        const outerMesh = new THREE.Mesh(outerGeo, outerMat);
        cubeMesh.add(outerMesh);

        this.gridHelper3d = new THREE.GridHelper(6, 12, accentColor, accentColor);
        this.gridHelper3d.position.y = -1.2;
        (this.gridHelper3d.material as THREE.Material).transparent = true;
        (this.gridHelper3d.material as THREE.Material).opacity = 0.4;
        this.scene3d.add(this.gridHelper3d);

      } else if (style === 'custom') {
        const actualGeom = (geometryType === 'torus_knot') ? 'torusKnot'
                         : (geometryType === 'chroma_spheres') ? 'sphere'
                         : (geometryType === 'fluid') ? 'tunnel'
                         : (geometryType === 'particles' || geometryType === 'dna' || geometryType === 'points')
                           ? 'torusKnot'
                           : geometryType;

        // Camera setup based on geometry type
        if (actualGeom === 'tunnel') {
          this.camera3d.position.set(0, 0, 4);
          this.camera3d.lookAt(0, 0, -10);
        } else if (actualGeom === 'grid') {
          this.camera3d.position.set(0, 2, 4);
          this.camera3d.lookAt(0, 0, 0);
        } else {
          this.camera3d.position.set(0, 0, 4.5);
          this.camera3d.lookAt(0, 0, 0);
        }

        // 1. Build Geometry
        let geometry: THREE.BufferGeometry;
        if (actualGeom === 'cube') {
          geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        } else if (actualGeom === 'sphere') {
          geometry = new THREE.SphereGeometry(0.9, 24, 24);
        } else if (actualGeom === 'torus') {
          geometry = new THREE.TorusGeometry(0.8, 0.25, 12, 48);
        } else if (actualGeom === 'torusKnot') {
          geometry = new THREE.TorusKnotGeometry(0.8, 0.28, 100, 16);
        } else if (actualGeom === 'tunnel') {
          geometry = new THREE.CylinderGeometry(1.0, 1.0, 15, 16, 20, true);
        } else if (actualGeom === 'grid') {
          this.gridHelper3d = new THREE.GridHelper(8, 16, accentColor, accentColor);
          this.gridHelper3d.position.y = -1.0;
          (this.gridHelper3d.material as THREE.Material).transparent = true;
          (this.gridHelper3d.material as THREE.Material).opacity = 0.5;
          this.scene3d.add(this.gridHelper3d);
          geometry = new THREE.BufferGeometry();
        } else {
          geometry = new THREE.TorusKnotGeometry(0.8, 0.28, 100, 16);
        }

        // 2. Build Material
        let material: THREE.Material;
        if (activeMG.custom_shader) {
          const vertexShader = `
            varying vec2 vUv;
            varying vec3 vPos;
            varying vec3 vPosition;
            varying vec3 vNormal;
            void main() {
              vUv = uv;
              vPos = position;
              vPosition = position;
              vNormal = normal;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `;
          material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader: activeMG.custom_shader,
            uniforms: {
              time: { value: 0 },
              color: { value: accentColor }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
          });
        } else if (materialType === 'glossy_metal') {
          material = new THREE.MeshStandardMaterial({
            color: accentColor,
            roughness: 0.1,
            metalness: 0.9,
            transparent: true,
            opacity: 0.85,
          });
        } else if (materialType === 'glass') {
          material = new THREE.MeshPhysicalMaterial({
            color: accentColor,
            roughness: 0.15,
            transmission: 0.9,
            thickness: 1.0,
            transparent: true,
            opacity: 0.75,
          });
        } else if (materialType === 'matte') {
          material = new THREE.MeshLambertMaterial({
            color: accentColor,
            transparent: true,
            opacity: 0.8,
          });
        } else {
          material = new THREE.MeshBasicMaterial({
            color: accentColor,
            wireframe: materialType === 'wireframe',
            transparent: true,
            opacity: 0.7,
          });
        }

        // 3. Add Mesh
        if (actualGeom !== 'grid') {
          this.mesh3d = new THREE.Mesh(geometry, material);
          if (actualGeom === 'tunnel') {
            this.mesh3d.rotation.x = Math.PI / 2;
          }
          this.scene3d.add(this.mesh3d);
        }

      } else {
        // cinematic TorusKnot
        this.camera3d.position.set(0, 0, 4.5);
        
        const geometry = new THREE.TorusKnotGeometry(0.9, 0.32, 100, 16);
        const material = new THREE.MeshBasicMaterial({
          color: accentColor,
          wireframe: true,
        });
        this.mesh3d = new THREE.Mesh(geometry, material);
        this.scene3d.add(this.mesh3d);
      }
    }

    // Update animations
    const animFrame = frame * speed;

    if (style === 'blueprint' && this.mesh3d) {
      this.mesh3d.rotation.y = animFrame * 0.03;
      this.mesh3d.rotation.x = animFrame * 0.015;
      this.camera3d.position.x = Math.sin(animFrame * 0.01) * 1.5;
    } else if (style === 'custom') {
      const actualGeom = (geometryType === 'torus_knot') ? 'torusKnot'
                       : (geometryType === 'chroma_spheres') ? 'sphere'
                       : (geometryType === 'fluid') ? 'tunnel'
                       : (geometryType === 'particles' || geometryType === 'dna' || geometryType === 'points')
                         ? 'torusKnot'
                         : geometryType;
      const animType = activeMG.animation || 'rotate';

      if (this.mesh3d) {
        if (activeMG.custom_shader && ((this.mesh3d as any).material as THREE.ShaderMaterial).uniforms) {
          ((this.mesh3d as any).material as THREE.ShaderMaterial).uniforms.time.value = animFrame * 0.05;
        }

        if (animType === 'rotate' || animType === 'orbit') {
          this.mesh3d.rotation.y = animFrame * 0.02;
          this.mesh3d.rotation.x = animFrame * 0.01;
        } else if (animType === 'pulse' || animType === 'music_pulse') {
          const s = 1.0 + Math.sin(animFrame * 0.08) * 0.15;
          this.mesh3d.scale.set(s, s, s);
          this.mesh3d.rotation.y = animFrame * 0.01;
        } else if (animType === 'tunnel') {
          this.mesh3d.position.z = (animFrame * 0.08) % 15 - 7.5;
        }
      }

      if (animType === 'orbit') {
        this.camera3d.position.x = Math.sin(animFrame * 0.015) * 4.5;
        this.camera3d.position.z = Math.cos(animFrame * 0.015) * 4.5;
        this.camera3d.lookAt(0, 0, 0);
      } else if (animType === 'float') {
        this.camera3d.position.y = Math.sin(animFrame * 0.02) * 0.4;
        this.camera3d.position.z = 4.5 + Math.cos(animFrame * 0.01) * 0.3;
        this.camera3d.lookAt(0, 0, 0);
      } else if (animType === 'music_pulse' || animType === 'pulse') {
        const pulse = 1.0 + Math.sin(animFrame * 0.08) * 0.12;
        this.camera3d.position.z = 4.5 * pulse;
        this.camera3d.lookAt(0, 0, 0);
      } else if (animType === 'static') {
        this.camera3d.position.set(0, 0, 4.5);
        this.camera3d.lookAt(0, 0, 0);
      } else if (actualGeom === 'grid' && this.gridHelper3d) {
        if (isYoutubeLong) {
          this.camera3d.position.set(0, 0.9, 3.5);
          this.camera3d.lookAt(0, 0.25, 0);
          this.gridHelper3d.position.z = (animFrame * 0.02) % 0.5;
        } else {
          this.camera3d.position.x = Math.sin(animFrame * 0.01) * 3;
          this.camera3d.position.z = Math.cos(animFrame * 0.01) * 3;
          this.camera3d.lookAt(0, 0, 0);
        }
      }
    } else if (this.mesh3d) {
      // cinematic TorusKnot
      this.mesh3d.rotation.x = animFrame * 0.02;
      this.mesh3d.rotation.y = animFrame * 0.035;
      this.mesh3d.rotation.z = animFrame * 0.01;
      this.camera3d.position.set(0, 0, 4.5 - (animFrame * 0.01));
    }

    // Handle Speaker Video Bubble Crop for YouTube Long Preset
    if (isYoutubeLong) {
      if (!this.speakerMesh) {
        const speakerGeom = new THREE.PlaneGeometry(1.5, 1.5);
        this.speakerMaterial = new THREE.ShaderMaterial({
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec2 vUv;
            uniform sampler2D videoTexture;
            uniform float brightness;

            float roundBox(vec2 p, vec2 b, float r) {
              vec2 d = abs(p) - b + vec2(r);
              return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
            }

            void main() {
              vec2 p = vUv - 0.5;
              vec2 size = vec2(0.44, 0.44);
              float r = 0.06;
              float dist = roundBox(p, size, r);
              if (dist > 0.0) {
                discard;
              }
              vec4 color = texture2D(videoTexture, vUv);
              vec3 rgb = color.rgb * brightness;
              float borderWidth = 0.015;
              if (dist > -borderWidth) {
                rgb = vec3(0.96, 0.62, 0.04); // Yellow border (#F59E0B)
              }
              gl_FragColor = vec4(rgb, 1.0);
            }
          `,
          uniforms: {
            videoTexture: { value: this.videoTexture },
            brightness: { value: 1.0 }
          },
          transparent: true,
          depthWrite: true
        });

        this.speakerMesh = new THREE.Mesh(speakerGeom, this.speakerMaterial);
        this.speakerMesh.position.set(0, -0.65, 2.0);
        this.scene3d.add(this.speakerMesh);
      } else {
        if (!this.scene3d.children.includes(this.speakerMesh)) {
          this.scene3d.add(this.speakerMesh);
        }
      }
      if (this.speakerMaterial) {
        this.speakerMaterial.uniforms.brightness.value = settings.brightness;
      }
    } else {
      if (this.speakerMesh) {
        this.scene3d.remove(this.speakerMesh);
      }
    }
  }

  private clear3dScene() {
    if (this.mesh3d) {
      this.scene3d.remove(this.mesh3d);
      this.mesh3d.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.mesh3d = null;
    }
    if (this.speakerMesh) {
      this.scene3d.remove(this.speakerMesh);
    }
    if (this.gridHelper3d) {
      this.scene3d.remove(this.gridHelper3d);
      this.gridHelper3d.geometry.dispose();
      (this.gridHelper3d.material as THREE.Material).dispose();
      this.gridHelper3d = null;
    }
    this.activeStyle = null;
  }

  // Update loop
  public render(settings: ThreeCompositorSettings, elapsed: number, _showTransition: boolean, activeMG?: any) {
    // 1. Update uniforms for color correction
    const targetBrightness = activeMG ? settings.brightness * 0.35 : settings.brightness;
    this.videoMaterial.uniforms.brightness.value = targetBrightness;
    this.videoMaterial.uniforms.contrast.value = settings.contrast;
    this.videoMaterial.uniforms.saturation.value = settings.saturation;
    this.videoMaterial.uniforms.hue.value = settings.hue;
    this.videoMaterial.uniforms.vignette.value = settings.vignette;
    this.videoMaterial.uniforms.filmGrain.value = settings.filmGrain;
    this.videoMaterial.uniforms.time.value = elapsed;
    const crop = settings.coverCrop || { x: 0, y: 0, w: 1, h: 1 };
    this.videoMaterial.uniforms.uCoverCrop.value.set(crop.x, crop.y, crop.w, crop.h);
    const layout = settings.videoLayout || { x: 0, y: 0, w: 1, h: 1 };
    this.videoMesh.scale.set(layout.w, layout.h, 1);
    this.videoMesh.position.set(
      (layout.x + layout.w / 2 - 0.5) * 2,
      (0.5 - (layout.y + layout.h / 2)) * 2,
      0,
    );
    this.overlayMesh.scale.set(1, 1, 1);
    this.overlayMesh.position.set(0, 0, 0);
    this.renderer.setClearColor(0x000000, 1);

    // 2. Apply camera zoom (Scale the video plane or adjust camera zoom)
    this.camera.zoom = settings.zoom;
    this.camera.updateProjectionMatrix();

    // 3. Update the textures
    this.videoTexture.needsUpdate = true;
    this.overlayTexture.needsUpdate = true;

    // 4. Draw the main scenes
    const isYoutubeLong = false;
    const effectiveMG = activeMG;

    // Pass 1: Render Flat video and overlay (keeps autoClear = true to clear the buffer transparently first)
    if (!isYoutubeLong) {
      this.renderer.autoClear = true;
      this.videoMesh.visible = true;
      this.renderer.render(this.scene, this.camera);
    } else {
      this.renderer.autoClear = true;
      this.videoMesh.visible = false;
      this.renderer.setClearColor(0x0a0a0c, 1.0);
      this.renderer.clear();
      // Render overlays (like subtitles) on top of the black frame
      this.renderer.render(this.scene, this.camera);
    }

    // Pass 2: Render 3D Overlay meshes if active (disable autoClear so it draws on top)
    if (effectiveMG) {
      const start = effectiveMG.start || 0;
      const frame = Math.round((elapsed - start) * 30);
      
      this.update3dScene(effectiveMG, frame, isYoutubeLong, settings);
      this.renderer.autoClear = false;
      this.renderer.render(this.scene3d, this.camera3d);
    } else {
      this.clear3dScene();
    }
  }

  public destroy() {
    this.clear3dScene();
    if (this.speakerMesh) {
      this.scene3d.remove(this.speakerMesh);
      this.speakerMesh.geometry.dispose();
      if (this.speakerMaterial) this.speakerMaterial.dispose();
      this.speakerMesh = null;
    }
    this.videoTexture.dispose();
    this.videoMaterial.dispose();
    this.overlayTexture.dispose();
    this.overlayMaterial.dispose();
    this.renderer.dispose();
  }
}
