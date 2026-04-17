import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { backgroundConfigs, backgroundDefaults } from './backgrounds.js';
import { SpeechBubbleLayout, getHtmlTextLength, stripLeadingHtmlWhitespace } from './speechBubbles.js';


export class TextBox {
    constructor(left,top,size,font){

    }
}

function lerp(start, stop, t) {
    return start + (stop - start) * t;
}

function slugifyAssetName(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function resolveBackgroundTransform(slug, backgroundSpec) {
    const config = backgroundConfigs[slug] || {};
    const rawScale = backgroundSpec?.scale ?? config.scale ?? backgroundDefaults.scale;
    const scale = (() => {
        if (rawScale && typeof rawScale === 'object') {
            const x = Number(rawScale.x);
            const y = Number(rawScale.y);
            const z = Number(rawScale.z);
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                return { x, y, z };
            }
        }
        const s = Number(rawScale);
        const uniform = Number.isFinite(s) ? s : (Number(backgroundDefaults.scale) || 1);
        return { x: uniform, y: uniform, z: uniform };
    })();
    const pos = {
        ...backgroundDefaults.position,
        ...(config.position || {}),
        ...(backgroundSpec?.position || {}),
    };
    const rot = {
        ...backgroundDefaults.rotation,
        ...(config.rotation || {}),
        ...(backgroundSpec?.rotation || {}),
    };
    return {
        scale,
        pos,
        rot,
    };
}

const shotTypes = {
    EXTREMELONG: 4.5,
    LONG: 3.5,
    FULL: 2.4,
    MEDIUMLONG: 1.8,
    MEDIUM: 1.3,
    MEDIUMCLOSE: 1.0,
    CLOSE: 0.75,
    EXTREMECLOSE: 0.5,
};
const multiTargetShots = new Set(['EXTREMELONG', 'LONG', 'FULL']);
const adaptiveSingleShots = new Set(['MEDIUM', 'MEDIUMCLOSE', 'CLOSE', 'EXTREMECLOSE']);
const adaptiveShotFraming = {
    MEDIUM: { heightFill: 0.9, widthFill: 0.75, yOffsetMul: 0.12 },
    MEDIUMCLOSE: { heightFill: 1.2, widthFill: 1.0, yOffsetMul: 0.1 },
    CLOSE: { heightFill: 1.9, widthFill: 1.5, yOffsetMul: 0.1 },
    // heightFill 3.0 targets about 1/3 of body height visible in frame.
    EXTREMECLOSE: { heightFill: 3.0, widthFill: 2.4, yOffsetMul: 0.14 },
};


const locsIdx = ["FARLEFT","LEFT","CENTER","RIGHT","FARRIGHT"];
const locations = {
    "FARLEFT": 0,
    "LEFT": 1,
    "CENTER": 2,
    "RIGHT": 3,
    "FARRIGHT": 4
}
const distIdx = ["VERYNEAR","NEAR","MID","FAR","VERYFAR"];
const distances = {
    "VERYNEAR":5.5,
    "NEAR":4,
    "MID":2,
    "FAR":-2,
    "VERYFAR":-9
}
const facingIdx = ["LOOKLEFT","LOOKFRONT","LOOKRIGHT","LOOKBACK"];
const facings = {
    "LOOKLEFT": -Math.PI/2,
    "LOOKFRONT": 0,
    "LOOKRIGHT": Math.PI/2,
    "LOOKBACK": Math.PI
}
const frames = 10;
const EDITOR_BACKGROUND_KEY = '__background__';
const exitFrames = 16;

function normalizeSceneObjects(scene) {
    // console.log(scene);
    const objs = scene?.objects;
    const list = [];
    const byId = {};

    if (!objs) return { list, byId };

    function addObj(obj, fallbackId) {
        if (!obj) return;
        if (typeof obj === 'string') {
            const trimmed = obj.trim();
            const eqIdx = trimmed.indexOf('=');
            let id = fallbackId;
            let spec = trimmed;
            if (eqIdx > 0) {
                id = trimmed.slice(0, eqIdx).trim() || fallbackId;
                spec = trimmed.slice(eqIdx + 1).trim();
            }
            const name = spec.split(/\s+/)[0] || 'obj';
            const normalized = { id, spec, name };
            list.push(normalized);
            byId[id] = normalized;
            return;
        }
        if (typeof obj === 'object') {
            const id = obj.id || obj.name || obj.model || fallbackId;
            const normalized = { ...obj, id };
            list.push(normalized);
            if (id) byId[id] = normalized;
        }
    }

    if (Array.isArray(objs)) {
        objs.forEach((obj, i) => addObj(obj, `obj_${i}`));
    } else if (typeof objs === 'object') {
        Object.entries(objs).forEach(([key, obj]) => addObj(obj, key));
    }

    return { list, byId };
}

function clonePanelSceneData(value) {
    if (!value || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            // fallback below
        }
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return { ...value };
    }
}

export class ThreeScene {
    
    constructor (width,height,canvas) {

        
        let camera = new THREE.PerspectiveCamera( 25, width / height, 0.03, 500 );
        camera.position.set(0,0.8,9);
        camera.lookAt(0,2,-80);



        this.camera = camera;
        let scene = new THREE.Scene();
        this.scene = scene;
        let r = Math.floor(Math.random() * 255);
        let color = new THREE.Color("hsl("+r+", 100%, 50%)");
        r = Math.floor(Math.random() * 255);
        let bg = new THREE.Color("hsl("+r+", 100%, 80%)");
        scene.background = bg
        let renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        this.renderer = renderer;
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize( width, height );

        
        

        let skyColor = 0xB1E1FF;
        let groundColor = 0xB97A20;
        
        let objects = [];
        let light = new THREE.HemisphereLight(skyColor, groundColor, 6);
        objects.push(light);
        scene.add( light );
        // r = Math.max(Math.floor(Math.random() * 5),1);
        // let r2 = Math.max(Math.floor(Math.random() * 5),1);
        // let r3 = Math.max(Math.floor(Math.random() * 5),1);
        // let geometry = new THREE.BoxGeometry( r, r2, r3 );
        // objects.push(geometry);
        // let material = new THREE.MeshLambertMaterial( { color: color } );
        // objects.push(material);
        // let cube = new THREE.Mesh( geometry, material );
        // objects.push(cube);
        // // this.scene.add( cube );
        
        
        // scene.add( cube );
        this.objects = objects;

        let loader = new GLTFLoader();
        this.loader = loader;
        // loader.load('/src/assets/animals/mammoth.obj', (object)=> {
        //     scene.add(object);
        // })

        let models = []
        this.models = models;
        this.modelByKey = new Map();
        this.maxRadius = 0.5;
        this.repulsion = {
            enabled: false,
            strength: 0.01,
            damping: 0.95,
            maxForce: 0.06,
            minRadius: 0.05,
        };
        this.speakerAnim = {
            queue: [],
            index: 0,
            startTime: 0,
            duration: 0,
            active: false,
            paused: false,
            missingLogged: new Set(),
            foundLogged: new Set(),
            cyclePauseUntil: 0,
            currentKey: null,
            startDelayUntil: 0,
        };
        this.lastTime = performance.now();
        this.cameraDefaultPos = camera.position.clone();
        this.cameraDefaultLookTarget = new THREE.Vector3(0, 2, -80);
        this.cameraBasePos = this.cameraDefaultPos.clone();
        this.cameraBaseLookTarget = this.cameraDefaultLookTarget.clone();
        this.mouseTilt = {
            x: 0,
            y: 0,
            maxYaw: 0.1,
            maxPitch: 0.08,
            // maxYaw: 1,
            // maxPitch: 1,
        };
        this.mouseTiltBase = {
            maxYaw: this.mouseTilt.maxYaw,
            maxPitch: this.mouseTilt.maxPitch,
        };
        this.mouseTiltTarget = { x: 0, y: 0 };
        this.mouseTiltLerp = 0.12;
        this.mouseTiltReady = true;
        this.mouseTiltEnabled = true;
        this.cameraSpec = null;
        this.editorEnabled = false;
        this.editorOrbitControls = null;
        this.editorTransformControls = null;
        this.editorTransformHelper = null;
        this.editorRaycaster = new THREE.Raycaster();
        this.editorPointer = new THREE.Vector2();
        this.editorSelectedKey = null;
        this.editorOnChange = null;
        this.editorOnSelect = null;
        this.editorPendingOptions = null;
        this.editorIsDragging = false;
        this.editorPointerDown = null;
        this.editorClickHandler = null;
        this.mouseTiltHandler = (e) => {
            if (!this.mouseTiltEnabled) return;
            const cx = Number(e?.clientX);
            const cy = Number(e?.clientY);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
            const nx = (cx / window.innerWidth) * 2 - 1;
            const ny = (cy / window.innerHeight) * 2 - 1;
            this.mouseTiltTarget.x = Math.max(-1, Math.min(1, nx));
            this.mouseTiltTarget.y = Math.max(-1, Math.min(1, ny));
        };
        window.addEventListener('mousemove', this.mouseTiltHandler, { passive: true, capture: true });
        this.backgroundModel = null;
        this.backgroundToken = 0;
        this.backgroundSourceSpec = null;
        this.shotSpec = null;
        this.pendingShotModels = 0;
        this.waitingForShot = false;
        const size = 10;
        const divisions = 50;
        // const effect = new OutlineEffect( renderer );
        // function render() {
        //     effect.render( scene, camera );
        // }
        // const gridHelper = new THREE.GridHelper( size, divisions );
        // scene.add( gridHelper );
        // objects.push(gridHelper);

        

        // let controls = new OrbitControls( camera, renderer.domElement );
        // this.controls = controls;
        // controls.update();
        




        this.animate = this.animate.bind(this);
        renderer.setAnimationLoop(this.animate);
    }



    animate() {
        const now = performance.now();
        this.lastTime = now;
        if (this.repulsion.enabled && this.models.length > 1) {
            this.applyRepulsion();
        }
        this.updateSpeakerHop(now);
        if (this.editorEnabled && this.editorOrbitControls) {
            this.editorOrbitControls.update();
        } else if (this.mouseTiltReady && this.mouseTiltEnabled) {
            this.applyMouseTilt();
        }
        // this.controls.update();
        this.renderer.render( this.scene, this.camera );
        
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);

    }

    parseVec3(value) {
        if (Array.isArray(value)) {
            const [x, y, z] = value;
            if ([x, y, z].every((n) => Number.isFinite(Number(n)))) {
                return new THREE.Vector3(Number(x), Number(y), Number(z));
            }
            return null;
        }
        if (value && typeof value === 'object') {
            const x = Number(value.x);
            const y = Number(value.y);
            const z = Number(value.z);
            if ([x, y, z].every((n) => Number.isFinite(n))) {
                return new THREE.Vector3(x, y, z);
            }
        }
        return null;
    }

    applyCameraSpec() {
        const spec = this.cameraSpec;
        if (!spec || typeof spec !== 'object') return;
        const pos = this.parseVec3(spec.position);
        const target = this.parseVec3(spec.target);
        if (!pos || !target) return;
        const fov = Number(spec.fov);
        const near = Number(spec.near);
        const far = Number(spec.far);
        if (Number.isFinite(fov) && fov > 1 && fov < 179) this.camera.fov = fov;
        if (Number.isFinite(near) && near > 0) this.camera.near = near;
        if (Number.isFinite(far) && far > this.camera.near) this.camera.far = far;
        this.camera.updateProjectionMatrix();
        this.camera.position.copy(pos);
        this.camera.lookAt(target);
        this.cameraBasePos.copy(pos);
        this.cameraBaseLookTarget = target.clone();
        if (this.editorOrbitControls) {
            this.editorOrbitControls.target.copy(target);
            this.editorOrbitControls.update();
        }
    }

    setCameraSpec(cameraSpec) {
        this.cameraSpec = cameraSpec && typeof cameraSpec === 'object'
            ? clonePanelSceneData(cameraSpec)
            : null;
        if (this.cameraSpec) {
            this.applyCameraSpec();
            return;
        }
        // Camera data is panel-specific. If current scene has no camera override,
        // clear any previous override and fall back to this panel's shot/default.
        if (this.shotSpec) {
            this.applyShotIfReady();
        } else {
            this.resetCameraToDefault();
            if (this.mouseTiltBase) {
                this.mouseTilt.maxYaw = this.mouseTiltBase.maxYaw;
                this.mouseTilt.maxPitch = this.mouseTiltBase.maxPitch;
            }
        }
        if (this.editorOrbitControls) {
            this.editorOrbitControls.target.copy(this.cameraBaseLookTarget);
            this.editorOrbitControls.update();
        }
    }

    getCameraSpecSnapshot() {
        const target = this.editorOrbitControls?.target?.clone() || this.cameraBaseLookTarget.clone();
        return {
            position: [
                Number(this.camera.position.x),
                Number(this.camera.position.y),
                Number(this.camera.position.z),
            ],
            target: [
                Number(target.x),
                Number(target.y),
                Number(target.z),
            ],
            fov: Number(this.camera.fov),
            near: Number(this.camera.near),
            far: Number(this.camera.far),
        };
    }

    parseModelInfo(info){
        // console.log(info);
        let specString = '';
        let explicitPosition = null;
        let explicitRotation = null;
        let explicitScale = null;
        if (typeof info === 'string') {
            const trimmed = info.trim();
            const eqIdx = trimmed.indexOf('=');
            specString = eqIdx > 0 ? trimmed.slice(eqIdx + 1).trim() : trimmed;
        } else if (info && typeof info === 'object') {
            if (typeof info.spec === 'string') {
                specString = info.spec;
            } else if (typeof info.name === 'string' || typeof info.model === 'string') {
                const base = (info.name || info.model).toUpperCase();
                const bits = [
                    base,
                    info.dist?.toUpperCase?.(),
                    info.loc?.toUpperCase?.(),
                    info.facing?.toUpperCase?.(),
                ].filter(Boolean);
                specString = bits.join(' ');
            }
            explicitPosition = this.parseVec3(info.position);
            explicitRotation = this.parseVec3(info.rotation);
            explicitScale = this.parseVec3(info.scale);
        }

        let specs = specString.split(" ").filter(Boolean);
        let file = (specs[0] || '').toLowerCase();
        // file is string name of animal that we add .glb to the end of
        const base = import.meta.env.BASE_URL;
        let filename = base+'assets/animals/'+file+'.glb';
        let dist;
        let distName;
        let locKey = "CENTER";
        let angle;


        for (const spec of specs){
            let s = spec.toUpperCase();
            
            if (distances[s]!== undefined){
                dist = distances[s];
                distName = s;
            }
            else if (facings[s]!== undefined){
                angle = facings[s];
            }
            else if (locations[s]!== undefined){
                locKey = s;
            }
        }
        return {filename, dist, distName, locKey, angle, specString, explicitPosition, explicitRotation, explicitScale};
        
    }

    enableEditorTools(options = {}) {
        if (!this.models.length) {
            // Defer editor setup until at least one model has loaded.
            this.editorPendingOptions = options;
            return;
        }
        if (this.editorEnabled) {
            if (typeof options.onChange === 'function') this.editorOnChange = options.onChange;
            if (typeof options.onSelect === 'function') this.editorOnSelect = options.onSelect;
            return;
        }
        this.editorEnabled = true;
        this.mouseTiltReady = false;
        this.editorOnChange = typeof options.onChange === 'function' ? options.onChange : null;
        this.editorOnSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
        this.editorOrbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        // Keep editor controls precise (less drift, less aggressive movement).
        this.editorOrbitControls.enableDamping = false;
        this.editorOrbitControls.rotateSpeed = 0.45;
        this.editorOrbitControls.zoomSpeed = 0.6;
        this.editorOrbitControls.panSpeed = 0.55;
        this.editorOrbitControls.screenSpacePanning = true;
        this.editorOrbitControls.minDistance = 0;
        this.editorOrbitControls.maxDistance = Infinity;
        this.editorOrbitControls.maxPolarAngle = Math.PI * 0.98;
        // Start from the current camera view (matches what user is seeing),
        // rather than forcing a distant default look target.
        const lookDir = this.camera.getWorldDirection(new THREE.Vector3());
        const lookTarget = this.camera.position.clone().add(lookDir.multiplyScalar(10));
        this.editorOrbitControls.target.copy(lookTarget);
        this.editorOrbitControls.addEventListener('end', () => {
            if (this.editorOnChange) this.editorOnChange();
        });
        this.editorTransformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.editorTransformHelper = this.editorTransformControls.getHelper?.() || null;
        this.editorTransformControls.setMode('translate');
        this.editorTransformControls.setSize(1.2);
        this.editorTransformControls.visible = true;
        this.editorTransformControls.showX = true;
        this.editorTransformControls.showY = true;
        this.editorTransformControls.showZ = true;
        this.editorTransformControls.addEventListener('dragging-changed', (event) => {
            this.editorIsDragging = Boolean(event.value);
            if (this.editorOrbitControls) {
                this.editorOrbitControls.enabled = !event.value;
            }
        });
        this.editorTransformControls.addEventListener('objectChange', () => {
            if (this.editorOnChange) this.editorOnChange();
        });
        if (this.editorTransformHelper?.isObject3D) {
            this.scene.add(this.editorTransformHelper);
        }

        this.editorClickHandler = {
            down: (event) => {
                this.editorPointerDown = {
                    x: Number(event.clientX) || 0,
                    y: Number(event.clientY) || 0,
                };
            },
            up: (event) => {
                if (this.editorIsDragging) return;
                const start = this.editorPointerDown;
                this.editorPointerDown = null;
                if (!start) return;
                const dx = (Number(event.clientX) || 0) - start.x;
                const dy = (Number(event.clientY) || 0) - start.y;
                if ((dx * dx + dy * dy) > 25) return;
                this.selectEditableModelFromPointer(event);
            },
        };
        this.renderer.domElement.addEventListener('pointerdown', this.editorClickHandler.down);
        this.renderer.domElement.addEventListener('pointerup', this.editorClickHandler.up);

        // Initialize orbit target/zoom bounds from currently loaded models.
        this.updateEditorOrbitBounds();

        // If models are already available when editor mode is enabled, attach immediately.
        if (this.models.length && !this.editorTransformControls.object) {
            const firstKey = this.getEditableModelKeys()[0];
            if (firstKey) this.setSelectedEditableModel(firstKey);
        }
    }

    updateEditorOrbitBounds() {
        if (!this.editorOrbitControls || !this.models.length) return;
        const box = new THREE.Box3();
        let has = false;
        for (const model of this.models) {
            if (!model) continue;
            const mbox = new THREE.Box3().setFromObject(model);
            if (!has) {
                box.copy(mbox);
                has = true;
            } else {
                box.union(mbox);
            }
        }
        if (!has) return;
        // Do not retarget camera automatically in editor bounds sync.
        // Retargeting makes initial framing diverge from viewer framing.
    }

    selectEditableModelFromPointer(event) {
        if (!this.editorEnabled) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.editorPointer.set(nx, ny);
        this.editorRaycaster.setFromCamera(this.editorPointer, this.camera);
        const pickables = this.backgroundModel
            ? [this.backgroundModel, ...this.models]
            : this.models;
        const hits = this.editorRaycaster.intersectObjects(pickables, true);
        if (!hits.length) {
            // Clicking empty sky still enters environment selection mode.
            if (this.backgroundModel) {
                this.setSelectedEditableModel(EDITOR_BACKGROUND_KEY);
            } else {
                this.clearSelectedEditableModel(false);
                if (this.editorOnSelect) this.editorOnSelect(EDITOR_BACKGROUND_KEY);
            }
            return;
        }
        const key = this.getModelKeyFromObject(hits[0].object);
        if (!key) {
            if (this.backgroundModel) {
                this.setSelectedEditableModel(EDITOR_BACKGROUND_KEY);
            } else {
                this.clearSelectedEditableModel(false);
                if (this.editorOnSelect) this.editorOnSelect(EDITOR_BACKGROUND_KEY);
            }
            return;
        }
        this.setSelectedEditableModel(key);
    }

    getModelKeyFromObject(object) {
        let node = object;
        while (node) {
            const key = node.userData?.modelKey;
            if (key) return String(key).toLowerCase();
            node = node.parent || null;
        }
        return null;
    }

    setEditorTransformMode(mode = 'translate') {
        if (!this.editorTransformControls) return;
        const m = String(mode || '').toLowerCase();
        const valid = m === 'rotate' || m === 'scale' ? m : 'translate';
        this.editorTransformControls.setMode(valid);
    }

    setSelectedEditableModel(key) {
        const model = this.getModelByKey(key);
        if (!model || !this.editorTransformControls) return false;
        this.editorTransformControls.attach(model);
        this.editorTransformControls.visible = true;
        this.editorTransformControls.showX = true;
        this.editorTransformControls.showY = true;
        this.editorTransformControls.showZ = true;
        this.editorSelectedKey = String(key).toLowerCase();
        if (this.editorOnSelect) this.editorOnSelect(this.editorSelectedKey);
        return true;
    }

    focusEditableModelByKey(key) {
        const model = this.getModelByKey(key);
        if (!model) return false;
        const box = new THREE.Box3().setFromObject(model);
        if (box.isEmpty()) return false;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const vfov = THREE.MathUtils.degToRad(this.camera.fov);
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
        const fitPad = 1.25;
        const distY = (size.y * 0.5 * fitPad) / Math.max(0.001, Math.tan(vfov / 2));
        const distX = (size.x * 0.5 * fitPad) / Math.max(0.001, Math.tan(hfov / 2));
        const distZ = size.z * 0.75;
        const minDistance = this.camera.near + 0.2;
        const distance = Math.max(minDistance, distX, distY, distZ);
        const currentTarget = this.editorOrbitControls?.target?.clone() || this.cameraBaseLookTarget.clone();
        const dir = this.camera.position.clone().sub(currentTarget);
        if (dir.lengthSq() < 1e-8) dir.set(0, 0.2, 1);
        dir.normalize();
        const pos = center.clone().addScaledVector(dir, distance);

        this.camera.position.copy(pos);
        this.camera.lookAt(center);
        this.cameraBasePos.copy(pos);
        this.cameraBaseLookTarget.copy(center);
        if (this.editorOrbitControls) {
            this.editorOrbitControls.target.copy(center);
            this.editorOrbitControls.update();
        }
        return true;
    }

    clearSelectedEditableModel(notify = true) {
        if (!this.editorTransformControls) return;
        this.editorTransformControls.detach();
        this.editorSelectedKey = null;
        if (notify && this.editorOnSelect) this.editorOnSelect(null);
    }

    getEditableModelKeys() {
        const keys = [];
        for (const [key, model] of this.modelByKey.entries()) {
            if (model?.userData?.editorSelectable === false) continue;
            keys.push(key);
        }
        return keys;
    }

    removeEditableModelByKey(key) {
        const norm = String(key || '').toLowerCase();
        if (!norm) return false;
        const model = this.modelByKey.get(norm);
        if (!model) return false;
        if (this.editorTransformControls?.object === model) {
            this.editorTransformControls.detach();
            this.editorSelectedKey = null;
        }
        this.scene.remove(model);
        model.traverse?.((child) => {
            if (!child?.isMesh) return;
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => m?.dispose?.());
                } else {
                    child.material.dispose?.();
                }
            }
        });
        this.modelByKey.delete(norm);
        this.models = this.models.filter((m) => m !== model);
        this.updateEditorOrbitBounds();
        const remaining = this.getEditableModelKeys();
        if (remaining.length) {
            this.setSelectedEditableModel(remaining[0]);
        }
        if (this.editorOnChange) this.editorOnChange();
        return true;
    }

    revertEditableModelTransformByKey(key) {
        const norm = String(key || '').toLowerCase();
        if (!norm) return false;
        const model = this.modelByKey.get(norm);
        if (!model) return false;
        const initial = model.userData?.initialTransform;
        if (!initial) return false;
        model.position.copy(initial.position);
        model.rotation.set(initial.rotation.x, initial.rotation.y, initial.rotation.z);
        model.scale.copy(initial.scale);
        model.userData.baseY = model.position.y;
        model.updateMatrixWorld(true);
        if (this.editorOnChange) this.editorOnChange();
        return true;
    }

    getEditableSceneSnapshot() {
        const objects = [];
        for (const [key, model] of this.modelByKey.entries()) {
            if (!model) continue;
            objects.push({
                id: model.userData?.sourceId || key,
                spec: model.userData?.sourceSpec || '',
                position: [
                    Number(model.position.x.toFixed(4)),
                    Number(model.position.y.toFixed(4)),
                    Number(model.position.z.toFixed(4)),
                ],
                rotation: [
                    Number(model.rotation.x.toFixed(4)),
                    Number(model.rotation.y.toFixed(4)),
                    Number(model.rotation.z.toFixed(4)),
                ],
                scale: [
                    Number(model.scale.x.toFixed(4)),
                    Number(model.scale.y.toFixed(4)),
                    Number(model.scale.z.toFixed(4)),
                ],
            });
        }
        let background = null;
        if (this.backgroundModel) {
            const source = this.backgroundSourceSpec;
            const sourceObj = (source && typeof source === 'object') ? source : {};
            const sourceName = typeof source === 'string'
                ? source
                : (sourceObj.name || sourceObj.model || '');
            background = {
                ...sourceObj,
                name: sourceName || sourceObj.name || '',
                scale: {
                    x: Number(this.backgroundModel.scale.x.toFixed(4)),
                    y: Number(this.backgroundModel.scale.y.toFixed(4)),
                    z: Number(this.backgroundModel.scale.z.toFixed(4)),
                },
                position: {
                    x: Number(this.backgroundModel.position.x.toFixed(4)),
                    y: Number(this.backgroundModel.position.y.toFixed(4)),
                    z: Number(this.backgroundModel.position.z.toFixed(4)),
                },
                rotation: {
                    x: Number(this.backgroundModel.rotation.x.toFixed(4)),
                    y: Number(this.backgroundModel.rotation.y.toFixed(4)),
                    z: Number(this.backgroundModel.rotation.z.toFixed(4)),
                },
            };
        } else if (this.backgroundSourceSpec) {
            const source = this.backgroundSourceSpec;
            const sourceObj = (source && typeof source === 'object') ? source : {};
            const sourceName = typeof source === 'string'
                ? source
                : (sourceObj.name || sourceObj.model || 'none');
            background = {
                ...sourceObj,
                name: String(sourceName || 'none'),
            };
        }

        return {
            objects,
            camera: this.getCameraSpecSnapshot(),
            background,
        };
    }

    addModel(obj){
        let {filename, dist, distName, locKey, angle, specString, explicitPosition, explicitRotation, explicitScale} = this.parseModelInfo(obj);
        // console.log(filename);
        // console.log(dist);
        // console.log(locKey);
        // let file = obj.model;
        // let pos = obj.position;
        // let scale = obj.scale;
        // let rotation = obj.rotation;
        // if (rotation) {
        //     rotation.forEach((v,i) => rotation[i] = v*Math.PI/4);
        //     console.log(rotation);
        // }
    
        // let filename = '/src/assets/animals/'+file+'.glb';
        // console.log(filename);
        let loader = this.loader;
        let scene = this.scene;
        let models = this.models;
        const modelKey = this.getModelKey(obj);
        const sourceId = (() => {
            if (obj && typeof obj === 'object' && obj.id) return String(obj.id);
            if (typeof obj === 'string') {
                const trimmed = obj.trim();
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) return trimmed.slice(0, eqIdx).trim();
            }
            return modelKey || null;
        })();
        this.pendingShotModels += 1;
        this.mouseTiltReady = false;
        loader.load( filename, ( gltf ) => {
            let model = gltf.scene;
            scene.add( model );
            model.scale.set(1,1,1);
                
            const xPos = this.getScreenXForLocation(locKey, distName);
            if (typeof dist === 'number') {
                const alignedX = this.screenXToWorldX(model, xPos, dist);
                if (typeof alignedX === 'number') {
                    model.position.x = alignedX;
                }
                model.position.y = 0;
                model.position.z = dist;
                model.rotation.set(0,angle,0);
            }
            if (explicitPosition) {
                model.position.copy(explicitPosition);
            }
            if (explicitRotation) {
                model.rotation.set(explicitRotation.x, explicitRotation.y, explicitRotation.z);
            }
            if (explicitScale) {
                model.scale.set(explicitScale.x, explicitScale.y, explicitScale.z);
            }
            model.userData.layout = { dist, distName, locKey, angle };
            model.userData.sourceSpec = specString || '';
            model.userData.modelKey = modelKey || null;
            model.userData.sourceId = sourceId || null;
            model.userData.editorSelectable = true;
            model.userData.initialTransform = {
                position: model.position.clone(),
                rotation: new THREE.Euler(model.rotation.x, model.rotation.y, model.rotation.z),
                scale: model.scale.clone(),
            };
            models.push(model);
            if (modelKey) {
                this.modelByKey.set(modelKey, model);
            }
            const box = new THREE.Box3().setFromObject(model);
            const sphere = new THREE.Sphere();
            box.getBoundingSphere(sphere);
            const radius = sphere.radius || this.repulsion.minRadius;
            model.userData.radius = Math.max(radius, this.repulsion.minRadius);
            model.userData.vx = 0;
            model.userData.vz = 0;
            model.userData.baseY = model.position.y;
            model.userData.height = box.max.y - box.min.y;
            model.userData.localMinY = box.min.y - model.position.y;
            this.maxRadius = Math.max(this.maxRadius, model.userData.radius);
            this.pendingShotModels = Math.max(0, this.pendingShotModels - 1);
            if (this.shotSpec && this.pendingShotModels === 0 && this.waitingForShot) {
                this.waitingForShot = false;
                this.applyShotIfReady();
            }
            if (this.pendingShotModels === 0) {
                this.mouseTiltReady = true;
            }
            if (this.editorEnabled) {
                this.updateEditorOrbitBounds();
                if (this.editorTransformControls && !this.editorTransformControls.object && modelKey) {
                    this.setSelectedEditableModel(modelKey);
                }
                // In editor mode, model creation should immediately propagate to
                // the passage's dirty scene text state.
                if (this.editorOnChange) this.editorOnChange();
            }
            if (!this.editorEnabled && this.editorPendingOptions && this.models.length > 0) {
                const pending = this.editorPendingOptions;
                this.editorPendingOptions = null;
                this.enableEditorTools(pending);
            }

        }, undefined, function ( error ) {

            console.error( error );

        } );
    }

    setBackground(backgroundSpec) {
        if (!backgroundSpec) {
            this.clearBackground();
            return;
        }
        const currentSource = (this.backgroundSourceSpec && typeof this.backgroundSourceSpec === 'object')
            ? { ...this.backgroundSourceSpec }
            : {};
        this.backgroundSourceSpec = (backgroundSpec && typeof backgroundSpec === 'object')
            ? { ...currentSource, ...backgroundSpec }
            : backgroundSpec;
        const name = typeof backgroundSpec === 'string'
            ? backgroundSpec
            : backgroundSpec.name || backgroundSpec.model || '';
        if (String(name || '').trim().toLowerCase() === 'none') {
            this.backgroundSourceSpec = {
                ...currentSource,
                ...(typeof this.backgroundSourceSpec === 'object' ? this.backgroundSourceSpec : {}),
                name: 'none',
            };
            this.clearBackground(true);
            return;
        }
        const slug = slugifyAssetName(name);
        if (!slug) {
            this.backgroundSourceSpec = {
                ...currentSource,
                ...(typeof this.backgroundSourceSpec === 'object' ? this.backgroundSourceSpec : {}),
                name: 'none',
            };
            this.clearBackground(true);
            return;
        }

        const base = import.meta.env.BASE_URL;
        const filename = `${base}assets/backgrounds/${slug}.glb`;
        const token = ++this.backgroundToken;

        this.clearBackground(true);

        this.loader.load(filename, (gltf) => {
            if (token !== this.backgroundToken) return;
            const model = gltf.scene;
            this.backgroundModel = model;
            this.scene.add(model);

            const {
                scale,
                pos,
                rot,
            } = resolveBackgroundTransform(slug, backgroundSpec);
            model.scale.set(scale.x, scale.y, scale.z);
            model.position.set(pos.x, pos.y, pos.z);
            model.rotation.set(rot.x, rot.y, rot.z);
            model.userData.editorSelectable = true;
            model.userData.modelKey = EDITOR_BACKGROUND_KEY;
            model.traverse((child) => {
                if (!child?.isObject3D) return;
                child.userData.editorSelectable = true;
                child.userData.modelKey = EDITOR_BACKGROUND_KEY;
            });
        }, undefined, (error) => {
            console.error(error);
        });
    }

    clearBackground(preserveSourceSpec = false) {
        if (!this.backgroundModel) {
            if (!preserveSourceSpec) this.backgroundSourceSpec = null;
            return;
        }
        const model = this.backgroundModel;
        if (this.editorSelectedKey === EDITOR_BACKGROUND_KEY) {
            this.clearSelectedEditableModel();
        }
        this.scene.remove(model);
        model.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach((m) => m.dispose && m.dispose());
                    } else if (child.material.dispose) {
                        child.material.dispose();
                    }
                }
            }
        });
        this.backgroundModel = null;
        if (!preserveSourceSpec) this.backgroundSourceSpec = null;
    }

    setSkyColor(skyColor) {
        const raw = String(skyColor || '').trim();
        if (!raw) return;
        try {
            this.scene.background = new THREE.Color(raw);
        } catch (err) {
            // Ignore invalid authored values.
        }
    }

    parseShotSpec(spec) {
        if (!spec) return null;
        if (typeof spec === 'object') {
            const token = String(spec.type || spec.shot || '').toUpperCase().trim();
            const targets = Array.isArray(spec.targets) ? spec.targets : [];
            if (!shotTypes[token] || targets.length === 0) return null;
            return { token, targets };
        }
        const parts = String(spec).trim().split(/\s+/);
        if (parts.length < 2) return null;
        const token = parts[0].toUpperCase();
        if (!shotTypes[token]) return null;
        const targets = parts.slice(1);
        return { token, targets };
    }

    getTargetsBounds(targets) {
        const box = new THREE.Box3();
        let has = false;
        for (const raw of targets) {
            const key = String(raw || '').toLowerCase();
            const model = this.getModelByKey(key);
            if (!model) continue;
            const mbox = new THREE.Box3().setFromObject(model);
            if (!has) {
                box.copy(mbox);
                has = true;
            } else {
                box.union(mbox);
            }
        }
        if (!has) return null;
        return box;
    }

    resetCameraToDefault() {
        if (!this.cameraDefaultPos || !this.cameraDefaultLookTarget) return;
        this.camera.position.copy(this.cameraDefaultPos);
        this.camera.lookAt(this.cameraDefaultLookTarget);
        this.cameraBasePos.copy(this.cameraDefaultPos);
        this.cameraBaseLookTarget = this.cameraDefaultLookTarget.clone();
    }

    relayoutModelsForScreen() {
        this.resetCameraToDefault();
        for (const model of this.models) {
            const layout = model?.userData?.layout;
            if (!layout || typeof layout.dist !== 'number') continue;
            const xPos = this.getScreenXForLocation(layout.locKey || 'CENTER', layout.distName);
            const alignedX = this.screenXToWorldX(model, xPos, layout.dist);
            if (typeof alignedX === 'number') {
                model.position.x = alignedX;
            }
            model.position.z = layout.dist;
            if (typeof layout.angle === 'number') {
                model.rotation.set(0, layout.angle, 0);
            }
        }
    }

    applyShotIfReady() {
        if (!this.shotSpec) return;
        this.relayoutModelsForScreen();
        const parsed = this.parseShotSpec(this.shotSpec);
        if (!parsed) return;
        const token = parsed.token;
        let targets = parsed.targets;
        if (!multiTargetShots.has(token) && targets.length > 1) {
            targets = targets.slice(0, 1);
        }
        const box = this.getTargetsBounds(targets);
        if (!box) return;
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const height = Math.max(0.001, size.y);
        const width = Math.max(0.001, Math.max(size.x, size.z));
        const vfov = THREE.MathUtils.degToRad(this.camera.fov);
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
        let distance;
        let yOffset;

        if (adaptiveSingleShots.has(token) && targets.length === 1) {
            const cfg = adaptiveShotFraming[token] || adaptiveShotFraming.MEDIUM;
            const distanceForHeight = (height / 2) / (Math.tan(vfov / 2) * Math.max(0.1, cfg.heightFill));
            const distanceForWidth = (width / 2) / (Math.tan(hfov / 2) * Math.max(0.1, cfg.widthFill));
            distance = Math.max(distanceForHeight, distanceForWidth);
            yOffset = height * cfg.yOffsetMul + 0.15;
        } else {
            const scale = shotTypes[token] || 1.5;
            const framing = height * scale;
            distance = (framing / 2) / Math.tan(vfov / 2);
            yOffset = height * 0.2 + 0.2;
        }
        // Keep camera in front of the nearest model surface to avoid near-plane clipping.
        const halfDepth = Math.max(0.001, size.z * 0.5);
        const clipSafety = Math.max(0.08, Math.max(size.x, size.y) * 0.03);
        const minDistance = halfDepth + this.camera.near + clipSafety;
        distance = Math.max(distance, minDistance);
        const pos = new THREE.Vector3(center.x, center.y + yOffset, center.z + distance);

        this.camera.position.copy(pos);
        this.cameraBasePos.copy(pos);
        this.cameraBaseLookTarget = center.clone();
        this.camera.lookAt(center);

        const baseYaw = this.mouseTiltBase?.maxYaw ?? this.mouseTilt.maxYaw;
        const basePitch = this.mouseTiltBase?.maxPitch ?? this.mouseTilt.maxPitch;
        const shotScale = shotTypes[token] || 1.5;
        const tiltScale = Math.max(0.6, Math.min(2.2, 1.4 / shotScale));
        this.mouseTilt.maxYaw = baseYaw * tiltScale;
        this.mouseTilt.maxPitch = basePitch * tiltScale;
        if (this.cameraSpec) {
            this.applyCameraSpec();
        }
    }

    setShot(shotSpec) {
        this.shotSpec = shotSpec && typeof shotSpec === 'object'
            ? clonePanelSceneData(shotSpec)
            : (shotSpec || null);
        if (!this.shotSpec) {
            if (!this.cameraSpec) {
                this.resetCameraToDefault();
            }
            if (this.mouseTiltBase) {
                this.mouseTilt.maxYaw = this.mouseTiltBase.maxYaw;
                this.mouseTilt.maxPitch = this.mouseTiltBase.maxPitch;
            }
            this.waitingForShot = false;
            if (this.pendingShotModels === 0) {
                this.mouseTiltReady = true;
            }
            return;
        }
        if (this.pendingShotModels > 0) {
            this.waitingForShot = true;
            this.mouseTiltReady = false;
            return;
        }
        this.waitingForShot = false;
        this.applyShotIfReady();
        if (this.cameraSpec) {
            this.applyCameraSpec();
        }
        this.mouseTiltReady = true;
    }

    setMouseTiltEnabled(enabled) {
        this.mouseTiltEnabled = Boolean(enabled);
        if (!this.mouseTiltEnabled) {
            this.mouseTilt.x = 0;
            this.mouseTilt.y = 0;
            this.mouseTiltTarget.x = 0;
            this.mouseTiltTarget.y = 0;
            // Ensure camera remains on current base framing when tilt is disabled.
            this.camera.lookAt(this.cameraBaseLookTarget);
        }
    }

    getModelKey(obj) {
        if (!obj) return null;
        if (typeof obj === 'string') {
            const trimmed = obj.trim();
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
                const key = trimmed.slice(0, eqIdx).trim();
                return key ? key.toLowerCase() : null;
            }
            const token = trimmed.split(/\s+/)[0] || '';
            return token ? token.toLowerCase() : null;
        }
        if (typeof obj === 'object') {
            const raw = obj.id || obj.name || obj.model || '';
            return raw ? String(raw).toLowerCase() : null;
        }
        return null;
    }

    getModelByKey(key) {
        if (!key) return null;
        const norm = String(key).toLowerCase();
        if (norm === EDITOR_BACKGROUND_KEY) return this.backgroundModel || null;
        return this.modelByKey.get(norm) || null;
    }

    getModelBoundsByKey(key) {
        const model = this.getModelByKey(key);
        if (!model) return null;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const top = new THREE.Vector3(center.x, box.max.y, center.z);
        return { box, size, center, top };
    }

    worldToScreen(position) {
        const canvas = this.renderer.domElement;
        const width = canvas.clientWidth || canvas.width;
        const height = canvas.clientHeight || canvas.height;
        this.camera.updateMatrixWorld?.(true);
        const vector = position.clone().project(this.camera);
        return {
            x: (vector.x + 1) * 0.5 * width,
            y: (-vector.y + 1) * 0.5 * height,
        };
    }

    screenXToWorldX(object, screenX, depthZ) {
        if (!object || typeof screenX !== 'number' || typeof depthZ !== 'number') return;
        const canvas = this.renderer.domElement;
        const width = canvas.clientWidth || canvas.width;
        const height = canvas.clientHeight || canvas.height;
        if (!width || !height) return;

        const ndcX = (screenX / width) * 2 - 1;
        const projected = object.position.clone().project(this.camera);
        const ndcY = projected.y;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -depthZ);
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, hit)) {
            return hit.x;
        }
    }

    getScreenXForLocation(locKey, distName) {
        const canvas = this.renderer.domElement;
        const width = canvas.clientWidth || canvas.width;
        if (!width) return 0;

        const slots = locsIdx.length;
        const paddingRatio = 0.12;
        const padding = width * paddingRatio;
        const usable = Math.max(0, width - padding * 2);
        const step = slots > 1 ? usable / (slots - 1) : 0;
        const idx = locations[locKey] ?? locations.CENTER;

        return padding + step * idx;
    }

    applyRepulsion() {
        const cellSize = Math.max(this.maxRadius * 2, 1);
        const grid = new Map();
        const models = this.models;

        for (let i = 0; i < models.length; i++) {
            const m = models[i];
            if (!m) continue;
            const cx = Math.floor(m.position.x / cellSize);
            const cz = Math.floor(m.position.z / cellSize);
            const key = `${cx},${cz}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(i);
        }

        for (let i = 0; i < models.length; i++) {
            const a = models[i];
            if (!a) continue;
            const ax = a.position.x;
            const az = a.position.z;
            const ar = a.userData.radius || this.repulsion.minRadius;
            const acx = Math.floor(ax / cellSize);
            const acz = Math.floor(az / cellSize);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const key = `${acx + dx},${acz + dz}`;
                    const bucket = grid.get(key);
                    if (!bucket) continue;
                    for (const j of bucket) {
                        if (j <= i) continue;
                        const b = models[j];
                        if (!b) continue;
                        const bx = b.position.x;
                        const bz = b.position.z;
                        const br = b.userData.radius || this.repulsion.minRadius;
                        let dxv = bx - ax;
                        let dzv = bz - az;
                        let dist = Math.hypot(dxv, dzv);
                        const minDist = ar + br;
                        if (dist === 0) {
                            dxv = (Math.random() - 0.5) * 0.01;
                            dzv = (Math.random() - 0.5) * 0.01;
                            dist = Math.hypot(dxv, dzv);
                        }
                        if (dist < minDist) {
                            const overlap = minDist - dist;
                            const force = Math.min(this.repulsion.maxForce, overlap * this.repulsion.strength);
                            const nx = dxv / dist;
                            const nz = dzv / dist;
                            a.userData.vx = (a.userData.vx || 0) - nx * force;
                            a.userData.vz = (a.userData.vz || 0) - nz * force;
                            b.userData.vx = (b.userData.vx || 0) + nx * force;
                            b.userData.vz = (b.userData.vz || 0) + nz * force;
                        }
                    }
                }
            }
        }

        for (const m of models) {
            if (!m) continue;
            m.userData.vx = (m.userData.vx || 0) * this.repulsion.damping;
            m.userData.vz = (m.userData.vz || 0) * this.repulsion.damping;
            m.position.x += m.userData.vx;
            m.position.z += m.userData.vz;
        }
    }

    applyMouseTilt() {
        this.mouseTilt.x = lerp(this.mouseTilt.x, this.mouseTiltTarget.x, this.mouseTiltLerp);
        this.mouseTilt.y = lerp(this.mouseTilt.y, this.mouseTiltTarget.y, this.mouseTiltLerp);
        const yaw = -this.mouseTilt.x * this.mouseTilt.maxYaw;
        const pitch = -this.mouseTilt.y * this.mouseTilt.maxPitch;
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0));
        const baseDist = this.cameraBasePos.distanceTo(this.cameraBaseLookTarget);
        const lookScale = Math.max(0.5, baseDist * 0.05);
        const lookTarget = this.cameraBaseLookTarget.clone().add(dir.multiplyScalar(lookScale));
        this.camera.lookAt(lookTarget);
    }

    setSpeakerQueue(speakers) {
        const queue = [];
        for (const s of speakers || []) {
            const key = String(s.speaker || '').trim();
            const length = getHtmlTextLength(s.html || '');
            queue.push({ key, length });
        }
        this.speakerAnim.queue = queue;
        this.speakerAnim.index = 0;
        this.speakerAnim.startTime = 0;
        this.speakerAnim.duration = 0;
        this.speakerAnim.active = queue.length > 0;
        if (queue.length) {
            this.speakerAnim.startDelayUntil = performance.now() + 1000;
        } else {
            this.speakerAnim.startDelayUntil = 0;
        }
    }

    setSpeakerAnimationPaused(paused) {
        const anim = this.speakerAnim;
        anim.paused = Boolean(paused);
        if (!anim.paused) return;
        for (const model of this.models) {
            if (!model?.userData) continue;
            if (Number.isFinite(model.userData.baseY)) {
                model.position.y = model.userData.baseY;
            }
            model.userData.speaking = false;
        }
        if (anim.currentKey) {
            const current = this.getModelByKey(anim.currentKey);
            if (current?.userData) current.userData.speaking = false;
        }
    }

    updateSpeakerHop(now) {
        const anim = this.speakerAnim;
        if (anim.paused) return;
        if (!anim.active || anim.queue.length === 0) return;
        if (anim.startDelayUntil && now < anim.startDelayUntil) return;
        if (anim.cyclePauseUntil && now < anim.cyclePauseUntil) return;

        const current = anim.queue[anim.index];
        const selectedKey = String(this.editorSelectedKey || '').toLowerCase();
        const currentKey = String(current?.key || '').toLowerCase();
        if (selectedKey && currentKey && selectedKey === currentKey) {
            const selectedModel = this.getModelByKey(current.key);
            if (selectedModel?.userData) {
                if (Number.isFinite(selectedModel.userData.baseY)) {
                    selectedModel.position.y = selectedModel.userData.baseY;
                }
                selectedModel.userData.speaking = false;
                selectedModel.updateMatrixWorld(true);
            }
            const nextIndex = (anim.index + 1) % anim.queue.length;
            anim.index = nextIndex;
            anim.startTime = 0;
            anim.duration = 0;
            anim.baseY = undefined;
            anim.currentKey = null;
            anim.cyclePauseUntil = now + 120;
            return;
        }
        const model = this.getModelByKey(current.key);
        if (!model) {
            if (this.models.length > 0 && !anim.missingLogged.has(current.key)) {
                console.warn('[speaker hop] model not found for key:', current.key, 'available:', Array.from(this.modelByKey.keys()));
                anim.missingLogged.add(current.key);
            }
            if (this.models.length > 0) {
                anim.index = (anim.index + 1) % anim.queue.length;
                anim.startTime = now;
                anim.duration = 0;
            }
            return;
        }
        if (anim.currentKey && anim.currentKey !== current.key) {
            const prev = this.getModelByKey(anim.currentKey);
            if (prev && prev.userData) prev.userData.speaking = false;
        }
        anim.currentKey = current.key;
        if (model.userData) model.userData.speaking = true;
        if (!anim.foundLogged.has(current.key)) {
            // console.log('[speaker hop] animating key:', current.key);
            anim.foundLogged.add(current.key);
        }
        // console.log(model);
        if (!model) {
            anim.index = (anim.index + 1) % anim.queue.length;
            anim.startTime = now;
            anim.duration = 0;
            return;
        }

        if (!anim.startTime) {
            // Capture the current resting height when this line starts so
            // editor/model transforms are preserved and not snapped back.
            anim.baseY = model.position.y;
            model.userData.baseY = anim.baseY;
            anim.startTime = now;
            const base = 140;
            const perChar = 10;
            anim.duration = Math.min(2200, Math.max(500, base + current.length * perChar));
        }

        const elapsed = now - anim.startTime;
        const t = Math.min(1, elapsed / anim.duration);
        const hops = Math.max(2, Math.round(anim.duration / 320));
        const phase = t * Math.PI * hops;
        const height = model.userData.height || 1;
        const amp = Math.max(0.15, Math.min(1.0, height * 0.1));
        const hop = Math.abs(Math.sin(phase)) * amp;
        const baseY = Number.isFinite(anim.baseY) ? anim.baseY : (model.userData.baseY ?? model.position.y);
        model.position.y = baseY + hop;
        model.updateMatrixWorld(true);

        if (elapsed >= anim.duration) {
            model.position.y = baseY;
            if (model.userData) model.userData.speaking = false;
            const nextIndex = (anim.index + 1) % anim.queue.length;
            const gap = 500;
            anim.cyclePauseUntil = now + gap;
            anim.index = nextIndex;
            anim.startTime = 0;
            anim.duration = 0;
            anim.baseY = undefined;
        }
    }

    dispose() {
        if (this.mouseTiltHandler) {
            window.removeEventListener('mousemove', this.mouseTiltHandler, true);
        }
        if (this.editorClickHandler?.down) {
            this.renderer.domElement.removeEventListener('pointerdown', this.editorClickHandler.down);
        }
        if (this.editorClickHandler?.up) {
            this.renderer.domElement.removeEventListener('pointerup', this.editorClickHandler.up);
        }
        this.editorClickHandler = null;
        if (this.editorTransformControls) {
            try { this.editorTransformControls.detach(); } catch {}
            if (this.editorTransformHelper) {
                this.scene.remove(this.editorTransformHelper);
            }
            this.editorTransformControls.dispose?.();
            this.editorTransformControls = null;
            this.editorTransformHelper = null;
        }
        if (this.editorOrbitControls) {
            this.editorOrbitControls.dispose?.();
            this.editorOrbitControls = null;
        }
        this.editorEnabled = false;
    }

}

export class Panel {
    constructor(curr, target, id, text, linked, scene, textType = 'narration', topInset = 0) {
        // console.log("make panel");
        // let curr = {left: left, top: top, width: width, height: height};
        // let target = {left: left, top: top, width: width, height: height};
        this.data = curr;
        this.target = target;
        this.id = id;
        this.text = text;
        this.textType = textType;
        this.topInset = topInset;
        this.isUpdating = true;
        this.movingToTarget = {left:true, top:true, width:true, height:true};
        this.linked = linked;
        this.onScreen = true;
        this.isAnimatingOut = false;
        this.isDeleted = false;

        // console.log(this.data);
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = `${curr.left}px`;
        this.canvas.style.top = `${curr.top}px`;
        this.canvas.style.width = `${curr.width}px`;
        this.canvas.style.height = `${curr.height}px`;
        this.canvas.style.display = 'block';
        this.canvas.style.zIndex = '20';
        this.canvas.style.pointerEvents = 'auto';
        this.canvas.style.transformOrigin = 'center center';
        this.canvas.style.transition = 'transform 120ms ease';
        this.canvas.dataset.panelId = String(this.id);
        document.body.appendChild(this.canvas);

        this.textEl = document.createElement('div');
        this.textEl.className = 'panel-text';
        this.textEl.style.left = `${curr.left}px`;
        this.textEl.style.top = `${curr.top}px`;
        this.textEl.style.width = `${curr.width}px`;
        this.textEl.style.height = `${curr.height}px`;
        this.textEl.style.fontSize = '16.8px';
        this.textEl.style.lineHeight = '20.16px';
        this.textEl.innerHTML = this.text || '';
        this.textEl.style.transformOrigin = 'center center';
        this.textEl.style.transition = 'transform 120ms ease';
        this.textEl.dataset.panelId = String(this.id);
        document.body.appendChild(this.textEl);

        this.narrationEl = document.createElement('div');
        this.narrationEl.className = 'panel-narration';
        this.narrationEl.style.left = `${curr.left}px`;
        this.narrationEl.style.top = `${curr.top}px`;
        this.narrationEl.style.width = `${curr.width}px`;
        this.narrationEl.style.fontSize = '16.8px';
        this.narrationEl.style.lineHeight = '20.16px';
        this.narrationEl.innerHTML = this.text || '';
        this.narrationEl.style.transformOrigin = 'center center';
        this.narrationEl.style.transition = 'transform 120ms ease';
        this.narrationEl.dataset.panelId = String(this.id);
        this.narrationBgEl = document.createElement('div');
        this.narrationBgEl.className = 'panel-narration-bg';
        this.narrationBgEl.style.position = 'absolute';
        this.narrationBgEl.style.left = `${curr.left}px`;
        this.narrationBgEl.style.top = `${curr.top}px`;
        this.narrationBgEl.style.width = `${curr.width}px`;
        this.narrationBgEl.style.height = '0px';
        this.narrationBgEl.style.background = '#000';
        this.narrationBgEl.style.pointerEvents = 'none';
        this.narrationBgEl.style.transformOrigin = 'center center';
        this.narrationBgEl.style.transition = 'transform 120ms ease';
        this.narrationBgEl.dataset.panelId = String(this.id);
        document.body.appendChild(this.narrationBgEl);
        document.body.appendChild(this.narrationEl);

        this.speechEls = [];
        this.speakers = [];
        this.speechLayout = new SpeechBubbleLayout(this);

        this.baseSize = {width: curr.width, height: curr.height};
        this.baseFontSize = 16.8;
        this.baseLineHeight = 20.16;
        this.narrationData = {left: curr.left, top: curr.top};
        this.narrationTarget = {left: curr.left, top: curr.top};
        this.narrationMinTop = null;
        this.narrationFixedTop = null;
        this.aspectMode = 'free';
        this.fixedNarrationReserve = 0;
        this.layerBaseZ = 100;
        this.speechLayerBaseZ = 300;
        this.speechBounds = null;
        this.isHovered = false;
        this.hoverScale = 1;
        this.setLayerPriority(0, false);
        this.updateTextMode();
        this.renderText();
        
        
        // this.three.addModel('rat');
        this.makeScene(scene);
        
    }

    makeScene(scene){
        this.three = new ThreeScene(this.data.width, this.data.height, this.canvas);
        const normalized = normalizeSceneObjects(scene);
        this.sceneObjects = normalized.byId;
        for (const obj of normalized.list){
            if (obj){
                this.three.addModel(obj);
            }
        }
        if (scene?.background) {
            this.three.setBackground(scene.background);
        }
        if (scene?.skyColor) {
            this.three.setSkyColor(scene.skyColor);
        }
        if (scene?.shot) {
            this.three.setShot(scene.shot);
        }
        this.three.setCameraSpec(scene?.camera || null);
    }

    getSceneObjectModelToken(obj) {
        const parsed = this.three?.parseModelInfo?.(obj);
        const spec = String(parsed?.specString || '').trim();
        if (spec) return spec.split(/\s+/)[0]?.toLowerCase() || '';
        if (obj && typeof obj === 'object') {
            return String(obj.model || obj.name || '').trim().toLowerCase();
        }
        if (typeof obj === 'string') {
            const rhs = obj.includes('=') ? obj.split('=').slice(1).join('=').trim() : obj.trim();
            return rhs.split(/\s+/)[0]?.toLowerCase() || '';
        }
        return '';
    }

    syncSceneObjects(normalized) {
        if (!this.three) return;
        const desiredById = normalized?.byId || {};
        const desiredKeys = new Set(Object.keys(desiredById).map((k) => String(k || '').toLowerCase()).filter(Boolean));
        const currentKeys = this.three.getEditableModelKeys?.() || [];

        for (const key of currentKeys) {
            const norm = String(key || '').toLowerCase();
            if (!desiredKeys.has(norm)) {
                this.three.removeEditableModelByKey?.(norm);
            }
        }

        for (const [rawKey, obj] of Object.entries(desiredById)) {
            const key = String(rawKey || '').toLowerCase();
            if (!key) continue;
            const existing = this.three.getModelByKey?.(key);
            if (!existing) {
                this.three.addModel(obj);
                continue;
            }

            const oldToken = this.getSceneObjectModelToken(existing.userData?.sourceSpec || '');
            const newToken = this.getSceneObjectModelToken(obj);
            if (newToken && oldToken && newToken !== oldToken) {
                this.three.removeEditableModelByKey?.(key);
                this.three.addModel(obj);
                continue;
            }

            const parsed = this.three.parseModelInfo?.(obj);
            if (parsed?.explicitPosition) {
                existing.position.copy(parsed.explicitPosition);
            } else if (typeof parsed?.dist === 'number') {
                const xPos = this.three.getScreenXForLocation(parsed.locKey, parsed.distName);
                const alignedX = this.three.screenXToWorldX(existing, xPos, parsed.dist);
                if (typeof alignedX === 'number') existing.position.x = alignedX;
                existing.position.y = 0;
                existing.position.z = parsed.dist;
            }
            if (parsed?.explicitRotation) {
                existing.rotation.set(parsed.explicitRotation.x, parsed.explicitRotation.y, parsed.explicitRotation.z);
            } else if (Number.isFinite(parsed?.angle)) {
                existing.rotation.set(0, parsed.angle, 0);
            }
            if (parsed?.explicitScale) {
                existing.scale.set(parsed.explicitScale.x, parsed.explicitScale.y, parsed.explicitScale.z);
            }

            existing.userData.layout = {
                dist: parsed?.dist,
                distName: parsed?.distName,
                locKey: parsed?.locKey,
                angle: parsed?.angle,
            };
            existing.userData.sourceSpec = parsed?.specString || existing.userData?.sourceSpec || '';
            existing.userData.sourceId = (obj && typeof obj === 'object' && obj.id)
                ? String(obj.id)
                : (existing.userData?.sourceId || key);
            existing.userData.baseY = existing.position.y;
            existing.updateMatrixWorld(true);

            const box = new THREE.Box3().setFromObject(existing);
            const sphere = new THREE.Sphere();
            box.getBoundingSphere(sphere);
            existing.userData.radius = Math.max(sphere.radius || this.three.repulsion.minRadius, this.three.repulsion.minRadius);
            existing.userData.height = box.max.y - box.min.y;
            existing.userData.localMinY = box.min.y - existing.position.y;
        }
    }

    setScene(scene){
        const normalized = normalizeSceneObjects(scene);
        this.sceneObjects = normalized.byId;
        this.syncSceneObjects(normalized);
        if (scene?.background) {
            this.three.setBackground(scene.background);
        } else {
            this.three.setBackground(null);
        }
        if (scene?.skyColor) {
            this.three.setSkyColor(scene.skyColor);
        }
        if (scene?.shot) {
            this.three.setShot(scene.shot);
        } else {
            this.three.setShot(null);
        }
        this.three.setCameraSpec(scene?.camera || null);
    }
    
    getData() {
        return this.data;
    }

    

    resize(width, height, scaleText = true) {
        this.data.width = width;
        this.data.height = height;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.textEl.style.width = `${width}px`;
        this.textEl.style.height = `${height}px`;
        this.narrationEl.style.width = `${width}px`;
        if (scaleText) {
            const scale = width / this.baseSize.width;
            this.textEl.style.fontSize = `${this.baseFontSize * scale}px`;
            this.textEl.style.lineHeight = `${this.baseLineHeight * scale}px`;
            this.narrationEl.style.fontSize = `${this.baseFontSize}px`;
            this.narrationEl.style.lineHeight = `${this.baseLineHeight}px`;
        } else {
            this.textEl.style.fontSize = `${this.baseFontSize}px`;
            this.textEl.style.lineHeight = `${this.baseLineHeight}px`;
            this.narrationEl.style.fontSize = `${this.baseFontSize}px`;
            this.narrationEl.style.lineHeight = `${this.baseLineHeight}px`;
        }
        this.applySpeechTypography();
        if (this.isUpdating) {
            // During panel animation, avoid rebuilding bubble DOM each frame.
            // Reposition existing elements only to prevent vertical jostle.
            this.updateTextMode();
            this.updateNarrationTarget();
            this.positionSpeechBubbles();
        } else {
            this.renderText();
        }
        const reserve = this.textType === 'narration' ? (this.fixedNarrationReserve || 0) : 0;
        this.three.resize(width, Math.max(40, height - reserve));
        
        

    }

    getSpeechTypography() {
        const baseW = Math.max(1, this.baseSize?.width || this.data.width || 1);
        const baseH = Math.max(1, this.baseSize?.height || this.data.height || 1);
        const wScale = Math.max(0.1, this.data.width / baseW);
        const hScale = Math.max(0.1, this.data.height / baseH);
        const panelScale = Math.min(wScale, hScale);
        const speechScale = Math.max(0.68, Math.min(1, panelScale));
        const fontSize = Math.max(11.5, this.baseFontSize * 0.9 * speechScale);
        const lineHeight = Math.max(14, this.baseLineHeight * 0.9 * speechScale);
        return { fontSize, lineHeight };
    }

    applySpeechTypography() {
        const { fontSize, lineHeight } = this.getSpeechTypography();
        for (const el of this.speechEls) {
            el.style.fontSize = `${fontSize}px`;
            el.style.lineHeight = `${lineHeight}px`;
        }
    }

    move(left,top){
        this.data.left = left;
        this.data.top = top;
        this.canvas.style.left = `${left}px`;
        this.canvas.style.top = `${top}px`;
        this.textEl.style.left = `${left}px`;
        this.textEl.style.top = `${top}px`;
        this.updateNarrationTarget();
    }

    setCurr(data, scaleText = true){
        let t = data;
        this.target = t;
        this.move(t.left,t.top);
        this.resize(t.width,t.height, scaleText);
        if (this.textType === 'narration') {
            this.updateNarrationTarget();
            this.narrationData.left = this.narrationTarget.left;
            this.narrationData.top = this.narrationTarget.top;
            this.narrationEl.style.left = `${this.narrationData.left}px`;
            this.narrationEl.style.top = `${this.narrationData.top}px`;
        }
    }
    
    setTarget(data, options = {}){
        this.target = data;
        const explicitAnimateOut = Boolean(options?.animateOut);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const isOffscreenTarget =
            (data.left + data.width < 0) ||
            (data.top + data.height < this.topInset) ||
            (data.left > w) ||
            (data.top > h);
        const nextAnimatingOut = explicitAnimateOut || Boolean(isOffscreenTarget);
        if (nextAnimatingOut && !this.isAnimatingOut) {
            this.isAnimatingOut = true;
            this.speechLayout.freezeForPanelExit();
            this.three?.setSpeakerAnimationPaused?.(true);
        } else if (!nextAnimatingOut && this.isAnimatingOut) {
            this.isAnimatingOut = false;
            this.speechLayout.clearExitFreeze();
            this.three?.setSpeakerAnimationPaused?.(false);
        }
        this.updateNarrationTarget();
        this.startUpdates();
    }


    moveToTarget(){
        
        
        const frameBudget = this.isAnimatingOut ? exitFrames : frames;
        const rate = 1 - Math.pow(0.1, 1 / frameBudget);
        const snapEpsilon = 1;
        const c = this.data;
        const t = this.target;

        let wwidth = window.innerWidth;
        let wheight = window.innerHeight;
        const next = { left: c.left, top: c.top, width: c.width, height: c.height };
        const updateAxis = (axis) => {
            if (!this.movingToTarget[axis]) return;
            const current = c[axis];
            const target = t[axis];
            next[axis] = lerp(current, target, rate);
        };
        updateAxis('left');
        updateAxis('top');
        updateAxis('width');
        updateAxis('height');

        if (next.left !== c.left || next.top !== c.top) {
            this.move(next.left, next.top);
        }
        if (next.width !== c.width || next.height !== c.height) {
            this.resize(next.width, next.height);
        }

        if (this.textType === 'narration') {
            this.updateNarrationTarget();
            this.narrationData.left = this.narrationTarget.left;
            this.narrationData.top = this.narrationTarget.top;
            this.narrationEl.style.left = `${this.narrationData.left}px`;
            this.narrationEl.style.top = `${this.narrationData.top}px`;
        }

        const done =
            Math.abs(c.left - t.left) < snapEpsilon &&
            Math.abs(c.top - t.top) < snapEpsilon &&
            Math.abs(c.width - t.width) < snapEpsilon &&
            Math.abs(c.height - t.height) < snapEpsilon;
        if (done) {
            this.move(t.left, t.top);
            this.resize(t.width, t.height);
            this.movingToTarget = {left:false, top:false, width:false, height:false};
            // console.log(this.id + " is done updating");
            this.isUpdating = false;
        }
        
        if (c.left+c.width<0 || c.top+c.height<0 || c.left>wwidth || c.top>wheight){
            // console.log("off screen")
            this.isUpdating = false;
            this.onScreen = false;
            this.canvas.style.display = 'none';
            this.textEl.style.display = 'none';
            this.narrationBgEl.style.display = 'none';
            this.narrationEl.style.display = 'none';
            for (const el of this.speechEls) el.style.display = 'none';
            this.stopUpdates();
            return;
        }
    }
    

    stopUpdates(){
        this.isUpdating = false;
        this.movingToTarget = {left:false, top:false, width:false, height:false};
        this.isAnimatingOut = false;
        this.speechLayout.clearExitFreeze();
        this.three?.setSpeakerAnimationPaused?.(false);
    }
    startUpdates(){
        this.onScreen = true;
        this.isUpdating = true;
        this.canvas.style.display = 'block';
        this.narrationBgEl.style.display = 'block';
        this.updateTextMode();
        this.three.renderer.setAnimationLoop(this.three.animate);
        this.movingToTarget = {left:true, top:true, width:true, height:true};
    }

    update(){
        
        if (!this.isUpdating) {
            // console.log(this.linked);
            this.positionSpeechBubbles();
            return this.linked;
        }
        this.moveToTarget();
        this.positionSpeechBubbles();
        return -1;
    }
    setLink(i){
        this.linked = i;
    }

    setTxt(txt){
        this.text = txt;
        this.renderText();
    }

    setSpeakers(speakers) {
        // console.log(speakers);
        this.speakers = Array.isArray(speakers) ? speakers : [];
        if (this.three && this.three.setSpeakerQueue) {
            this.three.setSpeakerQueue(this.speakers);
        }
        if (this.speakers.length) {
            this.three.renderer.setAnimationLoop(this.three.animate);
        }
        this.renderText();
    }

    delete(){
        if (this.isDeleted) return;
        this.isDeleted = true;
        this.canvas.remove();
        this.textEl.remove();
        this.narrationBgEl?.remove();
        this.narrationEl.remove();
        for (const el of this.speechEls) el.remove();
        if (this.three?.renderer) {
            this.three.dispose?.();
            this.three.renderer.setAnimationLoop(null);
            this.three.renderer.dispose();
        }
        for (let obj in this.three.objects){
            if (!obj.isMesh) return;
                obj.geometry.dispose();
                if (obj.material.isMaterial) {
                    cleanMaterial(object.material);
                } else {
                    for (const material of obj.material) cleanMaterial(material);
                }
        }
    }

    
    
    updateTextMode(){
        const hasNarration = getHtmlTextLength(this.text || '') > 0;
        if (this.textType === 'dialogue') {
            this.textEl.style.display = 'block';
            this.narrationBgEl.style.display = 'none';
            this.narrationEl.style.display = 'none';
            for (const el of this.speechEls) el.style.display = 'none';
        } else {
            this.textEl.style.display = 'none';
            this.narrationBgEl.style.display = hasNarration ? 'block' : 'none';
            this.narrationEl.style.display = hasNarration ? 'block' : 'none';
            for (const el of this.speechEls) el.style.display = this.speakers.length ? 'block' : 'none';
        }
    }

    syncNarrationBackground(){
        if (!this.narrationBgEl || !this.narrationEl) return;
        this.narrationBgEl.style.left = this.narrationEl.style.left;
        this.narrationBgEl.style.top = this.narrationEl.style.top;
        this.narrationBgEl.style.width = this.narrationEl.style.width;
        const rect = this.narrationEl.getBoundingClientRect();
        this.narrationBgEl.style.height = `${Math.max(0, rect.height)}px`;
    }

    updateNarrationTarget(){
        if (this.textType !== 'narration') return;

        const panelRef = this.data;
        const width = Math.max(80, panelRef.width);
        const height = Math.max(80, panelRef.height);

        this.narrationEl.style.left = `${panelRef.left}px`;
        this.narrationEl.style.top = `${panelRef.top}px`;
        this.narrationEl.style.width = `${width}px`;

        const hasNarration = getHtmlTextLength(this.text || '') > 0;
        let reserve = 0;

        if (!hasNarration) {
            this.narrationEl.style.maxHeight = '0px';
            this.narrationEl.style.overflow = 'hidden';
            this.narrationEl.style.display = 'none';
            this.narrationBgEl.style.display = 'none';
        } else {
            this.narrationEl.style.display = 'block';
            this.narrationBgEl.style.display = 'block';

            const style = window.getComputedStyle(this.narrationEl);
            const parsePx = (value, fallback = 0) => {
                const n = parseFloat(value);
                return Number.isFinite(n) ? n : fallback;
            };
            const lineHeight = parsePx(style.lineHeight, this.baseLineHeight);
            const boxChromeHeight =
                parsePx(style.paddingTop) +
                parsePx(style.paddingBottom) +
                parsePx(style.borderTopWidth) +
                parsePx(style.borderBottomWidth);
            const oneLineHeight = Math.max(0, lineHeight + boxChromeHeight);
            const threeLineHeight = Math.max(0, lineHeight * 3 + boxChromeHeight);

            this.narrationEl.style.maxHeight = '';
            this.narrationEl.style.overflowX = 'hidden';
            this.narrationEl.style.overflowY = 'visible';
            const naturalHeight = this.narrationEl.getBoundingClientRect().height;
            const cap = Math.max(oneLineHeight, Math.min(threeLineHeight, naturalHeight));
            reserve = Math.min(height - 40, Math.max(oneLineHeight, cap));

            this.narrationEl.style.maxHeight = `${Math.max(0, reserve)}px`;
            this.narrationEl.style.overflowX = 'hidden';
            this.narrationEl.style.overflowY = naturalHeight > reserve ? 'auto' : 'hidden';
        }

        this.fixedNarrationReserve = Math.max(0, reserve);
        this.narrationTarget.left = panelRef.left;
        this.narrationTarget.top = panelRef.top;
        this.narrationData.left = panelRef.left;
        this.narrationData.top = panelRef.top;
        this.narrationEl.style.left = `${this.narrationData.left}px`;
        this.narrationEl.style.top = `${this.narrationData.top}px`;

        const canvasTop = panelRef.top + this.fixedNarrationReserve;
        const canvasHeight = Math.max(40, height - this.fixedNarrationReserve);
        this.canvas.style.left = `${panelRef.left}px`;
        this.canvas.style.top = `${canvasTop}px`;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${canvasHeight}px`;
        this.textEl.style.left = `${panelRef.left}px`;
        this.textEl.style.top = `${canvasTop}px`;
        this.textEl.style.width = `${width}px`;
        this.textEl.style.height = `${canvasHeight}px`;
        if (this.three) this.three.resize(width, canvasHeight);

        this.syncNarrationBackground();
    }

    setTopInset(inset){
        this.topInset = inset || 0;
        this.updateNarrationTarget();
    }

    setSpeechBounds(bounds){
        if (!bounds || typeof bounds !== 'object') {
            this.speechBounds = null;
            return;
        }
        const left = Number(bounds.left);
        const top = Number(bounds.top);
        const right = Number(bounds.right);
        const bottom = Number(bounds.bottom);
        if (![left, top, right, bottom].every((n) => Number.isFinite(n))) {
            this.speechBounds = null;
            return;
        }
        this.speechBounds = { left, top, right, bottom };
    }

    setNarrationMinTop(minTop){
        this.narrationMinTop = Number.isFinite(minTop) ? minTop : null;
        this.updateNarrationTarget();
    }

    setNarrationFixedTop(fixedTop){
        this.narrationFixedTop = Number.isFinite(fixedTop) ? fixedTop : null;
        this.updateNarrationTarget();
    }

    setAspectMode(mode){
        this.aspectMode = mode === 'fixed' ? 'fixed' : 'free';
        this.updateNarrationTarget();
    }

    setLayerPriority(order, isSelected = false){
        const o = Number.isFinite(order) ? order : 0;
        const base = 100 + o * 1000;
        this.layerBaseZ = base;
        this.speechLayerBaseZ = base + (isSelected ? 900 : 220);
        this.canvas.style.zIndex = `${base + 100}`;
        this.textEl.style.zIndex = `${base + 120}`;
        this.narrationBgEl.style.zIndex = `${base + 130}`;
        this.narrationEl.style.zIndex = `${base + 140}`;
        for (const el of this.speechEls) {
            el.style.zIndex = `${this.speechLayerBaseZ}`;
        }
    }

    setHovered(isHovered){
        const next = Boolean(isHovered);
        if (this.isHovered === next) return;
        this.isHovered = next;
        // Disable transform-scaling hover to keep worldToScreen-derived bubble tails
        // and bubble bodies aligned with rendered model positions.
        this.hoverScale = 1;
        const t = 'none';
        this.canvas.style.transform = t;
        this.textEl.style.transform = t;
        this.narrationBgEl.style.transform = t;
        this.narrationEl.style.transform = t;
    }

    syncNarrationPosition(){
        if (this.textType !== 'narration') return;
        this.updateNarrationTarget();
        this.narrationData.left = this.narrationTarget.left;
        this.narrationData.top = this.narrationTarget.top;
        this.narrationEl.style.left = `${this.narrationData.left}px`;
        this.narrationEl.style.top = `${this.narrationData.top}px`;
        this.syncNarrationBackground();
    }

    renderText(){
        this.textEl.innerHTML = this.text || '';
        this.narrationEl.innerHTML = this.text || '';
        this.renderSpeechBubbles();
        this.updateTextMode();
        this.updateNarrationTarget();
        this.positionSpeechBubbles();
    }

    renderSpeechBubbles(){
        for (const el of this.speechEls) el.remove();
        this.speechEls = [];
        const speechType = this.getSpeechTypography();
        const speakers = this.speakers || [];
        for (const entry of speakers) {
            const el = document.createElement('div');
            el.className = 'panel-speech';
            el.dataset.panelId = String(this.id);
            el.style.width = 'auto';
            el.style.fontSize = `${speechType.fontSize}px`;
            el.style.lineHeight = `${speechType.lineHeight}px`;
            const body = document.createElement('div');
            body.className = 'speech-body';
            const measure = document.createElement('div');
            measure.className = 'speech-content-measure';
            measure.innerHTML = stripLeadingHtmlWhitespace(entry.html || '');
            const content = document.createElement('div');
            content.className = 'speech-content';
            content.innerHTML = stripLeadingHtmlWhitespace(entry.html || '');
            const tailBorder = document.createElement('span');
            tailBorder.className = 'speech-tail-border';
            const tail = document.createElement('span');
            tail.className = 'speech-tail';
            body.appendChild(measure);
            el.appendChild(tailBorder);
            el.appendChild(body);
            el.appendChild(tail);
            el.appendChild(content);
            document.body.appendChild(el);
            this.speechEls.push(el);
            el.style.zIndex = `${this.speechLayerBaseZ}`;
            el.style.transformOrigin = 'center center';
            el.style.transition = 'width 160ms ease, max-width 160ms ease';
            el.style.transform = 'none';
        }
        this.speechLayout.sync(this.speechEls, this.speakers);
    }

    positionSpeechBubbles(){
        this.speechLayout.sync(this.speechEls, this.speakers);
        this.speechLayout.layout();
    }

}
