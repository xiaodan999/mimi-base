import React, { useState, useRef, useEffect } from 'react';

const Popover = ({ className, children, content, delay = 300, scrolling = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pointerPosition, setPointerPosition] = useState(null);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);
  const pressTimer = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isOpen && pointerPosition && popoverRef.current) {
      popoverRef.current.style.top = `${pointerPosition.pageY}px`;
      popoverRef.current.style.left = `${pointerPosition.pageX}px`;
    }
  }, [isOpen, pointerPosition]);

  useEffect(() => {
    return () => {
      clearTimeout(pressTimer.current);
    };
  }, []);

  useEffect(() => {
    if (scrolling) clearTimeout(pressTimer.current);
  }, [scrolling]);

  const handleTriggerPress = (event) => {
    if (event.type === 'touchstart') {
      setPointerPosition({
        pageX: event.touches[0].pageX,
        pageY: event.touches[0].pageY,
      });
    } else if (event.type === 'mousedown') {
      setPointerPosition({
        pageX: event.pageX,
        pageY: event.pageY,
      });
    }
    pressTimer.current = setTimeout(() => {
      setIsOpen(true);
    }, delay);
  };

  const handleTriggerRelease = () => {
    clearTimeout(pressTimer.current);
  };

  return (
    <>
      {React.cloneElement(children, {
        ref: triggerRef,
        onMouseDown: handleTriggerPress,
        onMouseUp: handleTriggerRelease,
        onTouchStart: handleTriggerPress,
        onTouchEnd: handleTriggerRelease,
      })}
      {isOpen && (
        <div
          ref={popoverRef}
          style={{
            position: 'absolute',
            zIndex: '1',
            transform: 'translateX(-100%)',
          }}
        >
          {content}
        </div>
      )}
    </>
  );
};

export default Popover;
