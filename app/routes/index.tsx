import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import Logo from "./logo512.png";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<section className="h-full p-4 flex flex-col">
			<h1 className="text-center text-3xl font-semibold">秘密基地</h1>
			<img
				className="mx-auto flex size-80"
				src={Logo}
				title="logo"
				alt="logo"
			/>
			<p className="text-center">
				这是一个任何人都可以访问的页面, 无需登入就可以访问哦
			</p>
			<div className="flex-1 mt-4 flex justify-center items-center">
				<Button className="h-12" color="primary" size="lg" asChild>
					<Link to="/home">进入秘密基地</Link>
				</Button>
			</div>
		</section>
	);
}
