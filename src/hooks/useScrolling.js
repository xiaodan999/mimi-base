import { useState, useEffect } from "react";

export default function useScrolling(refOrClassName) {
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    let element;
    if (refOrClassName) {
      if (typeof refOrClassName === "string") {
        element = document.querySelector(`.${refOrClassName}`);
      } else {
        element = refOrClassName.current;
      }
    } else {
      element = document;
    }
    if (element) {
      const handleScroll = () => {
        setIsScrolling(true);
        clearTimeout(element.timer);
        element.timer = setTimeout(() => setIsScrolling(false), 100);
      };
      element.addEventListener("scroll", handleScroll);
      return () => {
        element && element.removeEventListener("scroll", handleScroll);
      };
    }
  }, [refOrClassName]);

  return isScrolling;
}
