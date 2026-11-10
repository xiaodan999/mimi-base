/* eslint-disable react/no-unknown-property -- react-three-fiber 的 JSX 属性不在 react 规则表里 */
import { OrbitControls, useCursor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useState } from "react";

import type { Hazard } from "./hazards";
import {
    Bed,
    BloodBag,
    Cabinet,
    CallButton,
    Clickable,
    CrashCart,
    Extinguisher,
    FireDoor,
    Fridge,
    FridgeLight,
    HandSan,
    IVStand,
    MedCart,
    Nightstand,
    NurseStation,
    Oxygen,
    PCA,
    Phone,
    Puddle,
    Rail,
    Shoes,
    Sink,
    type Vec3,
    Vials,
    WarningTag,
    Wheelchair,
    Wristband,
} from "./models";

type Props = {
    hazards: Hazard[];
    fixed: Set<string>;
    selected: string | null;
    onSelect: (objectId: string) => void;
    /** 列表模式下不渲染 3D 对勾 */
    showChecks?: boolean;
};

export default function WardScene(props: Props) {
    return (
        <Canvas
            shadows
            dpr={[1, 1.6]}
            camera={{ position: [9, 8, 9], fov: 38, near: 0.1, far: 60 }}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            className="ward-canvas"
        >
            <color attach="background" args={["#0b1220"]} />
            <fog attach="fog" args={["#0b1220", 14, 28]} />
            <SceneContent {...props} />
        </Canvas>
    );
}

function SceneContent({
    hazards,
    fixed,
    selected,
    onSelect,
    showChecks = true,
}: Props) {
    const [hovered, setHovered] = useState<string | null>(null);
    useCursor(Boolean(hovered));

    const active = new Set(hazards.map((hazard) => hazard.object));
    const isActive = (id: string) => active.has(id);
    const isFixed = (id: string) => fixed.has(id);
    const clickable = (id: string) => ({
        id,
        active: isActive(id),
        fixed: isFixed(id),
        selected: selected === id,
        hovered: hovered === id,
        onSelect,
        onHover: setHovered,
        showCheck: showChecks,
    });

    return (
        <>
            <ambientLight intensity={0.55} />
            <hemisphereLight args={["#c7e5ff", "#0b1220", 0.55]} />
            <directionalLight
                position={[6, 11, 6]}
                intensity={1.5}
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-camera-left={-9}
                shadow-camera-right={9}
                shadow-camera-top={9}
                shadow-camera-bottom={-9}
            />
            <pointLight
                position={[-3, 2.8, -2]}
                intensity={18}
                distance={8}
                color="#bae6fd"
            />
            <pointLight
                position={[3, 2.6, 2.5]}
                intensity={14}
                distance={8}
                color="#fef3c7"
            />

            {/* 地面与墙 */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
                position={[0, 0, 0]}
            >
                <planeGeometry args={[12, 10]} />
                <meshStandardMaterial color="#17263b" roughness={0.95} />
            </mesh>
            <gridHelper
                args={[12, 12, "#2b4a6b", "#1b3048"]}
                position={[0, 0.012, 0]}
            />
            <mesh position={[0, 1.5, -5]} receiveShadow>
                <boxGeometry args={[12, 3, 0.2]} />
                <meshStandardMaterial color="#22344d" roughness={0.9} />
            </mesh>
            <mesh position={[-6, 1.5, 0]} receiveShadow>
                <boxGeometry args={[0.2, 3, 10]} />
                <meshStandardMaterial color="#1c2c43" roughness={0.9} />
            </mesh>
            <mesh position={[0, 2.1, -4.88]}>
                <boxGeometry args={[2.4, 1.4, 0.04]} />
                <meshStandardMaterial
                    color="#0ea5e9"
                    emissive="#0ea5e9"
                    emissiveIntensity={0.65}
                />
            </mesh>
            {[-1.2, 1.2].map((x) => (
                <mesh key={x} position={[x, 2.1, -4.84]}>
                    <boxGeometry args={[0.06, 1.5, 0.06]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
            ))}

            {/* 四张床 */}
            <Bed position={[-3.5, 0, -2.5]} blanket="#38bdf8" />
            <Bed position={[-3.5, 0, 1.5]} blanket="#a78bfa" />
            <Bed position={[0, 0, -2.5]} blanket="#34d399" />
            <Bed position={[0, 0, 1.5]} blanket="#fbbf24" />

            <Nightstand position={[-2.15, 0, -2.5]} />
            <Nightstand position={[-2.15, 0, 1.5]} />
            <Nightstand position={[1.35, 0, -2.5]} />
            <Nightstand position={[1.35, 0, 1.5]} />

            {/* 床栏：1 床是隐患对象，其余床栏常闭 */}
            <Clickable
                {...clickable("rail-a")}
                position={[-3.5, 0.95, -2.0]}
                hitRadius={0.45}
            >
                <Rail down={isActive("rail-a") && !isFixed("rail-a")} />
            </Clickable>
            <StaticRail position={[-3.5, 0.95, 2.0]} />
            <StaticRail position={[0, 0.95, -2.0]} />
            <StaticRail position={[0, 0.95, 2.0]} />

            {/* 呼叫器 */}
            <Clickable
                {...clickable("call-b")}
                position={[-2.15, 0.6, 1.5]}
                hitRadius={0.2}
            >
                <CallButton near={!isActive("call-b") || isFixed("call-b")} />
            </Clickable>

            {/* 腕带 */}
            <Clickable
                {...clickable("wrist-c")}
                position={[-0.5, 0.86, -2.5]}
                hitRadius={0.16}
            >
                <Wristband
                    position={[0, 0, 0]}
                    fixed={!isActive("wrist-c") || isFixed("wrist-c")}
                />
            </Clickable>

            {/* 洗手池与地面水渍 */}
            <Sink position={[-5.2, 0, 3.5]} />
            <Clickable
                {...clickable("wet-floor")}
                position={[-4.5, 0.02, 3.1]}
                hitRadius={0.45}
            >
                <Puddle
                    fixed={!isActive("wet-floor") || isFixed("wet-floor")}
                />
            </Clickable>

            {/* 治疗车与高危药 */}
            <MedCart position={[3, 0, -1.5]} />
            <Clickable
                {...clickable("med-label")}
                position={[3, 1.14, -1.5]}
                hitRadius={0.28}
            >
                <Vials position={[0, 0, 0]} />
                <WarningTag
                    good={!isActive("med-label") || isFixed("med-label")}
                />
            </Clickable>

            {/* 麻精柜 */}
            <Cabinet
                position={[4.9, 0, 2.4]}
                open={isActive("narcotics") && !isFixed("narcotics")}
            />
            <Clickable
                {...clickable("narcotics")}
                position={[4.9, 1.1, 2.4]}
                hitRadius={0.5}
            >
                <mesh castShadow>
                    <boxGeometry args={[0.14, 0.18, 0.1]} />
                    <meshStandardMaterial
                        color={
                            isActive("narcotics") && !isFixed("narcotics")
                                ? "#fbbf24"
                                : "#94a3b8"
                        }
                    />
                </mesh>
            </Clickable>

            {/* 药品冰箱 */}
            <Fridge position={[4.9, 0, 0.4]} />
            <group position={[4.9, 0, 0.4]}>
                <FridgeLight good={!isActive("fridge") || isFixed("fridge")} />
            </group>
            <Clickable
                {...clickable("fridge")}
                position={[4.42, 1.0, 0.4]}
                hitRadius={0.4}
            >
                <mesh>
                    <boxGeometry args={[0.05, 0.28, 0.2]} />
                    <meshStandardMaterial
                        color={
                            isActive("fridge") && !isFixed("fridge")
                                ? "#fb7185"
                                : "#34d399"
                        }
                    />
                </mesh>
            </Clickable>

            {/* 氧气筒与电暖器 */}
            <Oxygen
                position={[-5.2, 0, -4.2]}
                fixed={!isActive("oxygen") || isFixed("oxygen")}
            />
            <Clickable
                {...clickable("oxygen")}
                position={[-5.2, 0.85, -4.2]}
                hitRadius={0.55}
            ></Clickable>

            {/* 防火门 */}
            <FireDoor
                position={[3, 0, -4.85]}
                blocked={isActive("fire-door") && !isFixed("fire-door")}
            />
            <Clickable
                {...clickable("fire-door")}
                position={[3, 1.1, -4.65]}
                hitRadius={0.7}
            ></Clickable>

            {/* 灭火器 */}
            <Extinguisher
                position={[5.5, 0, -4]}
                good={!isActive("extinguisher") || isFixed("extinguisher")}
            />
            <Clickable
                {...clickable("extinguisher")}
                position={[5.5, 0.6, -4]}
                hitRadius={0.45}
            ></Clickable>

            {/* 抢救车 */}
            <CrashCart
                position={[2, 0, 3.8]}
                open={isActive("crash-cart") && !isFixed("crash-cart")}
            />
            <Clickable
                {...clickable("crash-cart")}
                position={[2, 0.8, 3.8]}
                hitRadius={0.55}
            ></Clickable>

            {/* PCA 与输血袋 */}
            <IVStand position={[-2.4, 0, 2.2]} />
            <PCA
                position={[-2.4, 1.1, 2.2]}
                fixed={!isActive("pca") || isFixed("pca")}
            />
            <Clickable
                {...clickable("pca")}
                position={[-2.4, 1.1, 2.2]}
                hitRadius={0.3}
            ></Clickable>

            <IVStand position={[1.4, 0, 2.2]} />
            <BloodBag
                position={[1.4, 1.5, 2.2]}
                fixed={!isActive("blood-bag") || isFixed("blood-bag")}
            />
            <Clickable
                {...clickable("blood-bag")}
                position={[1.4, 1.22, 2.2]}
                hitRadius={0.3}
            ></Clickable>

            {/* 拖鞋 */}
            <Shoes
                position={[0.8, 0.08, 2.6]}
                fixed={!isActive("shoes") || isFixed("shoes")}
            />
            <Clickable
                {...clickable("shoes")}
                position={[0.8, 0.12, 2.6]}
                hitRadius={0.3}
            ></Clickable>

            {/* 护士站与电话 */}
            <NurseStation position={[4, 0, -3]} />
            <Phone
                position={[4.2, 1.02, -2.9]}
                good={!isActive("phone") || isFixed("phone")}
            />
            <Clickable
                {...clickable("phone")}
                position={[4.2, 1.05, -2.9]}
                hitRadius={0.3}
            ></Clickable>

            {/* 手消毒剂 */}
            <HandSan
                position={[1.2, 0, 3.8]}
                good={!isActive("hand-san") || isFixed("hand-san")}
            />
            <Clickable
                {...clickable("hand-san")}
                position={[1.2, 0.8, 3.8]}
                hitRadius={0.3}
            ></Clickable>

            <Wheelchair position={[-1.4, 0, 3.5]} />

            <OrbitControls
                makeDefault
                enablePan={false}
                minDistance={7}
                maxDistance={16}
                minPolarAngle={0.55}
                maxPolarAngle={1.28}
                target={[0, 0.8, 0]}
                rotateSpeed={0.6}
                zoomSpeed={0.8}
            />
        </>
    );
}

function StaticRail({ position }: { position: Vec3 }) {
    return (
        <group position={position}>
            <Rail />
        </group>
    );
}
