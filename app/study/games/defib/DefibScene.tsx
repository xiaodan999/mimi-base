/* eslint-disable react/no-unknown-property -- react-three-fiber 的 JSX 属性不在 react 规则表里 */
import { useState } from "react";
import { OrbitControls, useCursor } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { DoubleSide } from "three";

import {
    LEAD_DEFS,
    LEAD_ZONES,
    PAD_TARGETS,
    PAD_ZONES,
    type BodyZone,
    type LeadDef,
    type LeadId,
    type PadTarget,
} from "./data";

type Props = {
    mode: "leads" | "pads";
    placedLeads: ReadonlySet<LeadId>;
    placedPads: ReadonlySet<string>;
    onPickZone: (zoneId: string) => void;
};

const SKIN = "#d9a690";
const SKIN_DARK = "#b07462";
const SKIN_DEEP = "#8f5c50";

const DPR: [number, number] = [1, 1.6];
const CAMERA = {
    position: [1.25, 1.85, 4.1] as [number, number, number],
    fov: 38,
    near: 0.1,
    far: 40,
};
const GL = {
    antialias: true,
    powerPreference: "high-performance" as const,
};

export function supportsWebGL(): boolean {
    if (typeof document === "undefined") return false;
    try {
        const canvas = document.createElement("canvas");
        return Boolean(
            canvas.getContext("webgl2") || canvas.getContext("webgl"),
        );
    } catch {
        return false;
    }
}

export default function DefibScene(props: Props) {
    return (
        <Canvas dpr={DPR} camera={CAMERA} gl={GL} className="defib-canvas">
            <color attach="background" args={["#0b1220"]} />
            <fog attach="fog" args={["#0b1220", 8, 18]} />
            <SceneContent {...props} />
        </Canvas>
    );
}

function SceneContent({ mode, placedLeads, placedPads, onPickZone }: Props) {
    const [hovered, setHovered] = useState<string | null>(null);
    useCursor(Boolean(hovered));

    const zones = mode === "leads" ? LEAD_ZONES : PAD_ZONES;
    const isZoneDone = (zone: BodyZone) =>
        mode === "leads"
            ? Boolean(zone.lead && placedLeads.has(zone.lead))
            : placedPads.has(zone.id);

    return (
        <>
            <ambientLight intensity={0.55} />
            <hemisphereLight args={["#d8ecff", "#0b1220", 0.6]} />
            <directionalLight
                position={[4, 7, 5]}
                intensity={1.35}
                color="#e0f2fe"
            />
            <directionalLight
                position={[-4, 3, -3]}
                intensity={0.5}
                color="#38bdf8"
            />
            <pointLight
                position={[-2.6, 2.3, 2.4]}
                intensity={14}
                distance={9}
                color="#38bdf8"
            />
            <pointLight
                position={[2.5, 1.5, 3]}
                intensity={9}
                distance={8}
                color="#fbbf24"
            />

            <Torso />

            {LEAD_DEFS.map((lead) =>
                placedLeads.has(lead.id) ? (
                    <LeadMarker key={lead.id} lead={lead} />
                ) : null,
            )}

            {PAD_TARGETS.map((target) =>
                placedPads.has(target.id) ? (
                    <PadMarker key={target.id} target={target} />
                ) : null,
            )}

            {zones.map((zone) =>
                isZoneDone(zone) ? null : (
                    <ZoneHit
                        key={zone.id}
                        zone={zone}
                        mode={mode}
                        hovered={hovered === zone.id}
                        onHover={setHovered}
                        onPick={onPickZone}
                    />
                ),
            )}

            <OrbitControls
                makeDefault
                enablePan={false}
                minDistance={2.7}
                maxDistance={7}
                minPolarAngle={0.35}
                maxPolarAngle={1.7}
                target={[0, 0.95, 0]}
                rotateSpeed={0.7}
                zoomSpeed={0.8}
            />
        </>
    );
}

function Torso() {
    const arms = [
        { x: -0.64, tilt: -0.08 },
        { x: 0.64, tilt: 0.08 },
    ];

    return (
        <group>
            {/* 检查床底座 */}
            <mesh position={[0, -0.47, 0]}>
                <cylinderGeometry args={[0.95, 1.05, 0.09, 24]} />
                <meshStandardMaterial color="#101d2e" roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.78, 0.9, 32]} />
                <meshBasicMaterial
                    color="#22405d"
                    transparent
                    opacity={0.65}
                    side={DoubleSide}
                />
            </mesh>

            {/* 双腿 */}
            {[-0.19, 0.19].map((x) => (
                <mesh key={x} position={[x, 0.04, 0.02]}>
                    <capsuleGeometry args={[0.11, 0.55, 4, 10]} />
                    <meshStandardMaterial
                        color={SKIN}
                        roughness={0.85}
                        flatShading
                    />
                </mesh>
            ))}

            {/* 骨盆、腹部、胸廓 */}
            <mesh position={[0, 0.43, 0]} scale={[1.1, 0.75, 0.62]}>
                <sphereGeometry args={[0.38, 12, 10]} />
                <meshStandardMaterial
                    color={SKIN}
                    roughness={0.85}
                    flatShading
                />
            </mesh>
            <mesh position={[0, 0.82, 0]} scale={[1.06, 1.02, 0.58]}>
                <sphereGeometry args={[0.4, 12, 10]} />
                <meshStandardMaterial
                    color={SKIN}
                    roughness={0.85}
                    flatShading
                />
            </mesh>
            <mesh position={[0, 1.3, 0]} scale={[1, 1.12, 0.62]}>
                <sphereGeometry args={[0.5, 12, 10]} />
                <meshStandardMaterial
                    color={SKIN}
                    roughness={0.85}
                    flatShading
                />
            </mesh>

            {/* 肩、手臂、手 */}
            {[-0.47, 0.47].map((x) => (
                <mesh
                    key={x}
                    position={[x, 1.52, 0]}
                    rotation={[0, 0, Math.PI / 2]}
                >
                    <capsuleGeometry args={[0.14, 0.26, 4, 10]} />
                    <meshStandardMaterial
                        color={SKIN}
                        roughness={0.85}
                        flatShading
                    />
                </mesh>
            ))}
            {arms.map((arm) => (
                <group key={arm.x}>
                    <mesh
                        position={[arm.x, 1.2, 0]}
                        rotation={[0, 0, arm.tilt]}
                    >
                        <capsuleGeometry args={[0.085, 0.42, 4, 8]} />
                        <meshStandardMaterial
                            color={SKIN}
                            roughness={0.85}
                            flatShading
                        />
                    </mesh>
                    <mesh
                        position={[arm.x * 1.06, 0.78, 0.02]}
                        rotation={[0, 0, arm.tilt * 0.5]}
                    >
                        <capsuleGeometry args={[0.075, 0.4, 4, 8]} />
                        <meshStandardMaterial
                            color={SKIN}
                            roughness={0.85}
                            flatShading
                        />
                    </mesh>
                    <mesh position={[arm.x * 1.1, 0.53, 0.03]}>
                        <sphereGeometry args={[0.08, 10, 8]} />
                        <meshStandardMaterial
                            color={SKIN}
                            roughness={0.85}
                            flatShading
                        />
                    </mesh>
                </group>
            ))}

            {/* 颈部与头部 */}
            <mesh position={[0, 1.7, 0.01]}>
                <cylinderGeometry args={[0.1, 0.11, 0.22, 10]} />
                <meshStandardMaterial
                    color={SKIN}
                    roughness={0.85}
                    flatShading
                />
            </mesh>
            <mesh position={[0, 1.93, 0.02]} scale={[0.92, 1.04, 0.94]}>
                <sphereGeometry args={[0.2, 12, 10]} />
                <meshStandardMaterial
                    color={SKIN}
                    roughness={0.85}
                    flatShading
                />
            </mesh>

            {/* 体表标志：胸骨、锁骨、肋骨、肋弓 */}
            <mesh position={[0, 1.25, 0.303]}>
                <boxGeometry args={[0.03, 0.37, 0.02]} />
                <meshStandardMaterial color={SKIN_DARK} roughness={0.9} />
            </mesh>
            {[-0.21, 0.21].map((x) => (
                <mesh
                    key={x}
                    position={[x, 1.54, 0.255]}
                    rotation={[0, 0, x < 0 ? 0.09 : -0.09]}
                >
                    <boxGeometry args={[0.36, 0.028, 0.024]} />
                    <meshStandardMaterial color={SKIN_DARK} roughness={0.9} />
                </mesh>
            ))}
            {[
                { x: -0.34, y: 1.22, z: 0.235, r: 0.3 },
                { x: -0.33, y: 1.1, z: 0.215, r: 0.36 },
                { x: 0.34, y: 1.22, z: 0.235, r: -0.3 },
                { x: 0.33, y: 1.1, z: 0.215, r: -0.36 },
            ].map((rib) => (
                <mesh
                    key={`${rib.x}-${rib.y}`}
                    position={[rib.x, rib.y, rib.z]}
                    rotation={[0, 0, rib.r]}
                >
                    <boxGeometry args={[0.15, 0.016, 0.018]} />
                    <meshStandardMaterial color={SKIN_DARK} roughness={0.9} />
                </mesh>
            ))}
            {[
                { x: -0.17, r: 0.5 },
                { x: 0.17, r: -0.5 },
            ].map((margin) => (
                <mesh
                    key={margin.x}
                    position={[margin.x, 0.99, 0.245]}
                    rotation={[0, 0, margin.r]}
                >
                    <boxGeometry args={[0.28, 0.02, 0.02]} />
                    <meshStandardMaterial color={SKIN_DARK} roughness={0.9} />
                </mesh>
            ))}

            {/* 乳头、脐、腹白线、腋前线 */}
            {[-0.24, 0.24].map((x) => (
                <mesh
                    key={x}
                    position={[x, 1.12, 0.265]}
                    rotation={[Math.PI / 2, 0, 0]}
                >
                    <cylinderGeometry args={[0.024, 0.024, 0.012, 10]} />
                    <meshStandardMaterial color={SKIN_DARK} roughness={0.9} />
                </mesh>
            ))}
            <mesh position={[0, 0.78, 0.235]}>
                <sphereGeometry args={[0.024, 10, 8]} />
                <meshStandardMaterial color={SKIN_DEEP} roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.6, 0.2]}>
                <boxGeometry args={[0.018, 0.3, 0.012]} />
                <meshStandardMaterial color={SKIN_DARK} roughness={0.9} />
            </mesh>
            {[
                { x: -0.38, r: -1.2 },
                { x: 0.38, r: 1.2 },
            ].map((line) => (
                <mesh
                    key={line.x}
                    position={[line.x, 0.95, 0.075]}
                    rotation={[0, line.r, 0]}
                >
                    <boxGeometry args={[0.012, 0.46, 0.01]} />
                    <meshStandardMaterial color={SKIN_DARK} roughness={0.9} />
                </mesh>
            ))}
        </group>
    );
}

function ZoneHit({
    zone,
    mode,
    hovered,
    onHover,
    onPick,
}: {
    zone: BodyZone;
    mode: "leads" | "pads";
    hovered: boolean;
    onHover: (zoneId: string | null) => void;
    onPick: (zoneId: string) => void;
}) {
    const color = hovered ? "#fbbf24" : mode === "pads" ? "#fbbf24" : "#38bdf8";
    const outer = mode === "pads" ? 0.13 : 0.078;
    const inner = mode === "pads" ? 0.095 : 0.05;

    return (
        <group position={zone.position} rotation={zone.rotation ?? [0, 0, 0]}>
            <mesh>
                <ringGeometry args={[inner, outer, 24]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={hovered ? 0.95 : 0.55}
                    side={DoubleSide}
                    depthWrite={false}
                />
            </mesh>
            <mesh>
                <circleGeometry args={[mode === "pads" ? 0.028 : 0.016, 12]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.9}
                    side={DoubleSide}
                    depthWrite={false}
                />
            </mesh>
            <mesh
                onClick={(event: ThreeEvent<MouseEvent>) => {
                    event.stopPropagation();
                    onHover(null);
                    onPick(zone.id);
                }}
                onPointerOver={(event) => {
                    event.stopPropagation();
                    onHover(zone.id);
                }}
                onPointerOut={(event) => {
                    event.stopPropagation();
                    onHover(null);
                }}
            >
                <sphereGeometry args={[zone.hitRadius ?? 0.14, 10, 10]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
        </group>
    );
}

function LeadMarker({ lead }: { lead: LeadDef }) {
    const zone = LEAD_ZONES.find((item) => item.lead === lead.id);
    if (!zone) return null;
    const ring = lead.id === "black" ? "#cbd5e1" : "#0b1220";

    return (
        <group position={zone.position} rotation={zone.rotation ?? [0, 0, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.052, 0.052, 0.02, 14]} />
                <meshStandardMaterial
                    color={lead.color}
                    roughness={0.45}
                    metalness={0.15}
                />
            </mesh>
            <mesh position={[0, 0, 0.014]}>
                <torusGeometry args={[0.052, 0.008, 6, 18]} />
                <meshStandardMaterial color={ring} roughness={0.4} />
            </mesh>
        </group>
    );
}

function PadMarker({ target }: { target: PadTarget }) {
    return (
        <group position={target.position} rotation={target.rotation}>
            <mesh>
                <boxGeometry args={[0.22, 0.17, 0.025]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.55} />
            </mesh>
            <mesh position={[0, 0, 0.016]}>
                <boxGeometry args={[0.17, 0.12, 0.01]} />
                <meshStandardMaterial
                    color="#fbbf24"
                    emissive="#f59e0b"
                    emissiveIntensity={0.35}
                    roughness={0.4}
                />
            </mesh>
            <mesh position={[0.08, -0.13, 0.005]} rotation={[0, 0, 0.55]}>
                <cylinderGeometry args={[0.01, 0.01, 0.16, 6]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.4} />
            </mesh>
        </group>
    );
}
