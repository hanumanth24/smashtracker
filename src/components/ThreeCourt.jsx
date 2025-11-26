'use client';

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ThreeCourt() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712);
    scene.fog = new THREE.FogExp2(0x0b1224, 0.04);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const defaultHeight = 280;
    renderer.setSize(mount.clientWidth, defaultHeight);
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / defaultHeight,
      0.1,
      200
    );
    camera.position.set(6, 10, 12);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI / 4;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.target.set(0, 0, 0);

    // Floor and court glass
    const disposableGeometries = [];
    const disposableMaterials = [];

    const courtGeom = new THREE.PlaneGeometry(14, 7);
    disposableGeometries.push(courtGeom);
    const courtMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1224,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.22,
      roughness: 0.22,
      metalness: 0.65,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
      transmission: 0.1,
      opacity: 0.95,
      transparent: true,
    });
    disposableMaterials.push(courtMat);
    const court = new THREE.Mesh(courtGeom, courtMat);
    court.rotation.x = -Math.PI / 2;
    court.receiveShadow = true;
    scene.add(court);

    // Court outline and service lines
    const outlineGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(12, 0.05, 6));
    disposableGeometries.push(outlineGeom);
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    disposableMaterials.push(outlineMat);
    const outline = new THREE.LineSegments(
      outlineGeom,
      outlineMat
    );
    outline.position.y = 0.01;
    scene.add(outline);

    const serviceLines = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.9,
    });
    disposableMaterials.push(lineMat);
    const linePairs = [
      [
        [-6, -3],
        [-6, 3],
      ],
      [
        [6, -3],
        [6, 3],
      ],
      [
        [-6, 0],
        [6, 0],
      ],
      [
        [0, -3],
        [0, 3],
      ],
    ];
    linePairs.forEach(([start, end]) => {
      const pts = [
        new THREE.Vector3(start[0], 0.012, start[1]),
        new THREE.Vector3(end[0], 0.012, end[1]),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      disposableGeometries.push(geo);
      serviceLines.add(new THREE.Line(geo, lineMat));
    });
    scene.add(serviceLines);

    // Net and pillars
    const netGeom = new THREE.BoxGeometry(0.08, 1.3, 7);
    disposableGeometries.push(netGeom);
    const netMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.8,
      metalness: 0.4,
      roughness: 0.25,
    });
    disposableMaterials.push(netMat);
    const net = new THREE.Mesh(netGeom, netMat);
    net.position.y = 0.65;
    net.castShadow = true;
    scene.add(net);

    const poleGeom = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 16);
    disposableGeometries.push(poleGeom);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.8,
      roughness: 0.25,
    });
    disposableMaterials.push(poleMat);
    [-6, 6].forEach((x) => {
      const pole = new THREE.Mesh(poleGeom, poleMat);
      pole.position.set(x, 0.8, 0);
      pole.castShadow = true;
      scene.add(pole);
    });

    // Glow sweep
    const sweepGeom = new THREE.PlaneGeometry(14, 0.28);
    disposableGeometries.push(sweepGeom);
    const sweepMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    disposableMaterials.push(sweepMat);
    const sweep = new THREE.Mesh(sweepGeom, sweepMat);
    sweep.rotation.x = -Math.PI / 2;
    sweep.position.y = 0.02;
    scene.add(sweep);

    // Floating particles
    const particleGeom = new THREE.BufferGeometry();
    disposableGeometries.push(particleGeom);
    const particleCount = 80;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = Math.random() * 2 + 0.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 7;
    }
    particleGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.05,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    disposableMaterials.push(particleMat);
    const particles = new THREE.Points(particleGeom, particleMat);
    scene.add(particles);

    // Lighting rig
    scene.add(new THREE.AmbientLight(0x94a3b8, 0.35));

    const hemi = new THREE.HemisphereLight(0x3b82f6, 0x0b1224, 0.6);
    scene.add(hemi);

    const keyLight = new THREE.SpotLight(0x8b5cf6, 1.6, 35, Math.PI / 4, 0.4, 1.2);
    keyLight.position.set(7, 14, 10);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x22d3ee, 1.4, 30);
    rimLight.position.set(-5, 8, -6);
    scene.add(rimLight);

    const pulseLight = new THREE.PointLight(0xff7a00, 0.9, 20);
    pulseLight.position.set(0, 7, 0);
    scene.add(pulseLight);

    const clock = new THREE.Clock();
    const resize = () => {
      if (!mount) return;
      const width = mount.clientWidth;
      const height = Math.max(240, Math.floor(width * 0.6));
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    window.addEventListener("resize", resize);

    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      controls.update();

      sweep.position.z = Math.sin(t * 0.8) * 3.2;
      sweep.material.opacity = 0.12 + Math.sin(t * 1.3) * 0.05;

      net.material.emissiveIntensity = 0.65 + Math.sin(t * 1.8) * 0.2;
      rimLight.intensity = 1.15 + Math.sin(t * 0.7) * 0.25;
      pulseLight.position.x = Math.sin(t * 0.5) * 2.5;
      pulseLight.position.z = Math.cos(t * 0.6) * 2.5;

      particles.rotation.y += 0.0008;
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      controls.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();

      disposableGeometries.forEach((geo) => {
        if (geo && typeof geo.dispose === "function") geo.dispose();
      });
      disposableMaterials.forEach((mat) => {
        if (mat && typeof mat.dispose === "function") mat.dispose();
      });
    };
  }, []);

  return <div ref={mountRef} className="court-wrapper" style={{ height: 280 }} />;
}
