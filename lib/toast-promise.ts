import type { ReactNode } from "react";
import { toast } from "sonner";

type PromiseT<Data> = Promise<Data> | (() => Promise<Data>);

type PromiseTResult<Data = unknown> =
    | string
    | ReactNode
    | ((data: Data) => ReactNode | string | Promise<ReactNode | string>);

type PromiseData<Data, Error = unknown> = {
    loading?: string | ReactNode;
    success?: PromiseTResult<Data>;
    error?: PromiseTResult<Error>;
    description?: PromiseTResult<Data>;
    finally?: () => void | Promise<void>;
};

/**
 * Wrap a promise in a sonner toast and resolve/reject with the original value.
 * The success payload and the error are typed independently so callers can
 * read them without an `any` escape hatch.
 */
export function toastPromise<Data, Error = unknown>(
    promise: PromiseT<Data>,
    data: PromiseData<Data, Error>,
): Promise<Data> {
    return new Promise<Data>((resolve, reject) => {
        toast.promise(promise, {
            description: data.description,
            loading: data.loading,
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
                    return data.error(err as Error);
                }
                return data.error;
            },
            finally: data.finally,
        });
    });
}
