import { toast } from "sonner";
type PromiseT<Data = any> = Promise<Data> | (() => Promise<Data>);
type PromiseTResult<Data = any> =
	| string
	| React.ReactNode
	| ((
			data: Data,
	  ) => React.ReactNode | string | Promise<React.ReactNode | string>);
type PromiseData<ToastData = any> = {
	loading?: string | React.ReactNode;
	success?: PromiseTResult<ToastData>;
	error?: PromiseTResult;
	description?: PromiseTResult;
	finally?: () => void | Promise<void>;
};

export function toastPromise<Data>(
	promise: PromiseT<Data>,
	data: PromiseData<Data>,
): Promise<Data> {
	return new Promise((resolve, reject) => {
		toast.promise(promise, {
			description: data.description,
			loading: data?.loading,
			success: (payload) => {
				resolve(payload);
				if (typeof data.success === "function") {
					return data.success(payload);
				}
				return data.success;
			},
			error: (err) => {
				reject(err);
				if (typeof data.error === "function") {
					return data.error(err);
				}

				return data.error;
			},
			finally: data.finally,
		});
	});
}
