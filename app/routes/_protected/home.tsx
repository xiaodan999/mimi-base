import { useAuth } from "@/app/routes/_protected";
import TouXiang from "@/components/TouXiang";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import useLongPress from "@/hooks/useLongPress";
import compressImage from "@/lib/compressImage";
import showFilePicker from "@/lib/showFilePicker";
import supabase from "@/lib/supabase-client";
import { toastPromise } from "@/lib/toast-promise";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_protected/home")({
	component: Page,
});

function Page() {
	const { user } = useAuth();
	const router = useRouter();
	const [visible, setVisible] = useState(false);
	const bind = useLongPress(() => {
		setVisible(true);
	}, 500);
	return (
		<div>
			<h1 className="text-4xl font-semibold text-center">
				秘密保存基地 <i>V6.2</i>
			</h1>
			<p className="text-2xl mt-2">
				欢迎{" "}
				<span className="italic text-orange-400 text-3xl font-semibold">
					{user.user_name}
				</span>{" "}
				🎉✨🎉✨
			</p>

			<div style={{ display: "flex", justifyContent: "center" }}>
				<div {...bind}>
					<TouXiang
						size={100}
						touXiangUrl={user.tou_xiang}
						circleUrl={user.circle}
					/>
				</div>
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
												router.invalidate();
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
