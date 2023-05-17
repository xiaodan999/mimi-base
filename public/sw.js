const VERSION = "v6.2.0";
console.log(VERSION);

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
