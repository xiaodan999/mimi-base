/**
 * Prompts the user to select one or more files of a specified type.
 * @param {string} type - The accepted file type, as a MIME type or file extension.
 * @param {boolean} [multiple=false] - Whether to allow multiple file selection.
 * @returns {Promise<FileList|File>} A Promise that resolves with the selected files.
 */
export default function showFilePicker(type, multiple = false) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = type;
    input.multiple = multiple;
    input.onchange = () => {
      const files = Array.from(input.files);
      if (multiple) {
        resolve(files);
      } else {
        if (files.length > 0) {
          resolve(files[0]);
        } else {
          reject(new Error("No files selected"));
        }
      }
      input.remove();
    };
    input.click();
  });
}
