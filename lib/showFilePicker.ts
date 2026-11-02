/**
 * Prompts the user to select one or more files of a specified type.
 * @param {string} type - The accepted file type, as a MIME type or file extension.
 * @param {boolean} multiple - Whether more than one file may be selected.
 * @returns {Promise<File[]>} A Promise that resolves with the selected files.
 */
function pickFiles(type: string, multiple: boolean): Promise<File[]> {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = type;
        input.multiple = multiple;
        input.oncancel = () => {
            reject(
                new Error(
                    "You closed the file picker dialog without selecting a file.",
                ),
            );
        };
        input.onchange = () => {
            if (!input.files) return reject(new Error("No files selected"));
            const files = Array.from(input.files);
            if (files.length > 0) {
                resolve(files);
            } else {
                reject(new Error("No files selected"));
            }
            input.remove();
        };
        input.click();
    });
}

/**
 * Prompts the user to select a single file.
 */
export default async function showFilePicker(type: string): Promise<File> {
    const [file] = await pickFiles(type, false);
    if (!file) throw new Error("No files selected");
    return file;
}

/**
 * Prompts the user to select one or more files.
 */
export function showFilesPicker(type: string): Promise<File[]> {
    return pickFiles(type, true);
}
