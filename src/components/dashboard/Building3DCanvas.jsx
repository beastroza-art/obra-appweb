import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cn } from "@/lib/utils";
import {
  RotateCw,
  Video,
  Maximize2,
  RefreshCw,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Color helper function based on floor progress (hex values for ThreeJS)
function getFloorColorHex(pct) {
  if (pct >= 100) return 0x10b981; // emerald-500
  if (pct >= 75) return 0x14b8a6;  // teal-500
  if (pct >= 50) return 0xf59e0b;  // amber-500
  if (pct >= 25) return 0xf97316;  // orange-500
  if (pct > 0) return 0xef4444;    // red-500
  return 0x64748b;                 // slate-500 (0% progress)
}

// Translate HTML color names/codes for CSS legend
function getFloorColorClass(pct) {
  if (pct >= 100) return "bg-emerald-500 text-white";
  if (pct >= 75) return "bg-teal-500 text-white";
  if (pct >= 50) return "bg-amber-500 text-amber-950";
  if (pct >= 25) return "bg-orange-500 text-orange-950";
  if (pct > 0) return "bg-red-500 text-white";
  return "bg-slate-500 text-white";
}

export function getFloorPriority(floorName) {
  const name = String(floorName || "").trim().toLowerCase();
  
  if (name.includes("subterraneo") || name.includes("subterráneo")) {
    const match = name.match(/\d+/);
    const num = match ? Number(match[0]) : 1;
    return -10 - num; // Sub 3 = -13, Sub 2 = -12, Sub 1 = -11
  }
  
  if (name.includes("exterior")) {
    return -5;
  }
  
  if (name.includes("comun") || name.includes("común")) {
    return -2;
  }
  
  if (name.includes("cubierta") || name.includes("techo") || name.includes("azotea")) {
    return 1000;
  }
  
  // Standard Pisos
  const match = name.match(/\d+/);
  if (match) {
    const num = Number(match[0]);
    return num;
  }
  
  return 0; // Default
}

export default function Building3DCanvas({
  floors = [],
  selectedFloor = null,
  onSelectFloor,
  visualMode = "progress", // 'progress' | 'blocked' | 'monochrome'
}) {
  const mountRef = useRef(null);
  const tooltipRef = useRef(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [hoveredFloorInfo, setHoveredFloorInfo] = useState(null);

  // Keep orbit control ref to reset camera position
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const sceneRef = useRef(null);
  const floorMeshesRef = useRef([]); // holds interactive floor meshes
  const outlineMeshRef = useRef(null); // highlight outline mesh for selected floor

  // Use refs for callbacks to avoid stale closures in ThreeJS event listeners
  const onSelectFloorRef = useRef(onSelectFloor);
  useEffect(() => {
    onSelectFloorRef.current = onSelectFloor;
  }, [onSelectFloor]);

  // Re-adjust camera to fit the building heights dynamically
  const fitCameraToBuilding = (numFloors) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    const buildingHeight = Math.max(numFloors * 1.5, 3);
    const targetY = buildingHeight / 2;

    controls.target.set(0, targetY, 0);

    // Position camera based on height
    const distance = Math.max(buildingHeight * 1.4, 12);
    camera.position.set(distance * 0.9, targetY + distance * 0.6, distance * 0.9);
    camera.lookAt(0, targetY, 0);
    controls.update();
  };

  // 1. Initialise Scene, Camera, Renderer, Lights, Controls (Once on mount)
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 500;

    // SCENE
    const scene = new THREE.Scene();
    // Dark blueprint/architectural background style
    scene.background = new THREE.Color(0x0f172a); // slate-900
    scene.fog = new THREE.FogExp2(0x0f172a, 0.015);
    sceneRef.current = scene;

    // CAMERA
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    cameraRef.current = camera;

    // RENDERER
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // ORBIT CONTROLS
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.1; // don't go below ground level
    controls.minDistance = 3;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.0;
    controlsRef.current = controls;

    // LIGHTS
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight1.position.set(10, 20, 10);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 40;
    const d = 10;
    dirLight1.shadow.camera.left = -d;
    dirLight1.shadow.camera.right = d;
    dirLight1.shadow.camera.top = d;
    dirLight1.shadow.camera.bottom = -d;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.35); // subtle blue fill light
    dirLight2.position.set(-10, 10, -10);
    scene.add(dirLight2);

    // GRID FLOOR HELPER
    const gridHelper = new THREE.GridHelper(30, 30, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.21;
    scene.add(gridHelper);

    // GROUND BASE PLATE
    const baseGeo = new THREE.BoxGeometry(10, 0.4, 10);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // slate-800
      roughness: 0.8,
      metalness: 0.2,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.4;
    baseMesh.receiveShadow = true;
    scene.add(baseMesh);

    // FIT CAMERA
    fitCameraToBuilding(floors.length || 10);

    // ANIMATE LOOP
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // OrbitControls will update internally including autoRotate
      if (controlsRef.current) {
        controlsRef.current.update();
      }

      renderer.render(scene, camera);
    };
    animate();

    // RESIZE EVENT HANDLER
    const handleResize = () => {
      if (!container || !cameraRef.current || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // RAYCASTER EVENTS setup
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const getIntersectedFloor = (e) => {
      if (!mountRef.current || !cameraRef.current || floorMeshesRef.current.length === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(floorMeshesRef.current);

      if (intersects.length > 0) {
        // Find parent floor object data from custom userData
        return intersects[0].object;
      }
      return null;
    };

    const handlePointerMove = (e) => {
      const intersected = getIntersectedFloor(e);
      const tooltip = tooltipRef.current;

      if (intersected) {
        container.style.cursor = "pointer";
        const floorData = intersected.userData;

        // Position tooltip near the mouse
        if (tooltip) {
          const rect = container.getBoundingClientRect();
          tooltip.style.left = `${e.clientX - rect.left + 15}px`;
          tooltip.style.top = `${e.clientY - rect.top + 15}px`;
          tooltip.style.display = "block";
        }

        setHoveredFloorInfo({
          floorName: floorData.floor,
          pct: floorData.pct,
          itemCount: floorData.itemCount,
          blockedCount: (floorData?.pisoItems || []).filter(i => i?.status === "bloqueado").length,
        });

        // Highlight material locally (temporary emission glow)
        floorMeshesRef.current.forEach((mesh) => {
          if (mesh === intersected) {
            mesh.material.emissive.setHex(0x1e293b);
            mesh.material.emissiveIntensity = 0.5;
          } else {
            mesh.material.emissive.setHex(0x000000);
            mesh.material.emissiveIntensity = 0;
          }
        });
      } else {
        container.style.cursor = "default";
        if (tooltip) tooltip.style.display = "none";
        setHoveredFloorInfo(null);

        // Reset emission glow
        floorMeshesRef.current.forEach((mesh) => {
          mesh.material.emissive.setHex(0x000000);
          mesh.material.emissiveIntensity = 0;
        });
      }
    };

    const handleCanvasClick = (e) => {
      const intersected = getIntersectedFloor(e);
      if (intersected && onSelectFloorRef.current) {
        const floorData = intersected.userData;
        onSelectFloorRef.current(floorData.floor);
      }
    };

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("click", handleCanvasClick);

    // CLEANUP
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);

      if (renderer.domElement) {
        renderer.domElement.removeEventListener("pointermove", handlePointerMove);
        renderer.domElement.removeEventListener("click", handleCanvasClick);
      }

      // Dispose of Three Objects
      scene.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => mat.dispose());
        } else {
          object.material.dispose();
        }
      });

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Separate effect to handle autoRotate changes dynamically on the existing controls
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
      controlsRef.current.autoRotateSpeed = 1.0;
    }
  }, [autoRotate]); // re-bind when autoRotate changes to simplify access, or separate logic.

  // 2. Re-build Building Meshes when Floors or visualMode changes (WITHOUT resetting camera)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove existing building elements (floors, roofs, outlines)
    floorMeshesRef.current.forEach((mesh) => scene.remove(mesh));
    floorMeshesRef.current = [];

    if (outlineMeshRef.current) {
      scene.remove(outlineMeshRef.current);
      outlineMeshRef.current = null;
    }

    // Remove old helper children (plates, roof, etc.)
    const oldBuildingObjects = scene.children.filter(
      (child) =>
        child.userData &&
        (child.userData.type === "floorPlate" ||
          child.userData.type === "roof" ||
          child.userData.type === "antenna")
    );
    oldBuildingObjects.forEach((obj) => scene.remove(obj));

    // Handle empty state - create a cool spinning wireframe scaffolding structure
    if (floors.length === 0) {
      const dummyHeight = 12;
      const scaffoldGeo = new THREE.BoxGeometry(4, dummyHeight, 4);
      const edgeGeo = new THREE.EdgesGeometry(scaffoldGeo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x334155, linewidth: 2 });
      const scaffoldLines = new THREE.LineSegments(edgeGeo, lineMat);
      scaffoldLines.position.y = dummyHeight / 2;
      scaffoldLines.userData = { type: "roof" };
      scene.add(scaffoldLines);

      // Add a couple of horizontal cross bars
      for (let i = 1; i < 6; i++) {
        const ringGeo = new THREE.BoxGeometry(4.2, 0.1, 4.2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x475569,
          wireframe: true,
          transparent: true,
          opacity: 0.3,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.y = i * 2;
        ringMesh.userData = { type: "floorPlate" };
        scene.add(ringMesh);
      }
      fitCameraToBuilding(8);
      return;
    }

    // Separate tower floors from exterior floor
    const towerFloors = floors.filter(f => !String(f.floor).toLowerCase().includes("exterior"));
    const exteriorFloor = floors.find(f => String(f.floor).toLowerCase().includes("exterior"));

    const floorHeight = 0.95;
    const floorGap = 0.35;
    const floorStep = floorHeight + floorGap;

    // Find lobby or Piso 1 to set ground at Y = 0
    const firstAboveGroundIndex = towerFloors.findIndex(f => getFloorPriority(f.floor) >= -2);
    const activeFirstIndex = firstAboveGroundIndex >= 0 ? firstAboveGroundIndex : 0;

    // Stack building floors
    towerFloors.forEach((floorData, idx) => {
      const isCubierta = String(floorData.floor).toLowerCase().includes("cubierta");
      const isLobby = String(floorData.floor).toLowerCase().includes("comun") || String(floorData.floor).toLowerCase().includes("común");
      const isBasement = getFloorPriority(floorData.floor) < -2;

      const currentHeight = isCubierta ? 0.6 : floorHeight;
      const yPos = (idx - activeFirstIndex) * floorStep + currentHeight / 2;

      // A. CONCRETE PLATE UNDER EACH FLOOR
      const plateGeo = new THREE.BoxGeometry(isLobby ? 5.2 : 4.4, 0.12, isLobby ? 5.2 : 4.4);
      const plateMat = new THREE.MeshStandardMaterial({
        color: isBasement ? 0x1e293b : 0x334155, // slate-800 for basement plates
        roughness: 0.9,
        metalness: 0.1,
      });
      const plateMesh = new THREE.Mesh(plateGeo, plateMat);
      plateMesh.position.set(0, (idx - activeFirstIndex) * floorStep - 0.06, 0);
      plateMesh.receiveShadow = true;
      plateMesh.castShadow = true;
      plateMesh.userData = { type: "floorPlate" };
      scene.add(plateMesh);

      // B. INTERACTIVE FLOOR BODY
      const bodyWidth = isLobby ? 4.7 : 3.9;
      const bodyGeo = new THREE.BoxGeometry(bodyWidth, currentHeight, bodyWidth);

      // Determine color based on visualMode
      let colorHex = getFloorColorHex(floorData.pct);
      let opacity = 0.6;
      let emissiveHex = 0x000000;
      let emissiveIntensity = 0;

      const hasBlockedTasks = floorData.pisoItems.some((i) => {
        if (i.status === "bloqueado") return true;
        const res = String(i.restrictions || "").trim().toLowerCase();
        return res !== "" && res !== "sin restricción" && res !== "sin restriccion";
      });

      if (isBasement) {
        colorHex = 0x475569; // matte slate for basement concrete blocks
        opacity = 0.85;
      }

      if (isCubierta) {
        colorHex = 0x334155; // darker concrete look for roof level
        opacity = 0.9;
      }

      if (visualMode === "blocked") {
        if (hasBlockedTasks) {
          colorHex = 0xef4444; // intense red
          opacity = 0.8;
          emissiveHex = 0xef4444;
          emissiveIntensity = 0.2;
        } else {
          colorHex = isBasement ? 0x475569 : isCubierta ? 0x334155 : 0x38bdf8;
          opacity = isBasement ? 0.85 : isCubierta ? 0.9 : 0.3;
        }
      } else if (visualMode === "monochrome") {
        const isSelected = selectedFloor === floorData.floor;
        if (isSelected) {
          colorHex = 0xf97316; // neon orange highlight
          opacity = 0.85;
          emissiveHex = 0xf97316;
          emissiveIntensity = 0.3;
        } else {
          colorHex = isBasement ? 0x334155 : isCubierta ? 0x1e293b : 0xe2e8f0;
          opacity = isBasement ? 0.4 : isCubierta ? 0.4 : 0.2;
        }
      }

      const bodyMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: (isBasement || isCubierta) ? 0.85 : 0.15,
        metalness: (isBasement || isCubierta) ? 0.1 : 0.45,
        transparent: true,
        opacity: opacity,
        emissive: new THREE.Color(emissiveHex),
        emissiveIntensity: emissiveIntensity,
      });

      const floorMesh = new THREE.Mesh(bodyGeo, bodyMat);
      floorMesh.position.set(0, yPos, 0);
      floorMesh.castShadow = true;
      floorMesh.receiveShadow = true;

      // Attach floor data to mesh userData for Raycaster retrieval
      floorMesh.userData = floorData;
      scene.add(floorMesh);
      floorMeshesRef.current.push(floorMesh);

      // C. WIREFRAME OUTLINE FOR CRISP ARCHITECTURAL FEEL
      const edges = new THREE.EdgesGeometry(bodyGeo);
      const outlineColor = visualMode === "monochrome" && selectedFloor !== floorData.floor
        ? 0x475569 // soft gray outline
        : colorHex;
      const lineMat = new THREE.LineBasicMaterial({
        color: outlineColor,
        linewidth: 1,
        transparent: true,
        opacity: 0.65,
      });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      wireframe.position.set(0, yPos, 0);
      wireframe.userData = { type: "floorPlate" };
      scene.add(wireframe);
    });

    // C2. RENDER EXTERIORES PLATFORM (Surrounding base plate at Y = -0.1)
    if (exteriorFloor) {
      const extGeo = new THREE.BoxGeometry(11, 0.08, 11);

      let colorHex = getFloorColorHex(exteriorFloor.pct);
      let opacity = 0.75;
      let emissiveHex = 0x000000;
      let emissiveIntensity = 0;

      const hasBlockedTasks = exteriorFloor.pisoItems.some((i) => {
        if (i.status === "bloqueado") return true;
        const res = String(i.restrictions || "").trim().toLowerCase();
        return res !== "" && res !== "sin restricción" && res !== "sin restriccion";
      });

      if (visualMode === "blocked") {
        if (hasBlockedTasks) {
          colorHex = 0xef4444;
          opacity = 0.85;
          emissiveHex = 0xef4444;
          emissiveIntensity = 0.2;
        } else {
          colorHex = 0x06b6d4; // cyan for exteriors in blocked mode
          opacity = 0.45;
        }
      } else if (visualMode === "monochrome") {
        const isSelected = selectedFloor === exteriorFloor.floor;
        if (isSelected) {
          colorHex = 0xf97316;
          opacity = 0.85;
          emissiveHex = 0xf97316;
          emissiveIntensity = 0.3;
        } else {
          colorHex = 0x475569; // dark grey
          opacity = 0.35;
        }
      }

      const extMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.8,
        metalness: 0.1,
        transparent: true,
        opacity: opacity,
        emissive: new THREE.Color(emissiveHex),
        emissiveIntensity: emissiveIntensity,
      });

      const extMesh = new THREE.Mesh(extGeo, extMat);
      extMesh.position.set(0, -0.1, 0); // Ground platform level
      extMesh.receiveShadow = true;
      extMesh.castShadow = true;
      extMesh.userData = exteriorFloor;

      scene.add(extMesh);
      floorMeshesRef.current.push(extMesh);

      // Wireframe outline for Exteriores
      const extEdges = new THREE.EdgesGeometry(extGeo);
      const extLineMat = new THREE.LineBasicMaterial({
        color: visualMode === "monochrome" && selectedFloor !== exteriorFloor.floor ? 0x334155 : colorHex,
        linewidth: 1.5,
        transparent: true,
        opacity: 0.7,
      });
      const extWireframe = new THREE.LineSegments(extEdges, extLineMat);
      extWireframe.position.set(0, -0.1, 0);
      extWireframe.userData = { type: "floorPlate" };
      scene.add(extWireframe);
    }

    // D. ROOF CAP AND ANTENNA (Stacked above highest index tower floor only if tower floors exist)
    if (towerFloors.length > 0) {
      const hasCubierta = towerFloors.some(f => String(f.floor).toLowerCase().includes("cubierta"));
      const topY = (towerFloors.length - activeFirstIndex) * floorStep - (hasCubierta ? 0.35 : 0.05);

      // Roof plate
      const roofPlateGeo = new THREE.BoxGeometry(4.4, 0.1, 4.4);
      const roofPlateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
      const roofPlate = new THREE.Mesh(roofPlateGeo, roofPlateMat);
      roofPlate.position.set(0, topY, 0);
      roofPlate.userData = { type: "roof" };
      scene.add(roofPlate);

      // Roof pyramid
      const pyramidGeo = new THREE.ConeGeometry(2.5, 1.2, 4);
      pyramidGeo.rotateY(Math.PI / 4); // match square structure
      const pyramidMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.5,
        metalness: 0.3,
      });
      const roofPyramid = new THREE.Mesh(pyramidGeo, pyramidMat);
      roofPyramid.position.set(0, topY + 0.6, 0);
      roofPyramid.userData = { type: "roof" };
      scene.add(roofPyramid);

      // Antenna
      const antennaGeo = new THREE.CylinderGeometry(0.04, 0.04, 2, 8);
      const antennaMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.1 });
      const antenna = new THREE.Mesh(antennaGeo, antennaMat);
      antenna.position.set(0, topY + 1.2 + 1, 0);
      antenna.userData = { type: "antenna" };
      scene.add(antenna);

      // Glow light at the top of antenna
      const beaconGeo = new THREE.SphereGeometry(0.08, 8, 8);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(0, topY + 1.2 + 2, 0);
      beacon.userData = { type: "antenna" };
      scene.add(beacon);
    }
  }, [floors, visualMode, selectedFloor]);

  // Fit camera once when floors list updates (different project/tower)
  useEffect(() => {
    if (floors.length > 0) {
      const towerCount = floors.filter(f => !String(f.floor).toLowerCase().includes("exterior")).length;
      fitCameraToBuilding(towerCount > 0 ? towerCount : 3);
    }
  }, [floors]);

  // 3. Handle Selected Floor highlight outline (adapted for different shapes)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear old outline
    if (outlineMeshRef.current) {
      scene.remove(outlineMeshRef.current);
      outlineMeshRef.current = null;
    }

    if (!selectedFloor || floors.length === 0) return;

    const towerFloors = floors.filter(f => !String(f.floor).toLowerCase().includes("exterior"));
    const firstAboveGroundIndex = towerFloors.findIndex(f => getFloorPriority(f.floor) >= -2);
    const activeFirstIndex = firstAboveGroundIndex >= 0 ? firstAboveGroundIndex : 0;

    const floorHeight = 0.95;
    const floorGap = 0.35;
    const floorStep = floorHeight + floorGap;

    let yPos = 0;
    let outlineGeo = null;

    if (String(selectedFloor).toLowerCase().includes("exterior")) {
      yPos = -0.1;
      outlineGeo = new THREE.BoxGeometry(11.2, 0.14, 11.2);
    } else {
      const floorIdx = towerFloors.findIndex((f) => f.floor === selectedFloor);
      if (floorIdx === -1) return;

      const isCubierta = String(selectedFloor).toLowerCase().includes("cubierta");
      const isLobby = String(selectedFloor).toLowerCase().includes("comun") || String(selectedFloor).toLowerCase().includes("común");
      const currentHeight = isCubierta ? 0.6 : floorHeight;

      yPos = (floorIdx - activeFirstIndex) * floorStep + currentHeight / 2;
      outlineGeo = new THREE.BoxGeometry(isLobby ? 4.95 : 4.15, currentHeight + 0.12, isLobby ? 4.95 : 4.15);
    }

    const edges = new THREE.EdgesGeometry(outlineGeo);
    // Vibrant Orange neon outline
    const outlineMat = new THREE.LineBasicMaterial({
      color: 0xf97316, // orange-500
      linewidth: 3,
    });
    const outline = new THREE.LineSegments(edges, outlineMat);
    outline.position.set(0, yPos, 0);
    outline.userData = { type: "selectionOutline" };
    scene.add(outline);
    outlineMeshRef.current = outline;
  }, [selectedFloor, floors]);

  // 4. Focus camera on selected floor vertically (maintains horizontal look angle!)
  useEffect(() => {
    if (!controlsRef.current || !cameraRef.current || floors.length === 0) return;

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    const floorHeight = 0.95;
    const floorGap = 0.35;
    const floorStep = floorHeight + floorGap;

    const towerFloors = floors.filter(f => !String(f.floor).toLowerCase().includes("exterior"));
    const firstAboveGroundIndex = towerFloors.findIndex(f => getFloorPriority(f.floor) >= -2);
    const activeFirstIndex = firstAboveGroundIndex >= 0 ? firstAboveGroundIndex : 0;

    if (!selectedFloor) {
      const buildingHeight = towerFloors.length * floorStep;
      const centerY = buildingHeight / 2;

      // Adjust camera and target Y position relative to center
      const deltaY = centerY - controls.target.y;
      camera.position.y += deltaY;
      controls.target.set(0, centerY, 0);
      controls.update();
      return;
    }

    let targetY = 0;
    if (String(selectedFloor).toLowerCase().includes("exterior")) {
      targetY = -0.1;
    } else {
      const floorIdx = towerFloors.findIndex((f) => f.floor === selectedFloor);
      if (floorIdx === -1) return;

      const isCubierta = String(selectedFloor).toLowerCase().includes("cubierta");
      if (isCubierta) {
        targetY = (floorIdx - activeFirstIndex) * floorStep + 0.3;
      } else {
        targetY = (floorIdx - activeFirstIndex) * floorStep + floorHeight / 2;
      }
    }

    // Shift camera & target vertically by the delta (prevents jumping back to diagonal view)
    const deltaY = targetY - controls.target.y;
    camera.position.y += deltaY;
    controls.target.y = targetY;

    // Zoom in slightly: limit vector length from target to 9.5
    const toTarget = new THREE.Vector3().subVectors(camera.position, controls.target);
    const currentDist = toTarget.length();
    if (currentDist > 9.5) {
      toTarget.setLength(9.5);
      camera.position.copy(controls.target).add(toTarget);
    }

    controls.update();
  }, [selectedFloor, floors]);

  return (
    <div className="relative w-full h-full lg:rounded-none lg:border-none lg:bg-transparent lg:shadow-none rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
      {/* 3D Canvas Mount Point */}
      <div ref={mountRef} className="w-full h-full min-h-[420px] md:min-h-[500px]" />

      {/* Floating HUD Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">


        <Button
          variant="outline"
          size="icon"
          title="Restablecer cámara"
          onClick={() => fitCameraToBuilding(floors.length || 10)}
          className="h-9 w-9 bg-slate-900/80 border-slate-700 text-white hover:bg-slate-800 hover:text-white rounded-lg backdrop-blur-sm"
        >
          <RefreshCw className="h-4.5 w-4.5" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          title="Vista frontal"
          onClick={() => {
            if (!cameraRef.current || !controlsRef.current) return;
            const towerFloors = floors.filter(f => !String(f.floor).toLowerCase().includes("exterior"));
            
            // Adjust camera directly in front of the active focus target height
            const targetY = controlsRef.current.target.y;
            const distance = Math.max(towerFloors.length * 1.4, 12);
            
            cameraRef.current.position.set(0, targetY, distance);
            controlsRef.current.target.set(0, targetY, 0);
            controlsRef.current.update();
          }}
          className="h-9 w-9 bg-slate-900/80 border-slate-700 text-white hover:bg-slate-800 hover:text-white rounded-lg backdrop-blur-sm"
        >
          <Video className="h-4.5 w-4.5" />
        </Button>
      </div>

      {/* Helper Legend Inside Canvas */}
      <div className="absolute bottom-4 right-4 p-3 rounded-xl border border-slate-800 bg-slate-900/90 text-white text-[11px] font-medium backdrop-blur-sm z-10 pointer-events-none flex flex-col gap-1.5 shadow-lg min-w-[120px]">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1">
          <Layers className="h-3 w-3 text-orange-500" />
          Leyenda 3D
        </div>
        {visualMode === "progress" && (
          <>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded bg-emerald-500 inline-block border border-emerald-400/20" />
              <span>100% Completo</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded bg-teal-500 inline-block border border-teal-450/20" />
              <span>&ge;75% Avance</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded bg-amber-500 inline-block border border-amber-400/20" />
              <span>&ge;50% Avance</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded bg-orange-500 inline-block border border-orange-400/20" />
              <span>&ge;25% Avance</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded bg-red-500 inline-block border border-red-400/20" />
              <span>&gt;0% Avance</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded bg-slate-500 inline-block border border-slate-400/20" />
              <span>Sin iniciar</span>
            </div>
          </>
        )}
        {visualMode === "blocked" && (
          <>
            <div className="flex items-center gap-2 text-red-400">
              <span className="h-2.5 w-2.5 rounded bg-red-500 inline-block border border-red-400/20 animate-pulse" />
              <span className="font-semibold">Bloqueado</span>
            </div>
            <div className="flex items-center gap-2 text-sky-400">
              <span className="h-2.5 w-2.5 rounded bg-sky-500 inline-block border border-sky-400/20" />
              <span>Sin Bloqueos</span>
            </div>
          </>
        )}
        {visualMode === "monochrome" && (
          <>
            <div className="flex items-center gap-2 text-orange-400 font-semibold">
              <span className="h-2.5 w-2.5 rounded bg-orange-500 inline-block border border-orange-400/20" />
              <span>Seleccionado</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="h-2.5 w-2.5 rounded bg-slate-300 inline-block border border-slate-400/20" />
              <span>Estructura</span>
            </div>
          </>
        )}
      </div>

      {/* Floating Instructions Banner */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 p-2 bg-slate-900/80 rounded-lg text-slate-300 border border-slate-800 text-[10px] backdrop-blur-sm pointer-events-none flex items-center gap-1.5 shadow-md z-10">
        <Maximize2 className="h-3 w-3 text-orange-500 shrink-0" />
        <span>Arrastra para rotar · Rueda para zoom</span>
      </div>

      {/* CUSTOM HTML TOOLTIP (Moves with pointer) */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-slate-900/95 border border-slate-700 text-white rounded-xl p-3 shadow-2xl z-20 text-xs hidden min-w-[160px] backdrop-blur-md transition-all duration-75"
        style={{ position: "absolute" }}
      >
        {hoveredFloorInfo && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
              <span className="font-bold text-sm text-slate-100">{hoveredFloorInfo.floorName}</span>
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold",
                getFloorColorClass(hoveredFloorInfo.pct)
              )}>
                {hoveredFloorInfo.pct}%
              </span>
            </div>
            <div className="flex flex-col gap-1 text-[11px] text-slate-350">
              <div className="flex justify-between items-center gap-4">
                <span>Actividades:</span>
                <span className="font-bold text-white">{hoveredFloorInfo.itemCount}</span>
              </div>
              {hoveredFloorInfo.blockedCount > 0 && (
                <div className="flex justify-between items-center text-red-400 font-medium">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Bloqueos:
                  </span>
                  <span className="font-bold">{hoveredFloorInfo.blockedCount}</span>
                </div>
              )}
            </div>
            <div className="border-t border-slate-700/50 pt-1 text-[9px] text-orange-400 font-semibold text-center mt-1 animate-pulse">
              Haz clic para ver actividades
            </div>
          </div>
        )}
      </div>

      {/* Empty State visual overlay */}
      {floors.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-white pointer-events-none p-6">
          <div className="text-center max-w-sm flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 animate-pulse">
              <Layers className="h-5 w-5 text-slate-400" />
            </div>
            <h3 className="font-bold text-lg text-slate-100">Sin modelo activo</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Selecciona una obra en los filtros del panel para cargar la representación 3D del edificio y visualizar sus niveles.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
