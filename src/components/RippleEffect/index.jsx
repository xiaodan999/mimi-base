import { useRef } from "react";

import styles from "./index.module.css";

const RippleEffect = ({ children }) => {
  const containerRef = useRef(null);

  const createRipple = (event) => {
    const container = event.currentTarget;
    const ripple = document.createElement("span");
    ripple.className = styles.ripple;

    const diameter = Math.max(container.clientWidth, container.clientHeight);
    const radius = diameter / 2;

    const containerRect = container.getBoundingClientRect();
    ripple.style.width = ripple.style.height = `${diameter}px`;
    ripple.style.left = `${event.pageX - containerRect.left - radius}px`;
    ripple.style.top = `${event.pageY - containerRect.top - radius}px`;

    container.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);
  };

  return (
    <div className={styles.rippleContainer} ref={containerRef} onPointerDown={createRipple}>
      {children}
    </div>
  );
};

export default RippleEffect;
