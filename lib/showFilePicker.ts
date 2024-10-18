/**
 * Prompts the user to select one or more files of a specified type.
 * @param {string} type - The accepted file type, as a MIME type or file extension.
 * @returns {Promise<File>} A Promise that resolves with the selected files.
 */
export default function showFilePicker(type: string): Promise<File> {
	return new Promise((resolve, reject) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = type;
		input.multiple = false;
		input.oncancel = () => {
			reject(
				new Error(
					"You closed the file picker dialog without selecting a file.",
				),
			);
		};
		input.onchange = () => {
			// @ts-ignore
			const files = Array.from(input.files);
			if (files.length > 0) {
				resolve(files[0]);
			} else {
				reject(new Error("No files selected"));
			}
			input.remove();
		};
		input.click();
	});
}
