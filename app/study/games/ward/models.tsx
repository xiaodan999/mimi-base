/* eslint-disable react/no-unknown-property -- react-three-fiber 的 JSX 属性不在 react 规则表里 */
import { Html } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { type ReactNode, useEffect, useRef } from "react";
import { DoubleSide, Group, Mesh, Vector3 } from "three";

export type Vec3 = [number, number, number];

const METAL = "#94a3b8";
const RAIL = "#7dd3fc";
const DARK = "#1e293b";

/* ---------------- 交互外壳 ---------------- */

type ClickableProps = {
    id: string;
    position: Vec3;
    active: boolean;
    fixed: boolean;
    selected: boolean;
    hovered: boolean;
    onSelect: (objectId: string) => void;
    onHover: (objectId: string | null) => void;
    hitRadius?: number;
    /** 列表模式下关掉 3D 对勾，避免 Html 浮层盖到列表上 */
    showCheck?: boolean;
    children?: ReactNode;
};

export function Clickable({
    id,
    position,
    active,
    fixed,
    selected,
    hovered,
    onSelect,
    onHover,
    hitRadius = 0.22,
    showCheck = true,
    children,
}: ClickableProps) {
    const ringY = -position[1] + 0.03;

    return (
        <group position={position}>
            <group
                onClick={(event: ThreeEvent<MouseEvent>) => {
                    event.stopPropagation();
                    onSelect(id);
                }}
                onPointerOver={(event) => {
                    event.stopPropagation();
                    onHover(id);
                }}
                onPointerOut={(event) => {
                    event.stopPropagation();
                    onHover(null);
                }}
            >
                {children}
                {hitRadius > 0 && (
                    <mesh>
                        <sphereGeometry args={[hitRadius, 10, 10]} />
                        <meshBasicMaterial
                            transparent
                            opacity={0}
                            depthWrite={false}
                        />
                    </mesh>
                )}
            </group>
            {active && (selected || hovered) && (
                <FocusRing y={ringY} color={selected ? "#38bdf8" : "#94a3b8"} />
            )}
            {active && fixed && showCheck && (
                <Html
                    position={[0, 0.9, 0]}
                    center
                    zIndexRange={[20, 0]}
                    style={{ pointerEvents: "none" }}
                >
                    <span className="ward-check">✓</span>
                </Html>
            )}
        </group>
    );
}

function FocusRing({ y, color }: { y: number; color: string }) {
    const ref = useRef<Mesh>(null);
    useFrame(({ clock }) => {
        if (!ref.current) return;
        const scale = 1 + Math.sin(clock.elapsedTime * 4) * 0.05;
        ref.current.scale.setScalar(scale);
    });
    return (
        <mesh ref={ref} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 0.58, 32]} />
            <meshBasicMaterial
                color={color}
                transparent
                opacity={0.9}
                side={DoubleSide}
                depthWrite={false}
            />
        </mesh>
    );
}

/** 从 from 平滑移动到 to；from 保持不变，to 变化时自动动画 */
export function MovingGroup({
    from,
    to,
    children,
}: {
    from: Vec3;
    to: Vec3;
    children: ReactNode;
}) {
    const ref = useRef<Group>(null);
    const target = useRef(new Vector3(...to));
    target.current.set(...to);
    const [fx, fy, fz] = from;

    useEffect(() => {
        if (ref.current) ref.current.position.set(fx, fy, fz);
    }, [fx, fy, fz]);

    useFrame((_, delta) => {
        if (!ref.current) return;
        const k = 1 - Math.exp(-8 * Math.min(delta, 0.1));
        ref.current.position.lerp(target.current, k);
    });

    return (
        <group ref={ref} position={from}>
            {children}
        </group>
    );
}

function Door({
    open,
    hinge,
    width,
    height,
    color,
    children,
}: {
    open: boolean;
    hinge: Vec3;
    width: number;
    height: number;
    color: string;
    children?: ReactNode;
}) {
    const ref = useRef<Group>(null);
    useFrame((_, delta) => {
        if (!ref.current) return;
        const target = open ? -1.15 : 0;
        ref.current.rotation.y +=
            (target - ref.current.rotation.y) *
            (1 - Math.exp(-8 * Math.min(delta, 0.1)));
    });
    return (
        <group position={hinge} ref={ref}>
            <mesh
                position={[width / 2, height / 2, 0]}
                castShadow
                receiveShadow
            >
                <boxGeometry args={[width, height, 0.07]} />
                <meshStandardMaterial color={color} roughness={0.6} />
            </mesh>
            {children}
        </group>
    );
}

/* ---------------- 病房家具 ---------------- */

export function Bed({
    position,
    blanket = "#38bdf8",
}: {
    position: Vec3;
    blanket?: string;
}) {
    return (
        <group position={position}>
            <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
                <boxGeometry args={[2.1, 0.22, 1.0]} />
                <meshStandardMaterial color="#334155" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.58, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.98, 0.16, 0.92]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.95} />
            </mesh>
            <mesh position={[-0.72, 0.7, 0]} castShadow>
                <boxGeometry args={[0.42, 0.12, 0.5]} />
                <meshStandardMaterial color="#f8fafc" />
            </mesh>
            {/* 患者 */}
            <mesh
                position={[0.08, 0.78, 0]}
                rotation={[0, 0, Math.PI / 2]}
                castShadow
            >
                <capsuleGeometry args={[0.16, 0.58, 4, 8]} />
                <meshStandardMaterial color="#5eead4" roughness={0.8} />
            </mesh>
            <mesh position={[-0.5, 0.82, 0]} castShadow>
                <sphereGeometry args={[0.14, 14, 12]} />
                <meshStandardMaterial color="#f5c6a5" roughness={0.85} />
            </mesh>
            <mesh position={[0.42, 0.73, 0]} castShadow>
                <boxGeometry args={[0.95, 0.07, 0.86]} />
                <meshStandardMaterial color={blanket} roughness={0.9} />
            </mesh>
            {/* 床腿 */}
            {[
                [-0.95, 0.2, -0.4],
                [0.95, 0.2, -0.4],
                [-0.95, 0.2, 0.4],
                [0.95, 0.2, 0.4],
            ].map((leg) => (
                <mesh key={leg.join(",")} position={leg as Vec3} castShadow>
                    <cylinderGeometry args={[0.045, 0.045, 0.4, 8]} />
                    <meshStandardMaterial color={METAL} metalness={0.4} />
                </mesh>
            ))}
            {/* 床头床尾 */}
            {[-1.05, 1.05].map((x) => (
                <mesh key={x} position={[x, 0.76, 0]} castShadow>
                    <boxGeometry args={[0.07, 0.72, 1.0]} />
                    <meshStandardMaterial color={RAIL} roughness={0.45} />
                </mesh>
            ))}
            {/* 远侧床栏 */}
            <group position={[0, 0, -0.5]}>
                <Rail />
            </group>
        </group>
    );
}

export function Rail({ down = false }: { down?: boolean }) {
    const y = down ? -0.3 : 0;
    return (
        <group>
            <mesh position={[0, y, 0]} castShadow>
                <boxGeometry args={[1.5, 0.06, 0.06]} />
                <meshStandardMaterial color={RAIL} metalness={0.5} />
            </mesh>
            {[-0.7, 0.7].map((x) => (
                <mesh key={x} position={[x, y - 0.16, 0]} castShadow>
                    <boxGeometry args={[0.06, 0.38, 0.06]} />
                    <meshStandardMaterial color={RAIL} metalness={0.5} />
                </mesh>
            ))}
        </group>
    );
}

export function Nightstand({ position }: { position: Vec3 }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.62, 0.6, 0.58]} />
                <meshStandardMaterial color="#475569" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.42, 0.3]}>
                <boxGeometry args={[0.5, 0.18, 0.02]} />
                <meshStandardMaterial color="#334155" />
            </mesh>
        </group>
    );
}

export function CallButton({ near }: { near: boolean }) {
    return (
        <MovingGroup from={[0, 0, 0.28]} to={[0, 0, near ? -0.22 : 0.28]}>
            <mesh castShadow>
                <boxGeometry args={[0.22, 0.08, 0.14]} />
                <meshStandardMaterial color="#fb7185" />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
                <boxGeometry args={[0.1, 0.09, 0.08]} />
                <meshStandardMaterial color="#f8fafc" />
            </mesh>
        </MovingGroup>
    );
}

export function IVStand({ position }: { position: Vec3 }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.05, 0]} castShadow>
                <cylinderGeometry args={[0.28, 0.32, 0.08, 12]} />
                <meshStandardMaterial color={DARK} />
            </mesh>
            <mesh position={[0, 0.95, 0]} castShadow>
                <cylinderGeometry args={[0.025, 0.025, 1.8, 8]} />
                <meshStandardMaterial color={METAL} metalness={0.5} />
            </mesh>
            <mesh position={[0, 1.82, 0]} castShadow>
                <boxGeometry args={[0.5, 0.04, 0.04]} />
                <meshStandardMaterial color={METAL} />
            </mesh>
        </group>
    );
}

export function MedCart({ position }: { position: Vec3 }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.0, 1.0, 0.7]} />
                <meshStandardMaterial color="#475569" roughness={0.65} />
            </mesh>
            {[0.3, 0.55, 0.8].map((y) => (
                <mesh key={y} position={[0, y, 0.36]}>
                    <boxGeometry args={[0.86, 0.04, 0.02]} />
                    <meshStandardMaterial color="#64748b" />
                </mesh>
            ))}
            {[-0.4, 0.4].map((x) => (
                <mesh key={x} position={[x, 0.05, 0]}>
                    <cylinderGeometry args={[0.07, 0.07, 0.1, 8]} />
                    <meshStandardMaterial color={DARK} />
                </mesh>
            ))}
        </group>
    );
}

export function Vials({ position }: { position: Vec3 }) {
    return (
        <group position={position}>
            {[
                [-0.12, 0, 0],
                [0.02, 0, 0.08],
                [0.14, 0, -0.04],
            ].map((offset) => (
                <mesh
                    key={offset.join(",")}
                    position={offset as Vec3}
                    castShadow
                >
                    <cylinderGeometry args={[0.035, 0.035, 0.14, 8]} />
                    <meshStandardMaterial
                        color="#f8fafc"
                        transparent
                        opacity={0.85}
                    />
                </mesh>
            ))}
        </group>
    );
}

export function WarningTag({ good }: { good: boolean }) {
    return (
        <mesh position={[0.16, 0.16, 0.02]} rotation={[0, 0, 0.3]}>
            <boxGeometry args={[0.14, 0.1, 0.02]} />
            <meshStandardMaterial color={good ? "#34d399" : "#fb7185"} />
        </mesh>
    );
}

export function Fridge({ position }: { position: Vec3 }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.0, 1.6, 0.8]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
            </mesh>
            <mesh position={[-0.51, 0.8, 0]}>
                <boxGeometry args={[0.03, 1.5, 0.7]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <mesh position={[-0.53, 1.35, 0.15]}>
                <boxGeometry args={[0.02, 0.12, 0.3]} />
                <meshStandardMaterial color="#64748b" />
            </mesh>
        </group>
    );
}

export function FridgeLight({ good }: { good: boolean }) {
    return (
        <mesh position={[-0.54, 1.15, -0.15]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial
                color={good ? "#34d399" : "#fb7185"}
                emissive={good ? "#34d399" : "#fb7185"}
                emissiveIntensity={1.4}
            />
        </mesh>
    );
}

export function Cabinet({ position, open }: { position: Vec3; open: boolean }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.9, 1.7, 0.7]} />
                <meshStandardMaterial color="#334155" roughness={0.6} />
            </mesh>
            <Door
                open={open}
                hinge={[-0.44, 0, 0.35]}
                width={0.88}
                height={1.6}
                color="#475569"
            >
                <mesh position={[0.44, 0.8, 0.04]}>
                    <boxGeometry args={[0.07, 0.18, 0.04]} />
                    <meshStandardMaterial color="#fbbf24" />
                </mesh>
            </Door>
            <mesh position={[0.5, 0.9, 0.1]}>
                <boxGeometry args={[0.06, 0.14, 0.06]} />
                <meshStandardMaterial color={open ? "#fbbf24" : "#94a3b8"} />
            </mesh>
        </group>
    );
}

export function Sink({ position }: { position: Vec3 }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.0, 0.9, 0.62]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.7, 0]}>
                <boxGeometry args={[0.7, 0.1, 0.4]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <mesh position={[0, 0.85, -0.12]} castShadow>
                <cylinderGeometry args={[0.035, 0.035, 0.3, 8]} />
                <meshStandardMaterial color={METAL} metalness={0.5} />
            </mesh>
        </group>
    );
}

export function Puddle({ fixed }: { fixed: boolean }) {
    if (fixed) {
        return (
            <group position={[0.5, 0, 0]}>
                <mesh position={[0, 0.22, 0]} castShadow>
                    <coneGeometry args={[0.18, 0.4, 4]} />
                    <meshStandardMaterial color="#fbbf24" />
                </mesh>
                <mesh position={[0, 0.44, 0]}>
                    <boxGeometry args={[0.22, 0.12, 0.02]} />
                    <meshStandardMaterial color="#f8fafc" />
                </mesh>
            </group>
        );
    }
    return (
        <mesh position={[0.5, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.48, 24]} />
            <meshStandardMaterial
                color="#38bdf8"
                transparent
                opacity={0.55}
                roughness={0.1}
            />
        </mesh>
    );
}

export function FireDoor({
    position,
    blocked,
}: {
    position: Vec3;
    blocked: boolean;
}) {
    return (
        <group position={position}>
            <mesh position={[0, 1.15, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.5, 2.3, 0.12]} />
                <meshStandardMaterial color="#475569" roughness={0.7} />
            </mesh>
            <Door
                open={blocked}
                hinge={[-0.7, 0, 0.08]}
                width={1.4}
                height={2.2}
                color="#64748b"
            >
                <mesh position={[0.7, 1.1, 0.06]}>
                    <boxGeometry args={[0.5, 0.16, 0.04]} />
                    <meshStandardMaterial color="#f8fafc" />
                </mesh>
            </Door>
            {blocked && (
                <>
                    <mesh position={[-0.2, 0.3, 0.55]} castShadow>
                        <boxGeometry args={[0.5, 0.6, 0.5]} />
                        <meshStandardMaterial color="#a16207" />
                    </mesh>
                    <mesh position={[0.55, 0.26, 0.5]} castShadow>
                        <boxGeometry args={[0.55, 0.52, 0.45]} />
                        <meshStandardMaterial color="#a16207" />
                    </mesh>
                </>
            )}
        </group>
    );
}

export function Extinguisher({
    position,
    good,
}: {
    position: Vec3;
    good: boolean;
}) {
    return (
        <group position={position}>
            <mesh position={[0, 0.35, 0]} castShadow>
                <cylinderGeometry args={[0.13, 0.15, 0.7, 12]} />
                <meshStandardMaterial color="#ef4444" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.74, 0]} castShadow>
                <boxGeometry args={[0.16, 0.12, 0.12]} />
                <meshStandardMaterial color={DARK} />
            </mesh>
            <mesh position={[0, 0.48, 0.16]}>
                <boxGeometry args={[0.12, 0.1, 0.02]} />
                <meshStandardMaterial color={good ? "#34d399" : "#fb7185"} />
            </mesh>
            {!good && (
                <mesh position={[0.45, 0.3, 0]} castShadow>
                    <boxGeometry args={[0.45, 0.6, 0.45]} />
                    <meshStandardMaterial color="#64748b" />
                </mesh>
            )}
        </group>
    );
}

export function CrashCart({
    position,
    open,
}: {
    position: Vec3;
    open: boolean;
}) {
    return (
        <group position={position}>
            <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.8, 1.1, 0.6]} />
                <meshStandardMaterial color="#475569" roughness={0.6} />
            </mesh>
            <MovingGroup from={[0, 0.85, 0]} to={[0, 0.85, open ? 0.32 : 0]}>
                <mesh castShadow>
                    <boxGeometry args={[0.7, 0.24, 0.5]} />
                    <meshStandardMaterial color="#64748b" />
                </mesh>
            </MovingGroup>
            <mesh position={[0, 1.18, 0]} castShadow>
                <boxGeometry args={[0.5, 0.16, 0.35]} />
                <meshStandardMaterial color="#0f172a" />
            </mesh>
        </group>
    );
}

export function Phone({ position, good }: { position: Vec3; good: boolean }) {
    return (
        <group position={position}>
            <mesh castShadow>
                <boxGeometry args={[0.32, 0.1, 0.22]} />
                <meshStandardMaterial color="#1e293b" />
            </mesh>
            <mesh position={[0, 0.1, 0]} castShadow>
                <boxGeometry args={[0.34, 0.06, 0.1]} />
                <meshStandardMaterial color="#334155" />
            </mesh>
            <mesh position={[0.18, 0.07, 0]}>
                <sphereGeometry args={[0.035, 10, 10]} />
                <meshStandardMaterial
                    color={good ? "#34d399" : "#fb7185"}
                    emissive={good ? "#34d399" : "#fb7185"}
                    emissiveIntensity={1.4}
                />
            </mesh>
            <mesh position={[-0.35, 0.01, 0]} rotation={[0, 0.2, 0]}>
                <boxGeometry args={[0.3, 0.02, 0.22]} />
                <meshStandardMaterial color="#f8fafc" />
            </mesh>
        </group>
    );
}

export function HandSan({ position, good }: { position: Vec3; good: boolean }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.35, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.07, 0.7, 8]} />
                <meshStandardMaterial color={METAL} />
            </mesh>
            <mesh position={[0, 0.78, 0]} castShadow>
                <boxGeometry args={[0.24, 0.34, 0.18]} />
                <meshStandardMaterial
                    color={good ? "#38bdf8" : "#64748b"}
                    transparent
                    opacity={0.85}
                />
            </mesh>
            <mesh position={[0.16, 0.82, 0]}>
                <sphereGeometry args={[0.03, 8, 8]} />
                <meshStandardMaterial
                    color={good ? "#34d399" : "#fb7185"}
                    emissive={good ? "#34d399" : "#fb7185"}
                    emissiveIntensity={1.2}
                />
            </mesh>
        </group>
    );
}

export function Shoes({ position, fixed }: { position: Vec3; fixed: boolean }) {
    const scale = fixed ? 1 : 1.35;
    return (
        <group position={position}>
            {[
                [-0.14, 0, 0],
                [0.14, 0, 0.06],
            ].map((offset, index) => (
                <mesh
                    key={index}
                    position={offset as Vec3}
                    rotation={[0, fixed ? 0 : index === 0 ? 0.3 : -0.2, 0]}
                    scale={[scale, 1, scale]}
                    castShadow
                >
                    <boxGeometry args={[0.2, 0.08, 0.38]} />
                    <meshStandardMaterial
                        color={fixed ? "#38bdf8" : "#f59e0b"}
                    />
                </mesh>
            ))}
        </group>
    );
}

export function Wristband({
    position,
    fixed,
}: {
    position: Vec3;
    fixed: boolean;
}) {
    return (
        <mesh position={position} rotation={[0, 0, Math.PI / 2]} castShadow>
            <torusGeometry args={[0.09, 0.03, 8, 16]} />
            <meshStandardMaterial color={fixed ? "#f8fafc" : "#fb7185"} />
        </mesh>
    );
}

export function Oxygen({
    position,
    fixed,
}: {
    position: Vec3;
    fixed: boolean;
}) {
    return (
        <group position={position}>
            <mesh position={[0, 0.6, 0]} castShadow>
                <cylinderGeometry args={[0.18, 0.2, 1.1, 12]} />
                <meshStandardMaterial color="#38bdf8" metalness={0.3} />
            </mesh>
            <mesh position={[0, 1.2, 0]} castShadow>
                <boxGeometry args={[0.16, 0.14, 0.16]} />
                <meshStandardMaterial color={METAL} />
            </mesh>
            <MovingGroup from={[0.7, 0.3, 0]} to={[0.7, 0.3, fixed ? 1.1 : 0]}>
                <mesh castShadow>
                    <boxGeometry args={[0.45, 0.55, 0.35]} />
                    <meshStandardMaterial color="#ef4444" />
                </mesh>
                <mesh position={[0, 0.32, 0]}>
                    <boxGeometry args={[0.3, 0.06, 0.3]} />
                    <meshStandardMaterial color="#f8fafc" />
                </mesh>
            </MovingGroup>
        </group>
    );
}

export function PCA({ position, fixed }: { position: Vec3; fixed: boolean }) {
    return (
        <group position={position}>
            <mesh castShadow>
                <boxGeometry args={[0.34, 0.24, 0.2]} />
                <meshStandardMaterial color="#334155" />
            </mesh>
            <mesh position={[0, 0.05, 0.11]}>
                <boxGeometry args={[0.18, 0.08, 0.02]} />
                <meshStandardMaterial color="#38bdf8" />
            </mesh>
            <mesh position={[0.2, -0.15, 0]} rotation={[0, 0, -0.4]}>
                <cylinderGeometry args={[0.018, 0.018, 0.36, 6]} />
                <meshStandardMaterial color="#f8fafc" />
            </mesh>
            {!fixed && (
                <mesh position={[0.2, -0.42, 0]}>
                    <cylinderGeometry args={[0.018, 0.018, 0.2, 6]} />
                    <meshStandardMaterial
                        color="#f8fafc"
                        transparent
                        opacity={0.5}
                    />
                </mesh>
            )}
            {fixed && (
                <mesh position={[0.2, -0.42, 0]}>
                    <cylinderGeometry args={[0.018, 0.018, 0.2, 6]} />
                    <meshStandardMaterial color="#f8fafc" />
                </mesh>
            )}
        </group>
    );
}

export function BloodBag({
    position,
    fixed,
}: {
    position: Vec3;
    fixed: boolean;
}) {
    if (fixed) {
        return (
            <group position={[position[0], 0.08, position[2]]}>
                <mesh castShadow>
                    <boxGeometry args={[0.26, 0.22, 0.16]} />
                    <meshStandardMaterial color="#fbbf24" />
                </mesh>
                <mesh position={[0, 0.15, 0]}>
                    <boxGeometry args={[0.2, 0.04, 0.12]} />
                    <meshStandardMaterial color="#f8fafc" />
                </mesh>
            </group>
        );
    }
    return (
        <group position={position}>
            <mesh position={[0, -0.3, 0]} castShadow>
                <boxGeometry args={[0.22, 0.3, 0.12]} />
                <meshStandardMaterial color="#be123c" roughness={0.5} />
            </mesh>
            <mesh position={[0, -0.1, 0]}>
                <cylinderGeometry args={[0.012, 0.012, 0.2, 6]} />
                <meshStandardMaterial color="#f8fafc" />
            </mesh>
        </group>
    );
}

export function NurseStation({ position }: { position: Vec3 }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
                <boxGeometry args={[2.4, 0.9, 1.2]} />
                <meshStandardMaterial color="#1e293b" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.92, 0]} castShadow>
                <boxGeometry args={[2.5, 0.06, 1.3]} />
                <meshStandardMaterial color="#475569" />
            </mesh>
            <mesh position={[-0.6, 1.18, -0.2]} castShadow>
                <boxGeometry args={[0.5, 0.35, 0.06]} />
                <meshStandardMaterial color="#0f172a" />
            </mesh>
            <mesh position={[-0.6, 1.18, -0.16]}>
                <boxGeometry args={[0.42, 0.26, 0.02]} />
                <meshStandardMaterial
                    color="#38bdf8"
                    emissive="#0ea5e9"
                    emissiveIntensity={0.5}
                />
            </mesh>
        </group>
    );
}

export function Wheelchair({ position }: { position: Vec3 }) {
    return (
        <group position={position} rotation={[0, -0.4, 0]}>
            <mesh position={[0, 0.45, 0]} castShadow>
                <boxGeometry args={[0.5, 0.08, 0.45]} />
                <meshStandardMaterial color="#475569" />
            </mesh>
            <mesh position={[0, 0.75, -0.2]} castShadow>
                <boxGeometry args={[0.5, 0.5, 0.06]} />
                <meshStandardMaterial color="#475569" />
            </mesh>
            {[-0.28, 0.28].map((x) => (
                <mesh
                    key={x}
                    position={[x, 0.28, 0]}
                    rotation={[Math.PI / 2, 0, 0]}
                >
                    <cylinderGeometry args={[0.22, 0.22, 0.05, 16]} />
                    <meshStandardMaterial color={DARK} />
                </mesh>
            ))}
        </group>
    );
}
