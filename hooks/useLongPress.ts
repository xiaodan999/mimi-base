import { useCallback, useEffect, useRef } from "react";

export default function useLongPress(callback: () => void, ms: number) {
	const callbackRef = useRef(callback ?? (() => {}));
	const pressTimer = useRef<number>(-1);

	useEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	useEffect(() => {
		return () => {
			clearTimeout(pressTimer.current);
		};
	}, []);

	const onPointerDown = useCallback(
		(e) => {
			pressTimer.current = setTimeout(() => {
				callbackRef.current();
			}, ms) as unknown as number;
		},
		[ms],
	);

	const onPointerUp = () => {
		clearTimeout(pressTimer.current);
	};

	return { onPointerDown, onPointerUp };
}
