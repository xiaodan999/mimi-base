const VERSION = "v6.0.1";
console.log(VERSION);

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
