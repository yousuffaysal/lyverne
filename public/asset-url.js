// Product and campaign images are stored with .png paths, but the build ships
// .webp and deletes the PNG. The Worker rewrites /assets/*.png on the way out,
// so this only needs to keep the browser from requesting a path the server
// would have to redirect.
export const assetUrl = path =>
  /^\/assets\/[a-z0-9-]+\.png$/i.test(path || '') ? path.replace(/\.png$/i, '.webp') : path;
