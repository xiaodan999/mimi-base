import { useEffect, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function useScrolling(refOrClassName: any) {
	const [isScrolling, setIsScrolling] = useState(false);

	useEffect(() => {
		// biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
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
				element?.removeEventListener("scroll", handleScroll);
			};
		}
	}, [refOrClassName]);

	return isScrolling;
}
