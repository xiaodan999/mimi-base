import fs from "fs";
import pathLib from "path";
import { fileURLToPath } from "url";
import util from "util";
import { exec } from "child_process";

const APP_DIR = "./app";
const __filename = fileURLToPath(import.meta.url);
const __dirname = pathLib.dirname(__filename);

function simplifyPath(path) {
  return path.replace(/^\.\/app|\/\([^)]+\)/g, "") || "/";
}

function processLayout(folder, { onAddPage, onAddLayout }) {
  const dirents = fs.readdirSync(pathLib.join(__dirname, "..", folder), { withFileTypes: true });

  const hasLayout = dirents.findIndex((dirent) => dirent.name === "layout.jsx") !== -1;
  const hasPage = dirents.findIndex((dirent) => dirent.name === "page.jsx") !== -1;
  const hasLazy = dirents.findIndex((dirent) => dirent.name === "lazy") !== -1;
  const otherFolders = dirents.filter((dirent) => dirent.isDirectory());
  // if the folder contains a layout.jsx file
  // { element: layoutPath, children: [] }
  // children should contain the page.jsx in the same folder if exists
  // children should also contain other pages or layouts
  // if a sub directly contains layout.jsx, recursively run this process
  // if a sub directly only contains page.jsx, add it to the children
  if (hasLayout) {
    const children = [];
    const output = { element: `${folder}/layout.jsx`, children };
    onAddLayout(`${folder}/layout.jsx`);

    if (hasPage) {
      children.push({
        path: simplifyPath(folder),
        element: `${folder}/page.jsx`,
        lazy: hasLazy ? hasLazy : undefined,
      });
      onAddPage(`${folder}/page.jsx`);
    }
    otherFolders.forEach((dirent) => {
      children.push(processLayout(`${folder}/${dirent.name}`, { onAddPage, onAddLayout }));
    });
    return output;
  }
  if (hasPage) {
    onAddPage(`${folder}/page.jsx`);
    return {
      path: simplifyPath(folder),
      element: `${folder}/page.jsx`,
      lazy: hasLazy ? hasLazy : undefined,
    };
  }
}

function generateRoutesFile(routes, pages, layouts) {
  let imports = "";
  const map = {};
  let pageCounter = 1;
  pages.forEach((path) => {
    map[path] = `Page${pageCounter}`;
    pageCounter++;
  });

  let layoutCounter = 1;
  layouts.forEach((path) => {
    map[path] = `Layout${layoutCounter}`;
    layoutCounter++;
  });

  Object.entries(map).forEach(([key, value]) => {
    imports += `import ${value} from "${key}";\n`;
  });

  // process routes body string

  traverse(routes, (route) => {
    if (route.lazy) {
      route.lazy = `async () => ({Component: (await import('${route.element}')).default})`;
      route.element = undefined;
    } else {
      route.element = `<${map[route.element]} />`;
    }
  });
  let routesStr = JSON.stringify(routes, null, 2);
  // remove quotes around element and lazy
  routesStr = removeQuotes(routesStr);

  return `// auto-generated file
${imports}

const routes = ${routesStr}  

export default routes;
`;
}
const pages = [];
const layouts = [];
const routes = processLayout(APP_DIR, {
  onAddLayout: (layoutPath) => layouts.push(layoutPath),
  onAddPage: (pagePath) => pages.push(pagePath),
});

function traverse(routes, callback) {
  if (!routes) return;
  routes.forEach((route) => {
    callback(route);
    traverse(route.children, callback);
  });
}

function removeQuotes(routesString) {
  return routesString
    .replaceAll(/"element"\s*:\s*['"](.*)["']/g, '"element": $1')
    .replaceAll(/"lazy"\s*:\s*['"](.*)['"]/g, "lazy: $1");
}

const content = generateRoutesFile([routes], pages, layouts);
const outputPath = pathLib.join(__dirname, "..", "routes.jsx");
fs.writeFileSync(outputPath, content, { encoding: "utf-8" });

// prettify the output file
const execPromise = util.promisify(exec);

async function prettify() {
  const { stdout } = await execPromise(`npx prettier --write ${outputPath}`);
  console.log("stdout:", stdout);
}
prettify();
