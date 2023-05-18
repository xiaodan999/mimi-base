import { useCallback, useEffect, useRef } from "react";

export default function useLongPress(callback, ms) {
  const callbackRef = useRef(callback ?? (() => {}));
  const pressTimer = useRef(null);

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
      }, ms);
    },
    [ms],
  );

  const onPointerUp = () => {
    clearTimeout(pressTimer.current);
  };

  return { onPointerDown, onPointerUp };
}
