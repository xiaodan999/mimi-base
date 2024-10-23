import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import useLongPress from "@/hooks/useLongPress";
import { useAuth } from "@/lib/auth";
import compressImage from "@/lib/compressImage";
import showFilePicker from "@/lib/showFilePicker";
import supabase from "@/lib/supabase-client";
import { toastPromise } from "@/lib/toast-promise";
import { createFileRoute } from "@tanstack/react-router";
import { Carrot, Ham } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_protected/_main/home")({
	component: Page,
});

function Page() {
	const { user, refresh } = useAuth();
	const [visible, setVisible] = useState(false);
	const bind = useLongPress(() => {
		setVisible(true);
	}, 500);
	return (
		<div>
			<h1 className="text-4xl font-semibold text-center">
				秘密保存基地 <i>V6.3</i>
			</h1>
			<p className="text-2xl mt-2">
				欢迎{" "}
				<span className="italic text-orange-400 text-3xl font-semibold">
					{user.user_name}
				</span>{" "}
				🎉✨🎉✨
			</p>

			<div className="flex justify-center">
				<div {...bind}>
					<TouXiang
						size={100}
						touXiangUrl={user.tou_xiang}
						circleUrl={user.circle}
					/>
				</div>
			</div>

			<div className="w-[80%] mx-auto flex mt-2">
				<DinnerPicker />
			</div>

			<Drawer open={visible} onOpenChange={setVisible}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>请选择你要进行的操作</DrawerTitle>
					</DrawerHeader>
					<DrawerDescription>点击以下的选项</DrawerDescription>
					<DrawerFooter className="text-lg">
						<div className="divide-y divide-green-500 text-center">
							<div
								className="hover:bg-green-300 hover:cursor-pointer h-14 flex justify-center items-center"
								onClick={async () => {
									setVisible(false);
									// 1. 让用户选择图片
									const originalFile = await toastPromise(
										showFilePicker("image/*"),
										{
											loading: "获取图片中...",
											success: "成功获取图片",
											error: "获取图片失败",
										},
									);

									const file = await toastPromise(
										compressImage(originalFile, {
											quality: 0.7,
										}),
										{
											loading: "压缩图片中...",
											success: "压缩图片完成",
											error: "压缩图片失败",
										},
									);
									// 2. 将此图片上传至supabase storage, `tou-xiang` 并且获取图像的URL
									const path = `${user.id}/${Date.now()}.webp`;

									const { path: imgRemotePath } = await toastPromise(
										supabase.storage
											.from("tou-xiang")
											.upload(path, file, { cacheControl: "31536000" })
											.then(({ error, data }) => {
												if (error) throw error;
												return data;
											}),
										{
											loading: "上传图片中...",
											success: "上传图片成功",
											error: (e) => `上传图片失败. ${e}`,
										},
									);

									const url = supabase.storage
										.from("tou-xiang")
										.getPublicUrl(imgRemotePath).data.publicUrl;

									// 3. 将`users`表格的`tou_xiang`修改为上一步的URL

									await toastPromise(
										// @ts-ignore
										supabase
											.from("users")
											.update({ tou_xiang: url })
											.eq("id", user.id)
											.then(({ data, error }) => {
												if (error) throw error;
												return data;
											}),
										{
											loading: "修改头像中...",
											success: () => {
												refresh();
												return "修改头像成功";
											},
											error: "修改头像失败",
										},
									);
								}}
							>
								修改头像
							</div>
							<div className="hover:bg-green-300 hover:cursor-pointer h-14 flex justify-center items-center">
								修改头像框
							</div>
						</div>
						<DrawerClose asChild>
							<div className="hover:bg-green-300 hover:cursor-pointer h-14 flex justify-center items-center">
								取消
							</div>
						</DrawerClose>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		</div>
	);
}

const DINNER = [
	{ name: "螺蛳粉" },
	{ name: "塔斯丁" },
	{ name: "肯德基" },
	{ name: "酸菜鱼" },
	{ name: "方便面" },
	{ name: "煮饭" },
	{ name: "烤鸡腿" },
	{ name: "沙县小吃" },
	{ name: "面总管" },
	{ name: "烧烤" },
	{ name: "披萨" },
	{ name: "水果" },
	{ name: "蔬菜沙拉" },
	{ name: "喜姐烤串" },
	{ name: "徽派" },
	{ name: "奶茶" },
	{ name: "咖喱饭" },
	{ name: "兰州拉面" },
	{ name: "李记麻辣烫" },
	{ name: "杨国福麻辣烫" },
	{ name: "老北京火锅" },
	{ name: "酸辣粉" },
	{ name: "小龙虾" },
	{ name: "李记一绝臭豆腐" },
	{ name: "胖哥俩" },
	{ name: "瘦肉丸" },
	{ name: "泡泡酸辣粉" },
	{ name: "面包" },
];

const generateMealFn = () => {
	const index = Math.floor(Math.random() * DINNER.length);
	const dinnerName = DINNER[index].name;
	return dinnerName;
};

function DinnerPicker() {
	const { user } = useAuth();
	const [dinnerName, setDinnerName] = useState("");
	const [loading, setLoading] = useState(false);
	const [saveLoading, setSaveLoading] = useState(false);
	const [visible, setVisible] = useState(false);

	const handlePick = async () => {
		setLoading(true);
		const name = await generateMealFn();
		setDinnerName(name);
		setLoading(false);
	};

	const handleSave = async (dinner: string) => {
		setSaveLoading(true);
		await toastPromise(
			// @ts-ignore
			supabase
				.from("mmi")
				.insert([{ mimi: `[晚餐抽奖机]: ${dinner}`, author_id: user.id }])
				.then(({ error }) => {
					if (error) throw error;
				}),
			{
				loading: `正在记录晚餐 '${dinner}'...`,
				error: "保存晚餐失败",
				success: `已将 '${dinner}' 记录在案, 去吃吧.`,
				finally: () => {
					setVisible(false);
					setSaveLoading(false);
				},
			},
		);
	};

	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger asChild>
				<Button size="lg" className="flex-1 gap-1" onClick={handlePick}>
					<Ham />
					<span>抽取晚餐</span>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<span className="inline-block align-middle mr-1">晚餐吃</span>
						<span className="inline-block align-middle ">
							{loading ? <LoadingSpinner /> : `"${dinnerName}"`}
						</span>
					</DialogTitle>
				</DialogHeader>
				<DialogDescription>恭喜你抽取到了该晚餐!</DialogDescription>
				<DialogFooter>
					<Button
						type="submit"
						className="gap-1"
						disabled={loading || saveLoading}
						onClick={() => handleSave(dinnerName)}
					>
						<Carrot />
						<span>保存</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
