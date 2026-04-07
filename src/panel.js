import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { backgroundConfigs, backgroundDefaults } from './backgrounds.js';


export class TextBox {
    constructor(left,top,size,font){

    }
}

function lerp(start, stop, t) {
    return start + (stop - start) * t;
}

function stripLeadingHtmlWhitespace(html) {
    if (!html) return '';
    const container = document.createElement('div');
    container.innerHTML = html;

    while (container.firstChild) {
        const node = container.firstChild;
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
            container.removeChild(node);
            continue;
        }
        if (node.nodeType === Node.TEXT_NODE) {
            const trimmed = node.nodeValue.replace(/^\s+/, '');
            if (trimmed.length === 0) {
                container.removeChild(node);
                continue;
            }
            node.nodeValue = trimmed;
        }
        break;
    }

    let htmlOut = container.innerHTML;
    htmlOut = htmlOut.replace(/^(?:\s|&nbsp;|&#160;)+/gi, '');
    htmlOut = htmlOut.replace(/^(?:<br\s*\/?>\s*)+/gi, '');
    return htmlOut;
}

function getHtmlTextLength(html) {
    if (!html) return 0;
    const el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || '').trim().length;
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
    const scale = backgroundSpec?.scale ?? config.scale ?? backgroundDefaults.scale;
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
    const snap = backgroundSpec?.snapToBackground ?? config.snapToBackground ?? backgroundDefaults.snapToBackground;
    const snapGridRadius = backgroundSpec?.snapGridRadius ?? config.snapGridRadius ?? backgroundDefaults.snapGridRadius;
    const snapGridStep = backgroundSpec?.snapGridStep ?? config.snapGridStep ?? backgroundDefaults.snapGridStep;
    const snapRayHeight = backgroundSpec?.snapRayHeight ?? config.snapRayHeight ?? backgroundDefaults.snapRayHeight;
    const snapMaxDelta = backgroundSpec?.snapMaxDelta ?? config.snapMaxDelta ?? backgroundDefaults.snapMaxDelta;
    const snapDebug = backgroundSpec?.snapDebug ?? config.snapDebug ?? backgroundDefaults.snapDebug;
    const snapMaxY = backgroundSpec?.snapMaxY ?? config.snapMaxY ?? backgroundDefaults.snapMaxY;
    const snapPreferHighest = backgroundSpec?.snapPreferHighest ?? config.snapPreferHighest ?? backgroundDefaults.snapPreferHighest;
    const snapIncludeNames = backgroundSpec?.snapIncludeNames ?? config.snapIncludeNames ?? backgroundDefaults.snapIncludeNames;
    const snapExcludeNames = backgroundSpec?.snapExcludeNames ?? config.snapExcludeNames ?? backgroundDefaults.snapExcludeNames;
    return {
        scale,
        pos,
        rot,
        snap,
        snapGridRadius,
        snapGridStep,
        snapRayHeight,
        snapMaxDelta,
        snapDebug,
        snapMaxY,
        snapPreferHighest,
        snapIncludeNames,
        snapExcludeNames,
    };
}


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

function normalizeSceneObjects(scene) {
    console.log(scene);
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

export class ThreeScene {
    
    constructor (width,height,canvas) {

        
        let camera = new THREE.PerspectiveCamera( 25, width / height, 0.1, 500 );
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
            missingLogged: new Set(),
            foundLogged: new Set(),
            cyclePauseUntil: 0,
        };
        this.lastTime = performance.now();
        this.cameraBasePos = camera.position.clone();
        this.cameraBaseLook = new THREE.Vector3(0, 2, -80);
        this.mouseTilt = {
            x: 0,
            y: 0,
            maxYaw: 0.015,
            maxPitch: 0.01,
            // maxYaw: 1,
            // maxPitch: 1,
        };
        this.mouseTiltTarget = { x: 0, y: 0 };
        this.mouseTiltLerp = 0.12;
        window.addEventListener('mousemove', (e) => {
            const nx = (e.clientX / window.innerWidth) * 2 - 1;
            const ny = (e.clientY / window.innerHeight) * 2 - 1;
            this.mouseTiltTarget.x = Math.max(-1, Math.min(1, nx));
            this.mouseTiltTarget.y = Math.max(-1, Math.min(1, ny));
        });
        this.backgroundModel = null;
        this.backgroundToken = 0;
        this.backgroundMeshes = [];
        this.backgroundSnap = false;
        this.backgroundRaycaster = new THREE.Raycaster();
        this.backgroundRayOrigin = new THREE.Vector3();
        this.backgroundRayDir = new THREE.Vector3(0, -1, 0);
        this.backgroundRayMaxHeight = backgroundDefaults.snapRayHeight;
        this.backgroundSnapMaxDelta = backgroundDefaults.snapMaxDelta;
        this.backgroundSnapDebug = backgroundDefaults.snapDebug;
        this.backgroundSnapMaxY = backgroundDefaults.snapMaxY;
        this.backgroundSnapPreferHighest = backgroundDefaults.snapPreferHighest;
        this.backgroundSnapIncludeNames = backgroundDefaults.snapIncludeNames;
        this.backgroundSnapExcludeNames = backgroundDefaults.snapExcludeNames;
        this.backgroundSnapGridRadius = backgroundDefaults.snapGridRadius;
        this.backgroundSnapGridStep = backgroundDefaults.snapGridStep;
        this.mouseTiltReady = !this.backgroundSnap;
        this.pendingSnapModels = 0;
        this.snapWaitModels = new Set();
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
        if (this.mouseTiltReady) {
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

    parseModelInfo(info){
        // console.log(info);
        let specString = '';
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
        return {filename, dist, distName, locKey, angle};
        
    }

    addModel(obj){
        let {filename, dist, distName, locKey, angle} = this.parseModelInfo(obj);
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
        if (this.backgroundSnap) {
            this.pendingSnapModels += 1;
            this.mouseTiltReady = false;
        }
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
            if (this.backgroundSnap) {
                if (this.backgroundMeshes.length) {
                    this.snapModelToBackground(model);
                    this.pendingSnapModels = Math.max(0, this.pendingSnapModels - 1);
                    if (this.pendingSnapModels === 0) {
                        this.mouseTiltReady = true;
                    }
                } else {
                    this.snapWaitModels.add(model);
                }
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
        const name = typeof backgroundSpec === 'string'
            ? backgroundSpec
            : backgroundSpec.name || backgroundSpec.model || '';
        const slug = slugifyAssetName(name);
        if (!slug) return;

        const base = import.meta.env.BASE_URL;
        const filename = `${base}assets/backgrounds/${slug}.glb`;
        const token = ++this.backgroundToken;

        this.clearBackground();

        this.loader.load(filename, (gltf) => {
            if (token !== this.backgroundToken) return;
            const model = gltf.scene;
            this.backgroundModel = model;
            this.scene.add(model);

            const {
                scale,
                pos,
                rot,
                snap,
                snapGridRadius,
                snapGridStep,
                snapRayHeight,
                snapMaxDelta,
                snapDebug,
                snapMaxY,
                snapPreferHighest,
                snapIncludeNames,
                snapExcludeNames,
            } = resolveBackgroundTransform(slug, backgroundSpec);
            model.scale.set(scale, scale, scale);
            model.position.set(pos.x, pos.y, pos.z);
            model.rotation.set(rot.x, rot.y, rot.z);

            this.backgroundMeshes = [];
            model.traverse((child) => {
                if (child.isMesh) this.backgroundMeshes.push(child);
            });
            this.backgroundSnap = Boolean(snap);
            this.backgroundSnapGridRadius = snapGridRadius ?? backgroundDefaults.snapGridRadius;
            this.backgroundSnapGridStep = snapGridStep ?? backgroundDefaults.snapGridStep;
            this.backgroundRayMaxHeight = snapRayHeight ?? backgroundDefaults.snapRayHeight;
            this.backgroundSnapMaxDelta = snapMaxDelta ?? backgroundDefaults.snapMaxDelta;
            this.backgroundSnapDebug = Boolean(snapDebug);
            this.backgroundSnapMaxY = snapMaxY ?? backgroundDefaults.snapMaxY;
            this.backgroundSnapPreferHighest = Boolean(snapPreferHighest);
            this.backgroundSnapIncludeNames = Array.isArray(snapIncludeNames) ? snapIncludeNames : [];
            this.backgroundSnapExcludeNames = Array.isArray(snapExcludeNames) ? snapExcludeNames : [];
            if (this.backgroundSnap) {
                this.snapAllModelsToBackground();
            } else {
                this.pendingSnapModels = 0;
                this.snapWaitModels.clear();
                this.mouseTiltReady = true;
            }
        }, undefined, (error) => {
            console.error(error);
        });
    }

    clearBackground() {
        if (!this.backgroundModel) {
            this.backgroundMeshes = [];
            this.backgroundSnap = false;
            this.pendingSnapModels = 0;
            this.snapWaitModels.clear();
            this.mouseTiltReady = true;
            this.backgroundSnapMaxDelta = backgroundDefaults.snapMaxDelta;
            this.backgroundSnapDebug = backgroundDefaults.snapDebug;
            this.backgroundSnapMaxY = backgroundDefaults.snapMaxY;
            this.backgroundSnapPreferHighest = backgroundDefaults.snapPreferHighest;
            this.backgroundSnapIncludeNames = backgroundDefaults.snapIncludeNames;
            this.backgroundSnapExcludeNames = backgroundDefaults.snapExcludeNames;
            return;
        }
        const model = this.backgroundModel;
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
        this.backgroundMeshes = [];
        this.backgroundSnap = false;
        this.pendingSnapModels = 0;
        this.snapWaitModels.clear();
        this.mouseTiltReady = true;
        this.backgroundSnapMaxDelta = backgroundDefaults.snapMaxDelta;
        this.backgroundSnapDebug = backgroundDefaults.snapDebug;
        this.backgroundSnapMaxY = backgroundDefaults.snapMaxY;
        this.backgroundSnapPreferHighest = backgroundDefaults.snapPreferHighest;
        this.backgroundSnapIncludeNames = backgroundDefaults.snapIncludeNames;
        this.backgroundSnapExcludeNames = backgroundDefaults.snapExcludeNames;
    }

    getBackgroundHitY(x, z, referenceY = null) {
        if (!this.backgroundMeshes.length) return null;
        this.backgroundRayOrigin.set(x, this.backgroundRayMaxHeight, z);
        this.backgroundRaycaster.set(this.backgroundRayOrigin, this.backgroundRayDir);
        const hits = this.backgroundRaycaster.intersectObjects(this.backgroundMeshes, true);
        if (this.backgroundSnapDebug) {
            const sample = hits.slice(0, 5).map((hit) => ({
                name: hit.object?.name || '(unnamed)',
                y: Number(hit.point.y.toFixed(3)),
            }));
            console.log('[snap] hits', { x: Number(x.toFixed(2)), z: Number(z.toFixed(2)), referenceY, sample });
        }
        if (!hits.length) return null;
        const maxY = Number(this.backgroundSnapMaxY);
        const includeNames = this.backgroundSnapIncludeNames || [];
        const excludeNames = this.backgroundSnapExcludeNames || [];
        let filteredHits = hits;
        if (includeNames.length) {
            filteredHits = filteredHits.filter((hit) => {
                const name = (hit.object?.name || '').toLowerCase();
                return includeNames.some((needle) => name.includes(String(needle).toLowerCase()));
            });
        }
        if (excludeNames.length) {
            filteredHits = filteredHits.filter((hit) => {
                const name = (hit.object?.name || '').toLowerCase();
                return !excludeNames.some((needle) => name.includes(String(needle).toLowerCase()));
            });
        }
        if (Number.isFinite(maxY)) {
            filteredHits = filteredHits.filter((hit) => hit.point.y <= maxY);
        }
        if (!filteredHits.length) return null;
        if (this.backgroundSnapPreferHighest) {
            let highestY = filteredHits[0].point.y;
            for (let i = 1; i < filteredHits.length; i += 1) {
                if (filteredHits[i].point.y > highestY) highestY = filteredHits[i].point.y;
            }
            if (Number.isFinite(referenceY)) {
                const maxDelta = Number(this.backgroundSnapMaxDelta);
                if (Number.isFinite(maxDelta) && highestY > referenceY && Math.abs(highestY - referenceY) > maxDelta) {
                    return null;
                }
            }
            return highestY;
        }
        let chosenY = hits[0].point.y;
        if (Number.isFinite(referenceY)) {
            const belowHits = [];
            const tolerance = 0.5;
            for (let i = 0; i < filteredHits.length; i += 1) {
                if (filteredHits[i].point.y <= referenceY + tolerance) {
                    belowHits.push(filteredHits[i].point.y);
                }
            }
            if (belowHits.length) {
                chosenY = Math.max(...belowHits);
                return chosenY;
            }
            let bestDist = Math.abs(chosenY - referenceY);
            for (let i = 1; i < filteredHits.length; i += 1) {
                const dy = Math.abs(filteredHits[i].point.y - referenceY);
                if (dy < bestDist) {
                    bestDist = dy;
                    chosenY = filteredHits[i].point.y;
                }
            }
            const maxDelta = Number(this.backgroundSnapMaxDelta);
            if (Number.isFinite(maxDelta) && Math.abs(chosenY - referenceY) > maxDelta) {
                return null;
            }
            return chosenY;
        }
        let highestY = filteredHits[0].point.y;
        for (let i = 1; i < filteredHits.length; i += 1) {
            if (filteredHits[i].point.y > highestY) highestY = filteredHits[i].point.y;
        }
        return highestY;
    }

    snapModelToBackground(model) {
        if (!model || !this.backgroundSnap) return;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const hitY = this.getBackgroundHitY(center.x, center.z, box.min.y);
        const targetY = typeof hitY === 'number' ? hitY : 0;
        const localMinY = Number.isFinite(model.userData.localMinY)
            ? model.userData.localMinY
            : (box.min.y - model.position.y);
        const nextY = targetY - localMinY;
        if (!Number.isFinite(nextY)) return;
        model.position.y = nextY;
        model.userData.baseY = model.position.y;
    }

    snapAllModelsToBackground() {
        if (!this.backgroundSnap) return;
        for (const model of this.models) {
            this.snapModelToBackground(model);
        }
        const waitingCount = this.snapWaitModels.size;
        if (waitingCount) {
            this.snapWaitModels.clear();
            this.pendingSnapModels = Math.max(0, this.pendingSnapModels - waitingCount);
        }
        if (this.pendingSnapModels === 0) {
            this.mouseTiltReady = true;
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
        return this.modelByKey.get(String(key).toLowerCase()) || null;
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
        const lookTarget = this.cameraBasePos.clone().add(dir.multiplyScalar(10));
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
    }

    updateSpeakerHop(now) {
        const anim = this.speakerAnim;
        if (!anim.active || anim.queue.length === 0) return;
        if (anim.cyclePauseUntil && now < anim.cyclePauseUntil) return;

        const current = anim.queue[anim.index];
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
        if (!anim.foundLogged.has(current.key)) {
            console.log('[speaker hop] animating key:', current.key);
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
        const baseY = model.userData.baseY ?? model.position.y;
        model.position.y = baseY + hop;
        model.updateMatrixWorld(true);

        if (elapsed >= anim.duration) {
            model.position.y = baseY;
            const nextIndex = (anim.index + 1) % anim.queue.length;
            if (nextIndex === 0) {
                anim.cyclePauseUntil = now + 400;
            }
            anim.index = nextIndex;
            anim.startTime = 0;
            anim.duration = 0;
        }
    }

}

export class Panel {
    constructor(curr, target, id, text, linked, scene, textType = 'narration', topInset = 0) {
        console.log("make panel");
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

        console.log(this.data);
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = `${curr.left}px`;
        this.canvas.style.top = `${curr.top}px`;
        this.canvas.style.width = `${curr.width}px`;
        this.canvas.style.height = `${curr.height}px`;
        this.canvas.style.display = 'block';
        this.canvas.style.zIndex = '20';
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
        document.body.appendChild(this.textEl);

        this.narrationEl = document.createElement('div');
        this.narrationEl.className = 'panel-narration';
        this.narrationEl.style.left = `${curr.left}px`;
        this.narrationEl.style.top = `${curr.top}px`;
        this.narrationEl.style.width = `${window.innerWidth}px`;
        this.narrationEl.style.fontSize = '16.8px';
        this.narrationEl.style.lineHeight = '20.16px';
        this.narrationEl.innerHTML = this.text || '';
        document.body.appendChild(this.narrationEl);

        this.speechEls = [];
        this.speakers = [];

        this.baseSize = {width: curr.width, height: curr.height};
        this.baseFontSize = 16.8;
        this.baseLineHeight = 20.16;
        this.narrationData = {left: curr.left, top: curr.top};
        this.narrationTarget = {left: curr.left, top: curr.top};
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
    }

    setScene(scene){
        const normalized = normalizeSceneObjects(scene);
        this.sceneObjects = normalized.byId;
        if (scene?.background) {
            this.three.setBackground(scene.background);
        } else {
            this.three.setBackground(null);
        }
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
        this.narrationEl.style.width = `${window.innerWidth}px`;
        if (scaleText) {
            const scale = width / this.baseSize.width;
            this.textEl.style.fontSize = `${this.baseFontSize * scale}px`;
            this.textEl.style.lineHeight = `${this.baseLineHeight * scale}px`;
            this.narrationEl.style.fontSize = `${this.baseFontSize}px`;
            this.narrationEl.style.lineHeight = `${this.baseLineHeight}px`;
        for (const el of this.speechEls) {
            el.style.fontSize = `${this.baseFontSize * 0.9}px`;
            el.style.lineHeight = `${this.baseLineHeight * 0.9}px`;
        }
        } else {
            this.textEl.style.fontSize = `${this.baseFontSize}px`;
            this.textEl.style.lineHeight = `${this.baseLineHeight}px`;
            this.narrationEl.style.fontSize = `${this.baseFontSize}px`;
            this.narrationEl.style.lineHeight = `${this.baseLineHeight}px`;
        for (const el of this.speechEls) {
            el.style.fontSize = `${this.baseFontSize * 0.9}px`;
            el.style.lineHeight = `${this.baseLineHeight * 0.9}px`;
        }
        }
        this.renderText();
        this.three.resize(width,height);
        
        

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
        this.move(t.left,t.top);
        this.resize(t.width,t.height, scaleText);
    }
    
    setTarget(data){
        this.target = data;
        this.updateNarrationTarget();
        this.startUpdates();
    }


    moveToTarget(){
        
        
        let rate = 1 - Math.pow(0.1, 1 / frames);
        let c = this.data;
        let t = this.target;

        let wwidth = window.innerWidth;
        let wheight = window.innerHeight;

        

        

        if (this.movingToTarget.left){
            this.move(lerp(c.left,t.left,rate), c.top);
            if (Math.abs(c.left-t.left)<1) this.movingToTarget.left = false;
        }
        if (this.movingToTarget.top){
            this.move(c.left,lerp(c.top,t.top,rate));
            if (Math.abs(c.top-t.top)<1) this.movingToTarget.top = false;
        }
        if (this.textType === 'narration' && this.movingToTarget.top) {
            const rect = this.narrationEl.getBoundingClientRect();
            const top = c.top - rect.height;
            this.narrationEl.style.left = `${c.left}px`;
            this.narrationEl.style.top = `${top}px`;
            this.narrationData.left = c.left;
            this.narrationData.top = top;
        }
        if (this.movingToTarget.width){
            this.resize(lerp(c.width,t.width,rate), c.height);
            if (Math.abs(c.width-t.width)<1) this.movingToTarget.width = false;
        }
        if (this.movingToTarget.height){
            this.resize(c.width,lerp(c.height,t.height,rate));
            if (Math.abs(c.height-t.height)<1) this.movingToTarget.height = false;
        }

        if (!this.movingToTarget.width && !this.movingToTarget.height && !this.movingToTarget.top && !this.movingToTarget.left) {
            console.log(this.id + " is done updating");
            this.isUpdating = false;
        }
        
        if (c.left+c.width<0 || c.top+c.height<0 || c.left>wwidth || c.top>wheight){
            console.log("off screen")
            this.isUpdating = false;
            this.onScreen = false;
            this.textEl.style.display = 'none';
            this.narrationEl.style.display = 'none';
            for (const el of this.speechEls) el.style.display = 'none';
            this.stopUpdates();
            return;
        }
    }
    

    stopUpdates(){
        this.isUpdating = false;
        this.movingToTarget = {left:false, top:false, width:false, height:false};
        if (!this.speakers.length) {
            this.three.renderer.setAnimationLoop(null);
        }
    }
    startUpdates(){
        this.onScreen = true;
        this.isUpdating = true;
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
        console.log(speakers);
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
        //idk if this works
        this.canvas.remove();
        this.textEl.remove();
        this.narrationEl.remove();
        for (const el of this.speechEls) el.remove();
        this.three.renderer.dispose();
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
        if (this.textType === 'dialogue') {
            this.textEl.style.display = 'block';
            this.narrationEl.style.display = 'none';
            for (const el of this.speechEls) el.style.display = 'none';
        } else {
            this.textEl.style.display = 'none';
            this.narrationEl.style.display = 'block';
            for (const el of this.speechEls) el.style.display = this.speakers.length ? 'block' : 'none';
        }
    }

    updateNarrationTarget(){
        if (this.textType !== 'narration') return;
        const rect = this.narrationEl.getBoundingClientRect();
        const targetTop = Math.max(this.topInset || 0, this.target.top - rect.height);
        this.narrationTarget.left = this.target.left;
        this.narrationTarget.top = targetTop;
        if (this.narrationData.left === this.data.left && this.narrationData.top === this.data.top) {
            this.narrationData.left = this.target.left;
            this.narrationData.top = this.target.top + 40;
        }
        this.narrationEl.style.left = `${this.narrationData.left}px`;
        this.narrationEl.style.top = `${this.narrationData.top}px`;
    }

    setTopInset(inset){
        this.topInset = inset || 0;
        this.updateNarrationTarget();
    }

    renderText(){
        this.textEl.innerHTML = this.text || '';
        this.narrationEl.innerHTML = this.text || '';
        this.renderSpeechBubbles();
        this.updateTextMode();
        this.positionSpeechBubbles();
        this.updateNarrationTarget();
    }

    renderSpeechBubbles(){
        for (const el of this.speechEls) el.remove();
        this.speechEls = [];
        const speakers = this.speakers || [];
        for (const entry of speakers) {
            const el = document.createElement('div');
            el.className = 'panel-speech';
            el.style.width = 'auto';
            el.style.fontSize = `${this.baseFontSize * 0.9}px`;
            el.style.lineHeight = `${this.baseLineHeight * 0.9}px`;
            el.innerHTML = stripLeadingHtmlWhitespace(entry.html || '');
            const tailBorder = document.createElement('span');
            tailBorder.className = 'speech-tail-border';
            const tail = document.createElement('span');
            tail.className = 'speech-tail';
            el.appendChild(tailBorder);
            el.appendChild(tail);
            document.body.appendChild(el);
            this.speechEls.push(el);
        }
    }

    positionSpeechBubbles(){
        if (!this.speechEls.length) return;
        const canvasRect = this.canvas.getBoundingClientRect();
        const pad = 8;
        const gap = 8;
        let cursorTop = canvasRect.top + pad;
        const occupied = [];
        const narrationRect = this.narrationEl.getBoundingClientRect();
        for (let i = 0; i < this.speechEls.length; i++) {
            const el = this.speechEls[i];
            const rect = el.getBoundingClientRect();
            const speakerKey = String(this.speakers[i]?.speaker || '').trim();
            const model = this.three?.getModelByKey(speakerKey);
            let anchorX = canvasRect.left + pad + rect.width / 2;
            let anchorY = canvasRect.top + pad + rect.height;
            if (model) {
                const bounds = this.three.getModelBoundsByKey(speakerKey);
                const anchorWorld = bounds?.top || model.position;
                const screen = this.three.worldToScreen(anchorWorld);
                anchorX = canvasRect.left + screen.x;
                anchorY = canvasRect.top + screen.y;
            }

            const left = Math.max(
                canvasRect.left + pad,
                Math.min(canvasRect.right - rect.width - pad, anchorX - rect.width / 2)
            );
            let top = Math.max(canvasRect.top + pad, cursorTop);

            // Try to lift bubble upwards unless it would collide.
            let candidate = Math.max(canvasRect.top + pad, top - 24);
            for (let tries = 0; tries < 6; tries++) {
                const testRect = {
                    left,
                    top: candidate,
                    right: left + rect.width,
                    bottom: candidate + rect.height,
                };
                const overlapsNarration =
                    testRect.right > narrationRect.left &&
                    testRect.left < narrationRect.right &&
                    testRect.bottom > narrationRect.top &&
                    testRect.top < narrationRect.bottom;
                const overlapsBubble = occupied.some((r) =>
                    testRect.right > r.left &&
                    testRect.left < r.right &&
                    testRect.bottom > r.top &&
                    testRect.top < r.bottom
                );
                if (!overlapsNarration && !overlapsBubble) {
                    top = candidate;
                    break;
                }
                candidate += 12;
                if (candidate > top) break;
            }

            el.style.left = `${left}px`;
            el.style.top = `${top}px`;

            const tailX = Math.max(12, Math.min(rect.width - 12, anchorX - left));
            const tail = el.querySelector('.speech-tail');
            const tailBorder = el.querySelector('.speech-tail-border');
            if (tail) tail.style.left = `${tailX - 8}px`;
            if (tailBorder) tailBorder.style.left = `${tailX - 9}px`;

            const tailStartY = top + rect.height - 4;
            const desiredTipY = Math.min(canvasRect.bottom - 6, Math.max(canvasRect.top + 6, anchorY));
            const tailLength = Math.max(14, desiredTipY - tailStartY);
            if (tailBorder) {
                tailBorder.style.top = `${rect.height - 4}px`;
                tailBorder.style.borderTopWidth = `${tailLength + 2}px`;
            }
            if (tail) {
                tail.style.top = `${rect.height - 4}px`;
                tail.style.borderTopWidth = `${tailLength}px`;
            }

            cursorTop = top + rect.height + gap;
            occupied.push({
                left,
                top,
                right: left + rect.width,
                bottom: top + rect.height,
            });
        }
    }

}
