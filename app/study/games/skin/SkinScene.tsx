/* eslint-disable react/no-unknown-property -- react-three-fiber 的 JSX 属性不在 react 规则表里 */
import { useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";

import {
    BASE_TISSUE_COLORS,
    SKIN_DEPTH,
    SKIN_LAYERS,
    SKIN_TOP,
    SKIN_WIDTH,
    type BruiseKind,
    type SkinLayer,
    type WoundProfile,
} from "./anatomy";

export type SceneView = "iso" | "side" | "top";

const CAMERA_POSITIONS: Record<SceneView, [number, number, number]> = {
    iso: [5.2, 4.8, 6.4],
    side: [0.2, 2.8, 8.8],
    top: [0.2, 9.2, 3.4],
};

const PROBE_REST_Y = SKIN_TOP + 1.35;

const SLOUGH_SPOTS = [
    { x: -0.42, z: 0.2, s: 0.42 },
    { x: 0.32, z: -0.28, s: 0.36 },
    { x: 0.05, z: 0.42, s: 0.3 },
    { x: -0.12, z: -0.44, s: 0.28 },
    { x: 0.5, z: 0.18, s: 0.24 },
];

type Props = {
    wound: WoundProfile;
    probe: boolean;
    view?: SceneView;
    /** intro 背景里不需要旋转交互 */
    controls?: boolean;
};

export default function SkinScene({
    wound,
    probe,
    view = "iso",
    controls = true,
}: Props) {
    return (
        <Canvas
            shadows
            dpr={[1, 1.6]}
            camera={{
                position: CAMERA_POSITIONS[view],
                fov: 40,
                near: 0.1,
                far: 42,
            }}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            className="skin-canvas"
        >
            <color attach="background" args={["#0b1220"]} />
            <fog attach="fog" args={["#0b1220", 13, 28]} />
            <SceneContent
                wound={wound}
                probe={probe}
                view={view}
                controls={controls}
            />
        </Canvas>
    );
}

function SceneContent({ wound, probe, view, controls }: Props) {
    return (
        <>
            <ambientLight intensity={0.62} />
            <hemisphereLight args={["#dbeafe", "#0b1220", 0.6]} />
            <directionalLight
                position={[5, 8, 6]}
                intensity={1.7}
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-camera-left={-8}
                shadow-camera-right={8}
                shadow-camera-top={8}
                shadow-camera-bottom={-8}
                shadow-bias={-0.0005}
            />
            <pointLight
                position={[-4, 4.5, -3]}
                intensity={16}
                distance={13}
                color="#a78bfa"
            />
            <pointLight
                position={[3.5, 2.2, 4]}
                intensity={9}
                distance={11}
                color="#38bdf8"
            />

            <CameraRig view={view ?? "iso"} />

            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, -0.16, 0]}
                receiveShadow
            >
                <planeGeometry args={[12, 10]} />
                <meshStandardMaterial color="#0f1a2b" roughness={1} />
            </mesh>
            <gridHelper
                args={[12, 24, "#243b5a", "#162840"]}
                position={[0, -0.15, 0]}
            />

            <group>
                <mesh position={[0, -0.035, 0]} receiveShadow>
                    <boxGeometry
                        args={[SKIN_WIDTH + 0.2, 0.08, SKIN_DEPTH + 0.2]}
                    />
                    <meshStandardMaterial
                        color="#142338"
                        roughness={0.85}
                        metalness={0.1}
                    />
                </mesh>

                {SKIN_LAYERS.map((layer) => (
                    <Layer key={layer.id} layer={layer} profile={wound} />
                ))}

                <WoundSurface wound={wound} />
                <Probe
                    active={probe}
                    floorY={wound.floorY}
                    blocked={wound.surfaceHole === 0 || Boolean(wound.eschar)}
                />
            </group>

            {controls && (
                <OrbitControls
                    makeDefault
                    enablePan={false}
                    minDistance={5}
                    maxDistance={15}
                    minPolarAngle={0.18}
                    maxPolarAngle={1.44}
                    target={[0, 1.25, 0]}
                    rotateSpeed={0.62}
                    zoomSpeed={0.78}
                    enableDamping
                    dampingFactor={0.08}
                />
            )}
        </>
    );
}

function CameraRig({ view }: { view: SceneView }) {
    const { camera } = useThree();

    useEffect(() => {
        const [x, y, z] = CAMERA_POSITIONS[view];
        camera.position.set(x, y, z);
        camera.lookAt(0, 1.25, 0);
        camera.updateProjectionMatrix();
    }, [camera, view]);

    return null;
}

/** 一层皮肤。创底以上挖空成框，创底以下保持完整。 */
function Layer({
    layer,
    profile,
}: {
    layer: SkinLayer;
    profile: WoundProfile;
}) {
    const solidTop = Math.min(layer.y1, profile.floorY);
    const hasSolid = solidTop > layer.y0 + 0.001;
    const frameBottom = Math.max(layer.y0, profile.floorY);
    const hasFrame = layer.y1 > frameBottom + 0.001;

    return (
        <group>
            {hasSolid && (
                <LayerBox y0={layer.y0} y1={solidTop} color={layer.color} />
            )}
            {hasFrame && (
                <LayerFrame
                    y0={frameBottom}
                    y1={layer.y1}
                    layer={layer}
                    profile={profile}
                />
            )}
        </group>
    );
}

function LayerBox({
    y0,
    y1,
    color,
}: {
    y0: number;
    y1: number;
    color: string;
}) {
    return (
        <mesh position={[0, (y0 + y1) / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[SKIN_WIDTH, y1 - y0, SKIN_DEPTH]} />
            <meshStandardMaterial color={color} roughness={0.88} />
        </mesh>
    );
}

function LayerFrame({
    y0,
    y1,
    layer,
    profile,
}: {
    y0: number;
    y1: number;
    layer: SkinLayer;
    profile: WoundProfile;
}) {
    const midY = (y0 + y1) / 2;
    const range = Math.max(0.001, SKIN_TOP - profile.floorY);
    const t = Math.min(1, Math.max(0, (SKIN_TOP - midY) / range));
    const holeX = Math.max(
        0.12,
        profile.surfaceHole + (profile.baseHole - profile.surfaceHole) * t,
    );
    const holeZ = holeX * 0.74;

    const height = y1 - y0;
    const centerY = (y0 + y1) / 2;
    const sideWidth = SKIN_WIDTH / 2 - holeX;
    const sideDepth = SKIN_DEPTH / 2 - holeZ;
    const sideX = (SKIN_WIDTH / 2 + holeX) / 2;
    const sideZ = (SKIN_DEPTH / 2 + holeZ) / 2;

    return (
        <group>
            <mesh position={[-sideX, centerY, 0]} castShadow receiveShadow>
                <boxGeometry args={[sideWidth, height, SKIN_DEPTH]} />
                <meshStandardMaterial color={layer.color} roughness={0.88} />
            </mesh>
            <mesh position={[sideX, centerY, 0]} castShadow receiveShadow>
                <boxGeometry args={[sideWidth, height, SKIN_DEPTH]} />
                <meshStandardMaterial color={layer.color} roughness={0.88} />
            </mesh>
            <mesh position={[0, centerY, -sideZ]} castShadow receiveShadow>
                <boxGeometry args={[holeX * 2, height, sideDepth]} />
                <meshStandardMaterial color={layer.color} roughness={0.88} />
            </mesh>
            <mesh position={[0, centerY, sideZ]} castShadow receiveShadow>
                <boxGeometry args={[holeX * 2, height, sideDepth]} />
                <meshStandardMaterial color={layer.color} roughness={0.88} />
            </mesh>
        </group>
    );
}

/** 创底、腐肉、焦痂、骨/肌腱、红斑和水疱都在这里 */
function WoundSurface({ wound }: { wound: WoundProfile }) {
    const open = wound.surfaceHole > 0;
    const baseColor = BASE_TISSUE_COLORS[wound.baseLayer];
    const baseHole = Math.max(0.2, wound.baseHole);
    const sloughCount = Math.round((wound.slough ?? 0) * SLOUGH_SPOTS.length);

    return (
        <group>
            {open && (
                <>
                    <mesh
                        position={[0, wound.floorY + 0.008, 0]}
                        rotation={[-Math.PI / 2, 0, 0]}
                        receiveShadow
                    >
                        <circleGeometry args={[1, 40]} />
                        <meshStandardMaterial
                            color={baseColor}
                            roughness={0.92}
                        />
                    </mesh>

                    {wound.baseLayer !== "bone" && (
                        <mesh
                            position={[0, wound.floorY + 0.016, 0]}
                            rotation={[-Math.PI / 2, 0, 0]}
                            scale={[baseHole * 0.58, baseHole * 0.42, 1]}
                        >
                            <circleGeometry args={[1, 32]} />
                            <meshStandardMaterial
                                color="#dc2626"
                                transparent
                                opacity={0.32}
                                roughness={1}
                            />
                        </mesh>
                    )}

                    <Slough
                        count={sloughCount}
                        y={wound.floorY + 0.03}
                        radius={baseHole}
                    />

                    {wound.boneExposed && (
                        <BoneDetail
                            y={wound.floorY + 0.024}
                            radius={baseHole}
                            tendon={Boolean(wound.tendonExposed)}
                        />
                    )}

                    <WoundRim hole={wound.surfaceHole} />
                </>
            )}

            {wound.eschar && <Eschar radius={wound.surfaceHole} />}

            {wound.bruise && <Bruise kind={wound.bruise} />}

            {wound.blister && <Blister x={open ? 1.05 : 0.85} />}
        </group>
    );
}

function WoundRim({ hole }: { hole: number }) {
    const holeZ = hole * 0.74;
    const thickness = 0.07;
    const y = SKIN_TOP + 0.012;

    return (
        <group>
            <mesh position={[-hole, y, 0]}>
                <boxGeometry args={[thickness, 0.03, holeZ * 2 + 0.12]} />
                <meshStandardMaterial color="#9f1239" roughness={0.8} />
            </mesh>
            <mesh position={[hole, y, 0]}>
                <boxGeometry args={[thickness, 0.03, holeZ * 2 + 0.12]} />
                <meshStandardMaterial color="#9f1239" roughness={0.8} />
            </mesh>
            <mesh position={[0, y, -holeZ]}>
                <boxGeometry args={[hole * 2 + 0.12, 0.03, thickness]} />
                <meshStandardMaterial color="#9f1239" roughness={0.8} />
            </mesh>
            <mesh position={[0, y, holeZ]}>
                <boxGeometry args={[hole * 2 + 0.12, 0.03, thickness]} />
                <meshStandardMaterial color="#9f1239" roughness={0.8} />
            </mesh>
        </group>
    );
}

function Slough({
    count,
    y,
    radius,
}: {
    count: number;
    y: number;
    radius: number;
}) {
    const spots = SLOUGH_SPOTS.slice(0, Math.min(count, SLOUGH_SPOTS.length));
    return (
        <group>
            {spots.map((spot, index) => (
                <mesh
                    key={index}
                    position={[
                        spot.x * radius,
                        y + index * 0.002,
                        spot.z * radius * 0.74,
                    ]}
                    scale={[spot.s * radius, 0.055, spot.s * radius * 0.8]}
                >
                    <sphereGeometry args={[1, 9, 7]} />
                    <meshStandardMaterial
                        color={index % 2 === 0 ? "#eab308" : "#facc15"}
                        roughness={0.95}
                    />
                </mesh>
            ))}
        </group>
    );
}

function BoneDetail({
    y,
    radius,
    tendon,
}: {
    y: number;
    radius: number;
    tendon: boolean;
}) {
    return (
        <group position={[0, y, 0]}>
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                scale={[radius * 0.92, radius * 0.64, 1]}
            >
                <circleGeometry args={[1, 32]} />
                <meshStandardMaterial
                    color="#f1ece1"
                    roughness={0.7}
                    emissive="#f8fafc"
                    emissiveIntensity={0.06}
                />
            </mesh>
            {tendon && (
                <>
                    <mesh rotation={[0, 0.34, 0]} position={[0, 0.012, 0]}>
                        <boxGeometry args={[radius * 1.45, 0.04, 0.09]} />
                        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
                    </mesh>
                    <mesh rotation={[0, -0.52, 0]} position={[0.08, 0.02, 0.1]}>
                        <boxGeometry args={[radius * 1.1, 0.035, 0.07]} />
                        <meshStandardMaterial
                            color="#e2e8f0"
                            roughness={0.55}
                        />
                    </mesh>
                </>
            )}
        </group>
    );
}

function Eschar({ radius }: { radius: number }) {
    return (
        <group position={[0, SKIN_TOP + 0.045, 0]}>
            <mesh rotation={[0, 0.12, 0]}>
                <boxGeometry args={[radius * 2.35, 0.1, radius * 1.7]} />
                <meshStandardMaterial color="#2d1b12" roughness={0.96} />
            </mesh>
            <mesh position={[0.08, 0.07, 0.03]} rotation={[0, -0.24, 0]}>
                <boxGeometry args={[radius * 1.55, 0.07, radius * 1.12]} />
                <meshStandardMaterial color="#4a2a17" roughness={0.92} />
            </mesh>
            <mesh
                position={[-radius * 0.86, -0.01, radius * 0.42]}
                scale={[radius * 0.3, 0.05, radius * 0.24]}
            >
                <sphereGeometry args={[1, 9, 7]} />
                <meshStandardMaterial color="#eab308" roughness={0.95} />
            </mesh>
            <mesh
                position={[radius * 0.78, -0.01, -radius * 0.38]}
                scale={[radius * 0.26, 0.05, radius * 0.2]}
            >
                <sphereGeometry args={[1, 9, 7]} />
                <meshStandardMaterial color="#facc15" roughness={0.95} />
            </mesh>
        </group>
    );
}

function Bruise({ kind }: { kind: BruiseKind }) {
    const deep = kind === "deep";
    return (
        <group position={[0, SKIN_TOP + 0.007, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.12, 0.76, 1]}>
                <circleGeometry args={[1, 40]} />
                <meshStandardMaterial
                    color={deep ? "#4c1d95" : "#dc2626"}
                    transparent
                    opacity={deep ? 0.82 : 0.5}
                    roughness={0.72}
                />
            </mesh>
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0.12, 0.003, 0.06]}
                scale={[0.55, 0.38, 1]}
            >
                <circleGeometry args={[1, 32]} />
                <meshStandardMaterial
                    color={deep ? "#2e1065" : "#f87171"}
                    transparent
                    opacity={deep ? 0.9 : 0.55}
                    roughness={0.8}
                />
            </mesh>
        </group>
    );
}

function Blister({ x }: { x: number }) {
    return (
        <group position={[x, SKIN_TOP + 0.02, 0.38]}>
            <mesh scale={[0.42, 0.18, 0.34]}>
                <sphereGeometry args={[1, 18, 12]} />
                <meshStandardMaterial
                    color="#fda4af"
                    transparent
                    opacity={0.82}
                    roughness={0.24}
                    metalness={0.05}
                />
            </mesh>
            <mesh
                position={[0, -0.012, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                scale={[0.44, 0.35, 1]}
            >
                <ringGeometry args={[0.86, 1, 28]} />
                <meshBasicMaterial
                    color="#be123c"
                    transparent
                    opacity={0.32}
                    depthWrite={false}
                />
            </mesh>
        </group>
    );
}

function Probe({
    active,
    floorY,
    blocked,
}: {
    active: boolean;
    floorY: number;
    blocked: boolean;
}) {
    const ref = useRef<Group>(null);
    const targetY = useRef(PROBE_REST_Y);
    targetY.current = active
        ? blocked
            ? SKIN_TOP + 0.16
            : floorY + 0.1
        : PROBE_REST_Y;

    useFrame((_, delta) => {
        const node = ref.current;
        if (!node) return;
        const k = 1 - Math.exp(-6 * Math.min(delta, 0.1));
        node.position.y += (targetY.current - node.position.y) * k;
    });

    return (
        <group ref={ref} position={[0, PROBE_REST_Y, 0]}>
            <mesh position={[0, 1.9, 0]}>
                <cylinderGeometry args={[0.024, 0.024, 3.8, 8]} />
                <meshStandardMaterial
                    color="#e2e8f0"
                    metalness={0.75}
                    roughness={0.22}
                />
            </mesh>
            <mesh position={[0, 3.86, 0]}>
                <cylinderGeometry args={[0.075, 0.075, 0.18, 8]} />
                <meshStandardMaterial
                    color="#1e293b"
                    metalness={0.4}
                    roughness={0.4}
                />
            </mesh>
            <mesh>
                <sphereGeometry args={[0.062, 12, 10]} />
                <meshStandardMaterial
                    color={active ? "#c4b5fd" : "#38bdf8"}
                    emissive={active ? "#a78bfa" : "#0ea5e9"}
                    emissiveIntensity={active ? 1.3 : 0.4}
                    roughness={0.3}
                />
            </mesh>
        </group>
    );
}
